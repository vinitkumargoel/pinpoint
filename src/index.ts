#!/usr/bin/env bun
import { run } from "./cli.ts";

run(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
