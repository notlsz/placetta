import { B, same, type Bi } from "./bi";
import { audit, isBlank } from "./core";
import { formById } from "./forms/registry";
import { routeOf } from "./approvalRoute";
import { ownerOnly, paymentOf, signPath, siteOf, SIGN_WHY, type SignPath } from "./forms/esign";
import { detectInjection } from "./security/detect";
import { preflight } from "./smart";
import type { Application, Approval, Workspace } from "./model";

/* ------------------------------------------------------------------ *
 * Autopilot: one setup, then Odelia files on her own, within the law.
 *
 * The owner signs one standing authorization (the Filing Authorization's
 * "Autopilot" section, src/legal.ts) instead of approving each filing:
 * these stores, these agencies, these filing types, a per-filing and a
 * monthly agency-fee cap, 12 months, revocable in one tap. The database
 * keeps the signed record and checks every limit again before a filing
 * goes in (supabase/migrations/20261103090000_autopilot.sql); this file
 * is the same rule in the app and in Odelia's runs, so the owner sees
 * exactly what she will do alone and what still needs a person, and why.
 *
 * A filing goes without a tap only when it passes every check below. What
 * stays with a person, and why:
 *   law      a signature that declares something under penalty of perjury
 *            (or one Placetta can't confirm doesn't), an agency that takes
 *            the filing only from the business itself, a business rule
 *            that wants two owners
 *   wet      a handwritten signature: a printed packet the owner signs
 *   card     an agency fee paid by card on the agency's own site (Placetta
 *            never types a card number: zero-touch fees need Stripe Issuing
 *            single-use cards, a founder decision, see SETUP.md "Autopilot")
 *   invoice  the agency bills after it has the filing: filed without a tap,
 *            the bill comes to the owner later
 *   login    the agency's site needs the owner's own account (Placetta never
 *            creates one): saved once in Settings
 *   check    anything the automated checks didn't pass
 * The two-key team check on an agency's first filings stays: that's the
 * Placetta team's touch, never the owner's.
 * ------------------------------------------------------------------ */

export const AUTOPILOT_MONTHS = 12;

export type AutopilotScope = { stores: string[]; agencies: string[]; forms: string[] };
/** The workspace's copy of the signed authorization (controls.autopilot): the database's row is the record. */
export type AutopilotGrant = {
  id: string; by: string; title?: string; at: string; expires: string; ip?: string; version: string;
  scope: AutopilotScope; capFiling: number; capMonth: number; sig: "typed" | "drawn"; revokedAt?: string;
};
/** Filings made under Autopilot this month, for the monthly cap the app shows (the database counts its own). */
export type AutopilotUse = { app: string; fee: number; at: string; grant: string };

export type GrantState = "none" | "live" | "expired" | "revoked";
export function grantState(g: AutopilotGrant | undefined, now: string): GrantState {
  if (!g?.id) return "none";
  if (g.revokedAt) return "revoked";
  return Date.parse(g.expires) > Date.parse(now) ? "live" : "expired";
}
export const grantOf = (w: Workspace): AutopilotGrant | undefined => w.controls?.autopilot;
/** Autopilot is on: the dial is on it and the authorization is live. */
export const autopilotOn = (w: Workspace, now: string) => w.controls?.autonomy === "autopilot" && grantState(grantOf(w), now) === "live";

/* ------------------------------------------------------------------ who, where, how much */

/** The scope key of the store an application belongs to ("business" when the workspace has no stores, or it's a
 *  filing for the whole business). */
export function storeOf(w: Workspace, appId: string): string {
  const s = (w.stores ?? []).find(x => (x.apps ?? []).includes(appId));
  return s?.id ?? "business";
}
export const agencyOf = (a: Pick<Application, "agency">) => a.agency.en.trim();
/** The application's agency fee, or null when it isn't known yet (a cap can't be held to an unknown fee). */
export function feeOf(a: Application): number | null {
  if (a.fees.some(f => f.tbd)) return null;
  return a.fees.reduce((s, f) => s + Math.max(0, f.amount || 0), 0);
}
const lc = (s: string) => s.toLowerCase().trim();
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** What the sign sheet offers, ticked: every store, agency and filing type in the plan that isn't filed yet. */
export function defaultScope(w: Workspace): AutopilotScope {
  const open = w.apps.filter(a => a.official && !a.yours && !["approved", "filing", "filed"].includes(a.status));
  return {
    stores: [...new Set(open.map(a => storeOf(w, a.id)))],
    agencies: [...new Set(open.map(agencyOf))],
    forms: [...new Set(open.map(a => a.official!))],
  };
}
/** Autopilot fees this month (the ledger the workspace keeps; the database counts its own filings). */
export function monthUsed(w: Workspace, now: string): number {
  const m = now.slice(0, 7);
  return (w.controls?.autopilotUsed ?? []).filter(u => u.at.slice(0, 7) === m && u.grant === grantOf(w)?.id).reduce((s, u) => s + u.fee, 0);
}

