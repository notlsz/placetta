#!/usr/bin/env node
// Every server function's upload, measured the way Supabase counts it: the function's own files and every local file
// it imports (deno info). Supabase refuses a deploy over 5 MB, and a refused deploy leaves the old code live with only a
// red run to say so (2026-10-23: agent-run stuck for hours at 5.05 MB). Fails at 4.6 MB, so there's room to notice.
// Usage: node scripts/function-size.mjs [deno binary]
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const deno = process.argv[2] ?? "deno";
const LIMIT = 4.6 * 1024 * 1024, HARD = 5 * 1000 * 1000;
let bad = 0;
for (const fn of readdirSync("supabase/functions").filter((d) => !d.startsWith("_") && existsSync(`supabase/functions/${d}/index.ts`)).sort()) {
  const info = JSON.parse(execFileSync(deno, ["info", "--json", `supabase/functions/${fn}/index.ts`], { maxBuffer: 64 * 1024 * 1024 }).toString());
  const size = info.modules.filter((m) => m.specifier?.startsWith("file://")).reduce((s, m) => s + statSync(fileURLToPath(m.specifier)).size, 0);
  const over = size > LIMIT;
  if (over) bad++;
  console.log(`${over ? "XX" : "ok"}  ${fn.padEnd(16)} ${(size / 1024 / 1024).toFixed(2)} MB${over ? `  (over ${(LIMIT / 1024 / 1024).toFixed(1)} MB; Supabase refuses ${(HARD / 1e6).toFixed(0)} MB)` : ""}`);
}
if (bad) { console.error(`${bad} function(s) too large to deploy safely`); process.exit(1); }
