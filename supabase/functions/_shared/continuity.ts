// One conversation per person, wherever they write. A request by text, email, Slack, Lark, WeChat, Teams or Telegram
// starts with the same person's recent requests and Odelia's answers from every channel, in this workspace, so "and the
// sign permit?" in Slack follows on from the email they sent this morning. Copied from Intercom's unified inbox, where
// one customer's WhatsApp, email and chat are one thread (https://www.intercom.com/integrations/connectors/whatsapp).
//
// What carries where, and why:
//   - only this person's own runs, in this workspace, from the last day, never a "don't remember this chat" run
//   - a text or a call (whose sender is the easiest to forge) carries only into another text or call, never into email
//     or a chat, so a forged text can't put words in front of a run that may do more
//   - nothing is added to a run started in the app: the app has its own conversation on screen, and finished remote
//     runs already show there (src/cloud/api.ts recentRuns)
// The pieces with no database are pure, so continuity_test.ts checks them.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

export type Turn = { role: "user" | "assistant"; content: string };
export type PastRun = { channel?: string | null; prompt?: string | null; reply?: { text?: { en?: string; zh?: string }[] } | null; created_at?: string; no_memory?: boolean | null };

export const CONTINUITY_HOURS = 24;
export const CONTINUITY_RUNS = 4;
const PHONE = new Set(["sms", "voice"]);

/** Whether a request from one channel may be carried into a run from another. */
export function mayCarry(from: string | null | undefined, into: string): boolean {
  if (into === "app") return false;
  const f = from ?? "app";
  return PHONE.has(f) ? PHONE.has(into) : true;
}

const WHERE: Record<string, { en: string; zh: string }> = {
  app: { en: "in the app", zh: "在应用中" }, sms: { en: "by text", zh: "通过短信" }, voice: { en: "on a call", zh: "通过电话" }, email: { en: "by email", zh: "通过邮件" },
  slack: { en: "in Slack", zh: "在 Slack 中" }, lark: { en: "in Lark", zh: "在飞书中" }, wechat: { en: "in WeChat", zh: "在微信中" }, teams: { en: "in Teams", zh: "在 Teams 中" }, telegram: { en: "in Telegram", zh: "在 Telegram 中" },
};

/** Recent runs (newest first, as read) as conversation turns, oldest first: each request marked with where it was asked,
 *  then Odelia's answer in the person's language. Runs that may not carry, or have no answer, are left out. */
export function turnsFromRuns(rows: PastRun[], into: string, lang: "en" | "zh"): Turn[] {
  const turns: Turn[] = [];
  for (const r of rows.filter((x) => !x.no_memory && mayCarry(x.channel, into)).slice(0, CONTINUITY_RUNS).reverse()) {
    const ask = String(r.prompt ?? "").trim(), answer = (r.reply?.text ?? []).map((t) => (lang === "zh" ? t.zh || t.en : t.en || t.zh) ?? "").join("\n\n").trim();
    if (!ask || !answer) continue;
    const where = WHERE[r.channel ?? "app"] ?? WHERE.app;
    turns.push({ role: "user", content: `(${lang === "zh" ? `之前${where.zh}` : `Earlier, ${where.en}`}) ${ask.slice(0, 1500)}` });
    turns.push({ role: "assistant", content: answer.slice(0, 1500) });
  }
  return turns;
}

/** The person's recent conversation with Odelia across channels, as turns for a new run from `into`. */
export async function recentTurns(admin: SupabaseClient, ws: string, uid: string, into: string, lang: "en" | "zh", now = Date.now()): Promise<Turn[]> {
  if (into === "app") return [];
  const { data, error } = await admin.from("agent_runs").select("channel, prompt, reply, created_at, no_memory")
    .eq("workspace_id", ws).eq("created_by", uid).eq("kind", "task").eq("status", "done").is("parent_run", null)
    .gt("created_at", new Date(now - CONTINUITY_HOURS * 3600e3).toISOString()).order("created_at", { ascending: false }).limit(12);
  if (error) { console.error("continuity", error.code ?? ""); return []; }
  return turnsFromRuns((data ?? []) as PastRun[], into, lang);
}
