#!/usr/bin/env node
// npm run eval:live [-- --dry --judge --only map ...]: bundles scripts/live-eval.ts (it imports the app's TypeScript,
// like the other test scripts) and runs it with the arguments given. The bundle is removed when it's done.
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const out = ".live-eval.mjs";
await build({ entryPoints: ["scripts/live-eval.ts"], bundle: true, platform: "node", format: "esm", outfile: out, external: ["*.pdf?inline", "thinking-orbs"], logLevel: "error" });
try { await import(pathToFileURL(out).href); } finally { rmSync(out, { force: true }); }
