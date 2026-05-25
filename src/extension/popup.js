import { ExtensionSessionMachine } from "./state.js";

// The side panel cannot reliably use chrome.tabs / chrome.scripting, so every
// privileged operation is delegated to the background service worker over messaging.
async function bg(type, params = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...params });
  if (!res?.ok) throw new Error(res?.error || "background_unavailable");
  return res.result;
}

const machine = new ExtensionSessionMachine({
  // discover / connect / finalize stay here: they're plain fetch() calls to the
  // local server, which the side panel can make via host_permissions.
  activate: () => bg("pinpoint-activate"),
  deactivate: (tabId) => bg("pinpoint-deactivate", { tabId }),
  setMode: (tabId, mode) => bg("pinpoint-set-mode", { tabId, mode }),
  getContentState: (tabId) => bg("pinpoint-get-state", { tabId }),
  getPageMetadata: (tabId) => bg("pinpoint-page-metadata", { tabId }),
  captureScreenshot: (tabId) => bg("pinpoint-screenshot", { tabId }),
  captureAnnotationScreenshot: (tabId, id) => bg("pinpoint-screenshot-annotation", { tabId, id }),
  updateComment: (tabId, id, comment) => bg("pinpoint-update-comment", { tabId, id, comment }),
  deleteAnnotation: (tabId, id) => bg("pinpoint-delete", { tabId, id }),
  clearAnnotations: (tabId) => bg("pinpoint-clear", { tabId }),
  locateAnnotation: (tabId, id) => bg("pinpoint-locate", { tabId, id }),
});

const shell = document.querySelector("[data-shell]");
const startButton = document.querySelector("[data-start]");
const retryButton = document.querySelector("[data-retry]");
const stopButton = document.querySelector("[data-stop]");
const statusDot = document.querySelector("[data-status-dot]");
const statusLabel = document.querySelector("[data-status-label]");
const statusMessage = document.querySelector("[data-status-message]");
const sessionPanel = document.querySelector("[data-session-panel]");
const sessionId = document.querySelector("[data-session-id]");
const modePanel = document.querySelector("[data-mode-panel]");
const inspectButton = document.querySelector("[data-mode-inspect]");
const browseButton = document.querySelector("[data-mode-browse]");
const reviewPanel = document.querySelector("[data-review-panel]");
const pageNote = document.querySelector("[data-page-note]");
const annotationList = document.querySelector("[data-annotation-list]");
const emptyAnnotations = document.querySelector("[data-empty-annotations]");
const annotCount = document.querySelector("[data-annot-count]");
const clearButton = document.querySelector("[data-clear]");
const approveButton = document.querySelector("[data-approve]");
const sendButton = document.querySelector("[data-send]");
const helpFab = document.querySelector("[data-help]");
const kbs = document.querySelector("[data-kbs]");
const kbsClose = document.querySelector("[data-kbs-close]");

// Latest state snapshot, kept fresh for the keyboard handler.
let current = machine.getState();

function titleFor(status) {
  if (status === "discovering") return "Checking";
  if (status === "connected") return "Connected";
  if (status === "no-session") return "No session found";
  return "Idle";
}

function render(state) {
  current = state;
  shell.dataset.shellStatus = state.status;
  statusDot.dataset.state = state.status;
  statusLabel.textContent = titleFor(state.status);
  statusMessage.textContent = state.message;

  startButton.hidden = state.status !== "idle";
  retryButton.hidden = state.status !== "no-session";
  stopButton.hidden = state.status !== "connected";
  approveButton.hidden = state.status !== "connected";
  sendButton.hidden = state.status !== "connected";
  startButton.disabled = state.status === "discovering";
  retryButton.disabled = state.status === "discovering";
  approveButton.disabled = state.status !== "connected";
  sendButton.disabled = state.status !== "connected";

  const hasSession = state.status === "connected" && state.session?.id;
  sessionPanel.hidden = !hasSession;
  sessionId.textContent = hasSession ? state.session.id.slice(0, 8) : "";

  modePanel.hidden = state.status !== "connected";
  inspectButton.classList.toggle("is-active", state.mode !== "browse");
  browseButton.classList.toggle("is-active", state.mode === "browse");
  inspectButton.disabled = state.status !== "connected";
  browseButton.disabled = state.status !== "connected";

  reviewPanel.hidden = state.status !== "connected";
  annotCount.textContent = String(state.draft.annotations.length);
  clearButton.disabled = state.draft.annotations.length === 0;
  if (document.activeElement !== pageNote && pageNote.value !== state.draft.pageNote) {
    pageNote.value = state.draft.pageNote;
  }
  renderAnnotations(state.draft.annotations);
}

