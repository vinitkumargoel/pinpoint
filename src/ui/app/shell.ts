import type { Mode } from "./types";
import { CFG } from "./config";
import { state, ctx, persist } from "./state";
import { activeDoc, updateFinalizeButtons } from "./dom";
import { onFrameLoad, reapply, reapplyActive } from "./iframe";
import { render } from "./sidebar";
import { hideHover } from "./hover";
import { onSend, onApprove } from "./finalize";
import { toggleTheme } from "./theme";
import { confirmDialog, toast } from "./dialog";
import {
  jumpMsg,
  scrollToFileMsg,
  viewMsg,
  type JumpDir,
  type JumpTarget,
  type ReviewMessage,
  type View,
} from "../../review-protocol.ts";

const VIEW_LS_KEY = "pinpoint:review:view";
const RAIL_LS_KEY = "pinpoint:review:rail";

/**
 * Create the shell(s), point each iframe at the target URL, and wire common
 * controls. The chrome HTML and the extra shell class are mode-specific — main.ts
 * passes them in so this function has no knowledge of file vs review.
 */
export interface BuildShellsOpts {
  chromeHtml: string;
  shellClass?: string;
}

export function buildShells(opts: BuildShellsOpts): void {
  const root = document.getElementById("shells");
  if (!root) return;
  (["a"] as const).forEach((dir) => {
    const shell = document.createElement("div");
    shell.className = "shell" + (opts.shellClass ? " " + opts.shellClass : "");
    shell.dataset.dir = dir;
    shell.dataset.kind = CFG.kind;
    shell.hidden = true;
    shell.innerHTML = opts.chromeHtml;
    root.appendChild(shell);

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
      if (id) postToFrame(scrollToFileMsg(id));
      s.querySelectorAll<HTMLElement>('[data-role="rail-list"] li.active').forEach((x) => x.classList.remove("active"));
      li.classList.add("active");
    });
  });
}

export function setView(v: View): void {
  const shell = ctx.active ?? ctx.shells["a"]?.el;
  if (!shell) return;
  setViewOn(shell, v, true);
}

function setViewOn(shell: HTMLElement, v: View, shouldPersist: boolean): void {
  shell.querySelectorAll<HTMLElement>('[data-role="view-split"], [data-role="view-unified"]').forEach((b) => {
    const role = b.dataset.role;
    b.classList.toggle("on", (role === "view-split") === (v === "split"));
  });
  postToFrame(viewMsg(v));
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

export function jumpInFrame(target: JumpTarget, dir: JumpDir): void {
  postToFrame(jumpMsg(target, dir));
}

function postToFrame(msg: ReviewMessage): void {
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
