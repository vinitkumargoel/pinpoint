import { basename } from "node:path";
import { BROWSER_DISCOVERY_PORT, formatBrowserFeedbackBrief, startBrowserSessionServer } from "../browser-session.ts";
import { removeSession, writeSession } from "../session.ts";

interface BrowserCommandOptions {
  timeoutMs?: number;
  port?: number;
  artifactRoot?: string;
}

function parseArgs(args: string[]): BrowserCommandOptions {
  const opts: BrowserCommandOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--timeout-ms") {
      const raw = args[++i];
      const parsed = Number(raw);
      if (!raw || !Number.isFinite(parsed) || parsed <= 0) {
        console.error("pinpoint browser-session: --timeout-ms requires a positive number");
        process.exit(2);
      }
      opts.timeoutMs = parsed;
      continue;
    }
    if (arg === "--port") {
      const raw = args[++i];
      const parsed = Number(raw);
      if (!raw || !Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        console.error("pinpoint browser-session: --port requires a port number from 0 to 65535");
        process.exit(2);
      }
      opts.port = parsed;
      continue;
    }
    console.error(`pinpoint browser-session: unknown option '${arg}'`);
    process.exit(2);
  }
  return opts;
}

/**
 * `pinpoint browser-session`
 *
 * Starts a local browser-review session and blocks until the extension or a
 * direct local test request finalizes it.
 */
export async function browserSession(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  if (process.env.PINPOINT_BROWSER_ARTIFACT_ROOT) {
    opts.artifactRoot = process.env.PINPOINT_BROWSER_ARTIFACT_ROOT;
  }
  let running: ReturnType<typeof startBrowserSessionServer>;
  try {
    running = startBrowserSessionServer(opts);
  } catch (error) {
    const port = opts.port ?? BROWSER_DISCOVERY_PORT;
    console.error(`pinpoint browser-session: could not start local discovery server on 127.0.0.1:${port}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const { server, port, baseUrl, discoveryUrl, connectUrl, heartbeatUrl, finalizeUrl, token, result } = running;
  const pid = process.pid;
  const project = basename(process.cwd());

  await writeSession({
    pid,
    port,
    url: baseUrl,
    mode: "browser",
    project,
    label: "browser-session",
    startedAt: new Date().toISOString(),
  });

  console.error("\n  Pinpoint — browser session");
  console.error("  Open the Chrome extension and click Start.");
  console.error(`  Discovery: ${discoveryUrl}`);
  console.error("  Pinpoint is waiting for browser feedback, approval, or cancellation.");
  console.error("  Temporary test endpoints:");
  console.error(`  POST ${connectUrl}`);
  console.error(`  POST ${heartbeatUrl}`);
  console.error(`  POST ${finalizeUrl}`);
  console.error(`  Token: ${token}`);
  console.error(`  Example: curl -sS -X POST ${finalizeUrl} -H 'content-type: application/json' -d '{"token":"${token}","action":"approve"}'`);
  console.error("  (Ctrl+C ends the review with no feedback.)\n");

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    try {
      server.stop(true);
    } catch {
      // ignore
    }
    await removeSession(pid);
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(143);
  });

  const r = await result;
  await cleanup();

  if (r.action === "feedback") {
    process.stdout.write(formatBrowserFeedbackBrief(r.feedback ?? r.brief) + "\n");
  } else if (r.action === "approve") {
    process.stdout.write("✅ Approved — no changes requested.\n");
  } else if (r.action === "timeout") {
    process.stdout.write("Browser session timed out — no feedback submitted.\n");
  } else {
    process.stdout.write("Browser session canceled — no feedback submitted.\n");
  }
  process.exit(0);
}
