(() => {
const API_KEY = "__pinpointBrowserReview";
const LISTENER_KEY = "__pinpointBrowserReviewListenerInstalled";
const coreReady = import(chrome.runtime.getURL("content-core.js"));

async function layer() {
  if (window[API_KEY]?.controller) return window[API_KEY].controller;
  const { createAnnotationLayer } = await coreReady;
  const controller = createAnnotationLayer(document, window, {
    onChange(state) {
      try {
        const sent = chrome.runtime?.sendMessage?.({
          source: "pinpoint-content",
          type: "annotations-changed",
          state,
        });
        if (sent && typeof sent.catch === "function") sent.catch(() => {});
      } catch {
        // The side panel may be closed; annotation state is still available via get-state.
      }
    },
  });
  window[API_KEY] = { controller };
  return controller;
}

function handleMessage(message, _sender, sendResponse) {
  if (!message || message.source !== "pinpoint-extension") return false;

  void (async () => {
    try {
      const controller = await layer();

      if (message.type === "install") {
        sendResponse({ ok: true, state: controller.install() });
        return;
      }
      if (message.type === "set-mode") {
        sendResponse({ ok: true, state: controller.setMode(message.mode) });
        return;
      }
      if (message.type === "cleanup") {
        const state = controller.cleanup();
        delete window[API_KEY];
        sendResponse({ ok: true, state });
        return;
      }
      if (message.type === "get-state") {
        sendResponse({ ok: true, state: controller.getState() });
        return;
      }
      if (message.type === "get-page-metadata") {
        sendResponse({
          ok: true,
          page: {
            url: document.location.href,
            title: document.title,
          },
        });
        return;
      }
      if (message.type === "update-comment") {
        sendResponse({
          ok: true,
          state: controller.updateAnnotationComment(message.id, message.comment),
        });
        return;
      }
      if (message.type === "delete-annotation") {
        sendResponse({ ok: true, state: controller.removeAnnotation(message.id) });
        return;
      }
      if (message.type === "clear-annotations") {
        sendResponse({ ok: true, state: controller.clearAnnotations() });
        return;
      }
      if (message.type === "locate-annotation") {
        const result = controller.locateAnnotation(message.id);
        sendResponse({ ok: true, ...result });
        return;
      }
      if (message.type === "scroll-to-annotation") {
        const result = controller.scrollToAnnotation(message.id);
        sendResponse({ ok: true, ...result });
        return;
      }

      sendResponse({ ok: false, error: "unknown_message" });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true;
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage && !window[LISTENER_KEY]) {
  chrome.runtime.onMessage.addListener(handleMessage);
  window[LISTENER_KEY] = true;
}

void layer().then((controller) => {
  controller.install();
});
})();
