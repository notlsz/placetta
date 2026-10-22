// Odelia in WeChat: the database side shared by chat-events (messages coming in) and agent-run (answers going out).
// Every function here runs with the service role, so callers have already decided who is asking.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import type { WechatBot } from "./wechat.ts";

/** What the vault holds for a WeChat account: the integrations bundle shape (access_token and expires_at are WeChat's
 *  API token) plus the account's own credentials. */
export function wechatBundle(bot: WechatBot): Record<string, unknown> {
  return { access_token: bot.access_token ?? "", refresh_token: null, expires_at: bot.expires_at ?? null, token_type: "bot", app_id: bot.app_id, app_secret: bot.app_secret, token: bot.token, ...(bot.aes_key ? { aes_key: bot.aes_key } : {}) };
}

/** The workspace's connected WeChat account, and a way to save a fresh API token back to its vault secret so every
 *  instance shares it. null when there's none. */
export async function wechatAccount(admin: SupabaseClient, ws: string): Promise<{ bot: WechatBot; save: (b: WechatBot) => Promise<void> } | null> {
  const { data: row } = await admin.from("integrations").select("secret_id, status").eq("workspace_id", ws).eq("kind", "wechat_bot").maybeSingle();
  if (!row?.secret_id || row.status !== "connected") return null;
  const { data: raw } = await admin.rpc("vault_get", { p_id: row.secret_id });
  let saved: Record<string, unknown>;
  try { saved = JSON.parse(String(raw ?? "")) as Record<string, unknown>; } catch { return null; }
  if (typeof saved.app_id !== "string" || typeof saved.app_secret !== "string" || typeof saved.token !== "string") return null;
  const bot: WechatBot = {
    kind: "wechat_bot", app_id: saved.app_id, app_secret: saved.app_secret, token: saved.token,
    ...(typeof saved.aes_key === "string" && saved.aes_key ? { aes_key: saved.aes_key } : {}),
    ...(typeof saved.access_token === "string" && saved.access_token ? { access_token: saved.access_token, expires_at: Number(saved.expires_at) || null } : {}),
  };
  const secretId = row.secret_id as string;
  const save = async (b: WechatBot) => {
    const { error } = await admin.rpc("vault_put", { p_secret: JSON.stringify(wechatBundle(b)), p_name: "integration:wechat_bot", p_id: secretId });
    if (error) console.error("wechat token save", error.code ?? "");
  };
  return { bot, save };
}

/** Who a follower is in this workspace: the member their WeChat is linked to and whether they're still a member, or
 *  null when this WeChat isn't linked here. */
export async function wechatSender(admin: SupabaseClient, ws: string, appId: string, openid: string): Promise<{ user_id: string; member: boolean } | null> {
  const { data, error } = await admin.rpc("wechat_sender", { p_ws: ws, p_appid: appId, p_openid: openid });
  if (error) { console.error("wechat sender", error.code ?? ""); return null; }
  const j = data as { user_id?: string; member?: boolean } | null;
  return j?.user_id ? { user_id: j.user_id, member: j.member === true } : null;
}
