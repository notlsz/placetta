import { build } from "esbuild";
import { join } from "node:path";
const root = process.argv[2];
const out = "/tmp/claude-0/-home-claude/5023bec5-7008-5dd0-b976-c510fa7cd44f/scratchpad/reach-bundle.mjs";
await build({ stdin: { contents: `export * as R from ${JSON.stringify(join(root,"src/forms/registry.ts"))}; export * as D from ${JSON.stringify(join(root,"supabase/functions/file/destinations.ts"))}; export * as P from ${JSON.stringify(join(root,"worker/filer/src/playbooks.ts"))};`, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error", external: ["*.pdf?inline"] });
const { R, D, P } = await import(out + "?" + Date.now());
const metros = ["San Jose, CA","San Francisco, CA","Los Angeles, CA","Flushing, NY 11354","Seattle, WA","Houston, TX","Chicago, IL","Boston, MA","Dallas, TX","Atlanta, GA","Las Vegas, NV 89101","Irvine, CA"];
const needs = { food: true, employees: true, buildout: true, signage: true, foreignEntity: true, imports: true };
const byHost = {}; const all = new Map();
for (const m of metros) {
  const fs = R.formsFor({ segment: "restaurant", where: m, needs });
  for (const f of fs) {
    const d = D.DEST[f.id];
    const host = d?.portal; const pb = host ? P.playbookFor(host, f.id) : null;
    all.set(f.id, { id: f.id, where: f.where, host, pb: !!pb, owner: !!d?.owner, dest: !!d, noLogin: !!d?.noLogin });
    if (host) { (byHost[host] ??= { metros: new Set(), forms: new Set(), pb: new Set() }); byHost[host].metros.add(m); byHost[host].forms.add(f.id); if (pb) byHost[host].pb.add(f.id); }
  }
  console.log(m, fs.length, "portal:", fs.filter(f => D.DEST[f.id]?.portal && !D.DEST[f.id]?.owner).length);
}
const rows = [...all.values()];
console.log("unique forms", rows.length, "portal", rows.filter(r=>r.host&&!r.owner).length, "with playbook", rows.filter(r=>r.pb).length);
for (const [h, v] of Object.entries(byHost).sort((a,b)=>b[1].metros.size-a[1].metros.size)) console.log(v.metros.size, h, [...v.forms].join(","), "pb:", [...v.pb].join(","));
console.log("NON-PORTAL:", rows.filter(r=>!r.host).map(r=>r.id+(r.dest?"(d)":"")+(r.owner?"(o)":"")).join(" "));
