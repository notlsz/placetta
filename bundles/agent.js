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

// ../../../../../../home/claude/placetta-agent/supabase/functions/agent/index.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);

// ../../../../../../home/claude/placetta-agent/supabase/functions/_shared/llm.ts
var OPENAI_STYLE = {
  openai: { url: "https://api.openai.com/v1/chat/completions", key: "OPENAI_API_KEY" },
  deepseek: { url: "https://api.deepseek.com/chat/completions", key: "DEEPSEEK_API_KEY" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: "GEMINI_API_KEY" },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", key: "OPENROUTER_API_KEY" },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", key: "GROQ_API_KEY" }
};
function routeFor(env, tier, fallbackModel) {
  const raw = env(tier === "fast" ? "AGENT_ROUTE_FAST" : tier === "deep" ? "AGENT_ROUTE_DEEP" : "AGENT_ROUTE") ?? env("AGENT_ROUTE") ?? "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const i = s.indexOf(":");
    return [s.slice(0, i), s.slice(i + 1)];
  }).filter(([p, m]) => m && (p === "anthropic" || p in OPENAI_STYLE));
  if (!list.some(([p]) => p === "anthropic")) list.push(["anthropic", fallbackModel]);
  return list;
}
var isFree = (p, m) => p === "groq" || /:free$/.test(m);
var hasFiles = (messages) => messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "image" || b.type === "document"));
var hasDocs = (messages) => messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "document"));
function toOpenAI(payload, model) {
  const out = [];
  if (typeof payload.system === "string" && payload.system) out.push({ role: "system", content: payload.system });
  for (const m of payload.messages ?? []) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = m.content ?? [];
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("");
      const calls = blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: "assistant", content: text || null, ...calls.length ? { tool_calls: calls } : {} });
      continue;
    }
    const parts = [];
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const c = b.content;
        const s = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x.type === "text" ? String(x.text ?? "") : "").join("") : JSON.stringify(c ?? "");
        out.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: (b.is_error ? "Error: " : "") + s });
      } else if (b.type === "text") parts.push({ type: "text", text: String(b.text ?? "") });
      else if (b.type === "image") {
        const src = b.source;
        if (src?.type === "base64") parts.push({ type: "image_url", image_url: { url: `data:${src.media_type};base64,${src.data}` } });
      }
    }
    if (parts.length) out.push({ role: "user", content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts });
  }
  const tools = (payload.tools ?? []).filter((t) => !("type" in t)).map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema ?? { type: "object", properties: {} } } }));
  return { model, messages: out, max_tokens: payload.max_tokens, ...tools.length ? { tools } : {} };
}
function fromOpenAI(d, model) {
  const ch = (d.choices ?? [])[0] ?? {};
  const msg = ch.message ?? {};
  const content = [];
  if (typeof msg.content === "string" && msg.content.trim()) content.push({ type: "text", text: msg.content });
  for (const c of msg.tool_calls ?? []) {
    const f = c.function;
    let input = {};
    try {
      input = JSON.parse(String(f.arguments || "{}"));
    } catch {
      input = {};
    }
    content.push({ type: "tool_use", id: String(c.id || crypto.randomUUID()), name: String(f.name), input });
  }
  const fr = String(ch.finish_reason ?? "");
  const u = d.usage ?? {};
  return {
    id: String(d.id ?? ""),
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : fr === "length" ? "max_tokens" : "end_turn",
    usage: { input_tokens: Number(u.prompt_tokens ?? 0), output_tokens: Number(u.completion_tokens ?? 0) }
  };
}
async function anthropic(f, key, payload, beta) {
  const headers = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
  if (beta) headers["anthropic-beta"] = beta;
  const res = await f("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(payload) });
  return { res, text: await res.text() };
}
async function viaAnthropic(f, key, call, model, research) {
  const payload = { ...call.payload, model };
  let { res, text } = await anthropic(f, key, payload, call.beta);
  if (research && res.status === 400 && /web_fetch|beta/i.test(text)) {
    payload.tools = [...research.pageTools, research.search];
    ({ res, text } = await anthropic(f, key, payload, null));
  }
  if (research && res.status === 400 && /web_search/i.test(text)) {
    payload.tools = research.pageTools.length ? research.pageTools : void 0;
    ({ res, text } = await anthropic(f, key, payload, null));
  }
  return { res, text };
}
async function callModel(env, call, fallbackModel, research, f = fetch) {
  let route = routeFor(env, call.tier, fallbackModel);
  const msgs = call.payload.messages ?? [];
  const files = hasFiles(msgs), docs = hasDocs(msgs), allowFree = env("AGENT_ALLOW_FREE") === "1";
  route = route.filter(([p, m]) => !isFree(p, m) || allowFree && !files);
  if (docs) route = route.filter(([p]) => p === "anthropic" || p === "gemini" || p === "openrouter");
  if (call.research) route = [...route.filter(([p]) => p === "anthropic"), ...route.filter(([p]) => p !== "anthropic")];
  let last = { ok: false, status: 503, text: "No model has a key. Add one in the Edge Function secrets.", model: "" };
  for (const [p, model] of route) {
    try {
      if (p === "anthropic") {
        const key = env("ANTHROPIC_API_KEY");
        if (!key) continue;
        const { res, text } = await viaAnthropic(f, key, call, model, research);
        if (res.ok) return { ok: true, status: 200, data: JSON.parse(text), text, model: `${p}:${model}` };
        last = { ok: false, status: res.status, text, model: `${p}:${model}` };
      } else {
        const cfg = OPENAI_STYLE[p], key = env(cfg.key);
        if (!key) continue;
        const body = toOpenAI({ ...call.payload, tools: research ? research.pageTools : call.payload.tools }, model);
        const res = await f(cfg.url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
        const text = await res.text();
        if (res.ok) {
          const data = fromOpenAI(JSON.parse(text), `${p}:${model}`);
          return { ok: true, status: 200, data, text, model: `${p}:${model}` };
        }
        last = { ok: false, status: res.status, text, model: `${p}:${model}` };
      }
      console.error("model", last.model, last.status, last.text.slice(0, 200));
    } catch (e) {
      last = { ok: false, status: 502, text: String(e), model: `${p}:${model}` };
      console.error("model", last.model, last.text.slice(0, 200));
    }
  }
  return last;
}

// ../../../../../../home/claude/placetta-agent/supabase/functions/agent/index.ts
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
var fail = (status, code, message) => json(status, { error: { code, message } });
var admin = (0, import_supabase_js_2.createClient)(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }
});
function aalOf(jwt) {
  try {
    const part = jwt.split(".")[1] ?? "";
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof claims.aal === "string" ? claims.aal : "aal1";
  } catch {
    return "aal1";
  }
}
async function accessFor(ws, user, jwt) {
  const { data, error } = await admin.rpc("access_for", { ws, uid: user.id, p_aal: aalOf(jwt) });
  if (!error) return String(data);
  if (error.code !== "PGRST202") return "none";
  const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
  if (m) return m.role === "owner" ? "owner" : "member";
  if (!user.email_confirmed_at) return "none";
  const { data: s } = await admin.from("staff_emails").select("email").eq("email", (user.email ?? "").toLowerCase()).maybeSingle();
  return s ? "staff" : "none";
}
var DAILY_CALLS = Number(Deno.env.get("AGENT_DAILY_CALLS") ?? "400");
var MODEL = Deno.env.get("AGENT_MODEL") ?? "claude-sonnet-5-5";
var MODEL_DEEP = Deno.env.get("AGENT_MODEL_DEEP") ?? "claude-opus-5-5";
var FETCH_BETA = "web-fetch-2025-09-10";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  const env = (k) => Deno.env.get(k);
  const KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY"];
  if (!KEYS.some((k) => env(k))) return fail(503, "not_configured", "Add a model key (for example ANTHROPIC_API_KEY) in the Edge Function secrets.");
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return fail(401, "unauthorized", "Sign in again.");
  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Send JSON.");
  }
  const ws = String(body.workspace_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ws)) return fail(400, "bad_request", "workspace_id is required.");
  const access = await accessFor(ws, user, jwt);
  if (access === "mfa_required" || access === "staff_mfa_required") return fail(401, "mfa_required", "Finish two-step sign-in to continue.");
  if (access === "none") return fail(403, "forbidden", "This isn't your workspace.");
  const staff = access === "staff";
  if (!staff) {
    const { data: plan } = await admin.rpc("plan_of", { ws });
    if (plan === "none") return fail(402, "payment_required", "Get the entry plan to start the agent.");
  }
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const { data: usage } = await admin.from("agent_usage").select("calls").eq("workspace_id", ws).eq("day", today).maybeSingle();
  if ((usage?.calls ?? 0) >= DAILY_CALLS) return fail(429, "rate_limited", "Today's agent limit is reached. It resets at midnight UTC.");
  const r = body.request ?? {};
  const messages = Array.isArray(r.messages) ? r.messages : [];
  if (!messages.length) return fail(400, "bad_request", "messages are required.");
  const pageTools = (Array.isArray(r.tools) ? r.tools : []).filter((t) => t && typeof t.name === "string" && !("type" in t)).slice(0, 48);
  const research = body.research !== false && (pageTools.length > 0 || !!body.deep);
  const loc = body.location ?? {};
  const userLocation = typeof loc.city === "string" && loc.city ? { type: "approximate", city: String(loc.city).slice(0, 80), region: String(loc.region ?? "").slice(0, 80) || void 0, country: "US" } : void 0;
  const search = { type: "web_search_20250305", name: "web_search", max_uses: 5, ...userLocation ? { user_location: userLocation } : {} };
  const fetchTool = { type: "web_fetch_20250910", name: "web_fetch", max_uses: 4, citations: { enabled: true }, max_content_tokens: 24e3 };
  const payload = {
    model: body.deep ? MODEL_DEEP : MODEL,
    max_tokens: Math.min(Math.max(Number(r.max_tokens) || 2e3, 256), 4e3),
    messages
  };
  if (typeof r.system === "string" && r.system) payload.system = r.system.slice(0, 8e4);
  const tools = [...pageTools, ...research ? [search, fetchTool] : []];
  if (tools.length) payload.tools = tools;
  if (JSON.stringify(payload).length > 8e6) return fail(413, "bad_request", "That request is too large.");
  const tier = body.deep ? "deep" : !research && !pageTools.length ? "fast" : "standard";
  const out = await callModel(
    env,
    { payload, tier, research, beta: research ? FETCH_BETA : null },
    body.deep ? MODEL_DEEP : MODEL,
    research ? { search, fetch: fetchTool, pageTools } : null
  );
  if (!out.ok) {
    console.error("models", out.model, out.status, out.text.slice(0, 300));
    const code = out.status === 429 || out.status === 529 ? "rate_limited" : out.status === 401 || out.status === 503 ? "not_configured" : "upstream_error";
    return fail(code === "rate_limited" ? 429 : 502, code, code === "rate_limited" ? "The agent is busy. Try again in a moment." : "Couldn't reach the agent's model. Try again.");
  }
  const data = out.data;
  await admin.rpc("track_usage", { ws, p_calls: 1, p_in: data.usage?.input_tokens ?? 0, p_out: data.usage?.output_tokens ?? 0, p_tts: 0 });
  return json(200, data);
});
