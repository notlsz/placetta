/* ------------------------------------------------------------------ *
 * Preview backend: the real signed-in app, running against a stand-in
 * for Supabase that lives in this browser. Built only for the artifact
 * preview (VITE_PREVIEW), where the page can't reach any server.
 *
 * Sign in with any email; the code is always 123456. Emails ending in
 * @placetta.com are the Placetta team (filing queue, after two-step).
 * Data is kept in this browser's storage when it's available.
 * ------------------------------------------------------------------ */

import { UPDATED } from "../legal";

export const PREVIEW_CODE = "123456";

type Row = Record<string, unknown> & { id?: string | number };
type Db = {
  users: { id: string; email: string; created_at: string }[];
  factors: { id: string; user_id: string; status: "verified" | "unverified" }[];
  sessions: Record<string, { user_id: string; aal: string }>;   // refresh token -> session
  tables: Record<string, Row[]>;
  blobs: Record<string, string>;                                  // storage path -> data URL
  passwords: Record<string, string>;                              // login id -> password
};

const KEY = "placetta-preview-db";
const fresh = (): Db => ({ users: [], factors: [], sessions: {}, tables: {}, blobs: {}, passwords: {} });
let db: Db = (() => { try { const s = localStorage.getItem(KEY); if (s) return { ...fresh(), ...JSON.parse(s) } as Db; } catch { /* no storage */ } return fresh(); })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* full or blocked: keep it in memory */ } };
export function resetPreview() { db = fresh(); save(); try { for (const k of Object.keys(localStorage)) if (k.startsWith("sb-")) localStorage.removeItem(k); } catch { /* blocked */ } }

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (+c ^ (Math.random() * 16) >> (+c / 4)).toString(16)));
const now = () => new Date().toISOString();
const t = (name: string) => (db.tables[name] ??= []);
const b64 = (o: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function userOf(id: string) { return db.users.find(u => u.id === id)!; }
function publicUser(id: string) {
  const u = userOf(id);
  return { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.created_at, phone: "", app_metadata: { provider: "email" },
    user_metadata: {}, identities: [], created_at: u.created_at, updated_at: now(), factors: db.factors.filter(f => f.user_id === id).map(f => ({ id: f.id, factor_type: "totp", status: f.status, friendly_name: "Authenticator", created_at: now(), updated_at: now() })) };
}
function session(user_id: string, aal = "aal1") {
  const refresh = uuid();
  db.sessions[refresh] = { user_id, aal }; save();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: user_id, email: userOf(user_id).email, role: "authenticated", aud: "authenticated", aal, amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }], session_id: refresh, exp })}.preview`;
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: refresh, user: publicUser(user_id) };
}
function claims(req: Request): { sub: string; aal: string; sid: string } | null {
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  try { const p = JSON.parse(decodeURIComponent(escape(atob(m[1].split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))))); return p.sub ? { sub: p.sub, aal: p.aal ?? "aal1", sid: p.session_id } : null; } catch { return null; }
}

/* the same rules as the database */
const twoStepOn = (uid: string) => db.factors.some(f => f.user_id === uid && f.status === "verified");
const mfaOk = (c: { sub: string; aal: string }) => c.aal === "aal2" || !twoStepOn(c.sub);
const staffEmail = (uid: string) => userOf(uid)?.email.toLowerCase().endsWith("@placetta.com");
const isStaff = (c: { sub: string; aal: string }) => staffEmail(c.sub) && c.aal === "aal2";
const roleIn = (ws: string, uid: string) => t("workspace_members").find(m => m.workspace_id === ws && m.user_id === uid)?.role as string | undefined;
const isMember = (ws: string, c: { sub: string; aal: string }) => !!roleIn(ws, c.sub) && mfaOk(c);
const isOwner = (ws: string, c: { sub: string; aal: string }) => roleIn(ws, c.sub) === "owner" && mfaOk(c);
const canSee = (ws: unknown, c: { sub: string; aal: string }) => isMember(String(ws), c) || isStaff(c);

function audit(ws: string, uid: string | null, actor: string, en: string, zh: string, object: { en: string; zh: string }) {
  const rows = t("audit_log");
  rows.push({ id: rows.length + 1, workspace_id: ws, client_id: null, actor, actor_id: uid, action: { en, zh }, object, detail: null, created_at: now() });
}

const json = (body: unknown, status = 200) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const pgErr = (message: string, code = "P0001", status = 400) => json({ code, message, details: null, hint: null }, status);
const fnErr = (code: string, message: string, status = 400) => json({ error: { code, message } }, status);

function filterRows(rows: Row[], q: URLSearchParams) {
  let out = rows;
  for (const [k, v] of q) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (v.startsWith("eq.")) out = out.filter(r => String(r[k]) === v.slice(3));
    if (v.startsWith("is.null")) out = out.filter(r => r[k] == null);
  }
  const ord = q.get("order");
  if (ord) { const [col, dir] = ord.split("."); out = [...out].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1)); }
  const lim = q.get("limit"); if (lim) out = out.slice(0, +lim);
  return out;
}

const PLAN_SET: Record<string, Row> = { entry: { entry_markets: 1, entry_paid_at: now() }, starter: { subscription_status: "active", subscription_plan: "starter" }, growth: { subscription_status: "active", subscription_plan: "growth" } };

async function rpc(fn: string, body: Record<string, unknown>, c: { sub: string; aal: string } | null): Promise<Response> {
  if (!c) return pgErr("Sign in first.", "42501", 401);
  const ws = String(body.ws ?? "");
  switch (fn) {
    case "pin_status": case "pin_set": case "pin_unlock": case "pin_clear": case "pin_lock": {
      const pins = (db.tables.account_pins ??= []) as { user_id: string; pin: string; fails: number; locked_until: string | null; unlocked_until: string | null }[];
      const later = (m: number) => new Date(Date.now() + m * 6e4).toISOString();
      let r = pins.find(x => x.user_id === c.sub);
      const status = () => { const x = (db.tables.account_pins as typeof pins).find(y => y.user_id === c.sub); return json({ on: !!x, unlocked_until: x?.unlocked_until && x.unlocked_until > now() ? x.unlocked_until : null, locked_until: x?.locked_until && x.locked_until > now() ? x.locked_until : null }); };
      const check = (pin: unknown): Response | null => {
        if (!r) return null;
        if (r.locked_until && r.locked_until > now()) return json({ code: "P0001", message: "pin_locked", hint: r.locked_until, details: null }, 400);
        if (String(pin ?? "") === r.pin) { Object.assign(r, { fails: 0, locked_until: null, unlocked_until: later(15) }); save(); return null; }
        r.fails += 1;
        if (r.fails >= 5) { Object.assign(r, { fails: 0, locked_until: later(15), unlocked_until: null }); save(); return json({ code: "P0001", message: "pin_locked", hint: r.locked_until, details: null }, 400); }
        save(); return json({ code: "P0001", message: "pin_wrong", hint: String(5 - r.fails), details: null }, 400);
      };
      if (fn === "pin_status") return status();
      if (fn === "pin_lock") { if (r) { r.unlocked_until = null; save(); } return status(); }
      if (fn === "pin_set") {
        if (!/^\d{6}$/.test(String(body.p_pin ?? ""))) return pgErr("pin_format");
        const bad = check(body.p_current); if (bad) return bad;
        if (r) Object.assign(r, { pin: String(body.p_pin), fails: 0, locked_until: null, unlocked_until: later(15) });
        else pins.push(r = { user_id: c.sub, pin: String(body.p_pin), fails: 0, locked_until: null, unlocked_until: later(15) });
        save(); return status();
      }
      const bad = check(body.p_pin); if (bad) return bad;
      if (fn === "pin_clear") { db.tables.account_pins = pins.filter(x => x.user_id !== c.sub); save(); }
      return status();
    }
    case "phone_status": case "phone_link_start": case "phone_link_confirm": case "phone_link_remove": case "phone_prefs": {
      // Text and call Odelia, in this browser: the code is always 123456, and nothing is really texted.
      if (!mfaOk(c)) return pgErr("mfa_required");
      type Link = { user_id: string; number: string; verified_at: string | null; texts_on: boolean; calls_on: boolean; quiet_start: string; quiet_end: string; tz: string; lang: "en" | "zh"; code_until: string | null; tries: number };
      const links = (db.tables.phone_links ??= []) as unknown as Link[];
      const log = (db.tables.odelia_messages ??= []) as Row[];
      let l = links.find(x => x.user_id === c.sub);
      const later = (m: number) => new Date(Date.now() + m * 6e4).toISOString();
      const status = (extra: Record<string, unknown> = {}) => json({
        link: l ? { number: l.number, verified: !!l.verified_at, verified_at: l.verified_at, texts_on: l.texts_on, calls_on: l.calls_on, quiet_start: l.quiet_start, quiet_end: l.quiet_end,
          tz: l.tz, lang: l.lang, opted_out: false, last_error: null, code_pending: !l.verified_at && !!l.code_until && l.code_until > now() } : null,
        log: log.filter(m => m.user_id === c.sub).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || Number(b.id) - Number(a.id)).slice(0, 30)
          .map(m => ({ id: m.id, direction: m.direction, channel: m.channel, kind: m.kind, body: m.body, created_at: m.created_at })),
        ...extra,
      });
      const note = (direction: "in" | "out", kind: string, body: string) => log.push({ id: log.length + 1, user_id: c.sub, direction, channel: "sms", kind, body, created_at: now() });
      if (fn === "phone_status") return status();
      if (fn === "phone_link_start") {
        const p = ((db.tables.account_pins ?? []) as { user_id: string; unlocked_until: string | null }[]).find(x => x.user_id === c.sub);
        if (p && !(p.unlocked_until && p.unlocked_until > now())) return pgErr("pin_required");
        const n = String(body.p_number ?? "");
        if (!/^\+[1-9]\d{7,14}$/.test(n)) return pgErr("phone_format");
        if (links.some(x => x.number === n && x.verified_at && x.user_id !== c.sub)) return pgErr("phone_taken");
        const lang = body.p_lang === "zh" ? "zh" : "en";
        if (!l) links.push(l = { user_id: c.sub, number: n, verified_at: null, texts_on: true, calls_on: false, quiet_start: "21:00", quiet_end: "08:00", tz: String(body.p_tz || "America/Los_Angeles"), lang, code_until: null, tries: 0 });
        else if (l.number !== n) Object.assign(l, { number: n, verified_at: null });
        Object.assign(l, { code_until: later(10), tries: 0, lang });
        note("out", "code", lang === "zh" ? `已发送验证码（预览中验证码为 ${PREVIEW_CODE}）` : `Sent a verification code (in the preview it's ${PREVIEW_CODE})`);
        save(); return status();
      }
      if (fn === "phone_link_confirm") {
        if (!l) return pgErr("phone_none");
        if (l.verified_at) return status();
        if (!l.code_until || l.code_until <= now()) return status({ error: "code_expired" });
        if (l.tries >= 5) return status({ error: "code_locked" });
        if (String(body.p_code ?? "").replace(/\D/g, "") !== PREVIEW_CODE) { l.tries++; save(); return status({ error: l.tries >= 5 ? "code_locked" : "code_wrong" }); }
        Object.assign(l, { verified_at: now(), code_until: null });
        note("out", "system", l.lang === "zh" ? "您好，我是快哉的 Odelia。保存这个号码，有任何执照、许可或截止日期的问题都可以发短信或打电话给我。回复 STOP 退订。" : "Hi, it's Odelia from Placetta. Save this number and text or call me anytime about your licenses, permits and deadlines. Reply STOP to opt out.");
        save(); return status();
      }
      if (fn === "phone_link_remove") { db.tables.phone_links = links.filter(x => x.user_id !== c.sub) as unknown as Row[]; l = undefined; save(); return status(); }
      if (!l) return pgErr("phone_none");
      const hm = (v: unknown) => v == null || (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
      if (!hm(body.p_quiet_start) || !hm(body.p_quiet_end)) return pgErr("time_format");
      Object.assign(l, {
        texts_on: typeof body.p_texts === "boolean" ? body.p_texts : l.texts_on, calls_on: typeof body.p_calls === "boolean" ? body.p_calls : l.calls_on,
        quiet_start: body.p_quiet_start ?? l.quiet_start, quiet_end: body.p_quiet_end ?? l.quiet_end, tz: body.p_tz ?? l.tz, lang: body.p_lang === "zh" || body.p_lang === "en" ? body.p_lang : l.lang,
      });
      save(); return status();
    }
    case "terms_status": case "accept_terms": {
      // Clickwrap records, as in supabase/migrations/20261013060000_terms_acceptance.sql: only the current version is accepted.
      const rows = t("terms_acceptances");
      const status = () => {
        const mine = rows.filter(r => r.user_id === c.sub);
        const last = mine.filter(r => r.doc === "terms").sort((x, y) => String(y.accepted_at).localeCompare(String(x.accepted_at)) || Number(y.id) - Number(x.id))[0];
        const has = (doc: string) => mine.some(r => r.doc === doc && r.version === UPDATED);
        return json({ accepted: has("terms") && has("privacy"), version: (last?.version as string | undefined) ?? null, current: UPDATED });
      };
      if (fn === "terms_status") return status();
      if (body.p_version !== UPDATED) return json({ code: "P0001", message: "terms_version", details: "These terms have been updated. Reload to read the current version.", hint: UPDATED }, 400);
      const w = body.p_workspace == null ? null : String(body.p_workspace);
      if (w && !roleIn(w, c.sub)) return pgErr("Not your workspace.", "42501", 403);
      for (const doc of ["terms", "privacy"]) {
        if (rows.some(r => r.user_id === c.sub && r.doc === doc && r.version === UPDATED && (r.workspace_id ?? null) === w)) continue;
        rows.push({ id: rows.length + 1, user_id: c.sub, workspace_id: w, doc, version: UPDATED, accepted_at: now(), ip: null, user_agent: navigator.userAgent });
      }
      save(); return status();
    }
    case "whoami": return json({ id: c.sub, email: userOf(c.sub).email, staff: isStaff(c), staff_email: staffEmail(c.sub), two_step: twoStepOn(c.sub), aal: c.aal });
    case "my_workspaces":
      if (!mfaOk(c)) return json([]);
      return json(t("workspace_members").filter(m => m.user_id === c.sub).map(m => ({ ...t("workspaces").find(w => w.id === m.workspace_id), role: m.role })).filter(w => w.id));
    case "accept_invites": {
      if (!mfaOk(c)) return json(0);
      const email = userOf(c.sub).email.toLowerCase(); let n = 0;
      for (const i of t("workspace_invites")) {
        if (i.email !== email || i.accepted_at || i.revoked_at) continue;
        if (!roleIn(String(i.workspace_id), c.sub)) t("workspace_members").push({ workspace_id: i.workspace_id, user_id: c.sub, role: i.role, created_at: now() });
        i.accepted_at = now(); audit(String(i.workspace_id), c.sub, "you", "Joined the workspace", "加入了工作区", { en: email, zh: email }); n++;
      }
      save(); return json(n);
    }
    case "create_workspace": {
      if (!body.p_authorized) return pgErr("Authorize Placetta to prepare and submit the filings you approve first.");
      const id = uuid(), name = String(body.p_name).slice(0, 120);
      t("workspaces").push({ id, name, state: body.p_state ?? {}, authorized_at: now(), created_at: now() });
      t("workspace_members").push({ workspace_id: id, user_id: c.sub, role: "owner", created_at: now() });
      t("terms_acceptances").push({ id: t("terms_acceptances").length + 1, user_id: c.sub, workspace_id: id, doc: "authorization", version: UPDATED, accepted_at: now(), ip: null, user_agent: navigator.userAgent });
      t("billing").push({ workspace_id: id, entry_markets: 0, entry_paid_at: null, subscription_status: null, subscription_plan: null, current_period_end: null, comped: false, stripe_customer_id: null });
      audit(id, c.sub, "you", "Created the workspace and authorized Placetta to prepare and submit the filings you approve", "创建工作区，并授权快哉准备和提交您批准的申请", { en: name, zh: name });
      save(); return json(id);
    }
    case "team_list": {
      if (!canSee(ws, c)) return pgErr("Not your workspace.");
      const owner = isOwner(ws, c) || isStaff(c);
      return json({
        me: roleIn(ws, c.sub) ?? null,
        members: t("workspace_members").filter(m => m.workspace_id === ws).map(m => ({ user_id: m.user_id, email: userOf(String(m.user_id)).email, role: m.role, joined_at: m.created_at ?? now(), you: m.user_id === c.sub, two_step: twoStepOn(String(m.user_id)) })),
        invites: owner ? t("workspace_invites").filter(i => i.workspace_id === ws && !i.accepted_at && !i.revoked_at) : [],
      });
    }
    case "set_member_role": {
      if (!isOwner(ws, c)) return pgErr("Only an owner can change roles.");
      const m = t("workspace_members").find(x => x.workspace_id === ws && x.user_id === body.p_user); if (!m) return pgErr("They're not on this workspace.");
      if (m.role === "owner" && body.p_role !== "owner" && t("workspace_members").filter(x => x.workspace_id === ws && x.role === "owner").length <= 1) return pgErr("Add another owner first. A workspace needs one.");
      m.role = body.p_role; audit(ws, c.sub, "you", body.p_role === "owner" ? "Made an owner" : "Made a member", body.p_role === "owner" ? "设为所有者" : "设为成员", { en: userOf(String(m.user_id)).email, zh: userOf(String(m.user_id)).email });
      save(); return json(null);
    }
    case "remove_member": {
      const self = body.p_user === c.sub;
      if (!(isOwner(ws, c) || (self && isMember(ws, c)))) return pgErr("Only an owner can remove people.");
      const m = t("workspace_members").find(x => x.workspace_id === ws && x.user_id === body.p_user); if (!m) return pgErr("They're not on this workspace.");
      if (m.role === "owner" && t("workspace_members").filter(x => x.workspace_id === ws && x.role === "owner").length <= 1) return pgErr("Add another owner first. A workspace needs one.");
      db.tables.workspace_members = t("workspace_members").filter(x => x !== m);
      audit(ws, c.sub, "you", self ? "Left the workspace" : "Removed from the workspace", self ? "离开了工作区" : "移出了工作区", { en: userOf(String(m.user_id)).email, zh: userOf(String(m.user_id)).email });
      save(); return json(null);
    }
    case "revoke_invite": {
      const i = t("workspace_invites").find(x => x.id === body.p_id && !x.accepted_at && !x.revoked_at); if (!i) return pgErr("That invite is gone.");
      if (!isOwner(String(i.workspace_id), c)) return pgErr("Only an owner can cancel invites.");
      i.revoked_at = now(); audit(String(i.workspace_id), c.sub, "you", "Canceled an invite", "取消了邀请", { en: String(i.email), zh: String(i.email) });
      save(); return json(null);
    }
    case "filing_queue_v2": {
      if (!isStaff(c)) return pgErr("Placetta team only.");
      const order = ["requested", "in_progress", "needs_info", "submitted"];
      return json(t("filings").map((f): Row => ({ ...f, business: t("workspaces").find(w => w.id === f.workspace_id)?.name ?? "", approver_email: userOf(String(f.approved_by))?.email ?? null, assignee_email: f.assigned_to ? userOf(String(f.assigned_to))?.email ?? null : null }))
        .sort((a, b) => ((order.indexOf(String(a.status)) + 5) % 9) - ((order.indexOf(String(b.status)) + 5) % 9)));
    }
    case "team_tasks_open": {
      if (!isStaff(c)) return pgErr("Placetta team only.");
      // Two clearly labeled examples the first time, so the team's section shows in the preview.
      if (!db.tables.team_tasks) {
        const ws = t("workspaces")[0];
        db.tables.team_tasks = [
          { id: uuid(), kind: "handoff", filing_id: null, workspace_id: ws?.id ?? null, title: "Self-filing isn't on for this agency yet. The Placetta team submits it. (preview example)", detail: null, created_at: now(), done_at: null },
          { id: uuid(), kind: "destination_stale", filing_id: null, workspace_id: null, title: "Re-check NYC DOHMH destinations (last checked 2026-07-01) on nyc.gov (preview example)", detail: null, created_at: now(), done_at: null },
        ];
        save();
      }
      return json(t("team_tasks").filter(x => !x.done_at).map((x): Row => ({ ...x, business: t("workspaces").find(w => w.id === x.workspace_id)?.name ?? null })));
    }
    case "finish_team_task": {
      if (!isStaff(c)) return pgErr("Placetta team only.");
      const x = t("team_tasks").find(y => y.id === body.p_id); if (x && !x.done_at) { x.done_at = now(); save(); }
      return json(null);
    }
    case "hq_share": {
      if (!isOwner(ws, c)) return pgErr("Only an owner can share with headquarters.");
      const email = String(body.p_email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return pgErr("Enter a valid email address.");
      const brand = String(body.p_brand ?? "").trim().slice(0, 120) || null;
      const open = t("hq_links").find(l => l.workspace_id === ws && l.hq_email === email && !l.revoked_at);
      if (open) { open.brand = brand; save(); return json(open.id); }
      if (t("hq_links").filter(l => l.workspace_id === ws && !l.revoked_at).length >= 10) return pgErr("Up to 10 headquarters emails per workspace. Remove one first.");
      const id = uuid();
      t("hq_links").push({ id, workspace_id: ws, hq_email: email, brand, created_by: c.sub, created_at: now(), revoked_at: null });
      audit(ws, c.sub, "you", "Shared store status with headquarters", "与总部共享门店状态", { en: email, zh: email });
      save(); return json(id);
    }
    case "hq_unshare": {
      const l = t("hq_links").find(x => x.id === body.p_id && !x.revoked_at); if (!l) return pgErr("That link is gone.");
      if (!isOwner(String(l.workspace_id), c)) return pgErr("Only an owner can stop sharing with headquarters.");
      l.revoked_at = now(); audit(String(l.workspace_id), c.sub, "you", "Stopped sharing store status with headquarters", "停止与总部共享门店状态", { en: String(l.hq_email), zh: String(l.hq_email) });
      save(); return json(null);
    }
    case "hq_links_for": {
      if (!isMember(ws, c)) return pgErr("Not your workspace.");
      return json(t("hq_links").filter(l => l.workspace_id === ws && !l.revoked_at).map(l => ({ id: l.id, hq_email: l.hq_email, brand: l.brand, created_at: l.created_at })));
    }
    case "hq_stores": {
      if (!mfaOk(c)) return json([]);
      const email = userOf(c.sub).email.toLowerCase();
      return json(t("hq_links").filter(l => l.hq_email === email && !l.revoked_at).flatMap(l => {
        const w = t("workspaces").find(x => x.id === l.workspace_id);
        return w ? [{ workspace_id: w.id, name: w.name, brand: l.brand ?? null, stores: hqSummary((w.state ?? {}) as Row) }] : [];
      }));
    }
    default: return pgErr(`Not in the preview: ${fn}`, "PGRST202", 404);
  }
}

