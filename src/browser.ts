/**
 * Open a URL in the user's default browser, cross-platform.
 * Fire-and-forget: we never block on the browser process.
 */
export function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string[];
  if (platform === "darwin") {
    cmd = ["open", url];
  } else if (platform === "win32") {
    // `start` is a cmd builtin; the empty "" is the window title arg.
    cmd = ["cmd", "/c", "start", "", url];
  } else {
    cmd = ["xdg-open", url];
  }
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore", stdin: "ignore" });
  } catch {
    // If the opener is missing, the CLI still prints the URL for manual open.
  }
}
