/* Unit economics, measured: npm run econ. Writes docs/unit-economics.json and the tables in docs/UNIT-ECONOMICS.md
   (between its econ:start and econ:end markers), and fails when a journey can't be measured.

   What is measured, and how:
     AI         each journey runs through the code agent-run runs (runRounds) with a scripted model, so every request is
                the one Placetta really builds: Odelia's rules, the tools, the workspace and each tool's real output.
                Tokens are counted the way scripts/eval/speed.ts counts them (about 4 characters a token, 1 for
                Chinese). Each call is priced at supabase/functions/_shared/ai_cost.ts's list prices (read from the
                vendors' pages on 2026-10-22) on four routes: Gemini 3.8 Flash with its prompt cache hitting the shared
                prefix, the same at 2027's price, Gemini with no cache hit at all (the worst case: implicit caching isn't
                guaranteed), and Anthropic only (Sonnet 5.5, cache writes at 1.25x, reads at 0.05x). The model's words
                are the scripted ones; Gemini 3's thinking tokens can't be measured offline and are a separate line.
     Routes     how each license goes out (portal, email, fax, mail, the owner, or Placetta's team) is decided by the
                dispatcher's own pick() (supabase/functions/file/logic.ts) over the verified destinations, with every
                channel switched on, for every license in the plans of the gold and held-out accuracy fixtures.
     Renewals   how many a store files a year, from those plans' own renewal cycles (src/renewal.ts).
   Everything else (team minutes, chat volume, vendor prices) comes from src/economics.ts, labelled there. */
import { writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { B, same } from "../../src/bi";
import { normalizeState } from "../../src/core";
import type { Store, Workspace } from "../../src/model";
import { runRounds, startState, type Send } from "../../src/serverRun";
import type { Block, Services } from "../../src/live";
import { previewPlan } from "../../src/plan/preview";
import { formById } from "../../src/forms/registry";
import { licenseTierOf, SIMPLE, PLAN_STORE_YEAR_USD, TYPICAL_OPENING } from "../../src/pricing";
import { renewalCycle } from "../../src/renewal";
import { tokenCount } from "../../src/odeliaMemory/retrieve";
import { costOf } from "../../supabase/functions/_shared/ai_cost";
import { DEST } from "../../supabase/functions/file/destinations";
import { pick, type Env, type Filing, type Route } from "../../supabase/functions/file/logic";
import { ASSUME, VENDOR, fixedMonthUsd, stripeFee, teamUsd, GUARDRAIL, MAX_COST_PER_STORE_MONTH_USD, SOFT_COST_PER_STORE_MONTH_USD, runningCostPerStoreMonth, storeAiBudget } from "../../src/economics";
import { requestText, MIN_CACHE_TOKENS } from "../eval/speed";
import { prompt as filerPrompt, TOOLS as FILER_TOOLS } from "../../worker/filer/src/model";

const TODAY = "2026-10-22";
const NOW_2026 = new Date("2026-11-01T12:00:00Z"), IN_2027 = new Date("2027-02-01T12:00:00Z");
const r4 = (n: number) => Math.round(n * 1e4) / 1e4, r2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number, d = 2) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const failures: string[] = [];
const must = (cond: unknown, m: string) => { if (!cond) failures.push(m); };

/* ------------------------------------------------------------------ the harness */

type Resp = { content: Block[]; stop_reason: string };
type Out = Record<string, unknown>;
type Turn = (outs: Map<string, Out[]>) => Resp;
let tu = 0;
const ask = (...calls: [string, unknown][]): Resp => ({ content: calls.map(([name, input]) => ({ type: "tool_use", id: `ec_${++tu}`, name, input: input as Record<string, unknown> })), stop_reason: "tool_use" });
const say = (text: string): Resp => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });

function outsOf(messages: { role: string; content: unknown }[]): Map<string, Out[]> {
  const asked = new Map<string, string>(), out = new Map<string, Out[]>();
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content as Record<string, unknown>[]) {
      if (b.type === "tool_use") asked.set(String(b.id), String(b.name));
      if (b.type === "tool_result") {
        const name = asked.get(String(b.tool_use_id)) ?? "?";
        let parsed: Out = {}; try { parsed = JSON.parse(String(b.content)); } catch { parsed = { error: String(b.content) }; }
        out.set(name, [...(out.get(name) ?? []), parsed]);
      }
    }
  }
  return out;
}

const services = (): Services => ({
  filings: () => [], connected: () => [], me: "u-owner",
  async integration<T>(): Promise<T> { throw new Error("no integration"); },
  async saveFile(file: File) { return { path: "ws/" + file.name }; },
  async readFile() { throw new Error("no file"); },
});

type Exchange = { body: Record<string, unknown>; resp: Resp; tools: boolean };
async function run(ws: Workspace, promptText: string, script: Turn[], lang: "en" | "zh" = "en"): Promise<{ ex: Exchange[]; outs: Map<string, Out[]>; ws: Workspace }> {
  let w = ws, i = 0;
  const ex: Exchange[] = [];
  const state = startState([], promptText);
  const send: Send = async (body) => {
    const tools = !!body.tools;
    let resp: Resp;
    if (!tools) resp = { content: [{ type: "text", text: JSON.stringify({ verdict: "pass", items: [] }) }], stop_reason: "end_turn" };
    else { const t = script[i++]; resp = t ? t(outsOf(body.messages as { role: string; content: unknown }[])) : say("Done for now."); }
    ex.push({ body, resp, tools });
    return resp as never;
  };
  await runRounds({ state, ws: () => w, apply: p => { w = p(w); }, step: () => undefined, send, lang, deep: false, account: true, svc: services(),
    signal: new AbortController().signal, until: Date.now() + 60_000, research: false });
  return { ex, outs: outsOf(state.messages as { role: string; content: unknown }[]), ws: w };
}

/* ------------------------------------------------------------------ pricing the requests */

const common = (a: string, b: string) => { const n = Math.min(a.length, b.length); let k = 0; while (k < n && a.charCodeAt(k) === b.charCodeAt(k)) k++; return k; };
type Priced = { calls: number; prompt: number; cached: number; output: number; gemini: number; gemini2027: number; geminiNoCache: number; anthropic: number; thinkingPer1k: number; thinkingPer1k2027: number };

