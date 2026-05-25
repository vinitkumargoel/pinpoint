export const DEFAULT_DISCOVERY_URL = "http://127.0.0.1:60051/__pinpoint/browser/discovery";
export const DEFAULT_RETRY_COUNT = 4;
export const DEFAULT_RETRY_DELAY_MS = 350;

function emptyDraft() {
  return {
    pageNote: "",
    annotations: [],
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloneState(state) {
  return {
    ...state,
    session: state.session ? { ...state.session } : null,
    activeTabId: state.activeTabId ?? null,
    mode: state.mode,
    draft: {
      pageNote: state.draft.pageNote,
      annotations: state.draft.annotations.map((annotation) => ({ ...annotation })),
    },
  };
}

function shortError(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "unknown_error");
}

export function createInitialState() {
  return {
    status: "idle",
    attemptsMade: 0,
    maxAttempts: DEFAULT_RETRY_COUNT,
    message: "Click Start when a terminal browser session is waiting.",
    session: null,
    activeTabId: null,
    mode: "inspect",
    draft: emptyDraft(),
  };
}

export function makeEndpointUrl(baseUrl, path) {
  const base = new URL(baseUrl);
  return `${base.origin}${path}`;
}

export async function discoverPinpointSession(discoveryUrl = DEFAULT_DISCOVERY_URL) {
  const response = await fetch(discoveryUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`discovery_http_${response.status}`);
  const payload = await response.json();
  if (!payload?.active || !payload.session) return null;
  return payload.session;
}

export async function connectPinpointSession(session) {
  const connectPath = session?.endpoints?.connect || "/__pinpoint/browser/connect";
  const response = await fetch(makeEndpointUrl(session.baseUrl, connectPath), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({ token: session.token }),
  });
  if (!response.ok) throw new Error(`connect_http_${response.status}`);
  return response.json();
}

export async function finalizePinpointSession(session, payload) {
  const finalizePath = session?.endpoints?.finalize || "/__pinpoint/browser/finalize";
  const response = await fetch(makeEndpointUrl(session.baseUrl, finalizePath), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({
      token: session.token,
      ...payload,
    }),
  });
  if (!response.ok) throw new Error(`finalize_http_${response.status}`);
  return response.json();
}

export function buildBrowserFeedbackPayload(page, draft, screenshot) {
  const payload = {
    page: {
      url: String(page?.url || ""),
      title: String(page?.title || ""),
      note: String(draft?.pageNote || ""),
    },
    annotations: Array.isArray(draft?.annotations)
      ? draft.annotations.map((annotation) => {
          const entry = {
            id: annotation.id,
            selector: annotation.selector,
            tag: annotation.tag,
            text: annotation.text,
            outerHTML: annotation.outerHTML,
            comment: annotation.comment || "",
          };
          if (annotation.screenshot) entry.screenshot = annotation.screenshot;
          return entry;
        })
      : [],
  };
  if (screenshot) payload.screenshot = screenshot;
  return payload;
}

export class ExtensionSessionMachine {
  constructor(deps = {}, options = {}) {
    this.deps = {
      discover: deps.discover || discoverPinpointSession,
      connect: deps.connect || connectPinpointSession,
      finalize: deps.finalize || finalizePinpointSession,
      activate: deps.activate || (async () => null),
      deactivate: deps.deactivate || (() => null),
      setMode: deps.setMode || (() => null),
      getContentState: deps.getContentState || (async () => null),
      getPageMetadata: deps.getPageMetadata || (async () => ({ url: "", title: "" })),
      captureScreenshot:
        deps.captureScreenshot ||
        (async () => ({
          unavailable: true,
          capturedAt: new Date().toISOString(),
          error: "screenshot_capture_unavailable",
        })),
      updateComment: deps.updateComment || (async () => null),
      deleteAnnotation: deps.deleteAnnotation || (async () => null),
      clearAnnotations: deps.clearAnnotations || (async () => null),
      locateAnnotation: deps.locateAnnotation || (async () => ({ found: false, state: null })),
      captureAnnotationScreenshot: deps.captureAnnotationScreenshot || (async () => null),
      wait: deps.wait || sleep,
    };
    this.retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.state = {
      ...createInitialState(),
      maxAttempts: this.retryCount,
    };
    this.listeners = new Set();
    this.runId = 0;
  }

