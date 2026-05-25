# Chrome Extension Pass 4 Manual Checklist

Use this checklist after loading `/Users/vinit.kumar/Official/work/Pinpoint/src/extension` as an unpacked Chrome extension.

## Fixture setup

1. Start a browser session:

   ```bash
   bun run src/index.ts browser-session --timeout-ms 60000
   ```

2. Open a local page with buttons, links, scrolling, and client-side route changes. The existing fixture works for a basic pass:

   ```bash
   PINPOINT_NO_OPEN=1 bun run src/index.ts annotate test/fixture/index.html
   ```

## Checks

- Click the extension **Start** button while the browser-session command is waiting.
- Verify only the active tab receives hover outlines.
- In **Inspect** mode, hover a button or link and verify the outline appears.
- Click that element and verify a selected outline plus numbered badge appears.
- Switch to **Browse** mode and verify normal page clicks work without creating annotations.
- Click **Stop** and verify all outlines and badges disappear.
- Click **Start** again, select another element, then **Stop** again. Verify there are no duplicate badges or stale outlines.
- On a client-side route change, verify **Stop** still removes injected artifacts from the current page.
