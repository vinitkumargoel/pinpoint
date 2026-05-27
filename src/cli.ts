import { annotate } from "./commands/annotate.ts";
import { browserSession } from "./commands/browser-session.ts";
import { list } from "./commands/list.ts";
import { review } from "./commands/review.ts";
import { checkForUpdates } from "./update-check.ts";

export const VERSION = "0.2.0";

const HELP = `pinpoint — visual HTML & Markdown annotator for Claude Code

Usage:
  pinpoint annotate <file>       Open the annotator on an .html or .md file; print the feedback brief to stdout
  pinpoint review                Annotate the working-tree diff (vs HEAD) and print the brief
  pinpoint browser-session       Start a browser review session for the Chrome extension
  pinpoint browser               Shorthand for "browser-session"
  pinpoint <file>                Shorthand for "annotate"
  pinpoint list                  List the review sessions running right now
  pinpoint --help                Show this help
  pinpoint --version             Show version

'annotate' starts a local server on its own port, opens your browser, and blocks
until you click Approve or Send Feedback (or close the tab). 'review' does the
same on a rendered split-view of the working-tree diff. The result prints to
stdout, which is how the /pinpoint slash command hands feedback back to Claude Code.
Each invocation is independent, so you can run several reviews at once.`;

export async function run(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const first = args[0];

  if (first === undefined) {
    console.error(HELP);
    process.exit(1);
  }
  if (first === "--help" || first === "-h" || first === "help") {
    console.log(HELP);
    process.exit(0);
  }
  if (first === "--version" || first === "-v") {
    console.log(VERSION);
    process.exit(0);
  }
  // `list` is read-only and runs without the update check.
  if (first === "list") {
    await list();
    return;
  }

  // Run the daily upstream-update check before any interactive command.
  // Cached + capped at 2s, silent on every failure path. Skipped for
  // help/version (handled above) and `list` (handled just above).
  const willOpenAnnotator =
    first === "annotate" ||
    first === "review" ||
    first === "browser-session" ||
    first === "browser" ||
    !first.startsWith("-");
  if (willOpenAnnotator) {
    await checkForUpdates();
  }

  if (first === "annotate") {
    await annotate(args.slice(1));
    return;
  }
  if (first === "browser-session" || first === "browser") {
    await browserSession(args.slice(1));
    return;
  }
  if (first === "review") {
    await review(args.slice(1));
    return;
  }
  if (!first.startsWith("-")) {
    // Convenience: `pinpoint foo.html` == `pinpoint annotate foo.html`
    await annotate(args);
    return;
  }

  console.error(`pinpoint: unknown command '${first}'\n`);
  console.error(HELP);
  process.exit(2);
}
