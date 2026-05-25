import { loadPersisted } from "./state";
import { CFG } from "./config";
import { buildShells, switchTo } from "./shell";
import { applyTheme } from "./theme";
import { startHeartbeat } from "./finalize";
import { hideHover } from "./hover";
import { initDialog } from "./dialog";
import { initKeyboard } from "./keyboard";

/* Boot the annotator. */
// Name the tab after the file so concurrent reviews are distinguishable.
document.title = (CFG.fileName && CFG.fileName !== "(unknown)" ? CFG.fileName + " — " : "") + "Pinpoint";
window.addEventListener("blur", hideHover);
initDialog();
loadPersisted();
buildShells();
applyTheme();
switchTo("a");
startHeartbeat();
initKeyboard();
