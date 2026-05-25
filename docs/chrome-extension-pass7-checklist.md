# Chrome Extension Pass 7 Checklist

Use this checklist to verify visible-tab screenshot capture after loading the unpacked extension from `src/extension`.

1. Start a browser session:

   ```bash
   bun run src/index.ts browser-session --timeout-ms 60000
   ```

2. Open a local or test page in Chrome, click the Pinpoint extension action, and click **Start**.
3. Add at least one element annotation and an optional page-wide note.
4. Click **Send Feedback**.
5. Confirm the terminal output includes a `Screenshot` line near the top of the browser feedback brief.
6. Open the referenced file under `~/.pinpoint/artifacts/browser/<session-id>/visible-tab-screenshot.png`.
7. Confirm the image matches the visible browser tab at the moment feedback was sent.
8. Start another browser session, click **Approve**, and confirm no screenshot file is created for that session.
9. Start another browser session, click **Start**, then **Stop**, and confirm Stop discards annotations without sending feedback or creating a screenshot file.

Failure-path check:

1. Temporarily make screenshot capture fail, for example by denying extension capture permissions or testing on a restricted Chrome page.
2. Add an annotation and click **Send Feedback**.
3. Confirm feedback still reaches the terminal and the brief says the screenshot was unavailable.
