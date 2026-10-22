// Mention notices out the door (migration 20261018120000_team_review): a mention, an assignment, headquarters' question
// or a reminder goes to the one person it's for, by the channel they chose. In the app it's already in their Updates
// (or on Headquarters); this sends it once more where they'll see it:
//   - a member who told Odelia "text me, don't email" and linked a phone with texts on gets a text (odelia_outbox, which
//     odelia-sms sends outside their quiet hours);
//   - otherwise an email to their confirmed address, unless they told Odelia not to email them (then the app only);
//   - a headquarters email gets an email.
// The team function sends what a person just wrote (action notify); the monitor sends the rest each morning, reminders
// on their day. Anything a week old that never went out is marked and left alone.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { mayEmail, wantsTexts } from "./reach.ts";

export type Bi = { en: string; zh: string };
export type NoticeRow = {
  id: string; workspace_id: string; kind: "mention" | "assigned" | "hq" | "reminder";
  user_id: string | null; email: string | null; title: Bi; body: Bi | null;
  item_kind: string | null; item_id: string | null; remind_on: string | null; created_at: string;
};
/** A member as the sender sees them: their address (once confirmed) and a linked phone. */
export type Person = { email: string | null; confirmed: boolean; phone: { lang: "en" | "zh"; texts: boolean } | null };
export type NoticeDb = {
  /** Unsent notices that are due (no reminder day, or the day has come), oldest first; only one person's when by is set. */
  due(o: { today: string; by?: string; limit: number }): Promise<NoticeRow[]>;
  person(userId: string): Promise<Person>;
  workspace(id: string): Promise<{ name: string; state: unknown }>;
  mark(id: string, via: "email" | "text" | "none"): Promise<void>;
};
export type NoticeOut = {
  mail(to: string, subject: string, text: string, html: string): Promise<boolean>;
  text(row: { user_id: string; workspace_id: string; body: string; link: string | null; dedupe: string }): Promise<boolean>;
};
export type Channel = "text" | "email" | "none";

const STALE_DAYS = 7;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const bi = (v: unknown): Bi => (v && typeof v === "object" ? { en: String((v as Bi).en ?? (v as Bi).zh ?? ""), zh: String((v as Bi).zh ?? (v as Bi).en ?? "") } : { en: String(v ?? ""), zh: String(v ?? "") });
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10) + "T00:00:00Z") - Date.parse(from.slice(0, 10) + "T00:00:00Z")) / 864e5);

/** How a member is reached about a notice: a text when they asked for texts and have a phone that takes them, else an
 *  email unless they said not to, else only in the app. A headquarters email (no member) is emailed. */
export function channelFor(state: unknown, uid: string | null, person: Person | null): Channel {
  if (!uid) return "email";
  if (!person) return "none";
  if (wantsTexts(state, uid) && person.phone?.texts) return "text";
  if (mayEmail(state, uid) && person.email && person.confirmed) return "email";
  if (person.phone?.texts && !mayEmail(state, uid)) return "text";
  return "none";
}

/** Where the notice opens: the workspace for a member, Headquarters for a headquarters email. */
export function noticeLink(app: string, n: Pick<NoticeRow, "workspace_id" | "user_id">): string {
  if (!app) return "";
  return n.user_id ? `${app}/app/?ws=${encodeURIComponent(n.workspace_id)}` : `${app}/app/headquarters`;
}

