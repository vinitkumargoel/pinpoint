# Pinpoint

**Visual HTML & Markdown annotator for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).**

Run `/pinpoint <file>` or `/pinpoint browser`, click elements on the page to leave anchored comments, then **Send Feedback** or **Approve** — the result returns to your Claude Code session as a structured brief. Works on `.html` files, `.md` plans/specs, and live Chrome tabs.

Local-only, no cloud, no accounts, no telemetry.

---

## Install

**Ask Claude Code (recommended):**
> install https://github.com/vinitkumargoel/pinpoint

**Or with one command:**
```bash
curl -fsSL https://raw.githubusercontent.com/vinitkumargoel/pinpoint/main/scripts/install.sh | bash
```

Installs the `pinpoint` CLI, the `/pinpoint` slash command, and a skill so Claude reaches for it automatically. Requires [Bun](https://bun.sh) ≥ 1.1 and `git`. Make sure `~/.local/bin` is on your `PATH`.

**Update:** re-run the same curl command, or tell Claude **"update pinpoint"**.

**Uninstall:**
```bash
curl -fsSL https://raw.githubusercontent.com/vinitkumargoel/pinpoint/main/scripts/uninstall.sh | bash
```

---

## Use

### File review

```
/pinpoint path/to/PLAN.html
/pinpoint path/to/PLAN.md
```

Blocks the Claude session, opens the annotator in your browser, and resumes once you finalize. Markdown files are rendered to a styled HTML document. Also works from a terminal: `pinpoint annotate <file>`.

### Browser review (Chrome extension)

Use when the page to review is already open in Chrome — a local dev app, staging URL, or any authenticated route.

```
/pinpoint browser
```

Then open the Pinpoint side panel on the tab you want, click **Start**, annotate, and send. Each annotation gets its own focused screenshot (the page scrolls to each element before capture).

**Install the extension:**
```bash
cd ~/.local/share/pinpoint && bun run build:extension
```
Open `chrome://extensions` → **Developer mode** → **Load unpacked** → select `dist/extension`.

### Concurrent reviews

Each `pinpoint annotate` gets its own random port and browser tab. Run as many as you like:
```bash
pinpoint list
```

### How it ends

| Action | Claude receives |
|---|---|
| **Send Feedback** | Markdown brief with page note, annotations (selector, element HTML, comment, screenshot per annotation) |
| **Approve** | `✅ Approved — no changes requested.` |
| **Close tab** | `Review window closed — no feedback submitted.` |
| **Ctrl+C** | aborts (exit 130) |

Annotations survive a page reload (stored in `sessionStorage`); closing the tab ends the session.

---

## Develop from source

```bash
git clone https://github.com/vinitkumargoel/pinpoint.git
cd pinpoint && bun install
bun run install:local    # point the local shim at this working tree
```

```bash
bun run build:ui                                 # bundle src/ui → src/ui/annotator.html
bun run build:extension                          # copy src/extension → dist/extension
bun run dev -- annotate test/fixture/index.html  # run the CLI
bun run typecheck                                # tsc --noEmit
bun test                                         # headless smoke tests
bun run compile                                  # → dist/pinpoint (standalone binary)
```

### Layout

```
src/
  index.ts              entry (#!/usr/bin/env bun)
  commands/annotate.ts  file review: start server → open browser → await → print
  commands/browser-session.ts  browser review command
  server.ts             static file server + /__pinpoint API
  extension/            Chrome extension (MV3 side panel)
  ui/                   annotator app source (index.html + app.css + app/*.ts)
commands/pinpoint.md    /pinpoint slash command
skills/pinpoint/        Pinpoint skill for Claude
scripts/                build, install, uninstall helpers
test/                   headless smoke tests + fixture page
```

---

## License

[MIT](LICENSE) © Vinit Kumar
