var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// dep:npm:@supabase/supabase-js@2
var require_supabase_js_2 = __commonJS({
  "dep:npm:@supabase/supabase-js@2"(exports, module) {
    module.exports = globalThis.__placettaDeps["npm:@supabase/supabase-js@2"];
  }
});

// src/bi.ts
var B = (en, zh) => ({ en, zh });

// src/spend.ts
var SPEND_CATEGORIES = [
  { id: "gov_fees", label: B("Government fees and permits", "\u653F\u5E9C\u89C4\u8D39\u4E0E\u8BB8\u53EF\u8BC1"), hint: B("Filing, license, permit and plan-check fees an agency charges.", "\u673A\u6784\u6536\u53D6\u7684\u7533\u62A5\u3001\u6267\u7167\u3001\u8BB8\u53EF\u4E0E\u56FE\u7EB8\u5BA1\u6838\u8D39\u7528\u3002"), gov: true },
  { id: "inspections", label: B("Inspection fees", "\u68C0\u67E5\u8D39\u7528"), hint: B("Health, fire and building inspection or re-inspection fees.", "\u536B\u751F\u3001\u6D88\u9632\u3001\u5EFA\u7B51\u68C0\u67E5\u6216\u590D\u68C0\u8D39\u7528\u3002"), gov: true },
  { id: "filing_services", label: B("Registered agent and filing services", "\u6CE8\u518C\u4EE3\u7406\u4E0E\u7533\u62A5\u670D\u52A1"), hint: B("A registered agent, certified copies, apostilles.", "\u6CE8\u518C\u4EE3\u7406\u3001\u6838\u8BC1\u526F\u672C\u3001\u6D77\u7259\u8BA4\u8BC1\u3002"), gov: false },
  { id: "mail", label: B("Certified mail and courier", "\u6302\u53F7\u4FE1\u4E0E\u5FEB\u9012"), hint: B("Certified mail with tracking, overnight courier to an agency.", "\u5E26\u8FFD\u8E2A\u7684\u6302\u53F7\u4FE1\u3001\u5BC4\u5F80\u673A\u6784\u7684\u9694\u591C\u5FEB\u9012\u3002"), gov: false },
  { id: "training", label: B("Food safety certificates and courses", "\u98DF\u54C1\u5B89\u5168\u8BC1\u4E66\u4E0E\u8BFE\u7A0B"), hint: B("Food manager and food handler courses and exams.", "\u98DF\u54C1\u7ECF\u7406\u4E0E\u98DF\u54C1\u4ECE\u4E1A\u4EBA\u5458\u8BFE\u7A0B\u53CA\u8003\u8BD5\u3002"), gov: false },
  { id: "background", label: B("Fingerprints and background checks", "\u6307\u7EB9\u4E0E\u80CC\u666F\u8C03\u67E5"), hint: B("Live Scan and the background checks a license asks for.", "\u6267\u7167\u6240\u9700\u7684 Live Scan \u6307\u7EB9\u4E0E\u80CC\u666F\u8C03\u67E5\u3002"), gov: false },
  { id: "signage", label: B("Required signs and postings", "\u6CD5\u5B9A\u6807\u8BC6\u4E0E\u516C\u793A"), hint: B("Posters, placards and signs a rule requires on site.", "\u6CD5\u89C4\u8981\u6C42\u5728\u5E97\u5185\u5F20\u8D34\u7684\u6D77\u62A5\u3001\u6807\u724C\u4E0E\u6807\u8BC6\u3002"), gov: false },
  { id: "supplies", label: B("Compliance supplies", "\u5408\u89C4\u7528\u54C1"), hint: B("Thermometers, test strips, first-aid and fire extinguisher service.", "\u6E29\u5EA6\u8BA1\u3001\u8BD5\u7EB8\u3001\u6025\u6551\u7528\u54C1\u4E0E\u706D\u706B\u5668\u7EF4\u62A4\u3002"), gov: false }
];
var DEFAULT_POLICY = {
  on: false,
  allowed: ["gov_fees", "inspections"],
  perPurchase: 1e3,
  secondOver: 2500,
  payees: "government",
  listed: [],
  blocked: [],
  budgets: []
};
function isGovernment(payee, url) {
  const host = (() => {
    try {
      return url ? new URL(url).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  })();
  if (/(^|\.)[a-z0-9-]+\.(gov|mil)$/.test(host) || /\.gov\.[a-z]{2}$/.test(host)) return true;
  return /\b(department|dept\.?|county|city of|state of|secretary of state|franchise tax board|internal revenue|irs|board of equalization|cdtfa|public health|fire (department|marshal)|building (and|&) safety|planning|comptroller|treasurer|tax collector)\b/i.test(payee);
}
var norm = (s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
var listedHit = (list, payee, url) => {
  const p = payee.toLowerCase(), h = url ? norm(url) : "";
  return list.some((x) => {
    const n = norm(x);
    return !!n && (p.includes(n) || !!h && (h === n || h.endsWith("." + n)));
  });
};
var monthKey = (iso) => iso.slice(0, 7);
function spentIn(b, purchases, now = (/* @__PURE__ */ new Date()).toISOString()) {
  return purchases.filter((p) => (p.status === "paid" || p.status === "approved") && (!b.store || p.store === b.store) && (!b.category || p.category === b.category) && (b.period !== "month" || monthKey(p.at) === monthKey(now))).reduce((s, p) => s + p.amount, 0);
}
var money = (n) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
function decide(p, policy, purchases, now = (/* @__PURE__ */ new Date()).toISOString()) {
  const no = [], ask = [];
  if (!policy.on) no.push(B("Purchases by Odelia are turned off in Spending settings.", "\u5DF2\u5728\u652F\u51FA\u8BBE\u7F6E\u4E2D\u5173\u95ED Odelia \u4EE3\u4E3A\u8D2D\u4E70\u3002"));
  if (!(p.amount > 0) || !isFinite(p.amount)) no.push(B("The amount is missing.", "\u7F3A\u5C11\u91D1\u989D\u3002"));
  const cat = SPEND_CATEGORIES.find((c) => c.id === p.category);
  if (!cat) no.push(B("Unknown kind of purchase.", "\u672A\u77E5\u7684\u8D2D\u4E70\u7C7B\u522B\u3002"));
  else if (!policy.allowed.includes(p.category)) no.push(B(`${cat.label.en} isn't on the list of what Odelia may buy.`, `\u201C${cat.label.zh}\u201D\u4E0D\u5728 Odelia \u53EF\u8D2D\u4E70\u7684\u8303\u56F4\u5185\u3002`));
  const gov = isGovernment(p.payee, p.payeeUrl);
  if (listedHit(policy.blocked, p.payee, p.payeeUrl)) no.push(B(`${p.payee} is on the blocked list.`, `${p.payee} \u5728\u7981\u6B62\u540D\u5355\u4E2D\u3002`));
  else if (policy.payees === "government" && !gov) no.push(B(`${p.payee} isn't a government agency, and Odelia may only pay agencies.`, `${p.payee} \u4E0D\u662F\u653F\u5E9C\u673A\u6784\uFF0C\u800C Odelia \u53EA\u80FD\u5411\u653F\u5E9C\u673A\u6784\u4ED8\u6B3E\u3002`));
  else if (policy.payees === "listed" && !gov && !listedHit(policy.listed, p.payee, p.payeeUrl)) no.push(B(`${p.payee} isn't an agency or on your list of payees.`, `${p.payee} \u65E2\u4E0D\u662F\u653F\u5E9C\u673A\u6784\uFF0C\u4E5F\u4E0D\u5728\u60A8\u7684\u6536\u6B3E\u65B9\u540D\u5355\u4E2D\u3002`));
  if (p.amount > policy.perPurchase) no.push(B(`${money(p.amount)} is over the ${money(policy.perPurchase)} limit for one purchase.`, `${money(p.amount)} \u8D85\u8FC7\u5355\u7B14\u4E0A\u9650 ${money(policy.perPurchase)}\u3002`));
  const hits = policy.budgets.filter((b) => (!b.store || b.store === p.store) && (!b.category || b.category === p.category));
  const budgets = hits.map((b) => ({ budget: b, left: b.amount - spentIn(b, purchases, now) - p.amount }));
  for (const { budget, left } of budgets) if (left < 0) {
    const name = budget.label ?? B("a budget", "\u67D0\u9879\u9884\u7B97");
    no.push(B(`Over ${name.en}: ${money(budget.amount - spentIn(budget, purchases, now))} left of ${money(budget.amount)}.`, `\u8D85\u51FA\u201C${name.zh}\u201D\uFF1A${money(budget.amount)} \u4E2D\u4EC5\u5269 ${money(budget.amount - spentIn(budget, purchases, now))}\u3002`));
  }
  if (no.length) return { verdict: "blocked", reasons: no, approvers: 0, budgets };
  if (!hits.length) ask.push(B("No budget covers it yet.", "\u5C1A\u65E0\u8986\u76D6\u5B83\u7684\u9884\u7B97\u3002"));
  for (const { budget, left } of budgets) ask.push(B(`${budget.label?.en ?? "Budget"}: ${money(Math.max(0, left))} left after this.`, `${budget.label?.zh ?? "\u9884\u7B97"}\uFF1A\u6B64\u7B14\u4E4B\u540E\u5269\u4F59 ${money(Math.max(0, left))}\u3002`));
  const second = policy.secondOver != null && p.amount > policy.secondOver;
  if (second) ask.push(B(`Over ${money(policy.secondOver)}, so two owners approve it.`, `\u8D85\u8FC7 ${money(policy.secondOver)}\uFF0C\u9700\u4E24\u4F4D\u6240\u6709\u8005\u6279\u51C6\u3002`));
  return { verdict: "ask", reasons: ask, approvers: second ? 2 : 1, budgets };
}
function policyProblems(p) {
  const out = [];
  if (!(p.perPurchase > 0)) out.push(B("Set a limit for one purchase.", "\u8BF7\u8BBE\u7F6E\u5355\u7B14\u4E0A\u9650\u3002"));
  if (p.secondOver != null && p.secondOver < 0) out.push(B("The two-person amount can't be negative.", "\u53CC\u4EBA\u5BA1\u6279\u91D1\u989D\u4E0D\u80FD\u4E3A\u8D1F\u3002"));
  for (const b of p.budgets) if (!(b.amount > 0)) out.push(B("Every budget needs an amount above $0.", "\u6BCF\u9879\u9884\u7B97\u91D1\u989D\u90FD\u987B\u5927\u4E8E $0\u3002"));
  if (p.allowed.some((c) => !SPEND_CATEGORIES.some((x) => x.id === c))) out.push(B("Unknown kind of purchase in the allowed list.", "\u53EF\u8D2D\u4E70\u8303\u56F4\u4E2D\u6709\u672A\u77E5\u7C7B\u522B\u3002"));
  return out;
}

// supabase/functions/spend/shared.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);
var SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
var SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
var ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
var NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
var admin = (0, import_supabase_js_2.createClient)(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: NO_SESSION });
var STATUS = {
  unauthorized: 401,
  mfa_required: 401,
  forbidden: 403,
  bad_request: 400,
  not_found: 404,
  not_connected: 409,
  not_configured: 503,
  upstream_error: 502
};
var HttpError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
  code;
};
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra }
  });
}
var ok = (data = {}) => json({ ok: true, ...data });
var errorResponse = (code, message) => json({ error: { code, message } }, STATUS[code]);
function serve(handler) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e.code, e.message);
      console.error("unhandled:", describe(e));
      return json({ error: { code: "internal", message: "Something went wrong. Try again." } }, 500);
    }
  });
}
function describe(e) {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 300);
  return "unknown error";
}
async function readBody(req) {
  if (req.method !== "POST") throw new HttpError("bad_request", "Use POST.");
  let body;
  try {
    body = await req.json();
  } catch {
    throw new HttpError("bad_request", "Send a JSON body.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("bad_request", "Send a JSON object.");
  return body;
}
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v) {
  return typeof v === "string" && UUID.test(v);
}
function uuidParam(v, label) {
  if (!isUuid(v)) throw new HttpError("bad_request", `${label} must be a valid id.`);
  return v.toLowerCase();
}
function text(v, label, min, max) {
  if (typeof v !== "string") throw new HttpError("bad_request", `${label} is required.`);
  const s = v.trim();
  if (s.length < min) throw new HttpError("bad_request", `${label} is required.`);
  if (s.length > max) throw new HttpError("bad_request", `${label} is too long (at most ${max} characters).`);
  return s;
}
async function requireUser(req) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new HttpError("unauthorized", "Sign in to continue.");
  const { data, error } = await admin.auth.getUser(m[1]);
  if (error || !data?.user) throw new HttpError("unauthorized", "Your session has expired. Sign in again.");
  return { user: data.user, jwt: m[1] };
}
function aalOf(jwt) {
  try {
    const part = jwt.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const claims = JSON.parse(atob(b64));
    return typeof claims.aal === "string" ? claims.aal : "aal1";
  } catch {
    return "aal1";
  }
}
async function accessFor(ws, user, jwt) {
  const { data, error } = await admin.rpc("access_for", { ws, uid: user.id, p_aal: aalOf(jwt) });
  if (!error) return String(data);
  if (error.code !== "PGRST202") throw new Error(`access lookup failed: ${error.code ?? ""}`);
  const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
  if (m) return m.role === "owner" ? "owner" : "member";
  return await isStaff(user) ? "staff" : "none";
}
async function requireAccess(ws, user, jwt, need) {
  const a = await accessFor(ws, user, jwt);
  if (a === "mfa_required") throw new HttpError("mfa_required", "Finish two-step sign-in to continue.");
  if (a === "owner" || need === "member" && a === "member") return a;
  if (a === "member") throw new HttpError("forbidden", "Only an owner of this workspace can do that.");
  throw new HttpError("forbidden", "You are not a member of this workspace.");
}
async function isStaff(user) {
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return false;
  const { data, error } = await admin.from("staff_emails").select("email").eq("email", email).maybeSingle();
  if (error) throw new Error(`staff lookup failed: ${error.code ?? ""}`);
  return !!data;
}
async function audit(entry, strict = false) {
  const { error } = await admin.from("audit_log").insert({ ...entry, detail: entry.detail ?? null });
  if (error) {
    console.error("audit insert failed:", error.code ?? "", error.message?.slice(0, 200) ?? "");
    if (strict) throw new Error("audit insert failed");
  }
}
var STATE_TTL_MS = 10 * 60 * 1e3;

