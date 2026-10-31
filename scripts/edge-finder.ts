/* The edge case finder: every lesson in docs/LESSONS.md becomes a detector that looks for the same mistake everywhere
   it could happen, not only where it happened once. A bug found on one form is checked on all 1,104; a cron job that
   starved the database is checked against every migration; a build script that sorted files as text is checked
   against every build script.

   Each detector names its lesson, says what it found and, where the fix is mechanical, what to change. Errors fail CI
   (npm run test:edges); warnings go to the nightly report (.github/workflows/edges.yml), where Claude fixes them at the
   cause in a pull request a person reviews.

   Adding a lesson to docs/LESSONS.md? Add its detector here in the same commit: a lesson nothing checks is a mistake
   waiting to happen again. Run: npm run test:edges [-- --json out.json --md out.md] */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { FORMS, formById } from "../src/forms/registry";
import { LINES } from "../src/forms/lines";
import { labelStart, placeOnForm } from "../src/live";
import { prefill } from "../src/plan/prefill";
import { B } from "../src/model";

type Level = "error" | "warn";
type Finding = { detector: string; lesson: string; level: Level; where: string; what: string; fix?: string };
const found: Finding[] = [];
const add = (detector: string, lesson: string, level: Level, where: string, what: string, fix?: string) => found.push({ detector, lesson, level, where, what, ...(fix ? { fix } : {}) });

const forms = (FORMS as { id: string; level: string; where: string; method: string; url?: string; agency: { en: string } }[]).map(f => ({ ...f, full: formById(f.id)! })).filter(f => f.full);
const lineOf = (off: { fields: { id: string; line: string; label: { en: string } }[] }, label: string) => {
  const k = label.toLowerCase().replace(/^line\s+/, "");
  // the same matching fill_fields uses: an id, the label, "line: label", or the start of one long label
  return off.fields.find(o => o.id === k || o.label.en.toLowerCase() === k || `${o.line}: ${o.label.en}`.toLowerCase() === k) ?? labelStart(off, k);
};

/* 1. Stray lines (LESSONS 2026-10-31 "a label that matched no line became a stray line"). For every line on every
      official form: Odelia's shortened label, and each half of a "phone / email" line, must land on a line the form
      prints or come back to her, never become a line the agency's form doesn't have. */
{
  const L = "2026-10-31: a label that matched no line became a stray line";
  let checked = 0;
  for (const f of forms) {
    const off = f.full; if (!off.fields?.length) continue;
    for (const o of off.fields) {
      const words = o.label.en.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean);
      const tries: { label: string; value: string }[][] = [];
      if (words.length > 4) tries.push([{ label: words.slice(0, 3).join(" "), value: "x" }]);
      const halves = o.label.en.split(/\s+\/\s+/);
      if (halves.length === 2 && /phone/i.test(halves[0] + halves[1]) && /e-?mail/i.test(halves[0] + halves[1]))
        tries.push(halves.map((h, i) => ({ label: h.trim(), value: /e-?mail/i.test(h) ? "a@b.com" : "(917) 555-0142" })));
      for (const t of tries) {
        checked++;
        const r = placeOnForm(t.map(x => ({ id: "", label: B(x.label, x.label), value: x.value })) as never, off as never, []);
        const stray = r.fields.filter(x => !lineOf(off, x.label.en) && !off.fields.some(y => y.id === x.label.en));
        if (stray.length) add("stray-line", L, "error", f.id, `"${t.map(x => x.label).join('", "')}" would add ${stray.map(s => `"${s.label.en}"`).join(", ")}, a line ${f.id} doesn't print`, "placeOnForm in src/live.ts must place it or return it as not_on_this_form");
        if (halves.length === 2 && t.length === 2 && !r.fields.some(x => x.value.includes(" / ") || x.label.en.toLowerCase().endsWith(o.label.en.toLowerCase())))
          add("compound-line", L, "warn", f.id, `the halves of "${o.label.en}" didn't join on that line`, "check the twin-line order in fill_fields");
      }
    }
  }
  console.log(`stray-line: ${checked} shortened and split labels tried across ${forms.filter(f => f.full.fields?.length).length} forms`);
}

