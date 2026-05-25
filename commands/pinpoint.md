---
description: Open Pinpoint for a file or live Chrome tab and act on the feedback
allowed-tools: Bash(pinpoint:*)
---

## Pinpoint review

!`pinpoint $ARGUMENTS`

## Your task

The output above is the result of a Pinpoint visual review. Act on it as follows:

**`# UI Feedback` (file review)** — implement the requested changes to the file at the path
in the `**File:**` line. Each annotation includes a CSS selector, element HTML context, and
the user's comment — use them to locate the target precisely. For Markdown files, the
selector points into the rendered HTML, so use the element's quoted text to find the
matching spot in the `.md` source. Make the edits, then briefly summarize what changed.

**`# Browser UI Feedback` (browser review)** — implement the requested changes in the code
that produces the reviewed page. The brief includes:
- `**Screenshot:** /path/page-screenshot.png` — page-level overview of the viewport at send
  time; use for overall layout context.
- Per-annotation entries, each with a CSS selector, visible text, HTML context, comment, and
  `**Screenshot:** /path/annotation-N-screenshot.png` — a focused capture taken by scrolling
  to that specific element. Use these per-annotation screenshots to understand the exact
  visual state of each annotated element, especially elements that were off-screen in the
  page overview. Make the edits, then briefly summarize what changed.

**`✅ Approved`** — the user approved with no changes; acknowledge and make no edits.

**`Review window closed`** or **`Browser session canceled`** — the user ended the review
without submitting; acknowledge and make no edits.

---

Usage hints:
- `/pinpoint <path/to/file.html|file.md>` — file review
- `/pinpoint browser` — browser review (then tell the user to open the Chrome extension on
  the target tab and click **Start**; **Stop** discards the draft and sends nothing)
