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
import { ASSUME, VENDOR, fixedMonthUsd, stripeFee, teamUsd, GUARDRAIL } from "../../src/economics";
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
  const allowanceMonth = 25;   // ai_rules().per_location_month: the store plan's AI allowance, the most a month can cost
  const sms = ASSUME.smsPerStoreMonth * (VENDOR.smsMessage.usd + VENDOR.smsCarrier.usd);
  // the renewals Odelia files on her own are included in the plan: AI plus delivery, a month's share
  const ownRenewalsMonth = (renewalsPerStoreYear * (1 - renewalTeamShare)) / 12;
  const renewalAi = aiOf(by.renewal);
  const ownRenewalCost = ownRenewalsMonth * (renewalAi + deliveryAuto / Math.max(automatedShare, 0.01) + teamUsd(ASSUME.teamMinutes.renewalAutomated));

  const planMonth = SIMPLE.planStoreMonthUsd;
  const planStripe = stripeFee(PLAN_STORE_YEAR_USD, "subscription_card") / 12;
  const items: Line[] = [
    line("Store plan, a store a month (typical)", planMonth, storeMonthAi, sms + ownRenewalCost - ownRenewalsMonth * renewalAi, 0, r2(planStripe), `${ASSUME.chatTurnsPerStoreMonth} chat turns, ${ASSUME.watchRunsPerStoreMonth} weekly checks, ${r2(ownRenewalsMonth)} included renewals`),
    line("Store plan, a store a month (heavy chat)", planMonth, heavyMonthAi, sms + ownRenewalCost - ownRenewalsMonth * renewalAi, 0, r2(planStripe), `${ASSUME.heavyChatTurnsPerStoreMonth} chat turns`),
    line("Store plan, a store a month (abusive: at the allowance)", planMonth, allowanceMonth, sms + ownRenewalCost - ownRenewalsMonth * renewalAi, 0, r2(planStripe), "the gate holds AI at the plan's $25 allowance"),
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
    return { who: c.who, stores: c.stores, opens: c.opens, revenue, cost, margin: revenue ? (revenue - cost) / revenue : 0, licensesIncluded: c.chain ? lic + cmp : 0 };
  });

  const result = {
    measured: TODAY, prices: "supabase/functions/_shared/ai_cost.ts (Anthropic and Gemini read 2026-10-22)", assumptions: "src/economics.ts ASSUME (FOUNDER TO CONFIRM)",
    journeys: js.map(j => ({ id: j.id, what: j.what, ...j.priced })),
    filer: { tokensPerStep: step.tokens, usdPerStep: r4(step.usd), steps: ASSUME.portalSteps, maxSteps: 80, usdAtMax: r4(step.usd * 80) },
    routeMix: { licenses: mix.n, stores: mix.stores, byRoute: mix.byRoute, byTier: mix.byTier, automatedShare: r4(automatedShare), renewalsPerStoreYear: r2(renewalsPerStoreYear), renewalTeamShare: r4(renewalTeamShare) },
    teamMinutesPerLicense: r2(teamMinLicense), fixedMonthUsd: fixedMonthUsd(), fixedYearUsd: fixedYear,
    items, customers, guardrail: GUARDRAIL,
    perChatTurn: { typical: r4(chat), worst: r4(chatWorst) },
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
