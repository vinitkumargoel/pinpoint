/**
 * Review **mode** — the seam between the two flavours of the Pinpoint
 * annotator: the file/Markdown reviewer (FileMode) and the git-diff reviewer
 * (ReviewMode).
 *
 * Before this Module existed, `CFG.kind === "review"` was a runtime
 * discriminator checked in 17 places across 8 modules — including a literal
 * no-op ternary in `sidebar.ts` where I added a discriminator for both arms
 * out of habit. Lifting the branches into two **Adapter**s concentrates each
 * mode's identity (chrome HTML, sidebar card format, brief format, title,
 * keyboard extras, boot side-effects) in one file each, and callers stop
 * needing to know which mode is active.
 *
 * The interface stays narrow on purpose. A few branches (iframe overlay
 * wiring, theme broadcast, annotation entry-path guards) live in their
 * original modules because lifting them would require breaking import cycles
 * — not worth the surface area for the modest locality win.
 */
import type { Annotation } from "../types";

export interface Mode {
  /** Inline HTML for the entire shell's chrome (toolbar + sidebar). Called once at boot. */
  chrome(): string;
  /** Extra class added to `.shell` for mode-specific layout (e.g. "shell-review"). */
  shellClass(): string;
  /** Markdown for the sidebar card's reference block — the chunk above the textarea. */
  formatSidebarRef(a: Annotation): string;
  /** The brief returned on Send Feedback. Receives only annotations with non-empty comments. */
  buildBrief(items: Annotation[]): string;
  /** Document-title prefix (before " — Pinpoint"). */
  titlePrefix(): string;
  /**
   * Boot-time side-effects: install message listeners, restore persisted prefs,
   * wire keyboard listeners that don't fit `handleKey`. Called from `main.ts`
   * after the shell is built and shown.
   */
  onBoot(): void;
  /**
   * Mode-specific keyboard handler. Return `true` if the key was consumed; the
   * keyboard module's common-key path then short-circuits.
   */
  handleKey(e: KeyboardEvent): boolean;
}