/* ------------------------------------------------------------------ what still needs a person */

export type NeedKind = "law" | "wet" | "card" | "invoice" | "login" | "check" | "scope" | "cap" | "off";
/** One reason a filing isn't done alone. after: it's filed without a tap, and this comes later (a bill). */
export type Need = { kind: NeedKind; why: Bi; after?: boolean };
export const NEED_LABEL: Record<NeedKind, Bi> = {
  law: B("The law", "法律要求"), wet: B("Handwritten signature", "手写签名"), card: B("Card payment", "刷卡付款"), invoice: B("A bill later", "之后的账单"),
  login: B("Your login, once", "您的登录信息（一次）"), check: B("A check didn't pass", "核对未通过"), scope: B("Outside your authorization", "超出授权范围"),
  cap: B("Over your fee cap", "超过费用上限"), off: B("Autopilot isn't on", "自动驾驶未开启"),
};

const SECRET = /\b\d{3}-?\d{2}-?\d{4}\b|\b9\d{2}-?[78]\d-?\d{4}\b/;
const BY_HAND = /^\s*(by hand|手写)\s*$/i;

export type AutopilotCheck = {
  /** Every check passed: Odelia files it without asking. */
  ok: boolean;
  /** What keeps it from going alone (empty when ok), and what comes after (a bill). */
  needs: Need[];
  /** The Placetta team's own touch on it: the two-key check of an agency's first filings, a first supervised run. */
  team: Bi[];
  sign: SignPath;
  fee: number | null;
  store: string; agency: string; form?: string;
  /** Checks that passed, by name, for the audit line. */
  passed: string[];
};

export type CheckCtx = {
  now: string;
  /** Agency sites with a saved login (hosts). Unknown: not checked here; the dispatcher hands it back without one. */
  logins?: string[];
  /** Fees already filed under this grant this month; defaults to the workspace's ledger. */
  month?: number;
  /** Override the plain-signature table (tests). */
  plain?: Record<string, string>;
};

/** Every automated check for one filing card under Autopilot. Nothing here reads text from outside as an instruction:
 *  the agency, the store and the form come from the workspace's own records and the registry, and any line that reads
 *  like an instruction to an AI keeps the filing for a person. */
