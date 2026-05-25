import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type BrowserSessionAction = "feedback" | "approve" | "cancel" | "close" | "timeout";

export interface BrowserSessionResult {
  action: BrowserSessionAction;
  brief?: string;
  feedback?: BrowserFeedbackPayload;
}

export interface StartBrowserSessionOptions {
  timeoutMs?: number;
  port?: number;
  token?: string;
  artifactRoot?: string;
}

export interface RunningBrowserSession {
  server: ReturnType<typeof Bun.serve>;
  id: string;
  token: string;
  port: number;
  baseUrl: string;
  discoveryUrl: string;
  connectUrl: string;
  heartbeatUrl: string;
  finalizeUrl: string;
  result: Promise<BrowserSessionResult>;
}

export interface BrowserDiscoveryServer {
  server: ReturnType<typeof Bun.serve>;
  port: number;
  discoveryUrl: string;
}

const API_PREFIX = "/__pinpoint/browser";
export const BROWSER_DISCOVERY_HOST = "127.0.0.1";
export const BROWSER_DISCOVERY_PORT = 60051;
export const BROWSER_SCREENSHOT_ARTIFACT_ROOT = join(homedir(), ".pinpoint", "artifacts", "browser");
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export interface BrowserFeedbackAnnotation {
  id?: string;
  selector?: string;
  tag?: string;
  text?: string;
  outerHTML?: string;
  htmlContext?: string;
  comment?: string;
  screenshot?: BrowserFeedbackScreenshot;
}

export interface BrowserFeedbackScreenshot {
  status: "saved" | "unavailable";
  artifactPath?: string;
  mimeType?: string;
  capturedAt?: string;
  error?: string;
}

export interface BrowserFeedbackPayload {
  page?: {
    url?: string;
    title?: string;
    note?: string;
  };
  pageUrl?: string;
  pageTitle?: string;
  pageNote?: string;
  annotations?: BrowserFeedbackAnnotation[];
  brief?: string;
  screenshot?: BrowserFeedbackScreenshot;
}

interface BrowserApiRequest {
  token?: unknown;
  action?: unknown;
  brief?: unknown;
  feedback?: unknown;
  page?: unknown;
  pageUrl?: unknown;
  pageTitle?: unknown;
  pageNote?: unknown;
  annotations?: unknown;
  screenshot?: unknown;
}

interface BrowserSessionState {
  id: string;
  token: string;
  status: "waiting" | "finalized";
  port: number;
}

function asPositiveTimeout(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) return DEFAULT_TIMEOUT_MS;
  return value;
}

function makeToken(): string {
  return randomBytes(32).toString("base64url");
}

function endpoint(port: number, path = ""): string {
  return `http://${BROWSER_DISCOVERY_HOST}:${port}${API_PREFIX}${path}`;
}

function inactiveDiscoveryPayload() {
  return { ok: true, active: false };
}

function activeDiscoveryPayload(state: BrowserSessionState) {
  return {
    ok: true,
    active: true,
    session: {
      id: state.id,
      mode: "browser",
      status: state.status,
      token: state.token,
      baseUrl: endpoint(state.port),
      endpoints: {
        connect: `${API_PREFIX}/connect`,
        heartbeat: `${API_PREFIX}/heartbeat`,
        finalize: `${API_PREFIX}/finalize`,
      },
    },
  };
}

async function readJson(req: Request): Promise<BrowserApiRequest | Response> {
  try {
    return (await req.json()) as BrowserApiRequest;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
}

function tokenFrom(req: Request, data: BrowserApiRequest): string | undefined {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return typeof data.token === "string" ? data.token : undefined;
}

function validateToken(req: Request, data: BrowserApiRequest, expected: string): Response | undefined {
  const token = tokenFrom(req, data);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });
  if (token !== expected) return Response.json({ ok: false, error: "invalid_token" }, { status: 403 });
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function inline(value: unknown): string {
  return text(value).replace(/\s+/g, " ");
}

function normalizeAnnotation(value: unknown): BrowserFeedbackAnnotation {
  const annotation = asRecord(value);
  return {
    id: text(annotation.id) || undefined,
    selector: text(annotation.selector) || undefined,
    tag: text(annotation.tag) || undefined,
    text: inline(annotation.text) || undefined,
    outerHTML: inline(annotation.outerHTML) || undefined,
    htmlContext: inline(annotation.htmlContext) || undefined,
    comment: text(annotation.comment) || undefined,
  };
}

function screenshotExt(mimeType: string): "png" | "jpg" | "webp" {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } | undefined {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return undefined;
  return {
    mimeType: match[1]!,
    bytes: Buffer.from(match[2]!, "base64"),
  };
}

