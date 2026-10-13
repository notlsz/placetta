// npm run test:e2e: Placetta's backend end to end, on this machine. A throwaway Postgres with every migration, PostgREST,
// a stand-in Supabase gateway, the real edge functions (imported here, with fetch patched so Anthropic, Telnyx, Stripe
// and Resend are local recording stubs) and the real agent loop and tools driven by a scripted model. It seeds an owner,
// a Placetta team member and a headquarters contact, then runs app chat, texting, calling, proactive texts, billing,
// filing, headquarters and account deletion, checking database rows and every outbound request. One line per check;
// exits 1 on any failure. Set E2E_VERBOSE=1 to see the functions' own logs as they happen.
import { PROD_URL, ROOT, signJwt, startStack, userJwt, type Stack } from "./infra.ts";

const VERBOSE = Deno.env.get("E2E_VERBOSE") === "1";
const logLines: string[] = [];
for (const k of ["log", "error", "warn", "info"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => { logLines.push(`[${k}] ${a.map((x) => (typeof x === "string" ? x : Deno.inspect(x, { depth: 4 }))).join(" ")}`); if (VERBOSE) orig(...a); };
}
const out = (s: string) => Deno.stdout.writeSync(new TextEncoder().encode(s + "\n"));

/* ------------------------------ the functions' environment ------------------------------ */

const ODELIA = "+12125550100", OWNER_PHONE = "+17185550123", STRANGER = "+16465550199";
const APP = "https://app.placetta.test";
const telnyxKeys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const SERVICE_KEY = await signJwt({ role: "service_role" }), ANON_KEY = await signJwt({ role: "anon" });
const ENV: Record<string, string> = {
  SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, SUPABASE_ANON_KEY: ANON_KEY,
  ANTHROPIC_API_KEY: "sk-ant-e2e", APP_ORIGINS: APP, RESEND_API_KEY: "re_e2e", MAIL_FROM: "Placetta <hello@placetta.test>",
  TELNYX_API_KEY: "KEY_e2e", TELNYX_PUBLIC_KEY: b64(await crypto.subtle.exportKey("raw", telnyxKeys.publicKey)), ODELIA_NUMBER: ODELIA,
  TELNYX_MESSAGING_PROFILE_ID: "mp_e2e", TELNYX_VOICE_CONNECTION_ID: "conn_e2e", TELNYX_ASSISTANT_ID: "assistant-e2e",
  STRIPE_SECRET_KEY: "sk_test_e2e", STRIPE_WEBHOOK_SECRET: "whsec_e2e", STRIPE_PRICE_LOCATION: "price_location", STRIPE_PRICE_OPENING: "price_opening", STRIPE_PRICE_ENTRY: "price_entry",
  OAUTH_STATE_SECRET: "e2e-oauth-state-secret-0123456789abcdef",
  // self-filing: on for Form SS-4 by fax only, without the two-key review, so a filing can go all the way
  FILER_AGENCIES: "irs-ss4", FILER_CHANNELS: "fax", FILER_TWO_KEY: "0", TELNYX_FAX_CONNECTION_ID: "fax_conn_e2e", TELNYX_FAX_FROM: "+12125550101", FILER_SECRET: "e2e-filer-secret-0123456789abcdef0123",
};
for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v);

// A clock the test can move (the Monday HQ report). Everything in this process sees it; the database keeps real time.
const RealDate = Date;
let clockOffset = 0;
class TestDate extends RealDate {
  // deno-lint-ignore no-explicit-any
  constructor(...a: any[]) { if (a.length === 0) super(RealDate.now() + clockOffset); else super(...(a as [string])); }
  static override now() { return RealDate.now() + clockOffset; }
}
globalThis.Date = TestDate as DateConstructor;

const stubs = await import("./stubs.ts");
stubs.patchFetch((u) => u.hostname === "127.0.0.1" || u.hostname === "localhost");
const gw = await import("./gateway.ts");
const { GATEWAY, settle } = gw;
const { recorded, scripts, modelCalls, stripeState, telnyxState } = stubs;

/* ------------------------------ checks ------------------------------ */

const results: { group: string; name: string; ok: boolean; detail?: string }[] = [];
let group = "";
function check(name: string, ok: unknown, detail?: unknown) {
  const pass = !!ok;
  results.push({ group, name, ok: pass, detail: pass ? undefined : String(typeof detail === "string" ? detail : JSON.stringify(detail) ?? "").slice(0, 700) });
  out(`${pass ? "  pass" : "  FAIL"}  ${group}: ${name}${pass ? "" : `\n          ${String(typeof detail === "string" ? detail : JSON.stringify(detail) ?? "").slice(0, 700)}`}`);
}
async function scenario(name: string, f: () => Promise<void>) {
  group = name;
  out(`\n${name}`);
  const before = gw.fnErrors.length + stubs.stubErrors.length + stubs.blockedHosts.length;
  try { await f(); await settle(); } catch (e) { check("ran to the end", false, (e as Error)?.stack ?? String(e)); }
  const errs = [...gw.fnErrors, ...stubs.stubErrors, ...stubs.blockedHosts.map((h) => `blocked request to ${h}`)];
  if (errs.length > before) check("no function crashed, no bad model request, nothing left the sandbox", false, errs.join("\n"));
}

/* ------------------------------ helpers ------------------------------ */

const day = (n = 0) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const same = (s: string) => ({ en: s, zh: s });
let mark = 0;
const since = (m: number) => recorded.slice(m);
const sms = (m: number, to?: string) => since(m).filter((r) => r.service === "telnyx" && r.path === "/v2/messages" && (!to || r.body.to === to));
const emails = (m: number) => since(m).filter((r) => r.service === "resend");
const callActions = (m: number, ccid: string) => since(m).filter((r) => r.service === "telnyx" && r.path.startsWith(`/v2/calls/${encodeURIComponent(ccid)}/actions/`));

