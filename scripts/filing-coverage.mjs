// Writes docs/FILING_COVERAGE.md: every US form in the registry (src/forms) with the channels Placetta can file it on
// (supabase/functions/file/destinations.ts), how the dispatcher would send it with every channel switched on
// (pick() in logic.ts), and why the rest stay with the team.
//
//   node scripts/filing-coverage.mjs            write the file
//   node scripts/filing-coverage.mjs --check    CI: fail if a destination has no source or breaks a rule, names a form
//                                               the registry doesn't have, or the file is out of date
//   node scripts/filing-coverage.mjs --dest-dir <dir>   count another copy of destinations.ts and logic.ts (the baseline)
import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const check = args.includes("--check");
const at = args.indexOf("--dest-dir");
const destDir = at >= 0 ? args[at + 1] : join(root, "supabase/functions/file");
const OUT = join(root, "docs/FILING_COVERAGE.md");
// The same first-try routes as data the app can read (src/approvalRoute.ts): form id to route kind and nothing else (no
// addresses, numbers or logins), so an approval card can say who files it without the browser reaching destinations.ts
const ROUTES_OUT = join(root, "src/forms/filingRoutes.json");
const STEPS_OUT = join(root, "src/forms/filingSteps.json");
const SIGN_OUT = join(root, "src/forms/filingSign.json");

// Counted with --dest-dir on the destinations.ts and logic.ts of commit 8c8599b2 (2026-10-17), before the research of
// 2026-10-18. The same registry of US forms is counted both times (recounted when forms batch 3, the target markets and the accuracy fixes added 58 US forms:
// those were all team-only then).
const BASELINE = {
  date: "2026-10-17",
  channels: { team: 231, email: 5, fax: 4, mail: 13, portal: 16, owner: 0 },
  routes: { portal: 16, email: 1, fax: 0, mail: 0, owner: 0, faxSigned: 3, emailSigned: 0, kitReturn: 0, ownerSigns: 6, team: 233 },
};
// Counted the same way on commit 7f619454f (2026-10-28), before sign once and paper without the owner
// (20261105090200_sign_once_paper.sql): the same registry, so the column shows only what that change moved.
const BEFORE_SIGN_ONCE = {
  date: "2026-10-28",
  routes: { portal: 158, email: 1, fax: 0, mail: 0, owner: 31, faxSigned: 6, emailSigned: 0, kitReturn: 0, ownerSigns: 25, team: 336 },
};

