/**
 * `pinpoint update` — pull the latest Pinpoint and reinstall it in place.
 *
 * This re-runs the canonical installer (`scripts/install.sh`) out of the very
 * directory this CLI is running from, so "update" always means the same thing
 * the published install command does. The installer is idempotent and picks the
 * right behaviour for how Pinpoint was installed:
 *
 *   • Managed install (~/.local/share/pinpoint): fetch + hard-reset to the
 *     upstream branch, reinstall deps, rebuild the UI, refresh the shim,
 *     /pinpoint command and skill. This is the everyday user path.
 *   • Local dev clone: reinstall deps and rebuild the UI in place — it does NOT
 *     reset, so uncommitted work is never clobbered. The shim/command/skill are
 *     still refreshed from the working tree.
 *
 * Because the installer rewrites ~/.claude/skills/pinpoint/SKILL.md and the
 * /pinpoint command on every run, `pinpoint update` is also how the skill and
 * slash command get back in sync after the repo moves forward.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Within a git/source checkout the installer always lives at <repoRoot>/scripts/install.sh. */
export function resolveInstallerPath(repoRoot: string): string {
  return resolve(repoRoot, "scripts", "install.sh");
}

/** Shown when there's no installer to run (e.g. a compiled binary download). */
export function binaryUpdateHint(): string {
  return (
    "pinpoint update: this install has no bundled installer to re-run.\n" +
    "Update it with:\n" +
    "  curl -fsSL https://raw.githubusercontent.com/vinitkumargoel/pinpoint/main/scripts/install.sh | bash"
  );
}

export async function update(_args: string[]): Promise<void> {
  // From a source checkout, src/commands/update.ts → repo root is two levels up.
  // From a `bun build --compile` binary there is no such tree, so the installer
  // won't exist and we fall back to the published install command below.
  const repoRoot = resolve(import.meta.dir, "..", "..");
  const installer = resolveInstallerPath(repoRoot);

  if (!existsSync(installer)) {
    console.error(binaryUpdateHint());
    process.exit(1);
  }

  console.error("→ updating Pinpoint…\n");
  const proc = Bun.spawn(["bash", installer], {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`\npinpoint update: installer exited with code ${code}.`);
    process.exit(code || 1);
  }
  console.error("\n✓ Pinpoint is up to date. Open a new shell if PATH changed.");
}
