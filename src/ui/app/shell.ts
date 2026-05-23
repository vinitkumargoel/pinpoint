import type { Mode } from "./types";
import { CFG } from "./config";
import { state, ctx, persist } from "./state";
import { activeDoc } from "./dom";
import { onFrameLoad, reapply, reapplyActive } from "./iframe";
import { render } from "./sidebar";
import { hideHover } from "./hover";
import { onSend, onApprove } from "./finalize";
import { toggleTheme } from "./theme";
import { confirmDialog, toast } from "./dialog";

/** Toolbar + canvas + sidebar markup for one shell. */
const CHROME = `
  <header class="topbar">
    <div class="brand">Pin<b>point</b></div>
    <div class="seg">
      <button data-role="mode-inspect" class="on">&#8982; Inspect</button>
      <button data-role="mode-browse">&#8599; Browse</button>
    </div>
    <div class="file-name" data-role="file-name" title=""></div>
    <div class="spacer"></div>
    <div class="counts" data-role="counts">0 annotations</div>
    <button type="button" class="btn ghost theme-toggle" data-role="theme-toggle" title="Toggle light / dark theme" aria-label="Toggle light or dark theme"><span data-role="theme-icon">&#127769;</span></button>
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
      <button class="btn ghost" data-role="clear-all">Clear</button>
      <div class="spacer"></div>
      <button class="btn" data-role="finalize-approve">Approve</button>
      <button class="btn primary" data-role="finalize-send">Send Feedback</button>
    </div>
  </aside>`;

/** Create each shell, point its iframe at the user's file, and wire its chrome. */
export function buildShells(): void {
  const root = document.getElementById("shells");
  if (!root) return;
  (["a"] as const).forEach((dir) => {
    const shell = document.createElement("div");
    shell.className = "shell";
    shell.dataset.dir = dir;
    shell.hidden = true;
    shell.innerHTML = CHROME;
    root.appendChild(shell);

    const fn = shell.querySelector<HTMLElement>('[data-role="file-name"]');
    if (fn) {
      fn.textContent = CFG.fileName;
      fn.title = CFG.filePath;
    }

    const iframe = shell.querySelector<HTMLIFrameElement>('[data-role="frame"]')!;
    iframe.addEventListener("load", () => onFrameLoad(dir));
    iframe.src = CFG.targetUrl; // the user's real file, served by the local server

    ctx.shells[dir] = { el: shell, iframe };
    wireShell(dir);
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
  });
  s.querySelector('[data-role="clear-all"]')?.addEventListener("click", () => void clearAll());
  s.querySelector('[data-role="finalize-approve"]')?.addEventListener("click", () => void onApprove());
  s.querySelector('[data-role="finalize-send"]')?.addEventListener("click", () => void onSend());
  s.querySelector('[data-role="theme-toggle"]')?.addEventListener("click", () => toggleTheme());
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
