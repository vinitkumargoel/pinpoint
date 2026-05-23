import type { AppState, Shell, Theme } from "./types";
import { SS_KEY, THEME_KEY } from "./config";

/** Single source of truth for the session. */
export const state: AppState = {
  globalComment: "",
  annotations: [],
  selectedId: null,
  mode: "inspect",
  theme: "light",
};

/** Live runtime references shared across modules (the active shell + registry). */
export const ctx: { active: HTMLElement | null; shells: Record<string, Shell> } = {
  active: null,
  shells: {},
};

/** Mirror annotations/comments to sessionStorage and the theme to localStorage. */
export function persist(): void {
  try {
    sessionStorage.setItem(
      SS_KEY,
      JSON.stringify({ globalComment: state.globalComment, annotations: state.annotations }),
    );
  } catch {
    /* storage unavailable — best effort */
  }
  try {
    localStorage.setItem(THEME_KEY, state.theme);
  } catch {
    /* ignore */
  }
}

/** Restore a prior session (survives a page reload; cleared when the tab closes). */
export function loadPersisted(): void {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<AppState>;
      state.globalComment = d.globalComment ?? "";
      state.annotations = Array.isArray(d.annotations) ? d.annotations : [];
    }
  } catch {
    /* ignore malformed storage */
  }
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") state.theme = t as Theme;
  } catch {
    /* ignore */
  }
}
