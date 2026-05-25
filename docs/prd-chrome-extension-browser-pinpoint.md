# PRD: Chrome Extension Browser Pinpoint

## Problem Statement

Pinpoint currently works well when the user has a local HTML or Markdown file that can be opened through the Pinpoint annotator. The agent or terminal starts `pinpoint annotate <file>`, Pinpoint serves the file in a browser iframe, the user clicks elements, and the resulting structured feedback returns to the agent.

This does not cover a common workflow: the UI the user wants to annotate is already open in Chrome as a live web page, such as a local development app, preview URL, staging page, or generated browser result. In that case the user does not want Pinpoint to reopen a separate HTML file. They want to mark the exact page already loaded in their browser and send those annotations back to the running agent session.

The browser integration must also avoid background cost and surprise behavior. The extension should not continuously watch pages, poll forever, or inject itself into tabs without an explicit user action.

## Solution

Build a Chrome extension mode for Pinpoint that lets a user annotate the current browser tab and send the feedback back to a Pinpoint session started from the terminal or agent.

The extension is passive by default. It does not poll, inspect the page, or inject scripts until the user clicks **Start** in the extension. After Start, the extension checks for an active local Pinpoint browser session a small bounded number of times. If no session is found, it shows **No Pinpoint session found** and a **Retry** button. If a session is found, it injects the Pinpoint annotation layer into the active tab, shows the annotation list inside the extension UI, and sends the final feedback to the local Pinpoint server when the user clicks **Send Feedback**.

When the user sends feedback from the browser, the extension also captures a screenshot of the annotated browser page and sends it with the annotation payload. The agent should receive both structured element context and visual context, because selectors and HTML snippets alone may not explain the layout, spacing, surrounding content, or visual state that motivated the feedback.

The extension also provides **Stop**. Stop discards the current draft annotations, removes the injected overlay and page listeners, stops any heartbeat or session connection, and returns the extension to the idle state.

The existing file-based `pinpoint annotate <file>` flow remains supported. The new capability is additive and should use a separate command or mode, such as `pinpoint browser`, `pinpoint attach`, or a future `/pinpoint browser` slash command.

## User Stories

1. As a Claude Code user, I want to start a browser Pinpoint session from the agent, so that I can give visual feedback on a page already open in Chrome.
2. As a terminal user, I want to start a browser Pinpoint session from the CLI, so that I can annotate the active browser page without using an agent slash command.
3. As a user, I want the Chrome extension to stay idle until I click Start, so that it does not inspect pages or spend resources in the background.
4. As a user, I want the extension to check for a Pinpoint session only after Start, so that it does not continuously poll localhost.
5. As a user, I want the extension to retry session discovery a few times automatically, so that small timing differences between CLI startup and extension Start do not fail immediately.
6. As a user, I want the extension to stop retrying after a bounded number of attempts, so that failure is quick and understandable.
7. As a user, I want to see a clear No Pinpoint session found state, so that I know the agent or terminal session is not ready.
8. As a user, I want a Retry button after No Pinpoint session found, so that I can check again without closing and reopening the extension.
9. As a user, I want a Start button in the extension, so that I explicitly choose when the current tab becomes annotatable.
10. As a user, I want a Stop button while annotation is active, so that I can cancel the browser annotation workflow.
11. As a user, I want Stop to discard annotations, so that canceled feedback never returns to the agent accidentally.
12. As a user, I want Stop to remove all Pinpoint highlights, badges, event listeners, and UI from the page, so that the tab returns to its original state.
13. As a user, I want Pinpoint to annotate the exact live page open in Chrome, so that dynamic state, logged-in views, local dev routes, and app interactions are preserved.
14. As a user, I want to click an element on the live page and add a comment, so that the agent receives precise element-specific feedback.
15. As a user, I want to add a page-wide note, so that I can describe feedback that is not tied to a single element.
16. As a user, I want to see the list of annotations inside the extension UI, so that I can review and edit what I have marked before sending it.
17. As a user, I want to delete individual annotations, so that mistakes do not reach the agent.
18. As a user, I want to clear all annotations, so that I can restart the review without stopping the session.
19. As a user, I want to locate a previously annotated element from the list, so that I can jump back to the exact item on the page.
20. As a user, I want Inspect and Browse modes, so that I can switch between selecting elements and interacting normally with the page.
21. As a user, I want Send Feedback to return the structured brief to the waiting agent or terminal command, so that the existing implementation loop still works.
22. As a user, I want Approve to return an approval result to the waiting agent or terminal command, so that I can explicitly say no changes are needed.
23. As a user, I want closing or stopping the extension session to avoid sending feedback, so that incomplete drafts do not trigger agent work.
24. As a user, I want the extension to connect only to local Pinpoint sessions, so that my feedback stays local.
25. As a user, I want each browser session to have a session token, so that random local pages cannot submit feedback to the agent session.
26. As a user, I want the CLI to print understandable status while waiting for the browser extension, so that I know what to do next.
27. As a user, I want the agent slash command to explain that I should click the extension Start button, so that the handoff from agent to browser is clear.
28. As a developer, I want the extension annotation logic to reuse Pinpoint's existing selector, annotation, and brief behavior where practical, so that file review and browser review stay consistent.
29. As a developer, I want browser-session code separated from file-session code, so that the existing file annotator remains stable.
30. As a maintainer, I want the extension packaged as part of the repo, so that it can be developed, tested, and released with Pinpoint.
31. As a user, I want browser feedback to include a screenshot of the annotated page, so that the agent receives the visual context around my comments.
32. As an agent, I want browser feedback to include both element-level annotations and a screenshot reference, so that I can understand layout and visual issues that are not obvious from HTML snippets.

