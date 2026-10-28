// How many of the beachhead's required filings Odelia can submit on agency websites herself. The beachhead: a
// food-and-beverage brand formed abroad opening a store in each of 12 metros (formsFor with food, employees, buildout,
// signage, imports and a foreign entity). Each form counts once, however many metros need it.
//
//   node scripts/portal-reach.mjs                      this tree
//   node scripts/portal-reach.mjs --base <dir>         another copy's destinations.ts and playbooks.ts (a baseline)
//
// "Herself" means the destination is an agency website the worker may open and no account is needed (noLogin), or the
// owner has saved their login; then a playbook the worker follows, or the model driving under every guard. Hosts that
// refuse a cloud server's address (worker/filer/src/env.ts BLOCKS_DATACENTER) count only with Browserbase.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const at = args.indexOf("--base");
const base = at >= 0 ? args[at + 1] : root;
const tmp = mkdtempSync(join(tmpdir(), "portal-reach-"));
try {
  await build({
    stdin: { contents: [
      `export * as R from ${JSON.stringify(join(root, "src/forms/registry.ts"))};`,
      `export * as D from ${JSON.stringify(join(base, "supabase/functions/file/destinations.ts"))};`,
      `export * as P from ${JSON.stringify(join(base, "worker/filer/src/playbooks.ts"))};`,
    ].join("\n"), resolveDir: root, loader: "ts" },
    bundle: true, platform: "node", format: "esm", outfile: join(tmp, "b.mjs"), logLevel: "error", external: ["*.pdf?inline"],
  });
  const { R, D, P } = await import(join(tmp, "b.mjs"));
  const BLOCKED = ["eddservices.edd.ca.gov", "bizfileonline.sos.ca.gov", "mtc.dor.state.ma.us", "www.sanjoseca.gov"];
  const metros = ["San Jose, CA", "San Francisco, CA", "Los Angeles, CA", "Flushing, NY 11354", "Seattle, WA", "Houston, TX", "Chicago, IL", "Boston, MA", "Dallas, TX", "Atlanta, GA", "Las Vegas, NV 89101", "Irvine, CA"];
  const needs = { food: true, employees: true, buildout: true, signage: true, foreignEntity: true, imports: true };
  const forms = new Map(), hosts = {};
  for (const m of metros) for (const f of R.formsFor({ segment: "restaurant", where: m, needs })) {
    const d = D.DEST[f.id];
    const host = d?.portal && !d.owner ? d.portal : null;
    forms.set(f.id, { id: f.id, host, noLogin: !!d?.noLogin, pb: !!(host && P.playbookFor(host, f.id)), seen: !!(host && P.playbookFor(host, f.id)?.form.steps.some((s) => s.seen)), blocked: !!host && BLOCKED.includes(host) });
    if (host) (hosts[host] ??= new Set()).add(m);
  }
  const all = [...forms.values()], web = all.filter((x) => x.host);
  const count = (pred) => all.filter(pred).length;
  const out = {
    forms: all.length,
    on_agency_websites: web.length,
    no_account_needed: count((x) => x.host && x.noLogin),
    no_account_needed_not_blocked: count((x) => x.host && x.noLogin && !x.blocked),
    with_saved_login_not_blocked: count((x) => x.host && !x.blocked),
    with_saved_login_and_browserbase: web.length,
    with_playbook: count((x) => x.pb),
    with_playbook_seen_on_live_site: count((x) => x.seen),
    hosts_by_metros: Object.entries(hosts).sort((a, b) => b[1].size - a[1].size).map(([h, s]) => `${s.size} ${h}`),
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