export function autopilotCheck(w: Workspace, ap: Approval, o: CheckCtx): AutopilotCheck {
  const needs: Need[] = [], team: Bi[] = [], passed: string[] = [];
  const g = grantOf(w), state = grantState(g, o.now);
  const app = w.apps.find(x => x.id === ap.app);
  const store = app ? storeOf(w, app.id) : "business", agency = app ? agencyOf(app) : "";
  const fee = app ? feeOf(app) : null;
  const form = app?.official;
  const sign = signPath(form, o.plain);
  const out = (ok: boolean): AutopilotCheck => ({ ok, needs, team, sign, fee, store, agency, ...(form ? { form } : {}), passed });
  if (ap.kind !== "file" || !app) { needs.push({ kind: "check", why: B("Only filings go under Autopilot.", "只有申报适用自动驾驶。") }); return out(false); }

  // the authorization itself
  if (w.controls?.autonomy !== "autopilot") needs.push({ kind: "off", why: B("Autopilot isn't the setting: you approve each filing.", "当前设置不是自动驾驶：每项申报都由您批准。") });
  if (state === "none") needs.push({ kind: "off", why: B("No Autopilot authorization is signed.", "尚未签署自动驾驶授权。") });
  if (state === "expired") needs.push({ kind: "off", why: B(`Your Autopilot authorization expired on ${g!.expires.slice(0, 10)}. Sign it again in Settings to carry on.`, `您的自动驾驶授权已于 ${g!.expires.slice(0, 10)} 到期。请在设置中重新签署。`) });
  if (state === "revoked") needs.push({ kind: "off", why: B("Autopilot was turned off.", "自动驾驶已关闭。") });
  if (state === "live") passed.push("authorization");

  // scope: the store, the agency and the filing type the owner ticked
  if (g && state === "live") {
    if (!form || !g.scope.forms.includes(form)) needs.push({ kind: "scope", why: B("This filing type isn't in your Autopilot authorization.", "这类申报不在您的自动驾驶授权内。") });
    if (!g.scope.stores.includes(store)) needs.push({ kind: "scope", why: B("This store isn't in your Autopilot authorization.", "这家门店不在您的自动驾驶授权内。") });
    if (!g.scope.agencies.some(x => lc(x) === lc(agency))) needs.push({ kind: "scope", why: B(`${agency || "This agency"} isn't in your Autopilot authorization.`, `${app.agency.zh || "该机构"}不在您的自动驾驶授权内。`) });
    if (!needs.some(n => n.kind === "scope")) passed.push("scope");
    // the fee: known, within the per-filing cap and this month's
    if (fee === null) needs.push({ kind: "cap", why: B("The agency's fee isn't known yet, so it can't be held to your cap.", "机构费用尚未确定，无法对照您的上限。") });
    else if (fee > g.capFiling) needs.push({ kind: "cap", why: B(`The fee (${money(fee)}) is over your ${money(g.capFiling)} per-filing cap.`, `费用（${money(fee)}）超过您的单项上限 ${money(g.capFiling)}。`) });
    else if ((o.month ?? monthUsed(w, o.now)) + fee > g.capMonth) needs.push({ kind: "cap", why: B(`It would take this month's Autopilot fees past your ${money(g.capMonth)} monthly cap.`, `会使本月自动驾驶费用超过您的每月上限 ${money(g.capMonth)}。`) });
    else passed.push("fee cap");
  }

  // the right agency: the application's agency is the official form's own, and the card says the same
  const off = form ? formById(form) : undefined;
  if (!off) needs.push({ kind: "check", why: B("No official form on file for it, so there's no verified agency or route.", "没有对应的官方表格，因此没有核实过的机构或提交方式。") });
  else if (lc(off.agency.en) !== lc(agency) || (ap.agency && lc(ap.agency.en) !== lc(agency))) needs.push({ kind: "check", why: B(`The agency on it (${ap.agency?.en ?? agency}) isn't the agency that takes ${off.form} (${off.agency.en}).`, `申请上的机构（${ap.agency?.zh ?? app.agency.zh}）与受理 ${off.form} 的机构（${off.agency.zh}）不一致。`) });
  else passed.push("agency");

  // the line check (the same second look as the approval card), no SSN or ITIN, nothing that reads like an instruction
  const pf = preflight(w, ap, o.now.slice(0, 10));
  const empty = app.fields.filter(f => isBlank(f.value)), missing = app.checklist.filter(c => c.state === "missing");
  if (pf.errors.length || empty.length || missing.length) needs.push({ kind: "check", why: B(`The line check didn't pass${pf.errors[0] ? `: ${pf.errors[0].label.en}, ${pf.errors[0].note.en}` : empty.length ? `: ${empty[0].label.en} is empty` : `: ${missing[0].label.en} is missing`}.`, `逐行核对未通过${pf.errors[0] ? `：${pf.errors[0].label.zh}，${pf.errors[0].note.zh}` : empty.length ? `：${empty[0].label.zh}未填写` : `：缺少${missing[0].label.zh}`}。`) });
  else passed.push("line check");
  if (app.fields.some(f => SECRET.test(f.value))) needs.push({ kind: "check", why: B("A line holds what looks like an SSN or ITIN. Placetta never sends one.", "某一行含有疑似 SSN 或 ITIN 的号码。快哉从不发送这类号码。") });
  else passed.push("no SSN");
  if (app.fields.some(f => BY_HAND.test(f.value))) needs.push({ kind: "wet", why: B("A line is to be written by hand on the signed copy.", "有一行需要在签字件上手写。") });
  const words = [...app.fields.map(f => `${f.label.en}: ${f.value}`), ...ap.does.map(d => d.en)].join("\n");
  if (detectInjection(words).verdict !== "clean") needs.push({ kind: "check", why: B("Something on it reads like an instruction to an AI, so a person looks first.", "其中有内容像是写给 AI 的指令，因此先由人查看。") });
  else passed.push("no planted instructions");

  // two owners under a business rule: the owners' own taps, never Autopilot's
  if (ap.second || (w.controls?.business ?? []).some(r => r.on !== false && r.then.action === "second_owner" && (r.when.event === "filing_approval" || (r.when.event === "fee_over" && (fee ?? Infinity) > Number(r.when.amount ?? 0)))))
    needs.push({ kind: "law", why: B("Your business rule wants two owners to approve it.", "您的业务规则要求两位所有者批准。") });

  // the route: Odelia sends it on the agency's site, by email, fax or mail; or the business sends it
  const route = routeOf(app);
  if (ownerOnly(form) || route === "owner" || route === "ownerSigns") needs.push({ kind: "law", why: B("The agency takes this one only from the business itself. Odelia prepares the packet; you send it.", "该机构只接受企业本人提交。Odelia 准备好材料包，由您提交。") });
  else if (route === "team" || route === "notReady") needs.push({ kind: "check", why: route === "notReady" ? B("Automatic filing isn't switched on for this form yet. Odelia prepares it; you submit it.", "这份表格尚未开通自动提交。Odelia 准备好，由您提交。") : B("Placetta has no checked way to send this form to the agency yet. Odelia prepares it; you send it.", "快哉尚未核实这份表格的提交方式。Odelia 准备好，由您提交。") });
  else passed.push("route");

  // the signature
  if (sign === "tap") needs.push({ kind: "law", why: SIGN_WHY.tap });
  if (sign === "wet" || route === "faxSigned") { if (!needs.some(n => n.kind === "wet")) needs.push({ kind: "wet", why: SIGN_WHY.wet }); }
  if (sign === "adopted" || sign === "none") passed.push("signature");

  // the fee: who pays, and when
  const pay = paymentOf(form);
  if (fee !== null && fee > 0 && (pay === "portal" || pay === undefined) && route === "portal") needs.push({ kind: "card", why: B(`The agency takes its fee (${money(fee)}) by card on its own site, and Placetta never types a card number: you pay it when Odelia reaches that page.`, `机构在其网站上刷卡收取费用（${money(fee)}），快哉从不输入卡号：Odelia 到达付款页面时由您支付。`) });
  else if (pay === "portal" && route === "portal" && fee === null) needs.push({ kind: "card", why: B("The agency takes its fee by card on its own site: you pay it when Odelia reaches that page.", "机构在其网站上刷卡收费：Odelia 到达付款页面时由您支付。") });
  if (pay === "with_filing" || pay === "in_person") needs.push({ kind: "card", why: pay === "in_person" ? B("The agency takes its fee in person.", "机构要求当面缴费。") : B("A check or card form has to go with the filing, and Placetta never sends money.", "申请须随附支票或刷卡授权表，快哉从不代付款项。") });
  if (pay === "invoice") needs.push({ kind: "invoice", after: true, why: B("The agency bills after it has the filing: Odelia files it, and you pay the bill when it comes.", "机构收到申请后才开账单：Odelia 提交后，账单到了由您支付。") });

  // the agency's site: the owner's own account, saved once (never created by Placetta)
  const site = siteOf(form);
  if (route === "portal" && site.site && !site.open && o.logins && !o.logins.some(h => h === site.site || h.endsWith("." + site.site) || site.site!.endsWith("." + h)))
    needs.push({ kind: "login", why: B(`Save your ${site.site} login once in Settings. Placetta never creates an account on an agency's site.`, `请在设置中保存一次您的 ${site.site} 登录信息。快哉从不在机构网站上开设账户。`) });

  // the team's own touch: never the owner's
  if (route === "portal" || route === "email" || route === "fax" || route === "mail") team.push(B("The Placetta team checks the first filings of each form (and watches the first run on each agency site) before they go.", "快哉团队会先核对每种表格的前几份申报（并在每个机构网站的首次提交时在旁监看），然后再发出。"));

  const blocking = needs.filter(n => !n.after);
  return out(blocking.length === 0);
}