/** Every call of a run on each route. The main loop's calls (with tools) go to the plan route; calls without tools (the
 *  checker, a document read) are priced on the review route's first model, Sonnet 5.5, the dearer of the two. */
function price(ex: Exchange[]): Priced {
  const p: Priced = { calls: 0, prompt: 0, cached: 0, output: 0, gemini: 0, gemini2027: 0, geminiNoCache: 0, anthropic: 0, thinkingPer1k: 0, thinkingPer1k2027: 0 };
  let prev: string | null = null;
  for (const e of ex) {
    const req = requestText(e.body).text;
    const all = tokenCount(req);
    const shared = prev ? tokenCount(req.slice(0, common(prev, req))) : 0;
    const read = shared >= MIN_CACHE_TOKENS ? shared : 0, fresh = all - read;
    const output = Math.max(1, tokenCount(JSON.stringify(e.resp.content)));
    p.calls++; p.prompt += all; p.cached += read; p.output += output;
    if (e.tools) {
      p.gemini += costOf("gemini:gemini-3.8-flash", { input_tokens: fresh, cache_read_input_tokens: read, output_tokens: output }, NOW_2026);
      p.gemini2027 += costOf("gemini:gemini-3.8-flash", { input_tokens: fresh, cache_read_input_tokens: read, output_tokens: output }, IN_2027);
      p.geminiNoCache += costOf("gemini:gemini-3.8-flash", { input_tokens: all, output_tokens: output }, NOW_2026);
      p.thinkingPer1k += costOf("gemini:gemini-3.8-flash", { output_tokens: 1000 }, NOW_2026);
      p.thinkingPer1k2027 += costOf("gemini:gemini-3.8-flash", { output_tokens: 1000 }, IN_2027);
      p.anthropic += costOf("anthropic:claude-sonnet-5-5", { cache_creation_input_tokens: fresh, cache_read_input_tokens: read, output_tokens: output }, NOW_2026);
      prev = req;
    } else {
      // the checker or a document read: its own request, no shared prefix with the loop's
      const c = costOf("anthropic:claude-sonnet-5-5", { input_tokens: all, output_tokens: output }, NOW_2026);
      p.gemini += c; p.gemini2027 += c; p.geminiNoCache += c; p.anthropic += c;
    }
  }
  for (const k of ["gemini", "gemini2027", "geminiNoCache", "anthropic", "thinkingPer1k", "thinkingPer1k2027"] as const) p[k] = r4(p[k]);
  return p;
}

/* ------------------------------------------------------------------ the journeys */

const store = (id: string, address: string, over: Partial<Store> = {}): Store => ({ id, name: same(address.split(",")[0]), address, stage: "open", opened: "2025-01-15", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: [], ...over });
const workspace = (name: string, over: Partial<Workspace> = {}) => normalizeState(name, {
  business: B(`${name} LLC`, `${name}有限公司`), goal: B("Run our stores", "经营门店"),
  facts: [{ id: "f0", group: "business", label: same("Legal name"), value: same(`${name} LLC`), source: same("You told me") },
    { id: "f1", group: "business", label: same("EIN"), value: same("84-1234567"), source: same("From the IRS letter") },
    { id: "f2", group: "business", label: same("Owner"), value: same("Mei Chen"), source: same("You told me") },
    { id: "f3", group: "business", label: same("Phone"), value: same("(408) 555-0134"), source: same("You told me") }], ...over,
});
/** An open store with its plan's permits approved: the shape of a store a month into the store plan. */
function openStore(name: string, what: string, address: string): Workspace {
  const p = previewPlan(what, address, undefined, { today: TODAY });
  const apps = p.apps.map(a => ({ ...a, status: "approved" as const }));
  return workspace(name, { apps, stores: [store("s1", address, { apps: apps.map(a => a.id) })] });
}
const formsOf = (o: Map<string, Out[]>) => ((o.get("find_official_forms")?.[0]?.forms ?? []) as { official_form_id: string }[]).map(f => f.official_form_id);
const prepared = (o: Map<string, Out[]>) => (o.get("prepare_application") ?? []) as { application_id?: string; empty_fields?: string[] }[];
const fillAll = (o: Map<string, Out[]>) => ask(...prepared(o).filter(p => p.application_id).map(p => ["fill_fields", { application_id: p.application_id, fields: (p.empty_fields ?? []).slice(0, 24).map(l => ({ label: l, value: /date/i.test(l) ? "2027-03-01" : /phone/i.test(l) ? "(408) 555-0134" : /ein|employer id/i.test(l) ? "84-1234567" : "Moonleaf Tea LLC", source: "From Context" })) }] as [string, unknown]));
const approveAll = (o: Map<string, Out[]>) => ask(...prepared(o).filter(p => p.application_id).map(p => ["request_filing_approval", { application_id: p.application_id }] as [string, unknown]));

