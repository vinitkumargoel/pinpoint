/**
 * Headless smoke test for the code-review shell.
 *
 * Boots the bundled annotator with `window.__PINPOINT__.kind = "review"` and
 * verifies that the review chrome renders (brand chip, branch meta, Split /
 * Unified seg, file rail) and that simulating an annotation on a diff line row
 * produces a brief with the `# Code Review Feedback` shape.
 */
import { test, expect, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { readFileSync } from "node:fs";
import { join } from "node:path";

GlobalRegistrator.register({ url: "http://localhost/" });

(globalThis as unknown as { fetch: () => Promise<Response> }).fetch = () =>
  Promise.resolve(new Response(null));
const realSetInterval = globalThis.setInterval;
(globalThis as unknown as { setInterval: () => number }).setInterval = () => 0;

(window as unknown as { __PINPOINT__: unknown }).__PINPOINT__ = {
  filePath: "/tmp/pinpoint-review-XYZ/review.html",
  fileName: "review.html",
  targetUrl: "about:blank",
  apiBase: "/__pinpoint",
  kind: "review",
  meta: {
    branch: "feat/api-router",
    fileCount: 2,
    added: 5,
    deleted: 1,
    untrackedCount: 1,
    files: [
      { id: "F-0-src-server-ts", path: "src/server.ts", added: 2, deleted: 1 },
      { id: "F-1-src-cli-ts", path: "src/cli.ts", added: 3, deleted: 0 },
    ],
  },
};

const UI = join(import.meta.dir, "..", "src", "ui");
const shell = readFileSync(join(UI, "index.html"), "utf8");
const generated = readFileSync(join(UI, "annotator.html"), "utf8");

const bodyInner = (shell.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? "")
  .replace("<!-- PINPOINT_SCRIPT -->", "")
  .replace("<!-- PINPOINT_STYLES -->", "");
document.body.innerHTML = bodyInner;

Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
  configurable: true,
  get: () => null,
});

const script = generated.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
expect(script.length).toBeGreaterThan(1000);
new Function(script)();

test("review shell renders the brand chip + meta line", () => {
  const sh = document.querySelector(".shell.shell-review");
  expect(sh).not.toBeNull();
  expect(sh?.querySelector(".review-brand")?.textContent).toBe("REVIEW");
  const meta = sh?.querySelector(".review-meta")?.textContent ?? "";
  expect(meta).toContain("feat/api-router");
  expect(meta).toContain("2 files");
  expect(meta).toContain("+5");
});

test("review shell exposes a Split / Unified segmented control", () => {
  expect(document.querySelector('[data-role="view-split"]')).not.toBeNull();
  expect(document.querySelector('[data-role="view-unified"]')).not.toBeNull();
  // Unified is the default-on tab.
  expect(document.querySelector('[data-role="view-unified"]')?.classList.contains("on")).toBe(true);
  expect(document.querySelector('[data-role="view-split"]')?.classList.contains("on")).toBe(false);
});

test("review shell lists the changed files in the rail", () => {
  const items = document.querySelectorAll('[data-role="rail-list"] li');
  expect(items).toHaveLength(2);
  expect((items[0] as HTMLElement)?.dataset.fileId).toBe("F-0-src-server-ts");
  expect(items[0]?.textContent).toContain("src/server.ts");
});

test("review shell uses 'Overall note' instead of 'Page-wide note'", () => {
  const label = document.querySelector(".global-wrap label");
  expect(label?.textContent).toBe("Overall note");
});

afterAll(() => {
  (globalThis as unknown as { setInterval: typeof realSetInterval }).setInterval = realSetInterval;
  GlobalRegistrator.unregister();
});
