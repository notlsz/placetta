// Business rules on the server (src/businessRules.ts holds the rules themselves): delivering what a rule asks to tell
// someone, through the business's own channels, and the monitor's morning look at deadlines. Every function here runs
// with the service role, so callers have already decided which workspace it is.
//
// A rule's message says what happened, never what a filing holds, and a rule never files, pays or sends a filing: the
// only thing that leaves here is that message.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { deadlineEvents, fire, type BrEvent, type Notice, type RuleShape } from "../../../src/businessRules.ts";
import { appLink, appOrigin, type Env } from "./odelia.ts";
import { postHook, type HookKind } from "./channels.ts";
import { wechatAccount } from "./wechat_db.ts";
import { wxSendText } from "./wechat.ts";

export type { Notice };
type Bi = { en: string; zh: string };
const isEmail = (s: unknown): s is string => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** A member of the workspace, by the email they sign in with. */
async function memberByEmail(admin: SupabaseClient, ws: string, email: string): Promise<string | null> {
  const { data: rows } = await admin.from("workspace_members").select("user_id").eq("workspace_id", ws);
  for (const r of rows ?? []) {
    const { data } = await admin.auth.admin.getUserById(r.user_id as string);
    if (data?.user?.email && data.user.email.toLowerCase() === email.toLowerCase()) return r.user_id as string;
  }
  return null;
}

export type Delivered = { ok: boolean; why?: string };

/**
 * Deliver one business rule's message. Once per rule and event, whichever run or morning check fired it: the Update it
 * leaves in the app (unique per workspace and dedupe key) is the claim, so a second delivery finds it taken.
 */
