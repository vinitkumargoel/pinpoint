import {
  injectPinpointIntoActiveTab,
  cleanupActiveTab,
  setActiveTabMode,
  getActiveTabReviewState,
  getActiveTabPageMetadata,
  captureActiveTabVisibleScreenshot,
  updateActiveTabAnnotationComment,
  deleteActiveTabAnnotation,
  clearActiveTabAnnotations,
  locateActiveTabAnnotation,
} from "./active-tab.js";

// Clicking the toolbar icon opens the side panel.
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  });
}

// All privileged chrome.tabs / chrome.scripting work happens HERE, in the service
// worker — those APIs are not reliably exposed inside the side panel page context.
// The side panel sends high-level messages; we run the operation and respond.
const handlers = {
  "pinpoint-activate": () => injectPinpointIntoActiveTab(),
  "pinpoint-deactivate": (m) => cleanupActiveTab(m.tabId),
  "pinpoint-set-mode": (m) => setActiveTabMode(m.tabId, m.mode),
  "pinpoint-get-state": (m) => getActiveTabReviewState(m.tabId),
  "pinpoint-page-metadata": (m) => getActiveTabPageMetadata(m.tabId),
  "pinpoint-screenshot": (m) => captureActiveTabVisibleScreenshot(m.tabId),
  "pinpoint-update-comment": (m) => updateActiveTabAnnotationComment(m.tabId, m.id, m.comment),
  "pinpoint-delete": (m) => deleteActiveTabAnnotation(m.tabId, m.id),
  "pinpoint-clear": (m) => clearActiveTabAnnotations(m.tabId),
  "pinpoint-locate": (m) => locateActiveTabAnnotation(m.tabId, m.id),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = message && handlers[message.type];
  if (!handler) return false; // not ours (e.g. content's "annotations-changed")
  Promise.resolve()
    .then(() => handler(message))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true; // async sendResponse
});
