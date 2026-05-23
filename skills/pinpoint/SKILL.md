---
name: pinpoint
description: Open a visual browser annotator for an HTML or Markdown file so the user can click elements/sections and leave element-anchored comments, then act on the structured feedback they send back. Use when the user wants to visually review, annotate, mark up, or get feedback on an HTML mockup, a rendered page, or a Markdown plan/spec — e.g. "review this page", "annotate this mockup", "let me mark up the plan", "pinpoint this file" — or right after you generate an HTML/Markdown file and want the user to mark it up before you iterate.
---

# Pinpoint — visual annotation review

Pinpoint opens a file (`.html` or `.md`) in the user's browser, lets them click
elements/sections to leave element-anchored comments plus a page-wide note, and **blocks
until they click Approve or Send Feedback**. The result is printed to stdout and returned
to you. Markdown files are rendered to a styled HTML document before review.

## When to use this

Reach for Pinpoint instead of asking the user to describe changes in prose whenever the
feedback is about something *visual or structural*:

- The user wants to review or give feedback on an HTML mockup or a rendered page.
- The user wants to review a Markdown plan, spec, or doc and mark up specific sections.
- You just produced an HTML or Markdown file and want precise, anchored feedback before
  you iterate.
- The user says things like "let me review this", "annotate the mockup", "mark up the
  plan", "pinpoint this", or "open the annotator".

## How to run it

It is a blocking CLI — run it and wait for it to return:

```bash
pinpoint annotate <path/to/file.html|file.md>
```

The user can also invoke it themselves with the `/pinpoint <file>` slash command.

## How to act on the result

The command returns exactly one of:

- **A `# UI Feedback` brief** — implement the requested changes to the file at the path in
  the `**File:**` line. Each annotation gives a CSS selector, the element's HTML/text, and
  the user's comment; use them to locate the target precisely. For **Markdown** files the
  selector points into the *rendered* HTML, so use the element's quoted text to find the
  matching place in the `.md` source. After editing, briefly summarize what you changed.
- **`✅ Approved — no changes requested.`** — the user approved as-is; acknowledge and make
  no edits.
- **`Review window closed — no feedback submitted.`** — the user closed without submitting;
  acknowledge and make no edits.