function renderAnnotations(annotations) {
  annotationList.textContent = "";
  emptyAnnotations.hidden = annotations.length > 0;

  annotations.forEach((annotation, index) => {
    const card = document.createElement("li");
    card.className = "card";
    card.dataset.missing = annotation.missing ? "true" : "false";
    card.dataset.cardIndex = String(index);

    const head = document.createElement("div");
    head.className = "card-head";

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = String(index + 1);

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = annotation.tag || "element";

    const spacer = document.createElement("span");
    spacer.className = "spacer";

    const locate = document.createElement("button");
    locate.className = "ico";
    locate.type = "button";
    locate.dataset.locateId = annotation.id;
    locate.title = "Scroll to this element on the page";
    locate.setAttribute("aria-label", "Locate element");
    locate.textContent = "⌖";

    const remove = document.createElement("button");
    remove.className = "ico danger";
    remove.type = "button";
    remove.dataset.deleteId = annotation.id;
    remove.title = "Delete this annotation";
    remove.setAttribute("aria-label", "Delete annotation");
    remove.textContent = "✕";

    head.append(idx, tag, spacer, locate, remove);

    const sel = document.createElement("code");
    sel.className = "sel";
    sel.textContent = annotation.selector || "unknown selector";
    sel.title = annotation.selector || "";

    card.append(head, sel);

    if (annotation.text) {
      const snippet = document.createElement("p");
      snippet.className = "snippet";
      snippet.textContent = annotation.text;
      card.append(snippet);
    }
    if (annotation.missing) {
      const gone = document.createElement("p");
      gone.className = "gone";
      gone.textContent = "⚠ Element no longer on the page";
      card.append(gone);
    }

    const comment = document.createElement("textarea");
    comment.className = "cmt";
    comment.rows = 2;
    comment.placeholder = "What should change about this element?";
    comment.dataset.commentId = annotation.id;
    comment.value = annotation.comment || "";

    card.append(comment);
    annotationList.append(card);
  });
}

startButton.addEventListener("click", () => {
  void machine.start();
});

retryButton.addEventListener("click", () => {
  void machine.retry();
});

stopButton.addEventListener("click", () => {
  machine.stop();
});

inspectButton.addEventListener("click", () => {
  void machine.setMode("inspect");
});

browseButton.addEventListener("click", () => {
  void machine.setMode("browse");
});

pageNote.addEventListener("input", () => {
  machine.setPageNote(pageNote.value);
});

clearButton.addEventListener("click", () => {
  void machine.clearAnnotations();
});

approveButton.addEventListener("click", () => {
  void machine.approve();
});

sendButton.addEventListener("click", () => {
  void machine.sendFeedback();
});

annotationList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const locateId = target.dataset.locateId;
  const deleteId = target.dataset.deleteId;
  if (locateId) void machine.locateAnnotation(locateId);
  if (deleteId) void machine.deleteAnnotation(deleteId);
});

annotationList.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  const id = target.dataset.commentId;
  if (id) void machine.updateAnnotationComment(id, target.value);
});

approveButton.title = "Approve this browser review with no requested changes.";
sendButton.title = "Send the page note and element annotations back to Pinpoint.";

/* ---------- keyboard shortcuts ---------- */
function toggleHelp(force) {
  const show = typeof force === "boolean" ? force : kbs.hidden;
  kbs.hidden = !show;
}

helpFab.addEventListener("click", () => toggleHelp());
kbsClose.addEventListener("click", () => toggleHelp(false));
kbs.addEventListener("click", (event) => {
  if (event.target === kbs) toggleHelp(false);
});

function jumpToAnnotation(n) {
  const card = annotationList.querySelector(`[data-card-index="${n}"]`);
  if (!card) return;
  card.classList.add("is-active");
  card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  setTimeout(() => card.classList.remove("is-active"), 1200);
  const id = current.draft.annotations[n]?.id;
  if (id) void machine.locateAnnotation(id);
}

document.addEventListener("keydown", (event) => {
  // The help overlay traps Escape and "?" only.
  if (!kbs.hidden) {
    if (event.key === "Escape" || event.key === "?") {
      event.preventDefault();
      toggleHelp(false);
    }
    return;
  }

  if (event.key === "?") {
    event.preventDefault();
    toggleHelp(true);
    return;
  }

  const typing =
    document.activeElement instanceof HTMLTextAreaElement ||
    document.activeElement instanceof HTMLInputElement;

  // Cmd/Ctrl+Enter sends feedback — works even while typing in a comment.
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    if (!sendButton.hidden && !sendButton.disabled) {
      event.preventDefault();
      void machine.sendFeedback();
    }
    return;
  }

  // Escape always stops a connected review.
  if (event.key === "Escape" && current.status === "connected") {
    event.preventDefault();
    machine.stop();
    return;
  }

  if (typing) return; // don't hijack normal typing for the single-key shortcuts

  const connected = current.status === "connected";

  switch (event.key.toLowerCase()) {
    case "s":
      if (!startButton.hidden && !startButton.disabled) void machine.start();
      else if (!retryButton.hidden && !retryButton.disabled) void machine.retry();
      break;
    case "i":
      if (connected) void machine.setMode("inspect");
      break;
    case "b":
      if (connected) void machine.setMode("browse");
      break;
    case "n":
      if (connected) {
        event.preventDefault();
        pageNote.focus();
      }
      break;
    case "enter":
      if (connected && !approveButton.disabled) void machine.approve();
      break;
    case "backspace":
      if (connected && !clearButton.disabled) {
        event.preventDefault();
        void machine.clearAnnotations();
      }
      break;
    default:
      if (connected && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        jumpToAnnotation(Number(event.key) - 1);
      }
  }
});

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.source !== "pinpoint-content" || message.type !== "annotations-changed") return;
    const tabId = sender?.tab?.id;
    const state = machine.getState();
    if (state.status === "connected" && (typeof tabId !== "number" || tabId === state.activeTabId)) {
      machine.syncFromContentState(message.state);
    }
  });
}

machine.subscribe(render);
