import { basename, join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { startServer, type FinalizeResult, type ReviewMeta } from "../server.ts";
import { openBrowser } from "../browser.ts";
import { writeSession, removeSession } from "../session.ts";
import { parseDiff, renderDiffPage, summarizeDiff, DiffTooLargeError, DIFF_THRESHOLDS } from "../diff.ts";

/**
 * `pinpoint review` — annotate the working-tree diff (staged + unstaged) vs HEAD.
 *
 * Renders the diff as a self-contained HTML page in a temp dir, then reuses the
 * existing `annotate` server flow to iframe it in the annotator. The element-HTML
 * carried in each annotation's brief block includes `data-file` / `data-new-line`
 * / `data-old-line` / `data-kind`, so the receiving Claude session can resolve
 * each annotation back to a precise file + line without any extra plumbing.
 */
export async function review(_args: string[]): Promise<void> {
  // 1. Verify we're in a git work tree.
  const inRepo = await runGit(["rev-parse", "--is-inside-work-tree"]).catch(() => null);
  if (!inRepo || inRepo.code !== 0) {
    console.error("pinpoint review: not a git repository (or `git` not on PATH).");
    process.exit(1);
  }

  // 2. Collect the diff (working tree vs HEAD = staged + unstaged combined).
  const diffOut = await runGit(["diff", "HEAD", "--no-color"]);
  if (diffOut.code !== 0) {
    console.error("pinpoint review: `git diff HEAD` failed.");
    if (diffOut.stderr) console.error(diffOut.stderr);
    process.exit(1);
  }
  const diffText = diffOut.stdout;
  if (diffText.trim() === "") {
    process.stdout.write("No changes to review.\n");
    process.exit(0);
  }

  // 3. Untracked files — count them for the page banner; v1 doesn't render them.
  const untracked = await runGit(["ls-files", "--others", "--exclude-standard"]);
  const untrackedCount = untracked.code === 0 && untracked.stdout.trim()
    ? untracked.stdout.trim().split("\n").length
    : 0;

  // 4. Parse + render. Refuse over the hard ceiling with an actionable message.
  const files = parseDiff(diffText);
  const summary = summarizeDiff(files);
  const branch = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim() || "HEAD";
  let html: string;
  try {
    html = renderDiffPage(files, {
      title: `pinpoint review · ${branch}`,
      untrackedCount,
    });
  } catch (err) {
    if (err instanceof DiffTooLargeError) {
      console.error(
        `pinpoint review: diff too large to review interactively (${err.totalLines} changed lines, ceiling ${DIFF_THRESHOLDS.LINE_HARD_CEILING}).`
      );
      console.error("Narrow the scope: `git stash` unrelated changes, or split the work into smaller commits.");
      process.exit(1);
    }
    throw err;
  }

  const meta: ReviewMeta = {
    branch,
    fileCount: summary.fileCount,
    added: summary.added,
    deleted: summary.deleted,
    untrackedCount,
    files: summary.files.map((f) => ({ id: f.id, path: f.path, added: f.added, deleted: f.deleted })),
  };

  // 5. Materialize the rendered HTML in a temp dir so the existing server flow
  //    can iframe it like any other target file.
  const dir = await mkdtemp(join(tmpdir(), "pinpoint-review-"));
  const fileName = "review.html";
  const filePath = join(dir, fileName);
  await writeFile(filePath, html, "utf8");

  const { server, port, appUrl, result } = startServer({
    targetDir: dir,
    filePath,
    fileName,
    isMarkdown: false,
    kind: "review",
    meta,
  });
  const pid = process.pid;

  await writeSession({
    pid,
    port,
    url: appUrl,
    mode: "annotate",
    project: basename(process.cwd()),
    file: filePath,
    label: "review",
    startedAt: new Date().toISOString(),
  });

  console.error("\n  Pinpoint — reviewing working tree vs HEAD");
  console.error(`  ${appUrl}`);
  console.error(`  ${files.length} file${files.length === 1 ? "" : "s"} · click any line to annotate.`);
  console.error("  Send Feedback / Approve / close tab to finish.\n");

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
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(143);
  });

  const r: FinalizeResult = await result;
  await cleanup();

  if (r.action === "feedback") {
    const brief = (r.brief ?? "").trim();
    process.stdout.write((brief.length ? brief : "# Code Review Feedback\n\n_(no content submitted)_") + "\n");
  } else if (r.action === "approve") {
    process.stdout.write("✅ Approved — no changes requested.\n");
  } else {
    process.stdout.write("Review window closed — no feedback submitted.\n");
  }
  process.exit(0);
}

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runGit(args: string[]): Promise<GitResult> {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, stdout, stderr };
}
