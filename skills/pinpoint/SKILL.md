---
name: pinpoint
description: Open a visual browser annotator for an HTML/Markdown file, a live Chrome tab, or the working-tree git diff so the user can click elements/sections/lines and leave anchored comments, then act on the structured feedback they send back. Use when the user wants to visually review, annotate, mark up, or get feedback on an HTML mockup, a rendered page, a live local/staging web app, a Markdown plan/spec, or the code you just changed — e.g. "review this page", "annotate this mockup", "let me mark up the plan", "pinpoint this file", "pinpoint the browser", "review my changes", "let me mark up the diff" — or right after you generate an HTML/Markdown file, browser UI, or batch of code edits and want the user to mark it up before you iterate. Also use `pinpoint ask` to put a complex decision to the user — richer than the quick built-in question popup — when the choice needs real context, many options, side-by-side comparison, ranking, picking several, or several linked questions; you author a JSON spec and a structured decision comes back. And run `pinpoint update` whenever the user asks to update, upgrade, or get the latest version of Pinpoint itself — e.g. "update pinpoint", "upgrade pinpoint", "get the latest pinpoint" — it re-runs the installer in place and refreshes the CLI, the /pinpoint command, and this skill.
---

# Pinpoint — visual annotation review

Pinpoint lets the user review a file (`.html` or `.md`), a live page already open in
Chrome, or the working-tree git diff. The user clicks elements/lines to leave anchored
comments plus a page-wide note, and the CLI **blocks until they click Approve, Send
Feedback, Stop, or the session times out**. Markdown files are rendered to a styled HTML
document before review. Diffs are rendered as a unified code-review page (toggle to
split, collapsible file rail).

## When to use this

Reach for Pinpoint instead of asking the user to describe changes in prose whenever feedback
is about something *visual or structural*:

- The user wants to review or give feedback on an HTML mockup or rendered page.
- The user wants to review a live Chrome tab — local dev app, staging URL, authenticated
  route, or any browser result already open.
- The user wants to review a Markdown plan, spec, or doc and mark up specific sections.
- The user wants to review the code you just changed — staged and unstaged together —
  line by line before you commit or iterate further.
- You just produced an HTML or Markdown file or a batch of code edits and want precise,
  anchored feedback before iterating.
- The user says things like "review this", "annotate the mockup", "mark up the plan",
  "pinpoint this", "open the annotator", "pinpoint the browser", or "review my changes".

## Choose the right mode

- **File review** — use when there is a concrete `.html` or `.md` file path to inspect.
- **Browser review** — use when the target is already open in Chrome and the user's exact
  browser state (auth, dynamic data, live app) matters.
- **Diff review** — use when the user wants to review the working-tree changes (staged +
  unstaged) in the current git repo. Reach for this proactively after you've made a batch
  of code edits and want anchored line-level feedback before you commit or move on.
- **Ask** — use when *you* need a decision from the *user* and it's too big for the quick
  built-in question popup: lots of context to read, many options, options worth comparing
  side-by-side, ranking, picking several, or several linked questions. You author a JSON
  spec; the user answers in the browser; a structured decision returns on stdout.

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

**Diff review:**
```bash
pinpoint review
```

Runs `git diff HEAD` (working tree vs HEAD — staged + unstaged together), renders it as a
unified code-review page, and opens the annotator. No file argument; cwd must be a git
repo. The user clicks any line to annotate. Toolbar offers Split / Unified view (defaults
to Unified), a collapsible file rail, expand/collapse all; `[ S J K N P` for keyboard nav.

Exits 0 with `No changes to review.` when the diff is empty; exits 1 with an actionable
"narrow scope or split commits" message if the diff exceeds the ~5,000 line hard ceiling.
Untracked files are not rendered (yet) but their count is surfaced in a banner.

The user can invoke diff review with `/pinpoint review`.

**Ask (complex question):**
```bash
pinpoint ask <path/to/spec.json>
```

Write a question spec to a temp `.json` file, then run the command (it blocks until the user
sends a decision or closes the tab). You can also pipe the spec on stdin: `pinpoint ask < spec.json`.

The spec is JSON:

```jsonc
{
  "title": "optional headline",
  "intro": "optional one-liner",
  "questions": [
    {
      "id": "storage",            // required, unique — becomes the key in the decision
      "mode": "single",           // single | multi | rank | compare | text
      "title": "How should we store uploads?",   // required — the question
      "context": "Why this matters / the trade-offs.",  // optional framing shown as a Claude bubble
      "allowNote": true,          // single|multi|compare: show an optional free-text note
      "options": [                // required for single|multi|rank|compare (omit for text)
        {
          "id": "object",         // required, unique within the question
          "name": "Cloud object storage",   // required — the label
          "desc": "Cheap, scales, a little setup.",
          "tag": "RECOMMENDED",   // optional chip
          "detail": [["Cost","Low"],["Setup","~1 day"]],  // "the hider" — rows revealed on demand
          "code": "storage: object",        // optional code/text shown in the hider
          "preview": "ascii / code preview" // compare mode: shown side-by-side
        }
      ],
      "placeholder": "for text mode"  // textarea placeholder
    }
  ]
}
```

Mode cheat-sheet: **single** = pick one · **multi** = pick several · **rank** = drag/reorder ·
**compare** = pick one by looking at side-by-side previews · **text** = free-form answer.
Keep `id`s stable and meaningful — they're what comes back. Invalid specs fail fast with a
precise message.

The user can invoke it with `/pinpoint ask <spec.json>`.

**Update Pinpoint itself:**
```bash
pinpoint update
```

Run this whenever the user wants to update / upgrade Pinpoint, or when you see the
"Pinpoint update available" banner. It re-runs the canonical installer in place, so it:

- For a managed install, fetches and hard-resets to the latest upstream commit, reinstalls
  dependencies, and rebuilds the annotator UI.
- For a local dev clone, reinstalls dependencies and rebuilds in place **without** resetting
  — uncommitted work is never clobbered.
- Either way, refreshes the `pinpoint` shim, the `/pinpoint` slash command, and this skill so
  Claude Code picks up the newest behavior.

It prints installer progress (not a feedback brief) and exits 0 on success. The user can
invoke it with `/pinpoint update`.

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

**`# Code Review Feedback` brief** — diff review result. There is **no `**File:**` line at
the top** — instead, each annotation's HTML context block carries the real source location
in data attributes on the annotated `<div class="line …">`:

- `data-file="src/server.ts"` — the path to edit (relative to the repo root).
- `data-new-line="43"` — the line number on the **new** side (post-edit state). Read this
  for `add` and `ctx` annotations.
- `data-old-line="41"` — the line number on the **old** side (pre-edit). Use this when
  `data-new-line` is empty, i.e. for pure deletions the user commented on.
- `data-kind="add" | "del" | "ctx"` — which kind of line was annotated.

Read those attrs from the `outerHTML` block, open the file at `data-file`, and apply the
change described in the comment to the right line. Don't follow the CSS selector — the
data attributes are the authoritative reference. Summarize what you changed.

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

**`# Pinpoint Ask — decision` brief** — ask result. The user answered the question(s) you
posed. Each `##` section is one question (human-readable choice + any note); the ```json
block at the end is the authoritative, machine-readable decision keyed by question id:

- `chosen_id` / `chosen` — single & compare (the selected option's id and name).
- `chosen_ids` / `chosen` — multi (arrays of ids and names).
- `ranked_ids` / `ranked` — rank (ids and names, top priority first).
- `text` — text mode (the user's written answer).
- `note` — present when the user attached a note to a single/multi/compare answer.
- `skipped: true` — the user left that question blank.

Parse the JSON for exact ids, use the prose for context, then proceed with the work the
decision unblocks. Briefly confirm what you understood before acting on anything irreversible.

**`Pinpoint Ask — no decision submitted (window closed).`** — the user closed the tab without
answering; don't guess the decision — ask how they'd like to proceed.

**`✅ Approved — no changes requested.`** — the user approved as-is; acknowledge, no edits.

**`Review window closed — no feedback submitted.`** — closed without submitting; acknowledge,
no edits.

**`Browser session canceled — no feedback submitted.`** — user stopped the browser review;
acknowledge, no edits.

**`No changes to review.`** — `pinpoint review` ran in a clean repo; acknowledge, no edits.
