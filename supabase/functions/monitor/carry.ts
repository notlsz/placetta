// The monitor's carry step (_shared/carry.ts, _shared/carry_run.ts): the database and the ways out. Each morning:
//   1. portal status checks: submitted portal filings with a saved login are queued for the worker (inside the portal's
//      hours, at most once a day each, a few per portal per hour); what the worker read is acted on here;
//   2. the stale chase: past the agency's published time, an email to the agency as the business's agent, then a call;
//   3. inspections: email bookings and new times as agent, phone moves to the team, the photo self-audit.
// Every minute while one is due (pg_cron, action "outbox"): what Odelia wrote an agency goes once its undo window is over.
// CARRY=off turns all of it off; CARRY_CHASES_PER_DAY (default 20) caps the chase; PORTAL_STATUS_EVERY_HOURS (default
// 24) and PORTAL_STATUS_PER_HOST_HOUR (default 6) pace the portal checks.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { DEST, loginMatches } from "../file/destinations.ts";
import { holdMinutes } from "../file/logic.ts";
import { lineForForm } from "../_shared/agency_phones.ts";
import { mailBody, mailOutReady, sendMail } from "../_shared/mail.ts";
import { suppressedIn } from "../_shared/suppression.ts";
// @deno-types="../_shared/opening.d.ts"
import { appealFor, deadlineFor, publishedDays, TIERS } from "../_shared/opening.js";
import { readNews, type StatusRead } from "../_shared/carry.ts";
import { actOnNews, type AppLite, type CarryFiling, type CarryIO, type ChaseIO, type NewsIn, queuePortalChecks, runChases, runInspections, sendOutbox, type WsState } from "../_shared/carry_run.ts";

type Bi = { en: string; zh: string };
type Env = (k: string) => string | undefined;
export type Start = (ws: string, prompt: string, title: Bi) => Promise<string | null>;

/** The agency's time zone, from the store's state (a portal's hours are its own). */
export function tzOf(address: string): string {
  const st = / ([A-Z]{2})(?: \d{5})?(?:,|$)/.exec(address ?? "")?.[1] ?? "";
  if (["NY", "NJ", "MA", "CT", "PA", "GA", "FL", "VA", "NC", "SC", "MD", "DC", "OH", "MI"].includes(st)) return "America/New_York";
  if (["TX", "IL", "MN", "WI", "MO", "LA", "TN", "AL", "OK", "KS", "IA"].includes(st)) return "America/Chicago";
  if (["CO", "UT", "NM", "MT", "ID", "WY"].includes(st)) return "America/Denver";
  if (st === "AZ") return "America/Phoenix";
  return "America/Los_Angeles";
}
const addressOf = (st: WsState, appId: string) => (st?.stores ?? []).find((s) => Array.isArray(s?.apps) && s.apps.includes(appId))?.address ?? [st?.meta?.city, st?.meta?.region].filter(Boolean).join(", ");

/** The appeal for a denied filing: its playbook, last day and route (src/appeals, through the opening bundle). */
export function appealInfo(app: AppLite | undefined, address: string, said: string, decided: string): NewsIn["appeal"] {
  const ap = appealFor({ name: app?.name, agency: app?.agency }, address, said);
  if (!ap) return { found: false, route: null, lastDay: null, name: null };
  const dl = deadlineFor(ap.deadline, decided, ap.tz);
  return { found: true, route: TIERS[ap.id]?.route ?? null, lastDay: dl?.date ?? null, name: ap.name };
}

