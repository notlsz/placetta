/* The appeal, end to end: a denial becomes a case the owner can carry through without a lawyer where the law and the
   agency allow it, and a complete packet for counsel where it doesn't.

   What it copies from DoNotPay (https://donotpay.com, read 2026-10-23), because it works:
     guided questions     one plain question at a time, in English and Chinese, instead of a form to puzzle over
     the letter           written from the answers, with the right legal hook: the section that makes it timely and the
                          grounds the playbook lists, each tied to an exhibit
     sending it for them  DoNotPay sells "Mailing as a Service" and "Online Fax"; Placetta's filer sends the approved
                          appeal by the agency's own channel (email, fax, certified mail or its site) and keeps the proof
     deadlines            the last day the rule allows and a file-by date a few days earlier, both on Deadlines
     the self-help line   "DoNotPay is not a law firm and does not provide legal advice"; so is every Placetta output
   What it doesn't, because it hurt DoNotPay:
     untested claims      the FTC's 2025 order (https://www.ftc.gov/node/87474): DoNotPay "did not test whether its 'AI
                          lawyer' operated to the level of a human lawyer" and "did not hire or retain attorneys to test
                          the quality and accuracy" of its law-related features. Here every rule, fee and channel comes
                          from the agency's own page with the day it was read, and the tests check every citation.
     no lawyer anywhere   the 2023 class action (Faridian v. DoNotPay, San Francisco Superior Court) alleged it "is not
                          supervised by any lawyer". Here each playbook has a cited route (TIERS): where counsel is
                          advised, Placetta does only what a non-lawyer lawfully may and hands counsel the packet.
     overpromising        no success rate, no "win", no prediction. DoNotPay's site claims it "helped people save
                          millions of dollars"; Placetta claims nothing it can't show.
     sending unseen work  nothing is filed, sent or paid without the owner's approval card.
   Pure: the appeal_case tool (src/live.ts) drives it; the tests run it without a model. */
import { B, same, type Bi } from "../bi";
import type { Application, CheckItem, Field } from "../model";
import { appealById, CHANNELS, counselPacket, daysLeft, deadlineFor, NOT_A_LAW_FIRM, ROUTE_NAME, sourcesOf, TIERS, type Appeal, type AppealId, type Deadline, type Route, type Served } from "./index";

/** Days before the target the file-by date sits: room for a weekend, a slow inbox or a signature. Never moves a date
 *  later than the rule allows. */
export const SAFETY_DAYS = 3;

export type QKind = "date" | "choice" | "multi" | "text";
export type Question = { id: string; ask: Bi; kind: QKind; options?: { id: string; label: Bi }[]; why: Bi };
export type Answers = Record<string, string | string[]>;
export type Outcome = "granted" | "granted_with_conditions" | "denied" | "withdrawn" | "settled";
export type CaseStage = "interview" | "drafted" | "awaiting_approval" | "filed" | "hearing" | "decided" | "with_attorney";
/** One denial being appealed (Workspace.appeals). */
export type AppealCase = {
  id: string; app: string; playbook: AppealId; route: Route; store?: string;
  decided?: string; served?: Served; reason: string;
  answers: Answers;
  stage: CaseStage;
  /** The target the rule gives (never later than the law), and the file-by date SAFETY_DAYS before it. */
  lastDay?: string; fileBy?: string;
  /** The appeal's own application, which the owner approves and the filer sends. */
  filing?: string;
  letter?: string;
  /** Liquor and zoning steps done before the hearing, by id, with the day. */
  prep?: Record<string, string>;
  hearing?: { date: string; how?: string };
  outcome?: { at: string; result: Outcome; note: string; next?: AppealId };
  handoff?: { at: string; to: string };
  created: string; updated: string;
};

const LIQUOR = new Set<AppealId>(["ca_abc_denial_hearing", "tx_tabc_denial_hearing", "ny_sla_disapproval"]);
const ZONING = new Set<AppealId>(["sf_board_of_appeals_variance", "la_planning_appeal", "sf_board_of_appeals_zoning_admin", "sf_board_of_appeals_za_violation", "nyc_bsa_appeal"]);
/** Attorney-advised playbooks whose first filing a non-lawyer may make on time: ABC's petition after a denial ("the
 *  applicant may present his written petition", B&P §24011), TABC's written request for hearing (16 TAC §33.60(b)), and
 *  the two zoning appeals whose rules let an owner file (the SF Board: "Parties are not required to be represented by
 *  attorneys"; LA Planning's appeal application). Counsel takes the hearing. */
