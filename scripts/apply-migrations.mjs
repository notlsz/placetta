#!/usr/bin/env node
// Applies the database migrations the live project hasn't run yet, through the Supabase Management API, so the
// deploy workflow needs only SUPABASE_ACCESS_TOKEN (no database password). Each migration runs in its own
// transaction and records its version; one that fails stops the run and changes nothing of its own.
//
// Migrations up to BASELINE were applied by hand before this script existed (some under other version numbers),
// so only newer files are considered. Every migration in this repo is written to be safe to run twice.
//
// Usage: SUPABASE_ACCESS_TOKEN=... node scripts/apply-migrations.mjs [--dry]
import { readdirSync, readFileSync } from "node:fs";

const REF = process.env.SUPABASE_PROJECT_REF || "esquxzcfsylffuijvzec";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const BASELINE = "20261016090000";
const DRY = process.argv.includes("--dry");
const DIR = new URL("../supabase/migrations/", import.meta.url);

async function query(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 2000)}`);
  return text ? JSON.parse(text) : [];
}

const files = readdirSync(DIR).filter(f => /^\d{14}_.+\.sql$/.test(f)).sort().filter(f => f.slice(0, 14) > BASELINE);
const seen = new Set();
for (const f of files) {
  const v = f.slice(0, 14);
  if (seen.has(v)) throw new Error(`Two migrations share version ${v}; give one its own number.`);
  seen.add(v);
}

if (!TOKEN) {
  console.log(`No SUPABASE_ACCESS_TOKEN: ${files.length} migrations after ${BASELINE} would be checked.`);
  process.exit(DRY ? 0 : 1);
}

const applied = new Set((await query("select version from supabase_migrations.schema_migrations")).map(r => r.version));
const todo = files.filter(f => !applied.has(f.slice(0, 14)));
console.log(`${applied.size} recorded on the live project; ${todo.length} to apply.`);
for (const f of todo) {
  const v = f.slice(0, 14), name = f.slice(15, -4);
  const body = readFileSync(new URL(f, DIR), "utf8")
    .split("\n").filter(l => !/^\s*(begin|commit)\s*;\s*$/i.test(l)).join("\n");
  const sql = `begin;\n${body}\n;\ninsert into supabase_migrations.schema_migrations (version, name) values ('${v}', '${name.replace(/'/g, "''")}') on conflict do nothing;\ncommit;`;
  if (DRY) { console.log(`would apply ${f}`); continue; }
  process.stdout.write(`applying ${f} ... `);
  await query(sql);
  console.log("done");
}
console.log(DRY ? "Dry run, nothing changed." : "The live database is up to date.");
