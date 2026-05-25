import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverPinpointSession, finalizePinpointSession } from "../src/extension/state.js";
import { createAnnotationLayer } from "../src/extension/content-core.js";
import { ExtensionSessionMachine } from "../src/extension/state.js";

const FIXTURE_URL = "http://127.0.0.1:4173/browser-review-smoke.html";
const FIXTURE_TITLE = "Pinpoint Browser Smoke Fixture";
const SCREENSHOT_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

let registeredDom = false;
try {
  GlobalRegistrator.register({ url: FIXTURE_URL });
  registeredDom = true;
} catch {
  // Another test file may have already registered happy-dom globals.
}

function mouse(type: string, target: Element): boolean {
  return target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
}

async function loadFixturePage(): Promise<void> {
  document.title = FIXTURE_TITLE;
  document.body.innerHTML = await readFile(join(import.meta.dir, "fixture", "browser-review-smoke.html"), "utf8");
}

async function readCliStartup(proc: ReturnType<typeof Bun.spawn>) {
  const stderrReader = proc.stderr.getReader();
  const decoder = new TextDecoder();
  let stderr = "";
  let discoveryUrl = "";

  while (!discoveryUrl) {
    const chunk = await stderrReader.read();
    if (chunk.done) break;
    stderr += decoder.decode(chunk.value, { stream: true });
    discoveryUrl = stderr.match(/Discovery: (http:\/\/127\.0\.0\.1:\d+\/__pinpoint\/browser\/discovery)/)?.[1] ?? "";
  }

  const restOfStderr = (async () => {
    while (true) {
      const chunk = await stderrReader.read();
      if (chunk.done) break;
      stderr += decoder.decode(chunk.value, { stream: true });
    }
    stderr += decoder.decode();
    return stderr;
  })();

  return { discoveryUrl, restOfStderr };
}

