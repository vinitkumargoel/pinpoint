# Pinpoint

**Visual HTML & Markdown annotator for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).**

Run `/pinpoint <file>`, review the page in your browser, click elements to leave
element-anchored comments, then **Approve** or **Send Feedback** — the feedback returns to
your Claude Code session as a structured brief Claude can act on. Point it at an `.html`
file or a `.md` plan/spec (Markdown is rendered to a clean HTML document for review), or
start a browser review when the page you want to annotate is already open in Chrome.

It's **local-only and Claude-Code-only**: no cloud, no accounts, no telemetry. File review
servers bind to `127.0.0.1` on random ports; browser review uses a fixed local discovery
port for the Chrome extension. Each session shuts down the moment you finalize.

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
`~/.local/bin`, installs the `/pinpoint` slash command into `~/.claude/commands`, and
installs a **skill** into `~/.claude/skills/pinpoint` so Claude knows when and how to reach
for Pinpoint on its own.

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

Removes the shim, the slash command, the skill, runtime state (`~/.pinpoint`), and the
managed clone.

---

## Use

### File review

Use file review when the thing to review is an HTML or Markdown file on disk, such as a
mockup, generated page, PRD, plan, or spec. Pinpoint opens that file in its own browser
review tab.

Inside Claude Code:

```
/pinpoint path/to/PLAN.html
/pinpoint path/to/PLAN.md
```

This blocks the session, opens the annotator in your browser, and resumes Claude once you
finalize. You can also run it straight from the terminal:

```bash
pinpoint annotate path/to/PLAN.html
```

In the browser you can hover elements to inspect them, switch between **Inspect** (click to
annotate) and **Browse** (interact with the page) modes, and leave a page-wide comment.
Click an element, type what should change, and it's added as an annotation — click away
without typing and the empty one is discarded automatically.

### Several reviews at once

Each `pinpoint annotate` runs independently: it gets its own random `127.0.0.1` port and
its own browser tab (titled after the file, so concurrent reviews are easy to tell apart).
Open as many as you like from different terminals or Claude Code sessions. To see what's
live:

```bash
pinpoint list
```

```
2 active Pinpoint reviews:

  • PLAN.html
    pid 9549 · port 54426 · http://127.0.0.1:54426/__pinpoint/
    /Users/you/app/PLAN.html
  …
```

(`list` also prunes records of reviews whose process has already exited.) Note: the
`/pinpoint` slash command **blocks the chat it runs in** until you finalize — to review
several at once, launch them from separate Claude Code sessions or terminals.

### How it ends

| Action            | What Claude receives                          |
|-------------------|-----------------------------------------------|
| **Send Feedback** | a markdown brief — file path, page-wide note, and every annotation with its CSS selector, element context, and your comment |
| **Approve**       | `✅ Approved — no changes requested.`          |
| **Close tab**     | `Review window closed — no feedback submitted.` |
| **Ctrl+C**        | aborts the review (exit 130)                   |

Your annotations live in `sessionStorage`, so a page **reload** keeps them; closing the tab
ends the review.

### Browser review with the Chrome extension

Use browser review when the page to review is already open in Chrome, such as a local dev
app, preview URL, staging page, authenticated route, or generated browser result. The
extension is idle until you click **Start**; it does not inspect pages, inject scripts, or
poll localhost in the background.

From Claude Code:

```
/pinpoint browser
```

From a terminal:

```bash
pinpoint browser
```

Then open the Pinpoint Chrome extension on the tab you want to annotate and click
**Start**. If no terminal or agent session is waiting, the extension checks a bounded
number of times, shows **No Pinpoint session found**, and offers **Retry**.

While connected, use **Inspect** to click elements and add comments, or **Browse** to
interact with the page normally. Click **Send Feedback** to return the page URL, title,
page-wide note, element annotations, and a visible-tab screenshot reference to the waiting
agent or terminal command. Click **Approve** to return no requested changes. Click
**Stop** to discard the current browser review draft, remove injected highlights/listeners,
and return the extension to idle without sending feedback.

