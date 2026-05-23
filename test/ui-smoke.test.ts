/**
 * Headless smoke test for the bundled annotator UI.
 *
 * Boots the *generated* src/ui/annotator.html (built from index.html + app.css +
 * app/*.ts) inside happy-dom and checks the wiring survives bundling: the shell
 * builds, the theme applies, and chrome controls respond to clicks.
 *
 * Requires `bun run build:ui` first (the `test` script does this for you).
 */
import { test, expect, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { readFileSync } from "node:fs";
import { join } from "node:path";

GlobalRegistrator.register({ url: "http://localhost/" });

// Keep boot hermetic: no real heartbeat network calls, no live interval.
(globalThis as unknown as { fetch: () => Promise<Response> }).fetch = () =>
  Promise.resolve(new Response(null));
const realSetInterval = globalThis.setInterval;
(globalThis as unknown as { setInterval: () => number }).setInterval = () => 0;

(window as unknown as { __PINPOINT__: unknown }).__PINPOINT__ = {
  filePath: "/x/PLAN.html",
  fileName: "PLAN.html",
  targetUrl: "about:blank",
  apiBase: "/__pinpoint",
};

const UI = join(import.meta.dir, "..", "src", "ui");
const shell = readFileSync(join(UI, "index.html"), "utf8");
const generated = readFileSync(join(UI, "annotator.html"), "utf8");

// Static body markup (from the source shell, minus the placeholders).
const bodyInner = (shell.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? "")
  .replace("<!-- PINPOINT_SCRIPT -->", "")
  .replace("<!-- PINPOINT_STYLES -->", "");
document.body.innerHTML = bodyInner;

// happy-dom throws a broken error when querying an iframe's document (our
// selectors are valid; real browsers are fine). Null out contentDocument so the
// boot path skips the iframe and we test the chrome wiring on the parent page.
Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
  configurable: true,
  get: () => null,
});

// The bundled app script (the only real </script> closes it; escaped ones don't).
const script = generated.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
expect(script.length).toBeGreaterThan(1000);
new Function(script)();

test("boots into a shell with the brand and a zero count", () => {
  expect(document.querySelector(".shell")).not.toBeNull();
  expect(document.querySelector(".brand")?.textContent).toContain("Pinpoint");
  expect(document.querySelector('[data-role="counts"]')?.textContent).toContain("0 annotation");
  expect(document.body.dataset.theme).toBe("light");
});

test("names the tab after the file so concurrent reviews are distinguishable", () => {
  expect(document.title).toBe("PLAN.html — Pinpoint");
});

test("theme toggle flips light → dark", () => {
  (document.querySelector('[data-role="theme-toggle"]') as HTMLElement).click();
  expect(document.body.dataset.theme).toBe("dark");
});

test("Browse mode activates its segmented control", () => {
  (document.querySelector('[data-role="mode-browse"]') as HTMLElement).click();
  expect(document.querySelector('[data-role="mode-browse"]')?.classList.contains("on")).toBe(true);
  expect(document.querySelector('[data-role="mode-inspect"]')?.classList.contains("on")).toBe(false);
});

afterAll(() => {
  (globalThis as unknown as { setInterval: typeof realSetInterval }).setInterval = realSetInterval;
  GlobalRegistrator.unregister();
});