describe("browser review end-to-end smoke", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  test("happy path connects from extension state, annotates the fixture, captures a screenshot, and returns CLI feedback", async () => {
    await loadFixturePage();
    const artifactRoot = await mkdtemp(join(tmpdir(), "pinpoint-browser-smoke-"));
    const cwd = join(import.meta.dir, "..");
    const proc = Bun.spawn(
      [process.execPath, "src/index.ts", "browser", "--timeout-ms", "5000", "--port", "0"],
      {
        cwd,
        env: {
          ...process.env,
          PINPOINT_BROWSER_ARTIFACT_ROOT: artifactRoot,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const { discoveryUrl, restOfStderr } = await readCliStartup(proc);
      expect(discoveryUrl).toContain("/__pinpoint/browser/discovery");

      const layer = createAnnotationLayer(document, window);
      const machine = new ExtensionSessionMachine(
        {
          discover: () => discoverPinpointSession(discoveryUrl),
          activate: async () => ({ tabId: 9, state: layer.install() }),
          deactivate: () => layer.cleanup(),
          getContentState: async () => layer.getState(),
          getPageMetadata: async () => ({ url: FIXTURE_URL, title: document.title }),
          updateComment: async (_tabId, id, comment) => layer.updateAnnotationComment(id, comment),
          captureScreenshot: async () => ({
            dataUrl: SCREENSHOT_DATA_URL,
            mimeType: "image/png",
            capturedAt: "2026-05-24T12:00:00.000Z",
          }),
          finalize: finalizePinpointSession,
          wait: async () => {},
        },
        { retryCount: 1, retryDelayMs: 0 },
      );

      await machine.start();
      expect(machine.getState().status).toBe("connected");

      const saveButton = document.querySelector("#smoke-save")!;
      mouse("mouseover", saveButton);
      const clickWasNotCanceled = mouse("click", saveButton);
      expect(clickWasNotCanceled).toBe(false);

      await machine.refreshAnnotations();
      const annotation = machine.getState().draft.annotations[0];
      expect(annotation.selector).toBe("#smoke-save");

      machine.setPageNote("Review the settings save flow.");
      await machine.updateAnnotationComment(annotation.id, "Make the save action more specific.");
      await machine.sendFeedback();

      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        restOfStderr,
        proc.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr).toContain("Open the Chrome extension and click Start.");
      expect(stdout).toContain("# Browser UI Feedback");
      expect(stdout).toContain(`**Page title:** ${FIXTURE_TITLE}`);
      expect(stdout).toContain(`**Page URL:** ${FIXTURE_URL}`);
      expect(stdout).toContain("Review the settings save flow.");
      expect(stdout).toContain("**Selector:** #smoke-save");
      expect(stdout).toContain("**Visible text:** Save changes");
      expect(stdout).toContain("**Comment:** Make the save action more specific.");

      const screenshotPath = stdout.match(/\*\*Screenshot:\*\* (.+visible-tab-screenshot\.png)/)?.[1];
      expect(screenshotPath).toStartWith(artifactRoot);
      expect(await readFile(screenshotPath!)).toEqual(Buffer.from("iVBORw0KGgo=", "base64"));
    } finally {
      proc.kill();
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  test("stop discards annotations, cleans up the fixture page, and does not finalize feedback", async () => {
    await loadFixturePage();
    const layer = createAnnotationLayer(document, window);
    const finalizeCalls: unknown[] = [];
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => ({
          id: "session-stop-smoke",
          mode: "browser",
          status: "waiting",
          token: "token-stop-smoke",
          baseUrl: "http://127.0.0.1:60051/__pinpoint/browser",
          endpoints: {
            connect: "/__pinpoint/browser/connect",
            heartbeat: "/__pinpoint/browser/heartbeat",
            finalize: "/__pinpoint/browser/finalize",
          },
        }),
        connect: async () => ({ ok: true }),
        activate: async () => ({ tabId: 10, state: layer.install() }),
        deactivate: () => layer.cleanup(),
        finalize: async (_session, payload) => {
          finalizeCalls.push(payload);
          return { ok: true };
        },
        getContentState: async () => layer.getState(),
        wait: async () => {},
      },
      { retryCount: 1, retryDelayMs: 0 },
    );

    await machine.start();
    const saveButton = document.querySelector("#smoke-save")!;
    mouse("click", saveButton);
    await machine.refreshAnnotations();
    machine.setPageNote("This draft should be discarded.");

    const stopped = machine.stop();
    let pageClickCount = 0;
    saveButton.addEventListener("click", () => {
      pageClickCount += 1;
    });
    const clickWasNotCanceled = mouse("click", saveButton);

    expect(stopped.status).toBe("idle");
    expect(stopped.draft).toEqual({ pageNote: "", annotations: [] });
    expect(finalizeCalls).toEqual([]);
    expect(layer.getState().installed).toBe(false);
    expect(document.querySelectorAll(".__pinpoint-browser-review-badge")).toHaveLength(0);
    expect(saveButton.classList.contains("__pinpoint-browser-review-selected")).toBe(false);
    expect(clickWasNotCanceled).toBe(true);
    expect(pageClickCount).toBe(1);
  });

  test("no-session path makes bounded Start attempts and exposes Retry state", async () => {
    let discoveries = 0;
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => {
          discoveries += 1;
          return null;
        },
        wait: async () => {},
      },
      { retryCount: 4, retryDelayMs: 0 },
    );

    await machine.start();
    const noSession = machine.getState();

    expect(discoveries).toBe(4);
    expect(noSession.status).toBe("no-session");
    expect(noSession.attemptsMade).toBe(4);
    expect(noSession.message).toContain("No Pinpoint session found");

    await machine.retry();
    expect(discoveries).toBe(8);
    expect(machine.getState().status).toBe("no-session");
  });
});

afterAll(() => {
  if (registeredDom) GlobalRegistrator.unregister();
});
