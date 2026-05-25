import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src", "extension");
const OUT = join(ROOT, "dist", "extension");

type Manifest = {
  action?: Record<string, string>;
  background?: { service_worker?: string };
  side_panel?: { default_path?: string };
  web_accessible_resources?: Array<{ resources?: string[] }>;
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFiles(full);
      files.push(...nested);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function extractHtmlRefs(html: string): string[] {
  const refs: string[] = [];
  for (const match of html.matchAll(/\b(?:src|href)=["']\.\/([^"']+)["']/g)) {
    refs.push(match[1]!);
  }
  return refs;
}

function extractJsRefs(js: string): string[] {
  const refs: string[] = [];
  for (const match of js.matchAll(/\bimport\s+(?:[^"']+\s+from\s+)?["']\.\/([^"']+)["']/g)) {
    refs.push(match[1]!);
  }
  for (const match of js.matchAll(/chrome\.runtime\.getURL\(["']([^"']+)["']\)/g)) {
    refs.push(match[1]!);
  }
  return refs;
}

async function assertSourceRef(relativePath: string, from: string): Promise<void> {
  const target = join(SRC, relativePath);
  if (!(await exists(target))) {
    throw new Error(`${from} references missing extension file: ${relativePath}`);
  }
}

async function validateExtension(): Promise<void> {
  const manifestPath = join(SRC, "manifest.json");
  if (!(await exists(manifestPath))) {
    throw new Error("src/extension/manifest.json is required");
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const required = [
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    ...(manifest.web_accessible_resources ?? []).flatMap((entry) => entry.resources ?? []),
  ].filter((value): value is string => Boolean(value));

  for (const file of required) {
    await assertSourceRef(file, "manifest.json");
  }

  const files = await listFiles(SRC);
  for (const file of files) {
    const rel = relative(SRC, file);
    const ext = extname(file);
    if (ext === ".html") {
      const html = await readFile(file, "utf8");
      for (const ref of extractHtmlRefs(html)) {
        await assertSourceRef(ref, rel);
      }
    }
    if (ext === ".js") {
      const js = await readFile(file, "utf8");
      for (const ref of extractJsRefs(js)) {
        await assertSourceRef(ref, rel);
      }
    }
  }
}

await validateExtension();
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(SRC, OUT, { recursive: true });

console.error("✓ built Chrome extension package");
console.error(`  Source: ${SRC}`);
console.error(`  Load unpacked from: ${OUT}`);
