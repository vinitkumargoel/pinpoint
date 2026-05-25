const STYLE_ID = "__pinpoint_browser_review_style";
const BADGE_CLASS = "__pinpoint-browser-review-badge";
const HOVER_CLASS = "__pinpoint-browser-review-hover";
const SELECTED_CLASS = "__pinpoint-browser-review-selected";

function cssEscape(value) {
  const css = globalThis.CSS;
  if (css && typeof css.escape === "function") return css.escape(value);
  return String(value).replace(/([^\w-])/g, "\\$1");
}

export function getElementSelector(element) {
  const doc = element.ownerDocument;
  if (element.id && doc.querySelectorAll(`#${cssEscape(element.id)}`).length === 1) {
    return `#${cssEscape(element.id)}`;
  }

  const parts = [];
  let current = element;
  while (current && current.nodeType === 1 && current !== doc.body && current !== doc.documentElement) {
    let part = current.tagName.toLowerCase();
    if (current.id && doc.querySelectorAll(`#${cssEscape(current.id)}`).length === 1) {
      parts.unshift(`#${cssEscape(current.id)}`);
      break;
    }

    const classes = Array.from(current.classList || []).filter((name) => !name.startsWith("__pinpoint-"));
    if (classes.length) part += `.${classes.slice(0, 2).map(cssEscape).join(".")}`;

    const parent = current.parentElement;
    if (parent?.children) {
      const sameTag = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
    }

    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

/** Strip Pinpoint's own injected classes (and any emptied class attr) from a node tree. */
function stripPinpointClasses(root) {
  const nodes = [root, ...(root.querySelectorAll ? Array.from(root.querySelectorAll("*")) : [])];
  for (const node of nodes) {
    if (!node.classList) continue;
    for (const cls of Array.from(node.classList)) {
      if (cls.startsWith("__pinpoint-")) node.classList.remove(cls);
    }
    if (node.classList.length === 0 && node.getAttribute?.("class") === "") {
      node.removeAttribute("class");
    }
  }
  return root;
}

export function shortOuter(element, max = 200) {
  // Clone and clean so Pinpoint's hover/selected classes never leak into feedback.
  const source = element.cloneNode ? stripPinpointClasses(element.cloneNode(true)) : element;
  const html = (source.outerHTML || "").replace(/\s+/g, " ").trim();
  return html.length > max ? `${html.slice(0, max)}...` : html;
}

function isElement(value) {
  return value && value.nodeType === 1;
}

function isPinpointNode(element) {
  return Boolean(element.closest?.(`.${BADGE_CLASS}`) || element.id === STYLE_ID);
}

function injectStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${HOVER_CLASS} {
      outline: 2px solid #0f6a62 !important;
      outline-offset: 2px !important;
      cursor: crosshair !important;
    }
    .${SELECTED_CLASS} {
      outline: 3px solid #d68b25 !important;
      outline-offset: 3px !important;
    }
    .${BADGE_CLASS} {
      position: absolute !important;
      z-index: 2147483647 !important;
      min-width: 22px !important;
      height: 22px !important;
      padding: 0 6px !important;
      border-radius: 999px !important;
      background: #0f6a62 !important;
      color: #fff !important;
      font: 700 12px/22px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
      text-align: center !important;
      pointer-events: none !important;
      box-shadow: 0 6px 18px rgb(0 0 0 / 22%) !important;
    }
  `;
  doc.documentElement.appendChild(style);
}

export function createAnnotationLayer(doc = document, win = window, options = {}) {
  let mode = "inspect";
  let hoverElement = null;
  let installed = false;
  let annotations = [];

  function snapshot() {
    return {
      installed,
      mode,
      annotations: annotations.map((annotation) => ({
        ...annotation,
        missing: !doc.querySelector(annotation.selector),
      })),
    };
  }

  function emitChange() {
    if (typeof options.onChange !== "function") return;
    options.onChange(snapshot());
  }

  function clearHover() {
    if (hoverElement) hoverElement.classList.remove(HOVER_CLASS);
    hoverElement = null;
  }

  function removeBadges() {
    for (const badge of Array.from(doc.querySelectorAll(`.${BADGE_CLASS}`))) badge.remove();
  }

  function renderBadges() {
    removeBadges();
    annotations.forEach((annotation, index) => {
      const element = doc.querySelector(annotation.selector);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const badge = doc.createElement("span");
      badge.className = BADGE_CLASS;
      badge.dataset.pinpointAnnotationId = annotation.id;
      badge.textContent = String(index + 1);
      badge.style.left = `${Math.max(0, rect.left + win.scrollX)}px`;
      badge.style.top = `${Math.max(0, rect.top + win.scrollY - 24)}px`;
      doc.body.appendChild(badge);
    });
  }

  function selectElement(element) {
    if (!isElement(element) || isPinpointNode(element)) return null;
    const id = `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const annotation = {
      id,
      selector: getElementSelector(element),
      tag: element.tagName.toLowerCase(),
      text: (element.textContent || "").trim().slice(0, 120),
      outerHTML: shortOuter(element),
      comment: "",
      createdAt: new Date().toISOString(),
    };
    annotations.push(annotation);
    element.classList.add(SELECTED_CLASS);
    renderBadges();
    emitChange();
    return annotation;
  }

  function updateAnnotationComment(id, comment) {
    annotations = annotations.map((annotation) =>
      annotation.id === id ? { ...annotation, comment: String(comment || "") } : annotation,
    );
    emitChange();
    return snapshot();
  }

  function removeAnnotation(id) {
    const removed = annotations.find((annotation) => annotation.id === id);
    annotations = annotations.filter((annotation) => annotation.id !== id);
    if (removed) {
      const element = doc.querySelector(removed.selector);
      const stillSelected = annotations.some((annotation) => annotation.selector === removed.selector);
      if (element && !stillSelected) element.classList.remove(SELECTED_CLASS);
    }
    renderBadges();
    emitChange();
    return snapshot();
  }

  function clearAnnotations() {
    annotations = [];
    for (const element of Array.from(doc.querySelectorAll(`.${SELECTED_CLASS}`))) {
      element.classList.remove(SELECTED_CLASS);
    }
    removeBadges();
    emitChange();
    return snapshot();
  }

  function locateAnnotation(id) {
    const annotation = annotations.find((item) => item.id === id);
    const element = annotation ? doc.querySelector(annotation.selector) : null;
    if (!element) {
      emitChange();
      return { found: false, state: snapshot() };
    }
    if (typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    }
    clearHover();
    element.classList.add(HOVER_CLASS);
    win.setTimeout?.(() => {
      if (hoverElement !== element) element.classList.remove(HOVER_CLASS);
    }, 900);
    renderBadges();
    return { found: true, state: snapshot() };
  }

  function onMouseOver(event) {
    if (mode !== "inspect") return;
    const target = event.target;
    if (!isElement(target) || isPinpointNode(target)) return;
    if (hoverElement === target) return;
    clearHover();
    hoverElement = target;
    hoverElement.classList.add(HOVER_CLASS);
  }

  function onMouseOut(event) {
    if (mode !== "inspect") return;
    if (event.target === hoverElement) clearHover();
  }

  function onClick(event) {
    if (mode !== "inspect") return;
    const target = event.target;
    if (!isElement(target) || isPinpointNode(target)) return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(target);
  }

  function install() {
    cleanup();
    injectStyle(doc);
    installed = true;
    doc.addEventListener("mouseover", onMouseOver, true);
    doc.addEventListener("mouseout", onMouseOut, true);
    doc.addEventListener("click", onClick, true);
    win.addEventListener("scroll", renderBadges, true);
    win.addEventListener("resize", renderBadges, true);
    return snapshot();
  }

  function setMode(nextMode) {
    mode = nextMode === "browse" ? "browse" : "inspect";
    if (mode === "browse") clearHover();
    return snapshot();
  }

  function cleanup() {
    doc.removeEventListener("mouseover", onMouseOver, true);
    doc.removeEventListener("mouseout", onMouseOut, true);
    doc.removeEventListener("click", onClick, true);
    win.removeEventListener("scroll", renderBadges, true);
    win.removeEventListener("resize", renderBadges, true);
    clearHover();
    for (const element of Array.from(doc.querySelectorAll(`.${SELECTED_CLASS}`))) {
      element.classList.remove(SELECTED_CLASS);
    }
    removeBadges();
    doc.getElementById(STYLE_ID)?.remove();
    annotations = [];
    installed = false;
    mode = "inspect";
    const state = snapshot();
    emitChange();
    return state;
  }

  return {
    install,
    cleanup,
    setMode,
    selectElement,
    updateAnnotationComment,
    removeAnnotation,
    clearAnnotations,
    locateAnnotation,
    getState: snapshot,
  };
}
