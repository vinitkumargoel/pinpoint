import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";

/**
 * Runtime session record, mirroring plannotator's ~/.plannotator/sessions/<pid>.json.
 * Lets a user (or a future `pinpoint list`) see which review servers are live.
 */
interface BaseSessionInfo {
  pid: number;
  port: number;
  url: string;
  project: string;
  label: string;
  startedAt: string;
}

export interface AnnotateSessionInfo extends BaseSessionInfo {
  mode: "annotate";
  file: string;
}

export interface BrowserSessionInfo extends BaseSessionInfo {
  mode: "browser";
}

export type SessionInfo = AnnotateSessionInfo | BrowserSessionInfo;

const sessionsDir = join(homedir(), ".pinpoint", "sessions");
const sessionPath = (pid: number) => join(sessionsDir, `${pid}.json`);

export async function writeSession(info: SessionInfo): Promise<void> {
  try {
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(sessionPath(info.pid), JSON.stringify(info, null, 2));
  } catch {
    // Session bookkeeping is best-effort; never fail the review over it.
  }
}

export async function removeSession(pid: number): Promise<void> {
  try {
    await rm(sessionPath(pid), { force: true });
  } catch {
    // ignore
  }
}

/** Is a process still running? (signal 0 = existence check, no signal sent.) */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means the process exists but we can't signal it → still alive.
    return (e as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

/**
 * Read every recorded session, oldest first. Sessions whose process is gone are
 * stale leftovers (e.g. a crash); by default they're pruned and excluded.
 */
export async function listSessions({ prune = true } = {}): Promise<SessionInfo[]> {
  let files: string[];
  try {
    files = await readdir(sessionsDir);
  } catch {
    return []; // no sessions dir yet
  }
  const live: SessionInfo[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    let info: SessionInfo;
    try {
      info = JSON.parse(await readFile(join(sessionsDir, f), "utf8")) as SessionInfo;
    } catch {
      continue; // skip unreadable/partial files
    }
    if (isAlive(info.pid)) {
      live.push(info);
    } else if (prune) {
      try {
        await rm(join(sessionsDir, f), { force: true });
      } catch {
        // best effort
      }
    }
  }
  live.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return live;
}
