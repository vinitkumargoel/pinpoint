/**
 * Parse `git diff` (unified) output into a structured tree, and render it as
 * an HTML page that the existing Pinpoint annotator can iframe.
 *
 * Each line carries `data-file`, `data-old-line`, `data-new-line`, `data-kind`,
 * and a `data-line-key` so the annotator can tag every view-copy (split-left /
 * split-right / unified) of a logical line from one annotation.
 *
 * The page's interactive behaviour (drag-to-range, view/jump/theme message
 * routing) lives in `src/diff-runtime/` — bundled by `scripts/build-ui.ts` and
 * text-imported below.
 */
import diffRuntimeJs from "./diff-runtime/runtime.bundle.js" with { type: "text" };
const DIFF_RUNTIME = diffRuntimeJs as unknown as string;

export type LineKind = "ctx" | "add" | "del";

export interface DiffLine {
  kind: LineKind;
  oldNum: number | null;
  newNum: number | null;
  text: string;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export type FileKind = "modified" | "added" | "deleted" | "renamed" | "binary";

export interface DiffFile {
  oldPath: string;
  newPath: string;
  kind: FileKind;
  hunks: DiffHunk[];
  added: number;
  deleted: number;
  isBinary: boolean;
}

const LINE_HARD_CEILING = 5000;
const COLLAPSED_THRESHOLD = 400;

export class DiffTooLargeError extends Error {
  constructor(public totalLines: number) {
    super(`Diff too large to review interactively (${totalLines} changed lines).`);
    this.name = "DiffTooLargeError";
  }
}

export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = text.split("\n");
  let i = 0;
  let cur: DiffFile | null = null;
  let curHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  const flushFile = () => {
    if (cur) files.push(cur);
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.startsWith("diff --git ")) {
      flushFile();
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      const a = m?.[1] ?? "";
      const b = m?.[2] ?? "";
      cur = {
        oldPath: a,
        newPath: b,
        kind: "modified",
        hunks: [],
        added: 0,
        deleted: 0,
        isBinary: false,
      };
      curHunk = null;
      i++;
      continue;
    }

    if (!cur) {
      i++;
      continue;
    }

    if (line.startsWith("new file mode")) {
      cur.kind = "added";
      cur.oldPath = "/dev/null";
      i++;
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      cur.kind = "deleted";
      cur.newPath = "/dev/null";
      i++;
      continue;
    }
    if (line.startsWith("rename from ")) {
      cur.kind = "renamed";
      cur.oldPath = line.slice("rename from ".length);
      i++;
      continue;
    }
    if (line.startsWith("rename to ")) {
      cur.newPath = line.slice("rename to ".length);
      i++;
      continue;
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      cur.isBinary = true;
      cur.kind = "binary";
      i++;
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("index ") || line.startsWith("similarity index")) {
      i++;
      continue;
    }

    if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (m) {
        const oldStart = parseInt(m[1] ?? "0", 10);
        const newStart = parseInt(m[3] ?? "0", 10);
        oldLine = oldStart;
        newLine = newStart;
        curHunk = { header: line, oldStart, newStart, lines: [] };
        cur.hunks.push(curHunk);
      }
      i++;
      continue;
    }

    if (curHunk && (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-") || line === "")) {
      if (line.startsWith("\\ ")) {
        i++;
        continue;
      }
      const text = line.length > 0 ? line.slice(1) : "";
      if (line.startsWith("+")) {
        curHunk.lines.push({ kind: "add", oldNum: null, newNum: newLine, text });
        cur.added++;
        newLine++;
      } else if (line.startsWith("-")) {
        curHunk.lines.push({ kind: "del", oldNum: oldLine, newNum: null, text });
        cur.deleted++;
        oldLine++;
      } else {
        curHunk.lines.push({ kind: "ctx", oldNum: oldLine, newNum: newLine, text });
        oldLine++;
        newLine++;
      }
    }
    i++;
  }
  flushFile();
  return files;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function totalChangedLines(files: DiffFile[]): number {
  return files.reduce((n, f) => n + f.added + f.deleted, 0);
}

interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

/** Pair consecutive del/add runs into side-by-side rows; ctx and unpaired rows fill one side. */
function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.kind === "ctx") {
      rows.push({ left: line, right: line });
      i++;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i]!.kind === "del") {
      dels.push(lines[i]!);
      i++;
    }
    while (i < lines.length && lines[i]!.kind === "add") {
      adds.push(lines[i]!);
      i++;
    }
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      rows.push({ left: dels[k] ?? null, right: adds[k] ?? null });
    }
  }
  return rows;
}

