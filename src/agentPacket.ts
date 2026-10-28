import { B, type Bi } from "./bi";
import { audit } from "./core";
import { formById } from "./forms/registry";
import { agentRow, PLACETTA_AGENT, type AgentRow, type AuthDoc, type OwnerAct } from "./forms/agentAuthority";
import { paymentOf, siteOf } from "./forms/esign";
import { routeOf } from "./approvalRoute";
import type { Application, Workspace } from "./model";

/* ------------------------------------------------------------------ *
 * "Placetta as your agent": the packet an owner signs once, in one
 * session at signup or with Autopilot ("Sign once, 2 minutes"), and the
 * checks every act as agent passes afterwards.
 *
 * The packet holds, for the filings in the plan: Placetta's own agent
 * authorization (the Filing Authorization's agent section, e-signed with
 * Autopilot), each agency's own authorization form where the agency
 * publishes one (official PDFs, filled from business facts), and every
 * owner signature the law or the agency keeps the owner's that can be
 * made now because every fact on it is already known. What can only be
 * signed later (final plans, the first payroll date) is listed with why.
 *
 * Afterwards Placetta, or its named person, acts as the business's agent
 * only where agentCheck passes: the authorization is live (signed, not
 * expired, not revoked), it covers this agency and this form, the form's
 * agency is the agency on the filing, and the agency's own rule (cited in
 * src/forms/agentAuthority.ts) lets an agent do it. Every act is in the
 * audit trail (actAsAgent) and in the database's agent_acts
 * (supabase/migrations/20261103090100_agent_authority.sql), which checks
 * the same things again and refuses a revoked or expired authorization.
 * ------------------------------------------------------------------ */

export const AGENT_MONTHS = 12;

/** Placetta's agent of record: the named person who signs as agent and is the IRS designee. Set by the founder
 *  (SETUP.md "Agent of record"); never Odelia, never invented. Without one, nothing that names an agent is signed. */
export type AgentOfRecord = { name: string; title: string; phone: string; fax?: string; email: string };

/** One signed item of the packet, as the database recorded it. */
export type SignedItem = { id: string; form?: string; agency?: string; sig: "esign" | "hand"; at: string; expires?: string; doc?: string };
/** The workspace's copy of the signed packet (controls.agent): the database's rows are the record. */
export type AgentAuth = {
  id: string; by: string; at: string; expires: string; version: string;
  agencies: string[]; forms: string[];
  items: SignedItem[];
  agent: string;
  /** Where agency bills go when Placetta can't pay them from a single-use card. */
  apEmail?: string;
  revokedAt?: string;
};
export type AuthState = "none" | "live" | "expired" | "revoked";
export function agentState(a: AgentAuth | undefined, now: string): AuthState {
  if (!a?.id) return "none";
  if (a.revokedAt) return "revoked";
  return Date.parse(a.expires) > Date.parse(now) ? "live" : "expired";
}
export const agentOf = (w: Workspace): AgentAuth | undefined => w.controls?.agent;

const lc = (s: string) => s.toLowerCase().trim();
const open = (w: Workspace) => w.apps.filter(a => a.official && !a.yours && !["approved", "filing", "filed"].includes(a.status));

/* ------------------------------------------------------------------ the packet */

export type PacketItem = {
  id: string;
  form?: string;
  app?: string;
  agency?: Bi;
  name: Bi;
  /** auth: it makes Placetta the agent; owner: the owner's own signature, made now. */
  kind: "auth" | "owner";
  sig: "esign" | "hand";
  url?: string;
  lets?: Bi;
  why?: OwnerAct["why"];
  cite: string[];
  /** Needs Placetta's agent of record named on it (the IRS designee, the city's authorized agent). */
  namesAgent: boolean;
};
export type Packet = {
  items: PacketItem[];
  /** Signed later, with why (a fact on it doesn't exist yet). */
  later: { app: string; form: string; what: Bi; why: OwnerAct["why"]; when: Bi; cite: string[] }[];
  /** Agency questions the founder should settle; each removes a touch if the answer is yes. */
  confirm: { form: string; ask: Bi }[];
  agencies: string[]; forms: string[];
  /** The packet can't be signed yet: Placetta hasn't named its agent of record. */
  blocked?: Bi;
};

