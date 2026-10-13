// monitor: the daily background check. Called once a day by pg_cron (migration 20261005120000) with the vault's
// monitor key, it looks at every workspace and records what changed or is coming up as updates:
//   deadlines in the next two weeks and overdue ones, renewals in the next 60 days, filing status changes from the
//   team (submitted, approved, returned, action needed) and agency fees still unpaid after two days.
// New updates show in the app's Updates; when RESEND_API_KEY and MAIL_FROM are set, owners also get them by email,
// and the Placetta team gets an email about approved filings nobody has picked up for a day.
// Mondays, with email on, each headquarters email a workspace shares with (hq_links) gets one page across every
// franchisee that shared with it: totals, then one line per store at risk. hq_reports keeps it to once a week.
// Once a week per workspace (on a weekday picked from its id, so the load spreads), it also starts the agent's
// background check (agent-run, kind "watch"): each submitted application's status on the agency's own lookup page, and
// new or changed rules for that business and city. That needs ANTHROPIC_API_KEY; WEEKLY_CHECKS=off turns it off.
// Owners who linked a phone (Settings, Text and call Odelia) also hear about what matters most there: a call for
// something urgent if they want calls, a text for what needs them this week. Those go into odelia_outbox, and
// odelia-sms sends them outside their quiet hours, at most one call and three texts a day.
import { createClient } from "npm:@supabase/supabase-js@2";
import { appLink, noticeText, urgency } from "../_shared/odelia.ts";
// @deno-types="../_shared/opening.d.ts"
import { normalizeState, openingLine, openingPath } from "../_shared/opening.js";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("MAIL_FROM") ?? "";
const APP = ((Deno.env.get("APP_ORIGINS") ?? "").split(",")[0] ?? "").trim().replace(/\/+$/, "");
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const MAX_WATCHES = Number(Deno.env.get("WEEKLY_CHECKS_PER_DAY") ?? "40");

