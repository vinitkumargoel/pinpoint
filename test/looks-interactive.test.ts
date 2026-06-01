import { describe, it, expect } from "bun:test";
import { looksInteractive } from "../src/commands/annotate.ts";

/**
 * `looksInteractive` decides whether the annotator should boot in Browse mode
 * (app — clicks drive the page) or Inspect mode (static mockup — clicks annotate).
 */
describe("looksInteractive", () => {
  it("flags an external script (CDN library) as interactive", () => {
    const html = `<html><body><script src="https://unpkg.com/preact"></script></body></html>`;
    expect(looksInteractive(html)).toBe(true);
  });

  it("flags a type=module script as interactive", () => {
    const html = `<script type="module">import x from "./x.js";</script>`;
    expect(looksInteractive(html)).toBe(true);
  });

  it("flags a type=text/babel script as interactive", () => {
    const html = `<script type="text/babel" data-type="module">render(<App/>, root);</script>`;
    expect(looksInteractive(html)).toBe(true);
  });

  it("flags a substantial inline script as interactive", () => {
    const big = "const x = 1;".repeat(80); // ~960 non-whitespace chars
    expect(looksInteractive(`<script>${big}</script>`)).toBe(true);
  });

  it("treats a small inline toggle (a doc with a sprinkle of JS) as static", () => {
    const html = `<script>
      document.querySelectorAll('[data-hider]').forEach(t =>
        t.addEventListener('click', () => t.closest('[data-opt]')?.classList.toggle('open')));
    </script>`;
    expect(looksInteractive(html)).toBe(false);
  });

  it("treats a plain static mockup (no scripts) as static", () => {
    const html = `<html><head><style>.x{color:red}</style></head><body><h1>Hello</h1></body></html>`;
    expect(looksInteractive(html)).toBe(false);
  });

  it("is case-insensitive about the script tag and attributes", () => {
    const html = `<SCRIPT SRC="https://cdn.example.com/lib.js"></SCRIPT>`;
    expect(looksInteractive(html)).toBe(true);
  });
});
