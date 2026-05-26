import { loadPersisted } from "./state";
import { CFG } from "./config";
import { buildShells, switchTo } from "./shell";
import { applyTheme } from "./theme";
import { startHeartbeat } from "./finalize";
import { hideHover } from "./hover";
import { initDialog } from "./dialog";
import { initKeyboard } from "./keyboard";
import { installReviewMessageListener } from "./iframe";

/* Boot the annotator. */
const titleHead = CFG.kind === "review" ? "Review" : CFG.fileName && CFG.fileName !== "(unknown)" ? CFG.fileName : "";
document.title = (titleHead ? titleHead + " — " : "") + "Pinpoint";
window.addEventListener("blur", hideHover);
initDialog();
loadPersisted();
if (CFG.kind === "review") installReviewMessageListener();
buildShells();
applyTheme();
switchTo("a");
startHeartbeat();
initKeyboard();