/** The one-session packet for the workspace's open filings. */
export function agentPacket(w: Workspace, o: { agent?: AgentOfRecord | null } = {}): Packet {
  const items: PacketItem[] = [], later: Packet["later"] = [], confirm: Packet["confirm"] = [];
  const agencies = new Set<string>(), forms = new Set<string>();
  const seen = new Set<string>();
  const push = (x: PacketItem) => { if (!seen.has(x.id)) { seen.add(x.id); items.push(x); } };
  for (const a of open(w)) {
    const row = agentRow(a.official);
    if (!row) continue;
    if (row.confirm) confirm.push({ form: a.official!, ask: row.confirm });
    if (row.agentOk) { agencies.add(a.agency.en.trim()); forms.add(a.official!); }
    if (row.auth) push(authItem(row.auth, a, row));
    for (const act of row.owner) {
      if (act.when === "later") { later.push({ app: a.id, form: a.official!, what: act.what, why: act.why, when: act.later ?? B("Later", "之后"), cite: act.cite }); continue; }
      if (act.why !== "law" && act.why !== "agency") continue;
      // the same paper as its authorization (the SS-4 is signed once, its designee line with it): already in the packet
      const same = !!act.auth && !!row.auth;
      if (same) continue;
      push({ id: same ? row.auth!.id : `${a.official}-owner`, form: a.official, app: a.id, agency: a.agency, name: same ? B(`${a.name.en}: ${act.what.en}`, `${a.name.zh}：${act.what.zh}`) : act.what,
        kind: "owner", sig: act.sig, url: row.auth?.url, why: act.why, cite: act.cite, namesAgent: !!same });
    }
  }
  if (forms.size) items.unshift({ id: PLACETTA_AGENT.id, kind: "auth", sig: "esign", name: PLACETTA_AGENT.name, url: PLACETTA_AGENT.url, lets: PLACETTA_AGENT.lets, cite: PLACETTA_AGENT.cite, namesAgent: false });
  const blocked = !o.agent && items.some(i => i.namesAgent)
    ? B("Placetta hasn't named its agent of record yet, so the forms that name an agent can't be signed. Everything else can.", "快哉尚未指定代理人，因此需要写明代理人的表格暂不能签署，其余可以签署。") : undefined;
  return { items, later, confirm, agencies: [...agencies], forms: [...forms], ...(blocked ? { blocked } : {}) };
}
function authItem(d: AuthDoc, a: Application, _row: AgentRow): PacketItem {
  return { id: d.id, form: a.official, app: a.id, agency: a.agency, name: d.name, kind: "auth", sig: d.sig, url: d.url, lets: d.lets, cite: d.cite, namesAgent: true };
}

/* ------------------------------------------------------------------ the check before every act as agent */

export type AgentCheck = { ok: boolean; why: Bi[]; row?: AgentRow };
/** May Placetta act as this business's agent on this filing now? Each reason it can't, in plain words. The agency, form
 *  and authorization come from the workspace's own records and the cited table, never from text on a page. */
