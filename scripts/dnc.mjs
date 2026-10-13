#!/usr/bin/env node
// Placetta's do-not-contact list, used by every call and email list (scripts/leads.mjs, scripts/fda-leads.mjs).
//
//   node scripts/dnc.mjs add "(212) 555-0142" "asked not to be called"   a phone number
//   node scripts/dnc.mjs add owner@shop.com "unsubscribed"             an email address
//   node scripts/dnc.mjs add fei:3012345678 "asked us to stop"          an FDA firm (FEI number)
//   node scripts/dnc.mjs list
//
// Anyone who asks not to be contacted, by any words on a call, by text or by email, goes on this list the same day
// and stays on it (TCPA and the FCC's 2025 revocation rule: honor it within 10 business days; we do it the same day;
// CAN-SPAM: honor email opt-outs within 10 business days). The list lives in leads/dnc.txt, kept out of git.
//
// The National Do Not Call Registry: download the area codes you call from telemarketing.donotcall.gov (free for up to
// five area codes; an organization must register and refresh at least every 31 days) and save the files in
// leads/national-dnc/. Every list checks numbers against them and says when they were last refreshed.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = "leads", FILE = join(DIR, "dnc.txt"), NATIONAL = join(DIR, "national-dnc");

/** One canonical key per contact: 10 digits for a US number, lowercase for an email, fei:<n> for an FDA firm. */
export function dncKey(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^fei:/i.test(s)) return "fei:" + s.slice(4).replace(/\D/g, "");
  if (s.includes("@")) return s.toLowerCase();
  const d = s.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d.length === 10 ? d : "";
}

/** Everything we must not contact: our own list, plus the National Registry files if they're here. */
export function loadSuppression() {
  const keys = new Set();
  if (existsSync(FILE)) for (const line of readFileSync(FILE, "utf8").split("\n")) { const k = dncKey(line.split("\t")[0]); if (k) keys.add(k); }
  const own = keys.size;
  let national = 0, refreshed = null;
  if (existsSync(NATIONAL)) {
    for (const f of readdirSync(NATIONAL)) {
      const p = join(NATIONAL, f);
      if (!statSync(p).isFile()) continue;
      const t = statSync(p).mtime;
      if (!refreshed || t < refreshed) refreshed = t;   // the oldest file is how fresh the check is
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) { const k = dncKey(line.split(",")[0]); if (k) { keys.add(k); national++; } }
    }
  }
  const stale = !refreshed || Date.now() - refreshed.getTime() > 31 * 864e5;
  return { has: (v) => keys.has(dncKey(v)), own, national, refreshed, stale };
}

/** One line for the top of every list: what was checked, and whether the National Registry copy is too old to call from. */
export function suppressionNote(s) {
  const nat = s.national ? `${s.national.toLocaleString("en-US")} National Registry numbers, refreshed ${s.refreshed.toISOString().slice(0, 10)}` : "no National Registry files";
  return `Skipped anyone on the do-not-contact list (${s.own} of ours, ${nat}).` + (s.stale ? " Refresh leads/national-dnc/ (at least every 31 days) before calling any number that may be a cell phone or a home." : "");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, value, ...why] = process.argv.slice(2);
  if (cmd === "add") {
    const k = dncKey(value);
    if (!k) { console.error("Give a 10-digit US phone number, an email address, or fei:<number>."); process.exit(1); }
    mkdirSync(DIR, { recursive: true });
    appendFileSync(FILE, `${k}\t${new Date().toISOString()}\t${why.join(" ").replace(/\s+/g, " ").trim()}\n`);
    console.log(`Added ${k}. Never contact them again from any list.`);
  } else if (cmd === "list") {
    console.log(existsSync(FILE) ? readFileSync(FILE, "utf8") || "(empty)" : "(empty)");
  } else {
    console.log("Usage: node scripts/dnc.mjs add <phone|email|fei:number> [why] | list");
  }
}
