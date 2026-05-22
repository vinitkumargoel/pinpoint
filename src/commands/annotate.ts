import { resolve, dirname, basename } from "node:path";
import { stat } from "node:fs/promises";
import { startServer } from "../server.ts";
import { openBrowser } from "../browser.ts";
import { writeSession, removeSession } from "../session.ts";

/**
 * `pinpoint annotate <file.html>`
 *
 * Starts a local server on a random port, opens the browser at the annotator,
 * and blocks until the user finalizes. The result is written to stdout (the
 * only thing the Claude Code slash command consumes); all human-facing status
 * goes to stderr so it never contaminates the brief.
 */
export async function annotate(args: string[]): Promise<void> {
  const fileArg = args[0];
  if (!fileArg) {
    console.error("pinpoint annotate: missing <file.html>");
    process.exit(2);
  }

  const filePath = resolve(process.cwd(), fileArg);
  let st;
  try {
    st = await stat(filePath);
  } catch {
    console.error(`pinpoint: file not found: ${filePath}`);
    process.exit(2);
  }
  if (!st.isFile()) {
    console.error(`pinpoint: not a file: ${filePath}`);
    process.exit(2);
  }

  const targetDir = dirname(filePath);
  const fileName = basename(filePath);
  const project = basename(targetDir);

  const { server, port, appUrl, result } = startServer({ targetDir, filePath, fileName });
  const pid = process.pid;

  await writeSession({
    pid,
    port,
    url: appUrl,
    mode: "annotate",
    project,
    file: filePath,
    label: `annotate-${fileName}`,
    startedAt: new Date().toISOString(),
  });

  console.error(`\n  Pinpoint — reviewing ${fileName}`);
  console.error(`  ${appUrl}`);
  console.error(`  Annotate in the browser, then click Approve or Send Feedback.`);
  console.error(`  (Closing the tab or Ctrl+C ends the review with no feedback.)\n`);

  // PINPOINT_NO_OPEN lets tests / headless runs skip launching a real browser.
  if (!process.env.PINPOINT_NO_OPEN) openBrowser(appUrl);

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
    const brief = r.brief?.trim();
    process.stdout.write((brief && brief.length ? brief : "# UI Feedback\n\n_(no content submitted)_") + "\n");
  } else if (r.action === "approve") {
    process.stdout.write("✅ Approved — no changes requested.\n");
  } else {
    process.stdout.write("Review window closed — no feedback submitted.\n");
  }
  process.exit(0);
}
