// What makes Odelia more than an assistant that asks "approve?". Three answers to the weak spots of general agents:
//   preflight:     a second, deterministic look at every line before you approve (Muse's Sentinel, without a model),
//                  so an approval is a decision about checked facts, not a rubber stamp
//   openingPath:   per store still opening, where the permits put the opening date, the days to spare, and the one
//                  thing holding it up; the monitor texts about it, check_progress reports it, the store cards show it
//   suggestions:   the next asks from the workspace's own state, not a fixed list
// Pure functions: the app, the agent's tools, the monitor and the tests all call them; nothing here talks to a server.
import { B, type Bi } from "./bi";
import { filingBlockers, isBlank } from "./core";
import { formById, placesOf, segmentOf } from "./forms/registry";
import type { Application, Approval, Field, Status, Store, Workspace } from "./model";
import { publishedDays, type FormStat } from "./plan";

/* ------------------------------------------------------------------ preflight */

export type Check = { level: "error" | "warn"; field?: string; label: Bi; note: Bi };
export type Preflight = { checked: number; errors: Check[]; warnings: Check[] };

const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP".split(" ");
const STATE_NAMES = /^(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|district of columbia|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|puerto rico)$/i;
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

/** A date as written on a form: 2026-11-02, 11/2/2026, Nov 2, 2026. null when it isn't one. */
export function parseDate(v: string): string | null {
  const s = v.trim();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) return ok(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && MONTHS.includes(m[1].toLowerCase())) return ok(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  m = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(s);
  if (m) return ok(+m[1], +m[2], +m[3]);
  return null;
}