/** The preview's copy of the database's hq_summary(): per store, only stage, address, counts and the next item due. */
function hqSummary(st: Row) {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Row[];
  const bi = (v: unknown) => (v && typeof v === "object" ? { en: String((v as Row).en ?? (v as Row).zh ?? ""), zh: String((v as Row).zh ?? (v as Row).en ?? "") } : { en: String(v ?? ""), zh: String(v ?? "") });
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(Date.parse(v.slice(0, 10))) ? v.slice(0, 10) : null);
  const today = new Date().toISOString().slice(0, 10), in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const stores = arr(st.stores).filter(s => s && typeof s === "object");
  const apps = arr(st.apps).filter(a => a && typeof a === "object" && a.id);
  const deadlines = arr(st.deadlines).filter(d => d && typeof d === "object" && (d.kind === "due" || d.kind === "renewal"));
  return stores.map((s, i) => {
    const mine = apps.filter(a => stores.length === 1 || (Array.isArray(s.apps) && s.apps.includes(a.id)));
    const items = [
      ...arr(s.permits).map(p => ({ kind: "permit", title: bi(p.name), date: day(p.expires) })),
      ...deadlines.filter(d => (d.app ? mine.some(a => a.id === d.app && !(d.kind === "due" && a.status === "approved")) : stores.length === 1))
        .map(d => ({ kind: String(d.kind), title: bi(d.title), date: day(d.date) })),
    ].filter((x): x is { kind: string; title: { en: string; zh: string }; date: string } => !!x.date).sort((a, b) => a.date.localeCompare(b.date));
    const overdue = items.filter(x => x.date < today).length, due_30 = items.filter(x => x.date >= today && x.date <= in30).length;
    const approved = mine.filter(a => a.status === "approved").length;
    return {
      id: String(s.id ?? `store-${i + 1}`), name: bi(s.name), stage: s.stage === "open" ? "open" : "opening", address: String(s.address ?? ""),
      planned_open: day(s.plannedOpen), projected_open: day(s.projectedOpen), opened: day(s.opened),
      grade: ["A", "B", "C", "P"].includes(String((s.grade as Row | undefined)?.letter)) ? (s.grade as Row).letter : null,
      current: items.filter(x => x.kind === "permit" && x.date > in30).length + (s.stage === "open" ? 0 : approved),
      due_30, overdue, pending: mine.length - approved,
      status: overdue ? "overdue" : due_30 ? "due" : "current", next: items[0] ?? null,
    };
  });
}

