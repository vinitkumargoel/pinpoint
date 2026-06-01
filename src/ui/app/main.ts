import { loadPersisted, state } from "./state";
import { CFG } from "./config";
import { buildShells, switchTo } from "./shell";
import { applyTheme } from "./theme";
import { startHeartbeat } from "./finalize";
import { hideHover } from "./hover";
import { initDialog } from "./dialog";
import { initKeyboard } from "./keyboard";
import { setActiveMode } from "./mode/active";
import { FileMode } from "./mode/file";
import { ReviewMode } from "./mode/review";

/*
 * Boot the annotator.
 *
 * The CFG.kind discriminator is read exactly once here — to register the
 * active Mode. From here on every consumer routes through `activeMode()`;
 * no other module branches on CFG.kind for chrome / sidebar / brief / keyboard.
 */
const mode = CFG.kind === "review" ? ReviewMode : FileMode;
setActiveMode(mode);

const titlePrefix = mode.titlePrefix();
document.title = (titlePrefix ? titlePrefix + " — " : "") + "Pinpoint";
window.addEventListener("blur", hideHover);
initDialog();
loadPersisted();
// Interactive file targets start in Browse so the page is usable on open; the
// user switches to Inspect (I / toggle) when they want to leave annotations.
if (CFG.kind === "file" && CFG.interactive) state.mode = "browse";
buildShells({ chromeHtml: mode.chrome(), shellClass: mode.shellClass() });
applyTheme();
switchTo("a");
startHeartbeat();
initKeyboard();
mode.onBoot();
