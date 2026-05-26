/**
 * Browser entry — bundled into a self-executing script and embedded in the
 * rendered diff page by src/diff.ts. Test code calls `boot()` directly with
 * its own document, so this entry stays empty of logic — it's just a thin
 * boot harness so we don't pull `window`/`document` references into runtime.ts
 * and break tree-shaking / SSR.
 */
import { boot } from "./runtime";

boot(document, window.parent);
