import { state, persist } from "./state";

/** Apply the current theme to the document and refresh the toggle's icon/title. */
export function applyTheme(): void {
  document.body.dataset.theme = state.theme;
  document.querySelectorAll<HTMLElement>('[data-role="theme-icon"]').forEach((el) => {
    el.textContent = state.theme === "dark" ? "☀️" : "🌙"; // sun / moon
  });
  document.querySelectorAll<HTMLElement>('[data-role="theme-toggle"]').forEach((b) => {
    b.title = state.theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  });
}

export function toggleTheme(): void {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  persist();
}
