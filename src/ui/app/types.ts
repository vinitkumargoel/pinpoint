/** A single element-anchored comment. */
export interface Annotation {
  id: string;
  selector: string;
  tag: string;
  text: string;
  outerHTML: string;
  comment: string;
  createdAt: string;
}

export type Mode = "inspect" | "browse";
export type Theme = "light" | "dark";

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
