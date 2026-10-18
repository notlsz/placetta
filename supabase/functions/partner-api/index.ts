// partner-api: the read-only Partner API (an approved partner's consenting referrals, by API key) and the embedded
// plan box partners put on their own sites (site/embed.js). The rules are in logic.ts; this file wires in the
// database (service role: every call is checked there first), the rate limit and the registry. Documented in
// docs/PARTNER_API.md. Deployed with verify_jwt = false (supabase/config.toml): it checks its own keys.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handle, type Deps, type PlanRow, type ReferralRow } from "./logic.ts";
// @ts-types="./plan.d.ts"
import { previewPlan, stateOf } from "./plan.js";

const URL_ = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const origin = (Deno.env.get("APP_ORIGINS") ?? "").split(",").map((x) => x.trim()).filter(Boolean)[0] ?? "https://placetta.com";

const deps: Deps = {
  async auth(hash) {
    const { data, error } = await admin.rpc("partner_api_auth", { p_hash: hash });
    if (error) { console.error("partner_api_auth", error.code ?? ""); return null; }
    return (data as string | null) ?? null;
  },
  async referrals(partnerId) {
    const { data, error } = await admin.rpc("partner_api_referrals", { p_partner: partnerId });
    if (error) throw new Error(`referrals failed: ${error.code ?? ""}`);
    return (data ?? []) as ReferralRow[];
  },
  async limit(key, max, windowSeconds) {
    const { data, error } = await admin.rpc("rate_hit", { p_key: key, p_limit: max, p_window_seconds: windowSeconds });
    if (error) { console.error("rate_hit", error.code ?? ""); return false; }
    return data === true;
  },
  plan(what, where) {
    if (!stateOf(where)) return null;
    return previewPlan(what, where) as unknown as { apps: PlanRow[] };
  },
  async partner(code) {
    const { data, error } = await admin.rpc("partner_lookup", { p_code: code });
    if (error) return null;
    return ((data as { org_name?: string } | null)?.org_name) ?? null;
  },
  appOrigin: origin,
};

Deno.serve(async (req) => {
  try {
    return await handle(req, deps);
  } catch (e) {
    console.error("partner-api:", (e as Error).message?.slice(0, 200));
    return new Response(JSON.stringify({ error: { code: "internal", message: "Something went wrong. Try again." } }), {
      status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json; charset=utf-8" },
    });
  }
});
