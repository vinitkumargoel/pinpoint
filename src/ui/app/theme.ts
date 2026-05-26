import { state, persist, ctx } from "./state";
import { CFG } from "./config";

/** Apply the current theme to the document and refresh the toggle's icon/title. */
export function applyTheme(): void {
  document.body.dataset.theme = state.theme;
  document.querySelectorAll<HTMLElement>('[data-role="theme-icon"]').forEach((el) => {
    el.textContent = state.theme === "dark" ? "☀️" : "🌙"; // sun / moon
  });
  document.querySelectorAll<HTMLElement>('[data-role="theme-toggle"]').forEach((b) => {
    b.title = state.theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  });
  if (CFG.kind === "review") broadcastThemeToFrames();
}

/** Push the current theme into every review iframe so its diff swaps colors with the app. */
export function broadcastThemeToFrames(): void {
  Object.values(ctx.shells).forEach((shell) => {
    try {
      shell.iframe.contentWindow?.postMessage({ type: "review:theme", value: state.theme }, "*");
    } catch {
      /* ignore */
    }
  });
}

export function toggleTheme(): void {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  persist();
}