export const REQUEST_OK = new Set<AppealId>(["ca_abc_denial_hearing", "tx_tabc_denial_hearing", "sf_board_of_appeals_variance", "la_planning_appeal"]);
export const isLiquor = (id: AppealId) => LIQUOR.has(id);
export const isZoning = (id: AppealId) => ZONING.has(id);
/** Placetta may put this playbook's filing up for the owner's approval. */
export const mayFile = (ap: Appeal) => TIERS[ap.id].route !== "attorney" || REQUEST_OK.has(ap.id);

const isHearing = (ap: Appeal) => /hearing|board|commission|oath/i.test(`${ap.name.en} ${ap.body.en}`) && ap.id !== "ca_health_plan_review" && ap.id !== "nyc_dcwp_denial" && ap.id !== "business_license_denial";
const timedByMail = (ap: Appeal) => /mail|receipt|service|served/i.test(ap.deadline.trigger.en);

/* ------------------------------ the questions ------------------------------ */

const ASKS: { id: string; label: Bi }[] = [
  { id: "reverse", label: B("Reverse the decision and issue it", "撤销决定并发证") },
  { id: "conditions", label: B("Issue it with conditions", "附条件发证") },
  { id: "time", label: B("Give time to correct it, then look again", "给予整改时间后重新审查") },
];
const CONDITIONS: { id: string; label: Bi }[] = [
  // the kinds of condition the playbook's own grounds name ("hours, no off-sale, security")
  { id: "hours", label: B("Shorter hours for alcohol sales", "缩短酒类销售时间") },
  { id: "no_off_sale", label: B("No sales to take away", "不外卖酒类") },
  { id: "security", label: B("Security staff or cameras", "安保人员或监控") },
];

/** The questions for this playbook, in the order they're asked. One at a time; the ones the record already answers are
 *  skipped. */
export function questionsFor(ap: Appeal, known: { decided?: string; reason?: string } = {}): Question[] {
  const q: Question[] = [];
  if (!known.decided) q.push({ id: "decided", kind: "date", ask: B("What date is printed on the decision or notice? (YYYY-MM-DD)", "决定书或通知上印的日期是哪天？（YYYY-MM-DD）"),
    why: B(`The deadline is counted from it: ${ap.deadline.section}.`, `截止日期从这一天起算：${ap.deadline.section}。`) });
  if (timedByMail(ap)) q.push({ id: "served", kind: "choice", ask: B("How did the decision reach you?", "决定是通过什么方式送达您的？"),
    options: [{ id: "mail", label: B("By mail", "邮寄") }, { id: "email", label: B("By email", "电子邮件") }, { id: "hand", label: B("Handed to me", "当面交给我") }],
    why: B(`The rule counts from ${ap.deadline.trigger.en.toLowerCase()}.`, `规则从${ap.deadline.trigger.zh}起算。`) });
  if (!known.reason) q.push({ id: "reason", kind: "text", ask: B("What reason does the letter give? Copy its words.", "来函给出的理由是什么？请照抄原文。"),
    why: B("The letter answers the agency's own reason.", "上诉信要回应机构自己给出的理由。") });
  q.push({ id: "number", kind: "text", ask: B("What permit, application or case number is on the letter? (Type none if there isn't one.)", "来函上的许可、申请或案件编号是多少？（没有请填 none）"),
    why: B("The body finds the file by it.", "受理机构凭此查找案卷。") });
  q.push({ id: "grounds", kind: "multi", ask: B("Which of these are true for you? Pick every one that is.", "以下哪些符合您的情况？请选出所有符合的。"),
    options: ap.grounds.map((g, i) => ({ id: `g${i + 1}`, label: g })), why: B("These are the grounds this body hears; only the true ones go in.", "这些是该机构受理的理由；只写入属实的。") });
  q.push({ id: "facts", kind: "text", ask: B("In two or three sentences: what did the agency get wrong, or what have you fixed since?", "用两三句话说明：机构哪里判断有误，或之后您做了哪些整改？"),
    why: B("Facts, not argument: each one should match a document you can attach.", "写事实而非争辩：每一点都应有可附上的文件。") });
  if (isLiquor(ap.id)) {
    q.push({ id: "protests", kind: "text", ask: B("How many protests were filed, and what do they say? (Type none if there weren't any.)", "共有多少份抗议，内容是什么？（没有请填 none）"),
      why: B("Each protest gets its own answer.", "每份抗议都需单独回应。") });
    if (ap.id === "ca_abc_denial_hearing") q.push({ id: "conditions", kind: "multi", ask: B("Which conditions on the license could you live with for as long as you hold it?", "以下哪些执照附加条件是您在持照期间都能遵守的？"),
      options: [...CONDITIONS, { id: "none", label: B("None of these", "都不能接受") }], why: B("ABC may put reasonable conditions on a license, and they bind it.", "ABC 可对执照附加合理条件，条件对执照具有约束力。") });
    if (ap.id === "ny_sla_disapproval") q.push({ id: "community_board", kind: "text", ask: B("When did you send the 30-day notice to the community board, and how? (Type not sent if you haven't.)", "您何时、以何种方式向社区委员会发出 30 天通知？（未发出请填 not sent）"),
      why: B("The SLA can't process an on-premises application without it.", "没有该通知，SLA 无法处理堂食酒牌申请。") });
  }
  if (isZoning(ap.id) || isLiquor(ap.id)) q.push({ id: "neighbors", kind: "text", ask: B("Who objected, if you know (names, or the nearest addresses)? (Type none if no one did.)", "谁提出了反对（姓名或最近的地址）？（没有请填 none）"),
    why: B("Placetta drafts a letter offering to meet them, for your approval.", "快哉会起草一封约见信，交您批准后发出。") });
  q.push({ id: "ask", kind: "choice", ask: B("What do you want the decision-maker to do?", "您希望决策者怎么做？"), options: ASKS, why: B("The letter ends with one clear request.", "上诉信以一个明确的请求结尾。") });
  if (isHearing(ap)) q.push({ id: "attend", kind: "choice", ask: B("How can you attend a hearing?", "您能以什么方式出席听证？"),
    options: [{ id: "in_person", label: B("In person", "亲自到场") }, { id: "remote", label: B("By phone or video", "电话或视频") }, { id: "either", label: B("Either", "都可以") }],
    why: B("Placetta prepares the one-page script for the way you'll be there.", "快哉按您出席的方式准备一页发言稿。") });
  q.push({ id: "signer", kind: "text", ask: B("Who signs it? Name and title.", "由谁签名？请写姓名和职务。"), why: B("The owner or an officer signs the appeal.", "上诉由业主或高管签名。") });
  return q;
}

