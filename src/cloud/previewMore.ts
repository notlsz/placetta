/* ------------------------------------------------------------------ *
 * The preview backend's stand-ins for partners, specialist reviews,
 * Agent health and the incident log (src/cloud/preview.ts hands these
 * calls here). The same rules as the database, on the browser's own
 * copy of the data: partners read only consenting referrals, keys are
 * kept as SHA-256, reviews are due one business day later, staff need
 * two-step. In the preview, a specialist's first name is read from the
 * staff email (mei@placetta.com is Mei); the database keeps it in
 * staff_emails.first_name.
 * ------------------------------------------------------------------ */

type Row = Record<string, unknown> & { id?: string | number };
type Claims = { sub: string; aal: string };
export type PreviewKit = {
  t(name: string): Row[];
  save(): void;
  json(body: unknown, status?: number): Response;
  pgErr(message: string, code?: string, status?: number): Response;
  now(): string;
  uuid(): string;
  email(uid: string): string;
  isStaff(c: Claims): boolean;
  isOwner(ws: string, c: Claims): boolean;
  isMember(ws: string, c: Claims): boolean;
  audit(ws: string, uid: string | null, actor: string, en: string, zh: string, object: { en: string; zh: string }): void;
};

const DAY = 864e5;
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code8 = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => CODE_ABC[b % 32]).join("");
const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
async function sha256(s: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join(""); }
const firstName = (email: string) => { const p = email.split("@")[0].split(/[._-]/)[0]; return /^[a-z]{2,20}$/i.test(p) ? p[0].toUpperCase() + p.slice(1).toLowerCase() : null; };
/** One business day later; a weekend request is due Monday evening (New York time is close enough for the preview). */
export function oneBusinessDay(at: Date): Date {
  const d = new Date(at), wd = d.getDay();
  if (wd === 6 || wd === 0) { d.setDate(d.getDate() + (wd === 6 ? 2 : 1)); d.setHours(18, 0, 0, 0); return d; }
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  return d;
}
const pctl = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return Math.round((s[lo] + (s[hi] - s[lo]) * (i - lo)) * 10) / 10; };
const r1 = (n: number) => Math.round(n * 10) / 10, r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** What a consenting referral shows: stage, permits approved out of all, the opening date. */
function progress(state: Row) {
  const stores = (Array.isArray(state.stores) ? state.stores : []) as Row[], apps = (Array.isArray(state.apps) ? state.apps : []) as Row[];
  const opening = stores.filter(s => s.stage !== "open");
  const dates = opening.map(s => String(s.projectedOpen ?? s.plannedOpen ?? "")).filter(d => /^\d{4}-\d{2}-\d{2}/.test(d)).sort();
  return { stage: stores.length && !opening.length ? "open" : "opening", permits_done: apps.filter(a => a.status === "approved").length, permits_total: apps.length, opening_date: dates[0]?.slice(0, 10) ?? null };
}

