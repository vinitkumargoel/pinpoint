import type { Annotation, ReviewAnchor, ReviewAnchorLine } from "./types";
import { state, ctx, persist } from "./state";
import { getSelector, shortOuter } from "./selector";
import { reapplyActive } from "./iframe";
import { render } from "./sidebar";
import { updateFinalizeButtons } from "./dom";
import { confirmDialog, toast } from "./dialog";
import type { AnnotatePayload } from "../../review-protocol.ts";

/**
 * Create an annotation for a clicked element. Only wired in file mode — review
 * mode never calls this, because the diff page emits ranges via postMessage
 * instead (see `addReviewRangeAnnotation`).
 */
export function addAnnotation(el: Element): void {
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

/**
 * Create a review annotation from a range posted by the diff iframe.
 *
 * The payload shape is defined by `review-protocol`; both the iframe runtime
 * and this consumer import the same `AnnotatePayload` type so the postMessage
 * boundary is type-safe end-to-end.
 */
export function addReviewRangeAnnotation(payload: AnnotatePayload): void {
  if (!payload.lines.length) return;
  pruneEmpty();

  const lines: ReviewAnchorLine[] = payload.lines.map((l) => ({
    oldLine: l.oldLine,
    newLine: l.newLine,
    kind: l.kind,
    text: l.text,
  }));
  const review: ReviewAnchor = {
    file: payload.file,
    lines,
    lineKeys: [...payload.lineKeys],
  };

  // Anchor selector on the first line so the existing file-shell engine can
  // still locate something even in fallback paths; reapply uses lineKeys.
  const firstKey = payload.lineKeys[0]!;
  const selector = `[data-line-key="${firstKey.replace(/"/g, '\\"')}"]`;
  const firstLine = lines[0]!;
  const sign = firstLine.kind === "add" ? "+" : firstLine.kind === "del" ? "-" : " ";
  const annot: Annotation = {
    id: "a_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    selector,
    tag: "div",
    text: (sign + firstLine.text).slice(0, 120),
    outerHTML: lines
      .map((l) => (l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ") + l.text)
      .join("\n"),
    comment: "",
    createdAt: new Date().toISOString(),
    review,
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
    updateFinalizeButtons();
  }
}