/** The next question still unanswered, or null when the interview is done. */
export const nextQuestion = (ap: Appeal, c: Pick<AppealCase, "answers" | "decided" | "reason">) =>
  questionsFor(ap, { decided: c.decided, reason: c.reason }).find(q => c.answers[q.id] == null) ?? null;

/** An answer, checked against its question. Throws the reason in plain words. */
export function checkAnswer(q: Question, v: unknown): string | string[] {
  if (q.kind === "multi") {
    const xs = (Array.isArray(v) ? v : String(v ?? "").split(/[,\s]+/)).map(x => String(x).trim()).filter(Boolean);
    const bad = xs.filter(x => !q.options!.some(o => o.id === x));
    if (!xs.length || bad.length) throw new Error(`Pick one or more of: ${q.options!.map(o => `${o.id} (${o.label.en})`).join(", ")}${bad.length ? `; not ${bad.join(", ")}` : ""}.`);
    return [...new Set(xs)];
  }
  const s = String(v ?? "").trim().slice(0, 1000);
  if (!s) throw new Error(`An answer is needed for "${q.ask.en}"`);
  if (q.kind === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)))) throw new Error("A date as YYYY-MM-DD, as printed on the letter.");
  if (q.kind === "choice" && !q.options!.some(o => o.id === s)) throw new Error(`One of: ${q.options!.map(o => `${o.id} (${o.label.en})`).join(", ")}.`);
  return s;
}

/* ------------------------------ the deadline, with room ------------------------------ */

const shift = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
/** The rule's deadline and a file-by date SAFETY_DAYS earlier (never before today, never after the target). */
export function datesFor(ap: Appeal, decided: string, today: string, served: Served = "unknown"): { dl: Deadline; fileBy: string; passed: boolean } | null {
  const dl = deadlineFor(ap.deadline, decided, ap.tz, { served });
  if (!dl) return null;
  const early = shift(dl.date, -SAFETY_DAYS);
  return { dl, fileBy: early < today ? (today <= dl.date ? today : dl.date) : early, passed: dl.date < today };
}

/* ------------------------------ the letter ------------------------------ */

export type Ctx = { business: string; address: string; agency: string; appName: string; confirmation?: string };
const verbOf = (ap: Appeal) => ap.id === "ca_health_plan_review" ? "resubmits the corrected plan answering each deficiency in"
  : ap.id === "nyc_dcwp_denial" || ap.id === "business_license_denial" ? "asks for reconsideration, on the corrected application, of"
  : ap.id === "ca_abc_denial_hearing" ? "petitions for a license and requests a hearing on"
  : /hearing/i.test(ap.name.en) && !/appeal/i.test(ap.name.en) ? "requests a hearing on" : "appeals";
