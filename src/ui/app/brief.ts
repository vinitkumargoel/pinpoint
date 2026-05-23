import { state } from "./state";
import { CFG } from "./config";

/** Build the Markdown brief handed back to Claude Code on "Send Feedback". */
export function buildBrief(): string {
  const items = state.annotations.filter((a) => a.comment.trim() !== "");
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
