import { ctx, state } from "./state";
import { DIRS } from "./config";
import { activeDoc } from "./dom";
import { showHover, posHover, hideHover } from "./hover";
import { addAnnotation } from "./annotations";
import { render } from "./sidebar";

/** Called when a shell's iframe finishes loading the user's file. */
export function onFrameLoad(dir: string): void {
  const shell = ctx.shells[dir];
  if (!shell) return;
  let doc: Document | null;
  try {
    doc = shell.iframe.contentDocument;
  } catch {
    doc = null;
  }
  if (!doc) return;
  injectOverlay(doc, dir);
  attachHandlers(doc, dir);
  doc.body.classList.toggle("__pp-inspect", state.mode === "inspect");
  reapply(doc);
  if (ctx.active && ctx.active.dataset.dir === dir) render();
}

/** Inject the hover/badge/selection styles into the user's document. */
export function injectOverlay(doc: Document, dir: string): void {
  const c = DIRS[dir];
  if (!c) return;
  const pre = c.badgePre || "";
  const suf = c.badgeSuf || "";
  doc.getElementById("__pp-styles")?.remove();
  const style = doc.createElement("style");
  style.id = "__pp-styles";
  style.textContent = `
    .__pp-hover { outline: 2px solid ${c.accent} !important; outline-offset: -2px !important; cursor: crosshair !important; background-color: ${c.tint} !important; }
    .__pp-tagged { outline: 2px dashed ${c.accent} !important; outline-offset: -2px !important; position: relative !important; }
    .__pp-tagged::before {
      content: "${pre}" attr(data-pp-num) "${suf}" !important;
      position: absolute !important; top: -10px !important; left: -10px !important;
      min-width: 20px !important; height: 20px !important; padding: 0 5px !important;
      background: ${c.accent} !important; color: ${c.badgeText} !important;
      font: 700 11px/20px ui-monospace, monospace !important;
      border-radius: ${c.badgeRadius} !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      z-index: 99999 !important; box-shadow: 0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,0.28) !important;
      pointer-events: none !important;
    }
    .__pp-selected { outline: 3px solid ${c.accent} !important; outline-offset: -3px !important; }
    body.__pp-inspect, body.__pp-inspect * { cursor: crosshair !important; }
  `;
  doc.head.appendChild(style);
}

/** Wire hover-to-inspect and click-to-annotate inside the user's document. */
export function attachHandlers(doc: Document, dir: string): void {
  let hovered: Element | null = null;
  doc.addEventListener(
    "mouseover",
    (e) => {
      if (state.mode !== "inspect") return;
      const t = e.target as Element | null;
      if (!t || t === doc.body || t === doc.documentElement) return;
      if (hovered && hovered !== t) hovered.classList.remove("__pp-hover");
      t.classList.add("__pp-hover");
      hovered = t;
      showHover(t, e, dir);
    },
    true,
  );
  doc.addEventListener(
    "mouseout",
    (e) => {
      if (state.mode !== "inspect") return;
      if (e.target === hovered) {
        (e.target as Element).classList.remove("__pp-hover");
        hovered = null;
        hideHover();
      }
    },
    true,
  );
  doc.addEventListener(
    "mousemove",
    (e) => {
      if (state.mode !== "inspect" || !hovered) return;
      posHover(e, dir);
    },
    true,
  );
  doc.addEventListener(
    "click",
    (e) => {
      if (state.mode !== "inspect") return;
      e.preventDefault();
      e.stopPropagation();
      const t = e.target as Element | null;
      if (!t || t === doc.body || t === doc.documentElement) return;
      const shell = ctx.shells[dir];
      if (shell) ctx.active = shell.el;
      addAnnotation(t);
    },
    true,
  );
  // pointer leaving the iframe content shouldn't leave a stuck label
  doc.documentElement.addEventListener("mouseleave", hideHover);
}

/** (Re)draw the numbered badges + selection outline inside a document. */
export function reapply(doc: Document | null): void {
  if (!doc) return;
  doc.querySelectorAll(".__pp-tagged, .__pp-selected").forEach((el) => {
    el.classList.remove("__pp-tagged", "__pp-selected");
    el.removeAttribute("data-pp-num");
  });
  state.annotations.forEach((a, i) => {
    try {
      const found = doc.querySelectorAll(a.selector);
      const el = found[0];
      if (el) {
        el.classList.add("__pp-tagged");
        el.setAttribute("data-pp-num", (i + 1).toString());
        if (state.selectedId === a.id) el.classList.add("__pp-selected");
      }
    } catch {
      /* invalid selector — skip */
    }
  });
}

export function reapplyActive(): void {
  reapply(activeDoc());
}

export function scrollToElement(selector: string): void {
  const doc = activeDoc();
  if (!doc) return;
  try {
    doc.querySelector(selector)?.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
    /* invalid selector — ignore */
  }
}
