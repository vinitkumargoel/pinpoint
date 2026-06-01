import { resolve, basename } from "node:path";
import { startServer } from "../server.ts";
import { openBrowser } from "../browser.ts";
import { writeSession, removeSession } from "../session.ts";
import { parseAndValidateAskSpec, AskSpecError } from "../ask-spec.ts";

/**
 * `pinpoint ask <spec.json>` (or piped JSON on stdin)
 *
 * Opens the complex-question UI in the browser, blocks until the user sends a
 * decision (or closes the tab), and prints the decision brief to stdout — the
 * same contract as `annotate`/`review`, so the /pinpoint slash command hands the
 * answer straight back to Claude Code. Use this instead of the quick built-in
 * question popup when a decision needs real context, many options, side-by-side
 * comparison, ranking, or several linked questions.
 */
export async function ask(args: string[]): Promise<void> {
  const fileArg = args.find((a) => !a.startsWith("-"));

  // Read the spec: a file path argument, or JSON piped on stdin.
  let raw: string;
  let specPath = "(stdin)";
  if (fileArg && fileArg !== "-") {
    specPath = resolve(process.cwd(), fileArg);
    try {
      raw = await Bun.file(specPath).text();
    } catch {
      console.error(`pinpoint ask: cannot read spec file: ${specPath}`);
      process.exit(2);
    }
  } else if (!process.stdin.isTTY) {
    raw = await Bun.stdin.text();
  } else {
    console.error("pinpoint ask: provide a question spec — `pinpoint ask <spec.json>` or pipe JSON on stdin.");
    process.exit(2);
  }

  // Validate against the contract; fail fast with an actionable message.
  let spec;
  try {
    spec = parseAndValidateAskSpec(raw!);
  } catch (e) {
    if (e instanceof AskSpecError) {
      console.error(`pinpoint ask: invalid question spec — ${e.message}`);
      process.exit(2);
    }
    throw e;
  }

  const project = basename(process.cwd());
  const { server, port, appUrl, result } = startServer({
    targetDir: process.cwd(),
    filePath: specPath,
    fileName: "ask",
    kind: "ask",
    askSpec: spec,
  });
  const pid = process.pid;

  await writeSession({
    pid,
    port,
    url: appUrl,
    mode: "annotate",
    project,
    file: specPath,
    label: `ask-${spec.questions.length}q`,
    startedAt: new Date().toISOString(),
  });

  const qn = spec.questions.length;
  console.error(`\n  Pinpoint Ask — ${qn} question${qn === 1 ? "" : "s"}`);
  console.error(`  ${appUrl}`);
  console.error("  Answer in the browser, then click Send decision (or close the tab).\n");

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
    const brief = (r.brief ?? "").trim();
    process.stdout.write((brief.length ? brief : "# Pinpoint Ask — decision\n\n_(no answer submitted)_") + "\n");
  } else {
    process.stdout.write("Pinpoint Ask — no decision submitted (window closed).\n");
  }
  process.exit(0);
}
