/**
 * Mode adapters' brief formatters are now pure functions of (annotations) →
 * markdown. Before the mode seam refactor these were tested only through the
 * UI smoke test boot — now we can hit them directly.
 */
import { test, expect, beforeEach, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/" });

(window as unknown as { __PINPOINT__: unknown }).__PINPOINT__ = {
  filePath: "/tmp/pinpoint-review-XYZ/review.html",
  fileName: "review.html",
  targetUrl: "about:blank",
  apiBase: "/__pinpoint",
  kind: "review",
  meta: {
    branch: "feat/router",
    fileCount: 1,
    added: 3,
    deleted: 1,
    untrackedCount: 0,
    files: [{ id: "F-0-src-server-ts", path: "src/server.ts", added: 3, deleted: 1 }],
  },
};

const { ReviewMode } = await import("../src/ui/app/mode/review.ts");
const { FileMode } = await import("../src/ui/app/mode/file.ts");
const { state } = await import("../src/ui/app/state.ts");
import type { Annotation } from "../src/ui/app/types.ts";

function rangeAnnot(file: string, lines: Array<{ kind: "add" | "del" | "ctx"; oldLine: number | null; newLine: number | null; text: string }>, comment: string): Annotation {
  return {
    id: "a_" + Math.random().toString(36).slice(2, 7),
    selector: '[data-line-key="L-0-a-x-43"]',
    tag: "div",
    text: "preview",
    outerHTML: lines.map((l) => (l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ") + l.text).join("\n"),
    comment,
    createdAt: new Date().toISOString(),
    review: { file, lines, lineKeys: lines.map((_, i) => `K-${i}`) },
  };
}

beforeEach(() => {
  state.globalComment = "";
});

test("ReviewMode.buildBrief leads with the branch + stat header", () => {
  const brief = ReviewMode.buildBrief([]);
  expect(brief).toContain("# Code Review Feedback");
  expect(brief).toContain("**Branch:** `feat/router` · **1** file · **+3 −1**");
});

test("ReviewMode.buildBrief groups annotations by file and labels single-line adds", () => {
  const ann = rangeAnnot(
    "src/server.ts",
    [{ kind: "add", oldLine: null, newLine: 43, text: "  log('hi');" }],
    "use debug level",
  );
  const brief = ReviewMode.buildBrief([ann]);
  expect(brief).toContain("## src/server.ts");
  expect(brief).toContain("### #1 — L43 (new)");
  expect(brief).toContain("```");
  expect(brief).toContain("+  log('hi');");
  expect(brief).toContain("**Feedback:** use debug level");
});

test("ReviewMode.buildBrief renders multi-line ranges with the line span and a range tag", () => {
  const ann = rangeAnnot(
    "src/server.ts",
    [
      { kind: "add", oldLine: null, newLine: 43, text: "if (foo) {" },
      { kind: "add", oldLine: null, newLine: 44, text: "  log('hi');" },
      { kind: "add", oldLine: null, newLine: 45, text: "}" },
    ],
    "extract to helper",
  );
  const brief = ReviewMode.buildBrief([ann]);
  expect(brief).toContain("### #1 — L43–45 (new)");
  expect(brief).toContain("+if (foo) {");
  expect(brief).toContain("+  log('hi');");
  expect(brief).toContain("+}");
});

test("ReviewMode.buildBrief renders pure-deletion annotations under the old side", () => {
  const ann = rangeAnnot(
    "src/old.ts",
    [{ kind: "del", oldLine: 12, newLine: null, text: "removed = true;" }],
    "is this dead code?",
  );
  const brief = ReviewMode.buildBrief([ann]);
  expect(brief).toContain("### #1 — L12 (old)");
  expect(brief).toContain("-removed = true;");
});

test("ReviewMode.buildBrief surfaces the overall-note when set", () => {
  state.globalComment = "happy with the direction overall";
  const brief = ReviewMode.buildBrief([]);
  expect(brief).toContain("## Overall note");
  expect(brief).toContain("happy with the direction overall");
});

test("FileMode.buildBrief uses # UI Feedback with the file path in the header", () => {
  const fileAnn: Annotation = {
    id: "x",
    selector: "main > h1",
    tag: "h1",
    text: "Title",
    outerHTML: "<h1>Title</h1>",
    comment: "rename this",
    createdAt: new Date().toISOString(),
  };
  const brief = FileMode.buildBrief([fileAnn]);
  expect(brief).toContain("# UI Feedback");
  expect(brief).toContain("**File:** `/tmp/pinpoint-review-XYZ/review.html`");
  expect(brief).toContain("### #1 — `main > h1`");
  expect(brief).toContain("**Feedback:** rename this");
});

afterAll(() => {
  GlobalRegistrator.unregister();
});
