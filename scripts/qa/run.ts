/* The nightly quality run (.github/workflows/quality.yml; npm run qa -- [--sweep] [--mutate] [--limit N] [--fix]):
     --sweep    re-reads every proof's agency page and every form's own page, and checks the quote is still there, the
                fee still matches and the proof isn't stale (src/qa/sweep.ts)
     --mutate   runs every accuracy fixture's mutations against their invariants (src/qa/mutate.ts)
     --fix      writes the safe fixes (a fee from the form's own cited page) into the registry files, for the workflow
                to open as a draft pull request; nothing is merged or deployed by it
   Findings go to qa-findings.json, and to the staff triage queue (qa_report) when SUPABASE_URL and
   SUPABASE_SERVICE_ROLE_KEY are set. Exits 1 when there is a high finding, so the workflow run shows red. */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { PROOF } from "../../src/forms/proof";
import { FORMS } from "../../src/forms/registry";
import { applySafeFee, sweepFinding, type Finding, type Proofed } from "../../src/qa/sweep";
import { checkFixture } from "../../src/qa/mutate";
import { GUARDRAIL } from "../../src/economics";

const arg = (k: string) => process.argv.includes(k);
const num = (k: string, d: number) => { const i = process.argv.indexOf(k); return i >= 0 ? Number(process.argv[i + 1]) || d : d; };
const today = new Date().toISOString().slice(0, 10);
const findings: Finding[] = [];
const all = !arg("--sweep") && !arg("--mutate");

async function page(url: string): Promise<{ status: number; text: string }> {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Placetta quality sweep (support@placetta.com)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    const type = r.headers.get("content-type") ?? "";
    return { status: r.status, text: /pdf/i.test(type) ? "%PDF" : await r.text() };
  } catch { return { status: 0, text: "" }; }
}
async function pool<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await f(items[i++]); }));
}

if (all || arg("--sweep")) {
  const limit = num("--limit", 100000);
  // each proof against the page it was read from (PDFs are only checked to be there: their words aren't parsed here)
  const proofs: Proofed[] = Object.entries(PROOF).map(([id, p]) => ({ id, url: p.read, quote: p.quote, checked: p.checked })).slice(0, limit);
  // each form's own page with its published fee
  const fees: Proofed[] = FORMS.filter(f => f.fee != null && f.fee > 0 && /^https:\/\//.test(f.info) && (f.currency ?? "USD") === "USD").map(f => ({ id: f.id, url: f.info, quote: "", checked: today, fee: f.fee })).slice(0, limit);
  const cache = new Map<string, Promise<{ status: number; text: string }>>();
  const get = (u: string) => { if (!cache.has(u)) cache.set(u, page(u)); return cache.get(u)!; };
  await pool([...proofs, ...fees], 6, async p => {
    const pg = await get(p.url);
    const f = sweepFinding(pg.text === "%PDF" ? { ...p, quote: "" } : p, pg.text === "%PDF" ? { status: pg.status, text: "pdf" } : pg, today, GUARDRAIL.sweepStaleDays);
    if (f) findings.push(f);
  });
  console.log(`sweep: ${proofs.length} proofs and ${fees.length} fees read, ${findings.length} findings`);
}

if (all || arg("--mutate")) {
  let ran = 0;
  for (const d of ["gold", "heldout", "kinds", "furniture"]) {
    const dir = `scripts/eval/${d}`;
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(x => x.endsWith(".json"))) {
      let j: { id?: string; input?: { what?: string; where?: string } };
      try { j = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")); } catch { continue; }
      if (!j.input?.what || !j.input.where) continue;
      const r = checkFixture({ id: j.id ?? file, what: j.input.what, where: j.input.where });
      ran += r.ran; findings.push(...r.findings);
    }
  }
  console.log(`mutate: ${ran} mutations run`);
}

if (arg("--fix")) {
  // the safe class only, each into the registry file that holds the form
  const files = readdirSync("src/forms").filter(f => f.endsWith(".ts")).map(f => `src/forms/${f}`);
  let made = 0;
  for (const f of findings.filter(x => x.safe)) {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const out = applySafeFee(src, f.safe!.form, f.safe!.from, f.safe!.to);
      if (out) { writeFileSync(file, out); made++; console.log(`fix: ${f.safe!.form} fee ${f.safe!.from} to ${f.safe!.to} (${f.safe!.cite}) in ${file}`); break; }
    }
  }
  console.log(`fix: ${made} safe fixes written for review`);
}

writeFileSync("qa-findings.json", JSON.stringify({ date: today, findings }, null, 2) + "\n");
const by = (s: string) => findings.filter(f => f.severity === s).length;
console.log(`findings: ${by("high")} high, ${by("medium")} medium, ${by("low")} low`);
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key && findings.length) {
  for (let i = 0; i < findings.length; i += 400) {
    const r = await fetch(`${url}/rest/v1/rpc/qa_report`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_findings: findings.slice(i, i + 400) }) });
    console.log(`triage queue: ${r.ok ? `${await r.text()} new` : `refused ${r.status}`}`);
  }
}
if (by("high")) process.exitCode = 1;