type Journey = { id: string; what: string; priced: Priced };
async function journeys(): Promise<Journey[]> {
  const out: Journey[] = [];
  // 1. a chat turn on an open store: what's due, then which licenses it holds (the two most common questions in the eval)
  {
    const ws = openStore("Moonleaf Tea", "Milk tea shop", "100 N First St, San Jose, CA 95113");
    const a = await run(ws, "What's due this week?", [() => ask(["check_progress", {}]), () => say("Nothing is due this week. Your fire permit renews in March.")]);
    const b = await run(ws, "Which licenses does the San Jose store hold?", [() => ask(["show_licenses", {}]), () => say("Nine, all current. The next renewal is the business tax certificate in January.")]);
    const pa = price(a.ex), pb = price(b.ex);
    const avg = Object.fromEntries(Object.keys(pa).map(k => [k, r4(((pa as Record<string, number>)[k] + (pb as Record<string, number>)[k]) / 2)])) as Priced;
    must(a.outs.get("check_progress")?.length && b.outs.get("show_licenses")?.length, "chat: the tools ran");
    out.push({ id: "chat_turn", what: "One chat turn on an open store (the average of \"what's due\" and \"which licenses\")", priced: avg });
  }
  // 2. a new license: find the form, prepare it, fill it, put it up for approval
  {
    const ws = workspace("Moonleaf Tea", { stores: [store("s1", "100 N First St, San Jose, CA 95113")] });
    const r = await run(ws, "Get the seller's permit for the San Jose store.", [
      () => ask(["find_official_forms", { business: "milk tea shop", place: "San Jose, CA", search: "seller's permit" }]),
      (o) => ask(["prepare_application", { official_form_id: formsOf(o)[0], store_id: "s1" }]),
      (o) => fillAll(o), (o) => approveAll(o),
      () => say("The seller's permit is filled and up for your approval."),
    ]);
    must(prepared(r.outs).length === 1 && r.outs.get("request_filing_approval")?.length, "new license: prepared and put up for approval");
    out.push({ id: "new_license", what: "A new license: found, prepared, filled from the workspace, put up for approval", priced: price(r.ex) });
  }
  // 3. a complex license: beer and wine in Flushing (the SLA license and its community board notice)
  {
    const ws = workspace("Moonleaf Hot Pot", { business: B("Moonleaf Hot Pot LLC", "月叶火锅有限公司"), stores: [store("s1", "136-20 Roosevelt Ave, Flushing, NY 11354")] });
    const r = await run(ws, "We want to serve beer and wine at the Flushing hot pot restaurant.", [
      () => ask(["find_official_forms", { business: "hot pot restaurant", place: "Flushing, NY", serves_alcohol: true }]),
      (o) => ask(...formsOf(o).filter(id => /sla|cb-notice|ttb/.test(id)).map(id => ["prepare_application", { official_form_id: id, store_id: "s1" }] as [string, unknown])),
      (o) => fillAll(o), (o) => approveAll(o),
      () => say("The liquor license, the community board notice and TTB's registration are prepared; two need your answers first."),
    ]);
    must(prepared(r.outs).length >= 2, "liquor: the SLA license and its notice prepared");
    out.push({ id: "complex_license", what: "A complex license: beer and wine in Flushing (SLA license, community board notice, TTB registration)", priced: price(r.ex) });
  }
  // 4. a renewal, started the way the monitor starts one
  {
    const ws = openStore("Moonleaf Tea", "Milk tea shop", "136-20 Roosevelt Ave, Flushing, NY 11354");
    const r = await run(ws, "Start the renewal: Food Service Establishment Permit, expiring 2026-12-01, in 40 days. Find the agency's renewal form, prepare the application, fill it from the workspace and put it up for approval.", [
      () => ask(["find_official_forms", { business: "milk tea shop", place: "Flushing, NY", search: "food service establishment permit" }]),
      (o) => ask(["prepare_application", { official_form_id: formsOf(o).find(id => /fse/.test(id)) ?? formsOf(o)[0], store_id: "s1" }]),
      (o) => fillAll(o), (o) => approveAll(o),
      () => say("The renewal is filled and up for your approval."),
    ]);
    must(prepared(r.outs).length === 1, "renewal: prepared");
    out.push({ id: "renewal", what: "A renewal the monitor starts: found, prepared, filled, put up for approval", priced: price(r.ex) });
  }
  // 5. a four-city entry with plan_markets (the journeys test's tea chain)
  {
    const cities: [string, string, string][] = [["San José", "CA", "San Jose, CA"], ["Irvine", "CA", "Irvine, CA"], ["New York", "NY", "New York, NY"], ["Houston", "TX", "Houston, TX"]];
    const r = await run(workspace("Moonleaf Tea"), "Open Moonleaf milk tea in San José, Irvine, NYC and Houston, all by March 2027.", [
      () => ask(...cities.map(([c, s]) => ["add_store", { name: `Moonleaf ${c}`, city: c, state: s, planned_open: "2027-03-01" }] as [string, unknown])),
      () => ask(["plan_markets", { business: "milk tea shop", places: cities.map(c => c[2]), opening: "2027-03-01" }]),
      () => say("Four stores added; one packet covers all four markets, the shared steps once."),
    ]);
    must(r.outs.get("plan_markets")?.length === 1 && (r.ws.stores ?? []).length === 4, "plan_markets: four stores, one packet");
    out.push({ id: "plan_markets_4", what: "A four-city entry: four stores added, one plan_markets packet", priced: price(r.ex) });
  }
  return out;
}

/* ------------------------------------------------------------------ each filing type, before and after its playbook */

type FlowCount = { runs: number; rounds: number; tools: number; priced: Priced };
type KindRow = { kind: string; name: string; form: string; route: Route; before: FlowCount; after: FlowCount; afterKnown: FlowCount; teamMin: number; agencyTime: string; renews: string; batch3Before: number; batch3After: number };
const sum = (ps: Priced[]): Priced => ps.reduce((a, p) => Object.fromEntries(Object.keys(a).map(k => [k, r4((a as Record<string, number>)[k] + (p as Record<string, number>)[k])])) as Priced);
const answerFor = (l: string) => /date/i.test(l) ? "2027-03-01" : /phone|tel/i.test(l) ? "(408) 555-0134" : /ein|employer id/i.test(l) ? "84-1234567" : /seat|hours/i.test(l) ? "24 seats, 10am to 10pm" : /valu|cost|\$/i.test(l) ? "85000" : "Moonleaf Tea LLC";