export async function deliverNotice(admin: SupabaseClient, env: Env, ws: string, n: Notice, o: { f?: typeof fetch } = {}): Promise<Delivered> {
  const f = o.f ?? fetch;
  const dedupe = `br:${n.rule}:${n.key}`.slice(0, 300);
  const { data: claim, error } = await admin.from("updates").upsert({ workspace_id: ws, kind: "agent", title: { en: "Business rule", zh: "业务规则" } satisfies Bi, body: n.text, dedupe },
    { onConflict: "workspace_id,dedupe", ignoreDuplicates: true }).select("id");
  if (error) return { ok: false, why: "claim " + (error.code ?? "") };
  if (!claim?.length) return { ok: true, why: "already delivered" };
  const link = appLink(appOrigin(env), ws);
  const both = `${n.text.en}\n${n.text.zh}${link ? `\n\n${link}` : ""}`;
  try {
    if (n.via === "email") {
      const key = env("RESEND_API_KEY"), from = env("MAIL_FROM");
      if (!key || !from) return { ok: false, why: "mail not set up" };
      if (!isEmail(n.to)) return { ok: false, why: "no address" };
      const res = await f("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [n.to], subject: n.text.en.slice(0, 140), text: both }) });
      return res.ok ? { ok: true } : { ok: false, why: "resend " + res.status };
    }
    if (n.via === "text") {
      if (!isEmail(n.to)) return { ok: false, why: "no teammate" };
      const uid = await memberByEmail(admin, ws, n.to);
      if (!uid) return { ok: false, why: "not a member" };
      const { data: l } = await admin.from("phone_links").select("lang").eq("user_id", uid).not("verified_at", "is", null).eq("texts_on", true).is("opted_out_at", null).maybeSingle();
      if (!l) return { ok: false, why: "no verified phone with texts on" };
      // through the outbox, which keeps to their quiet hours and daily limits
      const { error: e } = await admin.from("odelia_outbox").upsert({ user_id: uid, workspace_id: ws, kind: "text", urgent: false, body: (l.lang === "zh" ? n.text.zh : n.text.en).slice(0, 1000), link: link || null, dedupe },
        { onConflict: "user_id,dedupe", ignoreDuplicates: true });
      return e ? { ok: false, why: "outbox " + (e.code ?? "") } : { ok: true };
    }
    if (n.via === "slack" || n.via === "lark") {
      const { data: rows } = await admin.from("integrations").select("id, secret_id, meta").eq("workspace_id", ws).eq("kind", n.via).eq("status", "connected");
      let sent = false;
      for (const h of rows ?? []) {
        const { data: raw } = await admin.rpc("vault_get", { p_id: h.secret_id });
        let url = "", secret: string | undefined;
        try { const b = JSON.parse(String(raw ?? "")); url = b.webhook_url ?? ""; secret = b.secret || undefined; } catch { /* no saved link */ }
        if (!url) continue;
        const lang = (h.meta as { lang?: string } | null)?.lang === "zh" ? "zh" : "en";
        const r = await postHook(n.via as HookKind, url, `${n.text[lang]}${link ? `\n${link}` : ""}`, secret);
        sent ||= r.ok;
      }
      return sent ? { ok: true } : { ok: false, why: "no group linked" };
    }
    if (n.via === "wechat") {
      if (!isEmail(n.to)) return { ok: false, why: "no teammate" };
      const uid = await memberByEmail(admin, ws, n.to);
      const acct = uid ? await wechatAccount(admin, ws) : null;
      if (!uid || !acct) return { ok: false, why: "no WeChat account" };
      const { data: wl } = await admin.from("wechat_links").select("openid").eq("workspace_id", ws).eq("user_id", uid).eq("appid", acct.bot.app_id).not("linked_at", "is", null).maybeSingle();
      if (!wl?.openid) return { ok: false, why: "teammate's WeChat isn't linked" };
      const r = await wxSendText(acct.bot, String(wl.openid), n.text.zh || n.text.en, { save: acct.save, tail: link ? `\n${link}` : undefined });
      return r.ok ? { ok: true } : { ok: false, why: "wechat " + (r.errcode ?? r.problem ?? "") };
    }
  } catch (e) {
    return { ok: false, why: String((e as Error)?.message ?? e).slice(0, 120) };
  }
  return { ok: false, why: "unknown channel" };
}

type State = Record<string, unknown> & { controls?: { business?: unknown; fired?: { key: string; at: string }[] }; apps?: unknown[]; approvals?: unknown[] };

/**
 * The morning check for "a deadline is under N days away": for each workspace with such a rule, the deadlines it
 * covers fire once each. A checklist item goes onto the deadline's application in the saved workspace (only if nobody
 * saved it in between; otherwise tomorrow's check tries again), and the messages go out. Returns how many fired.
 */
export async function deadlineRules(admin: SupabaseClient, env: Env, rows: { id: string; name: string; state: unknown }[], today: string, o: { f?: typeof fetch } = {}): Promise<number> {
  let fired = 0;
  for (const row of rows) {
    const evs: BrEvent[] = deadlineEvents(row.state as never, today);
    if (!evs.length) continue;
    const { data: fresh } = await admin.from("workspaces").select("state, updated_at").eq("id", row.id).maybeSingle();
    if (!fresh?.state) continue;
    const st = fresh.state as State;
    let shape: RuleShape = { business: (st.business as Bi | undefined) ?? { en: row.name, zh: row.name }, apps: (st.apps ?? []) as RuleShape["apps"], approvals: (st.approvals ?? []) as RuleShape["approvals"], audit: [], controls: st.controls };
    const notices: Notice[] = [];
    for (const ev of evs) {
      const f = fire(shape, ev);
      if (!f.rules.length) continue;
      shape = f.patch(shape);
      notices.push(...f.notices);
    }
    if (!shape.audit.length) continue;
    const next = { ...st, apps: shape.apps, approvals: shape.approvals, controls: shape.controls };
    const { data: saved, error } = await admin.from("workspaces").update({ state: next }).eq("id", row.id).eq("updated_at", fresh.updated_at).select("id");
    if (error || !saved?.length) continue;
    fired += shape.audit.length;
    await admin.from("audit_log").insert(shape.audit.map(a => ({ workspace_id: row.id, client_id: a.id, actor: "agent", action: a.action, object: a.object, detail: a.detail ?? null })));
    for (const n of notices) {
      const r = await deliverNotice(admin, env, row.id, n, o);
      if (!r.ok) console.error("business rule", row.id, n.via, r.why);
    }
  }
  return fired;
}
