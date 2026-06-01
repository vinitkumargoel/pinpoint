/**
 * Boot path for `kind === "ask"`. Fully independent of the annotate/review
 * machinery: no shells, no iframe, no annotations — just the question flow,
 * reusing the shared theme + heartbeat + finalize plumbing.
 */
import { CFG } from "../config.ts";
import { loadPersisted } from "../state.ts";
import { applyTheme } from "../theme.ts";
import { startHeartbeat } from "../finalize.ts";
import { resetAsk } from "./state.ts";
import { renderAsk } from "./view.ts";

export function bootAsk(): void {
  const root = document.getElementById("shells");
  if (!root) return;

  const spec = CFG.askSpec;
  if (!spec || !Array.isArray(spec.questions) || spec.questions.length === 0) {
    root.innerHTML =
      '<div class="ask-root"><div class="ask-win"><div class="ask-main">' +
      '<div class="ask-q"><div class="ask-title">No question to show.</div>' +
      '<div class="ask-ctx">Pinpoint Ask was opened without a valid question spec.</div></div>' +
      "</div></div></div>";
    return;
  }

  document.title = (spec.title ? spec.title + " — " : "") + "Pinpoint Ask";
  loadPersisted(); // restores the theme preference (annotation data is ignored here)
  resetAsk(spec);
  renderAsk(root);
  applyTheme();
  startHeartbeat();
}
