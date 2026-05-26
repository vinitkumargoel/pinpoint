import { state } from "./state";
import { CFG } from "./config";
import type { Annotation } from "./types";

/** Build the Markdown brief handed back to Claude Code on "Send Feedback". */
export function buildBrief(): string {
  const items = state.annotations.filter((a) => a.comment.trim() !== "");
  return CFG.kind === "review" ? buildReviewBrief(items) : buildFileBrief(items);
}

function buildFileBrief(items: Annotation[]): string {
  const L: string[] = [];
  L.push("# UI Feedback");
  L.push("");
  L.push("**File:** `" + CFG.filePath + "`");
  L.push("");
  if (state.globalComment.trim()) {
    L.push("## Page-wide note");
    L.push("");
    L.push(state.globalComment.trim());
    L.push("");
  }
  L.push(`## ${items.length} element annotation${items.length === 1 ? "" : "s"}`);
  L.push("");
  items.forEach((a, i) => {
    L.push(`### #${i + 1} — \`${a.selector}\``);
    L.push("");
    L.push(`**Element:** \`<${a.tag}>\`${a.text ? ` — "${a.text}"` : ""}`);
    L.push("");
    L.push("```html");
    L.push(a.outerHTML);
    L.push("```");
    L.push("");
    L.push(`**Feedback:** ${a.comment.trim()}`);
    L.push("");
  });
  return L.join("\n");
}

function buildReviewBrief(items: Annotation[]): string {
  const L: string[] = [];
  L.push("# Code Review Feedback");
  L.push("");
  if (CFG.meta) {
    const m = CFG.meta;
    L.push(`**Branch:** \`${m.branch}\` · **${m.fileCount}** file${m.fileCount === 1 ? "" : "s"} · **+${m.added} −${m.deleted}**`);
    L.push("");
  }
  if (state.globalComment.trim()) {
    L.push("## Overall note");
    L.push("");
    L.push(state.globalComment.trim());
    L.push("");
  }
  if (!items.length) return L.join("\n").trimEnd() + "\n";

  // Group annotations by file, preserve creation order within each group.
  const byFile = new Map<string, Annotation[]>();
  for (const a of items) {
    const file = a.review?.file ?? "(unknown)";
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push(a);
  }

  let n = 0;
  for (const [file, group] of byFile) {
    L.push(`## ${file}`);
    L.push("");
    for (const a of group) {
      n++;
      const ref = formatLineRef(a);
      L.push(`### #${n} — ${ref}`);
      L.push("");
      if (a.review) {
        L.push("```");
        for (const l of a.review.lines) {
          const sign = l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ";
          L.push(sign + l.text);
        }
        L.push("```");
        L.push("");
      }
      L.push(`**Feedback:** ${a.comment.trim()}`);
      L.push("");
    }
  }
  return L.join("\n");
}

function formatLineRef(a: Annotation): string {
  const r = a.review;
  if (!r) return "`" + a.selector + "`";
  const first = r.lines[0]!;
  const last = r.lines[r.lines.length - 1]!;
  const side: "old" | "new" =
    first.kind === "del" && first.newLine == null ? "old" : "new";
  const startN = side === "old" ? first.oldLine : first.newLine;
  const endN = side === "old" ? last.oldLine : last.newLine;
  const range = startN === endN ? `${startN}` : `${startN}-${endN}`;
  const tag =
    r.lines.length === 1
      ? first.kind === "del"
        ? "deletion"
        : first.kind === "add"
          ? "addition"
          : "context"
      : `${r.lines.length}-line range`;
  return `line ${range} (${side}) · ${tag}`;
}
