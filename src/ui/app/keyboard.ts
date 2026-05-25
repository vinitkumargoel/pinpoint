import { state } from "./state";
import { setMode, clearAll } from "./shell";
import { toggleTheme } from "./theme";
import { onSend, onApprove } from "./finalize";
import { hasFeedback, q } from "./dom";
import { scrollToElement } from "./iframe";
import { render } from "./sidebar";

const SC = "shortcuts-visible";

export function initKeyboard(): void {
  document.addEventListener("keydown", onKD);
  document.addEventListener("keyup", onKU);
  // If user ⌘-tabs away while holding Meta, clear the overlay
  window.addEventListener("blur", () => document.body.classList.remove(SC));
}

function isEditing(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && el.type !== "checkbox" && el.type !== "radio")
  );
}

function onKD(e: KeyboardEvent): void {
  // Show HUD while ⌘ is held
  if (e.key === "Meta") {
    document.body.classList.add(SC);
    return;
  }

  // ⌘↵ → primary action (Send Feedback if there's content, else Approve)
  if (e.key === "Enter" && e.metaKey) {
    e.preventDefault();
    if (hasFeedback()) void onSend();
    else void onApprove();
    return;
  }

  // ⌘⇧X → clear all annotations
  if ((e.key === "x" || e.key === "X") && e.metaKey && e.shiftKey) {
    e.preventDefault();
    void clearAll();
    return;
  }

  // Single-key shortcuts are suppressed while the user is typing
  if (isEditing()) return;

  switch (e.key.toLowerCase()) {
    case "i":
      setMode("inspect");
      break;
    case "b":
      setMode("browse");
      break;
    case "t":
      toggleTheme();
      break;
    // G/N → focus the global page-wide note (quick comment without leaving Browse mode)
    case "g":
    case "n": {
      const ta = q("global-comment") as HTMLTextAreaElement | null;
      if (ta) {
        ta.focus();
        const l = ta.value.length;
        ta.setSelectionRange(l, l);
      }
      break;
    }
    case "escape":
      if (state.selectedId) {
        state.selectedId = null;
        render();
      }
      break;
    default: {
      // 1–9 → jump to nth annotation
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) {
        const a = state.annotations[n - 1];
        if (a) {
          state.selectedId = a.id;
          render();
          scrollToElement(a.selector);
        }
      }
    }
  }
}

function onKU(e: KeyboardEvent): void {
  if (e.key === "Meta") document.body.classList.remove(SC);
}
