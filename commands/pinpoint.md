---
description: Open the Pinpoint visual annotator for an HTML file and act on the feedback
allowed-tools: Bash(pinpoint:*)
---

## Pinpoint review

!`pinpoint annotate $ARGUMENTS`

## Your task

The output above is the result of a visual review of the HTML file.

- If it is a **feedback brief** (a `# UI Feedback` markdown document with annotations and/or a page-wide note), implement the requested changes to the file at the path shown in the brief's `**File:**` line. Use each annotation's CSS selector and element context to locate the target precisely. Make the edits, then briefly summarize what you changed.
- If it says **"✅ Approved"**, the user approved the page with no changes — acknowledge and make no edits.
- If it says **"Review window closed — no feedback submitted"**, the user ended the review without submitting — acknowledge and make no edits.
