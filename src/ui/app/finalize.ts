import type { FinalizePayload } from "./types";
import { state } from "./state";
import { CFG } from "./config";
import { buildBrief } from "./brief";
import { render } from "./sidebar";
import { pruneEmpty } from "./annotations";
import { confirmDialog, toast } from "./dialog";
import { hideHover } from "./hover";

/** POST the result to the local server, which prints it to stdout and resumes Claude. */
async function postFinalize(payload: FinalizePayload): Promise<boolean> {
  try {
    await fetch(CFG.apiBase + "/finalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    return true;
  } catch {
    return false;
  }
}

let finalized = false;

export async function onSend(): Promise<void> {
  if (finalized) return;
  pruneEmpty();
  render();
  if (!state.annotations.length && !state.globalComment.trim()) {
    toast("Nothing to send yet — add a note or annotate an element");
    return;
  }
  finalized = true;
  const brief = buildBrief();
  stopHeartbeat();
  const ok = await postFinalize({ action: "feedback", brief });
  showDone("feedback", ok);
}

export async function onApprove(): Promise<void> {
  if (finalized) return;
  pruneEmpty();
  render();
  const count = state.annotations.length;
  if (count || state.globalComment.trim()) {
    const ok = await confirmDialog({
      title: "Approve anyway?",
      message: `You have ${count} annotation${count === 1 ? "" : "s"} that won’t be sent. Approve with no feedback?`,
      confirmLabel: "Approve anyway",
    });
    if (!ok) return;
  }
  finalized = true;
  stopHeartbeat();
  const ok = await postFinalize({ action: "approve" });
  showDone("approve", ok);
}

function showDone(kind: "approve" | "feedback", ok: boolean): void {
  hideHover();
  const title = document.getElementById("done-title");
  const msg = document.getElementById("done-msg");
  if (!title || !msg) return;
  if (kind === "approve") {
    title.textContent = "Approved";
    msg.textContent = "No changes requested. You can close this tab and return to Claude Code.";
  } else {
    title.textContent = "Feedback sent";
    msg.textContent = "Your annotations are on their way to Claude Code. You can close this tab.";
  }
  if (!ok) {
    msg.textContent = "The review session has ended. You can close this tab and return to Claude Code.";
  }
  document.getElementById("done")?.classList.add("show");
}

/* ---- heartbeat: lets the CLI tell a reload (brief gap) from a tab close ---- */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
export function startHeartbeat(): void {
  const ping = () => {
    fetch(CFG.apiBase + "/heartbeat", { method: "POST", keepalive: true }).catch(() => {});
  };
  ping();
  heartbeatTimer = setInterval(ping, 1000);
}
export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
