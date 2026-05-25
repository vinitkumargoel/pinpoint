# Chrome Extension Pass 5 Checklist

Use this checklist to verify the annotation panel after loading the unpacked extension from `src/extension`.

1. Start a browser session:

   ```bash
   bun run src/index.ts browser-session --timeout-ms 60000
   ```

2. Open a local or test page in Chrome, click the Pinpoint extension action, and confirm the side panel opens.
3. Click **Start** and confirm the panel shows **Connected**, the session id, Inspect/Browse controls, page note, annotations, Approve, Send Feedback, and Stop.
4. Type a page-wide note and confirm it remains visible while the session is connected.
5. In **Inspect** mode, click a page element and confirm it appears in the annotation list.
6. Edit the annotation comment, then switch to **Browse** and confirm normal page clicks work.
7. Click **Locate** for the annotation and confirm the page scrolls/highlights the element.
8. Delete the annotation and confirm its badge/highlight are removed from the page.
9. Add two annotations, click **Clear**, and confirm the list and page badges are removed.
10. Add an annotation, remove the selected element from the page with devtools or a route change, then click **Locate** and confirm the panel marks it as missing without throwing.
11. Click **Stop** and confirm annotations are discarded and the panel returns to idle.
12. Narrow the side panel and confirm controls, comments, and selector text wrap without relying on the reviewed page CSS.

Approve and Send Feedback are visible in this pass but disabled until Pass 6 wires finalization.
