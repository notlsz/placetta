// The agent's model call, server side. The app runs the tool loop with its page tools; this function adds
// the company's Claude key, picks the model, adds research tools (web search and web fetch, so requirements
// come from the agencies' own pages with citations), enforces membership, plan and a daily limit, and logs usage.
import { createClient } from "npm:@supabase/supabase-js@2";

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

const DAILY_CALLS = Number(Deno.env.get("AGENT_DAILY_CALLS") ?? "400");
const MODEL = Deno.env.get("AGENT_MODEL") ?? "claude-sonnet-5-5";
const MODEL_DEEP = Deno.env.get("AGENT_MODEL_DEEP") ?? "claude-opus-5-5";
const FETCH_BETA = "web-fetch-2025-09-10";

type Block = Record<string, unknown>;

async function callClaude(key: string, payload: Record<string, unknown>, beta: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
  if (beta) headers["anthropic-beta"] = beta;
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await res.text();
  return { res, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return fail(503, "not_configured", "Set ANTHROPIC_API_KEY in the Edge Function secrets.");

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return fail(401, "unauthorized", "Sign in again.");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
  const ws = String(body.workspace_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(ws)) return fail(400, "bad_request", "workspace_id is required.");

  const [{ data: member }, { data: staff }] = await Promise.all([
    admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle(),
    admin.from("staff_emails").select("email").eq("email", (user.email ?? "").toLowerCase()).maybeSingle(),
  ]);
  if (!member && !staff) return fail(403, "forbidden", "This isn't your workspace.");

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
  const research = body.research !== false;
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
  if (JSON.stringify(payload).length > 1_500_000) return fail(413, "bad_request", "That request is too large.");

  let { res, text } = await callClaude(key, payload, research ? FETCH_BETA : null);
  // If web fetch isn't available on this account, retry with web search only.
  if (res.status === 400 && research && /web_fetch|beta/i.test(text)) {
    payload.tools = [...pageTools, search];
    ({ res, text } = await callClaude(key, payload, null));
  }
  // If search isn't enabled for the organization either, answer without research rather than failing.
  if (res.status === 400 && research && /web_search/i.test(text)) {
    payload.tools = pageTools.length ? pageTools : undefined;
    ({ res, text } = await callClaude(key, payload, null));
  }
  if (!res.ok) {
    console.error("anthropic", res.status, text.slice(0, 300));
    const code = res.status === 429 || res.status === 529 ? "rate_limited" : res.status === 401 ? "not_configured" : "upstream_error";
    return fail(code === "rate_limited" ? 429 : 502, code, code === "rate_limited" ? "Claude is busy. Try again in a moment." : "Couldn't reach Claude. Try again.");
  }
  const data = JSON.parse(text) as { usage?: { input_tokens?: number; output_tokens?: number } };
  await admin.rpc("track_usage", { ws, p_calls: 1, p_in: data.usage?.input_tokens ?? 0, p_out: data.usage?.output_tokens ?? 0, p_tts: 0 });
  return json(200, data);
});
