---
description: Open Pinpoint for a file or live Chrome tab and act on the feedback
allowed-tools: Bash(pinpoint:*)
---

## Pinpoint review

!`pinpoint $ARGUMENTS`

## Your task

The output above is the result of a Pinpoint visual review.

- Use `/pinpoint <path/to/file.html|file.md>` when the user wants to review a file on disk.
- Use `/pinpoint browser` when the user wants to review a page already open in Chrome. Tell the user to open the Pinpoint Chrome extension on the target tab and click **Start**. The extension stays idle until Start; **Stop** discards the browser-review draft and sends nothing.

When the command returns:

- If it is a **file feedback brief** (a `# UI Feedback` markdown document with annotations and/or a page-wide note), implement the requested changes to the file at the path shown in the brief's `**File:**` line. Use each annotation's CSS selector and element context to locate the target precisely. For Markdown files the selector points into the *rendered* HTML, so use the element's quoted text to find the matching spot in the `.md` source. Make the edits, then briefly summarize what you changed.
- If it is a **browser feedback brief** (a `# Browser UI Feedback` markdown document), use the page URL/title, screenshot reference, selectors, HTML context, and comments to update the relevant code for the live page the user reviewed. The screenshot is captured when the user clicks **Send Feedback** and should be used for visual/layout context.
- If it says **"✅ Approved"**, the user approved the page with no changes — acknowledge and make no edits.
- If it says **"Review window closed — no feedback submitted"** or **"Browser session canceled — no feedback submitted"**, the user ended the review without submitting — acknowledge and make no edits.
