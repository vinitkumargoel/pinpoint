---
description: Open Pinpoint for a file, live Chrome tab, or the working-tree diff and act on the feedback
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

**`# Code Review Feedback` (diff review)** — implement the requested changes to the working
tree. There is no `**File:**` line at the top; instead each annotation's HTML context block
carries the real source location in data attributes on the annotated `<div class="line …">`:
- `data-file="path/to/file.ts"` — the file to edit (relative to the repo root).
- `data-new-line="N"` — the line number on the **new** (post-edit) side. Use this for `add`
  and `ctx` annotations.
- `data-old-line="N"` — the line number on the **old** (pre-edit) side. Fall back to this
  when `data-new-line` is empty (pure deletion annotations).
- `data-kind="add" | "del" | "ctx"` — which side of the diff was annotated.

Read those attrs from the `outerHTML` block, open `data-file`, and apply the change
described in the comment at the right line. Don't rely on the CSS selector — the data
attributes are the authoritative reference. Summarize what changed.

**`# Browser UI Feedback` (browser review)** — implement the requested changes in the code
that produces the reviewed page. The brief includes:
- `**Screenshot:** /path/page-screenshot.png` — page-level overview of the viewport at send
  time; use for overall layout context.
- Per-annotation entries, each with a CSS selector, visible text, HTML context, comment, and
  `**Screenshot:** /path/annotation-N-screenshot.png` — a focused capture taken by scrolling
  to that specific element. Use these per-annotation screenshots to understand the exact
  visual state of each annotated element, especially elements that were off-screen in the
  page overview. Make the edits, then briefly summarize what changed.

**`# Pinpoint Ask — decision` (ask mode)** — the user answered a complex question you posed.
Act on their decision. Each `##` section is one question; the ```json block at the end is the
machine-readable answer keyed by question id (`chosen_id` / `chosen_ids` / `ranked_ids` /
`text`, plus any `note`, and `skipped: true` for questions left blank). Prefer the JSON for
exact ids; use the prose for the human-readable choices. Proceed with the work the answers
unblock, and briefly confirm what you understood.

**`Pinpoint Ask — no decision submitted`** — the user closed the tab without answering;
acknowledge and ask how they'd like to proceed (don't guess the decision).

**`✅ Approved`** — the user approved with no changes; acknowledge and make no edits.

**`Review window closed`** or **`Browser session canceled`** — the user ended the review
without submitting; acknowledge and make no edits.

**`No changes to review.`** — `pinpoint review` ran in a clean repo; acknowledge, no edits.

---

Usage hints:
- `/pinpoint <path/to/file.html|file.md>` — file review
- `/pinpoint review` — diff review (annotates `git diff HEAD` — staged + unstaged combined)
- `/pinpoint browser` — browser review (then tell the user to open the Chrome extension on
  the target tab and click **Start**; **Stop** discards the draft and sends nothing)
- `/pinpoint ask <path/to/spec.json>` — ask the user a complex question (richer than the
  built-in question popup). Usually you'll invoke `pinpoint ask` yourself with a spec you
  wrote — see the pinpoint skill for the spec format.
- `/pinpoint update` — update Pinpoint to the latest version (re-runs the installer in place,
  refreshes the CLI, this command, and the skill). The output is installer progress, not a
  review brief — just confirm it finished.
