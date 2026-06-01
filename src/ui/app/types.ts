/** A single element-anchored comment. */
export interface Annotation {
  id: string;
  selector: string;
  tag: string;
  text: string;
  outerHTML: string;
  comment: string;
  createdAt: string;
  /** Code-review extras — populated only when the annotated element is a diff line row. */
  review?: ReviewAnchor;
}

/** Where in the working tree a diff-line annotation points. */
export interface ReviewAnchor {
  file: string;
  /** All lines in the range, in document order. Length ≥ 1 for a single-line annotation. */
  lines: ReviewAnchorLine[];
  /** data-line-key for each line — used by the iframe overlay to tag every view-copy. */
  lineKeys: string[];
}

export interface ReviewAnchorLine {
  oldLine: number | null;
  newLine: number | null;
  kind: "add" | "del" | "ctx";
  text: string;
}

import type { AskSpec } from "../../ask-spec.ts";

export type Mode = "inspect" | "browse";
export type Theme = "light" | "dark";

export type SessionKind = "file" | "review" | "ask";

/** Header meta surfaced in the review shell's toolbar. */
export interface ReviewMeta {
  branch: string;
  fileCount: number;
  added: number;
  deleted: number;
  untrackedCount: number;
  files: ReviewFile[];
}

/** One file in the review, used by the outer file-rail. */
export interface ReviewFile {
  /** DOM id of the corresponding `<section class="file">` inside the iframe. */
  id: string;
  /** Path relative to the repo root (post-rename if renamed). */
  path: string;
  added: number;
  deleted: number;
}

/** The whole app's state (mirrored into sessionStorage). */
export interface AppState {
  globalComment: string;
  annotations: Annotation[];
  selectedId: string | null;
  mode: Mode;
  theme: Theme;
}

/** One review surface: its chrome element + the iframe rendering the user's file. */
export interface Shell {
  el: HTMLElement;
  iframe: HTMLIFrameElement;
}

/** Config injected by the server into `window.__PINPOINT__`. */
export interface PinpointConfig {
  filePath: string;
  fileName: string;
  targetUrl: string;
  apiBase: string;
  kind: SessionKind;
  meta?: ReviewMeta;
  /**
   * True when the target file looks like an interactive app (module/external/
   * `text/babel` scripts, or a substantial inline script) rather than a static
   * mockup. When set, the file shell boots in Browse mode so clicks drive the
   * page instead of being captured as annotations, and a hint bar is shown.
   */
  interactive?: boolean;
  /** The question spec for `kind === "ask"`. */
  askSpec?: AskSpec;
}

/** In-iframe badge/highlight styling (kept independent of the app theme). */
export interface DirStyle {
  accent: string;
  tint: string;
  badgeText: string;
  badgeRadius: string;
  badgePre?: string;
  badgeSuf?: string;
}

export type FinalizeAction = "feedback" | "approve";
export interface FinalizePayload {
  action: FinalizeAction;
  brief?: string;
}
