import { ctx, state } from "./state";

/** Find a `[data-role]` element inside the active shell. */
export function q(role: string): HTMLElement | null {
  return ctx.active ? ctx.active.querySelector<HTMLElement>(`[data-role="${role}"]`) : null;
}

/** Is there anything worth sending — a page-wide note or any commented annotation? */
export function hasFeedback(): boolean {
  return state.globalComment.trim() !== "" || state.annotations.some((a) => a.comment.trim() !== "");
}

/**
 * The two finalize buttons are mutually exclusive: with no feedback yet, only
 * "Approve" shows; the moment any comment exists, "Approve" hides and only
 * "Send Feedback" shows. Whichever is visible is styled as the primary action.
 * Cheap enough to call on every keystroke.
 */
export function updateFinalizeButtons(): void {
  const send = q("finalize-send");
  const approve = q("finalize-approve");
  if (!send || !approve) return;
  const fb = hasFeedback();
  send.style.display = fb ? "" : "none";
  approve.style.display = fb ? "none" : "";
  approve.classList.toggle("primary", !fb);
}

/** The document of the active shell's iframe (the user's rendered file), if loaded. */
export function activeDoc(): Document | null {
  if (!ctx.active) return null;
  const dir = ctx.active.dataset.dir;
  if (!dir) return null;
  return ctx.shells[dir]?.iframe.contentDocument ?? null;
}

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch);
}

/**
 * Does this annotation's selector still resolve in the rendered page?
 * Returns true while the doc is still loading (don't flag prematurely).
 */
export function elementExists(doc: Document | null, selector: string): boolean {
  if (!doc) return true;
  try {
    return !!doc.querySelector(selector);
  } catch {
    return false;
  }
}