/* ------------------------------------------------------------------ the Autopilot screen */

export type PlanRow = { app: string; name: Bi; agency: Bi; alone: boolean; needs: Need[]; team: Bi[]; sign: SignPath };
/** What Odelia will do alone and what still needs a person, for every filing not yet filed, under the grant as it is
 *  (or as the owner is about to sign it: pass `as`). */
export function autopilotPlan(w: Workspace, o: CheckCtx & { as?: AutopilotGrant }): PlanRow[] {
  const ws: Workspace = o.as ? { ...w, controls: { ...(w.controls ?? {}), autopilot: o.as, autonomy: "autopilot" } } : w;
  return ws.apps.filter(a => !a.yours && !["approved", "filing", "filed"].includes(a.status)).map(a => {
    const ap: Approval = ws.approvals.find(x => x.app === a.id && x.kind === "file") ?? { id: "ap-plan-" + a.id, kind: "file", app: a.id, title: a.name, agency: a.agency, does: [], action: B("File", "提交") };
    // a card that isn't up yet: its lines are checked when Odelia fills them, so only what the plan already knows counts
    const c = autopilotCheck(ws, ap, o);
    const needs = ws.approvals.some(x => x.id === ap.id) ? c.needs : c.needs.filter(n => !(n.kind === "check" && /line check|empty|missing|未填写|缺少|逐行/.test(n.why.en + n.why.zh)));
    return { app: a.id, name: a.name, agency: a.agency, alone: !needs.some(n => !n.after), needs, team: c.team, sign: c.sign };
  });
}