const pick = (c: AppealCase, id: string) => { const v = c.answers[id]; return Array.isArray(v) ? v : v ? [v] : []; };
const answer = (c: AppealCase, id: string) => { const v = c.answers[id]; return Array.isArray(v) ? v.join(", ") : (v ?? ""); };
const none = (s: string) => !s || /^(none|no|n\/a|not sent)$/i.test(s.trim());

/** The grounds the owner said are true, in the playbook's words. */
export const groundsChosen = (ap: Appeal, c: AppealCase) => pick(c, "grounds").map(id => ap.grounds[Number(id.slice(1)) - 1]).filter((g): g is Bi => !!g);
export const conditionsChosen = (c: AppealCase) => pick(c, "conditions").map(id => CONDITIONS.find(x => x.id === id)?.label).filter((x): x is Bi => !!x);
const askOf = (c: AppealCase) => ASKS.find(a => a.id === answer(c, "ask"))?.label ?? ASKS[0].label;

/** The appeal letter the owner signs and the filer sends: the legal hook (the section that makes it timely), the
 *  decision in the agency's words, the grounds the owner said are true, the facts, any conditions offered and one
 *  request. No claim about Placetta goes in it; the owner's review copy carries the sources and the not-a-law-firm line.
 *  The San Francisco Board takes a one-page preliminary statement with no exhibits, so its letter stays that short. */
export function appealLetter(ap: Appeal, c: AppealCase, x: Ctx): { text: string; review: Bi[]; sources: { n: number; url: string }[] } {
  const src = sourcesOf(ap), n = (url?: string) => { const s = src.find(y => y.url === url); return s ? ` [${s.n}]` : ""; };
  const onePage = ap.id.startsWith("sf_board_of_appeals_") || ap.id === "dal_building_appeals_board";
  const grounds = groundsChosen(ap, c), conds = conditionsChosen(c), number = answer(c, "number");
  const dl = c.decided ? deadlineFor(ap.deadline, c.decided, ap.tz, { served: c.served ?? "unknown" }) : null;
  const signer = answer(c, "signer") || "[Name, title]";
  const evidence = ap.evidence.slice(1).map(e => e.en);
  const lines = [
    x.business, x.address, "",
    `To: ${ap.body.en}`,
    `Re: ${x.appName}${none(number) ? "" : `, no. ${number}`}${x.confirmation ? ` (confirmation ${x.confirmation})` : ""}; decision of ${x.agency} dated ${c.decided ?? "[date on the letter]"}`, "",
    `${x.business} ${verbOf(ap)} the decision of ${x.agency} dated ${c.decided ?? "[date]"}. It is filed within the time ${ap.deadline.section} allows${dl ? `, on or before ${dl.legal}` : ""}.`,
    `The decision states: "${c.reason.slice(0, onePage ? 200 : 400)}"${onePage ? "" : " (Exhibit A)"}.`, "",
    "Grounds:",
    ...(grounds.length ? grounds : [ap.grounds[0]]).map((g, i) => `${i + 1}. ${g.en}.`),
    "", `Facts: ${answer(c, "facts") || "[what the agency got wrong, or what has been fixed]"}`,
    ...(conds.length ? ["", `${x.business} offers these conditions on the license: ${conds.map(k => k.en.toLowerCase()).join("; ")}.`] : []),
    "", `Request: ${askOf(c).en}.`,
    ...(onePage ? ["", "A brief follows by the date the Board sets."] : ["", `Enclosed: Exhibit A, the decision; ${evidence.map((e, i) => `Exhibit ${String.fromCharCode(66 + i)}, ${e.charAt(0).toLowerCase() + e.slice(1)}`).join("; ")} (as attached).`]),
    "", "Respectfully submitted,", signer, x.business,
  ];
  const review: Bi[] = [
    B(`Draft for your review before it's filed. ${NOT_A_LAW_FIRM.en}`, `提交前请审阅此草稿。${NOT_A_LAW_FIRM.zh}`),
    B(`The legal hook: ${ap.deadline.section}${n(ap.deadline.verified?.source)}. ${ap.deadline.says}`, `法律依据：${ap.deadline.section}${n(ap.deadline.verified?.source)}。${ap.deadline.says}`),
    B(`Grounds you said are true: ${(grounds.length ? grounds : [ap.grounds[0]]).map(g => g.en).join("; ")}${n(ap.cites?.grounds ?? ap.sources[0])}`, `您确认属实的理由：${(grounds.length ? grounds : [ap.grounds[0]]).map(g => g.zh).join("；")}${n(ap.cites?.grounds ?? ap.sources[0])}`),
    B(`Form: ${ap.form.en}${n(ap.cites?.form ?? ap.sources[0])}`, `格式：${ap.form.zh}${n(ap.cites?.form ?? ap.sources[0])}`),
    ...(conds.length ? [B(`Conditions bind the license for as long as you hold it: offer only ones you'll keep.`, "附加条件在持照期间始终有效：只承诺您能做到的。")] : []),
    B("Check every line against its source before you approve. Placetta doesn't say how it will go.", "批准前请对照来源逐行核对。快哉不预测结果。"),
  ];
  return { text: lines.join("\n"), review, sources: src };
}