async function filingKinds(): Promise<KindRow[]> {
  const { PLAYBOOKS } = await import("../../src/filingPlaybooks");
  const places: Record<string, [string, string]> = {
    business_license: ["Milk tea shop", "100 N First St, San Jose, CA 95113"], health_permit: ["Hot pot restaurant", "136-20 Roosevelt Ave, Flushing, NY 11354"],
    sellers_permit: ["Milk tea shop", "100 N First St, San Jose, CA 95113"], sign_permit: ["Milk tea shop", "100 N First St, San Jose, CA 95113"],
    building_permit: ["Milk tea shop", "100 N First St, San Jose, CA 95113"], liquor: ["Hot pot restaurant", "136-20 Roosevelt Ave, Flushing, NY 11354"],
    entity_registration: ["Milk tea shop", "100 N First St, San Jose, CA 95113"],
  };
  const rows: KindRow[] = [];
  for (const pb of PLAYBOOKS) {
    const at = places[pb.id];
    if (!at) continue;
    const mk = (n = 1) => workspace("Moonleaf Tea", { goal: B(`Open a ${at[0].toLowerCase()}`, "开店"), facts: [...workspace("Moonleaf Tea").facts, { id: "f9", group: "business", label: same("What you sell"), value: same(at[0]), source: same("You told me") }],
      stores: Array.from({ length: n }, (_, k) => store(`s${k + 1}`, at[1])) });
    // before: Odelia reasons it out (find, prepare, fill, ask; then fill the answers and put it up), as the eval's mapping scripts do
    let formId = "";
    const b1 = await run(mk(), `File the ${pb.name.en.toLowerCase()} for the store.`, [
      () => ask(["follow_playbook", { playbook: pb.id }]),   // only to learn which form the playbook picks: not priced
    ]);
    formId = String((b1.outs.get("follow_playbook")?.[0]?.filings as { form?: string }[] | undefined)?.[0]?.form ?? "");
    if (!formId) { must(false, `${pb.id}: no form at ${at[1]}`); continue; }
    const before1 = await run(mk(), `File the ${pb.name.en.toLowerCase()} for the store.`, [
      () => ask(["find_official_forms", { business: at[0], place: at[1], serves_alcohol: pb.id === "liquor", new_us_company: pb.id === "entity_registration", builds_out: true, exterior_sign: true }]),
      () => ask(["prepare_application", { official_form_id: formId, store_id: "s1" }]),
      (o) => ask(["request_filing_approval", { application_id: prepared(o)[0]?.application_id }]),
      () => say("I need a few answers before it can go: the lines below."),
    ]);
    const empties = (prepared(before1.outs)[0]?.empty_fields ?? []) as string[];
    const appId = prepared(before1.outs)[0]?.application_id;
    const before2 = await run(before1.ws, "Here are the answers.", [
      () => ask(["fill_fields", { application_id: appId, fields: empties.map(l => ({ label: l, value: answerFor(l), source: "You told me" })) }]),
      () => ask(["request_filing_approval", { application_id: appId }]),
      () => say("Filled and up for your approval."),
    ]);
    // after: the playbook, twice (the second time with the answers), or once when the profile already has everything
    const after1 = await run(mk(), `File the ${pb.name.en.toLowerCase()} for the store.`, [() => ask(["follow_playbook", { playbook: pb.id }]), () => say("I need a few answers.")]);
    const asked = ((after1.outs.get("follow_playbook")?.[0]?.ask_once as { answers?: string[] } | undefined)?.answers ?? []);
    const after2 = await run(after1.ws, "Here are the answers.", [() => ask(["follow_playbook", { playbook: pb.id, answers: asked.map(l => ({ label: l, value: answerFor(l) })) }]), () => say("Up for your approval.")]);
    const known = await run(after2.ws, `File the ${pb.name.en.toLowerCase()} for the store.`, [() => ask(["follow_playbook", { playbook: pb.id }]), () => say("Up for your approval.")]);
    // three stores at once: tool calls before (each store's prepare, fill and approval) and after (one call)
    const off = formById(formId)!;
    const f = { payload: { official: formId }, fee_estimate: off.fee ?? null, agent_log: [] } as unknown as Filing;
    const route = pick(f, DEST[formId], ALL_ON, { hasLogin: true, mailConnected: true });
    const teamMin = pb.id === "liquor" ? ASSUME.teamMinutes.complex : route === "team" ? ASSUME.teamMinutes.team : route === "owner" ? ASSUME.teamMinutes.owner : ASSUME.teamMinutes.automated + ASSUME.teamMinutes.twoKeyReview;
    const count = (rs: { ex: Exchange[] }[]): FlowCount => ({ runs: rs.length, rounds: rs.reduce((n, r) => n + r.ex.filter(e => e.tools).length, 0),
      tools: rs.reduce((n, r) => n + r.ex.filter(e => e.tools).reduce((m, e) => m + e.resp.content.filter(c => c.type === "tool_use").length, 0), 0), priced: sum(rs.map(r => price(r.ex))) });
    must(String(asked.length) !== "" && (after2.outs.get("follow_playbook")?.[0]?.filings as { empty: number }[])?.[0]?.empty === 0, `${pb.id}: the answers fill every line`);
    rows.push({ kind: pb.id, name: pb.name.en, form: formId, route, before: count([before1, before2]), after: count([after1, after2]), afterKnown: count([known]), teamMin,
      // three stores: before, one find, then a prepare and an approval a store, then a fill and an approval a store; after, two calls
      agencyTime: off.takes?.en ?? "not published", renews: off.renews?.en ?? "not stated", batch3Before: 1 + 4 * 3, batch3After: 2 });
  }
  return rows;
}

/* ------------------------------------------------------------------ routes and renewals, from the registry */

const ALL_ON: Env = { agencies: [], channels: ["email", "fax", "mail", "portal", "team"], portalWorker: true, dryRun: false, twoKey: 10, dailyCap: 10, fax: true, mail: true, holdMinutes: 10 };
type RouteMix = { n: number; byRoute: Record<Route, number>; byTier: Record<string, number>; renewing: number; renewalsPerYear: number; renewalByRoute: Record<Route, number> };
function fixtures(): { what: string; where: string }[] {
  const out: { what: string; where: string }[] = [];
  for (const dir of ["scripts/eval/gold", "scripts/eval/heldout"]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(x => x.endsWith(".json"))) {
      try { const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); if (j?.input?.what && j?.input?.where) out.push({ what: j.input.what, where: j.input.where }); } catch { /* not a fixture */ }
    }
  }
  return out;
}
function routeMix(): RouteMix & { stores: number } {
  const routes: Route[] = ["portal", "email", "fax", "mail", "owner", "team"];
  const zero = () => Object.fromEntries(routes.map(r => [r, 0])) as Record<Route, number>;
  const m = { n: 0, byRoute: zero(), byTier: {} as Record<string, number>, renewing: 0, renewalsPerYear: 0, renewalByRoute: zero(), stores: 0 };
  for (const fx of fixtures()) {
    const p = previewPlan(fx.what, fx.where, "2027-03-01", { today: TODAY });
    m.stores++;
    for (const a of p.apps) {
      const tier = licenseTierOf(a.name.en);
      m.byTier[tier] = (m.byTier[tier] ?? 0) + 1;
      if (tier === "free") continue;
      const off = a.official ? formById(a.official) : undefined;
      const f = { payload: { official: a.official }, fee_estimate: off?.fee ?? null, agent_log: [] } as unknown as Filing;
      const route = pick(f, a.official ? DEST[a.official] : undefined, ALL_ON, { hasLogin: true, mailConnected: true });
      m.n++; m.byRoute[route]++;
      // a license that renews at all: at the cycle its agency publishes when Placetta can read it (src/renewal.ts), else
      // once a year (most do; "by the tax return due date" and the like aren't read into a date, by design)
      const said = a.renews?.en ?? (off as { renews?: { en: string } } | undefined)?.renews?.en ?? "";
      if (said && !/not expire|never expire|one[- ]time|no renewal/i.test(said)) {
        const c = renewalCycle(said);
        const perYear = c && "months" in c ? 12 / c.months : 1;
        m.renewing++; m.renewalsPerYear += perYear; m.renewalByRoute[route] += perYear;
      }
    }
  }
  return m;
}