/* 2. A name line that also asks where (LESSONS 2026-10-31, Fremont's "Business name and business location (number,
      street ...)"): without the street, prefill leaves it for the owner, on every form. */
{
  const L = "2026-10-31: forms library, a name line that also asks for the street waits for it";
  let n = 0;
  for (const f of forms) {
    const lines = (f.full.fields ?? []).filter(o => /name/i.test(o.label.en) && /address|location|street/i.test(o.label.en));
    if (!lines.length) continue;
    const app = { id: "a-" + f.id, official: f.id, name: B(f.id, f.id), fields: lines.map(o => ({ id: o.id, label: o.label, value: "" })), checklist: [], fees: [], status: "todo" };
    const out = prefill([app as never], { what: "milk tea shop", where: "San Jose, CA", legal: "Moonleaf Tea LLC" }).apps[0];
    for (const x of out.fields) { n++; if (x.value) add("name-without-street", L, "error", f.id, `"${x.label.en}" was filled with "${x.value}" before the owner gave a street address`, "src/plan/prefill.ts: a business-name line that also asks where takes both or waits"); }
  }
  console.log(`name-without-street: ${n} name-and-address lines checked`);
}

/* 3. Research that didn't reach the library (LESSONS 2026-10-31 "new research was silently overwritten"): a form the
      research mapped line by line must carry at least those lines. */
{
  const L = "2026-10-31: new research was silently overwritten by older batches";
  for (const [id, l] of Object.entries(LINES)) {
    const f = formById(id);
    if (!f && /duplicate/i.test(l.seen)) continue;   // a duplicate entry kept with its research, by design
    // the same research filed under an older id, with the form's own entry carrying it (sf-reg = sf-business-registration)
    if (!f && Object.entries(LINES).some(([k, x]) => k !== id && formById(k) && x.sources[0] === l.sources[0] && x.fields.length >= l.fields.length)) continue;
    if (!f) { add("research-orphan", L, "warn", id, "researched, but no form in the library has this id", "rename the research entry or add the form"); continue; }
    if (l.status === "mapped" && l.fields.length && (f.fields?.length ?? 0) < l.fields.length)
      add("research-lost", L, "error", id, `research mapped ${l.fields.length} lines, the library carries ${f.fields?.length ?? 0}`, "rerun python3 scripts/build-lines.py research/lines and check batch order");
  }
}

/* 4. How a form is filed, research against the library (the 2026-10-31 corrections: Arcadia online, Cupertino by
      email, Chicago's sanitation certificate by email). The research read the agency's own page; the library must agree. */
{
  const L = "2026-10-31: forms library corrections from the research";
  // the research names an email that isn't the filing route (checked 2026-10-31): each says why
  const NOT_THE_ROUTE: Record<string, string> = {
    "lac-plan-check": "the email asks for a SharePoint upload link; plans go through the upload",
    "tx-ap201": "only an owner without an SSN emails the paper AP-201; everyone else files online",
    "aus-co": "the email is for a CO that wasn't issued after the final inspection",
    "alh-building": "the email takes plan revisions only; applications go through the Permit Portal",
    "aus-food-plan-review": "the 2024 form printed an email the city's page no longer lists (destinations.ts, checked 2026-10-18)",
  };
  for (const f of forms) {
    const l = LINES[f.id]; if (!l || NOT_THE_ROUTE[f.id]) continue;
    const s = l.submit;
    if (s.email && !s.portal && ["online", "portal"].includes(f.method)) add("method-drift", L, "warn", f.id, `the agency takes it by email (${s.email}) but the library says ${f.method}`, `set method: "pdf_mail" and check supabase/functions/file/destinations.ts`);
    if (s.portal && f.method === "pdf_mail" && !s.email && !s.mail) add("method-drift", L, "warn", f.id, `the agency takes it in a portal (${s.portal}) but the library says pdf_mail`, `set method: "portal"`);
  }
}

