#!/usr/bin/env node
// npm run qa [-- --sweep --mutate --limit N --fix]: bundles scripts/qa/run.ts (it imports the app's TypeScript) and runs
// it with the arguments given, like scripts/live-eval.mjs. The bundle is removed when it's done.
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const out = ".qa-run.mjs";
await build({ entryPoints: ["scripts/qa/run.ts"], bundle: true, platform: "node", format: "esm", outfile: out, external: ["*.pdf?inline", "thinking-orbs"], logLevel: "error" });
try { await import(pathToFileURL(out).href); } finally { rmSync(out, { force: true }); }