export async function moreRpc(fn: string, body: Record<string, unknown>, c: Claims, k: PreviewKit): Promise<Response | null> {
  const ws = String(body.ws ?? "");
  const partners = () => k.t("partners"), refs = () => k.t("workspace_referrals");
  const mine = () => partners().find(p => p.user_id === c.sub);
  const meOf = (p: Row | undefined) => (p ? { id: p.id, org_name: p.org_name, kind: p.kind, contact_name: p.contact_name ?? null, website: p.website ?? null, status: p.status,
    code: p.status === "approved" ? p.code : null, share_pct: p.share_pct ?? null, share_months: p.share_months ?? 12, created_at: p.created_at, approved_at: p.approved_at ?? null } : null);
  const referralFor = (w: string) => { const r = refs().find(x => x.workspace_id === w); const p = r && partners().find(x => x.id === r.partner_id); return r && p ? { org_name: p.org_name, kind: p.kind, consent: r.consent, consent_at: r.consent_at, attributed_at: r.attributed_at } : null; };
  const snapshot = (r: Row) => {
    const w = k.t("workspaces").find(x => x.id === r.workspace_id);
    Object.assign(r, r.consent && w ? { business_name: w.name, ...progress((w.state ?? {}) as Row), progress_at: k.now() } : { business_name: null, stage: null, permits_done: null, permits_total: null, opening_date: null, progress_at: null });
  };
  const staff = () => { if (!k.isStaff(c)) return k.pgErr("Placetta team only."); return null; };

  switch (fn) {
    /* ---------------- partners ---------------- */
    case "partner_me": return k.json(meOf(mine()));
    case "partner_apply": {
      const org = String(body.p_org ?? "").trim(), kind = String(body.p_kind ?? "");
      if (!org) return k.pgErr("Add your organization's name.");
      if (!["franchisor", "master_franchisee", "broker", "landlord", "investor", "accountant", "other"].includes(kind)) return k.pgErr("Pick what kind of partner you are.");
      let p = mine();
      if (p && (p.status === "approved" || p.status === "paused")) return k.pgErr("This account is already a Placetta partner.");
      let site = String(body.p_website ?? "").trim(); if (site && !/^https?:\/\//i.test(site)) site = "https://" + site;
      const f = { org_name: org.slice(0, 120), kind, contact_name: String(body.p_contact ?? "").trim() || null, website: site || null, note: String(body.p_note ?? "").trim() || null, status: "pending" };
      if (p) Object.assign(p, f); else partners().push(p = { id: k.uuid(), user_id: c.sub, ...f, code: null, share_pct: null, share_months: 12, created_at: k.now() });
      k.save(); return k.json(meOf(p));
    }
    case "partner_lookup": {
      const p = partners().find(x => x.code === String(body.p_code ?? "").trim().toUpperCase() && x.status === "approved");
      return k.json(p ? { org_name: p.org_name, kind: p.kind } : null);
    }
    case "partner_dashboard": {
      const p = mine(); if (!p) return k.json(null);
      const rev = k.t("partner_revenue").filter(x => x.partner_id === p.id), pays = k.t("partner_payouts").filter(x => x.partner_id === p.id);
      const mo = new Date().toISOString().slice(0, 7) + "-01";
      const months = [...new Set(rev.map(x => String(x.month)))].sort().reverse().map(m => { const rs = rev.filter(x => x.month === m); return { month: m, paying: rs.filter(x => Number(x.revenue_usd) > 0).length, share_usd: rs.reduce((s, x) => s + Number(x.share_usd), 0), closed: m < mo }; });
      const earned = rev.reduce((s, x) => s + Number(x.share_usd), 0), closed = rev.filter(x => String(x.month) < mo).reduce((s, x) => s + Number(x.share_usd), 0), paid = pays.reduce((s, x) => s + Number(x.amount_usd), 0);
      return k.json({ partner: meOf(p), referred: refs().filter(r => r.partner_id === p.id).length, sharing: refs().filter(r => r.partner_id === p.id && r.consent).length, months,
        earned_usd: earned, paid_usd: paid, owed_usd: Math.max(closed - paid, 0), payouts: pays.map(x => ({ amount_usd: x.amount_usd, paid_on: x.paid_on, reference: x.reference ?? null })) });
    }
    case "partner_keys": { const p = mine(); return k.json(p ? k.t("partner_api_keys").filter(x => x.partner_id === p.id).map(x => ({ id: x.id, label: x.label, prefix: x.prefix, created_at: x.created_at, last_used_at: x.last_used_at ?? null, revoked_at: x.revoked_at ?? null })) : []); }
    case "partner_key_create": {
      const p = mine(); if (!p || p.status !== "approved") return k.pgErr("API keys are for approved partners.");
      if (k.t("partner_api_keys").filter(x => x.partner_id === p.id && !x.revoked_at).length >= 5) return k.pgErr("Up to 5 API keys at a time. Revoke one first.");
      const prefix = hex(4), key = `plk_${prefix}_${hex(24)}`, id = k.uuid();
      k.t("partner_api_keys").push({ id, partner_id: p.id, label: String(body.p_label ?? "").trim().slice(0, 60) || "API key", prefix, key_hash: await sha256(key), created_at: k.now(), last_used_at: null, revoked_at: null });
      k.save(); return k.json({ id, prefix, key });
    }
    case "partner_key_revoke": { const p = mine(); const x = k.t("partner_api_keys").find(y => y.id === body.p_id && y.partner_id === p?.id && !y.revoked_at); if (!x) return k.pgErr("No such key."); x.revoked_at = k.now(); k.save(); return k.json(null); }
    case "referral_claim": {
      if (!k.isOwner(ws, c)) return k.pgErr("Only an owner can do this.");
      const at = new Date(String(body.p_touched_at ?? "")).getTime();
      if (!(at > Date.now() - 90 * DAY && at < Date.now() + 5 * 60e3)) return k.pgErr("This referral link is more than 90 days old.");
      const p = partners().find(x => x.code === String(body.p_code ?? "").toUpperCase() && x.status === "approved");
      if (!p) return k.json(null);
      if (p.user_id === c.sub) return k.pgErr("A partner can't refer their own business.");
      if (!refs().some(r => r.workspace_id === ws)) {
        const consent = body.p_consent === true;
        const r: Row = { id: k.uuid(), workspace_id: ws, partner_id: p.id, code: p.code, touched_at: new Date(at).toISOString(), attributed_at: k.now(), consent, consent_asked_at: k.now(), consent_at: k.now() };
        snapshot(r); refs().push(r);
        k.audit(ws, c.sub, "you", consent ? `Started through ${p.org_name}, and shared progress with them (stage, permits approved, opening date)` : `Started through ${p.org_name}, without sharing progress`,
          consent ? `经由 ${p.org_name} 开始使用，并与其共享进展（阶段、已批准许可、开业日期）` : `经由 ${p.org_name} 开始使用，未共享进展`, { en: String(p.org_name), zh: String(p.org_name) });
        k.save();
      }
      return k.json(referralFor(ws));
    }
    case "referral_for": return k.json(k.isMember(ws, c) ? referralFor(ws) : null);
    case "referral_consent_set": {
      if (!k.isOwner(ws, c)) return k.pgErr("Only an owner can change what the partner sees.");
      const r = refs().find(x => x.workspace_id === ws); const p = r && partners().find(x => x.id === r.partner_id);
      if (!r || !p) return k.pgErr("This workspace has no partner.");
      Object.assign(r, { consent: body.p_consent === true, consent_at: k.now() }); snapshot(r);
      k.audit(ws, c.sub, "you", r.consent ? `Shared progress with ${p.org_name}` : `Stopped sharing progress with ${p.org_name}`, r.consent ? `与 ${p.org_name} 共享进展` : `停止与 ${p.org_name} 共享进展`, { en: String(p.org_name), zh: String(p.org_name) });
      k.save(); return k.json(referralFor(ws));
    }
    case "partner_admin_list": {
      const no = staff(); if (no) return no;
      return k.json(partners().map(p => ({ ...meOf(p), code: p.code ?? null, email: k.email(String(p.user_id)), note: p.note ?? null,
        referred: refs().filter(r => r.partner_id === p.id).length, sharing: refs().filter(r => r.partner_id === p.id && r.consent).length,
        earned_usd: k.t("partner_revenue").filter(x => x.partner_id === p.id).reduce((s, x) => s + Number(x.share_usd), 0),
        paid_usd: k.t("partner_payouts").filter(x => x.partner_id === p.id).reduce((s, x) => s + Number(x.amount_usd), 0) })));
    }
    case "partner_admin_set": {
      const no = staff(); if (no) return no;
      const p = partners().find(x => x.id === body.p_id); if (!p) return k.pgErr("No such partner.");
      const pct = body.p_share_pct == null ? null : Number(body.p_share_pct), months = body.p_share_months == null ? null : Number(body.p_share_months);
      if (pct != null && !(pct >= 0 && pct <= 50)) return k.pgErr("The share is a percentage from 0 to 50.");
      if (months != null && !(months >= 1 && months <= 60)) return k.pgErr("The share runs 1 to 60 months.");
      Object.assign(p, { status: body.p_status, share_pct: pct ?? p.share_pct ?? null, share_months: months ?? p.share_months ?? 12 });
      if (p.status === "approved") { p.code ??= code8(); p.approved_at ??= k.now(); }
      k.save(); return k.json({ id: p.id, status: p.status, code: p.code ?? null, share_pct: p.share_pct, share_months: p.share_months });
    }
    case "partner_payout_add": {
      const no = staff(); if (no) return no;
      if (!(Number(body.p_amount) > 0)) return k.pgErr("Enter the amount paid.");
      const id = k.uuid(); k.t("partner_payouts").push({ id, partner_id: body.p_partner, amount_usd: Math.round(Number(body.p_amount) * 100) / 100, paid_on: body.p_paid_on, reference: body.p_reference ?? null, created_at: k.now() });
      k.save(); return k.json(id);
    }

    /* ---------------- specialist reviews ---------------- */
    case "specialist_reviews_for": {
      if (!k.isMember(ws, c) && !k.isStaff(c)) return k.pgErr("Not your workspace.");
      const two = k.t("filings").filter(f => f.workspace_id === ws).flatMap(f => ((f.agent_log ?? []) as Row[]).filter(e => e.kind === "two_key_ok").map(e => ({
        app_id: f.app_id, kind: "two_key", status: "done", reviewer_name: firstName(String(e.ref ?? "")), reviewed_at: e.at, outcome: null, comment: null, requested_at: null, due_at: null })));
      const asked = k.t("specialist_reviews").filter(r => r.workspace_id === ws && r.status !== "canceled").map(r => ({ app_id: r.app_id, kind: "requested", status: r.status,
        reviewer_name: r.reviewer_name ?? null, reviewed_at: r.reviewed_at ?? null, outcome: r.outcome ?? null, comment: r.comment ?? null, requested_at: r.requested_at, due_at: r.due_at }));
      return k.json([...two, ...asked]);
    }
    case "request_specialist_review": {
      if (!k.isOwner(ws, c)) return k.pgErr("Only an owner can ask for a specialist review.");
      const all = k.t("specialist_reviews");
      const open = all.find(r => r.workspace_id === ws && r.app_id === body.p_app_id && r.status === "requested");
      if (open) return k.json(open);
      if (all.filter(r => r.workspace_id === ws && Date.parse(String(r.requested_at)) > Date.now() - DAY).length >= 5) return k.json({ code: "P0001", message: "rate_limited", hint: "Up to 5 specialist reviews a day. The ones you asked for are with the team.", details: null }, 400);
      const title = (body.p_title ?? {}) as { en?: string; zh?: string };
      const r: Row = { id: k.uuid(), workspace_id: ws, app_id: body.p_app_id, title: { en: title.en ?? String(body.p_app_id), zh: title.zh ?? title.en ?? "" }, note: String(body.p_note ?? "").trim() || null,
        requested_by: c.sub, requested_at: k.now(), due_at: oneBusinessDay(new Date()).toISOString(), status: "requested" };
      all.push(r);
      k.t("team_tasks").push({ id: k.uuid(), kind: "review", filing_id: null, workspace_id: ws, title: `Specialist review asked for: ${(r.title as { en: string }).en}`, detail: { specialist_review_id: r.id }, created_at: k.now(), done_at: null });
      k.audit(ws, c.sub, "you", "Asked a Placetta specialist to review it", "请快哉专员审核", r.title as { en: string; zh: string });
      k.save(); return k.json(r);
    }
    case "review_queue": {
      const no = staff(); if (no) return no;
      return k.json(k.t("specialist_reviews").filter(r => r.status === "requested" || (r.status === "done" && Date.parse(String(r.reviewed_at)) > Date.now() - 7 * DAY))
        .map((r): Row => ({ ...r, business: k.t("workspaces").find(w => w.id === r.workspace_id)?.name ?? "", requested_by: r.requested_by ? k.email(String(r.requested_by)) : null }))
        .sort((a, b) => (a.status === b.status ? String(a.status === "requested" ? a.due_at : b.reviewed_at).localeCompare(String(a.status === "requested" ? b.due_at : a.reviewed_at)) : a.status === "requested" ? -1 : 1)));
    }
    case "review_finish": {
      const no = staff(); if (no) return no;
      const r = k.t("specialist_reviews").find(x => x.id === body.p_id && x.status === "requested");
      if (!r) return k.pgErr("This review is already done.");
      if (body.p_outcome === "changes_needed" && !String(body.p_comment ?? "").trim()) return k.pgErr("Say what needs to change.");
      Object.assign(r, { status: "done", reviewer: c.sub, reviewer_name: firstName(k.email(c.sub)), reviewed_at: k.now(), outcome: body.p_outcome, comment: String(body.p_comment ?? "").trim() || null });
      for (const tk of k.t("team_tasks")) if ((tk.detail as Row | null)?.specialist_review_id === r.id) tk.done_at = k.now();
      k.audit(String(r.workspace_id), c.sub, "team", r.outcome === "looks_right" ? "A Placetta specialist reviewed it: it looks right" : "A Placetta specialist reviewed it: changes needed",
        r.outcome === "looks_right" ? "快哉专员已审核：内容无误" : "快哉专员已审核：需要修改", r.title as { en: string; zh: string });
      k.save(); return k.json(r);
    }

    /* ---------------- Agent health ---------------- */
    case "agent_health": {
      const no = staff(); if (no) return no;
      return k.json(health(k, Math.min(Math.max(Number(body.p_days) || 14, 1), 60)));
    }
    case "agent_run_replay": {
      const no = staff(); if (no) return no;
      const r = k.t("agent_runs").find(x => x.id === body.p_id); if (!r) return k.pgErr("No such run.");
      const done = (r.done_at ?? (r.status !== "running" ? r.updated_at : null)) as string | null;
      const calls = k.t("ai_events").filter(e => e.workspace_id === r.workspace_id && String(e.at) >= String(r.created_at) && Date.parse(String(e.at)) <= Date.parse(done ?? String(r.created_at)) + 5000);
      return k.json({ ...r, business: k.t("workspaces").find(w => w.id === r.workspace_id)?.name ?? null, first_reply_at: r.first_text_at ?? null, done_at: done, prompt: String(r.prompt ?? "").slice(0, 600),
        reply: (r.reply as Row | null)?.text ?? null, steps: r.steps ?? [], calls: calls.map(e => ({ at: e.at, kind: e.kind, role: e.role ?? null, provider: e.provider ?? null, model: e.model ?? null, cost_usd: e.cost_usd, saver: e.saver ?? null })),
        cost_usd: r4(calls.reduce((s, e) => s + Number(e.cost_usd), 0)), checks: k.t("odelia_job_checks").filter(x => x.run_id === r.id) });
    }
    case "governance_reports_list": { const no = staff(); if (no) return no; return k.json(k.t("governance_reports")); }
    case "incidents_list": {
      const no = staff(); if (no) return no;
      const s = k.t("incident_log"); if (!s.length) { s.push({ id: "since", since: new Date(k.now()).toLocaleDateString("en-CA") }); k.save(); }
      return k.json({ since: s[0].since, incidents: k.t("incidents").map((i): Row => ({ ...i, by: i.created_by ? k.email(String(i.created_by)) : null })).sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at))) });
    }
    case "incident_add": {
      const no = staff(); if (no) return no;
      if (!String(body.p_title ?? "").trim()) return k.pgErr("Say what happened.");
      if (!String(body.p_impact ?? "").trim()) return k.pgErr("Say what the impact was.");
      const id = k.uuid();
      k.t("incidents").push({ id, happened_at: body.p_happened_at, title: String(body.p_title).trim(), impact: String(body.p_impact).trim(), fix: String(body.p_fix ?? "").trim() || null, public: body.p_public === true, created_by: c.sub, created_at: k.now() });
      k.save(); return k.json(id);
    }
    case "incident_update": {
      const no = staff(); if (no) return no;
      const i = k.t("incidents").find(x => x.id === body.p_id); if (!i) return k.pgErr("No such incident.");
      Object.assign(i, { fix: String(body.p_fix ?? "").trim() || null, public: body.p_public ?? i.public }); k.save(); return k.json(null);
    }
    default: return null;
  }
}

