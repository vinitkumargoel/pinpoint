/**
 * Update check — compares the local pinpoint install's HEAD against the
 * upstream repo's main and surfaces a banner + best-effort OS notification
 * when the user is behind.
 *
 * Design:
 *  - Cached in ~/.cache/pinpoint/update-check.json with a 24h TTL so we
 *    only hit the network once a day.
 *  - Silent on every failure path (offline, not a git repo, compiled binary,
 *    network timeout). The CLI must never break because of this check.
 *  - OS notification fires only on the invocation where we just *learned*
 *    about a new upstream commit — the terminal banner still shows on every
 *    invocation until the user updates. Prevents notification spam.
 *  - Opt out via PINPOINT_NO_UPDATE_CHECK=1.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, resolve } from "node:path";

const REMOTE_URL = "https://github.com/vinitkumargoel/pinpoint";
const UPDATE_CMD =
  "curl -fsSL https://raw.githubusercontent.com/vinitkumargoel/pinpoint/main/scripts/install.sh | bash";
const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2000;

const CACHE_DIR = process.env.XDG_CACHE_HOME
  ? resolve(process.env.XDG_CACHE_HOME, "pinpoint")
  : resolve(homedir(), ".cache", "pinpoint");
const CACHE_FILE = resolve(CACHE_DIR, "update-check.json");

export type Cache = {
  lastCheckedAt: number;
  localSha: string;
  remoteSha: string;
};

/** Pure: decide whether the cache is still authoritative for this invocation. */
export function isCacheFresh(
  cached: Cache | null,
  localSha: string,
  now: number,
): boolean {
  if (!cached) return false;
  if (cached.localSha !== localSha) return false;
  if (now - cached.lastCheckedAt >= TTL_MS) return false;
  return true;
}

/** Pure: format the terminal banner shown above the command's normal output. */
export function formatBanner(localSha: string, remoteSha: string): string {
  const a = localSha.slice(0, 7);
  const b = remoteSha.slice(0, 7);
  // ANSI: dim border, bold yellow title.
  const Y = "\x1b[33m";
  const B = "\x1b[1m";
  const D = "\x1b[2m";
  const R = "\x1b[0m";
  const lines = [
    `${D}┌─────────────────────────────────────────────────────────────────────${R}`,
    `${D}│${R} ${Y}${B}↑ Pinpoint update available${R}  ${D}(${a} → ${b})${R}`,
    `${D}│${R} Run: ${B}${UPDATE_CMD}${R}`,
    `${D}│${R} ${D}Silence with PINPOINT_NO_UPDATE_CHECK=1${R}`,
    `${D}└─────────────────────────────────────────────────────────────────────${R}`,
  ];
  return lines.join("\n");
}

/** Top-level entry: called from cli.ts before dispatching to a command. */
export async function checkForUpdates(): Promise<void> {
  if (process.env.PINPOINT_NO_UPDATE_CHECK === "1") return;

  try {
    const installDir = resolve(import.meta.dir, "..");
    const localSha = await readLocalSha(installDir);
    if (!localSha) return; // not a git checkout (compiled binary, npm tarball, etc.)

    const cached = readCache();
    const now = Date.now();
    const fresh = isCacheFresh(cached, localSha, now);

    let remoteSha: string;
    let didFreshCheck = false;
    if (fresh) {
      remoteSha = cached!.remoteSha;
    } else {
      const fetched = await fetchRemoteSha();
      if (!fetched) return; // offline or rate-limited — try again tomorrow
      remoteSha = fetched;
      didFreshCheck = true;
      writeCache({ lastCheckedAt: now, localSha, remoteSha });
    }

    if (remoteSha === localSha) return;

    process.stderr.write(formatBanner(localSha, remoteSha) + "\n");
    if (didFreshCheck) fireDesktopNotification(localSha, remoteSha);
  } catch {
    // Never break the CLI because of a best-effort feature.
  }
}

async function readLocalSha(dir: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "-C", dir, "rev-parse", "HEAD"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) return null;
    const sha = out.trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

async function fetchRemoteSha(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "ls-remote", REMOTE_URL, "HEAD"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    // Race against a 2s timeout — slow networks must not stall the CLI.
    const timeout = new Promise<null>((res) =>
      setTimeout(() => {
        proc.kill();
        res(null);
      }, FETCH_TIMEOUT_MS),
    );
    const text = await Promise.race([new Response(proc.stdout).text(), timeout]);
    if (text === null) return null;
    const code = await proc.exited;
    if (code !== 0) return null;
    const firstLine = text.trim().split("\n")[0];
    if (!firstLine) return null;
    const sha = firstLine.split(/\s+/)[0];
    return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function readCache(): Cache | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = readFileSync(CACHE_FILE, "utf8");
    const data = JSON.parse(raw) as Partial<Cache>;
    if (
      typeof data.lastCheckedAt !== "number" ||
      typeof data.localSha !== "string" ||
      typeof data.remoteSha !== "string"
    ) {
      return null;
    }
    return data as Cache;
  } catch {
    return null;
  }
}

function writeCache(cache: Cache): void {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch {
    /* ignore — next invocation will retry */
  }
}

function fireDesktopNotification(localSha: string, remoteSha: string): void {
  const title = "Pinpoint update available";
  const body = `${localSha.slice(0, 7)} → ${remoteSha.slice(0, 7)} — run the install command in your terminal to update.`;
  try {
    if (platform() === "darwin") {
      const script = `display notification ${jsonString(body)} with title ${jsonString(title)}`;
      Bun.spawn(["osascript", "-e", script], { stdout: "ignore", stderr: "ignore" });
    } else if (platform() === "linux") {
      Bun.spawn(["notify-send", title, body], { stdout: "ignore", stderr: "ignore" });
    }
  } catch {
    /* ignore — notification is best-effort */
  }
}

/** AppleScript needs double-quoted strings with embedded quotes escaped. */
function jsonString(s: string): string {
  return JSON.stringify(s);
}