const digits = (v: string) => v.replace(/\D/g, "");
/** "Golden Ox Noodle, LLC" and "golden ox noodle llc" are the same name. */
const nameKey = (v: string) => v.toLowerCase().replace(/\./g, "").replace(/[,'’"()&]/g, " ").replace(/\b(l\.?l\.?c|inc|incorporated|corp|corporation|co|company|ltd|limited|pllc|lp|llp)\b/g, " ").replace(/\s+/g, " ").trim();
/** The city part of "39-01 Bell Blvd, Bayside, NY 11361". */
export const cityOf = (address: string) => { const p = address.split(",").map(s => s.trim()).filter(Boolean); return p.length >= 3 ? p[p.length - 2] : p.length === 2 ? p[1].replace(/\b[A-Z]{2}\b.*$/, "").trim() || null : null; };
const streetNo = (address: string) => /^\s*([\d-]+[A-Za-z]?)\s/.exec(address)?.[1] ?? null;

function storeOfApp(w: Workspace, appId: string): Store | undefined { return (w.stores ?? []).find(s => (s.apps ?? []).includes(appId)); }
function legalName(w: Workspace): string | undefined {
  const f = w.facts.find(x => /legal (business |entity )?name|registered name/i.test(x.label.en));
  return f?.value.en || w.meta?.entity || undefined;
}

type Rule = { test: RegExp; skip?: RegExp; check: (v: string, ctx: { w: Workspace; app?: Application; today: string; label: string }) => Check | null | undefined };
const err = (label: Bi, note: Bi): Check => ({ level: "error", label, note });
const warn = (label: Bi, note: Bi): Check => ({ level: "warn", label, note });

const RULES: Rule[] = [
  // "SSN, ITIN, or EIN of responsible party" takes either kind of number
  { test: /\b(ssn|social security|itin)\b/i, check: (v, c) =>
      /^(\d{3}|\*{3}|x{3})-?(\d{2}|\*{2}|x{2})-?\d{4}$/i.test(v.trim()) || (/\b(f?ein|tin|tax id)\b/i.test(c.label) && /^\d{2}-?\d{7}$/.test(v.trim())) ? null
      : err(B(c.label, c.label), B("A Social Security number or ITIN is 9 digits.", "社会安全号或 ITIN 为 9 位数字。")) },
  { test: /\b(ein|fein)\b|employer identification|federal (tax|employer) id/i, check: (v, c) =>
      /^\d{2}-?\d{7}$/.test(v.trim()) ? null
      : /applied|pending|apply/i.test(v) ? warn(B(c.label, c.label), B("No EIN yet. Most agencies won't take the filing until it's issued.", "尚未取得 EIN。多数机构要等 EIN 下发后才受理。"))
      : err(B(c.label, c.label), B("An EIN is 9 digits, written 12-3456789.", "EIN 为 9 位数字，格式如 12-3456789。")) },
  { test: /e-?mail/i, check: (v, c) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim()) ? null : err(B(c.label, c.label), B("That isn't an email address.", "这不是有效的电子邮箱地址。")) },
  { test: /phone|telephone|mobile|\bcell\b|\bfax\b/i, check: (v, c) => {
      const d = digits(v);
      if (d.length === 10 || (d.length === 11 && d.startsWith("1"))) return null;
      if (v.trim().startsWith("+") && d.length >= 8 && d.length <= 15) return warn(B(c.label, c.label), B("An international number. Some US agency forms only take a US number.", "这是国际号码。部分美国机构表格只接受美国号码。"));
      return err(B(c.label, c.label), B("A US phone number has 10 digits.", "美国电话号码为 10 位数字。"));
    } },
  { test: /\bzip\b|postal code/i, check: (v, c) =>
      // "City, state, and ZIP code" holds all three: the ZIP has to be in there somewhere (a foreign address may have none)
      /city|state/i.test(c.label) ? (/\b\d{5}(-\d{4})?\b/.test(v) || /foreign/i.test(c.label) && !/\b[A-Z]{2}\b/.test(v) ? null : warn(B(c.label, c.label), B("No ZIP code in it.", "其中没有邮编。")))
      : /^\d{5}(-\d{4})?$/.test(v.trim()) ? null : err(B(c.label, c.label), B("A ZIP code is 5 digits (or ZIP+4).", "邮编为 5 位数字（或 ZIP+4）。")) },
  { test: /^state$|^state of (formation|incorporation|organization)$/i, check: (v, c) =>
      US_STATES.includes(v.trim().toUpperCase()) || STATE_NAMES.test(v.trim()) ? null : warn(B(c.label, c.label), B("Not a US state as written. Check the spelling or use the two-letter code.", "不是规范的美国州名。请检查拼写或使用两字母代码。")) },
  { test: /date|expir|opening|start|effective|\bdob\b|birth/i, skip: /update|candidate|mandate/i, check: (v, c) => {
      const d = parseDate(v);
      if (!d) return /^\d|[A-Za-z]{3,}\s+\d|\d{4}年/.test(v.trim()) ? warn(B(c.label, c.label), B("Couldn't read this as a date. Write it as 2026-11-02.", "无法识别为日期。请写成 2026-11-02 这样的格式。")) : null;
      if (/expir/i.test(c.label) && d < c.today) return err(B(c.label, c.label), B(`Expired on ${d}. The agency will reject an expired document.`, `已于 ${d} 过期。机构会拒收过期文件。`));
      if (/opening|start|effective|begin/i.test(c.label) && d < c.today) return warn(B(c.label, c.label), B(`${d} has passed. Most agencies want a date that's still ahead.`, `${d} 已经过去。多数机构需要未来的日期。`));
      if (/birth|\bdob\b/i.test(c.label) && d > c.today) return err(B(c.label, c.label), B("A birth date can't be in the future.", "出生日期不能晚于今天。"));
      return null;
    } },
  { test: /address/i, skip: /mail|e-?mail|home|residen|owner|officer|member|agent|landlord|billing|previous|web/i, check: (v, c) => {
      const s = c.app && storeOfApp(c.w, c.app.id);
      if (!s?.address) return null;
      const city = cityOf(s.address), no = streetNo(s.address), val = v.toLowerCase();
      const cityOk = !city || val.includes(city.toLowerCase());
      const noOk = !no || new RegExp(`(^|\\D)${no.replace(/[-]/g, "\\-")}(\\D|$)`).test(v);
      return cityOk && noOk ? null : warn(B(c.label, c.label), B(`Doesn't match ${s.name.en}'s address on file: ${s.address}.`, `与${s.name.zh}登记的地址不一致：${s.address}。`));
    } },
  { test: /legal (business |entity )?name|business name|entity name|name of (the )?(business|entity|company|applicant)/i, skip: /dba|trade|doing business|fictitious|assumed/i, check: (v, c) => {
      const known = legalName(c.w);
      if (!known || nameKey(known) === nameKey(v)) return null;
      return warn(B(c.label, c.label), B(`Differs from the legal name on file, "${known}". Agencies match it to the state registration letter for letter.`, `与登记的法定名称“${known}”不一致。机构会逐字核对州注册记录。`));
    } },
];

const PLACEHOLDER = /\[[^\]]{1,40}\]|\{[^}]{1,40}\}|<[^>]{1,40}>|\bTBD\b|\bXXX+\b|待定|待补充/;