type Bi = { en: string; zh: string };
type Deadline = { id: string; date: string; kind: "due" | "renewal" | "estimate" | "milestone"; title: Bi; app?: string };
type Update = { workspace_id: string; kind: "deadline" | "renewal" | "filing" | "payment" | "team"; title: Bi; body?: Bi; app_id?: string | null; dedupe: string };
type Filing = { id: string; workspace_id: string; app_id: string; title: Bi; status: string; agent_state?: string | null; updated_at: string; approved_at: string | null; payment_url: string | null; customer_paid_at: string | null; fee_paid: number | null; confirmation_number: string | null; assigned_to: string | null; note: string | null };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const day = (d: Date) => d.toISOString().slice(0, 10);
const daysUntil = (from: string, to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const bi = (v: unknown): Bi => (v && typeof v === "object" && "en" in v ? { en: String((v as Bi).en ?? ""), zh: String((v as Bi).zh ?? (v as Bi).en ?? "") } : { en: String(v ?? ""), zh: String(v ?? "") });
/** "expires in 12 days" / "12 天后到期", with today and tomorrow spelled out. */
const when = (n: number, en: string, zh: string): Bi => {
  const e = n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`, z = n <= 0 ? "今天" : n === 1 ? "明天" : `${n} 天后`;
  return { en: en ? `${en} ${e}` : e, zh: z + zh };
};
/** The first threshold a date has crossed, so each one makes one update: 14, 7, 3, 1 and 0 days out. */
const bucket = (n: number, steps: number[]) => steps.find((s) => n <= s);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function deadlineUpdates(ws: string, list: unknown, today: string): Update[] {
  const out: Update[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const d = raw as Deadline;
    if (!d || typeof d.id !== "string" || !isDate(d.date)) continue;
    const n = daysUntil(today, d.date), title = bi(d.title);
    if (d.kind === "renewal") {
      const b = n >= 0 ? bucket(n, [1, 7, 14, 30, 60]) : undefined;
      if (b !== undefined) out.push({ workspace_id: ws, kind: "renewal", app_id: d.app ?? null, dedupe: `renewal:${d.id}:${d.date}:${b}`,
        title: { en: `${title.en}: ${when(n, "expires", "到期").en}`, zh: `${title.zh}：${when(n, "expires", "到期").zh}` },
        body: { en: `Expires ${d.date}. Ask Placetta to start the renewal.`, zh: `${d.date} 到期。可以让快哉开始续办。` } });
    } else if (n >= 0) {
      const b = bucket(n, [0, 1, 3, 7, 14]);
      if (b !== undefined) out.push({ workspace_id: ws, kind: "deadline", app_id: d.app ?? null, dedupe: `deadline:${d.id}:${d.date}:${b}`,
        title: { en: `${title.en}: ${when(n, d.kind === "due" ? "due" : "", d.kind === "due" ? "截止" : "").en}`, zh: `${title.zh}：${when(n, d.kind === "due" ? "due" : "", d.kind === "due" ? "截止" : "").zh}` },
        body: { en: `Date: ${d.date}.`, zh: `日期：${d.date}。` } });
    } else if (d.kind === "due" && n >= -30) {
      out.push({ workspace_id: ws, kind: "deadline", app_id: d.app ?? null, dedupe: `overdue:${d.id}:${d.date}`,
        title: { en: `Overdue: ${title.en}`, zh: `已逾期：${title.zh}` }, body: { en: `It was due ${d.date}.`, zh: `截止日期为 ${d.date}。` } });
    }
  }
  return out;
}

type StorePermit = { name?: unknown; expires?: unknown };
type StoreRow = { id?: unknown; name?: unknown; stage?: unknown; permits?: unknown };

/** Every open store's permits: a renewal update at 60, 30, 14, 7 and 1 days out, and when one has lapsed. */
export function storeUpdates(ws: string, stores: unknown, today: string): Update[] {
  const out: Update[] = [];
  for (const raw of Array.isArray(stores) ? stores : []) {
    const s = raw as StoreRow;
    if (typeof s?.id !== "string") continue;
    const store = bi(s.name);
    for (const p of Array.isArray(s.permits) ? (s.permits as StorePermit[]) : []) {
      if (!p || !isDate(p.expires)) continue;
      const n = daysUntil(today, p.expires), name = bi(p.name);
      const b = n >= 0 ? bucket(n, [1, 7, 14, 30, 60]) : undefined;
      if (b !== undefined) out.push({ workspace_id: ws, kind: "renewal", dedupe: `permit:${s.id}:${name.en}:${p.expires}:${b}`,
        title: { en: `${store.en}: ${name.en} ${when(n, "expires", "到期").en}`, zh: `${store.zh}：${name.zh}${when(n, "expires", "到期").zh}` },
        body: { en: `Expires ${p.expires}. Placetta can start the renewal now.`, zh: `${p.expires} 到期。快哉现在就可以开始续办。` } });
      else if (n < 0 && n >= -30) out.push({ workspace_id: ws, kind: "renewal", dedupe: `lapsed:${s.id}:${name.en}:${p.expires}`,
        title: { en: `Lapsed: ${store.en}, ${name.en}`, zh: `已过期：${store.zh}，${name.zh}` },
        body: { en: `It expired ${p.expires}. Operating without it risks a fine or a closure.`, zh: `已于 ${p.expires} 过期。无证经营可能被罚款或停业。` } });
    }
  }
  return out;
}

/**
 * Stores still opening whose permits no longer keep the opening date (or barely do): one update each time the verdict
 * or the step holding it up changes, naming that step. A late one also reaches the owner's phone.
 */
export function openingUpdates(ws: string, state: unknown, today: string, ev: { submitted?: Record<string, string> } = {}): Update[] {
  if (!state || typeof state !== "object") return [];
  let w: ReturnType<typeof normalizeState>;
  try { w = normalizeState("", state as Record<string, unknown>); } catch { return []; }
  const out: Update[] = [];
  for (const s of Array.isArray(w.stores) ? w.stores : []) {
    if (!s || s.stage !== "opening" || typeof s.id !== "string" || !isDate(s.plannedOpen)) continue;
    let p;
    try { p = openingPath(s, w, today, ev); } catch { continue; }
    if (p.verdict !== "late" && p.verdict !== "tight") continue;
    const line = openingLine(p), store = bi(s.name);
    if (!line) continue;
    out.push({ workspace_id: ws, kind: "deadline", app_id: p.blocker?.app ?? null, dedupe: `opening:${s.id}:${p.verdict}:${p.blocker?.app ?? ""}:${p.blocker?.status ?? ""}`,
      title: { en: `${store.en}: ${line.en}`, zh: `${store.zh}：${line.zh}` },
      body: { en: `Planned opening ${s.plannedOpen}; permits in hand around ${p.landing}. Ask Odelia to catch it up.`, zh: `计划 ${s.plannedOpen} 开业；预计 ${p.landing} 前后取得全部许可。可以让 Odelia 追回进度。` } });
  }
  return out;
}

/** Monday's week ahead for one workspace: what's due in 14 days, what renews in 60, what Placetta is filing. */
export function weekAhead(ws: string, state: { deadlines?: unknown; stores?: unknown } | null, openFilings: number, today: string): Update | null {
  const dl = (Array.isArray(state?.deadlines) ? state!.deadlines as Deadline[] : []).filter((d) => d && isDate(d.date));
  const due = dl.filter((d) => d.kind !== "renewal" && daysUntil(today, d.date) >= 0 && daysUntil(today, d.date) <= 14).length;
  let renew = dl.filter((d) => d.kind === "renewal" && daysUntil(today, d.date) >= 0 && daysUntil(today, d.date) <= 60).length;
  for (const s of Array.isArray(state?.stores) ? state!.stores as StoreRow[] : [])
    for (const p of Array.isArray(s?.permits) ? s.permits as StorePermit[] : []) if (isDate(p?.expires) && daysUntil(today, p.expires) >= 0 && daysUntil(today, p.expires) <= 60) renew++;
  const stores = Array.isArray(state?.stores) ? state!.stores.length : 0;
  if (!due && !renew && !openFilings && !stores) return null;
  const week = today;   // the Monday it runs
  const parts = [due && `${due} due in the next 2 weeks`, renew && `${renew} renewal${renew === 1 ? "" : "s"} in the next 60 days`, openFilings && `${openFilings} filing${openFilings === 1 ? "" : "s"} in progress`].filter(Boolean) as string[];
  const zh = [due && `未来两周 ${due} 项到期`, renew && `未来 60 天 ${renew} 项续期`, openFilings && `${openFilings} 项申请办理中`].filter(Boolean) as string[];
  return { workspace_id: ws, kind: "deadline", dedupe: `week:${week}`,
    title: { en: `Your week: ${parts.length ? parts.join(", ") : `${stores} store${stores === 1 ? "" : "s"} all clear`}`, zh: `本周概览：${zh.length ? zh.join("，") : `${stores} 家门店一切正常`}` },
    body: { en: "Open Placetta for the full list. Placetta handles what it can and asks you only for what it can't.", zh: "打开快哉查看完整清单。快哉能办的都会办好，只在必要时请您处理。" } };
}

export function filingUpdates(f: Filing, since: string, now: number): Update[] {
  const out: Update[] = [], t = bi(f.title);
  if (f.updated_at > since) {
    const said: Record<string, [Bi, Bi | undefined]> = {
      submitted: [{ en: `Submitted to the agency: ${t.en}`, zh: `已提交至机构：${t.zh}` }, f.confirmation_number ? { en: `Confirmation ${f.confirmation_number}.`, zh: `确认号 ${f.confirmation_number}。` } : undefined],
      accepted: [{ en: `Approved by the agency: ${t.en}`, zh: `机构已批准：${t.zh}` }, { en: "The approval is in Documents when the agency sends it.", zh: "机构发来批准文件后会放在“文件”中。" }],
      rejected: [{ en: `Returned by the agency: ${t.en}`, zh: `被机构退回：${t.zh}` }, f.note ? { en: f.note, zh: f.note } : { en: "The team will tell you what to fix.", zh: "团队会告诉您需要修改什么。" }],
      needs_info: [{ en: `Action needed: ${t.en}`, zh: `需要您处理：${t.zh}` }, f.payment_url ? { en: "The agency fee is ready to pay.", zh: "机构费用可以支付了。" } : f.note ? { en: f.note, zh: f.note } : undefined],
    };
    const s = said[f.status];
    if (s) out.push({ workspace_id: f.workspace_id, kind: "filing", app_id: f.app_id, dedupe: `filing:${f.id}:${f.status}:${f.updated_at.slice(0, 10)}`, title: s[0], body: s[1] });
  }
  if (f.agent_state === "needs_you" && f.updated_at > since) {
    out.push({ workspace_id: f.workspace_id, kind: "filing", app_id: f.app_id, dedupe: `needs_you:${f.id}:${f.updated_at.slice(0, 10)}`,
      title: { en: `Placetta needs you for a step: ${t.en}`, zh: `需要您完成一步：${t.zh}` },
      body: { en: "Open the filing to finish it. Placetta carries on right after.", zh: "打开该申请完成这一步，快哉随后继续办理。" } });
  }
  if (f.status === "needs_info" && f.payment_url && !f.customer_paid_at && now - Date.parse(f.updated_at) > 2 * 864e5) {
    const week = Math.floor(now / (7 * 864e5));
    out.push({ workspace_id: f.workspace_id, kind: "payment", app_id: f.app_id, dedupe: `pay:${f.id}:${week}`,
      title: { en: `Agency fee still unpaid: ${t.en}`, zh: `机构费用尚未支付：${t.zh}` },
      body: { en: `The team submits it as soon as the fee${f.fee_paid ? ` ($${f.fee_paid})` : ""} is paid.`, zh: `费用${f.fee_paid ? `（$${f.fee_paid}）` : ""}支付后，团队会立即提交。` } });
  }
  return out;
}

/** The applications that set a workspace's opening date (critical): overdue or returned, they're urgent. */
export function criticalApps(state: unknown): Set<string> {
  const apps = ((state ?? {}) as { apps?: unknown }).apps;
  return new Set((Array.isArray(apps) ? apps : []).filter((a) => a && typeof a === "object" && (a as { critical?: unknown }).critical === true).map((a) => String((a as { id?: unknown }).id ?? "")));
}

/** The weekday (0 to 6, UTC) a workspace gets its weekly check: fixed per workspace, spread across the week. */
export function weekdayOf(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 7; }
/** Workspaces due their weekly check today: they have applications to watch, it's their weekday, and none ran in the last six days. */
export function watchDue(rows: { id: string; state: unknown }[], weekday: number, recent: Set<string>): string[] {
  return rows.filter((w) => {
    const apps = ((w.state ?? {}) as { apps?: unknown }).apps;
    return Array.isArray(apps) && apps.length > 0 && weekdayOf(w.id) === weekday && !recent.has(w.id);
  }).map((w) => w.id);
}

async function sendMail(to: string[], subject: string, text: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, text, html }),
  });
  if (!res.ok) console.error("resend", res.status, (await res.text()).slice(0, 200));
  return res.ok;
}

export function digest(business: string, items: Update[]) {
  const link = APP ? `${APP}/app/` : "";
  const lines = items.map((u) => `- ${u.title.en}${u.body ? `. ${u.body.en}` : ""}`).join("\n");
  const linesZh = items.map((u) => `- ${u.title.zh}${u.body ? `。${u.body.zh}` : ""}`).join("\n");
  const text = `${business}: ${items.length} update${items.length === 1 ? "" : "s"} from Placetta\n\n${lines}\n\n${linesZh}${link ? `\n\nOpen Placetta: ${link}` : ""}\n`;
  const li = (u: Update, lang: "en" | "zh") => `<li style="margin:0 0 10px"><b>${esc(u.title[lang])}</b>${u.body ? `<br><span style="color:#5B6470">${esc(u.body[lang])}</span>` : ""}</li>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 22px;color:#0E1116">
<p style="font-size:13px;color:#5B6470;margin:0 0 6px">Placetta</p>
<h1 style="font-size:20px;margin:0 0 18px">${esc(business)}: ${items.length} update${items.length === 1 ? "" : "s"}</h1>
<ul style="padding-left:18px;margin:0 0 18px;font-size:14px;line-height:1.5">${items.map((u) => li(u, "en")).join("")}</ul>
<ul style="padding-left:18px;margin:0 0 22px;font-size:14px;line-height:1.5">${items.map((u) => li(u, "zh")).join("")}</ul>
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#0E1116;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">Open Placetta</a></p>` : ""}
<p style="font-size:12px;color:#98A0AB;margin:22px 0 0">You get this because you own this workspace. Nothing is filed, paid or sent without your approval.</p></div>`;
  return { subject: `${business}: ${items.length} update${items.length === 1 ? "" : "s"} from Placetta`, text, html };
}

/* ------------------------------ the weekly headquarters report ------------------------------ */

type HqItem = { kind?: string; title?: unknown; date?: string };
type HqStore = { id?: string; name?: unknown; stage?: string; status?: string; due_30?: number; overdue?: number; pending?: number; next?: HqItem | null };
export type HqWeekly = { hq_email: string; workspace_id: string; name: string; brand: string | null; stores: HqStore[] | null };

/** One page for one headquarters email: totals, then each store that's overdue or due within 30 days, worst first. */
export function hqReport(rows: HqWeekly[], today: string) {
  const brands = [...new Set(rows.map((r) => r.brand).filter((b): b is string => !!b))];
  const brand = brands.length === 1 ? brands[0] : "";
  const lines = rows.flatMap((r) => (Array.isArray(r.stores) ? r.stores : []).map((s) => ({ ...s, franchisee: r.name })));
  const count = (st: string) => lines.filter((l) => l.status === st).length;
  const t = { stores: lines.length, current: count("current"), due: count("due"), overdue: count("overdue") };
  const rank = (st?: string) => (st === "overdue" ? 0 : 1);
  const risk = lines.filter((l) => l.status === "overdue" || l.status === "due")
    .sort((a, b) => rank(a.status) - rank(b.status) || String(a.next?.date ?? "9999").localeCompare(String(b.next?.date ?? "9999")));
  const say = (l: (typeof risk)[number]) => {
    const date = l.next?.date;
    const n = isDate(date) ? daysUntil(today, date) : null;
    const item = l.next ? bi(l.next.title).en || "Unnamed item" : "Item";
    const when = n === null ? "" : n < 0 ? `${-n} day${n === -1 ? "" : "s"} overdue` : n === 0 ? "due today" : `due in ${n} day${n === 1 ? "" : "s"}`;
    const more = (l.overdue ?? 0) + (l.due_30 ?? 0) - 1;
    return { where: `${l.franchisee}, ${bi(l.name).en}`, what: `${item}${date ? `, ${date}` : ""}${when ? ` (${when})` : ""}${more > 0 ? `, and ${more} more` : ""}` };
  };
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const head = `${brand ? brand + ": " : ""}${plural(t.stores, "store")}, ${t.current} fully current, ${t.due} due in 30 days, ${t.overdue} overdue`;
  const subject = `${brand ? brand + " " : ""}weekly store status: ${t.overdue ? `${t.overdue} overdue` : t.due ? `${t.due} due soon` : "all current"}`;
  const link = APP ? `${APP}/app/` : "";
  const across = `Across ${plural(rows.length, "franchisee")}, week of ${today}.`;
  const clear = "Every store is current. Nothing is due in the next 30 days.";
  const why = "You get this because a franchisee shared its store status with this email in Placetta. Ask them to remove it to stop.";
  const text = `${head}\n${across}\n\n` +
    (risk.length ? `At risk:\n${risk.map((l) => { const x = say(l); return `- ${x.where}: ${x.what}`; }).join("\n")}` : clear) +
    `${link ? `\n\nSee every store live: ${link}` : ""}\n\n${why}\n`;
  const tile = (n: number, label: string, color = "#0E1116") =>
    `<td style="padding:12px 14px;background:#F5F7FA;border-radius:12px;width:25%"><div style="font-size:24px;color:${color}">${n}</div><div style="font-size:12px;color:#5B6470">${label}</div></td>`;
  const riskRows = risk.map((l) => {
    const x = say(l);
    return `<tr><td style="padding:8px 0;border-top:1px solid #ECF0F5;vertical-align:top"><b>${esc(x.where)}</b><br><span style="color:${l.status === "overdue" ? "#C0473A" : "#A86F14"}">${esc(x.what)}</span></td></tr>`;
  }).join("");
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:28px 22px;color:#0E1116">
<p style="font-size:13px;color:#5B6470;margin:0 0 6px">Placetta for headquarters</p>
<h1 style="font-size:20px;margin:0 0 4px">${esc(brand ? `${brand}: weekly store status` : "Weekly store status")}</h1>
<p style="font-size:13px;color:#5B6470;margin:0 0 18px">${esc(across)}</p>
<table role="presentation" cellspacing="6" style="width:100%;border-collapse:separate;margin:0 0 18px"><tr>${tile(t.stores, "Stores")}${tile(t.current, "Fully current")}${tile(t.due, "Due in 30 days", t.due ? "#A86F14" : "#0E1116")}${tile(t.overdue, "Overdue", t.overdue ? "#C0473A" : "#0E1116")}</tr></table>
${risk.length ? `<h2 style="font-size:15px;margin:0 0 8px">At risk</h2><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.45">${riskRows}</table>` : `<p style="font-size:14px;margin:0">${clear}</p>`}
${link ? `<p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#0E1116;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">See every store live</a></p>` : ""}
<p style="font-size:12px;color:#98A0AB;margin:22px 0 0">${why}</p></div>`;
  return { subject, text, html };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const { data: okKey } = await admin.rpc("monitor_key_ok", { p_key: req.headers.get("x-monitor-key") ?? "" });
  if (okKey !== true) return json(401, { error: "unauthorized" });

  const started = new Date(), today = day(started), now = started.getTime();
  const { data: settings } = await admin.from("app_settings").select("monitor_last_run").maybeSingle();
  const since = (settings?.monitor_last_run as string | null) ?? new Date(now - 864e5).toISOString();

  const created: Update[] = [];
  const byWs = new Map<string, Update[]>();
  const names = new Map<string, string>();
  const all: { id: string; state: unknown }[] = [];
  const states = new Map<string, { deadlines?: unknown; stores?: unknown } | null>();
  for (let from = 0; ; from += 500) {
    const { data: rows, error } = await admin.from("workspaces").select("id, name, state").order("created_at").range(from, from + 499);
    if (error) return json(500, { error: "workspaces: " + error.code });
    for (const w of rows ?? []) {
      names.set(w.id, String(w.name ?? "Your business"));
      const st = (w.state ?? {}) as { deadlines?: unknown };
      byWs.set(w.id, [...deadlineUpdates(w.id, st.deadlines, today), ...storeUpdates(w.id, (w.state as { stores?: unknown } | null)?.stores, today)]);
      states.set(w.id, (w.state ?? null) as { deadlines?: unknown; stores?: unknown } | null);
      all.push({ id: w.id, state: { apps: (w.state as { apps?: unknown } | null)?.apps } });
    }
    if (!rows || rows.length < 500) break;
  }
  const { data: filings, error: fe } = await admin.from("filings")
    .select("id, workspace_id, app_id, title, status, agent_state, updated_at, approved_at, payment_url, customer_paid_at, fee_paid, confirmation_number, assigned_to, note, submitted_at")
    .neq("status", "canceled");
  if (fe) return json(500, { error: "filings: " + fe.code });
  for (const f of (filings ?? []) as Filing[]) byWs.get(f.workspace_id)?.push(...filingUpdates(f, since, now));
  // stores slipping past their opening date, counting each application with the agency from the day it went in
  const sent = new Map<string, Record<string, string>>();
  for (const f of (filings ?? []) as (Filing & { submitted_at?: string | null })[]) if (f.submitted_at) { const m = sent.get(f.workspace_id) ?? {}; m[f.app_id] ??= f.submitted_at; sent.set(f.workspace_id, m); }
  for (const [ws, list] of byWs) list.push(...openingUpdates(ws, states.get(ws) ?? null, today, { submitted: sent.get(ws) ?? {} }));
  // Mondays: the week ahead, for every workspace with something on it.
  if (started.getUTCDay() === 1) {
    const open = new Map<string, number>();
    for (const f of (filings ?? []) as Filing[]) if (["requested", "in_progress", "needs_info", "submitted"].includes(f.status)) open.set(f.workspace_id, (open.get(f.workspace_id) ?? 0) + 1);
    for (const [ws, list] of byWs) { const u = weekAhead(ws, states.get(ws) ?? null, open.get(ws) ?? 0, today); if (u) list.push(u); }
  }

  // Record them; the unique (workspace, dedupe) key keeps a day's run from repeating an earlier one.
  for (const [ws, list] of byWs) {
    if (!list.length) continue;
    const { data: fresh, error } = await admin.from("updates").upsert(list.map((u) => ({ ...u, app_id: u.app_id ?? null, body: u.body ?? null })), { onConflict: "workspace_id,dedupe", ignoreDuplicates: true }).select("dedupe");
    if (error) { console.error("updates insert", ws, error.code); continue; }
    const got = new Set((fresh ?? []).map((r) => r.dedupe));
    created.push(...list.filter((u) => got.has(u.dedupe)));
  }

  // Phones: urgent items become a call (or a text), important ones a text, for owners who linked a phone.
  let phoned = 0;
  const notices = created.map((u) => ({ u, level: urgency(u, criticalApps(all.find((w) => w.id === u.workspace_id)?.state)) })).filter((x) => x.level);
  if (notices.length) {
    const wsIds = [...new Set(notices.map((x) => x.u.workspace_id))];
    const { data: owners } = await admin.from("workspace_members").select("workspace_id, user_id").in("workspace_id", wsIds).eq("role", "owner");
    const ownerIds = [...new Set((owners ?? []).map((o) => o.user_id as string))];
    const { data: links } = ownerIds.length
      ? await admin.from("phone_links").select("user_id, lang, texts_on, calls_on").in("user_id", ownerIds).not("verified_at", "is", null).is("opted_out_at", null)
      : { data: [] as { user_id: string; lang: string; texts_on: boolean; calls_on: boolean }[] };
    const byUser = new Map((links ?? []).map((l) => [l.user_id as string, l]));
    const rows = [];
    for (const { u, level } of notices) {
      for (const o of (owners ?? []).filter((x) => x.workspace_id === u.workspace_id)) {
        const l = byUser.get(o.user_id as string);
        if (!l || (!l.texts_on && !(level === "urgent" && l.calls_on))) continue;
        const lang = l.lang === "zh" ? "zh" : "en";
        rows.push({ user_id: o.user_id, workspace_id: u.workspace_id, kind: level === "urgent" && l.calls_on ? "call" : "text", urgent: level === "urgent",
          body: noticeText(u, names.get(u.workspace_id) ?? "", lang), link: appLink(APP, u.workspace_id) || null, dedupe: `update:${u.workspace_id}:${u.dedupe}`.slice(0, 300) });
      }
    }
    if (rows.length) {
      const { data: queued, error } = await admin.from("odelia_outbox").upsert(rows, { onConflict: "user_id,dedupe", ignoreDuplicates: true }).select("id");
      if (error) console.error("odelia outbox", error.code); else phoned = queued?.length ?? 0;
      // Send what's outside quiet hours now rather than at the next 10-minute sweep.
      if (phoned) await fetch(`${SUPABASE_URL}/functions/v1/odelia-sms`, { method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": req.headers.get("x-monitor-key") ?? "" }, body: JSON.stringify({ action: "flush" }) }).catch(() => null);
    }
  }

  let emailed = 0, team = 0;
  if (RESEND && FROM) {
    const fresh = new Map<string, Update[]>();
    for (const u of created) fresh.set(u.workspace_id, [...(fresh.get(u.workspace_id) ?? []), u]);
    for (const [ws, items] of fresh) {
      const { data: owners } = await admin.from("workspace_members").select("user_id").eq("workspace_id", ws).eq("role", "owner");
      const emails: string[] = [];
      for (const o of owners ?? []) {
        const { data } = await admin.auth.admin.getUserById(o.user_id);
        if (data?.user?.email && data.user.email_confirmed_at) emails.push(data.user.email);
      }
      if (!emails.length) continue;
      const m = digest(names.get(ws) ?? "Your business", items.slice(0, 20));
      if (await sendMail(emails, m.subject, m.text, m.html)) emailed++;
    }
    // The team: approved filings nobody has picked up within a day.
    const stale = ((filings ?? []) as Filing[]).filter((f) => f.status === "requested" && !f.assigned_to && f.approved_at && now - Date.parse(f.approved_at) > 864e5);
    if (stale.length) {
      const { data: staff } = await admin.from("staff_emails").select("email");
      const to = (staff ?? []).map((s) => s.email as string).filter(Boolean);
      if (to.length) {
        const lines = stale.map((f) => `- ${bi(f.title).en} (${names.get(f.workspace_id) ?? f.workspace_id}), approved ${f.approved_at!.slice(0, 10)}`).join("\n");
        if (await sendMail(to, `${stale.length} approved filing${stale.length === 1 ? "" : "s"} waiting for the team`, `Nobody has picked these up yet:\n\n${lines}\n\n${APP ? `Filing queue: ${APP}/app/` : ""}`,
          `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif"><p>Nobody has picked these up yet:</p><ul>${stale.map((f) => `<li>${esc(bi(f.title).en)} (${esc(names.get(f.workspace_id) ?? "")}), approved ${f.approved_at!.slice(0, 10)}</li>`).join("")}</ul>${APP ? `<p><a href="${esc(APP)}/app/">Open the filing queue</a></p>` : ""}</div>`)) team = stale.length;
      }
    }
  }

  // Mondays: the one-page report for each headquarters email, once a week (a row in hq_reports is the claim).
  let hqSent = 0;
  if (RESEND && FROM && started.getUTCDay() === 1) {
    const { data: hq, error: he } = await admin.rpc("hq_weekly");
    if (he) console.error("hq_weekly", he.code);
    const byEmail = new Map<string, HqWeekly[]>();
    for (const r of (hq ?? []) as HqWeekly[]) byEmail.set(r.hq_email, [...(byEmail.get(r.hq_email) ?? []), r]);
    for (const [email, rows] of byEmail) {
      const { data: claim, error: ce } = await admin.from("hq_reports").upsert({ hq_email: email, week: today }, { onConflict: "hq_email,week", ignoreDuplicates: true }).select("hq_email");
      if (ce || !claim?.length) continue;   // already sent this week
      const m = hqReport(rows, today);
      if (await sendMail([email], m.subject, m.text, m.html)) hqSent++;
      else await admin.from("hq_reports").delete().eq("hq_email", email).eq("week", today);   // let a later run try again
    }
  }

  // Consent records for texts and calls are kept 5 years, then dropped.
  await admin.from("phone_consent_log").delete().lt("at", new Date(now - 5 * 365.25 * 864e5).toISOString());

  // The weekly checks: agent-run takes each one in the background and reports back as an Update when something changed.
  let watches = 0;
  if (Deno.env.get("ANTHROPIC_API_KEY") && Deno.env.get("WEEKLY_CHECKS") !== "off") {
    const { data: recent } = await admin.from("agent_runs").select("workspace_id").eq("kind", "watch").gt("created_at", new Date(now - 6 * 864e5).toISOString());
    for (const id of watchDue(all, started.getUTCDay(), new Set((recent ?? []).map((r) => r.workspace_id as string))).slice(0, MAX_WATCHES)) {
      const { data: plan } = await admin.rpc("plan_of", { ws: id });
      if (plan === "none") continue;
      // in the language the person last used with the agent
      const { data: last } = await admin.from("agent_runs").select("lang").eq("workspace_id", id).eq("kind", "task").order("created_at", { ascending: false }).limit(1);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-run`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": req.headers.get("x-monitor-key") ?? "" },
        body: JSON.stringify({ action: "watch", workspace_id: id, lang: last?.[0]?.lang === "zh" ? "zh" : "en" }),
      }).catch(() => null);
      if (res?.ok) watches++; else console.error("weekly check", id, res?.status ?? "unreachable");
    }
  }

  // Self-filing: requeue stuck runs, refresh faxes and letters on their way, flag destinations older than 90 days.
  const sweep = await fetch(`${SUPABASE_URL}/functions/v1/file`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": req.headers.get("x-monitor-key") ?? "" }, body: "{}",
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!sweep) console.error("self-filing sweep did not run");

  await admin.from("app_settings").update({ monitor_last_run: started.toISOString() }).eq("id", true);
  return json(200, { ok: true, self_filing: sweep ? { requeued: sweep.requeued, refreshed: sweep.refreshed } : null, workspaces: byWs.size, created: created.length, emailed, team_alerts: team, hq_reports: hqSent, email: !!(RESEND && FROM), weekly_checks: watches, phone_notices: phoned });
});
