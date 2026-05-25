# Chrome Extension Pass 3 Manual Checklist

Use this checklist for the Pass 3 extension shell only. Later passes will add tab injection, annotations, and feedback submission.

## Load the Extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `/Users/vinit.kumar/Official/work/Pinpoint/src/extension`.
5. Confirm the **Pinpoint Browser Review** extension appears and the popup opens from the toolbar.

## No Session Path

1. Make sure no `pinpoint browser-session` command is running.
2. Open the extension popup.
3. Confirm the initial state is **Idle** and no network checks happen until **Start** is clicked.
4. Click **Start**.
5. Confirm the popup performs a bounded set of checks and then shows **No session found** with **Retry**.
6. Click **Retry** and confirm it repeats the bounded checks.

## Connected Path

1. In a terminal, run:

   ```bash
   bun run src/index.ts browser-session --timeout-ms 30000
   ```

2. Open the extension popup and click **Start**.
3. Confirm it connects to the waiting session and shows **Stop**.
4. Confirm there is no tab overlay or page injection in this pass.
5. Click **Stop**.
6. Confirm the popup returns to **Idle** and any extension-side draft state is discarded.
