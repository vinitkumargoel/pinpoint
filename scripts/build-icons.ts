import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Rasterize the master SVG logo into the PNG sizes Chrome needs for the toolbar
// action + extension listing. Chrome action icons must be PNG, not SVG, so we
// render the one SVG source with headless Chrome (no extra image deps required).
const ROOT = join(import.meta.dir, "..");
const ICONS = join(ROOT, "src", "extension", "icons");
const SVG = join(ICONS, "logo.svg");
const SIZES = [16, 32, 48, 128];

const CHROME =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const svg = await readFile(SVG, "utf8");
const work = await mkdtemp(join(tmpdir(), "pinpoint-icons-"));

try {
  for (const size of SIZES) {
    // Force the SVG to the exact target size; transparent page background.
    const sized = svg.replace(
      /<svg([^>]*?)width="128"([^>]*?)height="128"/,
      `<svg$1width="${size}"$2height="${size}"`,
    );
    const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${sized}`;
    const htmlPath = join(work, `icon-${size}.html`);
    const outPath = join(ICONS, `icon-${size}.png`);
    await writeFile(htmlPath, html);

    const proc = Bun.spawn(
      [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--default-background-color=00000000",
        `--window-size=${size},${size}`,
        `--screenshot=${outPath}`,
        htmlPath,
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    const code = await proc.exited;
    if (code !== 0) throw new Error(`Chrome failed to render icon-${size}.png (exit ${code})`);
    console.error(`✓ icon-${size}.png`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}

console.error("✓ all icons written to src/extension/icons");