async function rest(req: Request, url: URL, c: { sub: string; aal: string } | null): Promise<Response> {
  if (!c) return pgErr("Sign in first.", "42501", 401);
  const table = url.pathname.split("/")[3];
  const rows = t(table);
  const single = (req.headers.get("accept") ?? "").includes("vnd.pgrst.object");
  const visible = (r: Row) => table === "workspaces" ? canSee(r.id, c) : canSee(r.workspace_id, c);
  if (req.method === "GET") {
    const out = filterRows(rows.filter(visible), url.searchParams).map(r => (table === "agency_logins" ? { ...r, secret_id: undefined } : r));
    if (single) return out[0] ? json(out[0]) : pgErr("No rows", "PGRST116", 406);
    return json(out);
  }
  const body = await req.json().catch(() => null);
  if (req.method === "POST") {
    const items: Row[] = Array.isArray(body) ? body : [body];
    const made: Row[] = [];
    for (const it of items) {
      if (!canSee(it.workspace_id, c)) return pgErr("new row violates row-level security policy", "42501", 403);
      if (table === "audit_log" && it.client_id && rows.some(r => r.workspace_id === it.workspace_id && r.client_id === it.client_id)) continue;
      const row: Row = { ...it, id: table === "audit_log" ? rows.length + 1 : uuid(), created_at: now() };
      if (table === "filings") {
        const b = t("billing").find(x => x.workspace_id === it.workspace_id);
        if (!isOwner(String(it.workspace_id), c) || !(b?.comped || b?.subscription_status === "active")) return pgErr("new row violates row-level security policy", "42501", 403);
        if (rows.some(r => r.workspace_id === it.workspace_id && r.app_id === it.app_id && ["requested", "in_progress", "needs_info", "submitted"].includes(String(r.status)))) return pgErr("This application is already with the team.", "23505", 409);
        Object.assign(row, { status: "requested", approved_by: c.sub, approved_at: now(), assigned_to: null, requirements_checked: false, confirmation_number: null, fee_paid: null, receipt_path: null, note: null, payment_url: null, customer_paid_at: null, submitted_at: null, decided_at: null, updated_at: now() });
        audit(String(row.workspace_id), c.sub, "you", "Approved for filing by the Placetta team", "批准由快哉团队提交", row.title as { en: string; zh: string });
      }
      if (table === "documents") row.uploaded_by = c.sub;
      rows.push(row); made.push(row);
    }
    save();
    if ((req.headers.get("prefer") ?? "").includes("return=representation")) return single ? json(made[0]) : json(made);
    return new Response(null, { status: 201 });
  }
  if (req.method === "PATCH") {
    for (const r of filterRows(rows.filter(visible), url.searchParams)) {
      if (table === "filings") {
        const staff = isStaff(c), owner = isOwner(String(r.workspace_id), c);
        if (!staff && !owner) continue;
        if (!staff) {
          const ok = (r.status === "requested" && body.status === "canceled") || (r.status === "needs_info" && r.payment_url && body.status === "in_progress");
          if (!ok) return pgErr("Only the Placetta team can change a filing at this stage.");
          if (body.status === "in_progress") { r.customer_paid_at = now(); audit(String(r.workspace_id), c.sub, "you", "Paid the agency fee", "已支付机构费用", r.title as { en: string; zh: string }); }
        } else {
          if (body.status === "submitted" && !(body.requirements_checked ?? r.requirements_checked)) return pgErr("Check the application against the agency's current requirements before marking it submitted.");
          const say: Record<string, [string, string]> = { in_progress: ["Started working on it", "开始办理"], submitted: ["Submitted to the agency", "已提交至机构"], accepted: ["Approved by the agency", "机构已批准"], rejected: ["Returned by the agency", "被机构退回"], needs_info: [body.payment_url ? "Asked you to pay the agency fee" : "Needs something from you", body.payment_url ? "请您支付机构费用" : "需要您补充材料"] };
          if (body.status && body.status !== r.status && say[body.status]) audit(String(r.workspace_id), c.sub, "team", say[body.status][0], say[body.status][1], r.title as { en: string; zh: string });
          if (body.status === "submitted") r.submitted_at = now();
          if (body.status === "accepted" || body.status === "rejected") r.decided_at = now();
        }
        Object.assign(r, body, { updated_at: now() });
      } else if (table === "workspaces") {
        if (!isMember(String(r.id), c)) continue;
        Object.assign(r, { name: body.name ?? r.name, state: body.state ?? r.state, updated_at: now() });
      } else Object.assign(r, body);
    }
    save();
    return new Response(null, { status: 204 });
  }
  return pgErr("Not supported in the preview.");
}

