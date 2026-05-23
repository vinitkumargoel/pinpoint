import type { PinpointConfig, DirStyle } from "./types";

declare global {
  interface Window {
    __PINPOINT__?: PinpointConfig;
  }
}

/**
 * Server-injected config. `window.__PINPOINT__` is written into the page by
 * src/server.ts before `</head>`; the fallback keeps the app runnable standalone.
 */
export const CFG: PinpointConfig = window.__PINPOINT__ ?? {
  filePath: "(unknown)",
  fileName: "(unknown)",
  targetUrl: "about:blank",
  apiBase: "/__pinpoint",
};

export const SS_KEY = "pinpoint:comments"; // sessionStorage — annotations & comments
export const THEME_KEY = "pinpoint:theme"; // localStorage — theme preference only

/**
 * In-iframe badge styling — fixed (independent of the app theme) so badges stay
 * visible on the user's mockup, which is usually a light page. Keyed by shell id
 * to keep room for multiple review surfaces later.
 */
export const DIRS: Record<string, DirStyle> = {
  a: { accent: "#18181b", tint: "rgba(24,24,27,0.06)", badgeText: "#fff", badgeRadius: "3px" },
};
