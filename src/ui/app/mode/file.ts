/**
 * FileMode — the original Pinpoint reviewer: an HTML or Markdown file inside
 * the iframe, element-anchored click annotations, "Page-wide note" sidebar
 * field, "# UI Feedback" brief.
 */
import type { Mode } from "./index";
import type { Annotation } from "../types";
import { CFG } from "../config";
import { state, ctx } from "../state";
import { escapeHtml } from "../dom";

const CHROME = `
  <header class="topbar">
    <div class="brand">Pin<b>point</b></div>
    <div class="seg">
      <button data-role="mode-inspect" class="on" data-shortcut="I">&#8982; Inspect</button>
      <button data-role="mode-browse" data-shortcut="B">&#8599; Browse</button>
    </div>
    <div class="file-name" data-role="file-name" title=""></div>
    <div class="spacer"></div>
    <div class="counts" data-role="counts">0 annotations</div>
    <button type="button" class="btn ghost theme-toggle" data-role="theme-toggle" data-shortcut="T" title="Toggle light / dark theme" aria-label="Toggle light or dark theme"><span data-role="theme-icon">&#127769;</span></button>
  </header>
  <div class="canvas" data-role="canvas">
    <div class="frame-wrap">
      <iframe data-role="frame" sandbox="allow-same-origin allow-scripts allow-forms allow-popups"></iframe>
    </div>
  </div>
  <aside class="panel" data-role="panel">
    <div class="panel-head">
      <div class="panel-title">Annotations</div>
      <div class="global-wrap">
        <label>Page-wide note</label>
        <textarea data-role="global-comment" placeholder="Overall feedback on the whole page&hellip;"></textarea>
      </div>
    </div>
    <div class="annot-list" data-role="annot-list"></div>
    <div class="panel-foot">
      <button class="btn ghost" data-role="clear-all" data-shortcut="⌘⇧X">Clear</button>
      <div class="spacer"></div>
      <button class="btn" data-role="finalize-approve" data-shortcut="⌘↵">Approve</button>
      <button class="btn primary" data-role="finalize-send" data-shortcut="⌘↵">Send Feedback</button>
    </div>
  </aside>`;

export const FileMode: Mode = {
  chrome: () => CHROME,
  shellClass: () => "",
  titlePrefix: () => (CFG.fileName && CFG.fileName !== "(unknown)" ? CFG.fileName : ""),

  formatSidebarRef(a: Annotation): string {
    return (
      `<div class="annot-selector">${escapeHtml(a.selector)}</div>` +
      `<div class="annot-preview" title="${escapeHtml(a.outerHTML)}">${escapeHtml(a.outerHTML)}</div>`
    );
  },

  buildBrief(items: Annotation[]): string {
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
  },

  onBoot(): void {
    // File mode: stamp the file name into the toolbar slot the chrome reserves.
    const shell = ctx.shells["a"]?.el;
    const fn = shell?.querySelector<HTMLElement>('[data-role="file-name"]');
    if (fn) {
      fn.textContent = CFG.fileName;
      fn.title = CFG.filePath;
    }
  },

  // File mode has no mode-specific single-key shortcuts; the common keys
  // (I/B/T/G/N/Esc/1-9) live in keyboard.ts and fire identically.
  handleKey: () => false,
};