/* ------------------------------ evidence ------------------------------ */

/** The evidence list: the decision itself is required (the body needs it to find what's appealed); the letter is
 *  written by Placetta and attached with draft_document; the rest is optional and attached when uploaded. */
export function evidenceFor(ap: Appeal): { id: string; label: Bi; required: boolean }[] {
  return [
    { id: "decision", label: ap.evidence[0], required: true },
    { id: "letter", label: B("The appeal letter, signed", "已签名的上诉信"), required: true },
    ...ap.evidence.slice(1).map((e, i) => ({ id: `e${i + 1}`, label: e, required: false })),
  ];
}

/* ------------------------------ the filing ------------------------------ */

/** The appeal's own application: the lines the body needs, from the answers and the workspace, and the required
 *  documents. The owner approves it with request_filing_approval; the filer sends it by the playbook's channel (an
 *  appeal-* destination when there's a verified one, otherwise the Placetta team by the channel the letter names). */
export function appealApplication(ap: Appeal, c: AppealCase, x: Ctx & { agencyBi: Bi; appNameBi: Bi }, letter: string): Application {
  const ch = CHANNELS[ap.id], number = answer(c, "number");
  const f = (id: string, en: string, zh: string, value: string): Field => ({ id, label: B(en, zh), value, from: same("Appeal interview") });
  const fields: Field[] = [
    f("appellant", "Appellant (business)", "上诉人（企业）", x.business),
    f("address", "Business address", "企业地址", x.address),
    f("signer", "Signed by (name and title)", "签名人（姓名和职务）", answer(c, "signer")),
    f("decision", "Decision appealed", "被上诉的决定", `${x.appName}, ${x.agency}`),
    f("decided", "Date of the decision", "决定日期", c.decided ?? ""),
    f("number", "Permit, application or case number", "许可、申请或案件编号", none(number) ? "None on the letter" : number),
    f("grounds", "Grounds", "理由", groundsChosen(ap, c).map(g => g.en).join("; ")),
    f("request", "Request", "请求", askOf(c).en),
  ];
  const checklist: CheckItem[] = evidenceFor(ap).filter(e => e.required).map(e => ({ id: e.id, label: e.label, state: "missing" as const }));
  return {
    id: `appeal-${c.app}`.slice(0, 60), name: B(`Appeal: ${x.appNameBi.en}`, `上诉：${x.appNameBi.zh}`), agency: ap.body, level: "city", status: "draft", fees: ap.fee.verified && ap.fee.usd ? [{ label: B("Appeal fee", "上诉费"), amount: ap.fee.usd }] : [],
    est: B("The body sets the hearing", "由受理机构安排听证"), source: { label: ap.body.en, url: sourcesOf(ap)[0]?.url ?? "" }, form: ap.form, fields, checklist,
    ...(ch.dest ? { official: ch.dest } : {}),
    next: B(letter ? "Attach the signed letter and the decision, then approve to file it" : "Approve to file it", letter ? "附上已签名的上诉信和决定书，然后批准提交" : "批准后即可提交"), feeNote: ap.fee.says,
  };
}

/* ------------------------------ hearing prep ------------------------------ */

/** A one-page script for the hearing, in both languages: who speaks, the opening, one point per ground with its
 *  exhibit, the conditions offered, the answer to the agency's reason, how the hearing runs, and the close. */