/* 5. A link to another agency's page (Arcadia's and Alhambra's building permits pointed at LA County Public Health). */
{
  const L = "2026-10-31: forms library corrections from the research";
  for (const f of forms) {
    if (f.level !== "city" || !f.url) continue;
    let host = ""; try { host = new URL(f.url).hostname; } catch { add("bad-url", L, "error", f.id, `url isn't a URL: ${f.url}`); continue; }
    if (/county|publichealth\.lacounty/i.test(host) && !/county/i.test(f.agency.en)) add("other-agency-link", L, "warn", f.id, `a city form (${f.agency.en}) links to ${host}`, "link the city's own page");
  }
}

/* 5b. A link that belongs to another city (an edit that read entry boundaries wrong put Arcadia's building links on
       Alhambra's license, and Alhambra's on Torrance's, 2026-10-31): a city form whose link's host is the one most of
       another city's forms use. */
{
  const L = "2026-10-31: an edit put one city's links on another city's form";
  const hostOf = (u?: string) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };
  const owner = new Map<string, Map<string, number>>();   // host -> where -> count
  // a host a state or national form also uses is a shared portal (France's service-public.fr, Italy's impresainungiorno)
  const shared = new Set(forms.filter(f => f.level !== "city").map(f => hostOf(f.url)).filter(Boolean));
  for (const f of forms) { if (f.level !== "city") continue; const h = hostOf(f.url); if (shared.has(h)) continue; if (!h || /\.(state|ca)\.gov$|county|ccc\.edu|tylerhost|accela|hdlgov|govaccess|civicplus|seamlessdocs|govpilot/.test(h)) continue; const m = owner.get(h) ?? new Map(); m.set(f.where, (m.get(f.where) ?? 0) + 1); owner.set(h, m); }
  for (const f of forms) {
    if (f.level !== "city") continue;
    if (shared.has(hostOf(f.url))) continue;
    const m = owner.get(hostOf(f.url)); if (!m || m.has(f.where) && m.size === 1) continue;
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    const country = (w: string) => w.split("-")[0];
    if (country(top[0]) === country(f.where) && top[0].includes("-") !== f.where.includes("-")) continue;   // a country's portal used by its own cities
    if (top[0] !== f.where && top[1] >= 1 && !m.has(f.where)) add("cross-city-link", L, "error", f.id, `links to ${hostOf(f.url)}, which the library uses for ${top[0]}, not ${f.where}`, "check the entry's url and info against its own city");
    else if (top[0] !== f.where && (m.get(f.where) ?? 0) < top[1]) add("cross-city-link", L, "warn", f.id, `links to ${hostOf(f.url)}, mostly used for ${top[0]}`, "check the entry's url");
  }
}