/** A second look at everything an approval would send, before the person approves it. */
export function preflight(w: Workspace, a: Approval, today: string): Preflight {
  const app = a.app ? w.apps.find(x => x.id === a.app) : undefined;
  const fields: Field[] = a.kind === "send" || a.kind === "change" ? a.data ?? [] : app?.fields ?? [];
  const errors: Check[] = [], warnings: Check[] = [];
  let checked = 0;
  const add = (c: Check | null | undefined, field?: string) => { if (c) (c.level === "error" ? errors : warnings).push({ ...c, field }); };

  for (const f of fields) {
    // "Line 7a: Name of responsible party" is matched on what the line asks, not its number
    const v = f.value ?? "", label = f.label.en.replace(/^(line\s+)?[^:]{1,16}:\s+(?=\S)/i, "");
    checked++;
    if (isBlank(v)) continue;   // empty lines are filingBlockers' job, shown above the checks
    if (/^(n\/?a|none|not applicable|无|不适用)$/i.test(v.trim())) continue;   // a real answer: there isn't one
    if (PLACEHOLDER.test(v)) { add(err(f.label, B("Still has a placeholder in it.", "仍包含占位文字。")), f.id); continue; }
    for (const r of RULES) {
      if (!r.test.test(label) || r.skip?.test(label)) continue;
      add(r.check(v, { w, app, today, label }), f.id);
      break;
    }
  }

  if (app && a.kind === "file") {
    // the fee matches what the agency publishes
    const off = app.official ? formById(app.official) : undefined;
    checked++;
    const fee = app.fees.reduce((s, x) => s + x.amount, 0);
    if (off && off.fee != null && !app.fees.some(x => x.tbd) && Math.abs(fee - off.fee) > 0.5)
      add(warn(B("Fee", "费用"), B(`$${fee} here; the agency publishes $${off.fee}. Check before paying.`, `此处为 $${fee}，机构公布为 $${off.fee}。付款前请核对。`)));
    const s = storeOfApp(w, app.id);
    if (off) {
      // the right agency for where the store is: an NYC form for an Austin store is the costliest mistake there is
      checked++;
      const places = s?.address ? placesOf(s.address) : [];
      if (places.length > 1 && !places.includes(off.where))
        add(err(B("Agency", "机构"), B(`This is ${off.agency.en}'s form (${off.where}); ${s!.name.en} is at ${s!.address}. It goes to the wrong agency.`, `这是${off.agency.zh}的表格（${off.where}）；${s!.name.zh}位于 ${s!.address}。会提交到错误的机构。`)));
      // the right kind of business
      checked++;
      const seg = segmentOf([w.business.en, ...w.facts.filter(x => /what you sell|business type|cuisine/i.test(x.label.en)).map(x => x.value.en)].join(" "));
      if (w.business.en && !off.segments.includes(seg))
        add(warn(B("Business type", "业务类型"), B(`${off.form} is for ${off.segments.join(" or ")} businesses; this one reads as ${seg}. Make sure it applies.`, `${off.form} 适用于${off.segments.join("或")}类业务；本企业看起来属于 ${seg}。请确认适用。`)));
      // every line the agency's own form asks, and every attachment it lists
      checked++;
      const have = new Set(app.fields.map(x => x.id));
      const gone = off.fields.filter(x => !have.has(x.id));
      if (off.fields.length && gone.length)
        add(warn(B("Form lines", "表格栏目"), B(`The agency's form also asks for ${gone.slice(0, 3).map(x => x.label.en).join("; ")}${gone.length > 3 ? ` and ${gone.length - 3} more` : ""}, which aren't on this application.`, `机构表格还要求填写：${gone.slice(0, 3).map(x => x.label.zh).join("；")}${gone.length > 3 ? ` 等 ${gone.length} 项` : ""}，本申请中没有。`)));
      checked++;
      const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(x => x.length > 3);
      const listed = app.checklist.map(c => new Set(words(c.label.en)));
      const unlisted = (off.attach ?? []).filter(at => { const k = words(at.en); return k.length && !listed.some(l => k.filter(x => l.has(x)).length / k.length >= 0.5); });
      if (unlisted.length)
        add(warn(B("Attachments", "附件"), B(`The agency also lists ${unlisted.slice(0, 2).map(x => x.en).join("; ")}${unlisted.length > 2 ? " and more" : ""} as attachments.`, `机构还要求附上：${unlisted.slice(0, 2).map(x => x.zh).join("；")}${unlisted.length > 2 ? " 等" : ""}。`)));
    }
    // the same form isn't already filed for the same store
    checked++;
    const twin = app.official ? w.apps.find(x => x.id !== app.id && x.official === app.official && storeOfApp(w, x.id)?.id === s?.id && ["filing", "review", "approved"].includes(x.status)) : undefined;
    if (twin) add(warn(B("Already filed", "已提交过"), B(`${twin.name.en} for this ${s ? "store" : "business"} is already ${twin.status === "approved" ? "approved" : "filed"}. Filing again may pay the fee twice.`, `该${s ? "门店" : "企业"}的${twin.name.zh}已${twin.status === "approved" ? "获批" : "提交"}。再次提交可能重复缴费。`)));
  }
  if (a.kind === "send") {
    checked++;
    const body = fields.map(f => f.value).join("\n");
    if (fields.length && !fields.some(f => /^(to|recipient|收件人)/i.test(f.label.en) && f.value.includes("@")) && fields.some(f => /^(to|recipient)/i.test(f.label.en)))
      add(err(B("To", "收件人"), B("No email address to send it to.", "没有收件邮箱。")));
    if (/\b(guarantee[ds]?|promise[ds]?)\b.{0,40}\b(approv|permit|open)/i.test(body))
      add(warn(B("Message", "内容"), B("It promises an approval or a date. Agencies decide those; say \"expect\" instead.", "内容承诺了获批或日期。这些由机构决定，建议改为“预计”。")));
  }
  return { checked, errors, warnings };
}