export function hearingScript(ap: Appeal, c: AppealCase, x: Ctx): Bi[] {
  const signer = answer(c, "signer") || "[Name, title]", ask = askOf(c), grounds = groundsChosen(ap, c), conds = conditionsChosen(c);
  const how = answer(c, "attend");
  return [
    B(`Hearing: ${ap.body.en}${c.hearing?.date ? `, ${c.hearing.date}` : ""}${how === "remote" ? ", by phone or video" : how === "in_person" ? ", in person" : ""}. Speaking: ${signer} for ${x.business}.`,
      `听证：${ap.body.zh}${c.hearing?.date ? `，${c.hearing.date}` : ""}${how === "remote" ? "，电话或视频" : how === "in_person" ? "，亲自到场" : ""}。发言人：${signer}，代表 ${x.business}。`),
    B(`Open (about 30 seconds): "I'm ${signer} of ${x.business}. We ask that you ${ask.en.charAt(0).toLowerCase() + ask.en.slice(1)}."`, `开场（约 30 秒）：“我是 ${x.business} 的 ${signer}。我们请求${ask.zh}。”`),
    ...grounds.map((g, i) => B(`Point ${i + 1}: ${g.en}. Show the document that proves it.`, `第 ${i + 1} 点：${g.zh}。出示证明它的文件。`)),
    B(`The facts in one breath: ${answer(c, "facts") || "[what was wrong, or what you fixed]"}`, `一句话说明事实：${answer(c, "facts") || "[哪里有误，或您做了哪些整改]"}`),
    ...(conds.length ? [B(`Offer the conditions: ${conds.map(k => k.en.toLowerCase()).join("; ")}.`, `提出附加条件：${conds.map(k => k.zh).join("；")}。`)] : []),
    B(`When asked about the reason ("${c.reason.slice(0, 120)}"): say what changed since, and point to the document.`, `被问到理由（“${c.reason.slice(0, 120)}”）时：说明之后有何改变，并指向相应文件。`),
    ...ap.hearing.map(h => B(`How it runs: ${h.en}`, `流程：${h.zh}`)),
    B("Keep to facts you can show. Don't promise what you can't keep; don't interrupt; answer the question asked.", "只讲能证明的事实。不承诺做不到的事；不打断；问什么答什么。"),
    B(`Close: "Thank you. We ask that you ${ask.en.charAt(0).toLowerCase() + ask.en.slice(1)}."`, `结尾：“谢谢。我们请求${ask.zh}。”`),
    NOT_A_LAW_FIRM,
  ];
}

/* ------------------------------ liquor and zoning, before the hearing ------------------------------ */

const ABC_510 = "https://www.abc.ca.gov/form/abc-510";
const ABC_AB9418 = "https://abcab.ca.gov/decisions/ab-9000-to-9999/pdf/ab-9418-issued-decision.pdf";
const SLA_NOTICE = "https://sla.ny.gov/faq-municipalcommunity-board-notices-premises-applicants";
const SLA_FORM = "https://sla.ny.gov/standardized-notice-form";

export type PrepId = "hearing_request" | "protest_response" | "conditions_offer" | "neighbor_letter" | "community_board" | "evidence_packet" | "counsel_packet";
export type Prep = { id: PrepId; title: Bi; does: Bi; says?: string; source?: string; draft: (ap: Appeal, c: AppealCase, x: Ctx) => string };

/** Everything a non-lawyer can lawfully do on a liquor protest or a zoning appeal, in order, each from its source.
 *  Counsel gets the packet for the hearing itself. */
