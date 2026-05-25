import { describe, expect, test } from "bun:test";
import { captureActiveTabVisibleScreenshot } from "../src/extension/active-tab.js";
import { buildBrowserFeedbackPayload, ExtensionSessionMachine, makeEndpointUrl } from "../src/extension/state.js";

function sessionFixture() {
  return {
    id: "session-123456",
    mode: "browser",
    status: "waiting",
    token: "token-123",
    baseUrl: "http://127.0.0.1:60051/__pinpoint/browser",
    endpoints: {
      connect: "/__pinpoint/browser/connect",
      heartbeat: "/__pinpoint/browser/heartbeat",
      finalize: "/__pinpoint/browser/finalize",
    },
  };
}

describe("extension session state machine", () => {
  test("starts idle without polling, heartbeat, or injection dependencies", () => {
    let discoveries = 0;
    const machine = new ExtensionSessionMachine({
      discover: async () => {
        discoveries += 1;
        return null;
      },
    });

    expect(machine.getState().status).toBe("idle");
    expect(discoveries).toBe(0);
    expect(machine.getState().session).toBeNull();
    expect(machine.getState().draft).toEqual({ pageNote: "", annotations: [] });
  });

  test("start performs bounded discovery attempts after the user action", async () => {
    let discoveries = 0;
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => {
          discoveries += 1;
          return null;
        },
        wait: async () => {},
      },
      { retryCount: 4, retryDelayMs: 0 },
    );

    await machine.start();

    expect(discoveries).toBe(4);
    expect(machine.getState().status).toBe("no-session");
    expect(machine.getState().message).toContain("No Pinpoint session found");
  });

  test("retry repeats the same bounded discovery behavior", async () => {
    let discoveries = 0;
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => {
          discoveries += 1;
          return null;
        },
        wait: async () => {},
      },
      { retryCount: 3, retryDelayMs: 0 },
    );

    await machine.start();
    await machine.retry();

    expect(discoveries).toBe(6);
    expect(machine.getState().status).toBe("no-session");
  });

  test("connects when discovery finds an active session", async () => {
    const session = sessionFixture();
    let connectedWith = "";
    let activatedWith = "";
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => session,
        connect: async (foundSession) => {
          connectedWith = foundSession.token;
          return { ok: true };
        },
        activate: async (foundSession) => {
          activatedWith = foundSession.id;
          return { tabId: 42 };
        },
        wait: async () => {},
      },
      { retryCount: 4, retryDelayMs: 0 },
    );

    await machine.start();

    const state = machine.getState();
    expect(state.status).toBe("connected");
    expect(state.session?.id).toBe(session.id);
    expect(state.activeTabId).toBe(42);
    expect(state.mode).toBe("inspect");
    expect(connectedWith).toBe(session.token);
    expect(activatedWith).toBe(session.id);
  });

  test("stop discards extension-side draft state and returns to idle", async () => {
    const session = sessionFixture();
    let cleanedTabId = 0;
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => session,
        connect: async () => ({ ok: true }),
        activate: async () => ({ tabId: 42 }),
        deactivate: (tabId) => {
          cleanedTabId = tabId;
        },
        wait: async () => {},
      },
      { retryCount: 1, retryDelayMs: 0 },
    );

    await machine.start();
    machine.state.draft = {
      pageNote: "Draft note",
      annotations: [{ id: "a1", comment: "Change this" }],
    };

    const stopped = machine.stop();

    expect(stopped.status).toBe("idle");
    expect(stopped.session).toBeNull();
    expect(stopped.activeTabId).toBeNull();
    expect(stopped.mode).toBe("inspect");
    expect(stopped.draft).toEqual({ pageNote: "", annotations: [] });
    expect(cleanedTabId).toBe(42);
  });

  test("connected mode changes are sent to the injected active tab", async () => {
    const session = sessionFixture();
    const modeCalls: Array<{ tabId: number; mode: string }> = [];
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => session,
        connect: async () => ({ ok: true }),
        activate: async () => ({ tabId: 42 }),
        setMode: async (tabId, mode) => {
          modeCalls.push({ tabId, mode });
        },
        wait: async () => {},
      },
      { retryCount: 1, retryDelayMs: 0 },
    );

    await machine.start();
    const state = await machine.setMode("browse");

    expect(state.mode).toBe("browse");
    expect(modeCalls).toEqual([{ tabId: 42, mode: "browse" }]);
  });

  test("syncs page note and content annotations into the extension draft", async () => {
    const session = sessionFixture();
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => session,
        connect: async () => ({ ok: true }),
        activate: async () => ({
          tabId: 42,
          state: {
            annotations: [{ id: "a1", selector: "#save", tag: "button", comment: "" }],
          },
        }),
        wait: async () => {},
      },
      { retryCount: 1, retryDelayMs: 0 },
    );

    await machine.start();
    machine.setPageNote("Review the primary action.");
    machine.syncFromContentState({
      annotations: [{ id: "a2", selector: "#hero", tag: "section", comment: "Too tall" }],
    });

    expect(machine.getState().draft).toEqual({
      pageNote: "Review the primary action.",
      annotations: [{ id: "a2", selector: "#hero", tag: "section", comment: "Too tall" }],
    });
  });

  test("annotation panel actions call the active tab and refresh draft state", async () => {
    const session = sessionFixture();
    const calls: string[] = [];
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => session,
        connect: async () => ({ ok: true }),
        activate: async () => ({
          tabId: 42,
          state: { annotations: [{ id: "a1", selector: "#save", tag: "button", comment: "" }] },
        }),
        updateComment: async (tabId, id, comment) => {
          calls.push(`comment:${tabId}:${id}:${comment}`);
          return { annotations: [{ id, selector: "#save", tag: "button", comment }] };
        },
        locateAnnotation: async (tabId, id) => {
          calls.push(`locate:${tabId}:${id}`);
          return { found: false, state: { annotations: [{ id, selector: "#save", tag: "button", missing: true }] } };
        },
        deleteAnnotation: async (tabId, id) => {
          calls.push(`delete:${tabId}:${id}`);
          return { annotations: [] };
        },
        clearAnnotations: async (tabId) => {
          calls.push(`clear:${tabId}`);
          return { annotations: [] };
        },
        wait: async () => {},
      },
      { retryCount: 1, retryDelayMs: 0 },
    );

    await machine.start();
    await machine.updateAnnotationComment("a1", "Use stronger label");
    await machine.locateAnnotation("a1");
    await machine.deleteAnnotation("a1");
    await machine.clearAnnotations();

    expect(calls).toEqual([
      "comment:42:a1:Use stronger label",
      "locate:42:a1",
      "delete:42:a1",
      "clear:42",
    ]);
    expect(machine.getState().draft.annotations).toEqual([]);
  });

  test("stop cancels an in-flight discovery run", async () => {
    let releaseDiscovery!: (session: null) => void;
    const discovery = new Promise<null>((resolve) => {
      releaseDiscovery = resolve;
    });
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => discovery,
        wait: async () => {},
      },
      { retryCount: 1, retryDelayMs: 0 },
    );

    const running = machine.start();
    machine.stop();
    releaseDiscovery(null);
    await running;

    expect(machine.getState().status).toBe("idle");
  });

  test("builds local API endpoint URLs from discovery metadata", () => {
    expect(makeEndpointUrl("http://127.0.0.1:60051/__pinpoint/browser", "/__pinpoint/browser/connect")).toBe(
      "http://127.0.0.1:60051/__pinpoint/browser/connect",
    );
  });

  test("builds extension-shaped browser feedback payloads", () => {
    expect(
      buildBrowserFeedbackPayload(
        { url: "https://example.test/profile", title: "Profile" },
        {
          pageNote: "Review the primary form.",
          annotations: [
            {
              id: "a1",
              selector: "#save",
              tag: "button",
              text: "Save",
              outerHTML: '<button id="save">Save</button>',
              comment: "Use a clearer label.",
            },
          ],
        },
      ),
    ).toEqual({
      page: {
        url: "https://example.test/profile",
        title: "Profile",
        note: "Review the primary form.",
      },
      annotations: [
        {
          id: "a1",
          selector: "#save",
          tag: "button",
          text: "Save",
          outerHTML: '<button id="save">Save</button>',
          comment: "Use a clearer label.",
        },
      ],
    });
  });

  test("approve finalizes the connected browser session and cleans up the active tab", async () => {
    const session = sessionFixture();
    const finalizeCalls: unknown[] = [];
    let cleanedTabId = 0;
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => session,
        connect: async () => ({ ok: true }),
        activate: async () => ({ tabId: 42 }),
        finalize: async (_session, payload) => {
          finalizeCalls.push(payload);
          return { ok: true };
        },
        deactivate: (tabId) => {
          cleanedTabId = tabId;
        },
        wait: async () => {},
      },
      { retryCount: 1, retryDelayMs: 0 },
    );

    await machine.start();
    const state = await machine.approve();

    expect(finalizeCalls).toEqual([{ action: "approve" }]);
    expect(cleanedTabId).toBe(42);
    expect(state.status).toBe("idle");
    expect(state.draft).toEqual({ pageNote: "", annotations: [] });
  });

  test("send feedback posts page metadata, page note, and annotations", async () => {
    const session = sessionFixture();
    const finalizeCalls: unknown[] = [];
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => session,
        connect: async () => ({ ok: true }),
        activate: async () => ({ tabId: 42 }),
        getContentState: async () => ({
          annotations: [
            {
              id: "a1",
              selector: "#save",
              tag: "button",
              text: "Save",
              outerHTML: '<button id="save">Save</button>',
              comment: "Make this more specific.",
            },
          ],
        }),
        getPageMetadata: async () => ({
          url: "https://example.test/settings",
          title: "Settings",
        }),
        captureScreenshot: async () => ({
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          mimeType: "image/png",
          capturedAt: "2026-05-24T12:00:00.000Z",
        }),
        finalize: async (_session, payload) => {
          finalizeCalls.push(payload);
          return { ok: true };
        },
        wait: async () => {},
      },
      { retryCount: 1, retryDelayMs: 0 },
    );

    await machine.start();
    machine.setPageNote("Review the save flow.");
    const state = await machine.sendFeedback();

    expect(finalizeCalls).toEqual([
      {
        action: "feedback",
        page: {
          url: "https://example.test/settings",
          title: "Settings",
          note: "Review the save flow.",
        },
        screenshot: {
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          mimeType: "image/png",
          capturedAt: "2026-05-24T12:00:00.000Z",
        },
        annotations: [
          {
            id: "a1",
            selector: "#save",
            tag: "button",
            text: "Save",
            outerHTML: '<button id="save">Save</button>',
            comment: "Make this more specific.",
          },
        ],
      },
    ]);
    expect(state.status).toBe("idle");
  });

  test("send feedback continues with an unavailable screenshot marker when capture fails", async () => {
    const session = sessionFixture();
    const finalizeCalls: unknown[] = [];
    const machine = new ExtensionSessionMachine(
      {
        discover: async () => session,
        connect: async () => ({ ok: true }),
        activate: async () => ({ tabId: 42 }),
        getContentState: async () => ({
          annotations: [{ id: "a1", selector: "#save", tag: "button", comment: "Keep this feedback." }],
        }),
        getPageMetadata: async () => ({
          url: "https://example.test/settings",
          title: "Settings",
        }),
        captureScreenshot: async () => {
          throw new Error("captureVisibleTab unavailable");
        },
        finalize: async (_session, payload) => {
          finalizeCalls.push(payload);
          return { ok: true };
        },
        wait: async () => {},
      },
      { retryCount: 1, retryDelayMs: 0 },
    );

    await machine.start();
    const state = await machine.sendFeedback();

    expect(finalizeCalls).toHaveLength(1);
    expect(finalizeCalls[0]).toMatchObject({
      action: "feedback",
      screenshot: {
        unavailable: true,
        error: "captureVisibleTab unavailable",
      },
      annotations: [{ id: "a1", selector: "#save", tag: "button", comment: "Keep this feedback." }],
    });
    expect(state.status).toBe("idle");
  });
});

describe("extension visible-tab screenshot capture", () => {
  test("captures the active tab visible area as a PNG data URL", async () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const seen: { windowId?: number; format?: string } = {};
    const screenshot = await captureActiveTabVisibleScreenshot(42, {
      tabs: {
        get: async (tabId: number) => {
          expect(tabId).toBe(42);
          return { windowId: 7 };
        },
        captureVisibleTab: async (windowId: number, options: { format: string }) => {
          seen.windowId = windowId;
          seen.format = options.format;
          return dataUrl;
        },
      },
    });

    expect(seen).toEqual({ windowId: 7, format: "png" });
    expect(screenshot).toMatchObject({
      dataUrl,
      mimeType: "image/png",
    });
    expect(typeof screenshot.capturedAt).toBe("string");
  });

  test("returns an unavailable marker when Chrome screenshot capture fails", async () => {
    const screenshot = await captureActiveTabVisibleScreenshot(42, {
      tabs: {
        get: async () => ({ windowId: 7 }),
        captureVisibleTab: async () => {
          throw new Error("capture denied");
        },
      },
    });

    expect(screenshot).toMatchObject({
      unavailable: true,
      error: "capture denied",
    });
    expect(typeof screenshot.capturedAt).toBe("string");
  });
});
