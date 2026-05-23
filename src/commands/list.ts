import { basename } from "node:path";
import { listSessions } from "../session.ts";

/**
 * `pinpoint list` — show the review sessions that are currently running (one per
 * port). Reads ~/.pinpoint/sessions and prunes any whose process has exited.
 */
export async function list(): Promise<void> {
  const sessions = await listSessions();
  if (!sessions.length) {
    console.log("No active Pinpoint reviews.");
    return;
  }
  console.log(`${sessions.length} active Pinpoint review${sessions.length === 1 ? "" : "s"}:\n`);
  for (const s of sessions) {
    console.log(`  • ${basename(s.file)}`);
    console.log(`    pid ${s.pid} · port ${s.port} · ${s.url}`);
    console.log(`    ${s.file}\n`);
  }
}
