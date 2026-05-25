# Pinpoint Chrome Extension

The Chrome extension lets Pinpoint annotate the browser tab the user already has open.
Use it for local dev apps, preview URLs, staging pages, authenticated routes, or generated
browser output where reopening an HTML file would lose context.

Use `pinpoint annotate <file.html|file.md>` for file review. Use `pinpoint browser` for a
live Chrome tab.

## Build The Unpacked Extension

From a clean checkout or the managed install at `~/.local/share/pinpoint`:

```bash
bun install
bun run build:extension
```

The build validates `src/extension/manifest.json`, checks referenced extension files, and
copies the loadable package to:

```text
dist/extension
```

During local development you may load `src/extension` directly. For release-style checks
and handoff instructions, load `dist/extension`.

## Load In Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this repo's `dist/extension` directory.
5. Pin or open the **Pinpoint Browser Review** extension.

If you edit files in `src/extension`, run `bun run build:extension` again and click
**Reload** on the extension card in `chrome://extensions`.

## Browser Review Flow

Start a waiting browser session from Claude Code:

```text
/pinpoint browser
```

Or from a terminal:

```bash
pinpoint browser
```

Then switch to the Chrome tab you want to annotate, open the Pinpoint extension, and click
**Start**. The extension stays idle until Start; it does not continuously poll localhost
or inject scripts into pages. If no waiting session is found, it tries a bounded number of
times, shows **No Pinpoint session found**, and offers **Retry**.

While connected:

- **Inspect** lets you click elements and create annotations.
- **Browse** lets the page receive normal pointer/click interactions.
- **Send Feedback** sends the page URL, title, page note, element annotations, and a
  visible-tab screenshot to the waiting Pinpoint session.
- **Approve** returns `✅ Approved — no changes requested.`
- **Stop** discards the page note and annotations, removes injected highlights/listeners,
  and sends no feedback.

Screenshot artifacts are written by the local browser-session server under:

```text
~/.pinpoint/artifacts/browser/<session-id>/
```

The feedback brief includes the screenshot path near the top so the agent can inspect the
visual context around the annotations.

## Manual Verification

```bash
bun run build:extension
bun run src/index.ts browser --timeout-ms 60000
```

Load `dist/extension` in Chrome, open any test page, click **Start**, add a page note and
one element annotation, then click **Send Feedback**. The terminal should print a
`# Browser UI Feedback` brief with page metadata, a screenshot reference, and the element
annotation.

To verify cancellation, start another `pinpoint browser` session, click **Start** in the
extension, add a draft annotation, then click **Stop**. The extension should return to
idle, the page should have no Pinpoint highlights or badges, and the terminal should not
receive feedback from that draft.
