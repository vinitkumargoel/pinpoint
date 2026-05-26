import { state } from "./state";
import { activeMode } from "./mode/active";

/** Build the Markdown brief handed back to Claude Code on "Send Feedback". */
export function buildBrief(): string {
  const items = state.annotations.filter((a) => a.comment.trim() !== "");
  return activeMode().buildBrief(items);
}