/** The email and the text for one notice, in English then Chinese (the text in the phone's language). */
export function noticeMessage(n: Pick<NoticeRow, "title" | "body" | "kind">, business: string, link: string, lang: "en" | "zh" = "en") {
  const title = bi(n.title), body = n.body ? bi(n.body) : null;
  const subject = `${title.en}${business ? ` (${business})` : ""}`.slice(0, 180);
  const why = n.kind === "reminder" ? "You set this reminder in Placetta." : n.kind === "assigned" ? "You were assigned this in Placetta." : "You were mentioned in Placetta.";
  const whyZh = n.kind === "reminder" ? "这是您在快哉设置的提醒。" : n.kind === "assigned" ? "有人在快哉把这项分配给了您。" : "有人在快哉提到了您。";
  const text = `${title.en}${body ? `\n\n"${body.en}"` : ""}\n\n${title.zh}${body ? `\n\n“${body.zh}”` : ""}${link ? `\n\nOpen Placetta: ${link}` : ""}\n\n${why} ${whyZh}\n`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 22px;color:#0E1116">
<p style="font-size:13px;color:#5B6470;margin:0 0 6px">Placetta${business ? `, ${esc(business)}` : ""}</p>
<h1 style="font-size:19px;margin:0 0 14px">${esc(title.en)}</h1>
${body ? `<p style="font-size:14px;line-height:1.5;margin:0 0 18px;color:#5B6470">${esc(body.en)}</p>` : ""}
<p style="font-size:14px;margin:0 0 6px">${esc(title.zh)}</p>
${link ? `<p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#0E1116;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">Open Placetta</a></p>` : ""}
<p style="font-size:12px;color:#98A0AB;margin:22px 0 0">${esc(why)} ${esc(whyZh)}</p></div>`;
  const t = lang === "zh" ? title.zh : title.en, b = body ? (lang === "zh" ? body.zh : body.en) : "";
  const sms = `${t}${b ? (lang === "zh" ? `：“${b.slice(0, 160)}”` : `: "${b.slice(0, 160)}"`) : ""}`.slice(0, 600);
  return { subject, text, html, sms };
}

/** Send what's due. Returns what happened to each kind of delivery. A notice whose send fails stays unsent for the next
 *  run; one that's been waiting more than a week is marked "none" and left in the app. */
export async function deliverNotices(db: NoticeDb, out: NoticeOut, o: { app: string; today: string; by?: string; limit?: number }) {
  const r = { emailed: 0, texted: 0, quiet: 0, stale: 0, failed: 0 };
  const rows = await db.due({ today: o.today, by: o.by, limit: o.limit ?? 200 });
  const wsCache = new Map<string, { name: string; state: unknown }>(), people = new Map<string, Person>();
  for (const n of rows) {
    const age = daysBetween(n.remind_on ?? n.created_at, o.today);
    if (age > STALE_DAYS) { await db.mark(n.id, "none"); r.stale++; continue; }
    let ws = wsCache.get(n.workspace_id);
    if (!ws) { ws = await db.workspace(n.workspace_id); wsCache.set(n.workspace_id, ws); }
    let person: Person | null = null;
    if (n.user_id) { person = people.get(n.user_id) ?? await db.person(n.user_id); people.set(n.user_id, person); }
    const via = channelFor(ws.state, n.user_id, person);
    const link = noticeLink(o.app, n);
    if (via === "none") { await db.mark(n.id, "none"); r.quiet++; continue; }
    const m = noticeMessage(n, ws.name, link, person?.phone?.lang ?? "en");
    const to = n.user_id ? person?.email ?? null : n.email;
    const sent = via === "text"
      ? await out.text({ user_id: n.user_id!, workspace_id: n.workspace_id, body: m.sms, link: link || null, dedupe: `notice:${n.id}` })
      : to ? await out.mail(to, m.subject, m.text, m.html) : false;
    if (!sent) { r.failed++; continue; }
    await db.mark(n.id, via);
    if (via === "text") r.texted++; else r.emailed++;
  }
  return r;
}

/* ---------------------------- the database, through a service-role client ---------------------------- */

/** The NoticeDb over the service-role client the team and monitor functions already have. */
export function noticeDb(admin: SupabaseClient): NoticeDb {
  return {
    async due({ today, by, limit }) {
      let q = admin.from("mention_notices").select("id, workspace_id, kind, user_id, email, title, body, item_kind, item_id, remind_on, created_at")
        .is("sent_at", null).or(`remind_on.is.null,remind_on.lte.${today}`).order("created_at", { ascending: true }).limit(limit);
      if (by) q = q.eq("created_by", by);
      const { data, error } = await q;
      if (error) { if (error.code !== "42P01" && error.code !== "PGRST205") console.error("mention_notices", error.code); return []; }
      return (data ?? []) as NoticeRow[];
    },
    async person(userId) {
      const { data } = await admin.auth.admin.getUserById(userId);
      const u = data?.user;
      const { data: link } = await admin.from("phone_links").select("lang, texts_on").eq("user_id", userId).not("verified_at", "is", null).is("opted_out_at", null).maybeSingle();
      return { email: u?.email ?? null, confirmed: !!u?.email_confirmed_at, phone: link ? { lang: link.lang === "zh" ? "zh" : "en", texts: !!link.texts_on } : null };
    },
    async workspace(id) {
      const { data } = await admin.from("workspaces").select("name, state").eq("id", id).maybeSingle();
      return { name: String(data?.name ?? ""), state: data?.state ?? {} };
    },
    async mark(id, via) {
      const { error } = await admin.from("mention_notices").update({ sent_at: new Date().toISOString(), sent_via: via }).eq("id", id);
      if (error) console.error("mention_notices mark", error.code);
    },
  };
}
/** A text through Odelia's outbox (odelia-sms sends it outside the person's quiet hours). */
export function outboxText(admin: SupabaseClient): NoticeOut["text"] {
  return async (row) => {
    const { error } = await admin.from("odelia_outbox").upsert({ ...row, kind: "text", urgent: false }, { onConflict: "user_id,dedupe", ignoreDuplicates: true });
    if (error) console.error("odelia outbox", error.code);
    return !error;
  };
}
