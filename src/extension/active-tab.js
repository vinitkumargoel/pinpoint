function chromeApi() {
  if (typeof chrome === "undefined") throw new Error("chrome_api_unavailable");
  return chrome;
}

async function sendPinpointMessage(tabId, message, api = chromeApi()) {
  const response = await api.tabs.sendMessage(tabId, {
    source: "pinpoint-extension",
    ...message,
  });
  if (!response?.ok) throw new Error(response?.error || "content_script_error");
  return response;
}

export async function getActiveTabId(api = chromeApi()) {
  // Runs in the background service worker, where chrome.tabs is always available.
  const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
  const tabId = tabs?.[0]?.id;
  if (typeof tabId !== "number") throw new Error("active_tab_unavailable");
  return tabId;
}

export async function injectPinpointIntoActiveTab(api = chromeApi()) {
  const tabId = await getActiveTabId(api);
  await api.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"],
  });
  const response = await sendPinpointMessage(tabId, { type: "install" }, api);
  return { tabId, state: response.state };
}

export async function setActiveTabMode(tabId, mode, api = chromeApi()) {
  if (typeof tabId !== "number") return null;
  const response = await sendPinpointMessage(tabId, { type: "set-mode", mode }, api);
  return response.state;
}

export async function getActiveTabReviewState(tabId, api = chromeApi()) {
  if (typeof tabId !== "number") return null;
  const response = await sendPinpointMessage(tabId, { type: "get-state" }, api);
  return response.state;
}

export async function getActiveTabPageMetadata(tabId, api = chromeApi()) {
  if (typeof tabId !== "number") return { url: "", title: "" };
  const response = await sendPinpointMessage(tabId, { type: "get-page-metadata" }, api);
  return response.page || { url: "", title: "" };
}

export async function captureAnnotationScreenshot(tabId, id, api = chromeApi()) {
  if (typeof tabId !== "number") throw new Error("active_tab_unavailable");
  // Scroll the annotated element to the center of the viewport without animation.
  await sendPinpointMessage(tabId, { type: "scroll-to-annotation", id }, api);
  // Let the browser repaint after the instant scroll before we capture.
  await new Promise((r) => setTimeout(r, 350));
  const capturedAt = new Date().toISOString();
  const tab = await api.tabs.get(tabId);
  const windowId = typeof tab?.windowId === "number" ? tab.windowId : undefined;
  const dataUrl = await api.tabs.captureVisibleTab(windowId, { format: "png" });
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error("invalid_screenshot_data");
  }
  return { dataUrl, mimeType: "image/png", capturedAt };
}

export async function captureActiveTabVisibleScreenshot(tabId, api = chromeApi()) {
  const capturedAt = new Date().toISOString();
  try {
    if (typeof tabId !== "number") throw new Error("active_tab_unavailable");
    const tab = await api.tabs.get(tabId);
    const windowId = typeof tab?.windowId === "number" ? tab.windowId : undefined;
    const dataUrl = await api.tabs.captureVisibleTab(windowId, { format: "png" });
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      throw new Error("invalid_screenshot_data");
    }
    return {
      dataUrl,
      mimeType: "image/png",
      capturedAt,
    };
  } catch (error) {
    return {
      unavailable: true,
      capturedAt,
      error: error instanceof Error ? error.message : String(error || "screenshot_capture_failed"),
    };
  }
}

export async function updateActiveTabAnnotationComment(tabId, id, comment, api = chromeApi()) {
  if (typeof tabId !== "number") return null;
  const response = await sendPinpointMessage(tabId, { type: "update-comment", id, comment }, api);
  return response.state;
}

export async function deleteActiveTabAnnotation(tabId, id, api = chromeApi()) {
  if (typeof tabId !== "number") return null;
  const response = await sendPinpointMessage(tabId, { type: "delete-annotation", id }, api);
  return response.state;
}

export async function clearActiveTabAnnotations(tabId, api = chromeApi()) {
  if (typeof tabId !== "number") return null;
  const response = await sendPinpointMessage(tabId, { type: "clear-annotations" }, api);
  return response.state;
}

export async function locateActiveTabAnnotation(tabId, id, api = chromeApi()) {
  if (typeof tabId !== "number") return { found: false, state: null };
  const response = await sendPinpointMessage(tabId, { type: "locate-annotation", id }, api);
  return { found: Boolean(response.found), state: response.state };
}

export async function cleanupActiveTab(tabId, api = chromeApi()) {
  if (typeof tabId !== "number") return null;
  try {
    const response = await sendPinpointMessage(tabId, { type: "cleanup" }, api);
    return response.state;
  } catch (error) {
    if (api.runtime?.lastError) return null;
    throw error;
  }
}
