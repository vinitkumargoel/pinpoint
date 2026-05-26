/**
 * Review-mode postMessage protocol — the contract between the annotator chrome
 * (parent window) and the diff page (iframed).
 *
 * Before this Module existed, the protocol was nine magic-string sites across
 * four files: `shell.ts`, `iframe.ts`, `theme.ts`, and the diff-runtime IIFE.
 * Each producer typed its own payload inline, and a typo on one side could not
 * be caught by the compiler. Now both halves import from here: producers call
 * constructor helpers, consumers register a typed subscriber. Type narrowing
 * does the work the convention used to.
 *
 * Boundary discipline: this Module is pure data + helpers. It must not touch
 * the DOM, `window`, or any annotator/runtime state — both bundles import it,
 * including the iframe runtime which runs in its own context.
 */

export type View = "split" | "unified";
export type Theme = "light" | "dark";
export type JumpTarget = "file" | "change";
export type JumpDir = 1 | -1;
export type LineKind = "add" | "del" | "ctx";

export interface AnnotatedLine {
  lineKey: string;
  oldLine: number | null;
  newLine: number | null;
  kind: LineKind;
  text: string;
}

export interface AnnotatePayload {
  file: string;
  /** Canonical line keys for every line in the range, in ascending document order. */
  lineKeys: string[];
  lines: AnnotatedLine[];
}

/** Every message that may travel either direction across the review iframe boundary. */
export type ReviewMessage =
  | { type: "review:view"; value: View }
  | { type: "review:theme"; value: Theme }
  | { type: "review:jump"; target: JumpTarget; dir: JumpDir }
  | { type: "review:expand-all" }
  | { type: "review:collapse-all" }
  | { type: "review:scroll-to-file"; id: string }
  | { type: "review:annotate"; payload: AnnotatePayload };

// ---------- Constructors (producers always go through these) -----------------

export const viewMsg = (value: View): ReviewMessage => ({ type: "review:view", value });
export const themeMsg = (value: Theme): ReviewMessage => ({ type: "review:theme", value });
export const jumpMsg = (target: JumpTarget, dir: JumpDir): ReviewMessage => ({ type: "review:jump", target, dir });
export const expandAllMsg = (): ReviewMessage => ({ type: "review:expand-all" });
export const collapseAllMsg = (): ReviewMessage => ({ type: "review:collapse-all" });
export const scrollToFileMsg = (id: string): ReviewMessage => ({ type: "review:scroll-to-file", id });
export const annotateMsg = (payload: AnnotatePayload): ReviewMessage => ({ type: "review:annotate", payload });

// ---------- Receivers (consumers always go through these) --------------------

/** Type guard — narrows an arbitrary postMessage event payload to a known message. */
export function isReviewMessage(v: unknown): v is ReviewMessage {
  if (!v || typeof v !== "object") return false;
  const o = v as { type?: unknown };
  return typeof o.type === "string" && o.type.startsWith("review:");
}

/** Wire a handler that will only fire for well-formed review messages. Returns an unsubscribe. */
export function subscribeReviewMessages(
  win: Window,
  handler: (msg: ReviewMessage) => void,
): () => void {
  const listener = (e: MessageEvent): void => {
    if (isReviewMessage(e.data)) handler(e.data);
  };
  win.addEventListener("message", listener);
  return () => win.removeEventListener("message", listener);
}