## Implementation Decisions

- Add a new browser review mode separate from the existing file review mode.
- Keep the existing file-based annotator behavior unchanged.
- Introduce a local discovery surface that the extension can reach at a known address. This should be fixed or otherwise discoverable because the current random-port model cannot be found by an idle extension without a known rendezvous point.
- The extension must not continuously poll. Session discovery begins only after the user clicks Start.
- On Start, the extension should attempt discovery a bounded number of times, initially planned as three to four attempts over a short window.
- If discovery fails, the extension enters a No Pinpoint session found state and exposes Retry.
- Retry repeats the same bounded discovery behavior.
- When connected, the extension injects the annotation layer only into the active tab chosen by the user.
- Stop discards all current annotations and page-wide draft text for that browser review session.
- Stop removes injected page artifacts, including hover outlines, selected outlines, numbered badges, event listeners, side effects, timers, and connection state.
- Use Chrome Side Panel for the main annotation list and controls if feasible. A popup can remain as the lightweight Start, Stop, Retry, and status entry point.
- Keep the annotation model aligned with the existing Pinpoint brief: page-wide note, element selector, tag, text, short HTML context, user comment, and creation time.
- Add browser-page metadata to browser-session briefs, such as page URL and title. The existing file path field should be replaced or augmented for browser sessions.
- Include a screenshot artifact when browser feedback is sent. The payload should carry screenshot metadata and a local artifact reference or encoded image payload that the CLI can write to disk and reference in the final brief.
- The browser feedback brief should include the screenshot location near the top of the brief, before the element annotations, so the agent can inspect the page context first.
- Prefer a visible-tab screenshot for the first version because it reflects exactly what the user was looking at during final review. Full-page stitched screenshots can be evaluated later if visible-tab screenshots are not enough.
- Use a per-session token generated by the CLI/server and required for extension finalize calls.
- Use heartbeat only while actively connected. No heartbeat should run while the extension is idle or in No session found state.
- Treat extension permissions conservatively. Prefer active-tab driven injection over broad host permissions for the first version.
- Browser extension v1 targets Chrome. Broader Chromium support can be considered after the Chrome path is stable.
- Browser session finalization should mirror existing actions: feedback, approve, and close/cancel with no feedback.
- The CLI should block until finalization, cancellation, timeout, or process termination, matching the agent-friendly behavior of the current annotate command.
- The slash command or skill text should be updated so agents know when to choose browser review versus file review.

## Testing Decisions

