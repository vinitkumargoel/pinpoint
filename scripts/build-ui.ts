/**
 * Assemble the annotator's source (index.html + app.css + the app/ TS modules)
 * into a single, self-contained HTML document: src/ui/annotator.html.
 *
 * That generated file is what src/server.ts embeds (and what `bun build
 * --compile` bakes into the binary), so the annotator still ships as one
 * static asset while its source stays split, typed, and navigable.
 *
 * Run via `bun run build:ui`. The output is git-ignored — regenerate any time.
 */
import { join } from "node:path";

const UI = join(import.meta.dir, "..", "src", "ui");
const OUT = join(UI, "annotator.html");

// 1) Bundle the TypeScript app into one self-executing browser script.
const built = await Bun.build({
  entrypoints: [join(UI, "app", "main.ts")],
  target: "browser",
  format: "iife",
  minify: false,
});
if (!built.success) {
  console.error("UI bundle failed:");
  for (const log of built.logs) console.error(log);
  process.exit(1);
}
let js = await built.outputs[0]!.text();
// Guard against a literal </script> inside any string ending the inline tag early.
js = js.replace(/<\/script/gi, "<\\/script");

// 2) Read the CSS and the HTML shell.
const css = await Bun.file(join(UI, "app.css")).text();
const shell = await Bun.file(join(UI, "index.html")).text();

// 3) Inline both into the shell's placeholders.
const html = shell
  .replace("<!-- PINPOINT_STYLES -->", `<style>\n${css}\n</style>`)
  .replace("<!-- PINPOINT_SCRIPT -->", `<script>\n${js}\n</script>`);

if (html.includes("<!-- PINPOINT_STYLES -->") || html.includes("<!-- PINPOINT_SCRIPT -->")) {
  console.error("error: index.html is missing a placeholder (PINPOINT_STYLES / PINPOINT_SCRIPT)");
  process.exit(1);
}

await Bun.write(OUT, html);
console.error(`✓ built src/ui/annotator.html (${(html.length / 1024).toFixed(1)} KB)`);
