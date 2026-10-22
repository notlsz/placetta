#!/usr/bin/env node
/* The scanners' findings in one table: ZAP's alerts (risk, rule, how many URLs, an example) and nuclei's matches.
   Usage: node scripts/scan/summary.mjs [scan-results] */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "scan-results";
const RISK = ["Informational", "Low", "Medium", "High"];
for (const f of ["zap-baseline.json", "zap-active.json"]) {
  const p = join(dir, f);
  if (!existsSync(p)) continue;
  const r = JSON.parse(readFileSync(p, "utf8"));
  const alerts = (r.site ?? []).flatMap(s => (s.alerts ?? []).map(a => ({ ...a, site: s["@name"] })));
  const by = new Map();
  for (const a of alerts) { const k = `${a.pluginid}`; const x = by.get(k) ?? { risk: Number(a.riskcode), name: a.name ?? a.alert, n: 0, ex: a.instances?.[0]?.uri ?? a.site }; x.n += Number(a.count ?? a.instances?.length ?? 1); by.set(k, x); }
  console.log(`\n${f}: ${by.size} alert types`);
  for (const [id, x] of [...by].sort((a, b) => b[1].risk - a[1].risk || a[0] - b[0])) console.log(`  ${RISK[x.risk] ?? x.risk}\t${id}\t${x.name}\t(${x.n})\t${x.ex}`);
}
for (const f of ["nuclei.jsonl", "nuclei-cves.jsonl"]) {
  const p = join(dir, f);
  if (!existsSync(p)) continue;
  const rows = readFileSync(p, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  console.log(`\n${f}: ${rows.length} matches`);
  for (const x of rows) console.log(`  ${x.info?.severity}\t${x["template-id"]}\t${x["matcher-name"] ?? ""}\t${x["matched-at"]}\t${(x["extracted-results"] ?? []).join(",").slice(0, 80)}`);
}
