import { ctx } from "./state";
import { activeDoc, escapeHtml } from "./dom";
import { getSelector } from "./selector";

let labelEl: HTMLElement | null = null;
function label(): HTMLElement | null {
  if (!labelEl) labelEl = document.getElementById("hover-label");
  return labelEl;
}

/** Show the floating selector label for the hovered element. */
export function showHover(el: Element, evt: MouseEvent, dir: string): void {
  const node = label();
  if (!node) return;
  const sel = getSelector(el);
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList).filter((c) => !c.startsWith("__pp-"));
  let html = `<span class="t">&lt;${tag}&gt;</span>`;
  if (el.id) html += ` #${escapeHtml(el.id)}`;
  if (classes.length) html += ` .${escapeHtml(classes.join("."))}`;
  html += ` <span class="s">${escapeHtml(sel)}</span>`;
  node.innerHTML = html;
  node.style.display = "block";
  posHover(evt, dir);
}

/** Position the label near the cursor (mapped from iframe to page coords). */
export function posHover(evt: MouseEvent, dir: string): void {
  const node = label();
  const shell = ctx.shells[dir];
  if (!node || !shell) return;
  const r = shell.iframe.getBoundingClientRect();
  const x = r.left + evt.clientX + 14;
  const y = r.top + evt.clientY + 14;
  node.style.left = Math.min(x, window.innerWidth - 470) + "px";
  node.style.top = Math.min(y, window.innerHeight - 34) + "px";
}

export function hideHover(): void {
  const node = label();
  if (node) node.style.display = "none";
  const doc = activeDoc();
  if (doc) doc.querySelectorAll(".__pp-hover").forEach((el) => el.classList.remove("__pp-hover"));
}
