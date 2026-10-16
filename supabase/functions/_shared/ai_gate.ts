// The one door every AI call goes through (public.ai_gate in the database): the company's daily ceiling, rate limits
// per person and per workspace, and each workspace's budget for its plan. Then each call is priced (ai_record), with
// the role it served and the vendor that served it, so the margin and the subprocessor list can both be proven.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { costOf, type Usage } from "./ai_cost.ts";
import { providerOf, type Role } from "./llm.ts";

export type Gate =
  | { ok: true; event: number; tier: "full" | "reduced"; /** why reduced: past 60% of the allowance, or throttled for the day */ reason?: "allowance" | "throttle"; period_end: string | null; used_pct: number }
  | { ok: false; code: string; message: string; status: number; retry_after?: number };

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
/** One workspace's ceiling per day before it's put in saver mode for the rest of the day, from AI_WS_DAILY_LIMIT_USD (default $10). */
export const wsDailyLimit = (env: (k: string) => string | undefined) => { const v = Number(env("AI_WS_DAILY_LIMIT_USD") ?? "10"); return Number.isFinite(v) && v > 0 ? v : 10; };

export async function gate(admin: SupabaseClient, env: (k: string) => string | undefined, ws: string, uid: string | null, kind: "task" | "call"): Promise<Gate> {
  const { data, error } = await admin.rpc("ai_gate", { ws, uid, p_kind: kind, p_daily_limit: dailyLimit(env) });
  if (error || !data) { console.error("ai_gate", error?.message); return { ok: false, code: "unavailable", ...refusal("unavailable") }; }
  const g = data as { ok: boolean; event?: number; tier?: "full" | "reduced"; reason?: "allowance" | "throttle"; code?: string; retry_after?: number; budget?: { period_end?: string | null; used_usd?: number; limit_usd?: number } };
  if (g.ok) {
    const used = Number(g.budget?.used_usd ?? 0), limit = Number(g.budget?.limit_usd ?? 0);
    return { ok: true, event: g.event!, tier: g.tier ?? "full", reason: g.tier === "reduced" ? g.reason ?? "allowance" : undefined, period_end: g.budget?.period_end ?? null, used_pct: limit > 0 ? Math.min(100, Math.round(100 * used / limit)) : 100 };
  }
  if (g.code === "paused") console.error("AI daily ceiling reached: every workspace is paused until midnight UTC");
  return { ok: false, code: g.code ?? "unavailable", retry_after: g.retry_after, ...refusal(g.code ?? "unavailable", g.retry_after) };
}

/** Price a call and count it, with the role it served and the vendor that answered. Never throws: a failed record mustn't lose the answer. */
export async function record(admin: SupabaseClient, event: number, model: string, usage: Usage | undefined, role?: Role): Promise<number> {
  const cost = costOf(model, usage);
  const { error } = await admin.rpc("ai_record", { p_event: event, p_cost: cost, p_model: model, p_in: usage?.input_tokens ?? 0, p_out: usage?.output_tokens ?? 0, p_role: role ?? null, p_provider: providerOf(model) || null });
  if (error) console.error("ai_record", error.message);
  return cost;
}

/** Once per period: true the first time a workspace in saver mode is asked, so the person is told once, not on every reply. */
export async function saverNoticeDue(admin: SupabaseClient, ws: string): Promise<boolean> {
  const { data, error } = await admin.rpc("ai_saver_told", { ws });
  if (error) { console.error("ai_saver_told", error.message); return false; }
  return data === true;
}

/** The saver-mode line for a reply footer, in the person's language: until the allowance renews, or for the rest of the day when throttled. */
export function saverLine(lang: "en" | "zh", periodEnd: string | null, reason: "allowance" | "throttle" = "allowance"): string {
  if (reason === "throttle") return lang === "zh" ? "今天用量异常偏高，今日剩余时间为节省模式。" : "Running in saver mode for the rest of today after unusually heavy use.";
  const d = periodEnd ? new Date(periodEnd) : null;
  const ok = d && !Number.isNaN(d.getTime());
  if (lang === "zh") return ok ? `目前为节省模式，额度将于 ${d!.getUTCFullYear()} 年 ${d!.getUTCMonth() + 1} 月 ${d!.getUTCDate()} 日重置。` : "目前为节省模式，直到额度重置。";
  const when = ok ? d!.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : "";
  return when ? `Running in saver mode until your allowance renews on ${when}.` : "Running in saver mode until your allowance renews.";
}
