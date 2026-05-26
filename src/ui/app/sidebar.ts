import type { Annotation } from "./types";
import { state, ctx } from "./state";
import { CFG } from "./config";
import { q, activeDoc, escapeHtml, elementExists, updateFinalizeButtons } from "./dom";
import { reapplyActive, scrollToElement } from "./iframe";
import { updateComment, deleteAnnot, requestDeleteAnnot } from "./annotations";

function refBlock(a: Annotation): string {
  if (CFG.kind === "review" && a.review) {
    const r = a.review;
    const first = r.lines[0]!;
    const last = r.lines[r.lines.length - 1]!;
    const side =
      first.kind === "del" && first.newLine == null
        ? "old"
        : first.kind === "add" || first.newLine != null
          ? "new"
          : "new";
    const startN = side === "old" ? first.oldLine : first.newLine;
    const endN = side === "old" ? last.oldLine : last.newLine;
    const range = startN === endN ? `${startN}` : `${startN}-${endN}`;
    const ref = `${r.file} · line ${range} (${side})`;
    const preview = r.lines
      .map((l) => {
        const sign = l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ";
        return `<div class="annot-line-preview ${escapeHtml(l.kind)}">${escapeHtml(sign + l.text)}</div>`;
      })
      .join("");
    return `<div class="annot-line-ref">${escapeHtml(ref)}</div>${preview}`;
  }
  return (
    `<div class="annot-selector">${escapeHtml(a.selector)}</div>` +
    `<div class="annot-preview" title="${escapeHtml(a.outerHTML)}">${escapeHtml(a.outerHTML)}</div>`
  );
}

/** Rebuild the annotation list (and counts) in the active shell's sidebar. */
export function render(): void {
  if (!ctx.active) return;
  const list = q("annot-list");
  if (!list) return;
  list.innerHTML = "";

  const gc = q("global-comment") as HTMLTextAreaElement | null;
  if (gc && gc.value !== state.globalComment) gc.value = state.globalComment;

  const doc = activeDoc();
  const placeholder = CFG.kind === "review" ? "What needs to change here?" : "What needs to change here?";
  state.annotations.forEach((a, i) => {
    const n = i + 1;
    const found = elementExists(doc, a.selector);
    const el = document.createElement("div");
    el.className = "annot" + (state.selectedId === a.id ? " selected" : "") + (found ? "" : " missing");
    el.dataset.id = a.id;
    el.innerHTML = `
      <div class="annot-head">
        <span class="annot-num">#${n}${found ? "" : " &middot; missing"}</span>
        <div class="annot-actions">
          <button type="button" data-act="locate" title="Scroll to element" aria-label="Scroll to element"${found ? "" : " disabled"}>&#8675;</button>
          <button type="button" data-act="del" class="danger" title="Delete" aria-label="Delete">&#10005;</button>
        </div>
      </div>
      ${refBlock(a)}
      ${found ? "" : '<div class="annot-warn">⚠ This element isn’t on the page anymore.</div>'}
      <textarea placeholder="${escapeHtml(placeholder)}">${escapeHtml(a.comment)}</textarea>`;

    el.addEventListener("click", (e) => {
      const t = e.target as Element;
      if (t.closest("textarea") || t.closest("button")) return;
      state.selectedId = a.id;
      reapplyActive();
      render();
      scrollToElement(a.selector);
    });

    const ta = el.querySelector("textarea") as HTMLTextAreaElement;
    ta.addEventListener("input", (e) => updateComment(a.id, (e.target as HTMLTextAreaElement).value));
    // Leaving a still-blank annotation discards it automatically.
    ta.addEventListener("blur", (e) => {
      const cur = state.annotations.find((x) => x.id === a.id);
      if (!cur || cur.comment.trim() !== "") return;
      const rt = (e as FocusEvent).relatedTarget as Element | null;
      const nextCard = rt && rt.closest ? rt.closest(".annot") : null;
      const nextId = nextCard instanceof HTMLElement ? nextCard.dataset.id : null;
      const intoTextarea = rt instanceof HTMLTextAreaElement;
      deleteAnnot(a.id);
      if (intoTextarea && nextId) {
        const nta = ctx.active?.querySelector<HTMLTextAreaElement>(`.annot[data-id="${nextId}"] textarea`);
        if (nta) {
          nta.focus();
          try {
            nta.setSelectionRange(nta.value.length, nta.value.length);
          } catch {
            /* ignore */
          }
        }
      }
    });

    el.querySelector('[data-act="locate"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      scrollToElement(a.selector);
    });
    el.querySelector('[data-act="del"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      void requestDeleteAnnot(a.id);
    });
    list.appendChild(el);
  });

  const n = state.annotations.length;
  const counts = q("counts");
  if (counts) counts.textContent = n + (n === 1 ? " annotation" : " annotations");
  q("mode-inspect")?.classList.toggle("on", state.mode === "inspect");
  q("mode-browse")?.classList.toggle("on", state.mode === "browse");
  updateFinalizeButtons();
}
