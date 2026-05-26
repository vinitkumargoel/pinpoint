/**
 * Diff iframe runtime — the script that boots inside the diff page.
 *
 * The diff page is iframed by the Pinpoint annotator's review shell. The shell
 * drives view mode, jumps, theme, and per-file collapse via the shared
 * `review-protocol`; this runtime owns interactivity inside the page: chevron
 * toggles, hover-`+` buttons, drag-to-range selection, message routing.
 *
 * Authored as a TypeScript module so the drag-to-range logic — the most
 * error-prone code path in the review flow — gets type checks, editor
 * navigation, and unit-test reach. Bundled by `scripts/build-ui.ts` into a
 * single browser IIFE and text-imported by `src/diff.ts` for embedding in the
 * rendered page.
 *
 * The public surface is one function: `boot(doc, parentWindow)`. Calling it
 * wires every event handler on `doc` and starts listening for parent messages.
 */
import {
  annotateMsg,
  subscribeReviewMessages,
  type AnnotatePayload,
  type LineKind,
  type ReviewMessage,
  type Theme,
  type View,
} from "../review-protocol.ts";

export type { AnnotatePayload };

/** Outbound message produced when the user finalizes a range annotation. */
export type AnnotateMessage = Extract<ReviewMessage, { type: "review:annotate" }>;

/**
 * Wire all event handlers on `doc` and start routing parent messages.
 *
 * Tests call this with a happy-dom Document + a fake parent (any object with
 * a `postMessage` method); production code calls it from the bundled boot
 * script inside the iframe, with the iframe's own document + `window.parent`.
 */
export function boot(doc: Document, parentWindow: ParentWindow): void {
  const body = doc.body;
  wireChevrons(doc);
  wireDragToRange(doc, parentWindow);
  wireParentMessages(doc, body);
  setTheme(body, "light"); // parent overrides on first review:theme
}

interface ParentWindow {
  postMessage(message: unknown, targetOrigin: string): void;
}

// ---------- chevron (per-file collapse toggle) ----------

function wireChevrons(doc: Document): void {
  doc.querySelectorAll<HTMLElement>("section.file .chevron").forEach((ch) => {
    ch.addEventListener("click", (e) => {
      e.stopPropagation();
      ch.closest("section.file")?.classList.toggle("collapsed");
    });
  });
}

// ---------- drag-to-range selection ----------

interface DragState {
  lineEl: HTMLElement;
  viewEl: Element;
  side: string;
  /** Annotatable siblings (same view + same side) in document order. */
  siblings: HTMLElement[];
}

/** Visible only to tests — boot() owns this in production. */
export function wireDragToRange(doc: Document, parentWindow: ParentWindow): void {
  let dragStart: DragState | null = null;
  let ranged: HTMLElement[] = [];

  function clearRange(): void {
    ranged.forEach((l) => l.classList.remove("range-selecting", "range-start"));
    ranged = [];
  }

  function setRange(lines: HTMLElement[]): void {
    clearRange();
    ranged = lines;
    ranged.forEach((l) => l.classList.add("range-selecting"));
    if (dragStart && ranged.indexOf(dragStart.lineEl) !== -1) {
      dragStart.lineEl.classList.add("range-start");
    }
  }

  doc.addEventListener(
    "mousedown",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.classList?.contains("line-mark")) return;
      const line = t.closest<HTMLElement>(".line");
      if (!annotatable(line)) return;
      e.preventDefault();
      const v = viewOf(line);
      if (!v) return;
      dragStart = {
        lineEl: line,
        viewEl: v,
        side: sideOf(line),
        siblings: collectSiblings(v, line),
      };
      setRange([line]);
    },
    true,
  );

  doc.addEventListener(
    "mouseover",
    (e) => {
      if (!dragStart) return;
      const line = (e.target as HTMLElement | null)?.closest<HTMLElement>(".line") ?? null;
      if (!annotatable(line)) return;
      if (viewOf(line) !== dragStart.viewEl) return;
      if (sideOf(line) !== dragStart.side) return;
      const startIdx = dragStart.siblings.indexOf(dragStart.lineEl);
      const curIdx = dragStart.siblings.indexOf(line);
      if (startIdx < 0 || curIdx < 0) return;
      const lo = Math.min(startIdx, curIdx);
      const hi = Math.max(startIdx, curIdx);
      setRange(dragStart.siblings.slice(lo, hi + 1));
    },
    true,
  );

  doc.addEventListener(
    "mouseup",
    () => {
      if (!dragStart) return;
      const lines = ranged.slice();
      clearRange();
      const start = dragStart;
      dragStart = null;
      if (!lines.length) return;
      const payload = buildAnnotatePayload(start.lineEl, lines);
      try {
        parentWindow.postMessage(annotateMsg(payload), "*");
      } catch {
        /* postMessage can throw in detached contexts — swallow */
      }
    },
    true,
  );
}