async function functions(name: string, req: Request, c: { sub: string; aal: string } | null): Promise<Response> {
  if (!c) return fnErr("unauthorized", "Sign in again.", 401);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const ws = String(body.workspace_id ?? "");
  if (twoStepOn(c.sub) && c.aal !== "aal2") return fnErr("mfa_required", "Finish two-step sign-in to continue.", 401);
  const member = isMember(ws, c), owner = isOwner(ws, c);
  const needOwner = () => (owner ? null : fnErr("forbidden", member ? "Only an owner of this workspace can do that." : "You are not a member of this workspace.", 403));
  switch (name) {
    case "billing": {
      if (body.action === "prices") return json({ ok: true, location: { amount: 1788, currency: "USD", interval: "year", interval_count: 1 }, pro: { amount: 3588, currency: "USD", interval: "year", interval_count: 1 }, opening: { amount: 3500, currency: "USD", interval: null, interval_count: null }, opening_food: { amount: 6500, currency: "USD", interval: null, interval_count: null }, guarantee: { amount: 2500, currency: "USD", interval: null, interval_count: null }, pack: { amount: 49, currency: "USD", interval: null, interval_count: null } });   // the prices the launcher creates in Stripe
      if (body.action === "sync_locations") return json({ ok: true, synced: false });
      const no = needOwner(); if (no) return no;
      if (body.action === "portal") return fnErr("not_configured", "Billing management opens Stripe on the live app.", 409);
      const b = t("billing").find(x => x.workspace_id === ws); if (b) Object.assign(b, PLAN_SET[String(body.plan)] ?? {}, { stripe_customer_id: "cus_preview" });
      audit(ws, c.sub, "you", "Started", "开通", { en: String(body.plan), zh: String(body.plan) });
      save(); return json({ ok: true, url: "preview:billing" });
    }
    case "integrations": {
      if (!member) return fnErr("forbidden", "You are not a member of this workspace.", 403);
      if (body.action === "connect" || body.action === "disconnect" || body.action === "hook_connect") { const no = needOwner(); if (no) return no; }
      if (body.action === "bot_setup") {
        if (body.kind === "wechat_bot") return json({ ok: true, events_url: `https://example.supabase.co/functions/v1/chat-events/wechat/${ws}`, token: "PreviewToken0000000000000000000000".slice(0, 32), aes_key: "PreviewEncodingAESKey000000000000000000000".padEnd(43, "0").slice(0, 43), ips: [] });
        const u = `https://example.supabase.co/functions/v1/chat-events?${body.kind === "slack_bot" ? "slack" : "lark"}=${ws}`; return json({ ok: true, events_url: u, ...(body.kind === "slack_bot" ? { manifest: JSON.stringify({ display_information: { name: "Odelia" }, settings: { event_subscriptions: { request_url: u } } }, null, 2) } : {}) });
      }
      if (body.action === "bot_connect") {
        const no = needOwner(); if (no) return no;
        const rows = t("integrations").filter(i => !(i.workspace_id === ws && i.kind === body.kind));
        rows.push({ id: uuid(), workspace_id: ws, kind: body.kind, account: body.kind === "slack_bot" ? "Moonleaf Tea (@odelia)" : body.kind === "wechat_bot" ? String(body.app_id ?? "wx0000000000000000") : "飞书", status: "connected", error: null, meta: { via: "bot", ...(body.kind === "wechat_bot" ? { app_id: body.app_id } : {}) }, connected_at: now(), last_used_at: null });
        db.tables.integrations = rows; save(); return json({ ok: true });
      }
      // linking a WeChat: the preview shows a code; there's no WeChat account on the other end to send it to
      if (body.action === "wechat_link_status") return json({ ok: true, connected: t("integrations").some(i => i.workspace_id === ws && i.kind === "wechat_bot"), linked: false, linked_at: null, waiting: false });
      if (body.action === "wechat_link") return json({ ok: true, code: "246810", expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), account: null });
      if (body.action === "wechat_unlink") return json({ ok: true, linked: false });
      if (body.action === "toast_setup" || body.action === "toast_connect") { const no = needOwner(); if (no) return no; return body.action === "toast_setup" ? json({ ok: true, code: "PLACETTA-PREVIEW2" }) : json({ error: { code: "not_configured", message: "Toast connects on the live app.", message_zh: "Toast 需在正式版应用中连接。" } }, 409); }
      if (body.action === "available") return json({ ok: true, google: true, microsoft: true, dropbox: true, quickbooks: true, slack: false, square: false, toast: false });
      if (body.action === "hook_connect") {
        const names: Record<string, [string, string]> = { slack: ["Slack channel", "Slack 群"], lark: ["Lark channel", "飞书群"], wecom: ["WeCom channel", "企业微信群"], dingtalk: ["DingTalk channel", "钉钉群"], teams: ["Microsoft Teams channel", "Microsoft Teams 群"] };
        if (!names[String(body.kind)] || !/^https:\/\//.test(String(body.url ?? ""))) return fnErr("bad_request", "That isn't a webhook link.", 400);
        const rows = t("integrations").filter(i => !(i.workspace_id === ws && i.kind === body.kind));
        const account = names[String(body.kind)][body.lang === "zh" ? 1 : 0];
        rows.push({ id: uuid(), workspace_id: ws, kind: body.kind, account, status: "connected", error: null, meta: { via: "link" }, connected_at: now(), last_used_at: null });
        db.tables.integrations = rows; save(); return json({ ok: true, kind: body.kind, account });
      }
      if (body.action === "connect") {
        const rows = t("integrations").filter(i => !(i.workspace_id === ws && i.kind === body.kind));
        rows.push({ id: uuid(), workspace_id: ws, kind: body.kind, account: userOf(c.sub).email, status: "connected", error: null, meta: {}, connected_at: now(), last_used_at: null });
        db.tables.integrations = rows; save(); return json({ ok: true, url: "preview:connected" });
      }
      if (body.action === "disconnect") { db.tables.integrations = t("integrations").filter(i => !(i.workspace_id === ws && i.kind === body.kind)); save(); return json({ ok: true }); }
      if (body.action === "feed_url") return json({ ok: true, url: `https://calendar.placetta.com/preview/${ws.slice(0, 8)}.ics` });
      return json({ ok: true });
    }
    case "file": {
      // The App Preview walks the log over a few seconds and ends submitted with a clearly labeled example confirmation.
      if (!member) return fnErr("forbidden", "You are not a member of this workspace.", 403);
      const f = t("filings").find(x => x.id === body.filing_id && x.workspace_id === ws); if (!f) return fnErr("not_found", "No such filing.", 404);
      const view = () => json({ ok: true, filing: { id: f.id, status: f.status, channel: f.channel ?? null, agent_state: f.agent_state ?? null, agent_log: f.agent_log ?? [], handoff_url: null, confirmation_number: f.confirmation_number ?? null, submit_clicked_at: f.submit_clicked_at ?? null } });
      if (body.action === "stop") {
        if (f.submit_clicked_at || ["submitted", "accepted", "rejected"].includes(String(f.status))) return fnErr("too_late", "It has already gone to the agency, so it can't be stopped.", 409);
        const shownSteps = ((f.preview_steps ?? []) as { at: string }[]).filter(x => x.at <= now());
        Object.assign(f, { status: "canceled", agent_state: "failed", preview_steps: [], agent_log: [...shownSteps, { at: now(), en: "Stopped before anything was sent to the agency", zh: "已在发送给机构之前停止", kind: "stopped" }] });
        save();
        return view();
      }
      if (body.action === "start" && !f.agent_state) {
        const at = (s: number) => new Date(Date.now() + s * 1000).toISOString();
        const fields = ((f.payload as { fields?: { label: { en: string; zh: string }; value: string }[] } | undefined)?.fields ?? []).filter(x => x.value).slice(0, 8);
        const host = (() => { try { return new URL(String(f.portal_url ?? "")).hostname.replace(/^www\./, ""); } catch { return "agency.gov"; } })();
        let t = 1;
        Object.assign(f, { channel: "portal", agent_state: "running", status: "in_progress", requirements_checked: true, preview_steps: [
          { at: at(0), en: "Checked against the agency's requirements", zh: "已按机构要求核对", kind: "check" },
          { at: at(t++), en: `Opening ${host} (preview example)`, zh: `打开 ${host}（预览示例）`, kind: "visit" },
          { at: at(t++), en: "On “Application”", zh: "在“申请”页面", kind: "page" },
          ...fields.map(x => ({ at: at(t++), en: `Filled ${x.label.en}`, zh: `已填写 ${x.label.zh}`, kind: "fill", value: /\b(ssn|itin|e?in|fein|tax id|account)\b/i.test(x.label.en) ? "•••" + x.value.replace(/\D/g, "").slice(-4) : x.value })),
          { at: at(t++), en: "Checked the review page against what you approved. Submitting.", zh: "已核对页面与您批准的内容一致，正在提交。", kind: "submit" },
          { at: at(t + 2), en: `Submitted on ${host}. Confirmation EXAMPLE-0001 (preview)`, zh: `已在 ${host} 提交，确认号 EXAMPLE-0001（预览）`, kind: "submitted" },
        ], agent_log: [] });
        save();
      }
      const steps = (f.preview_steps ?? []) as { at: string }[];
      if (steps.length) {
        f.agent_log = steps.filter(x => x.at <= now());
        if ((f.agent_log as { kind: string }[]).some(x => x.kind === "submit") && !f.submit_clicked_at) f.submit_clicked_at = now();
        if ((f.agent_log as unknown[]).length === steps.length && f.status !== "submitted") {
          Object.assign(f, { status: "submitted", agent_state: "done", confirmation_number: "EXAMPLE-0001 (preview)", submitted_at: now(), submit_clicked_at: f.submit_clicked_at ?? now() });
          audit(ws, c.sub, "agent", "Submitted by Placetta on the agency's site (preview example)", "快哉已在机构网站提交（预览示例）", f.title as { en: string; zh: string });
        }
        save();
      }
      return view();
    }
    case "logins": {
      if (body.action === "reveal") {
        if (!staffEmail(c.sub)) return fnErr("forbidden", "Only the Placetta team can do that.", 403);
        if (c.aal !== "aal2") return fnErr("mfa_required", "Turn on two-step sign-in and use it to open saved logins.", 401);
        const l = t("agency_logins").find(x => x.id === body.id); if (!l) return fnErr("not_found", "That login is gone.", 404);
        audit(String(l.workspace_id), c.sub, "team", "Opened your login to file", "为提交申请打开了您的登录信息", { en: String(l.agency), zh: String(l.agency) });
        l.last_opened_at = now(); save();
        return json({ ok: true, agency: l.agency, url: l.url, username: l.username, password: db.passwords[String(l.id)] ?? "" });
      }
      const no = needOwner(); if (no) return no;
      if (body.action === "save") {
        const id = String(body.id ?? uuid());
        const rows = t("agency_logins").filter(x => x.id !== id);
        const login = { id, workspace_id: ws, agency: body.agency, url: body.url ?? null, username: body.username, note: body.note ?? null, created_at: now(), last_opened_at: null };
        rows.push(login); db.tables.agency_logins = rows; if (body.password) db.passwords[id] = String(body.password);
        audit(ws, c.sub, "you", "Saved a login", "保存登录信息", { en: String(body.agency), zh: String(body.agency) });
        save(); return json({ ok: true, login });
      }
      if (body.action === "delete") { db.tables.agency_logins = t("agency_logins").filter(x => x.id !== body.id); delete db.passwords[String(body.id)]; save(); return json({ ok: true }); }
      return fnErr("bad_request", "Unknown action.");
    }
    case "team": {
      if (body.action === "delete_account") return fnErr("not_configured", "Deleting an account runs on the live app. Start over in Settings clears this preview.", 503);
      if (body.action === "remove") return rpc("remove_member", { ws, p_user: body.user_id }, c).then(async r => (r.ok ? json({ ok: true, removed: body.user_id }) : fnErr("bad_request", (await r.json()).message)));
      const no = needOwner(); if (no) return no;
      if (body.action === "invite") {
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fnErr("bad_request", "Enter a valid email address.");
        if (t("workspace_members").some(m => m.workspace_id === ws && userOf(String(m.user_id))?.email === email)) return fnErr("bad_request", "They're already on this workspace.");
        const open = t("workspace_invites").find(i => i.workspace_id === ws && i.email === email && !i.accepted_at && !i.revoked_at);
        const id = String(open?.id ?? uuid());
        if (open) Object.assign(open, { role: body.role, created_at: now() });
        else t("workspace_invites").push({ id, workspace_id: ws, email, role: body.role === "owner" ? "owner" : "member", invited_by: c.sub, created_at: now(), expires_at: new Date(Date.now() + 14 * 864e5).toISOString() });
        audit(ws, c.sub, "you", body.role === "owner" ? "Invited an owner" : "Invited a teammate", body.role === "owner" ? "邀请了所有者" : "邀请了成员", { en: email, zh: email });
        save(); return json({ ok: true, id, sent: "invite" });
      }
      return json({ ok: true, id: body.id, sent: "sign_in_link" });
    }
    case "tts": return fnErr("not_configured", "The live voice runs on the live app.", 503);
    // A made-up number (555-01xx is reserved for examples): the section works, nothing is texted.
    case "odelia-sms": return body.action === "line" ? json({ configured: true, voice: true, number: "+14155550134", display: "+1 (415) 555-0134" }) : fnErr("not_configured", "Texting runs on the live app.", 503);
    default: return fnErr("not_configured", "Not in the preview.", 503);
  }
}

