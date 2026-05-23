import { hideHover } from "./hover";

/* ---- toast ---------------------------------------------------------------- */
let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(msg: string, ms = 1900): void {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---- themed confirm dialog (replaces native confirm) ---------------------- */
interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

let confirmResolver: ((result: boolean) => void) | null = null;

export function confirmDialog({
  title = "Confirm",
  message = "",
  confirmLabel = "Confirm",
  danger = false,
}: ConfirmOptions = {}): Promise<boolean> {
  hideHover();
  const modal = document.getElementById("confirm-modal");
  const ok = document.getElementById("confirm-ok");
  const titleEl = document.getElementById("confirm-title");
  const msgEl = document.getElementById("confirm-msg");
  if (!modal || !ok || !titleEl || !msgEl) return Promise.resolve(false);
  titleEl.textContent = title;
  msgEl.textContent = message;
  ok.textContent = confirmLabel;
  ok.classList.toggle("danger-btn", danger);
  modal.classList.add("show");
  setTimeout(() => ok.focus(), 30);
  return new Promise((res) => {
    confirmResolver = res;
  });
}

function closeConfirm(result: boolean): void {
  document.getElementById("confirm-modal")?.classList.remove("show");
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
}

/** Wire the confirm dialog's buttons + overlay + Escape. Call once on boot. */
export function initDialog(): void {
  const modal = document.getElementById("confirm-modal");
  document.getElementById("confirm-ok")?.addEventListener("click", () => closeConfirm(true));
  document.getElementById("confirm-cancel")?.addEventListener("click", () => closeConfirm(false));
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeConfirm(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.classList.contains("show")) closeConfirm(false);
  });
}
