---
name: pinpoint
description: Open a visual browser annotator for an HTML/Markdown file or a live Chrome tab so the user can click elements/sections and leave element-anchored comments, then act on the structured feedback they send back. Use when the user wants to visually review, annotate, mark up, or get feedback on an HTML mockup, a rendered page, a live local/staging web app, or a Markdown plan/spec — e.g. "review this page", "annotate this mockup", "let me mark up the plan", "pinpoint this file", "pinpoint the browser" — or right after you generate an HTML/Markdown file or browser UI and want the user to mark it up before you iterate.
---

# Pinpoint — visual annotation review

Pinpoint lets the user review either a file (`.html` or `.md`) or a live page already open
in Chrome. The user can click elements/sections to leave element-anchored comments plus a
page-wide note, and the CLI **blocks until they click Approve, Send Feedback, Stop, or the
session times out**. The result is printed to stdout and returned to you. Markdown files
are rendered to a styled HTML document before review.

## When to use this

Reach for Pinpoint instead of asking the user to describe changes in prose whenever the
feedback is about something *visual or structural*:

- The user wants to review or give feedback on an HTML mockup or a rendered page.
- The user wants to review a live browser tab, local dev app, preview URL, staging page,
  authenticated route, or generated browser result that is already open in Chrome.
- The user wants to review a Markdown plan, spec, or doc and mark up specific sections.
- You just produced an HTML or Markdown file and want precise, anchored feedback before
  you iterate.
- The user says things like "let me review this", "annotate the mockup", "mark up the
  plan", "pinpoint this", or "open the annotator".

## Choose the right mode

- Use **file review** when there is a concrete `.html` or `.md` file path to inspect.
- Use **browser review** when the target page is already open in Chrome and the user's
  exact browser state matters.

## How to run it

It is a blocking CLI — run it and wait for it to return.

For file review:

```bash
pinpoint annotate <path/to/file.html|file.md>
```

The user can also invoke it themselves with the `/pinpoint <file>` slash command.

For browser review:

```bash
pinpoint browser
```

After starting browser review, tell the user: "Open the Pinpoint Chrome extension on the
tab you want to annotate and click Start." The extension is passive until the user clicks
**Start**. If they click **Stop**, Pinpoint discards all browser annotations/page note,
cleans up the injected page overlay/listeners, and sends no feedback.

The user can invoke this through the slash command with `/pinpoint browser`.

## How to act on the result

The command returns exactly one of:

- **A `# UI Feedback` brief** — implement the requested changes to the file at the path in
  the `**File:**` line. Each annotation gives a CSS selector, the element's HTML/text, and
  the user's comment; use them to locate the target precisely. For **Markdown** files the
  selector points into the *rendered* HTML, so use the element's quoted text to find the
  matching place in the `.md` source. After editing, briefly summarize what you changed.
- **A `# Browser UI Feedback` brief** — implement the requested changes in the code that
  produced the reviewed browser page. Use the page URL/title, screenshot reference,
  selectors, visible text, HTML context, and user comments together; the screenshot is
  captured when the user clicks **Send Feedback** and provides layout/visual context that
  selectors alone may miss.
- **`✅ Approved — no changes requested.`** — the user approved as-is; acknowledge and make
  no edits.
- **`Review window closed — no feedback submitted.`** — the user closed without submitting;
  acknowledge and make no edits.
- **`Browser session canceled — no feedback submitted.`** — the user stopped/canceled the
  browser review; acknowledge and make no edits.