/** Partners read workspace_referrals straight from the table: only consenting rows of their own, only these columns. */
export function moreRest(table: string, req: Request, c: Claims, k: PreviewKit): Response | null {
  if (table !== "workspace_referrals") return null;
  if (req.method !== "GET") return k.pgErr("permission denied for table workspace_referrals", "42501", 403);
  const p = k.t("partners").find(x => x.user_id === c.sub && x.status === "approved");
  const cols = ["id", "attributed_at", "business_name", "stage", "permits_done", "permits_total", "opening_date", "progress_at"];
  return k.json(p ? k.t("workspace_referrals").filter(r => r.partner_id === p.id && r.consent).sort((a, b) => String(b.attributed_at).localeCompare(String(a.attributed_at)))
    .map(r => Object.fromEntries(cols.map(x => [x, r[x] ?? null]))) : []);
}

/** The New York day a moment falls on: Agent health counts the team's business days, like agent_health_data. */
const nyDay = (at: unknown) => new Date(String(at)).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** Agent health from the preview's own runs and AI events, the way agent_health_data adds them up. */
function health(k: PreviewKit, days: number) {
  const today = nyDay(new Date().toISOString());
  const dayList = Array.from({ length: days }, (_, i) => new Date(Date.parse(today + "T12:00:00Z") - (days - 1 - i) * DAY).toISOString().slice(0, 10));
  const since = dayList[0];
  type Run = Row & { done: string | null; reply_s: number | null; done_s: number | null };
  const runs = k.t("agent_runs").filter(r => nyDay(r.created_at) >= since).map((r): Run => {
    const done = (r.done_at ?? (r.status !== "running" ? r.updated_at : null)) as string | null, t0 = Date.parse(String(r.created_at));
    return { ...r, done, reply_s: r.first_text_at ? (Date.parse(String(r.first_text_at)) - t0) / 1000 : null, done_s: done ? (Date.parse(done) - t0) / 1000 : null };
  });
  const ev = k.t("ai_events").filter(e => nyDay(e.at) >= since), checks = k.t("odelia_job_checks").filter(x => nyDay(x.at) >= since), thr = k.t("ai_throttles").filter(x => nyDay(x.at) >= since);
  const costOf = (r: (typeof runs)[number]) => ev.filter(e => e.workspace_id === r.workspace_id && String(e.at) >= String(r.created_at) && Date.parse(String(e.at)) <= Date.parse(r.done ?? String(r.created_at)) + 5000).reduce((s, e) => s + Number(e.cost_usd), 0);
  const sum = (rs: typeof runs, es: Row[], cs: Row[], ts: Row[]) => {
    const calls = rs.reduce((s, r) => s + Number(r.tool_calls ?? 0), 0), errs = rs.reduce((s, r) => s + Number(r.tool_errors ?? 0), 0), cost = es.reduce((s, e) => s + Number(e.cost_usd), 0);
    const known = es.filter(e => e.kind === "call" && e.saver != null), saver = known.filter(e => e.saver);
    return { runs: rs.length, done: rs.filter(r => r.status === "done").length, failed: rs.filter(r => r.status === "failed").length, tool_calls: calls, tool_error_pct: calls ? r1(100 * errs / calls) : null,
      first_try_pct: cs.length ? r1(100 * cs.filter(x => x.passed === x.of).length / cs.length) : null, checked: cs.length,
      reply_p50_s: pctl(rs.flatMap(r => (r.reply_s == null ? [] : [r.reply_s])), .5), reply_p95_s: pctl(rs.flatMap(r => (r.reply_s == null ? [] : [r.reply_s])), .95),
      done_p50_s: pctl(rs.flatMap(r => (r.done_s == null || r.status !== "done" ? [] : [r.done_s])), .5), done_p95_s: pctl(rs.flatMap(r => (r.done_s == null || r.status !== "done" ? [] : [r.done_s])), .95),
      ai_cost_usd: r4(cost), cost_per_run_usd: rs.length ? r4(cost / rs.length) : null, saver_pct: known.length ? r1(100 * saver.length / known.length) : null, throttles: ts.length };
  };
  const on = <T extends Row>(xs: T[], d: string, key: string) => xs.filter(x => nyDay(x[key]) === d);
  const pick = (r: (typeof runs)[number]) => ({ id: r.id, business: k.t("workspaces").find(w => w.id === r.workspace_id)?.name ?? null, kind: r.kind ?? "task", channel: r.channel ?? "app", status: r.status,
    title: (r.title as { en?: string } | null)?.en ?? String(r.prompt ?? "").slice(0, 80), created_at: r.created_at, reply_s: r.reply_s == null ? null : r1(r.reply_s), done_s: r.done_s == null ? null : r1(r.done_s), cost_usd: r4(costOf(r)), tool_calls: r.tool_calls ?? null, tool_errors: r.tool_errors ?? null });
  const vendors = new Map<string, { provider: string; model: string; calls: number; cost_usd: number }>();
  for (const e of ev.filter(x => x.kind === "call")) { const key = `${e.provider}|${e.model}`; const v = vendors.get(key) ?? { provider: String(e.provider ?? "unknown"), model: String(e.model ?? "unknown"), calls: 0, cost_usd: 0 }; v.calls++; v.cost_usd = r4(v.cost_usd + Number(e.cost_usd)); vendors.set(key, v); }
  return {
    days, since,
    by_day: dayList.map(d => ({ day: d, ...sum(on(runs, d, "created_at"), on(ev, d, "at"), on(checks, d, "at"), on(thr, d, "at")) })),
    totals: sum(runs, ev, checks, thr),
    by_vendor: [...vendors.values()].sort((a, b) => b.cost_usd - a.cost_usd),
    slowest: runs.filter(r => r.done_s != null).sort((a, b) => b.done_s! - a.done_s!).slice(0, 10).map(pick),
    costliest: runs.map(r => ({ r, c: costOf(r) })).filter(x => x.c > 0).sort((a, b) => b.c - a.c).slice(0, 10).map(x => pick(x.r)),
    measured_since: { first_reply: runs.find(r => r.first_text_at)?.created_at ?? null, tools: runs.find(r => r.tool_calls != null)?.created_at ?? null, saver: ev.find(e => e.saver != null)?.at ?? null },
  };
}
