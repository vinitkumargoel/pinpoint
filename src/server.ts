import { resolve, sep } from "node:path";
import { renderMarkdown } from "./markdown.ts";
// Embedded at build time so the compiled binary is self-contained.
// `with { type: "text" }` yields a string at runtime; the cast aligns the type.
import annotatorHtmlRaw from "./ui/annotator.html" with { type: "text" };

const annotatorHtml = annotatorHtmlRaw as unknown as string;
type BunServer = ReturnType<typeof Bun.serve>;

export type FinalizeAction = "feedback" | "approve" | "close";

export interface FinalizeResult {
  action: FinalizeAction;
  brief?: string;
}

export interface ReviewFile {
  id: string;
  path: string;
  added: number;
  deleted: number;
}

export interface ReviewMeta {
  branch: string;
  fileCount: number;
  added: number;
  deleted: number;
  untrackedCount: number;
  files: ReviewFile[];
}

export interface StartServerOptions {
  /** Absolute path to the directory served as the static web root (the target file's folder). */
  targetDir: string;
  /** Absolute path to the file under review (used in the brief). */
  filePath: string;
  /** Basename of the file under review, e.g. "PLAN.html". */
  fileName: string;
  /** When true, the target file is Markdown and is rendered to HTML before it's served. */
  isMarkdown?: boolean;
  /**
   * True when the target HTML looks like an interactive app (detected by the
   * caller). Surfaced to the annotator so the file shell boots in Browse mode
   * and shows a hint instead of swallowing clicks in Inspect mode.
   */
  interactive?: boolean;
  /**
   * Which UI shell the annotator should boot. "file" (default) is the existing
   * HTML / Markdown reviewer. "review" is the code-review shell — the iframe
   * holds a rendered git diff, the chrome surfaces branch / split-or-unified /
   * file rail, and the brief is grouped by file:line.
   */
  kind?: "file" | "review";
  /** Header meta surfaced in the review shell's toolbar. Ignored when kind=file. */
  meta?: ReviewMeta;
}

export interface RunningServer {
  server: BunServer;
  port: number;
  /** http://localhost:<port>/__pinpoint/ — the annotator app URL. */
  appUrl: string;
  /** Resolves once the user finalizes (or the tab closes). */
  result: Promise<FinalizeResult>;
}

const API_PREFIX = "/__pinpoint";
/** No heartbeat for this long after the browser connected = tab closed → abort. */
const HEARTBEAT_GRACE_MS = 4000;

function injectConfig(html: string, cfg: Record<string, unknown>): string {
  const tag = `<script>window.__PINPOINT__=${JSON.stringify(cfg)};</script>`;
  if (html.includes("</head>")) return html.replace("</head>", `${tag}\n</head>`);
  return tag + html;
}

/** Resolve a request path against the web root, refusing anything that escapes it. */
function safeResolve(root: string, pathname: string): string | null {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) return null; // path traversal guard
  return full;
}

export function startServer(opts: StartServerOptions): RunningServer {
  const targetDir = resolve(opts.targetDir);
  const targetFile = resolve(opts.filePath);
  const targetUrl = "/" + encodeURIComponent(opts.fileName);

  const appHtml = injectConfig(annotatorHtml, {
    filePath: opts.filePath,
    fileName: opts.fileName,
    targetUrl,
    apiBase: API_PREFIX,
    kind: opts.kind ?? "file",
    meta: opts.meta,
    interactive: opts.interactive ?? false,
  });

  let done = false;
  let lastBeat = 0;
  let armed = false; // becomes true after the first heartbeat
  let resolveResult!: (r: FinalizeResult) => void;
  const result = new Promise<FinalizeResult>((res) => {
    resolveResult = res;
  });

  function finish(r: FinalizeResult): void {
    if (done) return;
    done = true;
    clearInterval(watcher);
    // Delay so any in-flight HTTP response flushes before the CLI exits the process.
    setTimeout(() => resolveResult(r), 60);
  }

  const watcher = setInterval(() => {
    if (!armed || done) return;
    if (Date.now() - lastBeat > HEARTBEAT_GRACE_MS) finish({ action: "close" });
  }, 1000);

  const server = Bun.serve({
    port: 0, // OS assigns a free port
    hostname: "127.0.0.1", // local-only: never expose the user's files to the LAN
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // ---- annotator app + API (reserved prefix) ----
      if (path === API_PREFIX || path === API_PREFIX + "/") {
        return new Response(appHtml, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
      if (path === API_PREFIX + "/heartbeat") {
        lastBeat = Date.now();
        armed = true;
        return new Response(null, { status: 204 });
      }
      if (path === API_PREFIX + "/finalize") {
        let body: FinalizeResult = { action: "close" };
        try {
          const data = (await req.json()) as Partial<FinalizeResult>;
          if (data.action === "feedback" || data.action === "approve") {
            body = { action: data.action, brief: data.brief };
          }
        } catch {
          // malformed body → treat as a no-op close
        }
        finish(body);
        return Response.json({ ok: true });
      }

      // ---- static: the user's file + its assets (web root = target dir) ----
      const full = safeResolve(targetDir, path);
      if (!full) return new Response("Forbidden", { status: 403 });
      const file = Bun.file(full);
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      // The Markdown target is rendered to a styled HTML document; everything
      // else (including images referenced by the Markdown) is served as-is.
      if (opts.isMarkdown && full === targetFile) {
        return new Response(renderMarkdown(await file.text(), opts.fileName), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
      return new Response(file, { headers: { "cache-control": "no-store" } });
    },
  });

  const port = server.port ?? 0;
  return {
    server,
    port,
    appUrl: `http://127.0.0.1:${port}${API_PREFIX}/`,
    result,
  };
}