/** The touches an owner makes for a plan, counted the same way before and after Autopilot: each approval tap, each
 *  signature, each fee paid, each packet sent by hand, each saved login (once per site), and signing Autopilot itself. */
export type Touch = { what: Bi; app?: string };
export function ownerTouches(w: Workspace, o: CheckCtx & { as: AutopilotGrant }): { before: Touch[]; after: Touch[] } {
  const before: Touch[] = [], after: Touch[] = [];
  const sites = new Set<string>(), sitesAfter = new Set<string>();
  const rows = autopilotPlan(w, o);
  after.push({ what: B("Sign the Autopilot authorization, once", "签署一次自动驾驶授权") });
  for (const r of rows) {
    const a = w.apps.find(x => x.id === r.app)!;
    const route = routeOf(a), fee = feeOf(a), pay = paymentOf(a.official), site = siteOf(a.official);
    const n = (t: string, z: string) => ({ what: B(`${a.name.en}: ${t}`, `${a.name.zh}：${z}`), app: a.id });
    const sends = route === "owner" || route === "ownerSigns" || route === "team" || route === "notReady";
    const wet = r.sign === "wet" || route === "faxSigned", esign = r.sign === "tap" || r.sign === "adopted";
    const pays = (fee === null || fee > 0) && !!pay && pay !== "none";
    const payWords = pay === "invoice" ? n("pay the agency's bill when it comes", "账单到了后支付") : n("pay the agency's fee on its site", "在机构网站上支付费用");
    const login = route === "portal" && !!site.site && !site.open;
    // before: the owner approves every filing, signs in the card or by hand, sends what Odelia can't, and pays
    before.push(n("approve it", "批准"));
    if (esign) before.push(n("sign it in the card", "在卡片中签名"));
    if (wet) before.push(n("sign the printed packet by hand", "在打印件上亲笔签名"));
    if (sends) before.push(n("send it yourself", "自行提交"));
    if (pays) before.push(payWords);
    if (login && !sites.has(site.site!)) { sites.add(site.site!); before.push({ what: B(`Save your ${site.site} login`, `保存 ${site.site} 登录信息`) }); }
    // after: nothing for a filing Autopilot takes alone; otherwise one act of the owner's own (a tap that signs a sworn
    // form with the saved signature, a hand signature, or an approval when a check didn't pass), then what only they do
    if (!r.alone) {
      if (r.sign === "tap") after.push(n("tap to sign it with your saved signature (a sworn declaration is yours to make)", "点一下，用您保存的签名签署（宣誓声明须由您本人作出）"));
      else if (wet) after.push(n("sign the printed packet by hand", "在打印件上亲笔签名"));
      else if (!sends) after.push(n("approve it (a check didn't pass)", "批准（有核对未通过）"));
      if (sends) after.push(n("send it yourself", "自行提交"));
    }
    if (pays) after.push(payWords);
    if (login && !sitesAfter.has(site.site!)) { sitesAfter.add(site.site!); after.push({ what: B(`Save your ${site.site} login, once`, `保存一次 ${site.site} 登录信息`) }); }
  }
  return { before, after };
}

/* ------------------------------------------------------------------ patches */

type P = (w: Workspace) => Workspace;
/** The workspace's copy of a grant the database just recorded (or, outside an account, the grant itself), with the dial
 *  on Autopilot. */
