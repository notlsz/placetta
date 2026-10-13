#!/usr/bin/env node
// Today's call list, from NYC's own public restaurant inspection data (updated daily by the Health Department).
// Every row is a store with a reason to say yes this week: it just opened, it was just closed, or it just failed.
//
//   node scripts/leads.mjs                 last 7 days, all of NYC
//   node scripts/leads.mjs --days 3        last 3 days
//   node scripts/leads.mjs --cuisine Chinese,Japanese,Korean,Coffee/Tea
//   node scripts/leads.mjs --all            every cuisine (the default is Asian cuisines, Placetta's core customers)
//
// Writes leads/<date>.csv: one row per store, worst reason first, with the phone number and the line to open with.
// Source: https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j

import { mkdirSync, writeFileSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = +arg("--days", 7);
// Asian cuisines by default: the Health Department's own labels, matched as substrings ("Asian/Asian Fusion", "Chinese/Japanese"...).
const ASIAN = ["chinese", "japanese", "korean", "thai", "vietnamese", "southeast asian", "asian", "filipino", "indonesian", "taiwanese", "malaysian", "hawaiian"];
const CUISINES = process.argv.includes("--all") ? [] : (arg("--cuisine", "") ? arg("--cuisine", "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : ASIAN);
const API = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";

export async function fetchRows(days = DAYS) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const q = new URLSearchParams({ $limit: "50000", $order: "inspection_date DESC", $where: `inspection_date >= '${since}T00:00:00'` });
  const r = await fetch(`${API}?${q}`);
  if (!r.ok) throw new Error(`NYC Open Data answered ${r.status}`);
  return r.json();
}

const title = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim().replace(/(?<=^|[\s(&/-])\S/g, c => c.toUpperCase());
const day = s => (s || "").slice(0, 10);

// Why this store should talk to us this week, worst first. Lower rank = call first.
function reason(rows) {
  const closed = rows.find(r => /closed by dohmh/i.test(r.action || ""));
  const opening = rows.find(r => /^pre-permit/i.test(r.inspection_type || ""));
  const score = Math.max(...rows.map(r => +r.score || 0));
  const fpc = rows.some(r => r.violation_code === "04A");
  const crit = rows.filter(r => r.critical_flag === "Critical").length;
  if (closed) return { rank: 1, trigger: "Closed by the Health Department", score, fpc, crit, date: day(closed.inspection_date) };
  if (opening && score >= 14) return { rank: 2, trigger: "New store, failed its first inspection", score, fpc, crit, date: day(opening.inspection_date) };
  if (opening) return { rank: 4, trigger: "New store, first inspection", score, fpc, crit, date: day(opening.inspection_date) };
  if (score >= 28) return { rank: 2, trigger: "Scored C range (28+)", score, fpc, crit, date: day(rows[0].inspection_date) };
  if (score >= 14) return { rank: 3, trigger: "Scored B range (14 to 27)", score, fpc, crit, date: day(rows[0].inspection_date) };
  return null;   // an A, nothing urgent to sell
}

// The first sentence the caller says. One line, about their store, no jargon.
function opener(name, w) {
  if (w.rank === 1) return `Hi, is this the owner of ${name}? I saw the Health Department closed you on ${w.date}. We get stores reinspected and reopened fast, and keep every permit and certificate current so it doesn't happen again. Can I send you the list of what to fix?`;
  if (w.fpc) return `Hi, is this the owner of ${name}? Your inspection on ${w.date} flagged that no manager holds a Food Protection Certificate. We handle that and every other permit and certificate for you, for $149 a month. Want me to send the list?`;
  if (/^New store/.test(w.trigger)) return `Hi, is this the owner of ${name}? Congrats on opening. Your first inspection was on ${w.date}. We keep every permit, renewal and certificate current so your next one is an A, for $149 a month. Can I send you your list?`;
  return `Hi, is this the owner of ${name}? Your inspection on ${w.date} scored ${w.score}. We find exactly what to fix before the reinspection and keep you current after, for $149 a month. Want the list?`;
}

export function build(rows, cuisines = CUISINES) {
  const by = new Map();
  for (const r of rows) { if (!r.camis) continue; (by.get(r.camis) || by.set(r.camis, []).get(r.camis)).push(r); }
  const out = [];
  for (const [, rs] of by) {
    const r0 = rs[0];
    if (cuisines.length && !cuisines.some(c => (r0.cuisine_description || "").toLowerCase().includes(c))) continue;
    const w = reason(rs); if (!w) continue;
    const name = title(r0.dba);
    out.push({
      rank: w.rank, trigger: w.trigger, name, phone: (r0.phone || "").replace(/^(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3"),
      address: `${title(r0.building)} ${title(r0.street)}, ${r0.boro} ${r0.zipcode || ""}`.trim(), cuisine: r0.cuisine_description || "",
      inspected: w.date, score: w.score, critical: w.crit,
      violation: (rs.find(r => r.critical_flag === "Critical") || r0).violation_description || "",
      opener: opener(name, w),
    });
  }
  return out.sort((a, b) => a.rank - b.rank || b.score - a.score || (a.inspected < b.inspected ? 1 : -1));
}

const csv = rows => {
  const cols = ["rank", "trigger", "name", "phone", "address", "cuisine", "inspected", "score", "critical", "violation", "opener"];
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = build(await fetchRows());
  mkdirSync("leads", { recursive: true });
  const f = `leads/${new Date().toISOString().slice(0, 10)}.csv`;
  writeFileSync(f, csv(rows));
  const n = k => rows.filter(r => r.rank === k).length;
  console.log(`${rows.length} stores to call: ${n(1)} closed, ${n(2)} failed, ${n(3)} B range, ${n(4)} just opened. Saved ${f}`);
}