/* ---------------------------------------------------------------- opening path */

export type OpeningPath = {
  verdict: "on_track" | "tight" | "late" | "no_date" | "not_mapped" | "open";
  landing: string | null;        // the day the last permit should be in hand
  slack: number | null;          // planned opening minus landing, in days (negative: late)
  blocker?: { app: string; name: Bi; status: Status; on: "you" | "odelia" | "team" | "agency" | "someone_else"; why: Bi };
  guessed: number;               // permits with no published agency time, counted at 30 days
  basis: { measured: number; published: number; guessed: number };   // where each permit's time came from
};
/** What makes the estimate real: when each application went to the agency, and how long Placetta's own filings of
    each form took (filing_stats, only forms with 3 or more). */
export type Evidence = { submitted?: Record<string, string>; stats?: FormStat[] };

const BUFFER = 7;
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const between = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

/** Days still to go for one application from today, before counting what it waits on. The agency's time is, in
    order: Placetta's own filings of that form (the slow end, p90), the agency's published time, else 30 days. An
    application already with the agency counts from the day it was submitted. */
function remaining(a: Application, ev: Evidence, today: string): { days: number; from: "measured" | "published" | "guessed" | "done" } {
  if (a.status === "approved") return { days: 0, from: "done" };
  const st = a.official ? ev.stats?.find(x => x.form === a.official && x.n >= 3) : undefined;
  const pub = publishedDays(a.est);
  const agency = st ? st.p90_days : pub ?? 30;
  const from = st ? "measured" : pub != null ? "published" : "guessed";
  const sent = ev.submitted?.[a.id];
  const inReview = sent ? Math.max(2, agency - Math.max(0, between(sent.slice(0, 10), today))) : Math.ceil(agency / 2);
  const by: Record<Exclude<Status, "approved">, number> = { review: inReview, filing: agency + 2, ready: agency + 3, needs: agency + BUFFER, draft: agency + BUFFER, todo: agency + BUFFER, waiting: agency + BUFFER };
  return { days: by[a.status as Exclude<Status, "approved">], from };
}

