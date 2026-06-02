import { describe, test, expect } from "bun:test";
import { resolveInstallerPath, binaryUpdateHint } from "../src/commands/update.ts";

describe("resolveInstallerPath", () => {
  test("points at <repoRoot>/scripts/install.sh", () => {
    expect(resolveInstallerPath("/opt/pinpoint")).toBe("/opt/pinpoint/scripts/install.sh");
  });

  test("normalizes a trailing slash on the repo root", () => {
    expect(resolveInstallerPath("/opt/pinpoint/")).toBe("/opt/pinpoint/scripts/install.sh");
  });

  test("matches the real installer that ships in this repo", async () => {
    const repoRoot = new URL("..", import.meta.url).pathname;
    const installer = resolveInstallerPath(repoRoot);
    expect(await Bun.file(installer).exists()).toBe(true);
  });
});

describe("binaryUpdateHint", () => {
  test("falls back to the canonical curl|bash install command", () => {
    const hint = binaryUpdateHint();
    expect(hint).toContain("curl -fsSL");
    expect(hint).toContain("install.sh | bash");
  });
});
