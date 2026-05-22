import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";

/**
 * Runtime session record, mirroring plannotator's ~/.plannotator/sessions/<pid>.json.
 * Lets a user (or a future `pinpoint list`) see which review servers are live.
 */
export interface SessionInfo {
  pid: number;
  port: number;
  url: string;
  mode: "annotate";
  project: string;
  file: string;
  label: string;
  startedAt: string;
}

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
