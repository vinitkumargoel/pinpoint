import { describe, test, expect } from "bun:test";
import { isCacheFresh, formatBanner, type Cache } from "../src/update-check";

const DAY = 24 * 60 * 60 * 1000;
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

describe("isCacheFresh", () => {
  test("returns false when there is no cache", () => {
    expect(isCacheFresh(null, SHA_A, 1_000_000)).toBe(false);
  });

  test("returns false when the local sha has changed since the cache was written", () => {
    const cached: Cache = { lastCheckedAt: 100, localSha: SHA_A, remoteSha: SHA_B };
    expect(isCacheFresh(cached, SHA_B, 200)).toBe(false);
  });

  test("returns false when the cache is older than 24h", () => {
    const cached: Cache = { lastCheckedAt: 100, localSha: SHA_A, remoteSha: SHA_B };
    expect(isCacheFresh(cached, SHA_A, 100 + DAY)).toBe(false);
    expect(isCacheFresh(cached, SHA_A, 100 + DAY + 1)).toBe(false);
  });

  test("returns true when same local sha and within the 24h window", () => {
    const cached: Cache = { lastCheckedAt: 100, localSha: SHA_A, remoteSha: SHA_B };
    expect(isCacheFresh(cached, SHA_A, 100)).toBe(true);
    expect(isCacheFresh(cached, SHA_A, 100 + DAY - 1)).toBe(true);
  });
});

describe("formatBanner", () => {
  test("includes both short shas and the install command", () => {
    const banner = formatBanner(SHA_A, SHA_B);
    expect(banner).toContain("aaaaaaa"); // first 7 of local
    expect(banner).toContain("bbbbbbb"); // first 7 of remote
    expect(banner).toContain("Pinpoint update available");
    expect(banner).toContain("curl -fsSL");
    expect(banner).toContain("install.sh | bash");
  });

  test("uses 7-char short shas, not full ones", () => {
    const banner = formatBanner(SHA_A, SHA_B);
    // Full 40-char sha should not appear — only the abbreviation
    expect(banner).not.toContain(SHA_A);
    expect(banner).not.toContain(SHA_B);
  });
});
