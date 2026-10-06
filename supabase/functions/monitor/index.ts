// monitor: the daily background check. Called once a day by pg_cron (migration 20261005120000) with the vault's
// monitor key, it looks at every workspace and records what changed or is coming up as updates:
//   deadlines in the next two weeks and overdue ones, renewals in the next 60 days, filing status changes from the
//   team (submitted, approved, returned, action needed) and agency fees still unpaid after two days.
// New updates show in the app's Updates; when RESEND_API_KEY and MAIL_FROM are set, owners also get them by email,
// and the Placetta team gets an email about approved filings nobody has picked up for a day.
// Once a week per workspace (on a weekday picked from its id, so the load spreads), it also starts the agent's
// background check (agent-run, kind "watch"): each submitted application's status on the agency's own lookup page, and
// new or changed rules for that business and city. That needs ANTHROPIC_API_KEY; WEEKLY_CHECKS=off turns it off.
import { createClient } from "npm:@supabase/supabase-js@2";

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
type Filing = { id: string; workspace_id: string; app_id: string; title: Bi; status: string; updated_at: string; approved_at: string | null; payment_url: string | null; customer_paid_at: string | null; fee_paid: number | null; confirmation_number: string | null; assigned_to: string | null; note: string | null };

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
  if (f.status === "needs_info" && f.payment_url && !f.customer_paid_at && now - Date.parse(f.updated_at) > 2 * 864e5) {
    const week = Math.floor(now / (7 * 864e5));
    out.push({ workspace_id: f.workspace_id, kind: "payment", app_id: f.app_id, dedupe: `pay:${f.id}:${week}`,
      title: { en: `Agency fee still unpaid: ${t.en}`, zh: `机构费用尚未支付：${t.zh}` },
      body: { en: `The team submits it as soon as the fee${f.fee_paid ? ` ($${f.fee_paid})` : ""} is paid.`, zh: `费用${f.fee_paid ? `（$${f.fee_paid}）` : ""}支付后，团队会立即提交。` } });
  }
  return out;
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
  for (let from = 0; ; from += 500) {
    const { data: rows, error } = await admin.from("workspaces").select("id, name, state").order("created_at").range(from, from + 499);
    if (error) return json(500, { error: "workspaces: " + error.code });
    for (const w of rows ?? []) {
      names.set(w.id, String(w.name ?? "Your business"));
      const st = (w.state ?? {}) as { deadlines?: unknown };
      byWs.set(w.id, deadlineUpdates(w.id, st.deadlines, today));
      all.push({ id: w.id, state: { apps: (w.state as { apps?: unknown } | null)?.apps } });
    }
    if (!rows || rows.length < 500) break;
  }
  const { data: filings, error: fe } = await admin.from("filings")
    .select("id, workspace_id, app_id, title, status, updated_at, approved_at, payment_url, customer_paid_at, fee_paid, confirmation_number, assigned_to, note")
    .neq("status", "canceled");
  if (fe) return json(500, { error: "filings: " + fe.code });
  for (const f of (filings ?? []) as Filing[]) byWs.get(f.workspace_id)?.push(...filingUpdates(f, since, now));

  // Record them; the unique (workspace, dedupe) key keeps a day's run from repeating an earlier one.
  for (const [ws, list] of byWs) {
    if (!list.length) continue;
    const { data: fresh, error } = await admin.from("updates").upsert(list.map((u) => ({ ...u, app_id: u.app_id ?? null, body: u.body ?? null })), { onConflict: "workspace_id,dedupe", ignoreDuplicates: true }).select("dedupe");
    if (error) { console.error("updates insert", ws, error.code); continue; }
    const got = new Set((fresh ?? []).map((r) => r.dedupe));
    created.push(...list.filter((u) => got.has(u.dedupe)));
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

  await admin.from("app_settings").update({ monitor_last_run: started.toISOString() }).eq("id", true);
  return json(200, { ok: true, workspaces: byWs.size, created: created.length, emailed, team_alerts: team, email: !!(RESEND && FROM), weekly_checks: watches });
});
