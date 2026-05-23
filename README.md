# Pinpoint

**Visual HTML annotator for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).**

Run `/pinpoint <file.html>`, review the page in your browser, click elements to leave
element-anchored comments, then **Approve** or **Send Feedback** — the feedback returns to
your Claude Code session as a structured brief Claude can act on.

It's **local-only and Claude-Code-only**: no cloud, no accounts, no telemetry. The server
binds to `127.0.0.1` on a random port and shuts down the moment you finalize.

---

## Install

### …by asking Claude Code (recommended)

In any Claude Code session, just say:

> **install https://github.com/vinitkumargoel/pinpoint**

Claude will read this README and run the installer for you. To update later:

> **update pinpoint**

### …with one command

```bash
curl -fsSL https://raw.githubusercontent.com/vinitkumargoel/pinpoint/main/scripts/install.sh | bash
```

This clones Pinpoint to `~/.local/share/pinpoint`, drops a `pinpoint` shim in
`~/.local/bin`, and installs the `/pinpoint` slash command into `~/.claude/commands`.

> **Prerequisites:** [Bun](https://bun.sh) ≥ 1.1 and `git`. If Bun is missing, install it
> with `curl -fsSL https://bun.sh/install | bash`.

Make sure `~/.local/bin` is on your `PATH` (the installer warns you if it isn't):

```bash
export PATH="$HOME/.local/bin:$PATH"   # add to ~/.zshrc or ~/.bashrc
```

### Update

Re-run the exact same command (or tell Claude **"update pinpoint"**). It pulls the latest
commit and rewrites the shim and slash command — fully idempotent:

```bash
curl -fsSL https://raw.githubusercontent.com/vinitkumargoel/pinpoint/main/scripts/install.sh | bash
```

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/vinitkumargoel/pinpoint/main/scripts/uninstall.sh | bash
```

Removes the shim, the slash command, runtime state (`~/.pinpoint`), and the managed clone.

---

## Use

Inside Claude Code:

```
/pinpoint path/to/PLAN.html
```

This blocks the session, opens the annotator in your browser, and resumes Claude once you
finalize. You can also run it straight from the terminal:

```bash
pinpoint annotate path/to/PLAN.html
```

In the browser you can hover elements to inspect them, switch between **Inspect** (click to
annotate) and **Browse** (interact with the page) modes, leave a page-wide comment, and
preview at desktop / tablet / mobile widths.

### How it ends

| Action            | What Claude receives                          |
|-------------------|-----------------------------------------------|
| **Send Feedback** | a markdown brief — file path, page-wide note, and every open annotation with its CSS selector, element context, and your comment |
| **Approve**       | `✅ Approved — no changes requested.`          |
| **Close tab**     | `Review window closed — no feedback submitted.` |
| **Ctrl+C**        | aborts the review (exit 130)                   |

Your annotations live in `sessionStorage`, so a page **reload** keeps them; closing the tab
ends the review.

---

## How it works

```
/pinpoint FILE  →  !pinpoint annotate FILE  (blocks the session)
                      → local server on a random 127.0.0.1 port (serves FILE's folder)
                      → browser opens /__pinpoint/  (the annotator app)
                          → iframe src=/FILE renders the real page (CSS/JS/assets intact)
                      → Approve / Send Feedback POSTs /__pinpoint/finalize
                      → CLI prints the result to stdout, exits → Claude resumes
```

A 1-second heartbeat from the browser distinguishes a reload (a brief gap) from a real tab
close (no heartbeat for ~4s → the review aborts cleanly).

**Security model:** the server listens on `127.0.0.1` only (never the LAN), serves a single
folder as web root with a path-traversal guard, and exits as soon as you finalize. Nothing
leaves your machine.

---

## Develop from source

```bash
git clone https://github.com/vinitkumargoel/pinpoint.git
cd pinpoint
bun install
bun run install:local   # installs the shim + /pinpoint command from this clone
```

When run from a clone, the installer points the shim at your working tree, so edits take
effect immediately — no reinstall needed.

```bash
bun run dev -- annotate test/fixture/index.html   # run the CLI without installing
bun run typecheck                                  # tsc --noEmit
bun run compile                                    # → dist/pinpoint (standalone binary)
```

### Project layout

```
src/
  index.ts              entry (shebang: #!/usr/bin/env bun)
  cli.ts                arg parsing / help / version
  commands/annotate.ts  resolve file → start server → open browser → await → print
  server.ts             Bun.serve: static target dir + /__pinpoint API + result promise
  session.ts            ~/.pinpoint/sessions/<pid>.json bookkeeping
  browser.ts            cross-platform "open URL"
  ui/annotator.html     the annotator (embedded into the binary at compile time)
commands/pinpoint.md    the /pinpoint slash command (copied to ~/.claude/commands)
scripts/install.sh      installer / updater (web one-liner + local dev)
scripts/uninstall.sh    uninstaller
test/fixture/           a page with external CSS/JS/image to prove render fidelity
```

---

## License

[MIT](LICENSE) © Vinit Kumar
