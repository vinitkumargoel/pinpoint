/**
 * Assemble the bundled artefacts the runtime depends on:
 *
 *  - src/ui/annotator.html         — the annotator app (chrome + iframe shell)
 *  - src/diff-runtime/runtime.js   — the iframe-side runtime embedded into
 *                                    every rendered diff page by src/diff.ts
 *
 * Both outputs are git-ignored. The annotator HTML is what `src/server.ts`
 * embeds; the runtime JS is text-imported by `src/diff.ts`. Source stays
 * split, typed, and navigable; the binary still ships as one asset.
 *
 * Run via `bun run build:ui`.
 */
import { join } from "node:path";

const SRC = join(import.meta.dir, "..", "src");
const UI = join(SRC, "ui");
const OUT_HTML = join(UI, "annotator.html");
const OUT_RUNTIME = join(SRC, "diff-runtime", "runtime.bundle.js");

// ---------- annotator UI ----------

const ui = await Bun.build({
  entrypoints: [join(UI, "app", "main.ts")],
  target: "browser",
  format: "iife",
  minify: false,
});
if (!ui.success) {
  console.error("UI bundle failed:");
  for (const log of ui.logs) console.error(log);
  process.exit(1);
}
let uiJs = await ui.outputs[0]!.text();
// Guard against a literal </script> inside any string ending the inline tag early.
uiJs = uiJs.replace(/<\/script/gi, "<\\/script");

const css = await Bun.file(join(UI, "app.css")).text();
const shell = await Bun.file(join(UI, "index.html")).text();

const html = shell
  .replace("<!-- PINPOINT_STYLES -->", `<style>\n${css}\n</style>`)
  .replace("<!-- PINPOINT_SCRIPT -->", `<script>\n${uiJs}\n</script>`);

if (html.includes("<!-- PINPOINT_STYLES -->") || html.includes("<!-- PINPOINT_SCRIPT -->")) {
  console.error("error: index.html is missing a placeholder (PINPOINT_STYLES / PINPOINT_SCRIPT)");
  process.exit(1);
}

await Bun.write(OUT_HTML, html);
console.error(`✓ built src/ui/annotator.html (${(html.length / 1024).toFixed(1)} KB)`);

// ---------- diff iframe runtime ----------

const runtime = await Bun.build({
  entrypoints: [join(SRC, "diff-runtime", "entry.ts")],
  target: "browser",
  format: "iife",
  minify: false,
});
if (!runtime.success) {
  console.error("diff-runtime bundle failed:");
  for (const log of runtime.logs) console.error(log);
  process.exit(1);
}
let runtimeJs = await runtime.outputs[0]!.text();
runtimeJs = runtimeJs.replace(/<\/script/gi, "<\\/script");

await Bun.write(OUT_RUNTIME, runtimeJs);
console.error(`✓ built src/diff-runtime/runtime.bundle.js (${(runtimeJs.length / 1024).toFixed(1)} KB)`);
