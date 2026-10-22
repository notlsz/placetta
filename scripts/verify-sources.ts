// npm run verify:sources: every official link the registry gives (each form's filing URL, its PDF, its agency page, the
// page its proof quote was read on and the page its processing time came from, and the kind facts' sources) checked
// with HEAD, or a GET cut off at the headers when HEAD is refused. Polite: one request at a time per host, 2 s apart,
// a named user agent (scripts/verify-sources-lib.mjs, which the nightly sweeper can import as is).
//
//   npm run verify:sources                       check everything, write research/source-check.json, exit 1 on a broken link
//   npm run verify:sources -- --only=mx-,ca-     only entries whose id starts with one of these
//   npm run verify:sources -- --where=MX,CA-ON   only entries filed under these jurisdictions
//   npm run verify:sources -- --list             no network: print every entry's links as JSON (for research)
//   npm run verify:sources -- --report           never exit 1 (the sweeper reads the JSON instead)
//   DELAY_MS=3000 HOSTS=2 npm run verify:sources slower still
//
// "blocked" (403, 429: the agency refuses automated reads) and "unreachable" (timeouts, 5xx) are reported, not failed:
// those pages are read by hand through a browser and their proofs say so. "broken" (404, 410, no such host) fails.
import { writeFileSync, mkdirSync } from "node:fs";
import { FORMS } from "../src/forms/registry";
import { KIND_FACTS } from "../src/forms/kinds";
import { checkAll } from "./verify-sources-lib.mjs";

type Link = { url: string; role: "url" | "pdf" | "info" | "proof" | "takes" | "fact"; id: string; where: string };

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const only = arg("only")?.split(",").filter(Boolean);
const where = arg("where")?.split(",").filter(Boolean);
const firstUrl = (s?: string) => s?.match(/https?:\/\/\S+/)?.[0]?.replace(/[),.;]+$/, "");

export function registryLinks(): Link[] {
  const out: Link[] = [];
  for (const f of FORMS) {
    if (only && !only.some(p => f.id.startsWith(p))) continue;
    if (where && !where.includes(f.where)) continue;
    const add = (url: string | undefined, role: Link["role"]) => { if (url && /^https?:\/\//.test(url)) out.push({ url, role, id: f.id, where: f.where }); };
    add(f.url, "url"); add(f.pdf, "pdf"); add(f.info, "info"); add(f.proof?.read, "proof"); add(firstUrl(f.takesSource), "takes");
  }
  for (const k of KIND_FACTS) {
    if (only && !only.some(p => k.id.startsWith(p))) continue;
    const w = Array.isArray(k.where) ? k.where.join(",") : k.where;
    if (where && !where.some(x => w.split(",").includes(x))) continue;
    out.push({ url: k.proof.read, role: "fact", id: k.id, where: w });
  }
  return out;
}

async function main() {
  const links = registryLinks();
  if (process.argv.includes("--list")) {
    const byId: Record<string, unknown> = {};
    for (const f of FORMS) {
      if ((only && !only.some(p => f.id.startsWith(p))) || (where && !where.includes(f.where))) continue;
      byId[f.id] = { form: f.form, title: f.title.en, agency: f.agency.en, level: f.level, where: f.where, fee: f.fee, currency: f.currency ?? "USD",
        feeNote: f.feeNote?.en, takes: f.takes?.en, takesSource: f.takesSource, renews: f.renews?.en, url: f.url, pdf: f.pdf, info: f.info,
        proof: f.proof, checked: f.checked, needs: f.needs, segments: f.segments };
    }
    process.stdout.write(JSON.stringify(byId, null, 1) + "\n");
    return;
  }
  const urls = [...new Set(links.map(l => l.url))];
  const delayMs = Number(process.env.DELAY_MS ?? 2000), hosts = Number(process.env.HOSTS ?? 4);
  console.log(`verify:sources: ${links.length} links, ${urls.length} distinct URLs, ${new Set(urls.map(u => { try { return new URL(u).hostname; } catch { return u; } })).size} hosts, ${delayMs} ms apart per host`);
  let n = 0;
  const results = await checkAll(urls, { delayMs, hosts, onResult: (r: { verdict: string; url: string; status?: number; error?: string }) => {
    n++;
    if (r.verdict !== "ok") console.log(`  ${String(n).padStart(4)} ${r.verdict.padEnd(11)} ${r.status ?? r.error} ${r.url}`);
  } });
  const ids = new Map<string, string[]>();
  for (const l of links) ids.set(l.url, [...(ids.get(l.url) ?? []), `${l.id}:${l.role}`]);
  const rows = results.map((r: { url: string }) => ({ ...r, used: ids.get(r.url) ?? [] })).sort((a: { url: string }, b: { url: string }) => a.url.localeCompare(b.url));
  const count = (v: string) => rows.filter((r: { verdict: string }) => r.verdict === v).length;
  const summary = { checked: new Date().toISOString(), urls: rows.length, ok: count("ok"), moved: count("moved"), blocked: count("blocked"), unreachable: count("unreachable"), broken: count("broken") };
  mkdirSync("research", { recursive: true });
  const out = arg("out") ?? "research/source-check.json";
  writeFileSync(out, JSON.stringify({ summary, results: rows }, null, 1) + "\n");
  console.log(`verify:sources: ${summary.ok} ok, ${summary.moved} moved, ${summary.blocked} blocked, ${summary.unreachable} unreachable, ${summary.broken} broken (${out})`);
  if (summary.broken && !process.argv.includes("--report")) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(2); });