function annotatable(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.classList.contains("line") && !el.classList.contains("blank") && !!el.dataset.file;
}

function viewOf(el: HTMLElement | null): Element | null {
  if (!el) return null;
  return el.closest(".hunk-split") ?? el.closest(".hunk-unified");
}

function sideOf(el: HTMLElement | null): string {
  return el?.dataset.side ?? "";
}

function collectSiblings(viewEl: Element, startEl: HTMLElement): HTMLElement[] {
  const startSide = sideOf(startEl);
  const nodes = Array.from(viewEl.querySelectorAll<HTMLElement>(".line"));
  return nodes.filter((l) => annotatable(l) && sideOf(l) === startSide);
}

function compareDocPos(a: Element, b: Element): number {
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

export function buildAnnotatePayload(startEl: HTMLElement, lines: HTMLElement[]): AnnotatePayload {
  // Normalize to ascending document order so downstream consumers can rely on
  // it — drag direction is irrelevant to the resulting brief.
  const sorted = lines.slice().sort(compareDocPos);
  return {
    file: startEl.dataset.file ?? "",
    lineKeys: sorted.map((l) => l.dataset.lineKey ?? ""),
    lines: sorted.map((l) => {
      const code = l.querySelector(".code");
      const oldRaw = l.dataset.oldLine ?? "";
      const newRaw = l.dataset.newLine ?? "";
      return {
        lineKey: l.dataset.lineKey ?? "",
        oldLine: oldRaw === "" ? null : parseInt(oldRaw, 10),
        newLine: newRaw === "" ? null : parseInt(newRaw, 10),
        kind: (l.dataset.kind as LineKind) ?? "ctx",
        text: (code?.textContent ?? "").replace(/\s+$/, ""),
      };
    }),
  };
}

// ---------- parent message routing ----------

function wireParentMessages(doc: Document, body: HTMLElement): void {
  const win = doc.defaultView;
  if (!win) return;
  subscribeReviewMessages(win, (m) => {
    switch (m.type) {
      case "review:view":
        setView(body, m.value);
        return;
      case "review:theme":
        setTheme(body, m.value);
        return;
      case "review:jump":
        if (m.target === "file") jumpFile(doc, body, m.dir);
        else jumpChange(doc, body, m.dir);
        return;
      case "review:expand-all":
        doc.querySelectorAll("section.file").forEach((s) => s.classList.remove("collapsed"));
        return;
      case "review:collapse-all":
        doc.querySelectorAll("section.file").forEach((s) => s.classList.add("collapsed"));
        return;
      case "review:scroll-to-file":
        doc.getElementById(m.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      case "review:annotate":
        // The diff page only emits this; the parent listens. Ignore here.
        return;
    }
  });
}

export function setView(body: HTMLElement, v: View): void {
  if (v !== "split" && v !== "unified") return;
  body.setAttribute("data-view", v);
}

export function setTheme(body: HTMLElement, v: Theme): void {
  if (v !== "light" && v !== "dark") return;
  body.setAttribute("data-theme", v);
}

function jumpFile(doc: Document, body: HTMLElement, dir: 1 | -1): void {
  void body;
  const files = Array.from(doc.querySelectorAll<HTMLElement>("section.file"));
  if (!files.length) return;
  const win = doc.defaultView;
  const top = (win?.scrollY ?? 0) + 60;
  let idx = 0;
  for (let i = 0; i < files.length; i++) {
    if ((files[i]?.offsetTop ?? 0) <= top) idx = i;
  }
  const next = Math.max(0, Math.min(files.length - 1, idx + dir));
  files[next]?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function jumpChange(doc: Document, body: HTMLElement, dir: 1 | -1): void {
  const view = body.getAttribute("data-view");
  const sel =
    view === "split"
      ? ".hunk-split .line.add, .hunk-split .line.del"
      : ".hunk-unified .line.add, .hunk-unified .line.del";
  const lines = Array.from(doc.querySelectorAll<HTMLElement>(sel));
  if (!lines.length) return;
  const win = doc.defaultView;
  const scrollY = win?.scrollY ?? 0;
  const top = scrollY + 80;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.getBoundingClientRect().top + scrollY < top) idx = i;
  }
  const next = Math.max(0, Math.min(lines.length - 1, idx + dir));
  lines[next]?.scrollIntoView({ behavior: "smooth", block: "center" });
}