// supabase/functions/spend/index.ts
var toPurchase = (r) => ({
  id: r.id,
  at: r.created_at,
  category: r.category,
  payee: r.payee,
  payeeUrl: r.payee_url ?? void 0,
  amount: r.amount_cents / 100,
  store: r.store_id ?? void 0,
  app: r.app_id ?? void 0,
  why: r.why,
  status: r.status,
  by: r.by_agent ? "agent" : "you",
  approvals: r.approvals,
  method: r.method ?? void 0,
  receipt: r.receipt_path ?? void 0,
  reasons: r.reasons ?? void 0
});
async function policyOf(ws) {
  const { data } = await admin.from("spend_policies").select("policy").eq("workspace_id", ws).maybeSingle();
  return { ...DEFAULT_POLICY, ...data?.policy ?? {} };
}
async function purchasesOf(ws, limit = 500) {
  const { data, error } = await admin.from("purchases").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`purchases read: ${error.code ?? ""}`);
  return data ?? [];
}
async function one(ws, id) {
  const { data } = await admin.from("purchases").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle();
  if (!data) throw new HttpError("not_found", "That purchase isn't in this workspace.");
  return data;
}
var money2 = (c) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
var what = (r) => ({ en: `${money2(r.amount_cents)} to ${r.payee}`, zh: `\u5411 ${r.payee} \u652F\u4ED8 ${money2(r.amount_cents)}` });
async function tell(r, title, body) {
  await admin.from("updates").upsert({ workspace_id: r.workspace_id, kind: "purchase", title, body: body ?? null, app_id: r.app_id, dedupe: `purchase:${r.id}:${r.status}` }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
}
var CATS = new Set(SPEND_CATEGORIES.map((c) => c.id));
function readPurchase(v) {
  const o = v ?? {};
  const category = String(o.category ?? "");
  if (!CATS.has(category)) throw new HttpError("bad_request", "Unknown kind of purchase.");
  const amount = Math.round(Number(o.amount) * 100) / 100;
  if (!(amount > 0) || amount > 1e5) throw new HttpError("bad_request", "The amount has to be between $0 and $100,000.");
  const url = o.payee_url ? String(o.payee_url) : void 0;
  if (url && !/^https:\/\//i.test(url)) throw new HttpError("bad_request", "The payee's page must be an https address.");
  const why = o.why ?? {};
  return {
    category,
    amount,
    payee: text(o.payee, "payee", 2, 160),
    payeeUrl: url,
    store: o.store ? String(o.store).slice(0, 80) : void 0,
    app: o.app ? String(o.app).slice(0, 80) : void 0,
    filing: o.filing ? uuidParam(o.filing, "filing") : void 0,
    why: { en: text(why.en ?? "", "why", 2, 300), zh: String(why.zh ?? why.en ?? "").slice(0, 300) },
    byAgent: o.by !== "you"
  };
}
serve(async (req) => {
  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const action = String(body.action ?? "");
  if (action === "get") {
    await requireAccess(ws, user, jwt, "member");
    const [policy, rows] = await Promise.all([policyOf(ws), purchasesOf(ws, 200)]);
    return ok({ policy, purchases: rows.map(toPurchase) });
  }
  if (action === "set_policy") {
    await requireAccess(ws, user, jwt, "owner");
    const p = { ...DEFAULT_POLICY, ...body.policy ?? {} };
    delete p.autoUnder;
    const bad = policyProblems(p);
    if (bad.length) throw new HttpError("bad_request", bad.map((b) => b.en).join(" "));
    const { error } = await admin.from("spend_policies").upsert({ workspace_id: ws, policy: p, updated_by: user.id, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
    if (error) throw new Error(`policy save: ${error.code ?? ""}`);
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Changed what Odelia may ask to buy", zh: "\u4FEE\u6539\u4E86 Odelia \u7684\u8D2D\u4E70\u6743\u9650" }, object: { en: p.on ? `On, up to $${p.perPurchase} each, ${p.budgets.length} budget(s)` : "Off", zh: p.on ? `\u5DF2\u5F00\u542F\uFF0C\u5355\u7B14\u6700\u9AD8 $${p.perPurchase}\uFF0C${p.budgets.length} \u9879\u9884\u7B97` : "\u5DF2\u5173\u95ED" } });
    return ok({ policy: p });
  }
  if (action === "propose") {
    await requireAccess(ws, user, jwt, "member");
    const q = readPurchase(body.purchase);
    const [policy, rows] = await Promise.all([policyOf(ws), purchasesOf(ws)]);
    const dup = rows.find((r2) => r2.status === "asked" && r2.payee === q.payee && r2.amount_cents === Math.round(q.amount * 100) && r2.app_id === (q.app ?? null));
    if (dup) return ok({ verdict: "ask", reasons: [], purchase: toPurchase(dup), already: true });
    const d = decide({ category: q.category, payee: q.payee, payeeUrl: q.payeeUrl, amount: q.amount, store: q.store }, policy, rows.map(toPurchase));
    const { data, error } = await admin.from("purchases").insert({
      workspace_id: ws,
      category: q.category,
      payee: q.payee,
      payee_url: q.payeeUrl ?? null,
      amount_cents: Math.round(q.amount * 100),
      store_id: q.store ?? null,
      app_id: q.app ?? null,
      filing_id: q.filing ?? null,
      why: q.why,
      status: d.verdict === "blocked" ? "blocked" : "asked",
      by_agent: q.byAgent,
      requested_by: user.id,
      approvers_needed: Math.max(1, d.approvers),
      reasons: d.reasons
    }).select("*").single();
    if (error) throw new Error(`purchase insert: ${error.code ?? ""}`);
    const r = data;
    await audit({ workspace_id: ws, actor: q.byAgent ? "agent" : "you", actor_id: user.id, action: d.verdict === "blocked" ? { en: "Stopped a purchase outside the rules", zh: "\u62E6\u622A\u4E86\u4E00\u7B14\u8D85\u51FA\u89C4\u5219\u7684\u8D2D\u4E70" } : { en: "Asked to buy", zh: "\u7533\u8BF7\u8D2D\u4E70" }, object: what(r), detail: d.reasons[0] ?? q.why });
    if (d.verdict === "ask") await tell(r, { en: `Approve ${money2(r.amount_cents)} to ${r.payee}?`, zh: `\u662F\u5426\u6279\u51C6\u5411 ${r.payee} \u652F\u4ED8 ${money2(r.amount_cents)}\uFF1F` }, q.why);
    return ok({ verdict: d.verdict, reasons: d.reasons, purchase: toPurchase(r) });
  }
  if (action === "decide") {
    await requireAccess(ws, user, jwt, "owner");
    const r = await one(ws, uuidParam(body.id, "id"));
    if (r.status !== "asked") throw new HttpError("bad_request", "That purchase was already decided.");
    if (!body.approve) {
      const { data: data2 } = await admin.from("purchases").update({ status: "declined", decided_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", r.id).eq("status", "asked").select("*").single();
      await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Declined a purchase", zh: "\u62D2\u7EDD\u4E86\u8D2D\u4E70" }, object: what(r) });
      return ok({ purchase: toPurchase(data2) });
    }
    if (r.approvals.some((a) => a.who === user.id)) throw new HttpError("bad_request", "You already approved it. A second owner has to approve it too.");
    const approvals = [...r.approvals, { who: user.id, at: (/* @__PURE__ */ new Date()).toISOString() }];
    const { data: upd } = await admin.from("purchases").update({ approvals }).eq("id", r.id).eq("status", "asked").select("*").single();
    if (approvals.length < r.approvers_needed) {
      await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Approved a purchase (first of two)", zh: "\u6279\u51C6\u8D2D\u4E70\uFF08\u4E24\u4EBA\u4E2D\u7684\u7B2C\u4E00\u4F4D\uFF09" }, object: what(r) });
      return ok({ purchase: toPurchase(upd), waiting: r.approvers_needed - approvals.length });
    }
    const [policy, rows] = await Promise.all([policyOf(ws), purchasesOf(ws)]);
    const d = decide({ category: r.category, payee: r.payee, payeeUrl: r.payee_url ?? void 0, amount: r.amount_cents / 100, store: r.store_id ?? void 0 }, policy, rows.filter((x) => x.id !== r.id).map(toPurchase));
    if (d.verdict === "blocked") {
      const { data: data2 } = await admin.from("purchases").update({ status: "blocked", reasons: d.reasons, decided_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", r.id).select("*").single();
      return ok({ purchase: toPurchase(data2), reasons: d.reasons });
    }
    const { data } = await admin.from("purchases").update({ status: "approved", method: "link", decided_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", r.id).eq("status", "asked").select("*").single();
    const row = data;
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Approved a purchase", zh: "\u6279\u51C6\u8D2D\u4E70" }, object: what(r), detail: r.why });
    await tell(row, { en: `Approved: pay ${r.payee} ${money2(r.amount_cents)} on their page`, zh: `\u5DF2\u6279\u51C6\uFF1A\u5728 ${r.payee} \u7684\u9875\u9762\u652F\u4ED8 ${money2(r.amount_cents)}` }, r.why);
    return ok({ purchase: toPurchase(row) });
  }
  if (action === "paid") {
    await requireAccess(ws, user, jwt, "member");
    const r = await one(ws, uuidParam(body.id, "id"));
    if (r.status !== "approved") throw new HttpError("bad_request", "Only an approved purchase can be marked paid.");
    const receipt = body.receipt_path ? String(body.receipt_path).slice(0, 300) : null;
    if (receipt && !receipt.startsWith(`${ws}/`)) throw new HttpError("bad_request", "That receipt isn't in this workspace.");
    const { data } = await admin.from("purchases").update({ status: "paid", paid_at: (/* @__PURE__ */ new Date()).toISOString(), receipt_path: receipt }).eq("id", r.id).select("*").single();
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Paid", zh: "\u5DF2\u652F\u4ED8" }, object: what(r) });
    return ok({ purchase: toPurchase(data) });
  }
  if (action === "cancel") {
    await requireAccess(ws, user, jwt, "owner");
    const r = await one(ws, uuidParam(body.id, "id"));
    if (r.status !== "asked" && r.status !== "approved") throw new HttpError("bad_request", "Only an unpaid purchase can be canceled.");
    const { data } = await admin.from("purchases").update({ status: "canceled", decided_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", r.id).select("*").single();
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Canceled a purchase", zh: "\u53D6\u6D88\u4E86\u8D2D\u4E70" }, object: what(r) });
    return ok({ purchase: toPurchase(data) });
  }
  throw new HttpError("bad_request", "Unknown action.");
});