export function agentCheck(w: Workspace, app: Application, now: string): AgentCheck {
  const why: Bi[] = [];
  const row = agentRow(app.official);
  const a = agentOf(w), st = agentState(a, now);
  if (!row || !row.agentOk) why.push(B("This agency doesn't say an agent may file this for the business.", "该机构没有说明代理人可以替企业提交这项申报。"));
  if (st === "none") why.push(B("You haven't signed Placetta as your agent.", "您尚未签署“快哉作为您的代理人”。"));
  if (st === "expired") why.push(B(`Your agent authorization expired on ${a!.expires.slice(0, 10)}.`, `您的代理授权已于 ${a!.expires.slice(0, 10)} 到期。`));
  if (st === "revoked") why.push(B("You revoked Placetta's authority to act as your agent.", "您已撤销快哉的代理权限。"));
  if (a && st === "live" && row?.agentOk) {
    const off = formById(app.official!);
    if (!off || lc(off.agency.en) !== lc(app.agency.en)) why.push(B(`The agency on this filing (${app.agency.en}) isn't the agency that takes it.`, `该申报上的机构（${app.agency.zh}）不是受理它的机构。`));
    if (!a.agencies.some(x => lc(x) === lc(app.agency.en))) why.push(B(`Your agent authorization doesn't cover ${app.agency.en}.`, `您的代理授权不包括${app.agency.zh}。`));
    if (!a.forms.includes(app.official!)) why.push(B("Your agent authorization doesn't cover this filing.", "您的代理授权不包括这项申报。"));
    // the agency's own authorization form, signed and still honored
    if (row.auth) {
      const s = a.items.find(i => i.id === row.auth!.id);
      if (!s) why.push(B(`${row.auth.name.en} isn't signed yet.`, `${row.auth.name.zh}尚未签署。`));
      else if (s.expires && Date.parse(s.expires) <= Date.parse(now)) why.push(B(`${row.auth.name.en} is past the ${row.auth.months} months the agency honors it. Sign it again.`, `${row.auth.name.zh}已超过机构认可的 ${row.auth.months} 个月，请重新签署。`));
    }
  }
  return { ok: why.length === 0, why, row };
}

/** The owner's signatures for this filing that the packet already holds, still valid. */
export function presigned(w: Workspace, app: Application, now: string): boolean {
  const row = agentRow(app.official), a = agentOf(w);
  if (!row || agentState(a, now) !== "live") return false;
  const acts = row.owner.filter(o => o.why === "law" || o.why === "agency");
  if (!acts.length || acts.some(o => o.when === "later")) return false;
  return acts.every(() => a!.items.some(i => i.form === app.official && (i.id === `${app.official}-owner` || i.id === row.auth?.id) && (!i.expires || Date.parse(i.expires) > Date.parse(now))));
}

/* ------------------------------------------------------------------ touches, before and after */

export type Touch = { what: Bi; app?: string };
export type Remains = { what: Bi; app: string; why: OwnerAct["why"] | "fee" | "login"; cite: string[]; confirm?: Bi };
export type AgentTouches = {
  /** One session: Autopilot and the agent packet, every signature that can be made now. */
  signup: Touch[];
  /** During the process: what's left for the owner, each with its reason. */
  during: Touch[];
  /** Agency bills Placetta forwards to the business's accounts-payable email (no tap in Placetta; the business pays). */
  bills: Touch[];
  /** What remains the owner's, with why and the citation. */
  remains: Remains[];
};

/** The owner's touches for a plan with Autopilot and the agent packet signed, counted per act. issuing: Placetta pays
 *  agency fees from single-use cards within the Autopilot caps (Stripe Issuing, off until the founder is approved). */
