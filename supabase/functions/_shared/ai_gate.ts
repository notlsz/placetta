// The one door every AI call goes through (public.ai_gate in the database): the company's daily ceiling, rate limits
// per person and per workspace, and each workspace's budget for its plan. Then each call is priced (ai_record).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { costOf, type Usage } from "./ai_cost.ts";

export type Gate = { ok: true; event: number; tier: "full" | "reduced" } | { ok: false; code: string; message: string; status: number; retry_after?: number };

const mins = (s?: number) => { const m = Math.max(1, Math.ceil((s ?? 60) / 60)); return m >= 90 ? `${Math.round(m / 60)} hours` : `${m} minute${m === 1 ? "" : "s"}`; };
/** What the person reads when Odelia can't take more right now, and the HTTP status. */
export function refusal(code: string, retry?: number): { message: string; status: number } {
  switch (code) {
    case "over_budget": return { status: 402, message: "You've used this period's Odelia allowance. Add a pack or move up a plan to keep going. Deadlines, reminders and filings already in motion carry on." };
    case "plan_required": return { status: 402, message: "Odelia works on a paid plan. Pick a plan to start: the $299 entry plan maps every license for a market, and it is credited if a yearly plan starts within 60 days." };
    case "entry_ended": return { status: 402, message: "Your entry plan's 30 days with Odelia are over. Move to a yearly plan to keep going; your entry payment is credited if you start within 60 days of paying it." };
    case "rate_limited": return { status: 429, message: `That's a lot at once. Odelia can take more in about ${mins(retry)}.` };
    case "paused": return { status: 503, message: "Odelia is paused for a little while. Try again later." };
    default: return { status: 503, message: "Odelia can't take this right now. Try again later." };
  }
}

/** The company's ceiling on AI spend per day, from AI_DAILY_LIMIT_USD (default $100). */
export const dailyLimit = (env: (k: string) => string | undefined) => { const v = Number(env("AI_DAILY_LIMIT_USD") ?? "100"); return Number.isFinite(v) && v > 0 ? v : 100; };

export async function gate(admin: SupabaseClient, env: (k: string) => string | undefined, ws: string, uid: string | null, kind: "task" | "call"): Promise<Gate> {
  const { data, error } = await admin.rpc("ai_gate", { ws, uid, p_kind: kind, p_daily_limit: dailyLimit(env) });
  if (error || !data) { console.error("ai_gate", error?.message); return { ok: false, code: "unavailable", ...refusal("unavailable") }; }
  const g = data as { ok: boolean; event?: number; tier?: "full" | "reduced"; code?: string; retry_after?: number };
  if (g.ok) return { ok: true, event: g.event!, tier: g.tier ?? "full" };
  if (g.code === "paused") console.error("AI daily ceiling reached: every workspace is paused until midnight UTC");
  return { ok: false, code: g.code ?? "unavailable", retry_after: g.retry_after, ...refusal(g.code ?? "unavailable", g.retry_after) };
}

/** Price a call and count it. Never throws: a failed record mustn't lose the answer. */
export async function record(admin: SupabaseClient, event: number, model: string, usage: Usage | undefined): Promise<number> {
  const cost = costOf(model, usage);
  const { error } = await admin.rpc("ai_record", { p_event: event, p_cost: cost, p_model: model, p_in: usage?.input_tokens ?? 0, p_out: usage?.output_tokens ?? 0 });
  if (error) console.error("ai_record", error.message);
  return cost;
}
