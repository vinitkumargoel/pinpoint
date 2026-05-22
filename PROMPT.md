# Pinpoint — Build Spec

## What this is

A Claude Code slash command for reviewing HTML mockups visually and handing structured feedback back to the AI session. The user runs `/pinpoint <file.html>`, gets a browser-based annotator, hovers and clicks elements to leave comments, then ends the session by either approving the file or sending feedback. Feedback returns to the Claude Code session so Claude can patch the file.

A working reference for the core annotator UX is included as `annotate.html`. Read it first. It already implements iframe-based rendering that preserves the user's CSS, hover-to-inspect with CSS selector capture, click-to-annotate, the sidebar, the brief builder, and viewport switching. Lift those mechanics — don't reinvent them. The job here is to wrap that core in a CLI, add the finalize flow, and integrate cleanly with Claude Code.

## The loop

1. User runs `/pinpoint PLAN.html` inside Claude Code
2. The tool starts a local server on a random port and opens the browser
3. Claude Code's invocation blocks — the chat session is paused
4. User reviews the page: hovers elements, clicks to leave comments, types page-wide feedback
5. User ends the session with one of two buttons:
   - **Approve** — quiet exit, no changes requested
   - **Send Feedback** — annotations pass back as a structured brief
6. Tool exits, Claude Code resumes with the result and acts on it

The blocking model is the point. It removes the awkward "tell me when you're done" handoff.

## Functional requirements

Carry over from `annotate.html`:

- iframe rendering that preserves the user's CSS, fonts, and JS exactly as designed
- Hover-to-inspect with a floating label showing the element's CSS selector
- Click-to-annotate that captures a robust, reusable CSS selector for the element
- Numbered badges on annotated elements that stay glued to them through reflow
- Sidebar list of annotations, each individually editable, resolvable, and deletable
- An Inspect / Browse toggle so the user can interact with the page when needed (test buttons, scroll, etc.) without accidentally creating annotations
- Viewport switcher (desktop / tablet / mobile)
- The selector-generation logic and the markdown brief builder

New for this version:

- A **global comment** at the top of the sidebar — page-wide feedback not tied to any element
- **Approve** and **Send Feedback** buttons as the only two ways to end the session; Send Feedback is the primary action
- A way for the user's work to survive a page reload during the session
- A reliable mechanism for the brief to reach the Claude Code session that invoked the tool

The brief itself should include the file path being reviewed, the global comment (if any), and each unresolved annotation with its selector and the user's comment plus enough element context for Claude to confidently locate the target.

## Decisions already made

- **Element-anchored, not coordinate-anchored.** Annotations are tied to DOM elements via CSS selectors so an AI agent can act on them. The earlier version that used x/y pin coordinates was wrong for this use case.
- **iframe with the user's HTML in srcdoc.** This is the only approach that fully preserves their styling. The annotator's own CSS must never bleed into the iframe.
- **Blocking CLI.** The tool does not return control to Claude Code until the user finalizes. Closing the browser tab alone must not end the session — only the finalize buttons or an explicit abort (Ctrl+C) should.
- **No theme yet.** Ship neutral, functional styling. Don't pick fonts, palettes, or an aesthetic direction. Use CSS variables for color and font tokens so a theme pass can come later without touching markup or logic.
- **Local-only, single-user, no auth.** No cloud, no hosting, no accounts.
- **Minimal dependencies.** This is a developer tool; it should install fast and not pull half of npm.

## Out of scope for v1

Theming and visual polish. Multi-file or folder-level annotation. Real-time collaboration. Cross-session annotation history. Anything beyond the single-user local loop.

## Reference

`annotate.html` is the working in-browser prototype. Read it carefully before starting. Port its working pieces; rebuild what needs to change for the CLI + finalize flow.
