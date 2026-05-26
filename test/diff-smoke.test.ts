/**
 * Headless smoke test for src/diff.ts — the unified-diff parser and the HTML
 * page renderer that `pinpoint review` hands to the annotator.
 *
 * Verifies:
 *  - the parser pulls correct old/new line numbers, kinds, and stats
 *  - the rendered page carries the data attrs that let the receiving Claude
 *    session resolve each annotation back to file + line
 *  - the hard ceiling rejects oversized diffs
 */
import { test, expect } from "bun:test";
import { parseDiff, renderDiffPage, summarizeDiff, DiffTooLargeError, DIFF_THRESHOLDS } from "../src/diff.ts";

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
diff --git a/src/cli.ts b/src/cli.ts
index ccccccc..ddddddd 100644
--- a/src/cli.ts
+++ b/src/cli.ts
@@ -18,6 +18,8 @@ pinpoint browser …
   pinpoint browser …
+  pinpoint review                Annotate working-tree diff
+  pinpoint <file>                Shorthand for "annotate"
   pinpoint list …
`;

test("parser splits files, hunks, and lines with correct numbering", () => {
  const files = parseDiff(sample);
  expect(files).toHaveLength(2);

  const server = files[0]!;
  expect(server.newPath).toBe("src/server.ts");
  expect(server.added).toBe(2);
  expect(server.deleted).toBe(1);
  expect(server.hunks).toHaveLength(1);

  const lines = server.hunks[0]!.lines;
  // first context line at old=40 new=42
  expect(lines[0]?.kind).toBe("ctx");
  expect(lines[0]?.oldNum).toBe(40);
  expect(lines[0]?.newNum).toBe(42);
  // del at old=41, no new
  expect(lines[1]?.kind).toBe("del");
  expect(lines[1]?.oldNum).toBe(41);
  expect(lines[1]?.newNum).toBeNull();
  // add at new=43
  expect(lines[2]?.kind).toBe("add");
  expect(lines[2]?.newNum).toBe(43);
});

test("parser recognises new and deleted files", () => {
  const out = parseDiff(`diff --git a/foo.ts b/foo.ts
new file mode 100644
index 0000000..bbbbbbb
--- /dev/null
+++ b/foo.ts
@@ -0,0 +1,2 @@
+hello
+world
diff --git a/old.ts b/old.ts
deleted file mode 100644
index aaaaaaa..0000000
--- a/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-removed
`);
  expect(out[0]?.kind).toBe("added");
  expect(out[1]?.kind).toBe("deleted");
});

test("parser flags renames and binaries", () => {
  const renamed = parseDiff(`diff --git a/a.ts b/b.ts
similarity index 90%
rename from a.ts
rename to b.ts
`);
  expect(renamed[0]?.kind).toBe("renamed");
  expect(renamed[0]?.oldPath).toBe("a.ts");
  expect(renamed[0]?.newPath).toBe("b.ts");

  const binary = parseDiff(`diff --git a/img.png b/img.png
index aaaaaaa..bbbbbbb 100644
Binary files a/img.png and b/img.png differ
`);
  expect(binary[0]?.isBinary).toBe(true);
  expect(binary[0]?.kind).toBe("binary");
});

test("rendered page carries file/line metadata on every annotatable row", () => {
  const html = renderDiffPage(parseDiff(sample));
  // Each line has data attrs the brief preserves verbatim.
  expect(html).toContain('data-file="src/server.ts"');
  expect(html).toContain('data-new-line="43"');
  expect(html).toContain('data-old-line="41"');
  expect(html).toContain('data-kind="add"');
  expect(html).toContain('data-kind="del"');

  // Both views are emitted; CSS toggles which is visible.
  expect(html).toContain("hunk-split");
  expect(html).toContain("hunk-unified");

  // The page exposes a postMessage receiver — the outer review shell drives it.
  expect(html).toContain('"review:view"');
  expect(html).toContain('"review:jump"');

  // Every annotatable line carries a canonical key — same string on the split
  // and unified copies, so the parent can tag both views from one annotation.
  expect(html).toContain('data-line-key="L-0-a-x-43"');
  expect(html).toContain('data-line-key="L-0-d-41-x"');

  // Drag-to-range surface: the "+" button + an outgoing review:annotate message.
  expect(html).toContain("line-mark");
  expect(html).toContain('"review:annotate"');
});

test("escapes HTML in line content so the user's code can't break the page", () => {
  const html = renderDiffPage(
    parseDiff(`diff --git a/x.ts b/x.ts
index aaaaaaa..bbbbbbb 100644
--- a/x.ts
+++ b/x.ts
@@ -1,1 +1,1 @@
-const a = "<script>";
+const a = "</script>";
`)
  );
  // The literal source text must be escaped — no raw </script> in the body.
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&lt;/script&gt;");
});

test("summarizeDiff produces the meta the review shell needs", () => {
  const sum = summarizeDiff(parseDiff(sample));
  expect(sum.fileCount).toBe(2);
  expect(sum.added).toBe(4);
  expect(sum.deleted).toBe(1);
  expect(sum.files[0]?.path).toBe("src/server.ts");
  expect(sum.files[0]?.id).toMatch(/^F-0-/);
  expect(sum.files[1]?.path).toBe("src/cli.ts");
});

test("hard ceiling refuses oversized diffs", () => {
  const huge = generateHugeDiff(DIFF_THRESHOLDS.LINE_HARD_CEILING + 10);
  expect(() => renderDiffPage(parseDiff(huge))).toThrow(DiffTooLargeError);
});

function generateHugeDiff(addLines: number): string {
  const head = `diff --git a/big.ts b/big.ts
index aaaaaaa..bbbbbbb 100644
--- a/big.ts
+++ b/big.ts
@@ -1,1 +1,${addLines + 1} @@
 const start = 0;
`;
  const adds = Array.from({ length: addLines }, (_, i) => `+const x${i} = ${i};`).join("\n");
  return head + adds + "\n";
}
