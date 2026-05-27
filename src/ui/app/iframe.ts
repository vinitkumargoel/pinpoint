import { ctx, state } from "./state";
import { CFG, DIRS } from "./config";
import { activeDoc } from "./dom";
import { showHover, posHover, hideHover } from "./hover";
import { addAnnotation, addReviewRangeAnnotation } from "./annotations";
import { render } from "./sidebar";
import { broadcastThemeToFrames } from "./theme";
import { subscribeReviewMessages, viewMsg } from "../../review-protocol.ts";

const VIEW_LS_KEY = "pinpoint:review:view";

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
  if (CFG.kind === "review") {
    // No crosshair body class, no click-to-annotate handler — the diff page
    // owns the interaction (hover line → `+` button → click or drag).
    reapply(doc);
    syncReviewViewToFrame(shell.iframe);
    broadcastThemeToFrames();
  } else {
    attachHandlers(doc, dir);
    doc.body.classList.toggle("__pp-inspect", state.mode === "inspect");
    reapply(doc);
  }
  if (ctx.active && ctx.active.dataset.dir === dir) render();
}

/**
 * Listen for the diff page's `review:annotate` postMessages and turn each into
 * an Annotation. Registered once at boot; safe to call multiple times.
 */
let reviewListenerInstalled = false;
export function installReviewMessageListener(): void {
  if (reviewListenerInstalled) return;
  reviewListenerInstalled = true;
  subscribeReviewMessages(window, (msg) => {
    if (msg.type !== "review:annotate") return;
    const { payload } = msg;
    if (!payload.file || !payload.lines.length) return;
    addReviewRangeAnnotation(payload);
  });
}

/**
 * After the diff iframe loads, push the user's saved view preference (split/unified)
 * — the iframe boots with its hardcoded default, which may not match what we stored.
 */
function syncReviewViewToFrame(iframe: HTMLIFrameElement): void {
  let v: "split" | "unified" = "unified";
  try {
    const saved = localStorage.getItem(VIEW_LS_KEY);
    if (saved === "split" || saved === "unified") v = saved;
  } catch {
    /* ignore */
  }
  iframe.contentWindow?.postMessage(viewMsg(v), "*");
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
  // Treat review ranges (multi-line annotations) differently from element-anchored
  // file annotations: ranges already span N rows, so the heavy dashed-outline +
  // solid-selected-outline of the file annotator stacks into a wall of black
  // borders. For ranges we use a subtle inset left bar + tint, and skip the per-
  // line outline.
  style.textContent = `
    .__pp-hover { outline: 2px solid ${c.accent} !important; outline-offset: -2px !important; cursor: crosshair !important; background-color: ${c.tint} !important; }
    .__pp-tagged:not(.__pp-range) { outline: 2px dashed ${c.accent} !important; outline-offset: -2px !important; position: relative !important; }
    .__pp-tagged.__pp-range { position: relative !important; }
    .__pp-tagged::before {
      content: "${pre}" attr(data-pp-num) "${suf}" !important;
      position: absolute !important; top: 50% !important; left: 24px !important;
      transform: translateY(-50%) !important;
      min-width: 20px !important; height: 20px !important; padding: 0 5px !important;
      background: ${c.accent} !important; color: ${c.badgeText} !important;
      font: 700 11px/20px ui-monospace, monospace !important;
      border-radius: ${c.badgeRadius} !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      z-index: 99999 !important; box-shadow: 0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,0.28) !important;
      pointer-events: none !important;
    }
    .__pp-selected:not(.__pp-range) { outline: 3px solid ${c.accent} !important; outline-offset: -3px !important; }
    /* Multi-line ranges: left-edge marker + soft background tint per line. No
       per-line top/bottom/right border — that stacks into a wall of bars on
       adjacent lines. Selection just deepens the tint. */
    .__pp-range {
      box-shadow: inset 3px 0 0 ${c.accent} !important;
      background-image: linear-gradient(0deg, ${c.tint}, ${c.tint}) !important;
    }
    .__pp-range.__pp-selected {
      background-image: linear-gradient(0deg, rgba(24,24,27,0.12), rgba(24,24,27,0.12)) !important;
    }
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
  doc.querySelectorAll(".__pp-tagged, .__pp-selected, .__pp-range").forEach((el) => {
    el.classList.remove("__pp-tagged", "__pp-selected", "__pp-range");
    el.removeAttribute("data-pp-num");
  });
  state.annotations.forEach((a, i) => {
    const keys = a.review?.lineKeys ?? null;
    if (keys && keys.length) {
      // Review annotation: tag every matching line variant (split + unified copies).
      const all: Element[] = [];
      for (const k of keys) {
        doc.querySelectorAll(`[data-line-key="${cssAttr(k)}"]`).forEach((el) => all.push(el));
      }
      if (!all.length) return;
      all.forEach((el) => {
        el.classList.add("__pp-range");
        if (state.selectedId === a.id) el.classList.add("__pp-selected");
      });
      // Badge sits on the first line of the range only (per view).
      for (const k of keys.slice(0, 1)) {
        doc.querySelectorAll(`[data-line-key="${cssAttr(k)}"]`).forEach((el) => {
          el.classList.add("__pp-tagged");
          el.setAttribute("data-pp-num", (i + 1).toString());
        });
      }
      return;
    }
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

function cssAttr(s: string): string {
  return s.replace(/"/g, '\\"');
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
