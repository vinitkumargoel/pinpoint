/**
 * Drag-to-range unit tests for the diff iframe runtime.
 *
 * Before Phase 1 of the architectural refactor, this logic lived as an IIFE
 * inside a template string in `src/diff.ts` — untyped, untested. Now it's
 * `src/diff-runtime/runtime.ts` with a public `wireDragToRange(doc, parent)`
 * entry. We boot it against a happy-dom document built from `renderDiffPage`
 * output and assert the exact selection invariants the user feedback in PR
 * iteration #4 nailed down (one-`+`-per-drag, same-side restriction, ascending
 * payload regardless of drag direction).
 */
import { test, expect, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { parseDiff, renderDiffPage } from "../src/diff.ts";
import { wireDragToRange, buildAnnotatePayload, type AnnotateMessage } from "../src/diff-runtime/runtime.ts";

GlobalRegistrator.register({ url: "http://localhost/" });

const sample = `diff --git a/src/server.ts b/src/server.ts
index aaaaaaa..bbbbbbb 100644
--- a/src/server.ts
+++ b/src/server.ts
@@ -40,7 +42,9 @@ function handle(req) {
   const url = new URL(req.url);
-  if (url.pathname === "/api") {
+  if (url.pathname.startsWith("/api/")) {
+    log("api hit", url.pathname);
     return handleApi(req);
   }
`;

function mountPage(): { posts: AnnotateMessage[]; cleanup: () => void } {
  const html = renderDiffPage(parseDiff(sample));
  // Pull the body fragment out — we don't need the embedded <script>, since
  // we're wiring the runtime ourselves with our own postMessage capture.
  const bodyHtml = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? "";
  document.body.innerHTML = bodyHtml.replace(/<script[\s\S]*?<\/script>/g, "");
  document.body.setAttribute("data-view", "split");
  const posts: AnnotateMessage[] = [];
  wireDragToRange(document, { postMessage: (m) => posts.push(m as AnnotateMessage) });
  return {
    posts,
    cleanup: () => {
      document.body.innerHTML = "";
    },
  };
}

function dispatch(el: Element, type: string): void {
  const evt = new MouseEvent(type, { bubbles: true, cancelable: true });
  el.dispatchEvent(evt);
}

test("mousedown on a line-mark adds .range-start to its line", () => {
  const { posts, cleanup } = mountPage();
  try {
    const addLine = document.querySelector<HTMLElement>('.hunk-split .line.add[data-new-line="43"]')!;
    expect(addLine).not.toBeNull();
    const mark = addLine.querySelector<HTMLElement>(".line-mark")!;
    expect(mark).not.toBeNull();
    dispatch(mark, "mousedown");
    expect(addLine.classList.contains("range-selecting")).toBe(true);
    expect(addLine.classList.contains("range-start")).toBe(true);
    // No annotation posted yet — only on mouseup.
    expect(posts).toHaveLength(0);
  } finally {
    cleanup();
  }
});

test("dragging across N lines tags all of them; only the start keeps range-start", () => {
  const { cleanup } = mountPage();
  try {
    const newLines = Array.from(
      document.querySelectorAll<HTMLElement>('.hunk-split .line.add[data-side="new"]'),
    );
    expect(newLines.length).toBeGreaterThanOrEqual(2);
    const a = newLines[0]!;
    const b = newLines[1]!;
    dispatch(a.querySelector(".line-mark")!, "mousedown");
    dispatch(b, "mouseover");
    expect(a.classList.contains("range-selecting")).toBe(true);
    expect(b.classList.contains("range-selecting")).toBe(true);
    expect(a.classList.contains("range-start")).toBe(true);
    expect(b.classList.contains("range-start")).toBe(false);
  } finally {
    cleanup();
  }
});

test("mouseup posts review:annotate with line keys in document order", () => {
  const { posts, cleanup } = mountPage();
  try {
    const newLines = Array.from(
      document.querySelectorAll<HTMLElement>('.hunk-split .line.add[data-side="new"]'),
    );
    const a = newLines[0]!;
    const b = newLines[1]!;
    dispatch(a.querySelector(".line-mark")!, "mousedown");
    dispatch(b, "mouseover");
    dispatch(document.body, "mouseup");
    expect(posts).toHaveLength(1);
    const msg = posts[0]!;
    expect(msg.type).toBe("review:annotate");
    expect(msg.payload.file).toBe("src/server.ts");
    expect(msg.payload.lineKeys).toEqual([a.dataset.lineKey!, b.dataset.lineKey!]);
    expect(msg.payload.lines).toHaveLength(2);
    expect(msg.payload.lines[0]!.kind).toBe("add");
  } finally {
    cleanup();
  }
});

test("dragging into a different side does not extend the range", () => {
  const { cleanup } = mountPage();
  try {
    const newAdd = document.querySelector<HTMLElement>('.hunk-split .line.add[data-side="new"]')!;
    const oldDel = document.querySelector<HTMLElement>('.hunk-split .line.del[data-side="old"]')!;
    dispatch(newAdd.querySelector(".line-mark")!, "mousedown");
    dispatch(oldDel, "mouseover"); // wrong side — should be ignored
    expect(newAdd.classList.contains("range-selecting")).toBe(true);
    expect(oldDel.classList.contains("range-selecting")).toBe(false);
  } finally {
    cleanup();
  }
});

test("buildAnnotatePayload sorts lines into ascending document order even if drag was upward", () => {
  const { cleanup } = mountPage();
  try {
    const lines = Array.from(
      document.querySelectorAll<HTMLElement>('.hunk-split .line.add[data-side="new"]'),
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // Pass lines reversed; payload should normalize back to doc order.
    const reversed = lines.slice(0, 2).reverse();
    const payload = buildAnnotatePayload(reversed[1]!, reversed);
    expect(payload.lineKeys[0]).toBe(lines[0]!.dataset.lineKey);
    expect(payload.lineKeys[1]).toBe(lines[1]!.dataset.lineKey);
  } finally {
    cleanup();
  }
});

afterAll(() => {
  GlobalRegistrator.unregister();
});