/**
 * Canonical key for a logical diff line — same value on the unified and the
 * split copy so the parent annotator can tag both views from one annotation.
 */
function lineKey(fileIdx: number, kind: LineKind, oldNum: number | null, newNum: number | null): string {
  const k = kind === "add" ? "a" : kind === "del" ? "d" : "c";
  return `L-${fileIdx}-${k}-${oldNum ?? "x"}-${newNum ?? "x"}`;
}

const MARK_BUTTON = `<button class="line-mark" type="button" tabindex="-1" aria-label="Annotate this line">+</button>`;

function renderUnifiedLine(file: DiffFile, fileIdx: number, l: DiffLine): string {
  const key = lineKey(fileIdx, l.kind, l.oldNum, l.newNum);
  const path = file.newPath !== "/dev/null" ? file.newPath : file.oldPath;
  const sign = l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ";
  const oldCell = l.oldNum != null ? String(l.oldNum) : "";
  const newCell = l.newNum != null ? String(l.newNum) : "";
  return (
    `<div class="line ${l.kind}"` +
    ` data-line-key="${key}"` +
    ` data-file="${escapeHtml(path)}"` +
    ` data-old-line="${l.oldNum ?? ""}"` +
    ` data-new-line="${l.newNum ?? ""}"` +
    ` data-kind="${l.kind}">` +
    MARK_BUTTON +
    `<span class="gu gu-old">${oldCell}</span>` +
    `<span class="gu gu-new">${newCell}</span>` +
    `<span class="sign">${sign}</span>` +
    `<span class="code">${escapeHtml(l.text) || " "}</span>` +
    `</div>`
  );
}

function renderSplitRow(file: DiffFile, fileIdx: number, row: SplitRow): string {
  const path = file.newPath !== "/dev/null" ? file.newPath : file.oldPath;
  const side = (l: DiffLine | null, kind: "left" | "right"): string => {
    if (!l) return `<div class="line blank ${kind}"><span class="gu"></span><span class="sign"></span><span class="code"> </span></div>`;
    const key = lineKey(fileIdx, l.kind, l.oldNum, l.newNum);
    const num = kind === "left" ? l.oldNum : l.newNum;
    const sign = l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ";
    return (
      `<div class="line ${l.kind} ${kind}"` +
      ` data-line-key="${key}"` +
      ` data-file="${escapeHtml(path)}"` +
      ` data-old-line="${l.oldNum ?? ""}"` +
      ` data-new-line="${l.newNum ?? ""}"` +
      ` data-kind="${l.kind}"` +
      ` data-side="${kind === "left" ? "old" : "new"}">` +
      MARK_BUTTON +
      `<span class="gu">${num ?? ""}</span>` +
      `<span class="sign">${sign}</span>` +
      `<span class="code">${escapeHtml(l.text) || " "}</span>` +
      `</div>`
    );
  };
  return `<div class="row">${side(row.left, "left")}${side(row.right, "right")}</div>`;
}

function renderFile(file: DiffFile, fileIdx: number): string {
  const displayPath = file.kind === "renamed"
    ? `${escapeHtml(file.oldPath)} → ${escapeHtml(file.newPath)}`
    : escapeHtml(file.newPath !== "/dev/null" ? file.newPath : file.oldPath);
  const statBits: string[] = [];
  if (file.added) statBits.push(`<span class="add-count">+${file.added}</span>`);
  if (file.deleted) statBits.push(`<span class="del-count">−${file.deleted}</span>`);
  statBits.push(`<span class="kind">${file.kind}</span>`);
  const stats = statBits.join(" ");
  const fileId = `F-${fileIdx}-${slug(file.newPath || file.oldPath)}`;

  let body = "";
  if (file.isBinary) {
    body = `<div class="binary-row">Binary file changed — not annotatable.</div>`;
  } else {
    for (const hunk of file.hunks) {
      body += `<div class="hunk-head">${escapeHtml(hunk.header)}</div>`;
      body += `<div class="hunk-body hunk-unified">${hunk.lines.map((l) => renderUnifiedLine(file, fileIdx, l)).join("")}</div>`;
      const rows = toSplitRows(hunk.lines);
      body += `<div class="hunk-body hunk-split">${rows.map((r) => renderSplitRow(file, fileIdx, r)).join("")}</div>`;
    }
  }
  return (
    `<section class="file" id="${fileId}" data-file="${escapeHtml(file.newPath || file.oldPath)}">` +
    `<header class="file-head">` +
    `<button class="chevron" type="button" aria-label="Toggle file">▾</button>` +
    `<span class="path">${displayPath}</span>` +
    `<span class="stats">${stats}</span>` +
    `</header>` +
    `<div class="file-body">${body}</div>` +
    `</section>`
  );
}

