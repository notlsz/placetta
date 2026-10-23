// Odelia in Telegram: the database side shared by chat-events (messages coming in), agent-run (answers going out) and
// integrations (connecting the bot, teammates' link codes). Every function here runs with the service role, so callers
// have already decided who is asking.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import type { TelegramBot } from "./telegram.ts";

/** The workspace's connected Telegram bot from the vault, or null when there's none. */
export async function telegramBot(admin: SupabaseClient, ws: string): Promise<TelegramBot | null> {
  const { data: row } = await admin.from("integrations").select("secret_id, status").eq("workspace_id", ws).eq("kind", "telegram_bot").maybeSingle();
  if (!row?.secret_id || row.status !== "connected") return null;
  const { data: raw } = await admin.rpc("vault_get", { p_id: row.secret_id });
  let s: Record<string, unknown>;
  try { s = JSON.parse(String(raw ?? "")) as Record<string, unknown>; } catch { return null; }
  if (typeof s.bot_token !== "string" || typeof s.secret !== "string" || typeof s.bot_id !== "string" || typeof s.username !== "string") return null;
  return { kind: "telegram_bot", bot_token: s.bot_token, secret: s.secret, bot_id: s.bot_id, username: s.username };
}

/** Who a Telegram user is in this workspace: the member they're linked to and whether that person is still a member,
 *  or null when they aren't linked here (for this bot). */
export async function telegramSender(admin: SupabaseClient, ws: string, botId: string, tgUser: string): Promise<{ user_id: string; member: boolean } | null> {
  const { data, error } = await admin.rpc("telegram_sender", { p_ws: ws, p_bot: botId, p_tg_user: tgUser });
  if (error) { console.error("telegram sender", error.code ?? ""); return null; }
  const j = data as { user_id?: string; member?: boolean } | null;
  return j?.user_id ? { user_id: j.user_id, member: j.member === true } : null;
}