export function agentTouches(w: Workspace, o: { issuing: boolean; capFiling?: number }): AgentTouches {
  const signup: Touch[] = [{ what: B("Sign Autopilot and Placetta as your agent (one e-signature)", "签署自动驾驶及“快哉作为您的代理人”（一次电子签名）") }];
  const during: Touch[] = [], bills: Touch[] = [], remains: Remains[] = [];
  const p = agentPacket(w, { agent: { name: "x", title: "x", phone: "x", email: "x" } });
  for (const i of p.items) if (i.id !== PLACETTA_AGENT.id) signup.push({ what: B(`${i.name.en} (${i.sig === "esign" ? "e-signature" : "by hand"})`, `${i.name.zh}（${i.sig === "esign" ? "电子签名" : "亲笔"}）`), app: i.app });
  for (const a of open(w)) {
    const row = agentRow(a.official);
    const n = (t: Bi): Touch => ({ what: B(`${a.name.en}: ${t.en}`, `${a.name.zh}：${t.zh}`), app: a.id });
    if (!row) { during.push(n(B("approve it (no agent route on file)", "批准（没有代理途径记录）"))); continue; }
    for (const act of row.owner) {
      if (act.when === "later") { during.push(n(act.what)); remains.push({ what: act.what, app: a.id, why: act.why, cite: act.cite, ...(row.confirm ? { confirm: row.confirm } : {}) }); }
      else remains.push({ what: act.what, app: a.id, why: act.why, cite: act.cite, ...(row.confirm ? { confirm: row.confirm } : {}) });
    }
    // fees: a single-use card within the caps, else the agency's site (the owner) or its bill (accounts payable)
    const fee = a.fees.some(f => f.tbd) ? null : a.fees.reduce((s, f) => s + Math.max(0, f.amount || 0), 0);
    const pay = paymentOf(a.official);
    if ((fee === null || fee > 0) && pay && pay !== "none" && row.sends !== "contractor") {
      // a fee not known yet still goes on a card: the card itself can't spend past the per-filing cap
      const card = o.issuing && (fee === null || fee <= (o.capFiling ?? Infinity));
      if (card) continue;
      if (pay === "invoice") bills.push(n(B("the agency's bill, forwarded to your accounts-payable email", "机构账单，自动转发到您的应付账款邮箱")));
      else { during.push(n(B("pay the agency's fee on its site", "在机构网站上支付费用"))); remains.push({ what: B("Pay the agency's fee", "支付机构费用"), app: a.id, why: "fee", cite: ["https://docs.stripe.com/issuing/controls/real-time-authorizations"] }); }
    }
    // logins: only an owner account on an agency site the owner files on
    const site = siteOf(a.official);
    if (row.account.who === "owner" && routeOf(a) === "portal" && site.site && !site.open) during.push(n(B(`save your ${site.site} login`, `保存 ${site.site} 登录信息`)));
  }
  return { signup, during, bills, remains };
}

/* ------------------------------------------------------------------ patches */

type P = (w: Workspace) => Workspace;
const withAgent = (w: Workspace, a: AgentAuth | undefined): Workspace => ({ ...w, controls: { ...(w.controls ?? {}), agent: a } });
/** The workspace's copy of the packet the database just recorded. */
export const putAgent = (a: AgentAuth): P => w => audit("you", B("Signed Placetta as your agent", "签署了“快哉作为您的代理人”"), B(`${a.by}, until ${a.expires.slice(0, 10)}`, `${a.by}，有效至 ${a.expires.slice(0, 10)}`),
  B(`${a.items.length} signed: ${a.agencies.length} agencies, ${a.forms.length} filings; agent of record ${a.agent}`, `已签 ${a.items.length} 份：${a.agencies.length} 个机构、${a.forms.length} 项申报；代理人 ${a.agent}`))(withAgent(w, a));
/** Revoked: every act as agent stops at once (the database stops what hasn't left Placetta). */
export const revokeAgent = (now: string): P => w => {
  const a = agentOf(w);
  if (!a || a.revokedAt) return w;
  return audit("you", B("Revoked Placetta as your agent", "撤销了快哉的代理权限"), B(a.by, a.by))(withAgent(w, { ...a, revokedAt: now }));
};
/** One act as agent, in the audit trail: who acted (the named person, or Odelia for a packet she sent), what, for which
 *  agency, under which authorization. */
export const actAsAgent = (app: Application, act: Bi, who: string): P => w => {
  const a = agentOf(w);
  return audit("agent", B(`Acted as your agent: ${act.en}`, `以您的代理人身份：${act.zh}`), app.name, B(`${app.agency.en}; by ${who}; under the authorization of ${a?.at.slice(0, 10) ?? "?"}`, `${app.agency.zh}；由 ${who}；依据 ${a?.at.slice(0, 10) ?? "?"} 的授权`))(w);
};