export interface RenderOptions {
  /** Title shown in the page header (e.g. repo + branch summary). */
  title?: string;
  /** Number of untracked files not shown, surfaced in the page header. */
  untrackedCount?: number;
}

/**
 * Render a full HTML document for a parsed diff. Throws DiffTooLargeError if
 * the diff is over the hard ceiling.
 */
export function renderDiffPage(files: DiffFile[], opts: RenderOptions = {}): string {
  const total = totalChangedLines(files);
  if (total > LINE_HARD_CEILING) throw new DiffTooLargeError(total);

  const title = opts.title ?? "pinpoint review";
  const fileSections = files.map((f, idx) => renderFile(f, idx)).join("");
  const untrackedNote = opts.untrackedCount
    ? `<div class="banner">${opts.untrackedCount} untracked file${opts.untrackedCount === 1 ? "" : "s"} not shown.</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  :root, body[data-theme="light"] {
    --bg: #fafafa;
    --fg: #1a1a1a;
    --muted: #6b6b6b;
    --line: #e6e6e6;
    --code-bg: #ffffff;
    --gutter-bg: #fbfbfb;
    --file-head-bg: #fafafa;
    --hunk-head-bg: #fbfbfb;
    --add-bg: #e6ffec;
    --add-fg: #1a5826;
    --del-bg: #ffebe9;
    --del-fg: #82071e;
    --blank-bg: #f6f6f6;
    --banner-bg: #fff8e1;
    --banner-fg: #5a4500;
    --banner-bd: #ffe082;
    --range-tint: rgba(24,24,27,0.06);
    --accent: #1a1a1a;
    --accent-ink: #ffffff;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  body[data-theme="dark"] {
    --bg: #161618;
    --fg: #ededee;
    --muted: #9a9aa0;
    --line: #2a2a2d;
    --code-bg: #1a1a1c;
    --gutter-bg: #1c1c1e;
    --file-head-bg: #1d1d1f;
    --hunk-head-bg: #1d1d1f;
    --add-bg: rgba(46,160,67,0.18);
    --add-fg: #7cd991;
    --del-bg: rgba(248,81,73,0.18);
    --del-fg: #ff8a82;
    --blank-bg: #1a1a1c;
    --banner-bg: #2a2410;
    --banner-fg: #f0d28b;
    --banner-bd: #5a4500;
    --range-tint: rgba(237,237,238,0.08);
    --accent: #ededee;
    --accent-ink: #161618;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 13px; }
  main { padding: 12px 16px 80px; max-width: 100%; }
  .banner { background: var(--banner-bg); border: 1px solid var(--banner-bd); color: var(--banner-fg); padding: 6px 10px; border-radius: 4px; font-family: var(--mono); font-size: 11.5px; margin: 0 0 12px; }

  section.file { border: 1px solid var(--line); border-radius: 4px; background: var(--code-bg); margin: 0 0 16px; overflow: hidden; }
  section.file header.file-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--file-head-bg); border-bottom: 1px solid var(--line); font-family: var(--mono); font-size: 12px; position: sticky; top: 0; z-index: 4; color: var(--fg); }
  section.file header.file-head .path { flex: 1; font-weight: 600; }
  section.file header.file-head .stats { color: var(--muted); font-size: 11.5px; display: flex; gap: 6px; }
  section.file header.file-head .add-count { color: var(--add-fg); }
  section.file header.file-head .del-count { color: var(--del-fg); }
  section.file header.file-head .kind { text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
  section.file header.file-head .chevron { background: transparent; border: 0; cursor: pointer; font-size: 12px; color: var(--muted); padding: 0; width: 16px; }
  section.file.collapsed .file-body { display: none; }
  section.file.collapsed .chevron { transform: rotate(-90deg); }
  /* Each file's body scrolls horizontally on its own — long lines stay on screen via the file's local scroll, not the page's. */
  section.file .file-body { overflow-x: auto; }

  .hunk-head { font-family: var(--mono); font-size: 11.5px; color: var(--muted); padding: 4px 12px; background: var(--hunk-head-bg); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); position: sticky; left: 0; }
  .hunk-body { font-family: var(--mono); font-size: 12px; line-height: 1.55; }
  .hunk-split { display: none; }
  body[data-view="split"] .hunk-split { display: block; }
  body[data-view="split"] .hunk-unified { display: none; }
  body[data-view="unified"] .hunk-split { display: none; }
  body[data-view="unified"] .hunk-unified { display: block; }

  .line { display: flex; padding: 0; position: relative; }
  .line .gu { display: inline-block; min-width: 40px; padding: 0 6px; text-align: right; color: var(--muted); user-select: none; background: var(--gutter-bg); border-right: 1px solid var(--line); position: sticky; left: 0; z-index: 1; flex-shrink: 0; align-self: stretch; }
  .line .gu.gu-old { min-width: 44px; left: 0; }
  .line .gu.gu-new { min-width: 44px; left: 44px; }
  .line .sign { display: inline-block; width: 16px; padding: 0 4px; color: var(--muted); user-select: none; flex-shrink: 0; }
  .line .code { flex: 1 1 0; min-width: 0; padding: 0 8px; }
  .line.add { background: var(--add-bg); }
  .line.add .code, .line.add .sign { color: var(--add-fg); }
  .line.del { background: var(--del-bg); }
  .line.del .code, .line.del .sign { color: var(--del-fg); }
  .line.blank { background: var(--blank-bg); }
  .line.blank .code { color: transparent; }

  /* Split view: each side is half the width; long lines wrap inside their column
     so nothing escapes the viewport. Row-by-row alignment between sides is lost
     for wrapped lines — an explicit trade-off vs. horizontal scroll. */
  body[data-view="split"] .row { display: grid; grid-template-columns: 1fr 1fr; min-width: 0; }
  body[data-view="split"] .row > .line { border-right: 1px solid var(--line); min-width: 0; }
  body[data-view="split"] .row > .line:last-child { border-right: none; }
  body[data-view="split"] .line .code { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }

  /* Unified view: keep monospace alignment via horizontal scroll inside the file body. */
  body[data-view="unified"] .hunk-unified .line { min-width: max-content; }
  body[data-view="unified"] .hunk-unified .line .code { flex: 1 0 auto; white-space: pre; }

  /* GitHub-style gutter "+" button — appears on line hover; the click target for annotation. */
  .line .line-mark {
    position: absolute;
    left: 2px; top: 50%;
    transform: translateY(-50%);
    width: 18px; height: 18px;
    padding: 0; margin: 0;
    background: var(--accent); color: var(--accent-ink);
    border: 0; border-radius: 4px;
    font: 700 12px/16px var(--mono);
    cursor: pointer;
    opacity: 0; pointer-events: auto;
    z-index: 6;
    box-shadow: 0 1px 2px rgba(0,0,0,0.18);
  }
  .line:hover .line-mark, .line .line-mark:focus { opacity: 1; }
  .line.blank .line-mark { display: none; }
  /* While dragging across a range, only the *starting* line keeps its "+" visible.
     Other range-selecting lines hide theirs so the diff isn't peppered with +'s. */
  .line.range-selecting .line-mark { opacity: 0 !important; }
  .line.range-selecting.range-start .line-mark { opacity: 1 !important; }
  .line.range-selecting {
    box-shadow: inset 3px 0 0 var(--accent);
    background-image: linear-gradient(0deg, var(--range-tint), var(--range-tint));
  }

  .binary-row { padding: 12px; color: var(--muted); font-family: var(--mono); font-size: 12px; }
</style>
</head>
<body data-view="unified">
<main>
  ${untrackedNote}
  ${fileSections}
</main>
<script>
${DIFF_RUNTIME}
</script>
</body>
</html>`;
}

/** Compact summary of a parsed diff — surfaced in the review shell's toolbar / rail. */
export interface DiffSummary {
  fileCount: number;
  added: number;
  deleted: number;
  files: Array<{ id: string; path: string; added: number; deleted: number; kind: FileKind }>;
}

export function summarizeDiff(files: DiffFile[]): DiffSummary {
  return {
    fileCount: files.length,
    added: files.reduce((n, f) => n + f.added, 0),
    deleted: files.reduce((n, f) => n + f.deleted, 0),
    files: files.map((f, idx) => ({
      id: `F-${idx}-${slug(f.newPath || f.oldPath)}`,
      path: f.newPath !== "/dev/null" ? f.newPath : f.oldPath,
      added: f.added,
      deleted: f.deleted,
      kind: f.kind,
    })),
  };
}

export const DIFF_THRESHOLDS = { COLLAPSED_THRESHOLD, LINE_HARD_CEILING };
