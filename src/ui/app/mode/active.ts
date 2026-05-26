/**
 * Registry for the active **Mode**.
 *
 * Set exactly once from `main.ts` at boot, based on `CFG.kind`. Other modules
 * call `activeMode()` to dispatch — `sidebar.ts`, `brief.ts`, `keyboard.ts`.
 *
 * We use a setter + getter (instead of a `const` computed at import time) to
 * break the import cycle: `ReviewMode → shell.ts → sidebar.ts → activeMode`.
 * Top-level imports of the concrete adapters live in `main.ts` only.
 */
import type { Mode } from "./index";

let _mode: Mode | null = null;

export function setActiveMode(m: Mode): void {
  _mode = m;
}

export function activeMode(): Mode {
  if (!_mode) throw new Error("Mode not initialized — main.ts must call setActiveMode() first");
  return _mode;
}
