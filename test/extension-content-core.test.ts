import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createAnnotationLayer } from "../src/extension/content-core.js";

GlobalRegistrator.register({ url: "http://localhost/fixture" });

function fixture() {
  document.body.innerHTML = `
    <main>
      <div id="primary-action" role="button">Save changes</div>
      <span class="nav-link">Details</span>
      <section id="details"><p class="copy">Client-side content</p></section>
    </main>
  `;
}

function mouse(type: string, target: Element): boolean {
  return target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
}

describe("extension annotation content core", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  test("inspect mode highlights hovered elements and click-selects an annotation", () => {
    fixture();
    const layer = createAnnotationLayer(document, window);
    layer.install();

    const button = document.querySelector("#primary-action")!;
    mouse("mouseover", button);
    expect(button.classList.contains("__pinpoint-browser-review-hover")).toBe(true);

    const clickWasNotCanceled = mouse("click", button);
    const state = layer.getState();

    expect(clickWasNotCanceled).toBe(false);
    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0].selector).toBe("#primary-action");
    expect(button.classList.contains("__pinpoint-browser-review-selected")).toBe(true);
    expect(document.querySelectorAll(".__pinpoint-browser-review-badge")).toHaveLength(1);
    // The captured HTML context must not leak Pinpoint's own injected classes.
    expect(state.annotations[0].outerHTML).not.toContain("__pinpoint-");
    layer.cleanup();
  });

  test("browse mode allows normal page pointer and click behavior", () => {
    fixture();
    const layer = createAnnotationLayer(document, window);
    layer.install();
    layer.setMode("browse");

    const link = document.querySelector(".nav-link")!;
    let defaultPrevented = true;
    let pageClickCount = 0;
    link.addEventListener("click", (event) => {
      defaultPrevented = event.defaultPrevented;
      pageClickCount += 1;
    });
    mouse("mouseover", link);
    mouse("click", link);

    expect(defaultPrevented).toBe(false);
    expect(pageClickCount).toBe(1);
    expect(link.classList.contains("__pinpoint-browser-review-hover")).toBe(false);
    expect(layer.getState().annotations).toHaveLength(0);
    layer.cleanup();
  });

  test("cleanup removes injected styles, listeners, highlights, badges, and annotations", () => {
    fixture();
    const layer = createAnnotationLayer(document, window);
    layer.install();

    const button = document.querySelector("#primary-action")!;
    mouse("mouseover", button);
    mouse("click", button);

    const stopped = layer.cleanup();
    let defaultPrevented = true;
    let pageClickCount = 0;
    button.addEventListener("click", (event) => {
      defaultPrevented = event.defaultPrevented;
      pageClickCount += 1;
    });
    mouse("mouseover", button);
    mouse("click", button);

    expect(stopped.installed).toBe(false);
    expect(stopped.annotations).toEqual([]);
    expect(defaultPrevented).toBe(false);
    expect(pageClickCount).toBe(1);
    expect(button.classList.contains("__pinpoint-browser-review-hover")).toBe(false);
    expect(button.classList.contains("__pinpoint-browser-review-selected")).toBe(false);
    expect(document.querySelector("#__pinpoint_browser_review_style")).toBeNull();
    expect(document.querySelectorAll(".__pinpoint-browser-review-badge")).toHaveLength(0);
    expect(layer.getState().annotations).toHaveLength(0);
  });

  test("repeated install cycles do not duplicate click listeners", () => {
    fixture();
    const layer = createAnnotationLayer(document, window);
    layer.install();
    layer.install();

    const button = document.querySelector("#primary-action")!;
    mouse("click", button);

    expect(layer.getState().annotations).toHaveLength(1);
    layer.cleanup();
  });

  test("updates, deletes, clears, and locates annotations", () => {
    fixture();
    const layer = createAnnotationLayer(document, window);
    layer.install();

    const button = document.querySelector("#primary-action")!;
    mouse("click", button);
    const id = layer.getState().annotations[0].id;

    layer.updateAnnotationComment(id, "Make this clearer");
    expect(layer.getState().annotations[0].comment).toBe("Make this clearer");

    const located = layer.locateAnnotation(id);
    expect(located.found).toBe(true);

    layer.removeAnnotation(id);
    expect(layer.getState().annotations).toHaveLength(0);
    expect(button.classList.contains("__pinpoint-browser-review-selected")).toBe(false);

    mouse("click", document.querySelector(".nav-link")!);
    mouse("click", document.querySelector(".copy")!);
    expect(layer.getState().annotations).toHaveLength(2);
    layer.clearAnnotations();
    expect(layer.getState().annotations).toHaveLength(0);
    expect(document.querySelectorAll(".__pinpoint-browser-review-badge")).toHaveLength(0);
    layer.cleanup();
  });

  test("marks annotations as missing when the selected element is gone", () => {
    fixture();
    const layer = createAnnotationLayer(document, window);
    layer.install();

    const details = document.querySelector("#details")!;
    mouse("click", details);
    const id = layer.getState().annotations[0].id;
    details.remove();

    const state = layer.getState();
    expect(state.annotations[0].missing).toBe(true);
    expect(layer.locateAnnotation(id).found).toBe(false);
    layer.cleanup();
  });
});

afterAll(() => {
  GlobalRegistrator.unregister();
});
