/**
 * Ambient declarations for build-artefacts text-imported by the CLI source.
 *
 * `bun run build:ui` produces `.bundle.js` files (currently just the diff
 * iframe runtime) that are pulled in via `with { type: "text" }`. We declare
 * them as opaque text modules so `tsc --noEmit` doesn't try to type-check the
 * generated output.
 */
declare module "*.bundle.js" {
  const content: string;
  export default content;
}
