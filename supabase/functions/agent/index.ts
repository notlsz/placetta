// The agent's model call, server side. The app runs the tool loop with its page tools; this function adds
// the company's Claude key, picks the model, adds research tools (web search and web fetch, so requirements
// come from the agencies' own pages with citations), enforces membership, plan and a daily limit, and logs usage.
import { createClient } from "npm:@supabase/supabase-js@2";
import { callModel, type Tier } from "../_shared/llm.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** The session's assurance level from its JWT (verified by getUser above): "aal2" after two-step sign-in. */
function aalOf(jwt: string): string {
  try {
    const part = jwt.split(".")[1] ?? "";
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof claims.aal === "string" ? claims.aal : "aal1";
  } catch { return "aal1"; }
}

/** owner, member, staff (with two-step), mfa_required, staff_mfa_required or none. Same rules as the database. */
async function accessFor(ws: string, user: { id: string; email?: string; email_confirmed_at?: string }, jwt: string): Promise<string> {
  const { data, error } = await admin.rpc("access_for", { ws, uid: user.id, p_aal: aalOf(jwt) });
  if (!error) return String(data);
  // Fail closed: only a missing function (before the teams migration) falls back, and then every member is an owner.
  if (error.code !== "PGRST202") return "none";
  const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
  if (m) return m.role === "owner" ? "owner" : "member";
  if (!user.email_confirmed_at) return "none";
  const { data: s } = await admin.from("staff_emails").select("email").eq("email", (user.email ?? "").toLowerCase()).maybeSingle();
  return s ? "staff" : "none";
}


const DAILY_CALLS = Number(Deno.env.get("AGENT_DAILY_CALLS") ?? "400");
const MODEL = Deno.env.get("AGENT_MODEL") ?? "claude-sonnet-5-5";
const MODEL_DEEP = Deno.env.get("AGENT_MODEL_DEEP") ?? "claude-opus-5-5";
const FETCH_BETA = "web-fetch-2025-09-10";

type Block = Record<string, unknown>;


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  const env = (k: string) => Deno.env.get(k);
  const KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY"];
  if (!KEYS.some((k) => env(k))) return fail(503, "not_configured", "Add a model key (for example ANTHROPIC_API_KEY) in the Edge Function secrets.");

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return fail(401, "unauthorized", "Sign in again.");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
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

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin.from("agent_usage").select("calls").eq("workspace_id", ws).eq("day", today).maybeSingle();
  if ((usage?.calls ?? 0) >= DAILY_CALLS) return fail(429, "rate_limited", "Today's agent limit is reached. It resets at midnight UTC.");

  const r = (body.request ?? {}) as Record<string, unknown>;
  const messages = Array.isArray(r.messages) ? (r.messages as Block[]) : [];
  if (!messages.length) return fail(400, "bad_request", "messages are required.");
  // The app's own tools only; server tools are added here so the client can't change their limits.
  const pageTools = (Array.isArray(r.tools) ? (r.tools as Block[]) : [])
    .filter((t) => t && typeof t.name === "string" && !("type" in t))
    .slice(0, 24);
  // Research for conversations (page tools) and deep lookups; plain extraction (reading an upload) doesn't need the web.
  const research = body.research !== false && (pageTools.length > 0 || !!body.deep);
  const loc = (body.location ?? {}) as Record<string, unknown>;
  const userLocation = typeof loc.city === "string" && loc.city
    ? { type: "approximate", city: String(loc.city).slice(0, 80), region: String(loc.region ?? "").slice(0, 80) || undefined, country: "US" }
    : undefined;
  const search = { type: "web_search_20250305", name: "web_search", max_uses: 5, ...(userLocation ? { user_location: userLocation } : {}) };
  const fetchTool = { type: "web_fetch_20250910", name: "web_fetch", max_uses: 4, citations: { enabled: true }, max_content_tokens: 24000 };

  const payload: Record<string, unknown> = {
    model: body.deep ? MODEL_DEEP : MODEL,
    max_tokens: Math.min(Math.max(Number(r.max_tokens) || 2000, 256), 4000),
    messages,
  };
  if (typeof r.system === "string" && r.system) payload.system = r.system.slice(0, 80000);
  const tools = [...pageTools, ...(research ? [search, fetchTool] : [])];
  if (tools.length) payload.tools = tools;
  // Room for one PDF of up to 4.5 MB (about 6 MB once base64-encoded) plus the conversation.
  if (JSON.stringify(payload).length > 8_000_000) return fail(413, "bad_request", "That request is too large.");

  // Cheapest capable model first: extraction runs on the fast route, conversations on the standard one, deep lookups on the deep one.
  const tier: Tier = body.deep ? "deep" : (!research && !pageTools.length) ? "fast" : "standard";
  const out = await callModel(env, { payload, tier, research, beta: research ? FETCH_BETA : null }, body.deep ? MODEL_DEEP : MODEL,
    research ? { search, fetch: fetchTool, pageTools } : null);
  if (!out.ok) {
    console.error("models", out.model, out.status, out.text.slice(0, 300));
    const code = out.status === 429 || out.status === 529 ? "rate_limited" : out.status === 401 || out.status === 503 ? "not_configured" : "upstream_error";
    return fail(code === "rate_limited" ? 429 : 502, code, code === "rate_limited" ? "The agent is busy. Try again in a moment." : "Couldn't reach the agent's model. Try again.");
  }
  const data = out.data as { usage?: { input_tokens?: number; output_tokens?: number } };
  await admin.rpc("track_usage", { ws, p_calls: 1, p_in: data.usage?.input_tokens ?? 0, p_out: data.usage?.output_tokens ?? 0, p_tts: 0 });
  return json(200, data);
});