- Tests should cover external behavior rather than internal implementation details.
- Unit tests should cover browser session state transitions: idle, discovering, no session, connected, stopped, finalized, and failed.
- Unit tests should cover bounded discovery retry behavior: no polling before Start, exact retry limit after Start, Retry restarting the bounded attempts, and no background retries after failure.
- Unit tests should cover Stop semantics: annotations are discarded, heartbeat stops, injected overlay cleanup is requested, and no feedback is finalized.
- Unit tests should cover browser-session brief generation, including URL/title metadata and element annotation formatting.
- Unit tests should cover browser-session brief generation with screenshot metadata and screenshot artifact references.
- Integration tests should verify that sending browser feedback with a screenshot causes the CLI/server to persist the image artifact and include it in the returned brief.
- Existing UI smoke tests are prior art for testing bundled browser UI behavior.
- Add tests for shared annotation/brief modules if logic is extracted from the current iframe annotator.
- Add integration tests for the local browser-session server API where practical: discovery, connect, heartbeat, finalize, approve, and cancel.
- Add extension-level tests with a lightweight browser automation harness if feasible. These should verify Start, No session found, Retry, injection, Stop cleanup, and Send Feedback against a local fixture page.
- Manual QA should include local dev pages, pages with client-side routing, pages with scroll, pages with nested interactive controls, and pages where Browse mode is needed before selecting elements.

## Out of Scope

- Continuous background monitoring of tabs.
- Cloud-hosted Pinpoint sessions.
- Telemetry, accounts, or remote storage.
- Firefox or Safari extension support in v1.
- Visual diffing.
- Full-page stitched screenshots unless added by a later PRD.
- Multi-tab annotation in one session.
- Collaboration between multiple reviewers.
- Persisting stopped draft annotations.
- Automatically attaching to arbitrary tabs without a user clicking Start.
- Replacing the existing HTML/Markdown file annotation workflow.

## Further Notes

- The strongest v1 user experience is explicit and local: the agent or terminal starts a browser session, the extension says Start, and the user chooses the tab to annotate.
- The biggest technical risk is sharing annotation behavior between the current iframe-based app and a content-script-based extension without duplicating too much code.
- The second major risk is CSS and DOM isolation. The injected Pinpoint UI and page overlays must not break the inspected app, and the inspected app's CSS must not break Pinpoint controls.
- The fixed discovery surface should be designed carefully so it remains local-only and does not conflict with multiple concurrent Pinpoint sessions.
- If multiple browser sessions are running, the extension should show enough information for the user to pick the intended session, such as project label, command source, started time, or session title.

## Tasks

### 1. Browser Session CLI Tracer

**Type:** AFK

**Blocked by:** None - can start immediately

**User stories covered:** 1, 2, 21, 22, 23, 26, 27

**What to build:** Add a minimal browser review command path that can be started from the CLI and blocks until it receives feedback, approval, or cancellation. This slice should prove the end-to-end terminal behavior without requiring the Chrome extension yet, using a small test client or direct HTTP calls.

**Acceptance criteria:**

- [ ] A new browser-session command can be started from the CLI without changing the existing `pinpoint annotate <file>` behavior.
- [ ] The command prints clear instructions telling the user to open the Chrome extension and click Start.
- [ ] The command blocks until it receives feedback, approval, cancellation, timeout, SIGINT, or SIGTERM.
- [ ] Feedback returns to stdout in a browser-session brief format.
- [ ] Approval returns the same kind of explicit no-changes result the current file flow uses.
- [ ] Cancellation returns a no-feedback result and does not produce a feedback brief.

**Self-test:**

- [ ] Add automated tests for browser-session lifecycle states using direct local requests.
- [ ] Manually run the command, finalize it with a test request, and verify stdout/stderr separation remains agent-safe.

### 2. Local Discovery And Session Token

**Type:** AFK

**Blocked by:** Task 1

**User stories covered:** 3, 4, 5, 6, 7, 8, 24, 25

**What to build:** Add the local rendezvous API that the extension can check after Start. It should expose only enough information for the extension to find active browser sessions and connect with a per-session token.

**Acceptance criteria:**

- [ ] Browser sessions register with a known local discovery surface.
- [ ] Discovery returns no active session when no browser review is running.
- [ ] Discovery returns active browser-session metadata when a browser review is waiting.
- [ ] Each session has a generated token required for connect, heartbeat, approve, cancel, and feedback submission.
- [ ] Invalid or missing tokens cannot finalize a session.
- [ ] Discovery and session APIs bind locally only.