export function carryIO(admin: SupabaseClient, start: Start): CarryIO {
  return {
    async event(e) {
      const { data, error } = await admin.from("filing_events").upsert(e, { onConflict: "filing_id,dedupe", ignoreDuplicates: true }).select("id");
      if (error) { console.error("carry event", error.code); return false; }
      return (data ?? []).length > 0;
    },
    async update(u) {
      const { data, error } = await admin.from("updates").upsert({ ...u, app_id: u.app_id ?? null, body: u.body ?? null }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true }).select("dedupe");
      if (error) { console.error("carry update", error.code); return false; }
      return (data ?? []).length > 0;
    },
    async teamTask(filingId, ws, title, dedupe) {
      const { error } = await admin.from("team_tasks").upsert({ kind: "check_agency", filing_id: filingId, workspace_id: ws, title: title.slice(0, 500), dedupe: dedupe.slice(0, 300) }, { onConflict: "dedupe", ignoreDuplicates: true });
      if (error) console.error("carry team task", error.code);
    },
    async setStatus(f, status) {
      const { data, error } = await admin.from("filings").update({ status }).eq("id", f.id).in("status", ["submitted", "needs_info", "in_progress"]).select("id");
      if (error) { console.error("carry status", error.code); return false; }
      return (data ?? []).length > 0;
    },
    async setLicense(f, l) {
      const { error } = await admin.rpc("filing_license_set", { p_filing: f.id, p_path: l.path, p_number: l.number, p_expires: l.expires });
      if (error) console.error("carry license", error.code);
    },
    async saveState(ws, fn) {
      const { data } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
      const next = fn((data?.state ?? {}) as Record<string, unknown>);
      if (next) { const { error } = await admin.from("workspaces").update({ state: next }).eq("id", ws); if (error) console.error("carry state", error.code); }
    },
    start,
    async outbox(o, minutes) {
      const { data, error } = await admin.rpc("agency_outbox_add", { p_ws: o.workspace_id, p_filing: o.filing_id, p_kind: o.kind, p_to: o.to, p_subject: o.subject, p_body: o.body,
        p_attachments: o.attachments, p_in_reply_to: o.in_reply_to, p_minutes: minutes, p_dedupe: o.dedupe });
      if (error) throw new Error(error.message ?? error.code ?? "agency_outbox_add failed");
      return typeof data === "string" ? data : null;
    },
    async agent(ws) {
      const { data } = await admin.from("agent_authorizations").select("agent_name").eq("workspace_id", ws).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
      return data?.agent_name ? { name: String(data.agent_name) } : null;
    },
    async once(ws, key, day) {
      const { data } = await admin.from("routine_runs").upsert({ workspace_id: ws, routine_id: key.slice(0, 200), day }, { onConflict: "workspace_id,routine_id,day", ignoreDuplicates: true }).select("routine_id");
      return !!data?.length;
    },
  };
}

const COLS = "id, workspace_id, app_id, title, agency, status, channel, confirmation_number, submitted_at, decided_at, agent_auth, official:payload->>official, license_path, license_expires, note";
type Row = CarryFiling & { official?: string | null; agency?: Bi | null; note?: string | null };
const asFiling = (r: Row): CarryFiling & { agency?: Bi | null } => ({ ...r, payload: { official: r.official ?? undefined } });