/* ------------------------------------------------------------------ the portal filer's own model calls */

function filerStep(): { tokens: number; usd: number } {
  const controls = Array.from({ length: 20 }, (_, k) => ({ selector: `#field_${k}`, type: k % 5 === 0 ? "select" : "text", label: `Business information line ${k + 1}`, name: `f${k}`, id: `f${k}`, ...(k % 5 === 0 ? { options: ["Corporation", "LLC", "Sole proprietor", "Partnership"] } : {}) }));
  const state = { url: "https://bizfile.sos.ca.gov/forms/business", title: "Business filing", headings: ["Statement of Information"], controls, buttons: [{ selector: "#next", text: "Next" }, { selector: "#back", text: "Back" }],
    links: Array.from({ length: 20 }, (_, k) => ({ selector: `a#l${k}`, text: `Help ${k}`, href: "https://bizfile.sos.ca.gov/help" })), text: "x".repeat(2000), frames: [], markers: [] };
  const filing = { payload: { official: "ca-soi", form: { en: "Statement of Information", zh: "信息声明" }, fields: Array.from({ length: 15 }, (_, k) => ({ label: { en: `Line ${k + 1}`, zh: "" }, value: "Moonleaf Tea LLC" })), attachments: [] } };
  const text = JSON.stringify(FILER_TOOLS) + filerPrompt({ filing: filing as never, agency: "bizfile.sos.ca.gov", state: state as never, recent: Array.from({ length: 10 }, (_, k) => `filled #field_${k}`) });
  const tokens = tokenCount(text);
  return { tokens, usd: costOf(`anthropic:${process.env.FILER_MODEL ?? "claude-sonnet-5-5"}`, { input_tokens: tokens, output_tokens: 60 }, NOW_2026) };
}

/* ------------------------------------------------------------------ cost of each thing sold */

type Line = { item: string; price: number; ai: number; delivery: number; team: number; stripe: number; cost: number; margin: number; note: string };
function line(item: string, price: number, ai: number, delivery: number, teamMin: number, stripe: number, note: string): Line {
  const team = teamUsd(teamMin), cost = r2(ai + delivery + team + stripe);
  return { item, price, ai: r2(ai), delivery: r2(delivery), team, stripe, cost, margin: price > 0 ? (price - cost) / price : -1, note };
}

