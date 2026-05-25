import type { Annotation } from "./types";
import { state, ctx, persist } from "./state";
import { getSelector, shortOuter } from "./selector";
import { reapplyActive } from "./iframe";
import { render } from "./sidebar";
import { updateFinalizeButtons } from "./dom";
import { confirmDialog, toast } from "./dialog";

/** Create an annotation for a clicked element and focus its comment box. */
export function addAnnotation(el: Element): void {
  // Drop any earlier annotation the user started but left blank before
  // beginning a new one — an annotation only exists once it has a comment.
  pruneEmpty();
  const annot: Annotation = {
    id: "a_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    selector: getSelector(el),
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || "").trim().slice(0, 120),
    outerHTML: shortOuter(el),
    comment: "",
    createdAt: new Date().toISOString(),
  };
  state.annotations.push(annot);
  state.selectedId = annot.id;
  persist();
  reapplyActive();
  render();
  setTimeout(() => {
    const ta = ctx.active?.querySelector<HTMLTextAreaElement>(`.annot[data-id="${annot.id}"] textarea`);
    if (ta) {
      ta.focus();
      ta.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, 60);
}

export function deleteAnnot(id: string): void {
  state.annotations = state.annotations.filter((a) => a.id !== id);
  if (state.selectedId === id) state.selectedId = null;
  persist();
  reapplyActive();
  render();
}

/**
 * Remove every annotation whose comment is still blank. Empty annotations are
 * transient (a click that never got a comment) and never reach the brief.
 */
export function pruneEmpty(): boolean {
  const before = state.annotations.length;
  state.annotations = state.annotations.filter((a) => a.comment.trim() !== "");
  if (state.annotations.length === before) return false;
  if (!state.annotations.some((a) => a.id === state.selectedId)) state.selectedId = null;
  persist();
  return true;
}

export async function requestDeleteAnnot(id: string): Promise<void> {
  if (!state.annotations.some((a) => a.id === id)) return; // already gone (e.g. pruned)
  const ok = await confirmDialog({
    title: "Delete annotation",
    message: "This annotation will be removed. This can’t be undone.",
    confirmLabel: "Delete",
    danger: true,
  });
  if (ok) {
    deleteAnnot(id);
    toast("Annotation deleted");
  }
}

export function updateComment(id: string, text: string): void {
  const a = state.annotations.find((x) => x.id === id);
  if (a) {
    a.comment = text;
    persist();
    // Typing the first comment flips Approve → Send (and clearing it flips back),
    // without a full re-render that would steal textarea focus.
    updateFinalizeButtons();
  }
}
