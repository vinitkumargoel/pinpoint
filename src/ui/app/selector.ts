/**
 * CSS selector generation for an annotated element. Produces a stable,
 * reusable selector (prefers a unique #id, else a tag/class/nth-of-type chain)
 * so an AI agent can locate the same element later.
 */
function cssEscape(s: string): string {
  return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, "\\$1");
}

export function getSelector(el: Element): string {
  const doc = el.ownerDocument;
  if (el.id && doc.querySelectorAll("#" + cssEscape(el.id)).length === 1) {
    return "#" + cssEscape(el.id);
  }
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1 && cur !== doc.body && cur !== doc.documentElement) {
    let part = cur.tagName.toLowerCase();
    if (cur.id && doc.querySelectorAll("#" + cssEscape(cur.id)).length === 1) {
      parts.unshift("#" + cssEscape(cur.id));
      break;
    }
    const classes = Array.from(cur.classList).filter((c) => !c.startsWith("__pp-"));
    if (classes.length) part += "." + classes.slice(0, 2).map(cssEscape).join(".");
    const parent = cur.parentNode as Element | null;
    if (parent && parent.children) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}

/** A trimmed, single-line snippet of the element's outerHTML for context. */
export function shortOuter(el: Element, max = 200): string {
  const html = (el.outerHTML || "").replace(/\s+/g, " ").trim();
  return html.length > max ? html.slice(0, max) + "…" : html;
}