const tmp = mkdtempSync(join(tmpdir(), "filing-coverage-"));
try {
  await build({
    stdin: {
      contents: [
        `export { FORMS, selfStep } from ${JSON.stringify(join(root, "src/forms/registry.ts"))};`,
        `export * as D from ${JSON.stringify(join(destDir, "destinations.ts"))};`,
        `export * as L from ${JSON.stringify(join(destDir, "logic.ts"))};`,
      ].join("\n"),
      resolveDir: root, loader: "ts",
    },
    bundle: true, platform: "node", format: "esm", outfile: join(tmp, "coverage.mjs"), logLevel: "error",
    external: ["*.pdf?inline"],
  });
  const { FORMS, selfStep, D, L } = await import(join(tmp, "coverage.mjs"));
  const result = report(FORMS, D, L, selfStep);
  if (at >= 0) { console.log(JSON.stringify(result.counts)); process.exit(0); }
  if (check) {
    const problems = [...result.problems];
    const now = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (now !== result.markdown) problems.push("docs/FILING_COVERAGE.md is out of date: run node scripts/filing-coverage.mjs and commit it");
    if ((existsSync(ROUTES_OUT) ? readFileSync(ROUTES_OUT, "utf8") : "") !== result.routesJson) problems.push("src/forms/filingRoutes.json is out of date: run node scripts/filing-coverage.mjs and commit it");
    if ((existsSync(STEPS_OUT) ? readFileSync(STEPS_OUT, "utf8") : "") !== result.stepsJson) problems.push("src/forms/filingSteps.json is out of date: run node scripts/filing-coverage.mjs and commit it");
    if ((existsSync(SIGN_OUT) ? readFileSync(SIGN_OUT, "utf8") : "") !== result.signJson) problems.push("src/forms/filingSign.json is out of date: run node scripts/filing-coverage.mjs and commit it");
    if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
    console.log(`filing coverage: ${result.counts.forms} US forms, ${result.counts.selfFilable} self-filable, every destination cited`);
  } else {
    if (result.problems.length) { console.error(result.problems.join("\n")); process.exit(1); }
    writeFileSync(OUT, result.markdown);
    writeFileSync(ROUTES_OUT, result.routesJson);
    writeFileSync(STEPS_OUT, result.stepsJson);
    writeFileSync(SIGN_OUT, result.signJson);
    console.log(`wrote docs/FILING_COVERAGE.md: ${JSON.stringify(result.counts.channels)}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function report(FORMS, D, L, selfStep = () => undefined) {
  const DEST = D.DEST, TEAM_ONLY = D.TEAM_ONLY ?? {}, TO_VERIFY = D.TO_VERIFY ?? {};
  const us = FORMS.filter((f) => !f.currency || f.currency === "USD");
  const ids = new Set(FORMS.map((f) => f.id));
  const problems = [...(D.destinationProblems?.() ?? [])];
  // inspection bookings (insp-*, src/inspections/booking.ts) are the agencies' scheduling pages, and appeals (appeal-*,
  // src/appeals) the deciding bodies' own inboxes, not registry forms
  for (const id of Object.keys(DEST)) if (!ids.has(id) && !id.startsWith("insp-") && !id.startsWith("appeal-")) problems.push(`${id}: a destination for a form the registry doesn't have`);
  for (const id of Object.keys(TEAM_ONLY)) {
    if (!ids.has(id)) problems.push(`${id}: a team-only note for a form the registry doesn't have`);
    if (DEST[id]) problems.push(`${id}: both a destination and team-only`);
  }
  for (const [id, d] of Object.entries(DEST)) if (!/^https:\/\//.test(d.source ?? "")) problems.push(`${id}: no source page`);

  // Every channel switched on, a saved login, a connected mailbox: how pick() would send each form on its first try.
  const all = us.map((f) => f.id).join(",");
  const env = L.envFrom((k) => ({ FILER_AGENCIES: all, FILER_CHANNELS: "email,fax,mail,portal", FILER_ENABLED: "1", TELNYX_API_KEY: "x", TELNYX_FAX_CONNECTION_ID: "x", TELNYX_FAX_FROM: "+1", LOB_API_KEY: "x", LOB_FROM: "{}" })[k]);
  const filing = (f) => ({ id: f.id, workspace_id: "w", app_id: f.id, title: f.title, status: "requested", channel: null, agent_state: null, agent_log: [], handoff_url: null,
    provider_ref: null, submit_clicked_at: null, attempts: 0, requirements_checked: false, confirmation_number: null, portal_url: null,
    fee_estimate: typeof f.fee === "number" ? f.fee : null, payload: { official: f.id, fields: [], attachments: [] } });
  const routeOf = (f, d) => {
    if (!d) return "team";
    const r = L.pick(filing(f), d, env, { hasLogin: true, mailConnected: true });
    if (r === "team" && d.signature === "wet" && !d.portal) {
      // the honest way for each form that needs ink (wetPath in logic.ts): a copy Placetta faxes or emails, or the
      // original mailed back in Placetta's return envelope; older copies of logic.ts (the baseline) knew only the fax
      if (L.wetPath) {
        const w = L.wetPath(filing(f), d, env, { mailConnected: true });
        return w.path === "photo" ? (w.via === "fax" ? "faxSigned" : "emailSigned") : w.path === "return" ? "kitReturn" : "ownerSigns";
      }
      const faxable = L.canFaxSignedFor ? L.canFaxSignedFor(filing(f), d, env) : L.canFaxSigned(d, env) && !(Number(f.fee ?? 0) > 0);
      return faxable ? "faxSigned" : "ownerSigns";
    }
    return r;
  };

  // A form the agency routes by state (byState: the IRS's service centers) is counted as its route for a business with a
  // US address: every state has one (destinationProblems checks that), so the first group's first state stands in.
  const resolved = (id) => {
    const d = DEST[id];
    if (!d?.byState || !D.destFor) return d;
    const st = d.byState.groups[0].states[0];
    return D.destFor(id, { fields: d.byState.from.map((x) => ({ id: x, value: `City, ${st} 00000` })) });
  };
  const rows = us.map((f) => {
    const d = resolved(f.id);
    const channels = d ? ["email", "fax", "mail", "portal", "owner"].filter((c) => d[c]) : [];
    return { f, d, channels, route: routeOf(f, d) };
  });
  const count = (pred) => rows.filter(pred).length;
  const channels = {
    team: count((r) => !r.d), email: count((r) => r.d?.email), fax: count((r) => r.d?.fax), mail: count((r) => r.d?.mail),
    portal: count((r) => r.d?.portal), owner: count((r) => r.d?.owner),
  };
  const routeKeys = ["portal", "email", "fax", "mail", "owner", "faxSigned", "emailSigned", "kitReturn", "ownerSigns", "team"];
  const routes = Object.fromEntries(routeKeys.map((k) => [k, count((r) => r.route === k)]));
  const counts = { forms: us.length, abroad: FORMS.length - us.length, selfFilable: count((r) => r.d && !r.d.owner), channels, routes };

  const md = [];
  md.push("# Filing coverage", "");
  md.push("Generated by `node scripts/filing-coverage.mjs` from `supabase/functions/file/destinations.ts` and the forms registry (`src/forms`). Don't edit it by hand: CI runs the script with `--check` and fails when this file is out of date or a destination has no source page.", "");
  md.push(`The registry has ${us.length} US forms (federal, state, and the 33 metros) and ${counts.abroad} forms abroad, which the Placetta team files.`, "");
  md.push("## Forms by channel", "");
  md.push("A form can have more than one channel. Team only means Placetta has no route it may use: the form goes to the Placetta team.", "");
  md.push(`| Channel | Before (${BASELINE.date}) | Now |`, "|---|---:|---:|");
  const CH = [["team", "Team only"], ["email", "Email"], ["fax", "Fax"], ["mail", "Certified mail"], ["portal", "Agency portal"], ["owner", "Owner packet"]];
  for (const [k, label] of CH) md.push(`| ${label} | ${BASELINE.channels[k]} | ${channels[k]} |`);
  md.push(`| Any route Placetta sends on | ${us.length - BASELINE.channels.team - BASELINE.channels.owner} | ${counts.selfFilable} |`, "");
  md.push("## How each form would go on its first try", "");
  md.push("With every channel switched on, a saved login for each portal and a connected mailbox, using the registry's fee and no attachments (`pick()` and `wetPath()` in `supabase/functions/file/logic.ts`). An agency fee keeps a filing off email, fax and mail unless the agency bills it afterwards; a hand signature means the owner signs first, on a page Placetta mails them with one tap.", "");
  const RT = { portal: "On the agency's portal", email: "By email", fax: "By fax", mail: "By certified mail", owner: "Owner packet: the owner sends it", faxSigned: "Signed by hand, then Placetta faxes it", emailSigned: "Signed by hand, then Placetta emails it", kitReturn: "Signed by hand, mailed back in Placetta's return envelope", ownerSigns: "Signed by hand and sent by the owner", team: "The Placetta team" };
  md.push(`| Route | Before (${BASELINE.date}) | Before sign once (${BEFORE_SIGN_ONCE.date}) | Now |`, "|---|---:|---:|---:|");
  for (const k of routeKeys) md.push(`| ${RT[k]} | ${BASELINE.routes[k]} | ${BEFORE_SIGN_ONCE.routes[k]} | ${routes[k]} |`);
  md.push("");
  // Workers' compensation is a policy bought from an insurer (selfStep in src/forms/registry.ts): the plan keeps it as the
  // owner's step and never puts it up for filing, so the team row above counts it but no one files it.
  const insurance = rows.filter((r) => r.route === "team" && selfStep(r.f) === "insurance").length;
  md.push(`Of the ${routes.team} forms with the team, ${insurance} are insurance the owner buys from an insurer (workers' compensation), which the plan keeps as the owner's step: nothing is filed, so ${routes.team - insurance} are forms the team files.`, "");

  const PLACE = {
    US: "Federal", NY: "New York State", NYC: "New York City", CA: "California", LA: "Los Angeles", LAC: "Los Angeles County", TX: "Texas", HOU: "Houston",
    SJ: "San José", SCC: "Santa Clara County", SF: "San Francisco", DAL: "Dallas", AUS: "Austin", SAT: "San Antonio", TPA: "Tampa", SDG: "San Diego",
    IRV: "Irvine", ORL: "Orlando", FTW: "Fort Worth", AZ: "Arizona", PHX: "Phoenix", MA: "Massachusetts", BOS: "Boston", GA: "Georgia", ATL: "Atlanta",
    OAK: "Oakland", SAC: "Sacramento", WA: "Washington", SEA: "Seattle", OR: "Oregon", PDX: "Portland", NV: "Nevada", LV: "Southern Nevada Health District", LVC: "City of Las Vegas", CLK: "Clark County (unincorporated)", PLA: "Plano",
    IL: "Illinois", CHI: "Chicago", PA: "Pennsylvania", PHL: "Philadelphia", DC: "Washington, DC", VA: "Virginia", ARL: "Arlington", FFX: "Fairfax County",
    NJ: "New Jersey", EDI: "Edison", JC: "Jersey City", FL: "Florida", MIA: "Miami", CO: "Colorado", DEN: "Denver", MN: "Minnesota", MSP: "Minneapolis",
    OH: "Ohio", CMH: "Columbus", MD: "Maryland", MOCO: "Montgomery County, MD", HI: "Hawaii", UT: "Utah", GLN: "Glendale", SGB: "San Gabriel", SMO: "San Mateo", SMC: "San Mateo County", CUP: "Cupertino",
    // the counties county steps are filed under (src/forms/usplace.ts), and the cities the held-out accuracy set added
    KC: "King County", SNHD: "Southern Nevada Health District", ORC: "Orange County, CA", SDC: "San Diego County", ALA: "Alameda County", SACC: "Sacramento County",
    MARI: "Maricopa County", MULT: "Multnomah County", FULC: "Fulton County", GWIN: "Gwinnett County", HILL: "Hillsborough County", ORFL: "Orange County, FL",
    MDC: "Miami-Dade County", SLCO: "Salt Lake County", LACU: "Unincorporated Los Angeles County", ROC: "Rockville", FRE: "Fremont", MIL: "Milpitas", DLY: "Daly City",
    ARC: "Arcadia", ALH: "Alhambra", TOR: "Torrance", FTL: "Fort Lee", SUG: "Sugar Land", DUL: "Duluth, GA", HEN: "Henderson", BEL: "Bellevue", QCY: "Quincy",
  };
  const place = (w) => PLACE[w] ?? w;
  const cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  const CHN = { email: "email", fax: "fax", mail: "mail", portal: "portal", owner: "owner packet" };
  const SIG = { none: "none", typed: "typed", drawn: "drawn", wet: "by hand" };
  const PAY = { none: "no fee", portal: "on the portal", invoice: "billed after", with_filing: "sent with it", in_person: "in person" };

  md.push("## Forms Placetta can route", "");
  md.push("| Place | Form | Channels | First try | Signature | Fee | Source (checked) |", "|---|---|---|---|---|---|---|");
  for (const r of rows.filter((x) => x.d)) {
    const d = r.d, byState = DEST[r.f.id]?.byState;
    const where = byState
      ? `by the business's state: ${byState.groups.map((g) => [g.fax ? `fax ${g.fax}` : null, g.mail ? `${g.mail.city}, ${g.mail.state}` : null].filter(Boolean).join(" or ")).join("; ")}${byState.abroad?.mail ? `; abroad: ${byState.abroad.mail.city}, ${byState.abroad.mail.state} ${byState.abroad.mail.zip}` : ""}`
      : [d.email, d.portal, d.fax?.us, d.mail ? `${d.mail.name}, ${d.mail.city}` : null].filter(Boolean).join(", ");
    md.push(`| ${place(r.f.where)} | ${cell(r.f.title.en)} (\`${r.f.id}\`) | ${r.channels.map((c) => CHN[c]).join(", ")}${where ? `: ${cell(where)}` : ""} | ${RT[r.route]} | ${SIG[d.signature] ?? d.signature} | ${PAY[d.payment] ?? "not stated"} | [page](${d.source}) (${d.checked}) |`);
  }
  md.push("");
  md.push("## Team only, and why", "");
  md.push("| Place | Form | Why | Source (checked) |", "|---|---|---|---|");
  for (const r of rows.filter((x) => !x.d)) {
    const t = TEAM_ONLY[r.f.id], v = TO_VERIFY[r.f.id];
    const why = t?.why ?? (v ? `Waiting for verification: ${v.note}` : "Not researched yet.");
    const src = t ? `[page](${t.source}) (${t.checked})` : v ? `[page](${v.source})` : "";
    md.push(`| ${place(r.f.where)} | ${cell(r.f.title.en)} (\`${r.f.id}\`) | ${cell(why)} | ${src} |`);
  }
  md.push("");
  // The app's route data (src/approvalRoute.ts): every US form, and each form abroad whose route isn't the default
  // ("team": prepared for the business to send, which is what a missing entry means). A destination marked notReady
  // (an unconfirmed sign-off or on-behalf rule) is "notReady" whatever pick() says, so no card promises automatic filing.
  const abroad = FORMS.filter((f) => f.currency && f.currency !== "USD").map((f) => ({ f, d: DEST[f.id], route: routeOf(f, DEST[f.id]) }));
  const kind = (r) => (r.d?.notReady ? "notReady" : r.route);
  for (const r of [...rows, ...abroad]) if (r.d?.notReady && !r.d.portal && !r.d.email && !r.d.fax && !r.d.mail) problems.push(`${r.f.id}: notReady on a destination with no channel`);
  const byId = [...rows, ...abroad.filter((r) => kind(r) !== "team")].map((r) => [r.f.id, kind(r)]).sort(([a], [b]) => a.localeCompare(b));
  const routesJson = "{\n" + byId.map(([id, r]) => `${JSON.stringify(id)}: ${JSON.stringify(r)}`).join(",\n") + "\n}\n";
  // The steps that stay the person's on a route Placetta sends (src/approvalRoute.ts): today only the agency's fee
  // taken on its own site, which the worker always hands to the person (worker/filer/src/guards.ts).
  const steps = [...rows, ...abroad].filter((r) => kind(r) === "portal" && r.d?.payment === "portal").map((r) => r.f.id).sort();
  const stepsJson = "{\n" + steps.map((id) => `${JSON.stringify(id)}: ["pay"]`).join(",\n") + "\n}\n";
  // What Autopilot reads (src/autopilot.ts, src/forms/esign.ts): for every verified destination, the signature the agency
  // accepts, how its fee is paid, whether its site needs the owner's own login, and the agency page that says so, with
  // the day it was checked. No address, number or inbox: only what a card or the Autopilot screen may say.
  const signJson = "{\n" + Object.keys(DEST).sort().map((id) => {
    const d = DEST[id];
    const flag = D.signFlag ? D.signFlag(id, d) : null;
    const row = { s: d.signature, ...(flag ? { f: flag } : {}), ...(d.payment ? { p: d.payment } : {}), ...(d.portal ? { site: d.portal, ...(d.noLogin ? { open: true } : {}) } : {}), ...(d.owner ? { owner: true } : {}), src: d.source, chk: d.checked };
    return `${JSON.stringify(id)}: ${JSON.stringify(row)}`;
  }).join(",\n") + "\n}\n";
  return { problems, counts, markdown: md.join("\n"), routesJson, stepsJson, signJson };
}