async function normalizeScreenshot(
  value: unknown,
  opts: { artifactRoot: string; sessionId: string; filename?: string },
): Promise<BrowserFeedbackScreenshot | undefined> {
  const screenshot = asRecord(value);
  if (Object.keys(screenshot).length === 0) return undefined;

  const capturedAt = text(screenshot.capturedAt) || undefined;
  const unavailable = screenshot.unavailable === true || text(screenshot.status) === "unavailable";
  const error = text(screenshot.error) || undefined;
  if (unavailable) {
    return {
      status: "unavailable",
      capturedAt,
      error: error || "capture_unavailable",
    };
  }

  const parsed = parseImageDataUrl(text(screenshot.dataUrl));
  if (!parsed) {
    return {
      status: "unavailable",
      capturedAt,
      error: error || "invalid_or_missing_screenshot_data",
    };
  }

  const dir = join(opts.artifactRoot, opts.sessionId);
  const filename = opts.filename ?? "page-screenshot";
  const artifactPath = join(dir, `${filename}.${screenshotExt(parsed.mimeType)}`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(artifactPath, parsed.bytes);
  } catch (error) {
    return {
      status: "unavailable",
      capturedAt,
      error: error instanceof Error ? error.message : "screenshot_persist_failed",
    };
  }

  return {
    status: "saved",
    artifactPath,
    mimeType: parsed.mimeType,
    capturedAt,
  };
}

async function normalizeBrowserFeedback(
  data: BrowserApiRequest,
  opts: { artifactRoot: string; sessionId: string },
): Promise<BrowserFeedbackPayload> {
  const feedback = asRecord(data.feedback);
  const page = asRecord(feedback.page ?? data.page);
  const screenshotSource = feedback.screenshot ?? data.screenshot;
  const annotationsSource = Array.isArray(feedback.annotations)
    ? feedback.annotations
    : Array.isArray(data.annotations)
      ? data.annotations
      : [];

  const annotations: BrowserFeedbackAnnotation[] = await Promise.all(
    annotationsSource.map(async (raw, i) => {
      const base = normalizeAnnotation(raw);
      const annotationScreenshot = await normalizeScreenshot(asRecord(raw).screenshot, {
        ...opts,
        filename: `annotation-${i + 1}-screenshot`,
      });
      if (annotationScreenshot) base.screenshot = annotationScreenshot;
      return base;
    }),
  );

  return {
    page: {
      url: text(page.url) || text(feedback.pageUrl) || text(data.pageUrl) || undefined,
      title: text(page.title) || text(feedback.pageTitle) || text(data.pageTitle) || undefined,
      note: text(page.note) || text(feedback.pageNote) || text(data.pageNote) || undefined,
    },
    annotations,
    brief: text(feedback.brief) || text(data.brief) || undefined,
    screenshot: await normalizeScreenshot(screenshotSource, { ...opts, filename: "page-screenshot" }),
  };
}

function hasStructuredFeedback(data: BrowserApiRequest): boolean {
  return Boolean(data.feedback || data.page || data.pageUrl || data.pageTitle || data.pageNote || data.annotations || data.screenshot);
}

function pushMarkdownField(lines: string[], label: string, value: string | undefined, fallback = "_(not provided)_"): void {
  lines.push(`**${label}:** ${value && value.length ? value : fallback}`);
}

function pushScreenshotField(lines: string[], screenshot: BrowserFeedbackScreenshot | undefined): void {
  if (!screenshot) {
    pushMarkdownField(lines, "Screenshot", undefined, "_(not submitted)_");
    return;
  }

  if (screenshot.status === "saved") {
    pushMarkdownField(lines, "Screenshot", screenshot.artifactPath);
    return;
  }

  const reason = screenshot.error ? ` (${screenshot.error})` : "";
  pushMarkdownField(lines, "Screenshot", `unavailable${reason}`);
}

export function formatBrowserFeedbackBrief(feedback: string | BrowserFeedbackPayload | undefined): string {
  if (typeof feedback !== "string" && feedback) {
    const page = feedback.page ?? {};
    const annotations = feedback.annotations ?? [];
    const lines: string[] = [];
    lines.push("# Browser UI Feedback");
    lines.push("");
    lines.push("**Source:** Browser session");
    pushMarkdownField(lines, "Page title", page.title, "_(untitled)_");
    pushMarkdownField(lines, "Page URL", page.url, "_(unavailable)_");
    pushScreenshotField(lines, feedback.screenshot);
    lines.push("");
    lines.push("## Page Note");
    lines.push("");
    lines.push(page.note && page.note.length ? page.note : "_(no page-wide note submitted)_");
    if (feedback.brief) {
      lines.push("");
      lines.push("## Additional Feedback");
      lines.push("");
      lines.push(feedback.brief);
    }
    lines.push("");
    lines.push("## Annotations");
    lines.push("");
    if (annotations.length === 0) {
      lines.push("_No element annotations submitted._");
      return lines.join("\n");
    }

    annotations.forEach((annotation, index) => {
      const htmlContext = annotation.htmlContext || annotation.outerHTML;
      lines.push(`### ${index + 1}. ${annotation.tag || "element"}`);
      lines.push("");
      pushMarkdownField(lines, "Selector", annotation.selector);
      pushMarkdownField(lines, "Tag", annotation.tag);
      pushMarkdownField(lines, "Visible text", annotation.text, "_(empty)_");
      pushMarkdownField(lines, "HTML context", htmlContext);
      pushMarkdownField(lines, "Comment", annotation.comment, "_(no comment)_");
      pushScreenshotField(lines, annotation.screenshot);
      if (index < annotations.length - 1) lines.push("");
    });
    return lines.join("\n");
  }

  const submitted = feedback?.trim();
  const lines: string[] = [];
  lines.push("# Browser UI Feedback");
  lines.push("");
  lines.push("**Source:** Browser session");
  lines.push("");
  lines.push("## Feedback");
  lines.push("");
  lines.push(submitted && submitted.length ? submitted : "_(no content submitted)_");
  return lines.join("\n");
}

