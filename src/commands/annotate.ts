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
  const isMarkdown = /\.(md|markdown|mdown|mkd)$/i.test(fileName);

  // Interactive pages (apps, not static mockups) boot the annotator in Browse
  // mode so clicks drive the page instead of being captured as annotations.
  // Markdown is always rendered to static HTML by us, so it's never interactive.
  let interactive = false;
  if (!isMarkdown) {
    try {
      interactive = looksInteractive(await Bun.file(filePath).text());
    } catch {
      // unreadable as text (e.g. binary) — treat as static
    }
  }

  const { server, port, appUrl, result } = startServer({
    targetDir,
    filePath,
    fileName,
    isMarkdown,
    interactive,
  });
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

  console.error(`\n  Pinpoint — reviewing ${fileName}${isMarkdown ? " (rendered Markdown)" : ""}`);
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

/** Non-whitespace inline-script length (chars) above which a page reads as an app, not a doc. */
const INTERACTIVE_INLINE_THRESHOLD = 600;

/**
 * Heuristic: does this HTML behave like an interactive app rather than a static
 * mockup? True when it pulls in an external/module/`text/babel` script, or when
 * its inline scripts add up to a substantial amount of code (a small toggle in a
 * plan doc stays under the threshold, a Preact/vanilla app blows past it).
 *
 * False positives are cheap: the annotator just opens in Browse mode and shows a
 * hint explaining the one-key switch to Inspect.
 */
export function looksInteractive(html: string): boolean {
  if (/<script\b[^>]*\bsrc\s*=/i.test(html)) return true;
  if (/<script\b[^>]*\btype\s*=\s*["'](module|text\/babel)["']/i.test(html)) return true;
  let inlineChars = 0;
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    inlineChars += (m[1] ?? "").replace(/\s+/g, "").length;
    if (inlineChars >= INTERACTIVE_INLINE_THRESHOLD) return true;
  }
  return false;
}
