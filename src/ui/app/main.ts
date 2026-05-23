import { loadPersisted } from "./state";
import { buildShells, switchTo } from "./shell";
import { applyTheme } from "./theme";
import { startHeartbeat } from "./finalize";
import { hideHover } from "./hover";
import { initDialog } from "./dialog";

/* Boot the annotator. */
window.addEventListener("blur", hideHover);
initDialog();
loadPersisted();
buildShells();
applyTheme();
switchTo("a");
startHeartbeat();
