#!/usr/bin/env node
// npm run probe -- [--only id,id] [--slice k/n] [--no-licenses] [--no-edges] [--parallel N] [--keep] [--json f] [--md f]:
// bundles scripts/probe/run.ts (it imports the app's TypeScript) and runs it against production (scripts/probe/run.ts
// says what it does and what it needs). The bundle is removed when it's done.
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const out = ".probe-run.mjs";
await build({ entryPoints: ["scripts/probe/run.ts"], bundle: true, platform: "node", format: "esm", outfile: out, external: ["*.pdf?inline", "thinking-orbs", "pdfjs-dist", "pdf-lib", "@supabase/supabase-js"], logLevel: "error" });
try { await import(pathToFileURL(out).href); } finally { rmSync(out, { force: true }); }