**Self-test:**

- [ ] Add integration tests for no-session discovery, active-session discovery, token-required finalize, invalid-token rejection, and valid-token finalize.
- [ ] Manually run two browser sessions if supported by the implementation decision and verify discovery behavior is deterministic.

### 3. Extension Shell With Passive Start, Retry, And Stop

**Type:** AFK

**Blocked by:** Task 2

**User stories covered:** 3, 4, 5, 6, 7, 8, 9, 10, 11, 23

**What to build:** Scaffold the Chrome extension UI and state machine. The extension starts idle, checks for sessions only after Start, retries a bounded number of times, shows No Pinpoint session found with Retry after failure, and supports Stop.

**Acceptance criteria:**

- [ ] The extension loads in Chrome as an unpacked extension during development.
- [ ] Idle state performs no polling, no heartbeat, and no content script injection.
- [ ] Start runs bounded discovery attempts only after the user clicks it.
- [ ] Failed discovery shows No Pinpoint session found and Retry.
- [ ] Retry repeats bounded discovery attempts.
- [ ] Connected state shows Stop.
- [ ] Stop discards extension-side draft state and returns to idle.

**Self-test:**

- [ ] Add tests for the extension state machine independent of Chrome APIs where practical.
- [ ] Add a manual test checklist for loading the extension, Start with no session, Retry with no session, Start with a session, and Stop.

### 4. Active-Tab Injection And Cleanup

**Type:** AFK

**Blocked by:** Task 3

**User stories covered:** 9, 10, 11, 12, 13, 14, 20, 23

**What to build:** Inject the Pinpoint annotation layer into the active tab only after a session is connected, then remove all injected behavior and visual artifacts on Stop or cancellation.

**Acceptance criteria:**

- [ ] The extension injects into only the active tab selected by the user.
- [ ] Inspect mode highlights hovered elements and click-selects an element for annotation.
- [ ] Browse mode lets the page receive normal pointer/click interactions.
- [ ] Injected styles, event listeners, hover outlines, selected outlines, and badges are removed on Stop.
- [ ] Stop discards annotations rather than preserving drafts.
- [ ] Repeated Start and Stop cycles do not duplicate listeners or leave stale page artifacts.

**Self-test:**

- [ ] Add an automated or semi-automated fixture-page test that verifies injection, element selection, Browse mode, and cleanup.
- [ ] Manually test against a local app page with buttons, links, scrolling, and client-side route changes.

### 5. Extension Annotation Panel

**Type:** AFK

**Blocked by:** Task 4

**User stories covered:** 15, 16, 17, 18, 19, 20

**What to build:** Build the extension-side annotation UI, preferably in Chrome Side Panel if feasible, with page-wide note, annotation list, delete, clear, locate, Inspect/Browse, Approve, Send Feedback, and Stop.

**Acceptance criteria:**

- [ ] The panel shows the active browser session status.
- [ ] The panel supports editing a page-wide note.
- [ ] Element annotations appear in the panel after selecting page elements.
- [ ] Annotation comments can be edited.
- [ ] Individual annotations can be deleted.
- [ ] Clear removes all annotations for the active session.
- [ ] Locate scrolls the current page to the annotated element when it still exists.
- [ ] Missing elements are clearly indicated instead of causing errors.

**Self-test:**

- [ ] Add UI tests or a browser automation checklist covering add, edit, delete, clear, locate, missing element, mode toggle, and Stop.
- [ ] Verify the panel remains usable on narrow extension surfaces and does not rely on in-page CSS.

### 6. Browser Feedback Brief Without Screenshot

**Type:** AFK

**Blocked by:** Task 5

**User stories covered:** 13, 14, 15, 16, 21, 22, 28, 29

**What to build:** Send browser annotations and page metadata from the extension to the local session server and convert them into a structured browser feedback brief.

**Acceptance criteria:**

- [ ] Send Feedback posts page URL, page title, page-wide note, and element annotations to the local session server.
- [ ] The returned brief distinguishes browser-session feedback from file-session feedback.
- [ ] The brief includes page URL and title near the top.
- [ ] Each annotation includes selector, tag, visible text, short HTML context, and comment.
- [ ] Approve returns no-changes output.
- [ ] Existing file-session brief generation remains unchanged.