async function main() {
  const js = await journeys();
  const kinds = await filingKinds();
  const by = Object.fromEntries(js.map(j => [j.id, j.priced])) as Record<string, Priced>;
  const mix = routeMix();
  const step = filerStep();
  must(mix.n > 50, `route mix: only ${mix.n} licenses in the fixtures`);

  // AI per journey, on the default route (Gemini 3.8 Flash) and the worst of the four
  const worst = (p: Priced) => Math.max(p.gemini, p.gemini2027, p.geminiNoCache, p.anthropic);
  const T = ASSUME.thinkingTokensPerCall / 1000;
  const aiOf = (p: Priced, pessimistic = false) => (pessimistic ? worst(p) : p.gemini) + T * (pessimistic ? p.thinkingPer1k2027 : p.thinkingPer1k);

  // how a license goes out: shares of the measured mix
  const share = (r: Route) => mix.byRoute[r] / mix.n;
  const automatedShare = share("portal") + share("email") + share("fax") + share("mail");
  const deliveryAuto = share("portal") * (ASSUME.portalBrowserMinutes / 60 * VENDOR.browserHour.usd + ASSUME.portalSteps * step.usd)
    + share("fax") * ASSUME.pagesPerFiling * VENDOR.faxPage.usd
    + share("mail") * (VENDOR.letter.usd + (ASSUME.pagesPerFiling - 1) * VENDOR.letterPage.usd + VENDOR.certified.usd);
  // team minutes a new license takes, averaged over the mix: automated ones get a two-key review on an agency's first
  // ten (counted in full here: the early months), the team's own ones take the team's time, owner packets a check
  const teamMinLicense = automatedShare * (ASSUME.teamMinutes.automated + ASSUME.teamMinutes.twoKeyReview) + share("team") * ASSUME.teamMinutes.team + share("owner") * ASSUME.teamMinutes.owner;
  const renewalTeamShare = mix.renewalsPerYear ? (mix.renewalByRoute.team + mix.renewalByRoute.owner) / mix.renewalsPerYear : 0.5;
  const renewalsPerStoreYear = mix.stores ? mix.renewalsPerYear / mix.stores : ASSUME.renewalsPerStoreYear;

  // a store's month on the plan
  const chat = aiOf(by.chat_turn), chatWorst = aiOf(by.chat_turn, true);
  const storeMonthAi = ASSUME.chatTurnsPerStoreMonth * chat + ASSUME.watchRunsPerStoreMonth * ASSUME.watchRunUsd;
  const heavyMonthAi = ASSUME.heavyChatTurnsPerStoreMonth * chat + ASSUME.watchRunsPerStoreMonth * ASSUME.watchRunUsd;
  const allowanceMonth = storeAiBudget().hard;   // ai_rules().store_plan_month: the most AI a store-month can cost
  const sms = ASSUME.smsPerStoreMonth * (VENDOR.smsMessage.usd + VENDOR.smsCarrier.usd);
  // the renewals Odelia files on her own are included in the plan: AI plus delivery, a month's share
  const ownRenewalsMonth = (renewalsPerStoreYear * (1 - renewalTeamShare)) / 12;
  const renewalAi = aiOf(by.renewal);
  const ownRenewalCost = ownRenewalsMonth * (renewalAi + deliveryAuto / Math.max(automatedShare, 0.01));
  const ownRenewalTeamMin = ownRenewalsMonth * ASSUME.teamMinutes.renewalAutomated;

  const planMonth = SIMPLE.planStoreMonthUsd;
  const planStripe = stripeFee(PLAN_STORE_YEAR_USD, "subscription_card") / 12;
  const items: Line[] = [
    line("Store plan, a store a month (typical)", planMonth, storeMonthAi, sms + ownRenewalCost - ownRenewalsMonth * renewalAi, ownRenewalTeamMin, r2(planStripe), `${ASSUME.chatTurnsPerStoreMonth} chat turns, ${ASSUME.watchRunsPerStoreMonth} weekly checks, ${r2(ownRenewalsMonth)} included renewals`),
    line("Store plan, a store a month (heavy chat)", planMonth, heavyMonthAi, sms + ownRenewalCost - ownRenewalsMonth * renewalAi, ownRenewalTeamMin, r2(planStripe), `${ASSUME.heavyChatTurnsPerStoreMonth} chat turns`),
    line("Store plan, a store a month (abusive: at the allowance)", planMonth, allowanceMonth, sms + ownRenewalCost - ownRenewalsMonth * renewalAi, ownRenewalTeamMin, r2(planStripe), `the gate holds AI at the store plan's $${storeAiBudget().hard} allowance (the $50 ceiling less running cost)`),
    line("New license", SIMPLE.licenseUsd, aiOf(by.new_license), deliveryAuto, teamMinLicense, stripeFee(SIMPLE.licenseUsd), `route mix measured over ${mix.n} licenses`),
    line("New license, pessimistic AI and all by the team", SIMPLE.licenseUsd, aiOf(by.new_license, true), 0, ASSUME.teamMinutes.team, stripeFee(SIMPLE.licenseUsd), "worst route, the team files it"),
    line("Complex license (liquor)", SIMPLE.complexUsd, aiOf(by.complex_license), 0, ASSUME.teamMinutes.complex, stripeFee(SIMPLE.complexUsd), "team-led: hearings, notices, corrections"),
    line("Renewal the plan doesn't include ($99)", SIMPLE.renewalUsd, renewalAi, 0, ASSUME.teamMinutes.renewalTeam, stripeFee(SIMPLE.renewalUsd), "it needs the team by definition"),
    line("Four-city entry (plan_markets), the planning run", 0, aiOf(by.plan_markets_4), 0, 0, 0, "the plan preview is free; licenses are bought one by one"),
  ];

  // customers, a year
  type Cust = { who: string; stores: number; opens: number; complexPerOpening: number; licensesPerOpening: number; chain: boolean };
  const custs: Cust[] = [
    { who: "One store, open", stores: 1, opens: 0, complexPerOpening: 0, licensesPerOpening: 0, chain: false },
    { who: "One store, opening (the typical San José restaurant)", stores: 1, opens: 1, complexPerOpening: TYPICAL_OPENING.complex, licensesPerOpening: TYPICAL_OPENING.licenses, chain: false },
    { who: "5-store chain, opens 1 a year", stores: 5, opens: 1, complexPerOpening: TYPICAL_OPENING.complex, licensesPerOpening: TYPICAL_OPENING.licenses, chain: false },
    { who: "20-store chain, opens 1 a year", stores: 20, opens: 1, complexPerOpening: TYPICAL_OPENING.complex, licensesPerOpening: TYPICAL_OPENING.licenses, chain: true },
    { who: "20-store chain, opens 5 a year (25% growth)", stores: 20, opens: 5, complexPerOpening: TYPICAL_OPENING.complex, licensesPerOpening: TYPICAL_OPENING.licenses, chain: true },
    { who: "10-store chain, opens 3 a year (25% growth, just over the line)", stores: 10, opens: 3, complexPerOpening: TYPICAL_OPENING.complex, licensesPerOpening: TYPICAL_OPENING.licenses, chain: true },
  ];
  const L = Object.fromEntries(items.map(i => [i.item, i])) as Record<string, Line>;
  const typical = L["Store plan, a store a month (typical)"], newLic = L["New license"], cx = L["Complex license (liquor)"], rn = L["Renewal the plan doesn't include ($99)"];
  const teamRenewalsPerStoreYear = renewalsPerStoreYear * renewalTeamShare;
  const fixedYear = fixedMonthUsd() * 12;
  const customers = custs.map(c => {
    const storeMonths = c.stores * 12 + c.opens * 6;   // a store opened mid-year pays half a year
    const planRev = storeMonths * planMonth;
    const planCost = storeMonths * typical.cost;
    const lic = c.opens * c.licensesPerOpening, cmp = c.opens * c.complexPerOpening;
    const licRev = c.chain ? 0 : lic * SIMPLE.licenseUsd + cmp * SIMPLE.complexUsd;
    // a chain's included licenses cost the same to deliver, with no charge and no Stripe fee
    const licCost = lic * (newLic.cost - (c.chain ? newLic.stripe : 0)) + cmp * (cx.cost - (c.chain ? cx.stripe : 0));
    // renewals the team sends are $99 on every plan (the chain plan includes new licenses, not renewals: src/pricing.ts)
    const rnCount = c.stores * teamRenewalsPerStoreYear;
    const rnRevAll = rnCount * SIMPLE.renewalUsd;
    const rnCost = rnCount * rn.cost;
    const revenue = r2(planRev + licRev + rnRevAll), cost = r2(planCost + licCost + rnCost);
    // the $50 ceiling counts AI and running cost a store-month; team minutes are shown apart, against the fees that pay them
    const machine = (i: Line) => i.ai + i.delivery + (c.chain && i !== rn ? 0 : i.stripe);
    const aiRunStoreMonth = r2((storeMonths * (typical.cost - typical.team) + lic * machine(newLic) + cmp * machine(cx) + rnCount * machine(rn)) / storeMonths);
    const teamStoreMonth = r2((storeMonths * typical.team + lic * newLic.team + cmp * cx.team + rnCount * rn.team) / storeMonths);
    const feesStoreMonth = r2((licRev + rnRevAll) / storeMonths);
    return { who: c.who, stores: c.stores, opens: c.opens, revenue, cost, margin: revenue ? (revenue - cost) / revenue : 0, licensesIncluded: c.chain ? lic + cmp : 0,
      aiRunStoreMonth, teamStoreMonth, feesStoreMonth, fits: aiRunStoreMonth <= MAX_COST_PER_STORE_MONTH_USD, profitStoreMonth: r2((revenue - cost) / storeMonths) };
  });

  // a heavy month for one store: 200 chat turns, five new licenses, one complex, two renewals the team sends, four
  // weekly checks, all on the dearest of the four routes, plus the store's running cost
  const heavy = {
    chats: 200, licenses: 5, complex: 1, teamRenewals: 2,
    ai: r2(200 * aiOf(by.chat_turn, true) + 5 * aiOf(by.new_license, true) + aiOf(by.complex_license, true) + 2 * aiOf(by.renewal, true) + ASSUME.watchRunsPerStoreMonth * ASSUME.watchRunUsd),
    running: runningCostPerStoreMonth(),
    licenseAi: r2(5 * aiOf(by.new_license, true) + aiOf(by.complex_license, true) + 2 * aiOf(by.renewal, true)),
    fees: 5 * SIMPLE.licenseUsd + SIMPLE.complexUsd + 2 * SIMPLE.renewalUsd,
    team: r2(5 * newLic.team + cx.team + 2 * rn.team),
    feeStripe: r2(5 * newLic.stripe + cx.stripe + 2 * rn.stripe),
  };
  const ceiling = storeAiBudget();

  const result = {
    measured: TODAY, prices: "supabase/functions/_shared/ai_cost.ts (Anthropic and Gemini read 2026-10-22)", assumptions: "src/economics.ts ASSUME (FOUNDER TO CONFIRM)",
    journeys: js.map(j => ({ id: j.id, what: j.what, ...j.priced })),
    filer: { tokensPerStep: step.tokens, usdPerStep: r4(step.usd), steps: ASSUME.portalSteps, maxSteps: 80, usdAtMax: r4(step.usd * 80) },
    routeMix: { licenses: mix.n, stores: mix.stores, byRoute: mix.byRoute, byTier: mix.byTier, automatedShare: r4(automatedShare), renewalsPerStoreYear: r2(renewalsPerStoreYear), renewalTeamShare: r4(renewalTeamShare) },
    teamMinutesPerLicense: r2(teamMinLicense), fixedMonthUsd: fixedMonthUsd(), fixedYearUsd: fixedYear,
    items, customers, guardrail: GUARDRAIL, ceiling: { max: MAX_COST_PER_STORE_MONTH_USD, soft: SOFT_COST_PER_STORE_MONTH_USD, running: runningCostPerStoreMonth(), aiHard: ceiling.hard, aiSoft: ceiling.soft }, heavyMonth: heavy,
    perChatTurn: { typical: r4(chat), worst: r4(chatWorst) },
    filingKinds: kinds.map(k => ({ kind: k.kind, form: k.form, route: k.route, before: { runs: k.before.runs, rounds: k.before.rounds, tools: k.before.tools, prompt: k.before.priced.prompt, usd: k.before.priced.gemini },
      after: { runs: k.after.runs, rounds: k.after.rounds, tools: k.after.tools, prompt: k.after.priced.prompt, usd: k.after.priced.gemini }, profileComplete: { runs: k.afterKnown.runs, rounds: k.afterKnown.rounds, usd: k.afterKnown.priced.gemini }, teamMinutes: k.teamMin })),
  };
  writeFileSync("docs/unit-economics.json", JSON.stringify(result, null, 2) + "\n");

  // the tables in docs/UNIT-ECONOMICS.md
  const t: string[] = [];
  t.push("### AI per journey, measured from the requests Placetta builds", "", "| Journey | Model calls | Prompt tokens | From cache | Output tokens | Gemini 3.8 Flash, 2026 | Same, 2027 price | Gemini, no cache hit | Anthropic only (Sonnet 5.5) | Per 1,000 thinking tokens a call |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const j of js) { const p = j.priced; t.push(`| ${j.what} | ${p.calls} | ${p.prompt.toLocaleString("en-US")} | ${pct(p.prompt ? p.cached / p.prompt : 0)} | ${p.output.toLocaleString("en-US")} | ${usd(p.gemini, 4)} | ${usd(p.gemini2027, 4)} | ${usd(p.geminiNoCache, 4)} | ${usd(p.anthropic, 4)} | ${usd(p.thinkingPer1k, 4)} |`); }
  t.push("", `The portal filer (worker/filer, Sonnet 5.5, no prompt cache): ${step.tokens.toLocaleString("en-US")} tokens a step, ${usd(step.usd, 4)} a step, ${usd(step.usd * ASSUME.portalSteps, 2)} for ${ASSUME.portalSteps} steps (est.), ${usd(step.usd * 80, 2)} at its 80-step cap.`);
  t.push("", "### How a license goes out, measured over the accuracy fixtures' plans", "", `${mix.n} chargeable licenses in ${mix.stores} store plans (gold and held-out sets), routed by the dispatcher's own pick() with every channel on:`, "", "| Route | Licenses | Share |", "|---|---:|---:|");
  for (const r of ["portal", "email", "fax", "mail", "owner", "team"] as Route[]) t.push(`| ${r} | ${mix.byRoute[r]} | ${pct(share(r))} |`);
  t.push("", `Renewals: ${r2(renewalsPerStoreYear)} a store a year from the plans' own cycles; ${pct(renewalTeamShare)} of them go to the team or the owner (so they are the $99 kind), the rest Odelia can send on her own (included in the plan).`);
  t.push("", "### Contribution margin per thing sold (est.)", "", "| Item | Price | AI | Delivery | Team | Stripe | Cost | Margin | Basis |", "|---|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const i of items) t.push(`| ${i.item} | ${usd(i.price)} | ${usd(i.ai)} | ${usd(i.delivery)} | ${usd(i.team)} | ${usd(i.stripe)} | ${usd(i.cost)} | ${i.price ? pct(i.margin) : "free"} | ${i.note} |`);
  t.push("", "### Contribution margin per customer, a year (est.)", "", "| Customer | Stores | Opens | Revenue | Cost | Margin | Licenses included free |", "|---|---:|---:|---:|---:|---:|---:|");
  for (const c of customers) t.push(`| ${c.who} | ${c.stores} | ${c.opens} | ${usd(c.revenue, 0)} | ${usd(c.cost, 0)} | ${pct(c.margin)} | ${c.licensesIncluded} |`);
  t.push("", `### The $${MAX_COST_PER_STORE_MONTH_USD} ceiling a store a month`, "",
    `AI and running cost a store may cost in a month: $${MAX_COST_PER_STORE_MONTH_USD}, saver mode from $${SOFT_COST_PER_STORE_MONTH_USD}. Running cost that isn't AI is ${usd(runningCostPerStoreMonth())} a store-month (Stripe on the yearly invoice by card, alert texts, the renewals Odelia sends), so the gate allows $${ceiling.hard} of AI a store (saver from $${ceiling.soft}).`, "",
    "Each journey on the dearest of the four routes (with 1,000 thinking tokens a call at 2027's price), and how many fit in the AI allowance:", "",
    "| Journey | AI, dearest route | Fits in $" + ceiling.hard + " |", "|---|---:|---:|");
  for (const j of js) { const w = worst(j.priced) + j.priced.thinkingPer1k2027; t.push(`| ${j.what} | ${usd(w, 4)} | ${Math.floor(ceiling.hard / w).toLocaleString("en-US")} |`); }
  t.push("", "Each customer type, a store-month: AI and running cost against the ceiling, and team time apart, against the fees that pay it:", "",
    "| Customer | AI and running a store-month | Under $50 | Team a store-month | License and renewal fees a store-month | Profit a store-month |", "|---|---:|---|---:|---:|---:|");
  for (const c of customers) t.push(`| ${c.who} | ${usd(c.aiRunStoreMonth)} | ${c.fits ? "yes" : "no"} | ${usd(c.teamStoreMonth)} | ${usd(c.feesStoreMonth)} | ${usd(c.profitStoreMonth)} |`);
  t.push("", `A heavy month for one store, everything on the dearest route: ${heavy.chats} chat turns, ${heavy.licenses} new licenses, ${heavy.complex} complex, ${heavy.teamRenewals} renewals the team sends and the weekly checks cost ${usd(heavy.ai)} of AI, ${usd(heavy.ai + heavy.running)} with running cost: ${heavy.ai + heavy.running <= MAX_COST_PER_STORE_MONTH_USD ? "under" : "over"} $${MAX_COST_PER_STORE_MONTH_USD}. The licenses' and renewals' own AI is ${usd(heavy.licenseAi)}; their fees (${usd(heavy.fees, 0)}) pay it many times over, and pay their team time (${usd(heavy.team)}) and Stripe (${usd(heavy.feeStripe)}) too, so none of it has to come out of the $${MAX_COST_PER_STORE_MONTH_USD}. Their AI still counts against the store's allowance in the gate; at about ${usd(heavy.licenseAi / (heavy.licenses + heavy.complex + heavy.teamRenewals), 3)} a filing it never decides whether one fits.`);
  t.push("", "### Each filing type, first request to approval, before and after its playbook", "",
    "Measured on one store whose profile lacks the form's own answers (the usual case: two runs, one question in between), through runRounds with a scripted model. \"Before\" is Odelia reasoning it out: find the form, prepare it, try the approval, ask; then fill the answers and put it up. \"After\" is follow_playbook twice. \"Profile complete\" is the playbook when nothing is missing. AI on Gemini 3.8 Flash at 2026's price. Team minutes are the estimate for the route the dispatcher picks for that store's form (FOUNDER TO CONFIRM).", "",
    "| Filing | Form | Runs before / after | Model rounds before / after | Tool calls before / after | Prompt tokens before / after | AI before / after | Profile complete: runs, rounds, AI | Three stores: tool calls before / after | Route | Team minutes (est.) | Agency time | Renews |",
    "|---|---|---|---|---|---|---|---|---|---|---:|---|---|");
  for (const k of kinds) t.push(`| ${k.name} | ${k.form} | ${k.before.runs} / ${k.after.runs} | ${k.before.rounds} / ${k.after.rounds} | ${k.before.tools} / ${k.after.tools} | ${k.before.priced.prompt.toLocaleString("en-US")} / ${k.after.priced.prompt.toLocaleString("en-US")} | ${usd(k.before.priced.gemini, 4)} / ${usd(k.after.priced.gemini, 4)} | ${k.afterKnown.runs}, ${k.afterKnown.rounds}, ${usd(k.afterKnown.priced.gemini, 4)} | ${k.batch3Before} / ${k.batch3After} | ${k.route} | ${k.teamMin} | ${k.agencyTime.replace(/\|/g, "/")} | ${k.renews.replace(/\|/g, "/")} |`);
  if (kinds.length) {
    const avg = (f: (k: KindRow) => number) => kinds.reduce((a, k) => a + f(k), 0) / kinds.length;
    const dr = 1 - avg(k => k.after.rounds) / avg(k => k.before.rounds), dt = 1 - avg(k => k.after.tools) / avg(k => k.before.tools), dc = 1 - avg(k => k.after.priced.gemini) / avg(k => k.before.priced.gemini);
    t.push("", `Across the ${kinds.length} kinds: model rounds down ${pct(dr)}, tool calls down ${pct(dt)}, AI cost down ${pct(dc)}. Runs stay at two when something must be asked (one question, one answer) and drop to one when the profile already has it. A rejection by the agency adds one run either way (read the reason, fix, approve again); the playbook's checks in code are there to make it rarer, and there is no production rejection rate yet to measure it against. Sales tax returns have no registry form yet, so their playbook hands them to the team (no row).`);
  }
  t.push("", `Fixed platform cost before the first customer: ${usd(fixedMonthUsd(), 0)} a month (${usd(fixedYear, 0)} a year): Supabase Pro, Vercel Pro, the Render worker, Resend Pro, a Telnyx number and Browserbase Startup. It is left out of the per-customer margin above.`);
  const table = t.join("\n");
  const doc = "docs/UNIT-ECONOMICS.md";
  if (existsSync(doc)) {
    const s = readFileSync(doc, "utf8");
    const a = s.indexOf("<!-- econ:start -->"), b = s.indexOf("<!-- econ:end -->");
    if (a >= 0 && b > a) writeFileSync(doc, s.slice(0, a) + "<!-- econ:start -->\n" + table + "\n" + s.slice(b));
  }
  console.log(table);
  if (failures.length) { console.error("\nFAILED:\n" + failures.join("\n")); process.exit(1); }
}

await main();
