import type { Mode } from "./types";
import { CFG } from "./config";
import { state, ctx, persist } from "./state";
import { activeDoc, escapeHtml, updateFinalizeButtons } from "./dom";
import { onFrameLoad, reapply, reapplyActive } from "./iframe";
import { render } from "./sidebar";
import { hideHover } from "./hover";
import { onSend, onApprove } from "./finalize";
import { toggleTheme } from "./theme";
import { confirmDialog, toast } from "./dialog";

const VIEW_LS_KEY = "pinpoint:review:view";
const RAIL_LS_KEY = "pinpoint:review:rail";

/** Toolbar + canvas + sidebar markup for the file/Markdown reviewer. */
const FILE_CHROME = `
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

/** Toolbar + rail + canvas + sidebar markup for the code-review shell. */
function reviewChrome(): string {
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
      <button data-role="view-split" class="on" data-shortcut="S">Split</button>
      <button data-role="view-unified">Unified</button>
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

/** Create each shell, point its iframe at the user's file, and wire its chrome. */
export function buildShells(): void {
  const root = document.getElementById("shells");
  if (!root) return;
  const isReview = CFG.kind === "review";
  (["a"] as const).forEach((dir) => {
    const shell = document.createElement("div");
    shell.className = "shell" + (isReview ? " shell-review" : "");
    shell.dataset.dir = dir;
    shell.dataset.kind = CFG.kind;
    shell.hidden = true;
    shell.innerHTML = isReview ? reviewChrome() : FILE_CHROME;
    root.appendChild(shell);

    if (!isReview) {
      const fn = shell.querySelector<HTMLElement>('[data-role="file-name"]');
      if (fn) {
        fn.textContent = CFG.fileName;
        fn.title = CFG.filePath;
      }
    }

    const iframe = shell.querySelector<HTMLIFrameElement>('[data-role="frame"]')!;
    iframe.addEventListener("load", () => onFrameLoad(dir));
    iframe.src = CFG.targetUrl; // the user's real file, served by the local server

    ctx.shells[dir] = { el: shell, iframe };
    wireShell(dir);
    if (isReview) applyReviewPrefs(shell);
  });
}

function wireShell(dir: string): void {
  const shell = ctx.shells[dir];
  if (!shell) return;
  const s = shell.el;
  s.querySelector('[data-role="mode-inspect"]')?.addEventListener("click", () => setMode("inspect"));
  s.querySelector('[data-role="mode-browse"]')?.addEventListener("click", () => setMode("browse"));
  s.querySelector('[data-role="global-comment"]')?.addEventListener("input", (e) => {
    state.globalComment = (e.target as HTMLTextAreaElement).value;
    persist();
    updateFinalizeButtons();
  });
  s.querySelector('[data-role="clear-all"]')?.addEventListener("click", () => void clearAll());
  s.querySelector('[data-role="finalize-approve"]')?.addEventListener("click", () => void onApprove());
  s.querySelector('[data-role="finalize-send"]')?.addEventListener("click", () => void onSend());
  s.querySelector('[data-role="theme-toggle"]')?.addEventListener("click", () => toggleTheme());

  // Review-only controls.
  s.querySelector('[data-role="rail-toggle"]')?.addEventListener("click", () => toggleRail());
  s.querySelector('[data-role="view-split"]')?.addEventListener("click", () => setView("split"));
  s.querySelector('[data-role="view-unified"]')?.addEventListener("click", () => setView("unified"));
  s.querySelectorAll<HTMLElement>('[data-role="rail-list"] li').forEach((li) => {
    li.addEventListener("click", () => {
      const id = li.dataset.fileId;
      if (id) postToFrame({ type: "review:scroll-to-file", id });
      s.querySelectorAll<HTMLElement>('[data-role="rail-list"] li.active').forEach((x) => x.classList.remove("active"));
      li.classList.add("active");
    });
  });
}

function applyReviewPrefs(shell: HTMLElement): void {
  let view: "split" | "unified" = "split";
  let rail: "open" | "closed" = "open";
  try {
    const v = localStorage.getItem(VIEW_LS_KEY);
    if (v === "split" || v === "unified") view = v;
    const r = localStorage.getItem(RAIL_LS_KEY);
    if (r === "open" || r === "closed") rail = r;
  } catch {
    /* ignore */
  }
  setViewOn(shell, view, /*persist=*/ false);
  if (rail === "closed") shell.classList.add("no-rail");
}

export function setView(v: "split" | "unified"): void {
  const shell = ctx.active ?? ctx.shells["a"]?.el;
  if (!shell) return;
  setViewOn(shell, v, true);
}

function setViewOn(shell: HTMLElement, v: "split" | "unified", shouldPersist: boolean): void {
  shell.querySelectorAll<HTMLElement>('[data-role="view-split"], [data-role="view-unified"]').forEach((b) => {
    const role = b.dataset.role;
    b.classList.toggle("on", (role === "view-split") === (v === "split"));
  });
  postToFrame({ type: "review:view", value: v });
  if (shouldPersist) {
    try {
      localStorage.setItem(VIEW_LS_KEY, v);
    } catch {
      /* ignore */
    }
  }
}

export function toggleRail(): void {
  const shell = ctx.active ?? ctx.shells["a"]?.el;
  if (!shell) return;
  const closed = shell.classList.toggle("no-rail");
  try {
    localStorage.setItem(RAIL_LS_KEY, closed ? "closed" : "open");
  } catch {
    /* ignore */
  }
}

export function jumpInFrame(target: "change" | "file", dir: 1 | -1): void {
  postToFrame({ type: "review:jump", target, dir });
}

function postToFrame(msg: unknown): void {
  const shell = ctx.active ?? ctx.shells["a"]?.el;
  if (!shell) return;
  const iframe = shell.querySelector<HTMLIFrameElement>('[data-role="frame"]');
  iframe?.contentWindow?.postMessage(msg, "*");
}

export function setMode(m: Mode): void {
  state.mode = m;
  const doc = activeDoc();
  if (doc) doc.body.classList.toggle("__pp-inspect", m === "inspect");
  if (m === "browse") hideHover();
  render();
}

export async function clearAll(): Promise<void> {
  if (!state.annotations.length) {
    toast("No annotations to clear");
    return;
  }
  const n = state.annotations.length;
  const ok = await confirmDialog({
    title: "Clear all annotations",
    message: `Delete all ${n} annotation${n === 1 ? "" : "s"}? This can’t be undone.`,
    confirmLabel: "Clear all",
    danger: true,
  });
  if (!ok) return;
  state.annotations = [];
  state.selectedId = null;
  persist();
  reapplyActive();
  render();
  toast("Cleared all annotations");
}

/** Show one shell (single shell today; kept for engine symmetry). */
export function switchTo(dir: string): void {
  Object.values(ctx.shells).forEach((s) => {
    s.el.hidden = true;
  });
  const shell = ctx.shells[dir];
  if (!shell) return;
  ctx.active = shell.el;
  shell.el.hidden = false;
  const doc = shell.iframe.contentDocument;
  if (doc) {
    doc.body.classList.toggle("__pp-inspect", state.mode === "inspect");
    reapply(doc);
  }
  render();
}
