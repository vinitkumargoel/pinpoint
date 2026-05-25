# Browser Review Smoke Test

Pass 9 adds an automated smoke test for the browser review path plus this
repeatable Chrome checklist.

## Automated Smoke

Run the self-contained smoke test:

```bash
bun run test:browser-review-smoke
```

The test starts the CLI with a random local port, connects through the extension
state machine, annotates `test/fixture/browser-review-smoke.html`, captures a
fixture screenshot, sends browser feedback, verifies the CLI output, then tests
Stop cleanup and the no-session Retry state.

The equivalent direct command is:

```bash
PINPOINT_BROWSER_ARTIFACT_ROOT="$(mktemp -d)" bun run src/index.ts browser --timeout-ms 5000 --port 0
```

## Manual Chrome Checklist

1. Build the extension:

```bash
bun run build:extension
```

2. Load `dist/extension` from `chrome://extensions` with Developer Mode enabled.

3. Serve the fixture page:

```bash
bun -e "Bun.serve({ port: 4173, fetch: () => new Response(Bun.file('test/fixture/browser-review-smoke.html')) }); await new Promise(() => {})"
```

4. Open the fixture page:

```text
http://127.0.0.1:4173/browser-review-smoke.html
```

5. Start a browser review session:

```bash
bun run src/index.ts browser --timeout-ms 120000
```

6. In Chrome, open the Pinpoint extension panel and click **Start**.

7. Verify the happy path:

- The extension connects to the waiting session.
- Inspect mode highlights the **Save changes** button.
- Clicking **Save changes** adds an annotation.
- Add a page-wide note.
- Edit the annotation comment.
- Click **Send Feedback**.
- The CLI prints a `# Browser UI Feedback` brief with page metadata, annotation details, and a screenshot path.

8. Verify Stop cleanup separately:

- Start another browser session.
- Click **Start** in the extension.
- Add one annotation and a page-wide note.
- Click **Stop**.
- The extension returns to idle.
- The annotation badge/highlight disappears from the page.
- Clicking the page works normally.
- The terminal session receives no feedback brief from Stop.

9. Verify the no-session path:

- Stop all `pinpoint browser` sessions.
- Open the extension panel and click **Start**.
- Confirm it performs bounded checks, then shows **No Pinpoint session found** with **Retry**.
- Click **Retry** and confirm it repeats the same bounded behavior.