**Self-test:**

- [ ] Add unit tests for browser feedback brief generation.
- [ ] Add an integration test where extension-shaped JSON produces the expected stdout brief.
- [ ] Manually submit one browser annotation and verify the agent-readable output.

### 7. Screenshot Capture And Artifact Reference

**Type:** AFK

**Blocked by:** Task 6

**User stories covered:** 21, 31, 32

**What to build:** Capture a screenshot when the user sends browser feedback, transmit it with the browser feedback payload, persist it as a local artifact, and reference it in the feedback brief.

**Acceptance criteria:**

- [ ] Send Feedback captures a screenshot of the browser tab visible to the user at final review time.
- [ ] The screenshot is sent with the feedback payload or uploaded to the local session server before finalization.
- [ ] The local server persists the screenshot artifact in a predictable session-specific location.
- [ ] The feedback brief includes a screenshot reference near the top.
- [ ] If screenshot capture fails, the feedback still sends and the brief clearly says the screenshot was unavailable.
- [ ] Approval and Stop do not create screenshot artifacts.

**Self-test:**

- [ ] Add tests for screenshot metadata handling and artifact persistence using a small fixture image payload.
- [ ] Add a manual Chrome test that sends feedback and verifies the saved screenshot opens and matches the reviewed tab.
- [ ] Verify failed screenshot capture does not block annotation feedback.

### 8. Extension Packaging And Install Docs

**Type:** AFK

**Blocked by:** Task 7

**User stories covered:** 27, 30

**What to build:** Add build, package, and local development documentation for the Chrome extension, plus update Pinpoint user docs and skill/slash-command guidance for browser review.

**Acceptance criteria:**

- [ ] The repo has a documented command or steps to build the extension.
- [ ] The repo explains how to load the extension unpacked in Chrome.
- [ ] The README explains when to use file review versus browser review.
- [ ] The slash command or skill guidance tells the agent how to start a browser review and instruct the user to click Start.
- [ ] Docs mention that Stop discards annotations.
- [ ] Docs mention that browser feedback includes a screenshot when feedback is sent.

**Self-test:**

- [ ] Follow the docs from a clean checkout and confirm the extension can be loaded.
- [ ] Run the documented browser-review flow end to end.

### 9. Browser Review End-To-End Smoke Test

**Type:** AFK

**Blocked by:** Task 8

**User stories covered:** 1-32

**What to build:** Add one end-to-end smoke test or repeatable manual verification script for the complete browser review path: CLI starts, extension connects after Start, annotation is added, screenshot is captured, feedback returns to CLI, and Stop/cleanup behavior is verified separately.

**Acceptance criteria:**

- [ ] A fixture page can be used for browser review verification.
- [ ] The happy path verifies Start, connect, inspect, annotate, page-wide note, screenshot capture, Send Feedback, and CLI output.
- [ ] The cancel path verifies Stop discards annotations and does not send feedback.
- [ ] The no-session path verifies Start retries a bounded number of times and then shows No Pinpoint session found with Retry.
- [ ] The test or checklist can be run independently of unrelated development work.

**Self-test:**

- [ ] Run the smoke flow locally and record the exact command sequence in docs or test output.
- [ ] Confirm `bun test` or the chosen test command still passes after adding the browser review smoke coverage.

## Agent Prompt

Use this prompt to hand one task to an implementation agent:

```text
You are working in the Pinpoint repo. Implement exactly one vertical-slice task from docs/prd-chrome-extension-browser-pinpoint.md.

Task to implement: <paste the task title and full task body here>

Constraints:
- Keep the existing file-based `pinpoint annotate <file>` workflow working.
- Do not take unrelated refactors.
- Make the slice independently testable and demoable.
- Add or update tests for the behavior introduced by this slice.
- If the slice touches browser feedback, preserve the PRD requirement that browser feedback can include both structured annotations and a screenshot artifact.
- Run the relevant tests before finishing and report exactly what passed or could not be run.

Deliverables:
- Code/docs changes for this one task only.
- A short summary of behavior added.
- Test evidence.
- Any follow-up tasks discovered, without implementing them unless they are required for this slice.
```