const ON: Record<Status, NonNullable<OpeningPath["blocker"]>["on"]> = { approved: "agency", review: "agency", filing: "team", ready: "you", needs: "you", draft: "odelia", todo: "odelia", waiting: "someone_else" };

function why(a: Application, w: Workspace): Bi {
  const { empty, missing } = filingBlockers(a);
  if (a.status === "ready") return w.approvals.some(x => x.app === a.id) ? B("Waiting for your approval", "等待您批准") : B("Ready to approve", "可以批准了");
  if (missing.length || empty.length) {
    const list = [...missing, ...empty].slice(0, 2);
    return B(`Needs from you: ${list.map(x => x.en).join(", ")}${missing.length + empty.length > 2 ? " and more" : ""}`, `需要您提供：${list.map(x => x.zh).join("、")}${missing.length + empty.length > 2 ? " 等" : ""}`);
  }
  if (a.status === "review") return B(`With ${a.agency.en}`, `${a.agency.zh}审核中`);
  if (a.status === "filing") return B("Placetta's team is filing it", "快哉团队正在提交");
  if (a.status === "waiting") return a.next ?? B("Waiting on an earlier step", "等待前一步完成");
  return B("Odelia is preparing it", "Odelia 正在准备");
}

/** Where a store's permits put its opening, what's holding it up, and how much room is left. */
export function openingPath(s: Store, w: Workspace, today: string, ev: Evidence = {}): OpeningPath {
  const none = { measured: 0, published: 0, guessed: 0 };
  if (s.stage === "open") return { verdict: "open", landing: s.opened ?? null, slack: null, guessed: 0, basis: none };
  const apps = w.apps.filter(a => (s.apps ?? []).includes(a.id));
  if (!apps.length) return { verdict: "not_mapped", landing: null, slack: null, guessed: 0, basis: none };
  const basis = { ...none };
  const byId = new Map(w.apps.map(a => [a.id, a]));
  const finish = new Map<string, number>(), via = new Map<string, string | undefined>();
  let guessed = 0;
  const visit = (a: Application, seen: Set<string>): number => {
    if (finish.has(a.id)) return finish.get(a.id)!;
    if (seen.has(a.id)) return 0;   // a loop in the data: don't count it twice
    seen.add(a.id);
    let start = 0, from: string | undefined;
    for (const c of a.checklist) {
      const dep = c.dep ? byId.get(c.dep) : undefined;
      if (!dep || c.state === "done") continue;
      const f = visit(dep, seen);
      if (f > start) { start = f; from = dep.id; }
    }
    const r = remaining(a, ev, today);
    if (r.from !== "done") basis[r.from]++;
    if (r.from === "guessed") guessed++;
    const end = start + r.days;
    finish.set(a.id, end); via.set(a.id, from);
    return end;
  };
  let last: Application | undefined, far = 0;
  for (const a of apps) { const f = visit(a, new Set()); if (f > far || !last) { far = f; last = a; } }
  const landing = addDays(today, far);
  // the blocker is where the longest chain starts: the first step that has to move
  let b = last!;
  for (let i = 0; i < 20 && via.get(b.id); i++) b = byId.get(via.get(b.id)!)!;
  const blocker = far > 0 ? { app: b.id, name: b.name, status: b.status, on: ON[b.status], why: why(b, w) } : undefined;
  if (!s.plannedOpen) return { verdict: "no_date", landing, slack: null, blocker, guessed, basis };
  const slack = between(landing, s.plannedOpen);
  return { verdict: slack < 0 ? "late" : slack < 7 ? "tight" : "on_track", landing, slack, blocker, guessed, basis };
}