/** The daily carry step. */
export async function carryDaily(admin: SupabaseClient, o: { env: Env; states: Map<string, unknown>; start: Start; today: string; now: Date; monitorKey: string; selfUrl: string }) {
  const out = { portal_queued: 0, portal_acted: 0, emailed: 0, called: 0, inspections: 0, audits: 0 };
  if (o.env("CARRY") === "off") return out;
  const io = carryIO(admin, o.start);
  const minutes = Math.max(1, holdMinutes(o.env("SEND_HOLD_MINUTES")));
  const states = o.states as Map<string, WsState>;
  const { data: rows, error } = await admin.from("filings").select(COLS).in("status", ["submitted", "needs_info", "in_progress"]).limit(2000);
  if (error) { console.error("carry filings", error.code); return out; }
  const filings = ((rows ?? []) as unknown as Row[]).map(asFiling);

  // 1. what the worker read on the agency's site, acted on
  const { data: jobs } = await admin.from("portal_status_jobs").select("id, filing_id, workspace_id, result, finished_at").eq("status", "done").is("acted_at", null).limit(200);
  for (const j of (jobs ?? []) as { id: string; filing_id: string; workspace_id: string; result: (StatusRead & { matched?: boolean; confidence?: number; license_path?: string | null; url?: string | null }) | null; finished_at: string }[]) {
    await admin.from("portal_status_jobs").update({ acted_at: new Date().toISOString() }).eq("id", j.id).is("acted_at", null);
    const r = j.result;
    const kind = r && r.matched ? readNews(r) : null;
    if (!kind) continue;
    const { data: fr } = await admin.from("filings").select(COLS).eq("id", j.filing_id).maybeSingle();
    if (!fr) continue;
    const f = asFiling(fr as unknown as Row), st = states.get(f.workspace_id) ?? null;
    const app = ((st?.apps ?? []) as AppLite[]).find((a) => a?.id === f.app_id);
    await actOnNews({ f, state: st, kind, confidence: Number(r!.confidence ?? 0.9), by: "portal", today: o.today, now: o.now.toISOString(), holdMinutes: minutes, source: "agency_page", url: r!.url ?? null,
      messageId: `portal:${j.id}`, asks: r!.asks ?? [], fee: r!.fee_usd ?? null, date: r!.inspection ?? null,
      license: kind === "approved" ? { path: r!.license_path ?? null, number: r!.license_number ?? null, expires: r!.expires ?? null } : undefined,
      appeal: kind === "denied" ? appealInfo(app, addressOf(st, f.app_id), r!.status ?? "", (f.decided_at ?? o.now.toISOString()).slice(0, 10)) : undefined }, io).catch((e) => console.error("carry portal", String(e).slice(0, 160)));
    out.portal_acted++;
  }

  // 2. queue the next portal checks
  const ids = [...new Set(filings.map((f) => f.workspace_id))];
  const logins = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("agency_logins").select("workspace_id, url").in("workspace_id", ids.slice(i, i + 200));
    for (const l of (data ?? []) as { workspace_id: string; url: string | null }[]) logins.set(l.workspace_id, [...(logins.get(l.workspace_id) ?? []), String(l.url ?? "")]);
  }
  const { data: recent } = await admin.from("portal_status_jobs").select("filing_id, queued_at").gte("queued_at", new Date(o.now.getTime() - 7 * 864e5).toISOString());
  const last = new Map<string, string>();
  for (const r of (recent ?? []) as { filing_id: string; queued_at: string }[]) if ((last.get(r.filing_id) ?? "") < r.queued_at) last.set(r.filing_id, r.queued_at);
  const tzBy = new Map(filings.map((f) => [f.id, tzOf(addressOf(states.get(f.workspace_id) ?? null, f.app_id))]));
  for (const f of filings) {
    const d = DEST[f.payload?.official ?? ""];
    if (!d?.portal) continue;
    out.portal_queued += await queuePortalChecks([f], { now: o.now, dest: () => ({ portal: d.portal, tenant: d.tenant, portalUrl: d.portalUrl, tz: tzBy.get(f.id) }),
      everyHours: Number(o.env("PORTAL_STATUS_EVERY_HOURS") ?? "24") || 24, perHostPerHour: Number(o.env("PORTAL_STATUS_PER_HOST_HOUR") ?? "6") || 6, max: 1,
      io: { hasLogin: (ws, host, tenant) => (logins.get(ws) ?? []).some((u) => loginMatches(u, { portal: host, tenant })), lastQueued: (id) => last.get(id) ?? null,
        queue: async (j) => { const { error } = await admin.from("portal_status_jobs").insert(j); if (!error) last.set(j.filing_id, o.now.toISOString()); return !error; } } });
  }

  // 3. the stale chase
  const fids = filings.filter((f) => f.status === "submitted").map((f) => f.id);
  const chaseLog = new Map<string, { step: "email" | "call"; day: string }[]>();
  const moved = new Map<string, string | null>();
  for (let i = 0; i < fids.length; i += 200) {
    const [{ data: cl }, { data: tr }] = await Promise.all([
      admin.from("agency_chases").select("filing_id, step, day").in("filing_id", fids.slice(i, i + 200)),
      admin.from("filing_tracking").select("filing_id, last_movement_at").in("filing_id", fids.slice(i, i + 200)),
    ]);
    for (const c of (cl ?? []) as { filing_id: string; step: "email" | "call"; day: string }[]) chaseLog.set(c.filing_id, [...(chaseLog.get(c.filing_id) ?? []), { step: c.step, day: c.day }]);
    for (const t of (tr ?? []) as { filing_id: string; last_movement_at: string | null }[]) moved.set(t.filing_id, t.last_movement_at);
  }
  const owners = new Map<string, string>();
  { const { data } = await admin.from("workspace_members").select("workspace_id, user_id").eq("role", "owner").in("workspace_id", ids.slice(0, 1000)); for (const m of (data ?? []) as { workspace_id: string; user_id: string }[]) if (!owners.has(m.workspace_id)) owners.set(m.workspace_id, m.user_id); }
  const chase: ChaseIO = {
    log: (id) => chaseLog.get(id) ?? [],
    claim: async (ws, id, step, day) => { const { data } = await admin.from("agency_chases").upsert({ workspace_id: ws, filing_id: id, step, day }, { onConflict: "filing_id,step,day", ignoreDuplicates: true }).select("id"); return !!data?.length; },
    release: async (id, step, day) => { await admin.from("agency_chases").delete().eq("filing_id", id).eq("step", step).eq("day", day); },
    record: async (id, step, day, r) => { await admin.from("agency_chases").update({ outbox_id: r.outbox ?? null, call_id: r.call ?? null, outcome: r.outcome ?? null }).eq("filing_id", id).eq("step", step).eq("day", day); },
    call: async (ws, id) => {
      const uid = owners.get(ws);
      if (!uid) return { ok: false, say: "no owner" };
      const res = await fetch(`${o.selfUrl}/functions/v1/odelia-voice`, { method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": o.monitorKey },
        body: JSON.stringify({ action: "agency_call", workspace_id: ws, filing_id: id, user_id: uid, lang: "en" }), signal: AbortSignal.timeout(20000) }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok?: boolean; call_id?: string; say?: { en?: string } } | null;
      return { ok: !!j?.ok, call_id: j?.call_id, say: j?.say?.en };
    },
    canCall: (f) => !!lineForForm(f.payload?.official) && !!o.env("TELNYX_API_KEY"),
    agencyEmail: (f) => DEST[f.payload?.official ?? ""]?.email?.toLowerCase() ?? null,
  };
  const ch = await runChases(filings.filter((f) => f.status === "submitted"), { states, today: o.today, holdMinutes: minutes, cap: Math.max(0, Number(o.env("CARRY_CHASES_PER_DAY") ?? "20") || 0),
    usual: (_f, app) => (app?.est ? publishedDays(app.est) : null), lastMovement: (f) => moved.get(f.id) ?? null, io, chase });
  out.emailed = ch.emailed; out.called = ch.called;

  // 4. inspections
  const byWs = new Map<string, (CarryFiling & { agency?: Bi | null })[]>();
  const { data: authed } = await admin.from("filings").select(COLS).not("agent_auth", "is", null).neq("status", "canceled").limit(2000);
  for (const f of ((authed ?? []) as unknown as Row[]).map(asFiling)) byWs.set(f.workspace_id, [...(byWs.get(f.workspace_id) ?? []), f]);
  for (const [ws, st] of states) {
    if (!Array.isArray((st as { bookings?: unknown } | null)?.bookings) || !(st as { bookings: unknown[] }).bookings.length) continue;
    const r = await runInspections(ws, st, { today: o.today, holdMinutes: minutes, io,
      emailFor: (b) => (b.email && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(b.email) ? b.email.toLowerCase() : null),
      filingFor: (b) => (byWs.get(ws) ?? []).find((f) => f.agency?.en === b.agency?.en) ?? null,
      address: (b) => (((st as { stores?: { id?: string; address?: string }[] }).stores ?? []).find((s) => s?.id === b.store)?.address ?? "") }).catch((e) => { console.error("carry inspections", ws, String(e).slice(0, 160)); return { sent: 0, audits: 0, team: 0 }; });
    out.inspections += r.sent + r.team; out.audits += r.audits;
  }
  return out;
}

/** The agency outbox, every minute while a send's undo window is over. */
export async function carryOutbox(admin: SupabaseClient, env: Env) {
  if (!mailOutReady(env)) return { sent: 0, failed: 0, ready: false };
  const r = await sendOutbox({
    claim: async (limit) => { const { data, error } = await admin.rpc("agency_outbox_claim", { p_limit: limit }); if (error) { console.error("outbox claim", error.code); return []; } return (data ?? []) as never; },
    file: async (path) => { const { data, error } = await admin.storage.from("documents").download(path); if (error || !data) return null; return { content: new Uint8Array(await data.arrayBuffer()), type: data.type || "application/octet-stream" }; },
    send: async (m) => { const b = mailBody(m.text); const res = await sendMail(env, { to: m.to, subject: m.subject, text: b.text, html: b.html, inReplyTo: m.inReplyTo, attachments: m.attachments }, fetch, suppressedIn(admin)); return { ok: res.ok, id: res.id, detail: res.ok ? undefined : String(res.detail ?? res.status) }; },
    done: async (id, ok, provider, err) => { await admin.rpc("agency_outbox_done", { p_id: id, p_ok: ok, p_provider: provider, p_error: err }); },
  });
  return { ...r, ready: true };
}
