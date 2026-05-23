import { ctx } from "./state";

/** Find a `[data-role]` element inside the active shell. */
export function q(role: string): HTMLElement | null {
  return ctx.active ? ctx.active.querySelector<HTMLElement>(`[data-role="${role}"]`) : null;
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
