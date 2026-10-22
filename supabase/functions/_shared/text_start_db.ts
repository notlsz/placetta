// Text to start, with the database behind it: odelia-sms (SMS, iMessage, WhatsApp) and chat-events (Placetta's WeChat
// Official Account) call startForStranger for a message from someone who isn't on Placetta, and odelia-sms's sweep
// calls sendStartReminders for the one reminder people ask for. The rules themselves are in text_start.ts. Every
// function here runs with the service role. No model is called anywhere.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { appOrigin, type Env, smsCountries, smsReady } from "./odelia.ts";
import { logMessage, sendText, textingReady } from "./odelia_db.ts";
// @ts-types="./start.d.ts"
import { planForText, readPart } from "./start.js";
import { type OpenStart, reminderMayGo, reminderText, signStart, type StartChannel, type StartOut, startLink, textStart } from "./text_start.ts";
import { waWindowOpen } from "./whatsapp.ts";
import { wechatAccount } from "./wechat_db.ts";
import { wxSendText } from "./wechat.ts";

let key: string | null = null;
/** The monitor key, from the vault: the secret every claim link is signed with. */
async function monitorKey(admin: SupabaseClient): Promise<string> {
  if (!key) { const { data } = await admin.rpc("monitor_key"); key = typeof data === "string" ? data : ""; }
  return key;
}

/** The workspace whose connected WeChat Official Account is Placetta's own public one (ODELIA_PUBLIC_WECHAT_WS): its
 *  followers who aren't teammates get text to start instead of the note for strangers. */