/** One line for a store card or a text: "On track, 12 days to spare" / "9 days late: health permit, needs your lease". */
export function openingLine(p: OpeningPath): Bi | null {
  // only Placetta's own filing times are measured; anything else is said as an estimate
  const ab = p.basis.published + p.basis.guessed > 0 ? "About " : "", az = ab ? "约 " : "";
  const tail = (en: string, zh: string) => p.blocker ? B(`${en}. ${p.blocker.name.en}: ${p.blocker.why.en.charAt(0).toLowerCase() + p.blocker.why.en.slice(1)}`, `${zh}。${p.blocker.name.zh}：${p.blocker.why.zh}`) : B(en, zh);
  switch (p.verdict) {
    case "on_track": return B(`On track, ${ab.toLowerCase()}${p.slack} days to spare`, `进度正常，还有${az}${p.slack} 天余量`);
    case "tight": return tail(`Tight: ${ab.toLowerCase()}${p.slack} day${p.slack === 1 ? "" : "s"} to spare`, `时间紧张：仅余${az}${p.slack} 天`);
    case "late": return tail(`${ab}${-p.slack!} day${p.slack === -1 ? "" : "s"} behind the opening date`, `比开业日期晚${az}${-p.slack!} 天`);
    case "no_date": return p.landing ? B(`Permits in hand around ${p.landing}`, `预计 ${p.landing} 前后取得全部许可`) : null;
    case "not_mapped": return B("Permits not mapped yet", "尚未梳理许可");
    default: return null;
  }
}

/** Where the estimate comes from, in one sentence, so nobody plans rent around a guess without knowing it. */
export function basisLine(p: OpeningPath): Bi | null {
  const { measured: m, published: pu, guessed: g } = p.basis;
  if (!m && !pu && !g) return null;
  const en = [m && `Placetta's own filing times for ${m}`, pu && `the agency's published time for ${pu}`, g && `an assumed 30 days for ${g} with no published time`].filter(Boolean).join(", ");
  const zh = [m && `${m} 项按快哉实际办理时间`, pu && `${pu} 项按机构公布时间`, g && `${g} 项无公布时间，按 30 天估算`].filter(Boolean).join("，");
  return B(`Estimate from ${en}. Submitted applications count from the day they went in.`, `估算依据：${zh}。已提交的申请从提交当天起算。`);
}

/* ---------------------------------------------------------------- suggestions */

/** The next things worth asking, from the workspace as it is now; the fixed list only fills what's left. */
export function suggestions(w: Workspace, today: string, fallback: Bi[]): Bi[] {
  const out: Bi[] = [];
  const stores = w.stores ?? [];
  const files = w.approvals.filter(a => a.kind === "file");
  if (files.length > 1) out.push(B(`Walk me through the ${files.length} filings waiting for my approval`, `带我看一下等待批准的 ${files.length} 份申请`));
  for (const s of stores) {
    if (out.length >= 4) break;
    if (s.stage === "opening") {
      const p = openingPath(s, w, today);
      if (p.verdict === "late" || p.verdict === "tight") out.push(B(`How do we get ${s.name.en} back on schedule?`, `怎样让${s.name.zh}回到原定进度？`));
      else if (p.verdict === "not_mapped") out.push(B(`Map every permit ${s.name.en} needs`, `梳理${s.name.zh}所需的全部许可`));
    } else {
      const soon = (s.permits ?? []).filter(p => p.expires >= today && between(today, p.expires) <= 45).sort((x, y) => x.expires.localeCompare(y.expires))[0];
      if (soon) out.push(B(`Renew ${soon.name.en} for ${s.name.en}`, `为${s.name.zh}续办${soon.name.zh}`));
      const lapsed = (s.permits ?? []).find(p => p.expires < today);
      if (lapsed) out.push(B(`${s.name.en}'s ${lapsed.name.en} lapsed. What do we do?`, `${s.name.zh}的${lapsed.name.zh}已过期，怎么办？`));
    }
  }
  const stuck = w.apps.filter(a => (a.status === "needs" || a.status === "ready") && filingBlockers(a).missing.length);
  if (stuck.length) out.push(B(`What do you still need from me for ${stuck[0].name.en}?`, `${stuck[0].name.zh}还需要我提供什么？`));
  const overdue = w.deadlines.filter(d => d.date < today && d.kind === "due");
  if (overdue.length) out.push(B(`Sort out the ${overdue.length} overdue item${overdue.length === 1 ? "" : "s"}`, `处理 ${overdue.length} 项逾期事项`));
  if (!stores.length && !w.apps.length) out.push(B("Map every license my first store needs", "梳理第一家门店所需的全部执照"));
  const seen = new Set(out.map(x => x.en));
  for (const f of fallback) if (!seen.has(f.en)) out.push(f);
  return out;
}
