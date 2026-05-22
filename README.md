# Pinpoint

Visual HTML mockup annotator for Claude Code. Run `/pinpoint <file.html>`, review the
page in your browser, click elements to leave element-anchored comments, then **Approve**
or **Send Feedback** — the feedback returns to the Claude Code session as a structured
brief Claude can act on.

It mirrors plannotator's local model (a CLI invoked from a `!`-command, a local server on a
random port, the result printed to stdout) but is **local-only and Claude-Code-only** — no
cloud, no accounts, no telemetry.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1
- A Claude Code installation (the `/pinpoint` slash command lives in `~/.claude/commands`)

## Install (local / dev)

```bash
bun install
bun run install:local   # adds a `pinpoint` shim to ~/.local/bin and the /pinpoint command
```

Make sure `~/.local/bin` is on your `PATH`.

## Use

Inside Claude Code:

```
/pinpoint path/to/PLAN.html
```

This blocks the session, opens the annotator in your browser, and resumes Claude once you
finalize. From the terminal you can also run it directly:

```bash
pinpoint annotate path/to/PLAN.html
```

### How it ends

| Action            | What Claude receives                          |
|-------------------|-----------------------------------------------|
| **Send Feedback** | a markdown brief (file path, page-wide note, each open annotation with selector + element context + your comment) |
| **Approve**       | `✅ Approved — no changes requested.`          |
| **Close tab**     | `Review window closed — no feedback submitted.` |
| **Ctrl+C**        | aborts (exit 130)                             |

Your annotations live in `sessionStorage`, so a page **reload** keeps them; closing the tab
ends the review.

## How it works

```
/pinpoint FILE  →  !pinpoint annotate FILE  (blocks)
                      → local server on a random port (serves FILE's folder as web root)
                      → browser opens /__pinpoint/  (the annotator app)
                          → iframe src=/FILE renders the real page (CSS/JS/assets intact)
                      → Approve / Send Feedback POSTs /__pinpoint/finalize
                      → CLI prints the result to stdout, exits → Claude resumes
```

A 1s heartbeat from the browser distinguishes a reload (brief gap) from a real tab close
(no heartbeat for ~4s → abort).

## Project layout

```
src/
  index.ts            entry (shebang: #!/usr/bin/env bun)
  cli.ts              arg parsing / help / version
  commands/annotate.ts  resolve file → start server → open browser → await → print
  server.ts           Bun.serve: static target dir + /__pinpoint API + result promise
  session.ts          ~/.pinpoint/sessions/<pid>.json bookkeeping
  browser.ts          cross-platform "open URL"
  ui/annotator.html   the annotator (embedded into the binary at compile time)
commands/pinpoint.md  the /pinpoint slash command (copied to ~/.claude/commands)
test/fixture/         a page with external CSS/JS/image to prove render fidelity
```

## Ship as a binary

```bash
bun run compile      # → dist/pinpoint (standalone, no Bun needed at runtime)
```

## License

MIT
