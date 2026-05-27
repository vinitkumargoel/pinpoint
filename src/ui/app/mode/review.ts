/**
 * ReviewMode — the code-review flavour: a rendered git diff inside the iframe,
 * gutter-`+` / drag-to-range annotations posted from the diff runtime, file
 * rail, Split/Unified view, "# Code Review Feedback" brief.
 */
import type { Mode } from "./index";
import type { Annotation } from "../types";
import { CFG } from "../config";
import { state, ctx } from "../state";
import { escapeHtml } from "../dom";
import { setView, toggleRail, jumpInFrame } from "../shell";
import { installReviewMessageListener } from "../iframe";

const VIEW_LS_KEY = "pinpoint:review:view";
const RAIL_LS_KEY = "pinpoint:review:rail";

function chrome(): string {
  const meta = CFG.meta;
  const metaLine = meta
    ? `<span class="branch">${escapeHtml(meta.branch)}</span> · <b>${meta.fileCount}</b> file${meta.fileCount === 1 ? "" : "s"} · <b class="add-count">+${meta.added}</b> <b class="del-count">−${meta.deleted}</b>`
    : "working tree";
  const railItems = (meta?.files ?? [])
    .map(
      (f) =>
        `<li data-file-id="${escapeHtml(f.id)}"><span class="rail-path" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</span><span class="rail-stat"><span class="add-count">+${f.added}</span> <span class="del-count">−${f.deleted}</span></span></li>`,
    )
    .join("");
  return `
  <header class="topbar review-topbar">
    <div class="brand review-brand">REVIEW</div>
    <div class="review-meta">${metaLine}</div>
    <button type="button" class="btn ghost" data-role="rail-toggle" data-shortcut="[" title="Toggle file rail">&#8676; Files</button>
    <div class="seg">
      <button data-role="view-split" data-shortcut="S">Split</button>
      <button data-role="view-unified" class="on">Unified</button>
    </div>
    <div class="spacer"></div>
    <div class="counts" data-role="counts">0 annotations</div>
    <button type="button" class="btn ghost theme-toggle" data-role="theme-toggle" data-shortcut="T" title="Toggle light / dark theme" aria-label="Toggle light or dark theme"><span data-role="theme-icon">&#127769;</span></button>
  </header>
  <aside class="rail" data-role="rail">
    <div class="rail-head">Files (${meta?.fileCount ?? 0})</div>
    <ul class="rail-list" data-role="rail-list">${railItems}</ul>
  </aside>
  <div class="canvas" data-role="canvas">
    <div class="frame-wrap frame-wrap-review">
      <iframe data-role="frame" sandbox="allow-same-origin allow-scripts allow-forms allow-popups"></iframe>
    </div>
  </div>
  <aside class="panel" data-role="panel">
    <div class="panel-head">
      <div class="panel-title">Annotations</div>
      <div class="global-wrap">
        <label>Overall note</label>
        <textarea data-role="global-comment" placeholder="High-level feedback on the change&hellip;"></textarea>
      </div>
    </div>
    <div class="annot-list" data-role="annot-list"></div>
    <div class="panel-foot review-foot">
      <span class="review-keys">hover a line · click + or drag · [ rail · S view · J/K change · N/P file</span>
      <div class="spacer"></div>
      <button class="btn" data-role="finalize-approve" data-shortcut="⌘↵">Approve</button>
      <button class="btn primary" data-role="finalize-send" data-shortcut="⌘↵">Send Feedback</button>
    </div>
  </aside>`;
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
  const range = startN === endN ? `L${startN}` : `L${startN}–${endN}`;
  return `${range} (${side})`;
}

function applyPrefs(shell: HTMLElement): void {
  let view: "split" | "unified" = "unified";
  let rail: "open" | "closed" = "open";
  try {
    const v = localStorage.getItem(VIEW_LS_KEY);
    if (v === "split" || v === "unified") view = v;
    const r = localStorage.getItem(RAIL_LS_KEY);
    if (r === "open" || r === "closed") rail = r;
  } catch {
    /* ignore */
  }
  // Reflect the saved view on the seg buttons. The diff iframe gets its own
  // sync via iframe.ts/syncReviewViewToFrame on load — no postMessage needed.
  shell.querySelectorAll<HTMLElement>('[data-role="view-split"], [data-role="view-unified"]').forEach((b) => {
    const role = b.dataset.role;
    b.classList.toggle("on", (role === "view-split") === (view === "split"));
  });
  if (rail === "closed") shell.classList.add("no-rail");
}

export const ReviewMode: Mode = {
  chrome,
  shellClass: () => "shell-review",
  titlePrefix: () => "Review",

  formatSidebarRef(a: Annotation): string {
    if (!a.review) {
      // Defensive: a review annotation should always carry `review`. If it
      // doesn't (e.g. malformed), fall through to a selector display so we
      // don't render an empty card.
      return `<div class="annot-selector">${escapeHtml(a.selector)}</div>`;
    }
    const r = a.review;
    return `<div class="annot-line-ref" title="${escapeHtml(r.file)}"><span class="lr-range">${escapeHtml(formatLineRef(a))}</span><span class="lr-file">${escapeHtml(r.file)}</span></div>`;
  },

  buildBrief(items: Annotation[]): string {
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
        L.push(`### #${n} — ${formatLineRef(a)}`);
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
  },

  onBoot(): void {
    installReviewMessageListener();
    const shell = ctx.shells["a"]?.el;
    if (shell) applyPrefs(shell);
  },

  /**
   * Review-only single-key shortcuts. Returns true if the key was consumed.
   *  [    toggle file rail
   *  s    toggle Split/Unified
   *  j/k  next/prev change
   *  n/p  next/prev file (overrides file-mode's N=focus-global)
   */
  handleKey(e: KeyboardEvent): boolean {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === "[") {
      e.preventDefault();
      toggleRail();
      return true;
    }
    const k = e.key.toLowerCase();
    switch (k) {
      case "s": {
        e.preventDefault();
        const current = document.querySelector('[data-role="view-split"]')?.classList.contains("on") ? "split" : "unified";
        setView(current === "split" ? "unified" : "split");
        return true;
      }
      case "j":
        e.preventDefault();
        jumpInFrame("change", 1);
        return true;
      case "k":
        e.preventDefault();
        jumpInFrame("change", -1);
        return true;
      case "n":
        e.preventDefault();
        jumpInFrame("file", 1);
        return true;
      case "p":
        e.preventDefault();
        jumpInFrame("file", -1);
        return true;
      default:
        return false;
    }
  },
};