export function prepFor(ap: Appeal): Prep[] {
  const steps: Prep[] = [];
  const add = (p: Prep) => steps.push(p);
  if (REQUEST_OK.has(ap.id)) add({ id: "hearing_request", title: ap.id === "ca_abc_denial_hearing" ? B("Petition for the license and request the hearing, on time", "按时提交执照申请书并申请听证") : B("File the request on time", "按时提交申请"),
    does: B(`Keeps the right to a hearing: ${ap.deadline.section}. You approve it; Placetta files it by ${CHANNELS[ap.id].how.en.toLowerCase()}`, `保住听证权利：${ap.deadline.section}。您批准后，快哉按以下方式提交：${CHANNELS[ap.id].how.zh}`),
    says: ap.deadline.says, source: ap.deadline.verified?.source, draft: (a, c, x) => appealLetter(a, c, x).text });
  if (ap.id === "ca_abc_denial_hearing" || ap.id === "tx_tabc_denial_hearing") add({ id: "protest_response", title: B("Answer each protest in writing", "书面逐条回应抗议"),
    does: B("One answer per protest point, each with the document that shows it, for the district office and, later, counsel", "每条抗议理由单独回应并附证明文件，交地区办公室，之后也交给律师"),
    ...(ap.id === "ca_abc_denial_hearing" ? { says: "Protestants may meet the applicant; it \"gives the applicant a chance to respond to your concerns\"", source: ABC_510 } : { source: ap.sources[0] }),
    draft: (_a, c, x) => [`${x.business}: response to the protests on the ${x.appName}`, "",
      ...(none(answer(c, "protests")) ? ["[List each protest point here, in the protestant's words.]"] : [`The protests, as summarized: ${answer(c, "protests")}`]),
      "", "For each point: what it says; what the facts are; the document that shows them (Exhibit).", "", `Conditions ${x.business} will accept: ${conditionsChosen(c).map(k => k.en.toLowerCase()).join("; ") || "[none offered]"}.`].join("\n") });
  if (ap.id === "ca_abc_denial_hearing") add({ id: "conditions_offer", title: B("Offer conditions on the license", "提出执照附加条件"),
    does: B("Tell ABC which conditions you'd accept; ABC decides if they fit and prepares a Petition for Conditional License for you to sign. Signed conditions bind the license, and only a petition under B&P §23803 changes them later", "告知 ABC 您可接受的条件；由 ABC 判断是否合适，并准备附条件执照申请书交您签署。签署后的条件对执照有约束力，日后只能依 B&P §23803 申请修改"),
    says: `"The applicant may be willing to agree to certain conditions." ABC "will then evaluate if the proposed condition is appropriate to impose on the license." The Appeals Board: the applicant "signed a Petition for Conditional License as part of his application" (B&P §23800; AB-9418, ${ABC_AB9418}).`, source: ABC_510,
    draft: (_a, c, x) => [`To: California ABC, the district office handling the application`, `Re: ${x.appName}${none(answer(c, "number")) ? "" : `, no. ${answer(c, "number")}`}`, "",
      `${x.business} is willing to accept these conditions on the license to answer the concerns raised: ${conditionsChosen(c).map(k => k.en.toLowerCase()).join("; ") || "[conditions]"}.`,
      "Please let us know whether ABC finds them appropriate, and send the Petition for Conditional License for signature.", "", answer(c, "signer") || "[Name, title]", x.business].join("\n") });
  if (isLiquor(ap.id) || ap.id === "sf_board_of_appeals_variance" || ap.id === "la_planning_appeal") add({ id: "neighbor_letter", title: B("Offer to meet the neighbors who objected", "约见提出反对的邻居"),
    does: B("A short letter offering a meeting before the hearing: no rule requires it; it's how you hear the objections first. Sent only with your approval", "听证前发一封简短的约见信：没有规则要求这样做，但可以提前了解反对意见。经您批准后才发出"),
    ...(ap.id === "ca_abc_denial_hearing" ? { says: "Protestants may meet the applicant, which \"gives the applicant a chance to respond to your concerns\"", source: ABC_510 } : {}),
    draft: (_a, c, x) => [`Dear neighbor,`, "", `We're ${x.business} at ${x.address}. We know some neighbors have concerns about our ${x.appName.toLowerCase()}, and we'd like to hear them in person before the hearing.`,
      `${conditionsChosen(c).length ? `We've offered to ${conditionsChosen(c).map(k => k.en.toLowerCase()).join(", ")}. ` : ""}Could we meet at a time that suits you? Reply to this letter or call us.`, "", `Thank you,`, answer(c, "signer") || "[Name, title]", x.business].join("\n") });
  if (ap.id === "ny_sla_disapproval") add({ id: "community_board", title: B("Prepare for the community board", "准备社区委员会会议"),
    does: B("The 30-day notice on the SLA's Standardized Notice Form (certified mail, return receipt; overnight with proof; personal service; or email where the board accepts it, with the board's own email as proof), then a one-page summary for the board's meeting: hours, security, and any stipulations you'll accept", "使用 SLA 标准通知表发出 30 天通知（挂号回执、可追踪隔夜快递、当面送达，或对方接受时用电子邮件并以对方回复为证），再为委员会会议准备一页摘要：营业时间、安保及您可接受的附加条款"),
    says: "\"Local governments and community boards must be notified of all on-premises license applications in their neighborhoods at least 30 days\" before the SLA can process an application.", source: SLA_NOTICE,
    draft: (_a, c, x) => [`${x.business}: summary for the community board`, `Address: ${x.address}`, `30-day notice sent: ${answer(c, "community_board") || "[date and method]"} (form: ${SLA_FORM})`,
      "Hours: [opening and closing]", "Security: [staff, cameras]", "Stipulations we'll accept: [list]", `Contact: ${answer(c, "signer") || "[Name, title]"}`].join("\n") });
  if (isLiquor(ap.id) || isZoning(ap.id)) add({ id: "evidence_packet", title: B("Build the evidence packet", "整理证据材料"),
    does: B("Every document on the evidence list, labeled as an exhibit, in one place for the hearing and for counsel", "将证据清单中的每份文件编为证物，集中备用于听证和律师"),
    draft: (a) => evidenceFor(a).map((e, i) => `Exhibit ${String.fromCharCode(65 + i)}: ${e.label.en}`).join("\n") });
  if (TIERS[ap.id].route === "attorney") add({ id: "counsel_packet", title: B("Hand the packet to counsel", "将材料交给律师"),
    does: B("Everything above in one message for the attorney who represents you: the decision, the deadline and how it was counted, the request as filed, the protest answers, the conditions offered, the evidence and what's missing", "以上全部材料一次性交给代理您的律师：决定、截止日期及计算方式、已提交的申请、抗议答复、提出的条件、证据及缺少的材料"),
    says: TIERS[ap.id].says, source: TIERS[ap.id].source, draft: (a, c, x) => attorneyHandoff(a, c, x, []).body.join("\n") });
  return steps;
}

/** Placetta has no partner firm yet: the handoff goes to the owner's own attorney, or to this placeholder the team fills
 *  in. Never a made-up firm. */
export const PARTNER = "[Placetta partner attorney: the team introduces one; no firm named yet]";
export function attorneyHandoff(ap: Appeal, c: AppealCase, x: Ctx, evidence: { item: string; on_file: boolean }[], to = PARTNER) {
  const dl = c.decided ? deadlineFor(ap.deadline, c.decided, ap.tz, { served: c.served ?? "unknown" }) : null;
  const pk = counselPacket(ap, { business: x.business, name: x.appName, agency: x.agency, decided: c.decided ?? "(date on the letter)", reason: c.reason || "(the reason in the letter)", deadline: dl, evidence });
  const done = Object.entries(c.prep ?? {}).map(([k, d]) => `${k.replace(/_/g, " ")} (${d})`);
  return {
    to, subject: pk.subject,
    body: [...pk.body.slice(0, -1),
      `Route: ${ROUTE_NAME[TIERS[ap.id].route].en}. Why: ${TIERS[ap.id].why.en} Source: ${TIERS[ap.id].source}`,
      c.filing ? `Filed by the owner through Placetta: ${c.filing}${c.stage === "filed" ? " (with the body)" : ""}.` : "Nothing filed yet.",
      done.length ? `Done before the hearing: ${done.join("; ")}.` : "",
      groundsChosen(ap, c).length ? `Grounds the owner says are true: ${groundsChosen(ap, c).map(g => g.en).join("; ")}.` : "",
      conditionsChosen(c).length ? `Conditions offered: ${conditionsChosen(c).map(k => k.en.toLowerCase()).join("; ")}.` : "",
      none(answer(c, "protests")) ? "" : `Protests: ${answer(c, "protests")}.`,
      c.hearing?.date ? `Hearing: ${c.hearing.date}.` : "",
      pk.body[pk.body.length - 1]].filter(Boolean),
    questions: pk.questions,
  };
}

/* ------------------------------ where it stands, and how it ended ------------------------------ */

/** The stage from the case and its filing (the filings table, updated by the daily status checks, stamps app.filed). */
export function stageOf(c: AppealCase, filed?: { status: string } | null): CaseStage {
  if (c.outcome) return "decided";
  if (c.handoff && !c.filing) return "with_attorney";
  if (c.hearing) return "hearing";
  if (filed && ["submitted", "accepted", "filing", "needs_info", "rejected"].includes(filed.status)) return "filed";
  return c.stage;
}

export const OUTCOMES: Record<Outcome, Bi> = {
  granted: B("Granted", "获批"), granted_with_conditions: B("Granted with conditions", "附条件获批"), denied: B("Denied: the decision stands", "被驳回：原决定维持"),
  withdrawn: B("Withdrawn", "已撤回"), settled: B("Settled", "已和解"),
};
/** The outcome record, and the next step when it was lost (the playbook's `next`, with its own deadline). */
export function recordOutcome(ap: Appeal, result: Outcome, decided: string, today: string): { next?: { id: AppealId; name: Bi; route: Route; last_day: string | null; days_left: number | null } } {
  if (result !== "denied" || !ap.next) return {};
  const nx = appealById(ap.next)!, dl = deadlineFor(nx.deadline, decided, nx.tz);
  return { next: { id: nx.id, name: nx.name, route: TIERS[nx.id].route, last_day: dl?.date ?? null, days_left: dl ? daysLeft(dl.date, today) : null } };
}
