import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BROWSER_DISCOVERY_HOST,
  formatBrowserFeedbackBrief,
  startBrowserDiscoveryServer,
  startBrowserSessionServer,
} from "../src/browser-session.ts";

async function postJson(url: string, body: unknown, token?: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: token
      ? { "content-type": "application/json", authorization: `Bearer ${token}` }
      : { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function tempArtifactRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "pinpoint-browser-artifacts-"));
}

describe("browser session server", () => {
  test("discovery reports no active browser session", async () => {
    const discovery = startBrowserDiscoveryServer({ port: 0 });
    try {
      const res = await fetch(discovery.discoveryUrl);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, active: false });
    } finally {
      discovery.server.stop(true);
    }
  });

  test("reports a waiting browser session", async () => {
    const session = startBrowserSessionServer({ timeoutMs: 1000, port: 0 });
    try {
      const res = await fetch(session.baseUrl);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { mode: string; status: string; token: string; finalizePath: string };
      expect(body.mode).toBe("browser");
      expect(body.status).toBe("waiting");
      expect(body.token).toBe(session.token);
      expect(body.finalizePath).toBe("/__pinpoint/browser/finalize");
      expect(session.baseUrl.startsWith(`http://${BROWSER_DISCOVERY_HOST}:`)).toBe(true);
    } finally {
      session.server.stop(true);
    }
  });

  test("discovery reports active browser session metadata", async () => {
    const session = startBrowserSessionServer({ timeoutMs: 1000, port: 0 });
    try {
      const res = await fetch(session.discoveryUrl);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        active: boolean;
        session: {
          id: string;
          mode: string;
          status: string;
          token: string;
          baseUrl: string;
          endpoints: { connect: string; heartbeat: string; finalize: string };
        };
      };
      expect(body.active).toBe(true);
      expect(body.session.id).toBe(session.id);
      expect(body.session.mode).toBe("browser");
      expect(body.session.status).toBe("waiting");
      expect(body.session.token).toBe(session.token);
      expect(body.session.baseUrl).toBe(session.baseUrl);
      expect(body.session.endpoints).toEqual({
        connect: "/__pinpoint/browser/connect",
        heartbeat: "/__pinpoint/browser/heartbeat",
        finalize: "/__pinpoint/browser/finalize",
      });
    } finally {
      session.server.stop(true);
    }
  });

  test("connect and heartbeat require the session token", async () => {
    const session = startBrowserSessionServer({ timeoutMs: 1000, port: 0 });
    try {
      const missing = await postJson(session.connectUrl, {});
      expect(missing.status).toBe(401);

      const invalid = await postJson(session.heartbeatUrl, { token: "wrong" });
      expect(invalid.status).toBe(403);

      const connected = await postJson(session.connectUrl, {}, session.token);
      expect(connected.status).toBe(200);
      expect(await connected.json()).toEqual({
        ok: true,
        sessionId: session.id,
        status: "waiting",
      });

      const heartbeat = await postJson(session.heartbeatUrl, { token: session.token });
      expect(heartbeat.status).toBe(200);
    } finally {
      session.server.stop(true);
    }
  });

  test("resolves feedback submitted by a direct local request", async () => {
    const session = startBrowserSessionServer({ timeoutMs: 1000, port: 0 });
    try {
      const res = await postJson(session.finalizeUrl, {
        token: session.token,
        action: "feedback",
        brief: "Make the CTA clearer.",
      });
      expect(res.status).toBe(200);
      await expect(session.result).resolves.toEqual({
        action: "feedback",
        brief: "Make the CTA clearer.",
      });
    } finally {
      session.server.stop(true);
    }
  });

  test("resolves approval submitted by a direct local request", async () => {
    const session = startBrowserSessionServer({ timeoutMs: 1000, port: 0 });
    try {
      const res = await postJson(session.finalizeUrl, { action: "approve" }, session.token);
      expect(res.status).toBe(200);
      await expect(session.result).resolves.toEqual({ action: "approve" });
    } finally {
      session.server.stop(true);
    }
  });

  test("resolves cancellation submitted by a direct local request", async () => {
    const session = startBrowserSessionServer({ timeoutMs: 1000, port: 0 });
    try {
      const res = await postJson(session.finalizeUrl, { action: "cancel" }, session.token);
      expect(res.status).toBe(200);
      await expect(session.result).resolves.toEqual({ action: "cancel" });
    } finally {
      session.server.stop(true);
    }
  });

  test("persists browser feedback screenshot artifacts in a session-specific path", async () => {
    const artifactRoot = await tempArtifactRoot();
    const session = startBrowserSessionServer({ timeoutMs: 1000, port: 0, artifactRoot });
    const fixtureImage = "data:image/png;base64,iVBORw0KGgo=";
    try {
      const res = await postJson(
        session.finalizeUrl,
        {
          action: "feedback",
          page: {
            url: "https://example.test/profile",
            title: "Profile",
          },
          screenshot: {
            dataUrl: fixtureImage,
            mimeType: "image/png",
            capturedAt: "2026-05-24T12:00:00.000Z",
          },
          annotations: [],
        },
        session.token,
      );
      expect(res.status).toBe(200);

      const result = await session.result;
      expect(result.action).toBe("feedback");
      const artifactPath = result.feedback?.screenshot?.artifactPath;
      expect(result.feedback?.screenshot).toMatchObject({
        status: "saved",
        mimeType: "image/png",
        capturedAt: "2026-05-24T12:00:00.000Z",
      });
      expect(artifactPath).toBe(join(artifactRoot, session.id, "page-screenshot.png"));
      expect(await readFile(artifactPath!)).toEqual(Buffer.from("iVBORw0KGgo=", "base64"));
      expect(formatBrowserFeedbackBrief(result.feedback)).toContain(`**Screenshot:** ${artifactPath}`);
    } finally {
      session.server.stop(true);
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  test("keeps browser feedback when screenshot capture was unavailable", async () => {
    const artifactRoot = await tempArtifactRoot();
    const session = startBrowserSessionServer({ timeoutMs: 1000, port: 0, artifactRoot });
    try {
      const res = await postJson(
        session.finalizeUrl,
        {
          action: "feedback",
          page: {
            url: "https://example.test/settings",
            title: "Settings",
          },
          screenshot: {
            unavailable: true,
            error: "captureVisibleTab unavailable",
            capturedAt: "2026-05-24T12:00:00.000Z",
          },
          annotations: [{ selector: "#save", tag: "button", comment: "Still send this." }],
        },
        session.token,
      );
      expect(res.status).toBe(200);

      const result = await session.result;
      expect(result.feedback?.screenshot).toEqual({
        status: "unavailable",
        capturedAt: "2026-05-24T12:00:00.000Z",
        error: "captureVisibleTab unavailable",
      });
      const brief = formatBrowserFeedbackBrief(result.feedback);
      expect(brief).toContain("**Screenshot:** unavailable (captureVisibleTab unavailable)");
      expect(brief).toContain("**Comment:** Still send this.");
    } finally {
      session.server.stop(true);
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  test("approval does not create browser screenshot artifacts", async () => {
    const artifactRoot = await tempArtifactRoot();
    const session = startBrowserSessionServer({ timeoutMs: 1000, port: 0, artifactRoot });
    try {
      const res = await postJson(session.finalizeUrl, { action: "approve" }, session.token);
      expect(res.status).toBe(200);
      await expect(session.result).resolves.toEqual({ action: "approve" });
      expect(await readdir(artifactRoot)).toEqual([]);
    } finally {
      session.server.stop(true);
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  test("times out when no finalize request arrives", async () => {
    const session = startBrowserSessionServer({ timeoutMs: 10, port: 0 });
    try {
      await expect(session.result).resolves.toEqual({ action: "timeout" });
    } finally {
      session.server.stop(true);
    }
  });

  test("rejects missing and invalid finalize tokens without ending the session", async () => {
    const session = startBrowserSessionServer({ timeoutMs: 1000, port: 0 });
    try {
      const missing = await postJson(session.finalizeUrl, { action: "approve" });
      expect(missing.status).toBe(401);

      const invalid = await postJson(session.finalizeUrl, { token: "wrong", action: "approve" });
      expect(invalid.status).toBe(403);

      const valid = await postJson(session.finalizeUrl, { token: session.token, action: "approve" });
      expect(valid.status).toBe(200);
      await expect(session.result).resolves.toEqual({ action: "approve" });
    } finally {
      session.server.stop(true);
    }
  });

  test("rejects invalid finalize actions without ending the session", async () => {
    const session = startBrowserSessionServer({ timeoutMs: 1000, port: 0 });
    try {
      const bad = await postJson(session.finalizeUrl, { token: session.token, action: "launch" });
      expect(bad.status).toBe(400);
      const good = await postJson(session.finalizeUrl, { token: session.token, action: "approve" });
      expect(good.status).toBe(200);
      await expect(session.result).resolves.toEqual({ action: "approve" });
    } finally {
      session.server.stop(true);
    }
  });
});

describe("browser feedback brief", () => {
  test("wraps direct browser feedback in a browser-session brief", () => {
    expect(formatBrowserFeedbackBrief("Make the CTA clearer.")).toBe(
      [
        "# Browser UI Feedback",
        "",
        "**Source:** Browser session",
        "",
        "## Feedback",
        "",
        "Make the CTA clearer.",
      ].join("\n"),
    );
  });

  test("formats structured extension feedback with page metadata and annotations", () => {
    const brief = formatBrowserFeedbackBrief({
      page: {
        url: "https://example.test/settings",
        title: "Settings",
        note: "Review the save flow.",
      },
      annotations: [
        {
          selector: "#save",
          tag: "button",
          text: "Save changes",
          outerHTML: '<button id="save">Save changes</button>',
          comment: "Make this label more confident.",
        },
      ],
    });

    expect(brief).toContain("**Source:** Browser session");
    expect(brief).toContain("**Page title:** Settings");
    expect(brief).toContain("**Page URL:** https://example.test/settings");
    expect(brief).toContain("Review the save flow.");
    expect(brief).toContain("### 1. button");
    expect(brief).toContain("**Selector:** #save");
    expect(brief).toContain("**Tag:** button");
    expect(brief).toContain("**Visible text:** Save changes");
    expect(brief).toContain('**HTML context:** <button id="save">Save changes</button>');
    expect(brief).toContain("**Comment:** Make this label more confident.");
  });
});

describe("browser session CLI", () => {
  test("prints instructions to stderr and final feedback to stdout", async () => {
    const cwd = join(import.meta.dir, "..");
    const proc = Bun.spawn(
      [process.execPath, "src/index.ts", "browser-session", "--timeout-ms", "5000", "--port", "0"],
      {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stderrReader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    let stderr = "";
    let finalizeUrl = "";
    let token = "";

    while (!finalizeUrl || !token) {
      const chunk = await stderrReader.read();
      if (chunk.done) break;
      stderr += decoder.decode(chunk.value, { stream: true });
      finalizeUrl = stderr.match(/POST (http:\/\/127\.0\.0\.1:\d+\/__pinpoint\/browser\/finalize)/)?.[1] ?? "";
      token = stderr.match(/Token: ([A-Za-z0-9_-]+)/)?.[1] ?? "";
    }

    expect(finalizeUrl).toContain("/__pinpoint/browser/finalize");
    expect(token.length).toBeGreaterThan(20);
    const restOfStderr = (async () => {
      while (true) {
        const chunk = await stderrReader.read();
        if (chunk.done) break;
        stderr += decoder.decode(chunk.value, { stream: true });
      }
      stderr += decoder.decode();
      return stderr;
    })();

    const res = await postJson(
      finalizeUrl,
      {
        action: "feedback",
        brief: "Please tighten the hero spacing.",
      },
      token,
    );
    expect(res.status).toBe(200);

    const [stdout, fullStderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      restOfStderr,
      proc.exited,
    ]);

    expect(exitCode).toBe(0);
    expect(fullStderr).toContain("Open the Chrome extension and click Start.");
    expect(fullStderr).not.toContain("# Browser UI Feedback");
    expect(stdout).toContain("# Browser UI Feedback");
    expect(stdout).toContain("Please tighten the hero spacing.");
    expect(stdout).not.toContain("Open the Chrome extension");
  });

  test("prints a structured browser feedback brief from extension-shaped JSON", async () => {
    const cwd = join(import.meta.dir, "..");
    const proc = Bun.spawn(
      [process.execPath, "src/index.ts", "browser-session", "--timeout-ms", "5000", "--port", "0"],
      {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stderrReader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    let stderr = "";
    let finalizeUrl = "";
    let token = "";

    while (!finalizeUrl || !token) {
      const chunk = await stderrReader.read();
      if (chunk.done) break;
      stderr += decoder.decode(chunk.value, { stream: true });
      finalizeUrl = stderr.match(/POST (http:\/\/127\.0\.0\.1:\d+\/__pinpoint\/browser\/finalize)/)?.[1] ?? "";
      token = stderr.match(/Token: ([A-Za-z0-9_-]+)/)?.[1] ?? "";
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

    const res = await postJson(
      finalizeUrl,
      {
        action: "feedback",
        page: {
          url: "http://localhost:3000/dashboard",
          title: "Dashboard",
          note: "Tighten the header hierarchy.",
        },
        annotations: [
          {
            selector: "main > button.primary",
            tag: "button",
            text: "Launch",
            outerHTML: '<button class="primary">Launch</button>',
            comment: "This should say Start review.",
          },
        ],
      },
      token,
    );
    expect(res.status).toBe(200);

    const [stdout, fullStderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      restOfStderr,
      proc.exited,
    ]);

    expect(exitCode).toBe(0);
    expect(fullStderr).not.toContain("Tighten the header hierarchy.");
    expect(stdout).toContain("# Browser UI Feedback");
    expect(stdout).toContain("**Page title:** Dashboard");
    expect(stdout).toContain("**Page URL:** http://localhost:3000/dashboard");
    expect(stdout).toContain("Tighten the header hierarchy.");
    expect(stdout).toContain("**Selector:** main > button.primary");
    expect(stdout).toContain("**Comment:** This should say Start review.");
  });
});