export function startBrowserDiscoveryServer(opts: Pick<StartBrowserSessionOptions, "port"> = {}): BrowserDiscoveryServer {
  const server = Bun.serve({
    port: opts.port ?? BROWSER_DISCOVERY_PORT,
    hostname: BROWSER_DISCOVERY_HOST,
    idleTimeout: 0,
    fetch(req) {
      const url = new URL(req.url);
      if ((url.pathname === API_PREFIX || url.pathname === `${API_PREFIX}/discovery`) && req.method === "GET") {
        return Response.json(inactiveDiscoveryPayload());
      }
      return new Response("Not found", { status: 404 });
    },
  });

  const port = server.port ?? 0;
  return {
    server,
    port,
    discoveryUrl: endpoint(port, "/discovery"),
  };
}

export function startBrowserSessionServer(opts: StartBrowserSessionOptions = {}): RunningBrowserSession {
  let done = false;
  let resolveResult!: (result: BrowserSessionResult) => void;
  const id = randomUUID();
  const token = opts.token ?? makeToken();
  const artifactRoot = opts.artifactRoot ?? BROWSER_SCREENSHOT_ARTIFACT_ROOT;
  const result = new Promise<BrowserSessionResult>((resolve) => {
    resolveResult = resolve;
  });

  function finish(next: BrowserSessionResult): void {
    if (done) return;
    done = true;
    state.status = "finalized";
    clearTimeout(timeout);
    setTimeout(() => resolveResult(next), 60);
  }

  const timeout = setTimeout(() => finish({ action: "timeout" }), asPositiveTimeout(opts.timeoutMs));
  timeout.unref?.();

  const state: BrowserSessionState = {
    id,
    token,
    status: "waiting",
    port: 0,
  };

  const server = Bun.serve({
    port: opts.port ?? BROWSER_DISCOVERY_PORT,
    hostname: BROWSER_DISCOVERY_HOST,
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === `${API_PREFIX}/discovery` && req.method === "GET") {
        return Response.json(activeDiscoveryPayload(state));
      }

      if (url.pathname === API_PREFIX && req.method === "GET") {
        return Response.json({
          ok: true,
          mode: "browser",
          status: done ? "finalized" : "waiting",
          sessionId: id,
          token,
          discoveryPath: `${API_PREFIX}/discovery`,
          connectPath: `${API_PREFIX}/connect`,
          heartbeatPath: `${API_PREFIX}/heartbeat`,
          finalizePath: `${API_PREFIX}/finalize`,
        });
      }

      if ((url.pathname === `${API_PREFIX}/connect` || url.pathname === `${API_PREFIX}/heartbeat`) && req.method === "POST") {
        const data = await readJson(req);
        if (data instanceof Response) return data;
        const tokenError = validateToken(req, data, token);
        if (tokenError) return tokenError;
        return Response.json({
          ok: true,
          sessionId: id,
          status: done ? "finalized" : "waiting",
        });
      }

      if (url.pathname === `${API_PREFIX}/finalize` && req.method === "POST") {
        const data = await readJson(req);
        if (data instanceof Response) return data;
        const tokenError = validateToken(req, data, token);
        if (tokenError) return tokenError;

        if (data.action === "feedback") {
          if (hasStructuredFeedback(data)) {
            finish({
              action: "feedback",
              feedback: await normalizeBrowserFeedback(data, { artifactRoot, sessionId: id }),
            });
          } else {
            finish({ action: "feedback", brief: typeof data.brief === "string" ? data.brief : "" });
          }
          return Response.json({ ok: true });
        }
        if (data.action === "approve" || data.action === "cancel" || data.action === "close") {
          finish({ action: data.action });
          return Response.json({ ok: true });
        }

        return Response.json({ ok: false, error: "invalid_action" }, { status: 400 });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  const port = server.port ?? 0;
  state.port = port;
  const baseUrl = endpoint(port);
  return {
    server,
    id,
    token,
    port,
    baseUrl,
    discoveryUrl: `${baseUrl}/discovery`,
    connectUrl: `${baseUrl}/connect`,
    heartbeatUrl: `${baseUrl}/heartbeat`,
    finalizeUrl: `${baseUrl}/finalize`,
    result,
  };
}