type Who = { id: string; email: string; jwt: string };
async function call(name: string, body: unknown, o: { jwt?: string; headers?: Record<string, string>; raw?: string } = {}) {
  const res = await fetch(`${GATEWAY}/functions/v1/${name}`, {
    method: "POST", body: o.raw ?? JSON.stringify(body),
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, ...(o.jwt ? { Authorization: `Bearer ${o.jwt}` } : {}), ...(o.headers ?? {}) },
  });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* text */ }
  return { status: res.status, data };
}
async function rest(path: string, o: { jwt?: string; method?: string; body?: unknown; prefer?: string } = {}) {
  const res = await fetch(`${GATEWAY}/rest/v1/${path}`, {
    method: o.method ?? "GET", body: o.body === undefined ? undefined : JSON.stringify(o.body),
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${o.jwt ?? ANON_KEY}`, "Content-Type": "application/json", ...(o.prefer ? { Prefer: o.prefer } : {}) },
  });
  const text = await res.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* text */ }
  return { status: res.status, data };
}
const rpc = (fn: string, args: Record<string, unknown>, jwt: string) => rest(`rpc/${fn}`, { method: "POST", body: args, jwt });

async function telnyxPost(fn: string, event: unknown, o: { badKey?: boolean; ts?: number; raw?: string } = {}) {
  const raw = o.raw ?? JSON.stringify(event);
  const ts = String(o.ts ?? Math.floor(Date.now() / 1000));
  const key = o.badKey ? ((await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair).privateKey : telnyxKeys.privateKey;
  const sig = b64(await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(`${ts}|${raw}`)));
  const res = await call(fn, null, { raw, headers: { "telnyx-signature-ed25519": sig, "telnyx-timestamp": ts, "user-agent": "telnyx-webhooks" } });
  return { ...res, raw, ts, sig };
}
const smsEvent = (from: string, text: string, id: string = crypto.randomUUID()) => ({
  data: { event_type: "message.received", id: crypto.randomUUID(), occurred_at: new Date().toISOString(), record_type: "event",
    payload: { id, record_type: "message", direction: "inbound", type: "SMS", text, media: [], from: { phone_number: from, carrier: "T-Mobile USA", line_type: "Wireless" }, to: [{ phone_number: ODELIA, status: "webhook_delivered" }], received_at: new Date().toISOString() } },
  meta: { attempt: 1, delivered_to: `${GATEWAY}/functions/v1/odelia-sms` },
});
const callEvent = (type: string, p: Record<string, unknown>) => ({
  data: { event_type: type, id: crypto.randomUUID(), occurred_at: new Date().toISOString(), record_type: "event",
    payload: { call_leg_id: crypto.randomUUID(), call_session_id: crypto.randomUUID(), connection_id: "conn_e2e", to: ODELIA, ...p } },
  meta: { attempt: 1, delivered_to: `${GATEWAY}/functions/v1/odelia-voice` },
});
async function stripePost(event: unknown, o: { badSecret?: boolean } = {}) {
  const raw = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(o.badSecret ? "whsec_wrong" : ENV.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${raw}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return await call("stripe-webhook", null, { raw, headers: { "stripe-signature": `t=${t},v1=${sig}` } });
}
const decodeState = (s: string) => { try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))); } catch { return {}; } };
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const markdownFree = (s: string) => !/\*\*|__|^#|\n#|\]\(|^\s*[-*•]\s|\n\s*[-*•]\s|`|—/.test(s);

/* ------------------------------ the run ------------------------------ */

let stack: Stack | null = null;
let gateway: { stop: () => Promise<void> } | null = null;
const t0 = Date.now();
out("Placetta end-to-end test");
try {
  stack = await startStack((s) => out(`  ${s}`));
  const sql = stack.sql;
  await gw.loadFunctions(["agent-run", "odelia-sms", "odelia-voice", "billing", "stripe-webhook", "file", "team", "monitor", "integrations", "logins", "oauth-callback", "calendar-feed", "tts", "agent"]);
  gateway = gw.startGateway(sql, stack.restPort);
  out(`  gateway on ${GATEWAY} with ${gw.handlers.size} functions`);
  const monitorKey = String((await sql`select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key'`)[0].decrypted_secret);
  const MK = { "x-monitor-key": monitorKey };
  /** pg_net's worker: deliver what the database queued, to this gateway instead of production. */
  const deliverNet = async () => {
    for (const r of await sql`select id, url, headers, body from net.http_request_queue where delivered_at is null order by id`) {
      await fetch(String(r.url).replace(PROD_URL, GATEWAY), { method: "POST", headers: r.headers as Record<string, string>, body: JSON.stringify(r.body) }).then((x) => x.body?.cancel());
      await sql`update net.http_request_queue set delivered_at = now() where id = ${r.id}`;
    }
  };

  /* ---------------- seed ---------------- */
  const mkUser = async (email: string, meta: Record<string, unknown>, o: { confirmed?: boolean; identity?: boolean } = {}) => {
    const id = crypto.randomUUID();
    await sql`insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
              values (${id}, 'authenticated', 'authenticated', ${email}, ${o.confirmed === false ? null : new Date()}, now(), now(), ${sql.json({ provider: "email", providers: ["email"] })}, ${sql.json(meta as never)})`;
    if (o.identity !== false) await sql`insert into auth.identities (user_id, provider) values (${id}, 'email')`;
    return id;
  };
  const owner: Who = { id: await mkUser("mei@goldenox.example", { full_name: "Mei Chen" }), email: "mei@goldenox.example", jwt: "" };
  const staff: Who = { id: await mkUser("ops@placetta.test", { full_name: "Sam Ops" }), email: "ops@placetta.test", jwt: "" };
  const hq: Who = { id: await mkUser("compliance@moonleaf.example", { full_name: "Hana Park" }), email: "compliance@moonleaf.example", jwt: "" };
  const hqUnproven: Who = { id: await mkUser("compliance@moonleaf.example".replace("compliance", "nobody"), {}, { identity: false }), email: "nobody@moonleaf.example", jwt: "" };
  owner.jwt = await userJwt(owner); staff.jwt = await userJwt(staff, "aal2"); hq.jwt = await userJwt(hq); hqUnproven.jwt = await userJwt(hqUnproven);
  const staffAal1 = await userJwt(staff, "aal1");
  await sql`insert into public.staff_emails (email) values (${staff.email})`;
  await sql`update public.app_settings set payments_on = true`;

  const EIN = "12-3456789";
  type Bi = { en: string; zh: string };
  type State = {
    deadlines: { id: string; date: string; kind: string; title: Bi; app?: string }[];
    apps: { id: string; name: Bi; agency: Bi; source: { label: string; url: string }; form?: Bi; [k: string]: unknown; fields: { id: string; label: Bi; value: string }[]; checklist: { id: string; label: Bi; state: string }[] }[];
    stores: { id: string; stage: string; permits?: { name: Bi; expires: string }[]; [k: string]: unknown }[];
    approvals: { id: string; kind: string }[];
    [k: string]: unknown;
  };
  const seedState: State = {
    business: { en: "Golden Ox Noodle", zh: "金牛面馆" }, goal: same("Open the Roosevelt Ave store and keep Main St current"),
    meta: { mapped: true, city: "Flushing", region: "NY", what: "noodle restaurant", entity: "LLC" },
    locations: [{ id: "flushing", name: same("Flushing"), county: same("Queens"), state: "active" }],
    apps: [
      { id: "app-dohmh", name: { en: "Food service establishment permit", zh: "食品服务场所许可证" }, agency: { en: "NYC Department of Health and Mental Hygiene", zh: "纽约市卫生局" }, level: "city", status: "draft", critical: true,
        fees: [{ label: same("Permit fee"), amount: 280 }], est: { en: "About 4 weeks", zh: "约 4 周" }, source: { label: "nyc.gov", url: "https://www.nyc.gov/site/doh/business/food-operators/new-food-service-establishments.page" },
        form: same("Application for a food service establishment permit"),
        fields: [{ id: "f-name", label: same("Business name"), value: "Golden Ox Noodle LLC" }, { id: "f-ein", label: same("EIN"), value: EIN }, { id: "f-addr", label: same("Premises address"), value: "40-10 Roosevelt Ave, Flushing, NY 11354" }],
        checklist: [{ id: "c-lease", label: same("Lease"), state: "done" }, { id: "c-cert", label: same("Food protection certificate"), state: "done" }] },
      { id: "app-sign", name: { en: "Sign permit", zh: "招牌许可" }, agency: { en: "NYC Department of Buildings", zh: "纽约市建筑局" }, level: "city", status: "review", fees: [], est: same("2 weeks"), source: { label: "nyc.gov", url: "https://www.nyc.gov/site/buildings/index.page" }, fields: [], checklist: [] },
      { id: "app-co", name: { en: "Certificate of occupancy", zh: "占用证明" }, agency: { en: "NYC Department of Buildings", zh: "纽约市建筑局" }, level: "city", status: "needs", fees: [], est: same("6 weeks"), source: { label: "nyc.gov", url: "https://www.nyc.gov/site/buildings/index.page" },
        fields: [], checklist: [{ id: "c-plans", label: same("Stamped floor plans"), state: "missing" }] },
    ],
    docs: [], nudges: [], approvals: [], closed: [], facts: [], running: [], connections: [],
    deadlines: [
      { id: "dl-co", date: day(5), kind: "due", title: same("Submit the CO paperwork"), app: "app-co" },
      { id: "dl-sign", date: day(20), kind: "renewal", title: same("Sign permit renewal"), app: "app-sign" },
    ],
    stores: [
      { id: "st-main", name: { en: "Flushing, Main St", zh: "法拉盛缅街店" }, address: "136-20 Main St, Flushing, NY 11354", stage: "open", opened: "2025-03-01", rules: ["nyc_grades"], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 },
        apps: ["app-sign"], permits: [{ name: same("Food service establishment permit"), expires: day(120) }, { name: same("Sign permit"), expires: day(20) }] },
      { id: "st-roosevelt", name: { en: "Flushing, Roosevelt Ave", zh: "法拉盛罗斯福大道店" }, address: "40-10 Roosevelt Ave, Flushing, NY 11354", stage: "opening", plannedOpen: day(90), rules: ["nyc_grades"], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 },
        apps: ["app-dohmh", "app-co"] },
    ],
  };
  let ws = "";
  const wsState = async () => (await sql`select state from public.workspaces where id = ${ws}`)[0]?.state as typeof seedState;
  const saveState = async (patch: (s: typeof seedState) => typeof seedState) => {
    const r = await rest(`workspaces?id=eq.${ws}`, { method: "PATCH", jwt: owner.jwt, body: { state: patch(await wsState()) }, prefer: "return=minimal" });
    if (r.status >= 300) throw new Error(`saving the workspace failed: ${r.status} ${JSON.stringify(r.data)}`);
  };

  await scenario("seed", async () => {
    const r = await rpc("create_workspace", { p_name: "Golden Ox Noodle", p_state: seedState, p_authorized: true }, owner.jwt);
    check("owner creates the workspace through PostgREST", r.status === 200 && typeof r.data === "string", r);
    ws = r.data;
    // the entry plan, paid through Stripe Checkout
    const e = await stripePost({ id: "evt_entry", type: "checkout.session.completed", data: { object: { id: "cs_entry", object: "checkout.session", mode: "payment", payment_status: "paid", customer: "cus_goldenox", metadata: { workspace_id: ws, plan: "entry", markets: "1" } } } });
    const [b] = await sql`select entry_markets, stripe_customer_id from public.billing where workspace_id = ${ws}`;
    check("entry plan payment recorded (1 market)", e.status === 200 && b?.entry_markets === 1 && b?.stripe_customer_id === "cus_goldenox", { e, b });
    check("plan is entry", (await rpc("plan_of", { ws }, SERVICE_KEY)).data === "entry");
    // a document in storage, to see it go with the account later
    const up = await fetch(`${GATEWAY}/storage/v1/object/documents/${ws}/leases/lease.pdf`, { method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/pdf" }, body: new Uint8Array([37, 80, 68, 70]) });
    await up.body?.cancel();
    // the owner links a phone: phone_link_start queues odelia-sms (pg_net), which texts a code; the code confirms it
    mark = recorded.length;
    const start = await rpc("phone_link_start", { p_number: OWNER_PHONE, p_tz: "America/New_York", p_lang: "en" }, owner.jwt);
    check("phone_link_start accepts the number", start.status === 200 && start.data?.link?.number === OWNER_PHONE && start.data?.link?.code_pending === true, start);
    const [q] = await sql`select url, body from net.http_request_queue order by id desc limit 1`;
    check("phone_link_start queues odelia-sms send_code through pg_net", q?.url === `${PROD_URL}/functions/v1/odelia-sms` && (q?.body as { action?: string })?.action === "send_code", q);
    await deliverNet(); await settle();
    const codeText = sms(mark, OWNER_PHONE)[0]?.body?.text ?? "";
    const code = /code is (\d{6})/.exec(codeText)?.[1];
    check("a 6-digit code is texted to the number", !!code && sms(mark).length === 1, codeText);
    const stored = await sql`select code_hash from public.phone_codes where user_id = ${owner.id} and purpose = 'link'`;
    check("the database keeps only a hash of the code", stored.length === 1 && !!stored[0].code_hash && !String(stored[0].code_hash).includes(code ?? "x"));
    const wrong = await rpc("phone_link_confirm", { p_code: code === "000000" ? "111111" : "000000" }, owner.jwt);
    check("a wrong code is refused as data", wrong.status === 200 && wrong.data?.error === "code_wrong" && wrong.data?.link?.verified === false, wrong);
    const ok = await rpc("phone_link_confirm", { p_code: code }, owner.jwt);
    check("the right code verifies the phone", ok.status === 200 && ok.data?.link?.verified === true, ok);
    const [msg] = await sql`select body from public.odelia_messages where user_id = ${owner.id} and kind = 'code'`;
    check("the code itself isn't logged", msg && !String(msg.body).includes(code ?? "x"), msg);
  });

  /* ---------------- a. app chat ---------------- */
  scripts.push({
    name: "app-status", match: (p) => p.includes("Where do things stand"), turns: [
      { tool: "check_progress", input: {} },
      { tool: "add_deadline", input: { date: day(45), title: "Renew the sign permit", kind: "renewal", application_id: "app-sign" } },
      { text: "Here's where things stand: the **sign permit** is with the agency, the food service permit is ready for me to finish, and the CO needs stamped floor plans. I added a reminder to renew the sign permit." },
    ],
  });
  await scenario("a. app chat", async () => {
    mark = recorded.length;
    const r = await call("agent-run", { action: "start", workspace_id: ws, prompt: "Where do things stand? Remind me to renew the sign permit in 45 days.", lang: "en" }, { jwt: owner.jwt });
    check("agent-run start answers 202 with the run id", r.status === 202 && typeof r.data?.id === "string", r);
    await settle();
    const p = await rpc("poll_agent_run", { p_id: r.data.id }, owner.jwt);
    check("the run is done", p.data?.status === "done", p.data);
    check("the reply is stored", String(p.data?.reply?.text?.[0]?.en ?? "").includes("Here's where things stand"), p.data?.reply);
    const calls = modelCalls.filter((c) => c.script === "app-status");
    check("three model calls: check_progress, add_deadline, the answer", calls.length === 3, calls.map((c) => c.round));
    const progress = calls[1]?.payload.messages.at(-1).content.find((b: { type: string }) => b.type === "tool_result");
    check("check_progress really ran and saw the applications", progress && !progress.is_error && /app-dohmh/.test(JSON.stringify(progress.content)) && /waiting_on/.test(JSON.stringify(progress.content)), progress);
    check("the model was offered the workspace tools and research", calls[0] && ["check_progress", "add_deadline", "request_filing_approval"].every((t) => calls[0].payload.tools.some((x: { name: string }) => x.name === t)) && calls[0].payload.tools.some((x: { type?: string }) => x.type?.startsWith("web_search")) && calls[0].beta === "web-fetch-2025-09-10");
    const st = await wsState();
    check("add_deadline saved the reminder to the workspace", st.deadlines.some((d) => d.title.en === "Renew the sign permit" && d.date === day(45)), st.deadlines);
    const audit = await sql`select actor, actor_id, action from public.audit_log where workspace_id = ${ws} and actor = 'agent'`;
    check("the audit trail records the agent's change, as the owner's run", audit.some((a) => (a.action as { en: string }).en === "Added deadline" && a.actor_id === owner.id), audit);
    const [u] = await sql`select calls from public.agent_usage where workspace_id = ${ws}`;
    check("usage is counted", Number(u?.calls) >= 3, u);
    check("no email while the owner is watching in the app", emails(mark).length === 0, emails(mark));
    const steps = (p.data?.steps ?? []) as { label: { en: string } }[];
    check("progress steps were saved for the app", steps.some((s) => /Checking progress/.test(s.label.en)), steps);
  });

  /* ---------------- b. SMS ---------------- */
  scripts.push(
    { name: "sms-status", match: (p) => p.endsWith("What's due this month?"), turns: [
      { tool: "check_progress", input: {} },
      { text: "**Due soon:**\n- Submit the CO paperwork by " + day(5) + ". It needs stamped floor plans.\n- Sign permit renewal on " + day(20) + ".\n\nWant me to start on the floor plans?" },
    ] },
    { name: "sms-long", match: (p) => p.includes("full rundown"), turns: [
      { text: Array.from({ length: 14 }, (_, i) => `## Item ${i + 1}\nThe application number ${i + 1} is moving along and the agency usually answers within a few weeks, so nothing is needed from you right now.`).join("\n") },
    ] },
    { name: "sms-file", match: (p) => p.includes("File the food service permit"), turns: [
      { tool: "request_filing_approval", input: { application_id: "app-dohmh" } },
      { text: "It's complete, so I put it up for your approval. Nothing is filed until you approve it in the app." },
    ] },
    { name: "sms-delete-deadline", match: (p) => p.includes("Delete the CO paperwork deadline"), turns: [
      { tool: "edit_deadline", input: { deadline_id: "dl-co", remove: true } },
      { text: "I can't delete things by text. You can remove it in the app." },
    ] },
    { name: "sms-slow", match: (p) => p.includes("health inspection checklist"), turns: [
      { tool: "check_progress", input: {}, delayMs: 9000 },
      { text: "The health inspection checks hot and cold holding temperatures, handwashing sinks and pest control. Want me to add a mock inspection?" },
    ] },
    { name: "sms-model-down", match: (p) => p.includes("anything new from the city"), turns: [{ error: 529 }] },
    { name: "sms-remove-store", match: (p) => p.includes("Remove the Roosevelt Ave store"), turns: [
      { tool: "remove_store", input: { store_id: "st-roosevelt", reason: "Lease fell through" } },
      { text: "I've asked you to confirm removing it in the app. Nothing changes until you do." },
    ] },
  );
  await scenario("b. SMS", async () => {
    // a status question from the owner's verified number
    mark = recorded.length;
    const ev1 = smsEvent(OWNER_PHONE, "What's due this month?", "msg-in-1");
    const r1 = await telnyxPost("odelia-sms", ev1);
    check("a signed message.received is accepted", r1.status === 200 && r1.data?.ok === true, r1);
    await settle();
    const [run] = await sql`select * from public.agent_runs where channel = 'sms' order by created_at desc limit 1`;
    check("odelia-sms started a run as the owner (start_as)", run && run.created_by === owner.id && run.workspace_id === ws && run.reply_to === OWNER_PHONE && run.status === "done", run);
    const out1 = sms(mark, OWNER_PHONE);
    check("exactly one text back to the owner (no 'On it.' for a quick answer)", out1.length === 1, out1.map((x) => x.body.text));
    const t1 = String(out1[0]?.body?.text ?? "");
    check("the text is plain (no markdown, no em dashes) and within 3 SMS segments", t1 && markdownFree(t1) && t1.length <= 459 && /CO paperwork/.test(t1), t1);
    check("sent from Odelia's number with the messaging profile", out1[0]?.body?.from === ODELIA && out1[0]?.body?.messaging_profile_id === "mp_e2e", out1[0]?.body);
    const sys = modelCalls.find((c) => c.script === "sms-status")?.payload.system ?? "";
    check("the agent was told it's answering a text", /This conversation is by phone/.test(sys) && /they texted you/.test(sys));
    const log = await sql`select direction, kind, run_id from public.odelia_messages where user_id = ${owner.id} and channel = 'sms' and kind in ('chat', 'reply') order by id`;
    check("both sides are logged against the run", log.length === 2 && log.every((l) => l.run_id === run.id), log);

    // a long answer: at most three texts, the last pointing to the app
    mark = recorded.length;
    await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "Give me the full rundown of every license", "msg-in-2"));
    await settle();
    const out2 = sms(mark, OWNER_PHONE).map((x) => String(x.body.text));
    check("a long answer becomes at most 3 texts, each at most 2 parts", out2.length >= 2 && out2.length <= 3 && out2.every((t) => t.length <= 306 && markdownFree(t)), out2);
    check("the last text ends with a link to the rest in the app", /More: https:\/\/app\.placetta\.test\/app\/\?ws=/.test(out2.at(-1) ?? ""), out2.at(-1));
    const hist = modelCalls.find((c) => c.script === "sms-long")?.payload.messages ?? [];
    check("the earlier text conversation is carried as history", hist.length >= 3 && hist[0].role === "user" && /What's due this month/.test(String(hist[0].content)), hist.map((m: { role: string }) => m.role));

    // filing by text: refused, put up for approval, the deep link texted
    mark = recorded.length;
    await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "File the food service permit for me", "msg-in-3"));
    await settle();
    const out3 = sms(mark, OWNER_PHONE).map((x) => String(x.body.text));
    check("filing by text texts the exact approval's deep link", out3.length === 1 && out3[0].includes(`Approve in the app: ${APP}/app/?ws=${ws}&approval=ap-app-dohmh`), out3);
    check("nothing was filed by text", (await sql`select count(*)::int n from public.filings where workspace_id = ${ws}`)[0].n === 0);
    check("the approval waits in the workspace", (await wsState()).approvals.some((a: { id: string }) => a.id === "ap-app-dohmh"));

    // deleting by text: refused; the deadline stays
    mark = recorded.length;
    await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "Delete the CO paperwork deadline", "msg-in-4"));
    await settle();
    const delCall = modelCalls.filter((c) => c.script === "sms-delete-deadline")[1];
    const delResult = delCall?.payload.messages.at(-1).content[0];
    check("the delete tool call is refused on a text", delResult?.is_error === true && /Nothing is deleted from a text/.test(String(delResult?.content)), delResult);
    check("the deadline is still there", (await wsState()).deadlines.some((d) => d.id === "dl-co"));
    check("the owner is told to do it in the app", sms(mark, OWNER_PHONE).length === 1 && /in the app/.test(sms(mark, OWNER_PHONE)[0].body.text));

    // removing a store by text: a confirmation in the app, with its deep link
    mark = recorded.length;
    await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "Remove the Roosevelt Ave store", "msg-in-5"));
    await settle();
    const st5 = await wsState();
    const chg = (st5.approvals as { id: string; kind: string }[]).find((a) => a.kind === "change");
    check("removing a store by text only asks for confirmation; the store stays", chg && st5.stores.some((s) => s.id === "st-roosevelt"), st5.approvals);
    check("the confirmation's deep link is texted", sms(mark, OWNER_PHONE).length === 1 && String(sms(mark, OWNER_PHONE)[0].body.text).includes(`approval=${chg?.id}`), sms(mark, OWNER_PHONE).map((x) => x.body.text));

    // a slow answer: "On it." after 8 seconds, then the answer
    mark = recorded.length;
    await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "What's on the health inspection checklist?", "msg-in-slow"));
    await settle();
    const slow = sms(mark, OWNER_PHONE).map((x) => String(x.body.text));
    check("a slow answer gets 'On it.' first, then the answer", slow.length === 2 && slow[0] === "On it." && /hot and cold holding/.test(slow[1]), slow);
    // the model is down: the run fails and the owner hears so by text
    mark = recorded.length;
    await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "Is there anything new from the city?", "msg-in-down"));
    await settle();
    const [downRun] = await sql`select status, error from public.agent_runs where prompt = 'Is there anything new from the city?'`;
    check("when the model is down the run fails and the owner is told by text", downRun?.status === "failed" && /busy/.test(downRun.error ?? "") && sms(mark, OWNER_PHONE).length === 1 && /hit a problem/.test(sms(mark, OWNER_PHONE)[0].body.text), { downRun, texts: sms(mark).map((x) => x.body.text) });

    // a number nobody linked: one explanation, then silence
    mark = recorded.length;
    await telnyxPost("odelia-sms", smsEvent(STRANGER, "hi is this the permit place", "msg-in-6"));
    await settle();
    await telnyxPost("odelia-sms", smsEvent(STRANGER, "hello??", "msg-in-7"));
    await settle();
    const toStranger = sms(mark, STRANGER);
    check("an unknown number gets one explanation, then silence", toStranger.length === 1 && /isn't linked to an account/.test(toStranger[0].body.text), toStranger.map((x) => x.body.text));
    const [stranger] = await sql`select messages, replied_at from public.odelia_strangers where number = ${STRANGER}`;
    check("strangers are counted, their words not kept", stranger?.messages === 2 && (await sql`select count(*)::int n from public.odelia_messages where user_id is null and direction = 'in' and body <> ''`)[0].n === 0, stranger);
    check("no run for a stranger", (await sql`select count(*)::int n from public.agent_runs where channel = 'sms'`)[0].n === 7);

    // STOP, HELP, START
    mark = recorded.length;
    await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "STOP", "msg-in-8"));
    await settle();
    const [l1] = await sql`select opted_out_at from public.phone_links where user_id = ${owner.id}`;
    check("STOP opts the owner out and confirms once", !!l1.opted_out_at && sms(mark, OWNER_PHONE).length === 1 && /won't get more texts/.test(sms(mark, OWNER_PHONE)[0].body.text), sms(mark, OWNER_PHONE).map((x) => x.body.text));
    mark = recorded.length;
    await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "What's due this month?", "msg-in-9"));
    await settle();
    check("after STOP, a question gets no run and no text", sms(mark).length === 0 && (await sql`select count(*)::int n from public.agent_runs where channel = 'sms'`)[0].n === 7, sms(mark).map((x) => x.body.text));
    mark = recorded.length;
    await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "help", "msg-in-10"));
    await settle();
    check("HELP answers with who we are and how to stop", sms(mark, OWNER_PHONE).length === 1 && /support@placetta\.com/.test(sms(mark, OWNER_PHONE)[0].body.text) && /STOP/.test(sms(mark, OWNER_PHONE)[0].body.text));
    mark = recorded.length;
    await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "START", "msg-in-11"));
    await settle();
    const [l2] = await sql`select opted_out_at from public.phone_links where user_id = ${owner.id}`;
    check("START turns texts back on", l2.opted_out_at === null && sms(mark, OWNER_PHONE).length === 1 && /back on/.test(sms(mark, OWNER_PHONE)[0].body.text));

    // forged and replayed webhooks
    mark = recorded.length;
    const bad = await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "What's due this month?", "msg-forged"), { badKey: true });
    const old = await telnyxPost("odelia-sms", smsEvent(OWNER_PHONE, "What's due this month?", "msg-old"), { ts: Math.floor(Date.now() / 1000) - 600 });
    await settle();
    check("a bad signature is rejected", bad.status === 401 && (await sql`select count(*)::int n from public.odelia_messages where provider_id = 'msg-forged'`)[0].n === 0, bad);
    check("a stale timestamp is rejected", old.status === 401, old);
    const replay = await call("odelia-sms", null, { raw: r1.raw, headers: { "telnyx-signature-ed25519": r1.sig, "telnyx-timestamp": r1.ts } });
    await settle();
    check("a replayed message id is ignored", replay.status === 200 && replay.data?.duplicate === true && sms(mark).length === 0 && (await sql`select count(*)::int n from public.agent_runs where channel = 'sms'`)[0].n === 7, replay);
  });

  /* ---------------- c. voice ---------------- */
  scripts.push({ name: "voice-task", match: (p) => p.includes("grease trap"), turns: [
    { tool: "check_progress", input: {}, delayMs: 300 },
    { text: "I looked into it. Roosevelt Ave needs a grease interceptor before the health inspection, and the CO paperwork is due " + day(5) + "." },
  ] });
  await scenario("c. voice", async () => {
    // a stranger calls: answered, told how to link, hung up
    mark = recorded.length;
    await telnyxPost("odelia-voice", callEvent("call.initiated", { call_control_id: "v3:stranger", from: STRANGER, direction: "incoming", state: "parked", shaken_stir_attestation: "A", shaken_stir_validated: true }));
    await settle();
    const sa = callActions(mark, "v3:stranger");
    check("a stranger's call is answered without the assistant", sa.length === 1 && sa[0].path.endsWith("/answer") && !sa[0].body.assistant && decodeState(sa[0].body.client_state).k === "stranger", sa.map((x) => x.body));
    await telnyxPost("odelia-voice", callEvent("call.answered", { call_control_id: "v3:stranger", from: STRANGER, direction: "incoming", client_state: sa[0]?.body.client_state }));
    await settle();
    const speak = callActions(mark, "v3:stranger").find((x) => x.path.endsWith("/speak"));
    check("then told how to link a phone", speak && /link your phone/.test(speak.body.payload) && speak.body.voice, speak?.body);

    // the owner calls, caller ID attested "A": the assistant starts with the workspace
    mark = recorded.length;
    await telnyxPost("odelia-voice", callEvent("call.initiated", { call_control_id: "v3:call-a", from: OWNER_PHONE, direction: "incoming", state: "parked", shaken_stir_attestation: "A", shaken_stir_validated: true }));
    await settle();
    const ans = callActions(mark, "v3:call-a").find((x) => x.path.endsWith("/answer"));
    const a = ans?.body.assistant;
    check("the call is answered with the AI assistant", a?.id === "assistant-e2e" && decodeState(ans?.body.client_state).k === "talk", ans?.body);
    const toolNames = (a?.tools ?? []).map((t: { webhook?: { name: string }; type: string }) => t.webhook?.name ?? t.type);
    check("its tools are the call's webhooks (no code step when attested)", JSON.stringify(toolNames) === JSON.stringify(["workspace_details", "start_task", "send_text", "hangup"]), toolNames);
    const hook = a?.tools?.[0]?.webhook;
    check("each tool posts back to odelia-voice with a per-call token", hook?.url === `${GATEWAY}/functions/v1/odelia-voice?tool=workspace_details` && hook?.headers?.[0]?.name === "x-odelia-call" && hook?.headers?.[0]?.value?.length > 40, hook);
    check("instructions carry the workspace, greeting uses the first name", /Workspace \(read only, JSON\)/.test(a?.instructions ?? "") && /Flushing, Roosevelt Ave/.test(a?.instructions ?? "") && /^Hi Mei/.test(a?.greeting ?? ""), a?.greeting);
    check("the brief never carries form values", !String(a?.instructions ?? "").includes(EIN));
    const [c1] = await sql`select * from public.odelia_calls where call_control_id = 'v3:call-a'`;
    check("the call is recorded as verified", c1?.verified_at && c1.user_id === owner.id && c1.workspace_id === ws, c1);
    const token = hook?.headers?.[0]?.value ?? "";
    const tool = (name: string, body: unknown, tok = token) => call(`odelia-voice?tool=${name}`, body, { headers: { "x-odelia-call": tok } });
    const wd = await tool("workspace_details", {});
    check("workspace_details returns the workspace status", wd.status === 200 && wd.data?.ok === true && /Certificate of occupancy/.test(wd.data?.workspace) && /Submit the CO paperwork/.test(wd.data?.workspace) && !wd.data.workspace.includes(EIN), wd.data);
    const forged = await tool("workspace_details", {}, token.slice(0, -4) + "AAAA");
    check("a forged call token is refused", forged.status === 401, forged);

    // caller ID not attested: a code by text first
    mark = recorded.length;
    await telnyxPost("odelia-voice", callEvent("call.initiated", { call_control_id: "v3:call-b", from: OWNER_PHONE, direction: "incoming", state: "parked", shaken_stir_attestation: "B", shaken_stir_validated: true }));
    await settle();
    const codeText = String(sms(mark, OWNER_PHONE)[0]?.body?.text ?? "");
    const code = /call code is (\d{4})/.exec(codeText)?.[1] ?? "";
    check("a 4-digit call code is texted to the number on file", code.length === 4 && sms(mark).length === 1, codeText);
    const ansB = callActions(mark, "v3:call-b").find((x) => x.path.endsWith("/answer"))?.body;
    check("the assistant starts with verify_code and no account data", ansB?.assistant?.tools?.[0]?.webhook?.name === "verify_code" && !/Workspace \(read only/.test(ansB?.assistant?.instructions ?? "") && /4-digit code/.test(ansB?.assistant?.greeting ?? ""), ansB?.assistant?.greeting);
    const tokB = ansB?.assistant?.tools?.[0]?.webhook?.headers?.[0]?.value ?? "";
    const before = await tool("workspace_details", {}, tokB);
    check("account data is refused before the code", before.data?.ok === false && !before.data?.workspace && /isn't verified/.test(before.data?.result), before.data);
    const wrongCode = code === "0000" ? "1111" : "0000";
    const w = await tool("verify_code", { code: wrongCode }, tokB);
    check("a wrong code is refused with tries left", w.data?.ok === false && w.data?.tries_left === 2, w.data);
    const v = await tool("verify_code", { code: code.split("").map((d) => WORDS[Number(d)]).join(" ") }, tokB);
    check("the code said in words verifies the caller and returns the workspace", v.data?.ok === true && /Flushing/.test(v.data?.workspace ?? ""), v.data);
    const after = await tool("workspace_details", {}, tokB);
    check("then workspace_details works", after.data?.ok === true, after.data);

    // real work from the call: a background run whose answer is texted
    mark = recorded.length;
    const task = await tool("start_task", { request: "Find out whether Roosevelt Ave needs a grease trap permit" }, tokB);
    check("start_task starts a background run", task.data?.ok === true && /Started/.test(task.data?.result), task.data);
    await settle();
    const [vr] = await sql`select status, channel, reply_to, created_by from public.agent_runs where channel = 'voice'`;
    check("the run is the caller's, on the voice channel, and done", vr?.status === "done" && vr.reply_to === OWNER_PHONE && vr.created_by === owner.id, vr);
    const vt = sms(mark, OWNER_PHONE);
    check("its answer is texted to the caller", vt.length === 1 && /grease interceptor/.test(vt[0].body.text) && markdownFree(vt[0].body.text), vt.map((x) => x.body.text));
    const sendText = await tool("send_text", { message: "The CO paperwork is due " + day(5) + ".", app_link: true }, tokB);
    check("send_text texts the caller with the app link", sendText.data?.ok === true && sms(mark, OWNER_PHONE).length === 2 && sms(mark, OWNER_PHONE)[1].body.text.includes(`${APP}/app/?ws=${ws}`), sendText.data);

    // hangup: logged, the token stops working
    await telnyxPost("odelia-voice", callEvent("call.answered", { call_control_id: "v3:call-b", from: OWNER_PHONE, direction: "incoming", client_state: ansB?.client_state }));
    await telnyxPost("odelia-voice", callEvent("call.hangup", { call_control_id: "v3:call-b", from: OWNER_PHONE, direction: "incoming", hangup_cause: "normal_clearing" }));
    await settle();
    const [logged] = await sql`select body from public.odelia_messages where provider_id = 'call:v3:call-b'`;
    check("the call is logged when it ends", /You called, \d+ min/.test(logged?.body ?? ""), logged);
    await telnyxPost("odelia-voice", callEvent("call.hangup", { call_control_id: "v3:call-a", from: OWNER_PHONE, direction: "incoming", hangup_cause: "normal_clearing" }));
    await settle();
    const ended = await tool("workspace_details", {}, tokB);
    check("tools stop working after hangup", ended.data?.ok === false && /ended/.test(ended.data?.result), ended.data);
  });

  /* ---------------- d. proactive ---------------- */
  scripts.push(
    { name: "approval-run", match: (p) => p.includes("Get the food service permit ready"), turns: [
      { tool: "request_filing_approval", input: { application_id: "app-dohmh" }, delayMs: 1500 },
      { text: "The food service permit is complete and waiting for your approval." },
    ] },
    { name: "weekly-watch", match: (p) => p.startsWith("Weekly check"), turns: [{ text: "No changes." }] },
  );
  await scenario("d. proactive texts", async () => {
    const localNow = (tz: string) => { const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()); return Number(p.find((x) => x.type === "hour")!.value) * 60 + Number(p.find((x) => x.type === "minute")!.value); };
    const hhmm = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
    const now = localNow("America/New_York");
    const daytime = () => rpc("phone_prefs", { p_quiet_start: hhmm(now + 180), p_quiet_end: hhmm(now + 240) }, owner.jwt);
    const quiet = () => rpc("phone_prefs", { p_quiet_start: hhmm(now - 60), p_quiet_end: hhmm(now + 60) }, owner.jwt);
    check("phone_prefs sets quiet hours away from now", (await daytime()).status === 200);

    // a run nobody watched ends with an approval: an Update, an email, and a text in the outbox
    mark = recorded.length;
    const r = await call("agent-run", { action: "start", workspace_id: ws, prompt: "Get the food service permit ready to file." }, { jwt: owner.jwt });
    await sql`update public.agent_runs set seen_at = now() - interval '10 minutes' where id = ${r.data?.id}`;   // the owner closed the app
    await settle();
    const [upd] = await sql`select title from public.updates where workspace_id = ${ws} and dedupe = ${"run:" + r.data?.id}`;
    check("an unwatched run becomes an Update", !!upd, upd);
    const mails = emails(mark);
    check("and an email to the owner", mails.length === 1 && mails[0].body.to.includes(owner.email) && /waiting for your approval/.test(mails[0].body.text), mails.map((m) => m.body));
    const [ob] = await sql`select body, link, sent_at from public.odelia_outbox where user_id = ${owner.id} and dedupe = ${"approval:" + r.data?.id}`;
    check("and a text waits in the outbox with the approval's deep link", ob && ob.sent_at === null && ob.link === `${APP}/app/?ws=${ws}&approval=ap-app-dohmh`, ob);

    // the monitor finds the CO paperwork due in 5 days: an important text; it sweeps the outbox right away
    mark = recorded.length;
    const mon = await call("monitor", {}, { headers: MK });
    await settle();
    check("the monitor runs", mon.status === 200 && mon.data?.ok === true, mon);
    check("the monitor's self-filing sweep reaches the file function", mon.data?.self_filing !== null, mon.data);
    const due = await sql`select dedupe from public.odelia_outbox where user_id = ${owner.id} and dedupe like 'update:%'`;
    check("only what matters reaches the phone (the CO due in 5 days)", due.length === 1 && due[0].dedupe.includes("deadline:dl-co"), due);
    const texts = sms(mark, OWNER_PHONE);
    check("one text carries both waiting items, sent outside quiet hours", texts.length === 1 && /^Placetta: 2 things need you/.test(texts[0].body.text) && texts[0].body.text.length <= 306, texts.map((x) => x.body.text));
    check("both outbox items are marked sent", (await sql`select count(*)::int n from public.odelia_outbox where user_id = ${owner.id} and sent_at is null and dropped_at is null`)[0].n === 0);

    // quiet hours hold a text
    const queue = (tag: string) => sql`insert into public.odelia_outbox (user_id, workspace_id, kind, body, link, dedupe) values (${owner.id}, ${ws}, 'text', ${"Placetta: " + tag + " (Golden Ox Noodle)."}, ${APP + "/app/?ws=" + ws}, ${"e2e:" + tag})`;
    const flush = () => call("odelia-sms", { action: "flush" }, { headers: MK });
    await quiet();
    await queue("held overnight");
    mark = recorded.length;
    const f1 = await flush();
    check("during quiet hours nothing is sent", f1.status === 200 && sms(mark).length === 0 && (await sql`select sent_at from public.odelia_outbox where dedupe = 'e2e:held overnight'`)[0].sent_at === null, f1);
    await daytime();
    const f2 = await flush();
    check("after quiet hours it goes out", f2.data?.texts === 1 && sms(mark, OWNER_PHONE).length === 1 && /held overnight/.test(sms(mark, OWNER_PHONE)[0].body.text), f2.data);
    // three a day: the third goes, the fourth is dropped
    await queue("third today"); await flush();
    await queue("fourth today"); const f4 = await flush();
    const [fourth] = await sql`select sent_at, dropped_at, note from public.odelia_outbox where dedupe = 'e2e:fourth today'`;
    check("at most 3 proactive texts a day", sms(mark, OWNER_PHONE).length === 2 && f4.data?.texts === 0 && fourth.dropped_at && fourth.note === "daily_limit", { sent: sms(mark, OWNER_PHONE).map((x) => x.body.text), fourth });

    // something urgent (a permit lapsed) and the owner takes calls: Odelia calls
    check("the owner turns calls on", (await rpc("phone_prefs", { p_calls: true }, owner.jwt)).data?.link?.calls_on === true);
    await saveState((s) => ({ ...s, stores: s.stores.map((x) => (x.id === "st-main" ? { ...x, permits: [...(x.permits ?? []), { name: same("Place of assembly permit"), expires: day(-3) }] } : x)) }));
    mark = recorded.length;
    const mon2 = await call("monitor", {}, { headers: MK });
    await settle();
    const dial = since(mark).find((x) => x.service === "telnyx" && x.path === "/v2/calls");
    check("a lapsed permit is urgent: the monitor's sweep dials the owner", mon2.data?.phone_notices === 1 && dial?.body?.to === OWNER_PHONE && dial?.body?.from === ODELIA && dial?.body?.connection_id === "conn_e2e" && dial?.body?.answering_machine_detection === "detect" && dial?.body?.webhook_url === `${GATEWAY}/functions/v1/odelia-voice`, { mon2: mon2.data, dial: dial?.body });
    check("no text for it (the call is the notice), and the daily texts stay at 3", sms(mark).length === 0, sms(mark).map((x) => x.body.text));
    const [oc] = await sql`select call_control_id, direction, verified_at, outbox_id from public.odelia_calls where direction = 'out'`;
    check("the outbound call is recorded", oc && oc.verified_at && oc.outbox_id, oc);
    const ccid = String(oc?.call_control_id ?? "");
    await telnyxPost("odelia-voice", callEvent("call.answered", { call_control_id: ccid, from: ODELIA, to: OWNER_PHONE, direction: "outgoing", client_state: dial?.body?.client_state }));
    await telnyxPost("odelia-voice", callEvent("call.machine.detection.ended", { call_control_id: ccid, from: ODELIA, to: OWNER_PHONE, direction: "outgoing", result: "human", client_state: dial?.body?.client_state }));
    await settle();
    const start = callActions(mark, ccid).find((x) => x.path.endsWith("/ai_assistant_start"))?.body;
    check("a person answers: the assistant starts on the urgent item", start?.assistant?.id === "assistant-e2e" && /calling about something urgent at Golden Ox Noodle/.test(start?.assistant?.greeting ?? "") && /Lapsed: Flushing, Main St, Place of assembly permit/.test(start?.assistant?.instructions ?? "") && start?.assistant?.tools?.[0]?.webhook?.name === "workspace_details", start?.assistant?.greeting);
    await telnyxPost("odelia-voice", callEvent("call.hangup", { call_control_id: ccid, from: ODELIA, to: OWNER_PHONE, direction: "outgoing", hangup_cause: "normal_clearing" }));
    await settle();
    const [ol] = await sql`select body from public.odelia_messages where provider_id = ${"call:" + ccid}`;
    check("the call is logged, no text instead (it was answered)", /Odelia called, \d+ min/.test(ol?.body ?? "") && sms(mark).length === 0, ol);
  });

  /* ---------------- e. billing ---------------- */
  await scenario("e. billing", async () => {
    mark = recorded.length;
    const co = await call("billing", { action: "checkout", plan: "locations", workspace_id: ws, return_url: `${APP}/app/` }, { jwt: owner.jwt });
    check("checkout answers with Stripe's URL", co.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(co.data?.url ?? ""), co);
    const sess = since(mark).find((x) => x.service === "stripe" && x.path === "/v1/checkout/sessions")?.body;
    check("line items: 2 locations (one open, one opening), 1 opening fee", sess?.line_items?.["0"]?.price === "price_location" && sess?.line_items?.["0"]?.quantity === "2" && sess?.line_items?.["1"]?.price === "price_opening" && sess?.line_items?.["1"]?.quantity === "1", sess?.line_items);
    const cpn = since(mark).find((x) => x.service === "stripe" && x.path === "/v1/coupons")?.body;
    check("a one-time coupon of the $299 entry plan plus a year of one location", cpn?.amount_off === String(29900 + 14900 * 12) && cpn?.duration === "once" && sess?.discounts?.["0"]?.coupon, { cpn, discounts: sess?.discounts });
    check("the session carries the workspace and the entry credit", sess?.metadata?.workspace_id === ws && sess?.metadata?.plan === "locations" && sess?.metadata?.entry_credit === "29900" && sess?.customer === "cus_goldenox", sess?.metadata);
    mark = recorded.length;
    const portal = await call("billing", { action: "portal", workspace_id: ws, return_url: `${APP}/app/` }, { jwt: owner.jwt });
    const ps = since(mark).find((x) => x.path === "/v1/billing_portal/sessions")?.body;
    check("the billing portal opens for the Stripe customer", portal.status === 200 && /^https:\/\/billing\.stripe\.com\//.test(portal.data?.url ?? "") && ps?.customer === "cus_goldenox" && ps?.return_url === `${APP}/app/`, { portal, ps });
    const evil = await call("billing", { action: "portal", workspace_id: ws, return_url: "https://evil.example/app/" }, { jwt: owner.jwt });
    check("only the app's own return address is accepted", evil.status === 400, evil);
    const member = await call("billing", { action: "checkout", plan: "locations", workspace_id: ws, return_url: `${APP}/app/` }, { jwt: hq.jwt });
    check("someone else can't check out this workspace", member.status === 403, member);

    // Stripe: checkout completed, subscription created
    const sub = { id: "sub_goldenox", object: "subscription", status: "active", customer: "cus_goldenox", metadata: { workspace_id: ws, plan: "locations" },
      items: { object: "list", data: [{ id: "si_location", object: "subscription_item", price: stripeState.prices.price_location, quantity: 2, current_period_end: Math.floor(Date.now() / 1000) + 365 * 864e2 }] } };
    stripeState.subscriptions.set(sub.id, sub);
    const done = await stripePost({ id: "evt_cs_locations", type: "checkout.session.completed", data: { object: { id: "cs_test_1", object: "checkout.session", mode: "subscription", payment_status: "paid", customer: "cus_goldenox", subscription: sub.id, metadata: sess?.metadata ?? {} } } });
    const [b1] = await sql`select charged_store_ids, entry_credited_at from public.billing where workspace_id = ${ws}`;
    check("checkout.session.completed records the charged stores and the entry credit", done.status === 200 && JSON.stringify(b1.charged_store_ids) === JSON.stringify(["st-main", "st-roosevelt"]) && !!b1.entry_credited_at, b1);
    const created = await stripePost({ id: "evt_sub_created", type: "customer.subscription.created", data: { object: sub } });
    const [b2] = await sql`select subscription_id, subscription_status, subscription_plan, current_period_end from public.billing where workspace_id = ${ws}`;
    check("customer.subscription.created makes the plan monthly", created.status === 200 && b2.subscription_status === "active" && b2.subscription_plan === "locations" && !!b2.current_period_end && (await rpc("plan_of", { ws }, SERVICE_KEY)).data === "monthly", b2);
    const forged = await stripePost({ id: "evt_forged", type: "customer.subscription.deleted", data: { object: sub } }, { badSecret: true });
    check("a forged Stripe webhook is refused", forged.status === 400);
    const again = await stripePost({ id: "evt_cs_locations", type: "checkout.session.completed", data: { object: {} } });
    check("a repeated event is applied once", again.data?.duplicate === true, again);

    // a new store still opening: its opening fee on the next invoice, credited against its first year
    await saveState((s) => ({ ...s, stores: [...s.stores, { id: "st-bayside", name: same("Bayside, Bell Blvd"), address: "39-01 Bell Blvd, Bayside, NY 11361", stage: "opening", plannedOpen: day(150), rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: [] }] as typeof s.stores }));
    mark = recorded.length;
    const sync = await call("billing", { action: "sync_locations", workspace_id: ws, return_url: `${APP}/app/` }, { jwt: owner.jwt });
    const items = since(mark).filter((x) => x.service === "stripe" && x.path === "/v1/invoiceitems");
    check("sync_locations succeeds", sync.status === 200 && sync.data?.synced === true && sync.data?.new_openings === 1, sync);
    check("the subscription now counts 3 locations", sub.items.data[0].quantity === 3);
    check("an opening fee invoice item and a negative credit of one year", items.length === 2 && items.every((x) => x.status === 200) && (items[0].body.pricing?.price ?? items[0].body.price) === "price_opening" && items[0].body.quantity === "1" && items[1].body.amount === String(-14900 * 12), items.map((x) => ({ s: x.status, b: x.body })));
    // a store that's already open: counted, no opening fee
    await saveState((s) => ({ ...s, stores: [...s.stores, { id: "st-astoria", name: same("Astoria, Steinway St"), address: "31-01 Steinway St, Astoria, NY 11103", stage: "open", opened: "2024-05-01", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: [] }] as typeof s.stores }));
    mark = recorded.length;
    const sync2 = await call("billing", { action: "sync_locations", workspace_id: ws, return_url: `${APP}/app/` }, { jwt: owner.jwt });
    check("an open store added later is counted but not charged an opening fee", sync2.data?.new_openings === 0 && sub.items.data[0].quantity === 4 && since(mark).filter((x) => x.path === "/v1/invoiceitems").length === 0, sync2);
    const [b3] = await sql`select charged_store_ids from public.billing where workspace_id = ${ws}`;
    check("both new stores are remembered as charged", ["st-bayside", "st-astoria"].every((s) => (b3.charged_store_ids as string[]).includes(s)), b3);
    mark = recorded.length;
    await call("billing", { action: "sync_locations", workspace_id: ws, return_url: `${APP}/app/` }, { jwt: owner.jwt });
    check("syncing again changes nothing", since(mark).filter((x) => x.service === "stripe" && x.method === "POST").length === 0, since(mark).map((x) => x.path));
  });

  /* ---------------- f. filing ---------------- */
  await scenario("f. filing", async () => {
    const st = await wsState();
    const app = st.apps.find((a) => a.id === "app-dohmh")!;
    const ins = await rest("filings", { method: "POST", jwt: owner.jwt, prefer: "return=representation", body: {
      workspace_id: ws, app_id: app.id, title: app.name, agency: app.agency, portal_url: app.source.url, fee_estimate: 280,
      payload: { official: "nyc-dohmh-fse", form: app.form, fields: app.fields.map((f) => ({ id: f.id, label: f.label, value: f.value })), checklist: app.checklist.map((c) => ({ label: c.label, state: c.state })), signature: { name: "Mei Chen", title: "Owner", signed_at: new Date().toISOString(), kind: "typed" } },
    } });
    check("the owner approves the complete filing (RLS insert)", ins.status === 201 && ins.data?.[0]?.status === "requested", ins);
    const filing = ins.data?.[0]?.id;
    mark = recorded.length;
    const f = await call("file", { action: "start", workspace_id: ws, filing_id: filing }, { jwt: owner.jwt });
    check("file start hands it to the team (self-filing is off for this agency)", f.status === 200 && f.data?.filing?.agent_state === "handoff" && f.data?.filing?.channel === "team", f);
    const tasks = await sql`select id, kind, title from public.team_tasks where filing_id = ${filing}`;
    check("one team task", tasks.length === 1 && tasks[0].kind === "handoff", tasks);
    const m = emails(mark);
    check("one email to the Placetta team", m.length === 1 && JSON.stringify(m[0].body.to) === JSON.stringify([staff.email]) && /New for the team: Food service establishment permit \(Golden Ox Noodle\)/.test(m[0].body.subject), m.map((x) => x.body));
    const again = await call("file", { action: "start", workspace_id: ws, filing_id: filing }, { jwt: owner.jwt });
    check("starting again is a no-op", again.status === 200 && (await sql`select count(*)::int n from public.team_tasks where filing_id = ${filing}`)[0].n === 1 && emails(mark).length === 1);
    const sw = await call("file", {}, { headers: MK, jwt: SERVICE_KEY });
    check("the monitor's sweep adds no second task for it", sw.status === 200 && (await sql`select count(*)::int n from public.team_tasks where filing_id = ${filing}`)[0].n === 1, { sw, tasks: await sql`select kind, title, dedupe from public.team_tasks where filing_id = ${filing}` });
    const open = await rpc("team_tasks_open", {}, staff.jwt);
    check("team_tasks_open lists it for staff (two-step)", open.status === 200 && open.data.some((t: { filing_id: string; business: string }) => t.filing_id === filing && t.business === "Golden Ox Noodle"), open);
    const asOwner = await rpc("team_tasks_open", {}, owner.jwt);
    const asStaff1 = await rpc("team_tasks_open", {}, staffAal1);
    check("not for a customer, nor for staff without two-step", asOwner.status >= 400 && /team only/.test(asOwner.data?.message) && asStaff1.status >= 400, { asOwner, asStaff1 });
    check("customers can't read team_tasks directly", (await rest("team_tasks?select=id", { jwt: owner.jwt })).data?.length === 0);
    const fin = await rpc("finish_team_task", { p_id: tasks[0].id }, staff.jwt);
    const after = await rpc("team_tasks_open", {}, staff.jwt);
    const [row] = await sql`select done_at, done_by from public.team_tasks where id = ${tasks[0].id}`;
    check("finish_team_task closes it", fin.status === 200 || fin.status === 204 ? !after.data.some((t: { id: string }) => t.id === tasks[0].id) && row.done_by === staff.id : false, { fin, row });
    const notStaff = await rpc("finish_team_task", { p_id: tasks[0].id }, owner.jwt);
    check("a customer can't close team tasks", notStaff.status >= 400);

    // self-filing: Form SS-4 by fax. The IRS wants a handwritten signature, so the owner signs a printout and uploads it.
    const put = async (path: string, type: string, bytes: Uint8Array, name: string) => {
      await (await fetch(`${GATEWAY}/storage/v1/object/documents/${path}`, { method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, "content-type": type }, body: bytes as BodyInit })).body?.cancel();
      return await rest("documents", { method: "POST", jwt: owner.jwt, body: { workspace_id: ws, app_id: "app-ein", name, path, size: bytes.length, mime: type, source: "customer" }, prefer: "return=minimal" });
    };
    const pdf = new TextEncoder().encode("%PDF-1.4\n% filled SS-4\n");
    const pdfPath = `${ws}/filings/ss4-filled.pdf`;
    check("the filled form is in Documents", (await put(pdfPath, "application/pdf", pdf, "SS-4 filled.pdf")).status === 201);
    const ss4 = await rest("filings", { method: "POST", jwt: owner.jwt, prefer: "return=representation", body: {
      workspace_id: ws, app_id: "app-ein", title: { en: "EIN (Form SS-4)", zh: "雇主识别号（SS-4 表）" }, agency: { en: "IRS", zh: "美国国税局" }, fee_estimate: 0,
      payload: { official: "irs-ss4", form: { en: "Form SS-4", zh: "SS-4 表" }, pdf_path: pdfPath, us_address: true, fields: [{ id: "l1", label: same("Legal name"), value: "Golden Ox Noodle LLC" }, { id: "l7b", label: same("Responsible party SSN, ITIN or EIN"), value: "" }],
        checklist: [], signature: { name: "Mei Chen", title: "Member", signed_at: new Date().toISOString(), kind: "typed" } },
    } });
    const fid = ss4.data?.[0]?.id;
    mark = recorded.length;
    const s1 = await call("file", { action: "start", workspace_id: ws, filing_id: fid }, { jwt: owner.jwt });
    check("a wet-signature form waits for the signed copy", s1.data?.filing?.agent_state === "needs_you" && s1.data?.filing?.agent_log?.some((e: { kind: string; ref?: string }) => e.kind === "wet_signature" && e.ref === "upload"), s1.data);
    const signedPath = `${ws}/uploads/ss4-signed.pdf`;
    await put(signedPath, "application/pdf", new TextEncoder().encode("%PDF-1.4\n% signed by hand\n"), "SS-4 signed.pdf");
    const s2 = await call("file", { action: "signed", workspace_id: ws, filing_id: fid, path: signedPath }, { jwt: owner.jwt });
    const fax = since(mark).find((x) => x.service === "telnyx" && x.path === "/v2/faxes")?.body;
    check("the signed copy is faxed to the IRS", s2.status === 200 && s2.data?.filing?.channel === "fax" && s2.data?.filing?.agent_state === "running" && fax?.to === "+18556416935" && fax?.from === "+12125550101" && fax?.connection_id === "fax_conn_e2e" && String(fax?.media_url ?? "").includes("ss4-signed.pdf"), { s2: s2.data, fax });
    const [fr] = await sql`select provider_ref, submit_clicked_at, status from public.filings where id = ${fid}`;
    check("submit is marked before the fax leaves", !!fr?.submit_clicked_at && fr.status === "in_progress" && !!fr.provider_ref, fr);
    const hook = await telnyxPost(`file?provider=telnyx`, { data: { event_type: "fax.delivered", id: crypto.randomUUID(), occurred_at: new Date().toISOString(), record_type: "event", payload: { fax_id: fr?.provider_ref, page_count: 2, status: "delivered", to: "+18556416935" } } });
    const [fd] = await sql`select status, agent_state, receipt_path, requirements_checked from public.filings where id = ${fid}`;
    check("Telnyx's signed fax.delivered webhook reaches file and marks it submitted", hook.status === 200 && fd?.status === "submitted" && fd.agent_state === "done" && fd.requirements_checked, { hook, fd });
    check("the delivery receipt is saved to Documents", !!fd?.receipt_path && gw.files.has(`documents/${fd.receipt_path}`) && (await sql`select count(*)::int n from public.documents where path = ${fd?.receipt_path ?? ""} and source = 'agent'`)[0].n === 1, fd);
    const resend = await call("file", { action: "start", workspace_id: ws, filing_id: fid }, { jwt: owner.jwt });
    check("a submitted filing is never sent again", resend.status === 200 && since(mark).filter((x) => x.path === "/v2/faxes").length === 1, resend);
  });

  /* ---------------- g. headquarters ---------------- */
  await scenario("g. headquarters", async () => {
    const share = await rpc("hq_share", { ws, p_email: "Compliance@Moonleaf.example", p_brand: "Moonleaf" }, owner.jwt);
    check("the owner shares with an HQ email", share.status === 200 && typeof share.data === "string", share);
    const mine = await rpc("hq_stores", {}, hq.jwt);
    const row = mine.data?.[0];
    check("HQ (email proven) sees the workspace's stores", mine.status === 200 && mine.data.length === 1 && row.name === "Golden Ox Noodle" && row.brand === "Moonleaf" && row.stores.length === 4, mine);
    const keys = Object.keys(row?.stores?.[0] ?? {}).sort().join(",");
    check("one summary line per store, nothing else", keys === "address,current,due_30,grade,id,name,next,opened,overdue,pending,planned_open,projected_open,stage,status", keys);
    const main = row?.stores?.find((s: { id: string }) => s.id === "st-main");
    check("the summary counts what's overdue and due (the lapsed permit first)", main?.status === "overdue" && main?.overdue === 1 && main?.due_30 === 2 && main?.next?.date === day(-3), main);
    const blob = JSON.stringify(mine.data);
    check("nothing sensitive (form values, documents, approvals, memory)", !blob.includes(EIN) && !blob.includes("Golden Ox Noodle LLC") && !/lease|approval|memor|checklist|fields/i.test(blob), blob.slice(0, 400));
    check("an unproven email sees nothing", (await rpc("hq_stores", {}, hqUnproven.jwt)).data?.length === 0);
    check("HQ can't read the workspace itself", (await rest(`workspaces?id=eq.${ws}&select=state`, { jwt: hq.jwt })).data?.length === 0);
    // the Monday report, once a week
    const now = new Date(), toMonday = (8 - now.getUTCDay()) % 7;
    clockOffset = toMonday * 864e5;
    try {
      mark = recorded.length;
      const r1 = await call("monitor", {}, { headers: MK });
      await settle();
      const r2 = await call("monitor", {}, { headers: MK });
      await settle();
      const hqMail = emails(mark).filter((e) => e.body.to.includes(hq.email));
      check("the weekly HQ email goes out once on Monday", r1.data?.hq_reports === 1 && r2.data?.hq_reports === 0 && hqMail.length === 1, { r1: r1.data, r2: r2.data, n: hqMail.length });
      check("it lists the store at risk, without anything sensitive", /Moonleaf weekly store status/.test(hqMail[0]?.body.subject) && /Golden Ox Noodle, Flushing/.test(hqMail[0]?.body.text) && !hqMail[0]?.body.text.includes(EIN), hqMail[0]?.body.text);
    } finally { clockOffset = 0; }
  });

  /* ---------------- h. account deletion ---------------- */
  await scenario("h. account deletion", async () => {
    const r1 = await call("team", { action: "delete_account", confirm: "DELETE" }, { jwt: owner.jwt });
    check("refused while a paid plan is running", r1.status === 409 && r1.data?.error?.code === "subscription_active", r1);
    check("nothing was deleted", (await sql`select count(*)::int n from auth.users where id = ${owner.id}`)[0].n === 1);
    const sub = stripeState.subscriptions.get("sub_goldenox");
    await stripePost({ id: "evt_sub_deleted", type: "customer.subscription.deleted", data: { object: { ...sub, status: "canceled" } } });
    check("the subscription ends (Stripe webhook)", (await sql`select subscription_status from public.billing where workspace_id = ${ws}`)[0].subscription_status === "canceled");
    const r2 = await call("team", { action: "delete_account", confirm: "DELETE" }, { jwt: owner.jwt });
    check("then the account is deleted", r2.status === 200 && r2.data?.deleted === true && r2.data?.workspaces === 1, r2);
    const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    check("the auth user is gone (hard delete)", await n(sql`select count(*)::int n from auth.users where id = ${owner.id}`) === 0);
    check("the workspace and everything in it is gone", await n(sql`select ((select count(*) from public.workspaces where id = ${ws}) + (select count(*) from public.filings where workspace_id = ${ws}) + (select count(*) from public.team_tasks where workspace_id = ${ws})
      + (select count(*) from public.audit_log where workspace_id = ${ws}) + (select count(*) from public.billing where workspace_id = ${ws}) + (select count(*) from public.agent_runs where workspace_id = ${ws})
      + (select count(*) from public.hq_links where workspace_id = ${ws}) + (select count(*) from public.updates where workspace_id = ${ws}) + (select count(*) from public.workspace_members where workspace_id = ${ws}))::int as n`) === 0);
    check("the phone link, texts, calls and outbox are gone", await n(sql`select ((select count(*) from public.phone_links where user_id = ${owner.id}) + (select count(*) from public.odelia_messages where user_id = ${owner.id})
      + (select count(*) from public.odelia_outbox where user_id = ${owner.id}) + (select count(*) from public.odelia_calls where user_id = ${owner.id}) + (select count(*) from public.phone_codes where user_id = ${owner.id}))::int as n`) === 0);
    check("stored files are removed", ![...gw.files.keys()].some((k) => k.startsWith(`documents/${ws}/`)), [...gw.files.keys()]);
    check("HQ no longer sees it", (await rpc("hq_stores", {}, hq.jwt)).data?.length === 0);
    check("the Placetta team member is untouched", await n(sql`select count(*)::int n from auth.users where id = ${staff.id}`) === 1);
    const r3 = await call("team", { action: "delete_account", confirm: "DELETE" }, { jwt: owner.jwt });
    check("the old session no longer works", r3.status === 401, r3);
  });
} catch (e) {
  check("the stack started", false, (e as Error)?.stack ?? String(e));
} finally {
  await settle(20_000).catch(() => undefined);
  await gateway?.stop().catch(() => undefined);
  await stack?.stop();
  const logFile = `${ROOT}/node_modules/.cache/placetta-e2e/last-run.log`;
  try { await Deno.mkdir(`${ROOT}/node_modules/.cache/placetta-e2e`, { recursive: true }); await Deno.writeTextFile(logFile, logLines.join("\n") + "\n"); } catch { /* no log */ }
  const failed = results.filter((r) => !r.ok);
  out(`\n${results.length - failed.length}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)} s. Function logs: ${logFile.replace(ROOT + "/", "")}`);
  if (failed.length) { out(`FAILED ${failed.length}:`); for (const f of failed) out(`  ${f.group}: ${f.name}`); }
  Deno.exit(failed.length ? 1 : 0);
}