#### Install the development extension

The extension is currently loaded unpacked from this repo:

```bash
cd ~/.local/share/pinpoint    # or your local clone
bun install
bun run build:extension
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the generated `dist/extension` directory from this repo.

For local development you can also load `src/extension` directly. Use
`bun run build:extension` before packaging or release checks; it validates the manifest and
copies the loadable extension files into `dist/extension`.

---

## How it works

```
/pinpoint FILE  →  !pinpoint annotate FILE  (blocks the session)
                      → local server on a random 127.0.0.1 port (serves FILE's folder)
                      → browser opens /__pinpoint/  (the annotator app)
                          → iframe src=/FILE renders the real page (CSS/JS/assets intact;
                            .md is rendered to a styled HTML document first)
                      → Approve / Send Feedback POSTs /__pinpoint/finalize
                      → CLI prints the result to stdout, exits → Claude resumes
```

Browser review uses a fixed local discovery surface so the passive Chrome extension knows
where to look only after you click **Start**:

```
/pinpoint browser  →  !pinpoint browser  (blocks the session)
                         → local browser-session server on 127.0.0.1:60051
                         → Chrome extension Start discovers the waiting session
                         → extension injects into the active tab only after connect
                         → Send Feedback POSTs annotations + screenshot
                         → CLI prints the browser feedback brief, exits → Claude resumes
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
bun run build:ui                                   # bundle src/ui → src/ui/annotator.html
bun run build:extension                            # validate/copy src/extension → dist/extension
bun run dev -- annotate test/fixture/index.html    # run the CLI (build:ui runs first)
bun run dev -- browser                             # wait for the Chrome extension to Start
bun run typecheck                                   # tsc --noEmit (covers the UI modules)
bun test                                            # headless UI smoke test (happy-dom)
bun run compile                                     # → dist/pinpoint (standalone binary)
```

The annotator UI is written as split, typed source (`src/ui/index.html` + `app.css` +
`app/*.ts`) and bundled by `build:ui` into the single `src/ui/annotator.html` that the
server embeds. That generated file is git-ignored — `dev`, `compile`, `test`, and the
installer all run `build:ui` first, so you rarely call it directly.

The Chrome extension source lives in `src/extension`. `bun run build:extension` validates
the manifest, checks referenced files, and copies the unpacked extension package to
`dist/extension`. Load that generated directory in Chrome for release-style verification,
or load `src/extension` directly while iterating.

### Project layout

```
src/
  index.ts              entry (shebang: #!/usr/bin/env bun)
  cli.ts                arg parsing / help / version
  commands/annotate.ts  resolve file → start server → open browser → await → print
  server.ts             Bun.serve: static target dir + /__pinpoint API + result promise
  markdown.ts           render a .md file to a styled HTML document (via marked)
  session.ts            ~/.pinpoint/sessions/<pid>.json bookkeeping
  browser.ts            cross-platform "open URL"
  extension/            Chrome extension source for browser reviews
  ui/
    index.html          the annotator's HTML shell (CSS + script placeholders)
    app.css             the annotator's styles
    app/*.ts            the annotator's logic, split into typed modules
    annotator.html      GENERATED by build:ui (git-ignored); embedded into the binary
commands/pinpoint.md    the /pinpoint slash command (copied to ~/.claude/commands)
skills/pinpoint/        the Pinpoint skill (copied to ~/.claude/skills)
scripts/build-ui.ts     bundle + inline the UI into src/ui/annotator.html
scripts/build-extension.ts validate/copy src/extension into dist/extension
scripts/install.sh      installer / updater (web one-liner + local dev)
scripts/uninstall.sh    uninstaller
test/                   headless UI smoke test + a fixture page (external CSS/JS/image)
```

---

## License

[MIT](LICENSE) © Vinit Kumar