export const publicWechatWs = (env: Env) => {
  const v = (env("ODELIA_PUBLIC_WECHAT_WS") ?? "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) ? v : null;
};
/** Text to start is on unless ODELIA_TEXT_START is "off" (then strangers get the old one-time note). */
export const textStartOn = (env: Env) => (env("ODELIA_TEXT_START") ?? "").trim().toLowerCase() !== "off";

/** One message from someone who isn't on Placetta: decides and saves (text_start.ts), and returns the one reply to
 *  send, if any. The caller sends it back the way it came. */
export async function startForStranger(admin: SupabaseClient, env: Env, o: { channel: StartChannel; handle: string; text: string; line?: string | null; now?: Date }): Promise<StartOut> {
  const now = o.now ?? new Date();
  const out = await textStart({ channel: o.channel, handle: o.handle, text: o.text, now, countries: smsCountries(env), globalPerHour: Number(env("ODELIA_START_PER_HOUR")) || undefined }, {
    // a limit the database can't check counts as reached: nothing is sent on a guess
    hit: async (k, limit, win) => { const { data, error } = await admin.rpc("rate_hit", { p_key: k, p_limit: limit, p_window_seconds: win }); return !error && data === true; },
    open: async (handle) => {
      const { data } = await admin.from("text_starts").select("id, expires_at, what, place, place_zh, lang, remind_asked_at, tz").eq("handle", handle).is("claimed_at", null)
        .gt("expires_at", now.toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return null;
      // the time of their latest message (WhatsApp lets a free reply go within 24 hours of it, WeChat within 48)
      await admin.from("text_starts").update({ last_in_at: now.toISOString() }).eq("id", data.id);
      const lang = data.lang === "zh" ? "zh" : "en";
      return { id: String(data.id), exp: Math.floor(Date.parse(String(data.expires_at)) / 1000), what: String(data.what), where: String(lang === "zh" ? data.place_zh ?? data.place : data.place), lang, remindAsked: !!data.remind_asked_at, tz: String(data.tz) } as OpenStart;
    },
    save: async (s) => {
      const { error } = await admin.from("text_starts").insert({
        id: s.id, channel: o.channel, handle: o.handle, line: o.line ?? null, lang: s.plan.line.lang, tz: s.tz, what: s.plan.line.what.slice(0, 80), place: s.plan.line.where,
        place_zh: s.plan.line.whereZh ?? null, name: s.plan.name.slice(0, 120), state: s.plan.state, permits: s.plan.facts.permits,
        created_at: now.toISOString(), expires_at: new Date(s.exp * 1000).toISOString(), last_in_at: now.toISOString(),
      });
      if (error) console.error("text start save", error.code ?? "", String(error.message ?? "").slice(0, 120));
      return !error;
    },
    remind: async (id, at) => { await admin.from("text_starts").update({ remind_at: at.toISOString(), remind_asked_at: now.toISOString() }).eq("id", id).is("remind_asked_at", null); },
    consent: async (event) => { if (o.channel !== "wechat") await admin.rpc("text_start_consent", { p_number: o.handle, p_event: event }); },
    secret: () => monitorKey(admin),
    origin: appOrigin(env),
    plan: (text, at) => planForText(text, at),
    part: (text) => readPart(text),
    parts: {
      get: async (handle) => {
        const { data } = await admin.from("text_start_parts").select("what, place").eq("handle", handle).gt("at", new Date(now.getTime() - 7 * 864e5).toISOString()).maybeSingle();
        return data ? { ...(data.what ? { what: String(data.what) } : {}), ...(data.place ? { where: String(data.place) } : {}) } : null;
      },
      set: async (handle, p) => {
        if (!p) { await admin.from("text_start_parts").delete().eq("handle", handle); return; }
        await admin.from("text_start_parts").upsert({ handle, what: p.what?.slice(0, 80) ?? null, place: p.where?.slice(0, 80) ?? null, at: now.toISOString() }, { onConflict: "handle" });
      },
    },
  });
  if (out.kind === "failed" || out.kind === "limited") console.warn("text start", out.kind, o.channel);
  return out;
}

/* ------------------------------ the one reminder ------------------------------ */

type Due = { id: string; channel: StartChannel; handle: string; line: string | null; lang: string; tz: string; what: string; place: string; place_zh: string | null; expires_at: string; last_in_at: string; remind_at: string };

/**
 * The reminders people asked for that are due, sent once each: the link again, never in quiet hours where the
 * business is, never to a number that texted STOP since, never for a plan already claimed. Rows long past their
 * expiry are cleared out here too.
 */
export async function sendStartReminders(admin: SupabaseClient, env: Env, now = new Date()): Promise<{ sent: number; skipped: number }> {
  await admin.from("text_starts").delete().lt("expires_at", new Date(now.getTime() - 30 * 864e5).toISOString()).is("claimed_at", null);
  await admin.from("text_start_parts").delete().lt("at", new Date(now.getTime() - 7 * 864e5).toISOString());
  const { data } = await admin.from("text_starts").select("id, channel, handle, line, lang, tz, what, place, place_zh, expires_at, last_in_at, remind_at")
    .lte("remind_at", now.toISOString()).is("reminded_at", null).is("claimed_at", null).gt("expires_at", now.toISOString()).limit(200);
  let sent = 0, skipped = 0;
  const origin = appOrigin(env), secret = await monitorKey(admin);
  for (const r of (data ?? []) as Due[]) {
    if (!reminderMayGo(new Date(r.remind_at), now, r.tz)) { skipped++; continue; }
    // claimed first, so a second sweep at the same moment can't send it again; it is never retried
    const { data: mine } = await admin.from("text_starts").update({ reminded_at: now.toISOString() }).eq("id", r.id).is("reminded_at", null).select("id");
    if (!mine?.length) continue;
    const lang = r.lang === "zh" ? "zh" : "en";
    const exp = Math.floor(Date.parse(r.expires_at) / 1000);
    const link = startLink(origin, await signStart(secret, r.id, exp));
    const text = reminderText({ channel: r.channel, lang, what: r.what, where: lang === "zh" ? r.place_zh ?? r.place : r.place, link, exp, tz: r.tz });
    if (r.channel === "wechat") {
      const ws = publicWechatWs(env), acct = ws ? await wechatAccount(admin, ws) : null;
      const ok = acct ? (await wxSendText(acct.bot, r.handle.slice(3), text, { save: acct.save })).ok : false;
      if (ok) sent++; else skipped++;
      continue;
    }
    if (!textingReady(env)) { skipped++; continue; }
    // a number that texted STOP (as a stranger, or after linking it) hears nothing more
    const { data: s } = await admin.from("odelia_strangers").select("opted_out_at").eq("number", r.handle).maybeSingle();
    const { data: l } = await admin.from("phone_links").select("opted_out_at").eq("number", r.handle).not("verified_at", "is", null).maybeSingle();
    if (s?.opted_out_at || l?.opted_out_at) { skipped++; continue; }
    const res = await sendText(admin, env, { to: r.handle, text, line: r.line, reply: true, smsOnly: r.channel === "sms" && smsReady(env) && !r.line,
      whatsapp: r.channel === "whatsapp" ? { open: waWindowOpen(r.last_in_at, now.getTime()), lang } : undefined });
    if (res.ok) { sent++; await logMessage(admin, { user_id: null, direction: "out", channel: "sms", kind: "system", body: "", provider_id: res.id, line: res.line, service: res.service }); }
    else { skipped++; console.error("text start reminder", res.status, res.code); }
  }
  return { sent, skipped };
}