async function auth(req: Request, url: URL): Promise<Response> {
  const p = url.pathname.replace("/auth/v1", "");
  const body = req.method === "GET" || req.method === "DELETE" ? {} : await req.json().catch(() => ({})) as Record<string, string>;
  if (p === "/settings") return json({ external: { email: true, phone: true, google: false, azure: false }, disable_signup: false });
  if (p === "/otp" || p === "/recover") return json({});
  if (p === "/signup") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (db.users.some(x => x.email === email)) return json({ code: 422, error_code: "user_already_exists", msg: "User already registered" }, 422);
    if (String(body.password ?? "").length < 6) return json({ code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters." }, 422);
    const u = { id: uuid(), email, created_at: now() }; db.users.push(u); save();
    return json(session(u.id));
  }
  if (p === "/verify") {
    if (String(body.token) !== PREVIEW_CODE) return json({ code: 403, error_code: "otp_expired", msg: `That code didn't work. In the preview it's ${PREVIEW_CODE}.` }, 403);
    const email = String(body.email ?? (body.phone ? `${String(body.phone).replace(/\D/g, "")}@phone.preview` : "")).trim().toLowerCase();
    let u = db.users.find(x => x.email === email);
    if (!u) { u = { id: uuid(), email, created_at: now() }; db.users.push(u); }
    return json(session(u.id));
  }
  if (p === "/token" && url.searchParams.get("grant_type") === "password") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const u = db.users.find(x => x.email === email);
    // the preview has no real passwords: any password signs an existing preview account in
    if (!u) return json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
    return json(session(u.id));
  }
  if (p === "/token") {
    const s = db.sessions[String(body.refresh_token ?? "")];
    if (!s || !userOf(s.user_id)) return json({ error: "invalid_grant", error_description: "Session expired" }, 400);
    return json(session(s.user_id, s.aal));
  }
  const c = claims(req);
  if (p === "/logout") { if (c) { for (const [k, v] of Object.entries(db.sessions)) if (k === c.sid || (url.searchParams.get("scope") === "global" && v.user_id === c.sub)) delete db.sessions[k]; save(); } return new Response(null, { status: 204 }); }
  if (!c || !userOf(c.sub)) return json({ code: 401, msg: "Sign in again." }, 401);
  if (p === "/user" && req.method === "PUT" && body.password !== undefined && String(body.password).length < 8) return json({ code: 422, error_code: "weak_password", msg: "Password should be at least 8 characters." }, 422);
  if (p === "/user") return json(publicUser(c.sub));
  if (p === "/factors" && req.method === "POST") {
    db.factors = db.factors.filter(f => !(f.user_id === c.sub && f.status === "unverified"));
    const id = uuid(); db.factors.push({ id, user_id: c.sub, status: "unverified" }); save();
    const qr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" width="168" height="168" shape-rendering="crispEdges"><rect width="29" height="29" fill="#fff"/>${Array.from({ length: 29 * 29 }, (_, i) => { const x = i % 29, y = (i / 29) | 0; const finder = (a: number, b: number) => x >= a && x < a + 7 && y >= b && y < b + 7 && (x === a || x === a + 6 || y === b || y === b + 6 || (x > a + 1 && x < a + 5 && y > b + 1 && y < b + 5)); const on = finder(0, 0) || finder(22, 0) || finder(0, 22) || (!(x < 8 && y < 8) && !(x > 20 && y < 8) && !(x < 8 && y > 20) && ((x * 7 + y * 13 + x * y) % 5 < 2)); return on ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ""; }).join("")}</svg>`;
    return json({ id, type: "totp", friendly_name: body.friendly_name ?? "Authenticator", totp: { qr_code: qr, secret: "PREVIEWJBSWY3DPEHPK3PXP", uri: "otpauth://totp/Placetta:preview" } });
  }
  const m = /^\/factors\/([^/]+)(\/challenge|\/verify)?$/.exec(p);
  if (m) {
    const f = db.factors.find(x => x.id === m[1] && x.user_id === c.sub);
    if (!f) return json({ code: 404, msg: "Factor not found" }, 404);
    if (req.method === "DELETE") { db.factors = db.factors.filter(x => x !== f); save(); return json({ id: f.id }); }
    if (m[2] === "/challenge") return json({ id: uuid(), type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (m[2] === "/verify") {
      if (String(body.code) !== PREVIEW_CODE) return json({ code: 422, error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered" }, 422);
      f.status = "verified"; save();
      return json(session(c.sub, "aal2"));
    }
  }
  return json({ code: 404, msg: "Not in the preview." }, 404);
}

async function storage(req: Request, url: URL, c: { sub: string; aal: string } | null): Promise<Response> {
  if (!c) return json({ error: "Unauthorized" }, 401);
  const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/|public\/)?documents\//, ""));
  if (!canSee(path.split("/")[0], c)) return json({ statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" }, 403);
  if (req.method === "POST" || req.method === "PUT") {
    let blob: Blob = await req.clone().blob();
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      const file = [...form.values()].find((v): v is File => typeof v !== "string");
      if (file) blob = file;
    }
    const data = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
    db.blobs[path] = data; save();
    return json({ Key: `documents/${path}`, Id: uuid() });
  }
  const d = db.blobs[path];
  if (!d) return json({ statusCode: "404", error: "not_found", message: "Object not found" }, 404);
  const [head, data] = d.split(",", 2);
  const bin = atob(data); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(new Blob([bytes], { type: head.slice(5).split(";")[0] || "application/octet-stream" }), { status: 200 });
}

/** Supabase, in this browser. Passed to supabase-js as its fetch. */
export async function previewFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const url = new URL(req.url);
  await new Promise(r => setTimeout(r, 120));   // feel like a network
  const c = claims(req);
  if (url.pathname.startsWith("/auth/v1")) return auth(req, url);
  if (url.pathname.startsWith("/rest/v1/rpc/")) return rpc(url.pathname.split("/").pop()!, await req.json().catch(() => ({})), c);
  if (url.pathname.startsWith("/rest/v1/")) return rest(req, url, c);
  if (url.pathname.startsWith("/storage/v1/object/")) return storage(req, url, c);
  if (url.pathname.startsWith("/functions/v1/")) return functions(url.pathname.split("/")[3], req, c);
  return json({ message: "Not in the preview." }, 404);
}