export const putGrant = (g: AutopilotGrant): P => w => audit("you", B("Signed the Autopilot authorization", "签署了自动驾驶授权"), B(`${g.by}, until ${g.expires.slice(0, 10)}`, `${g.by}，有效至 ${g.expires.slice(0, 10)}`),
  B(`${g.scope.stores.length} stores, ${g.scope.agencies.length} agencies, ${g.scope.forms.length} filings; up to ${money(g.capFiling)} a filing and ${money(g.capMonth)} a month`, `${g.scope.stores.length} 家门店、${g.scope.agencies.length} 个机构、${g.scope.forms.length} 项申报；每项最多 ${money(g.capFiling)}，每月最多 ${money(g.capMonth)}`))(
  { ...w, controls: { ...(w.controls ?? {}), autopilot: g, autonomy: "autopilot" } });
/** One tap off: the grant ends now, the dial goes back to asking each time, and any card marked to go under Autopilot
 *  is unmarked (it waits for the owner again). */
export const revokeGrant = (now: string): P => w => {
  const g = grantOf(w);
  if (!g || g.revokedAt) return w;
  return audit("you", B("Turned off Autopilot", "关闭了自动驾驶"), same(g.by))({
    ...w, controls: { ...(w.controls ?? {}), autopilot: { ...g, revokedAt: now }, autonomy: w.controls?.autonomy === "autopilot" ? "usual" : w.controls?.autonomy },
    approvals: w.approvals.map(a => (a.autopilot && !a.autopilot.filing ? { ...a, autopilot: undefined, autopilotWhy: [B("Autopilot was turned off before this was sent. Approve it yourself if you still want it filed.", "发送前自动驾驶已关闭。如仍要提交，请您亲自批准。")] } : a)),
  });
};
/** A card that passed every check: marked to be filed under the grant, counted toward the month, in the audit trail. */
export const markAutopilot = (apId: string, c: AutopilotCheck, now: string): P => w => {
  const g = grantOf(w), ap = w.approvals.find(a => a.id === apId);
  if (!g || !ap) return w;
  return audit("agent", B("Filing it for you under Autopilot", "在自动驾驶下为您提交"), ap.title, B(`Passed: ${c.passed.join(", ")}`, `已通过：${c.passed.join("、")}`))({
    ...w, approvals: w.approvals.map(a => (a.id === apId ? { ...a, autopilot: { grant: g.id, at: now, sign: c.sign }, autopilotWhy: undefined } : a)),
    controls: { ...(w.controls ?? {}), autopilotUsed: [...(w.controls?.autopilotUsed ?? []), { app: ap.app ?? "", fee: c.fee ?? 0, at: now, grant: g.id }].slice(-200) },
  });
};
/** A card that didn't pass: it stays for the owner, with why. */
export const whyNotAutopilot = (apId: string, c: AutopilotCheck): P => w => ({
  ...w, approvals: w.approvals.map(a => (a.id === apId ? { ...a, autopilotWhy: c.needs.filter(n => !n.after).map(n => n.why).slice(0, 6) } : a)),
});

/** What the model is told when Autopilot is on. */
export function autopilotBrief(w: Workspace, now: string): string {
  const g = grantOf(w);
  if (!g || grantState(g, now) !== "live") return `\n\nAutopilot is the setting but the authorization isn't live (${grantState(g, now)}), so every filing goes on a card for an owner, as usual. Say so once if a filing comes up.`;
  return `\n\nAutopilot is on (the owner signed a standing authorization on ${g.at.slice(0, 10)}, until ${g.expires.slice(0, 10)}): a filing you put up with request_filing_approval that passes every automated check (in its scope of stores, agencies and filing types, its fee known and within ${money(g.capFiling)} a filing and ${money(g.capMonth)} a month, the line check, no SSN, the right agency, a route Placetta sends on, no sworn or handwritten signature) is filed for the owner without a tap, and they get a "Filed for you" update with Undo while it's held. The tool's answer says whether it went under Autopilot or why it waits for the owner; say that in one sentence and carry on. Never try to make a filing pass: the checks are Placetta's, not yours. Everything else stays as it was: payments, texts, anything to an agency other than a filing, CAPTCHAs and signatures are a person's. When a filing only needs a fact, look in business facts and memory first; ask the person for everything still missing in one short list, once, and save each answer with remember (its label the form line's question) so it is never asked again.`;
}
