import { annotate } from "./commands/annotate.ts";
import { list } from "./commands/list.ts";

export const VERSION = "0.2.0";

const HELP = `pinpoint — visual HTML & Markdown annotator for Claude Code

Usage:
  pinpoint annotate <file>   Open the annotator on an .html or .md file; print the feedback brief to stdout
  pinpoint <file>            Shorthand for "annotate"
  pinpoint list              List the review sessions running right now
  pinpoint --help            Show this help
  pinpoint --version         Show version

'annotate' starts a local server on its own port, opens your browser, and blocks
until you click Approve or Send Feedback (or close the tab). The result prints to
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
  if (first === "annotate") {
    await annotate(args.slice(1));
    return;
  }
  if (first === "list") {
    await list();
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