  getState() {
    return cloneState(this.state);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  emit(next) {
    this.state = {
      ...this.state,
      ...next,
      draft: next.draft || this.state.draft,
    };
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }

  draftFromContentState(contentState, draft = this.state.draft) {
    return {
      pageNote: draft.pageNote,
      annotations: Array.isArray(contentState?.annotations)
        ? contentState.annotations.map((annotation) => ({ ...annotation }))
        : draft.annotations.map((annotation) => ({ ...annotation })),
    };
  }

  async start() {
    if (this.state.status === "discovering") return this.getState();

    const runId = ++this.runId;
    this.emit({
      status: "discovering",
      attemptsMade: 0,
      maxAttempts: this.retryCount,
      message: "Checking for a local Pinpoint browser session...",
      session: null,
    });

    let lastError = "";
    for (let attempt = 1; attempt <= this.retryCount; attempt += 1) {
      if (runId !== this.runId) return this.getState();
      this.emit({
        attemptsMade: attempt,
        message: `Checking for a local Pinpoint browser session (${attempt}/${this.retryCount})...`,
      });

      try {
        const session = await this.deps.discover();
        if (session) {
          await this.deps.connect(session);
          const activation = await this.deps.activate(session);
          if (runId !== this.runId) return this.getState();
          this.emit({
            status: "connected",
            message: "Connected. Stop will discard this browser review draft.",
            session,
            activeTabId: activation?.tabId ?? null,
            mode: "inspect",
            attemptsMade: attempt,
            draft: this.draftFromContentState(activation?.state, emptyDraft()),
          });
          return this.getState();
        }
      } catch (error) {
        lastError = shortError(error);
      }

      if (attempt < this.retryCount) await this.deps.wait(this.retryDelayMs);
    }

    if (runId !== this.runId) return this.getState();
    this.emit({
      status: "no-session",
      message: lastError
        ? `No Pinpoint session found. Last check: ${lastError}.`
        : "No Pinpoint session found.",
      session: null,
    });
    return this.getState();
  }

  async retry() {
    return this.start();
  }

  stop() {
    this.runId += 1;
    const activeTabId = this.state.activeTabId;
    try {
      void Promise.resolve(this.deps.deactivate(activeTabId)).catch(() => {});
    } catch {
      // Stop should always discard local state, even if the tab was closed.
    }
    this.emit({
      status: "idle",
      attemptsMade: 0,
      maxAttempts: this.retryCount,
      message: "Click Start when a terminal browser session is waiting.",
      session: null,
      activeTabId: null,
      mode: "inspect",
      draft: emptyDraft(),
    });
    return this.getState();
  }

  async setMode(mode) {
    const nextMode = mode === "browse" ? "browse" : "inspect";
    if (this.state.status !== "connected") {
      this.emit({ mode: nextMode });
      return this.getState();
    }

    await this.deps.setMode(this.state.activeTabId, nextMode);
    this.emit({
      mode: nextMode,
      message:
        nextMode === "browse"
          ? "Browse mode is on. The page receives normal clicks."
          : "Inspect mode is on. Hover and click page elements to annotate.",
    });
    return this.getState();
  }

  setPageNote(pageNote) {
    this.emit({
      draft: {
        ...this.state.draft,
        pageNote: String(pageNote || ""),
      },
    });
    return this.getState();
  }

  syncFromContentState(contentState, message = this.state.message) {
    this.emit({
      message,
      draft: this.draftFromContentState(contentState),
    });
    return this.getState();
  }

  async refreshAnnotations() {
    if (this.state.status !== "connected") return this.getState();
    const contentState = await this.deps.getContentState(this.state.activeTabId);
    return this.syncFromContentState(contentState);
  }

  async updateAnnotationComment(id, comment) {
    if (this.state.status !== "connected") return this.getState();
    const contentState = await this.deps.updateComment(this.state.activeTabId, id, comment);
    return this.syncFromContentState(contentState);
  }

  async deleteAnnotation(id) {
    if (this.state.status !== "connected") return this.getState();
    const contentState = await this.deps.deleteAnnotation(this.state.activeTabId, id);
    return this.syncFromContentState(contentState, "Annotation removed.");
  }

  async clearAnnotations() {
    if (this.state.status !== "connected") return this.getState();
    const contentState = await this.deps.clearAnnotations(this.state.activeTabId);
    return this.syncFromContentState(contentState, "Annotations cleared.");
  }

  async locateAnnotation(id) {
    if (this.state.status !== "connected") return this.getState();
    const result = await this.deps.locateAnnotation(this.state.activeTabId, id);
    return this.syncFromContentState(
      result?.state,
      result?.found ? "Located annotation on the page." : "That element is no longer on the page.",
    );
  }

  async approve() {
    if (this.state.status !== "connected" || !this.state.session) return this.getState();
    try {
      await this.deps.finalize(this.state.session, { action: "approve" });
      return this.finishConnectedSession("Approved. No changes were sent.");
    } catch (error) {
      this.emit({ message: `Could not approve: ${shortError(error)}.` });
      return this.getState();
    }
  }

  async sendFeedback() {
    if (this.state.status !== "connected" || !this.state.session) return this.getState();
    try {
      const contentState = await this.deps.getContentState(this.state.activeTabId);
      const draft = this.draftFromContentState(contentState);
      const page = await this.deps.getPageMetadata(this.state.activeTabId);

      // Page-level overview screenshot (current viewport, before any scrolling).
      let pageScreenshot;
      try {
        pageScreenshot = await this.deps.captureScreenshot(this.state.activeTabId);
      } catch (error) {
        pageScreenshot = {
          unavailable: true,
          capturedAt: new Date().toISOString(),
          error: shortError(error),
        };
      }

      // Per-annotation screenshots: scroll each element into view, then capture.
      // Must be serial — each scroll+capture pair must complete before the next starts.
      const annotationsWithScreenshots = [];
      for (const annotation of draft.annotations) {
        let annotationScreenshot = null;
        try {
          annotationScreenshot = await this.deps.captureAnnotationScreenshot(
            this.state.activeTabId,
            annotation.id,
          );
        } catch {
          // Screenshot is best-effort; missing one doesn't block sending.
        }
        annotationsWithScreenshots.push(
          annotationScreenshot ? { ...annotation, screenshot: annotationScreenshot } : annotation,
        );
      }
      draft.annotations = annotationsWithScreenshots;

      await this.deps.finalize(this.state.session, {
        action: "feedback",
        ...buildBrowserFeedbackPayload(page, draft, pageScreenshot),
      });
      return this.finishConnectedSession("Feedback sent.");
    } catch (error) {
      this.emit({ message: `Could not send feedback: ${shortError(error)}.` });
      return this.getState();
    }
  }

  finishConnectedSession(message) {
    this.runId += 1;
    const activeTabId = this.state.activeTabId;
    try {
      void Promise.resolve(this.deps.deactivate(activeTabId)).catch(() => {});
    } catch {
      // The session is already finalized; page cleanup best effort only.
    }
    this.emit({
      status: "idle",
      attemptsMade: 0,
      maxAttempts: this.retryCount,
      message,
      session: null,
      activeTabId: null,
      mode: "inspect",
      draft: emptyDraft(),
    });
    return this.getState();
  }
}
