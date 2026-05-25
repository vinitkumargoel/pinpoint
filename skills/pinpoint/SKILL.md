---
name: pinpoint
description: Open a visual browser annotator for an HTML/Markdown file or a live Chrome tab so the user can click elements/sections and leave element-anchored comments, then act on the structured feedback they send back. Use when the user wants to visually review, annotate, mark up, or get feedback on an HTML mockup, a rendered page, a live local/staging web app, or a Markdown plan/spec — e.g. "review this page", "annotate this mockup", "let me mark up the plan", "pinpoint this file", "pinpoint the browser" — or right after you generate an HTML/Markdown file or browser UI and want the user to mark it up before you iterate.
---

# Pinpoint — visual annotation review

Pinpoint lets the user review either a file (`.html` or `.md`) or a live page already open
in Chrome. The user clicks elements to leave element-anchored comments plus a page-wide
note, and the CLI **blocks until they click Approve, Send Feedback, Stop, or the session
times out**. Markdown files are rendered to a styled HTML document before review.

## When to use this

Reach for Pinpoint instead of asking the user to describe changes in prose whenever feedback
is about something *visual or structural*:

- The user wants to review or give feedback on an HTML mockup or rendered page.
- The user wants to review a live Chrome tab — local dev app, staging URL, authenticated
  route, or any browser result already open.
- The user wants to review a Markdown plan, spec, or doc and mark up specific sections.
- You just produced an HTML or Markdown file and want precise, anchored feedback before
  iterating.
- The user says things like "review this", "annotate the mockup", "mark up the plan",
  "pinpoint this", "open the annotator", or "pinpoint the browser".

## Choose the right mode

- **File review** — use when there is a concrete `.html` or `.md` file path to inspect.
- **Browser review** — use when the target is already open in Chrome and the user's exact
  browser state (auth, dynamic data, live app) matters.

## How to run it

It is a blocking CLI — run it and wait for it to return.

**File review:**
```bash
pinpoint annotate <path/to/file.html|file.md>
```

The user can also invoke it with `/pinpoint <file>`.

**Browser review:**
```bash
pinpoint browser
```

After starting, tell the user: *"Open the Pinpoint Chrome extension on the tab you want to
annotate and click Start."* The extension is passive until the user clicks **Start**. If
they click **Stop**, all browser annotations are discarded, the page overlay is removed, and
no feedback is sent.

The user can invoke browser review with `/pinpoint browser`.

**List active reviews:**
```bash
pinpoint list
```

## What the user sees in the annotator

**File review (web annotator):**
- Toggle between **Inspect** mode (hover to highlight, click to annotate) and **Browse**
  mode (interact with the page normally) using the seg buttons or `I`/`B` keys.
- Click an element → a numbered badge appears; type a comment in the sidebar entry.
  Empty annotations (no comment typed) are discarded automatically.
- Add an optional page-wide note in the **Page note** field.
- Hold `⌘` to reveal keyboard shortcut badges on all buttons.
- Click **Send Feedback** (`⌘↵`) or **Approve** (`↵`) to finalize.

**Browser review (Chrome extension side panel):**
- Same Inspect/Browse toggle and keyboard shortcuts (`I`/`B`/`N`/`S`/`Esc`/`1-9`/`⌘↵`).
- A **page-wide note** field sits above the annotation list.
- Click **Send Feedback** to return annotations + screenshots; **Approve** for no-changes;
  **Stop** to discard and return to idle.

## Screenshots in browser review

When the user clicks **Send Feedback** in the browser extension:
1. A **page-level overview screenshot** (`page-screenshot.png`) is captured first — the
   current viewport before any scrolling.
2. For each annotation, the page scrolls to center that element, waits for repaint, then
   captures an **annotation-specific screenshot** (`annotation-N-screenshot.png`). This
   ensures every annotated element is captured in context regardless of where it sits on
   the page.

Use the annotation screenshots to understand the visual state of each element precisely —
they are more reliable than the page overview for elements far from the initial scroll
position.

## How to act on the result

The command returns exactly one of:

**`# UI Feedback` brief** — file review result. Implement the requested changes to the file
at the path in the `**File:**` line. Each annotation gives a CSS selector, the element's
HTML context, and the user's comment; use them to locate the target precisely. For
**Markdown** files the selector points into the *rendered* HTML — use the element's quoted
text to find the matching place in the `.md` source. Summarize what you changed.

**`# Browser UI Feedback` brief** — browser review result. Contains:
- `**Page title:**` and `**Page URL:**` — identify the reviewed page.
- `**Screenshot:** /path/page-screenshot.png` — page-level overview; use for overall layout
  context.
- Page note — any overall feedback the user typed.
- Numbered annotations, each with: CSS selector, tag, visible text, HTML context, comment,
  and `**Screenshot:** /path/annotation-N-screenshot.png` — a focused capture of that
  element. Use the per-annotation screenshot to understand the exact visual state of the
  element the user commented on.

Implement the requested changes in the code that produces the reviewed page. Use selectors,
HTML context, comments, and the per-annotation screenshots together for precise targeting.
Summarize what you changed.

**`✅ Approved — no changes requested.`** — the user approved as-is; acknowledge, no edits.

**`Review window closed — no feedback submitted.`** — closed without submitting; acknowledge,
no edits.

**`Browser session canceled — no feedback submitted.`** — user stopped the browser review;
acknowledge, no edits.