/* 6. Scheduled jobs (LESSONS 2026-10-31 "the free database ran out of CPU"): anything that runs more than hourly
      goes inside public.tick(), never its own pg_cron job. Replays every migration's schedule and unschedule. */
{
  const L = "2026-10-31: the free database ran out of CPU and every job failed for hours, silently";
  const dir = "supabase/migrations", live = new Map<string, { schedule: string; file: string }>();
  for (const file of readdirSync(dir).filter(x => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(`${dir}/${file}`, "utf8");
    for (const m of sql.matchAll(/jobname\s+(?:=|in)\s*\(?([^);]+)\)?/gi)) for (const n of m[1].matchAll(/'([^']+)'/g)) if (/unschedule/i.test(sql)) live.delete(n[1]);
    for (const m of sql.matchAll(/cron\.unschedule\('([^']+)'\)/g)) live.delete(m[1]);
    for (const m of sql.matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'/g)) live.set(m[1], { schedule: m[2], file });
  }
  for (const [name, j] of live) {
    const minute = j.schedule.trim().split(/\s+/)[0];
    const every = minute === "*" ? 1 : /^\*\/(\d+)$/.test(minute) ? Number(minute.slice(2)) : minute.includes(",") ? 60 / minute.split(",").length : 60;
    if (every < 60 && name !== "placetta-tick") add("sub-hourly-cron", L, "error", `${name} (${j.file})`, `runs every ${every} minute(s) as its own pg_cron job`, "move it into public.tick() and unschedule it");
  }
  console.log(`sub-hourly-cron: ${live.size} scheduled jobs replayed from migrations`);
}

/* 7. Build scripts that read numbered files in text order (b10 before b2), the cause of the overwritten research. */
{
  const L = "2026-10-31: new research was silently overwritten by older batches";
  for (const file of readdirSync("scripts").filter(x => /\.(py|mjs|mts|ts)$/.test(x) && x !== "edge-finder.ts")) {
    const src = readFileSync(`scripts/${file}`, "utf8");
    if (/sorted\(glob\.glob\([^)]*\b[a-z]\*\.json[^)]*\)\)(?!\s*,\s*key)/.test(src) || /readdirSync\([^)]*\)[^;\n]*\.sort\(\)[^;\n]*\bb\d|\/b\\d\+/.test(src))
      add("text-sorted-batches", L, "error", `scripts/${file}`, "reads numbered batch files sorted as text, so b10 comes before b2", "sort by the batch number");
  }
}

/* 8. Dates people read (the Updates tab showed 2026-11-14): a date put straight into a user-facing sentence is the ISO
      form; it goes through fmtDay. */
{
  const L = "2026-10-31: UI, Updates showed raw ISO dates";
  for (const file of readdirSync("src").filter(x => /\.(ts|tsx)$/.test(x))) {
    const src = readFileSync(`src/${file}`, "utf8").split("\n");
    src.forEach((line, i) => {
      if (/\bB\(`[^`]*\$\{[a-z.]*\.date\}[^`]*`/.test(line) && !/fmtDay|prompt|ask:|in: |`(Start|Get this|Remind|Ask|This is overdue)/.test(line))
        add("iso-date-shown", L, "warn", `src/${file}:${i + 1}`, "a date goes into a sentence people read without fmtDay", "wrap it in fmtDay(date, lang, true)");
    });
  }
}

/* report */
const errors = found.filter(f => f.level === "error"), warns = found.filter(f => f.level === "warn");
const byDet = (xs: Finding[]) => Object.entries(xs.reduce((m, f) => ((m[f.detector] = (m[f.detector] ?? 0) + 1), m), {} as Record<string, number>)).map(([k, v]) => `${k} ${v}`).join(", ");
console.log(`\nedge finder: ${errors.length} errors${errors.length ? ` (${byDet(errors)})` : ""}, ${warns.length} warnings${warns.length ? ` (${byDet(warns)})` : ""}`);
for (const f of [...errors, ...warns].slice(0, 60)) console.log(`${f.level === "error" ? "ERR " : "warn"} ${f.detector.padEnd(20)} ${f.where}: ${f.what}`);
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
if (arg("--json")) writeFileSync(arg("--json")!, JSON.stringify(found, null, 1));
if (arg("--md")) writeFileSync(arg("--md")!, `# Edge finder\n\n${errors.length} errors, ${warns.length} warnings\n\n| Level | Detector | Where | What | Fix | Lesson |\n|---|---|---|---|---|---|\n` + found.map(f => `| ${f.level} | ${f.detector} | ${f.where} | ${f.what.replace(/\|/g, "/")} | ${(f.fix ?? "").replace(/\|/g, "/")} | ${f.lesson} |`).join("\n") + "\n");
process.exit(errors.length ? 1 : 0);
