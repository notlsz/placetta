// What makes Odelia more than an assistant that asks "approve?". Three answers to the weak spots of general agents:
//   preflight:     a second, deterministic look at every line before you approve (Muse's Sentinel, without a model),
//                  so an approval is a decision about checked facts, not a rubber stamp
//   openingPath:   per store still opening, where the permits put the opening date, the days to spare, and the one
//                  thing holding it up; the monitor texts about it, check_progress reports it, the store cards show it
//   suggestions:   the next asks from the workspace's own state, not a fixed list
// Pure functions: the app, the agent's tools, the monitor and the tests all call them; nothing here talks to a server.
import { B, type Bi } from "./bi";
import { fmtDay } from "./time";
import { filingBlockers, isBlank } from "./core";
import { formById, placesOf, segmentOf } from "./forms/registry";
import type { Application, Approval, Deadline, Field, Status, Store, Workspace } from "./model";
import type { AgencyStat, FormStat } from "./plan";
import { calendarDays, expediteOptions, hostOf, timingOf, type Timing } from "./forms/expedite";
import { BY_HAND, carriesIdentifier, emailsIn, governmentAddress, SECRET_NOTE, secretNumber } from "./guard";
import { ein as einCheck, latin as latinCheck, premises as premisesCheck, PREMISES_LINE } from "./validate";

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
  // a number shown masked ("••-•••4471") is on file and kept out of view; it was checked when it was saved
  { test: /\b(ssn|social security|itin)\b/i, check: (v, c) =>
      v.includes("•") ? null : /^(\d{3}|\*{3}|x{3})-?(\d{2}|\*{2}|x{2})-?\d{4}$/i.test(v.trim()) || (/\b(f?ein|tin|tax id)\b/i.test(c.label) && /^\d{2}-?\d{7}$/.test(v.trim())) ? null
      : err(B(c.label, c.label), B("A Social Security number or ITIN is 9 digits.", "社会安全号或 ITIN 为 9 位数字。")) },
  { test: /\b(ein|fein)\b|employer identification|federal (tax|employer) id/i, check: (v, c) => {
      if (v.includes("•")) return null;
      if (/applied|pending|apply/i.test(v) && !/\d{2}-?\d{7}/.test(v)) return warn(B(c.label, c.label), B("No EIN yet. Most agencies won't take the filing until it's issued.", "尚未取得 EIN。多数机构要等 EIN 下发后才受理。"));
      // the format, a prefix the IRS assigns, and an ITIN written where the EIN goes (src/validate.ts)
      const p = einCheck(v);
      return p ? { level: p.level, label: B(c.label, c.label), note: p.note } : null;
    } },
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
  { test: /address|premises|business location|location of (the )?business/i, skip: /mail|e-?mail|home|residen|owner|officer|member|agent|landlord|billing|previous|web/i, check: (v, c) => {
      // where the business is can't be a P.O. box (src/validate.ts premises)
      if (PREMISES_LINE.test(c.label) || /^(business |store |site )?address$/i.test(c.label.trim())) { const p = premisesCheck(v); if (p) return { level: p.level, label: B(c.label, c.label), note: p.note }; }
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

const STOP = new Set(["the", "and", "for", "with", "from", "this", "that", "inc", "llc", "corp", "company", "street", "avenue", "road", "suite", "floor"]);
/** A line filled from a document, read again against the document's own words (the quote kept with it): every number
 *  of three or more digits in the answer has to be in the quote (an error: a wrong license, tax or phone number is the
 *  costliest slip), and an answer without numbers has to share a word with it (a warning: it may be reworded). A quote
 *  in another script than the answer is checked on its numbers only. Null when the line agrees with its source. */
export function sourceCheck(f: Pick<Field, "label" | "quote">, v: string): Check | null {
  const q = (f.quote ?? "").trim();
  if (!q) return null;
  const qDigits = digits(q);
  const runs = (v.match(/\d+/g) ?? []).filter(r => r.length >= 3);
  const short = (s: string) => (s.length > 90 ? s.slice(0, 87) + "..." : s);
  if (runs.some(r => !qDigits.includes(r)))
    return err(f.label, B(`Doesn't match the document it came from, which says "${short(q)}". Read it again.`, `与来源文件不一致，文件原文为“${short(q)}”。请重新核对。`));
  if (runs.length || /[一-鿿]/.test(q) !== /[一-鿿]/.test(v)) return null;
  const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(x => x.length >= 3 && !STOP.has(x));
  const want = words(v), have = new Set(words(q));
  if (want.length && !want.some(x => have.has(x)))
    return warn(f.label, B(`Not in the words of the document it came from ("${short(q)}"). Check it.`, `与来源文件的原文（“${short(q)}”）不一致，请核对。`));
  return null;
}

/** A second look at everything an approval would send, before the person approves it. */
export function preflight(w: Workspace, a: Approval, today: string): Preflight {
  const app = a.app ? w.apps.find(x => x.id === a.app) : undefined;
  const offForm = app?.official ? formById(app.official) : undefined;
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
    // a Social Security number or ITIN, on any line or in a message: Placetta never keeps or sends one (src/guard.ts)
    if (secretNumber(f.label.en, v)) { add(err(f.label, SECRET_NOTE), f.id); continue; }
    // "By hand" answers a line the signer writes on the signed copy (SS-4 line 7b, as Odelia is told to fill it). The
    // format check used to read it as a malformed SSN and refuse every such filing.
    if (BY_HAND.test(v.trim())) continue;
    // one of the line's own printed choices, or a yes/no answer to a question: SS-4 line 18 ("...ever applied for and
    // received an EIN?") answered "No" used to be read as a malformed EIN
    const choices = offForm?.fields.find(x => x.id === f.id)?.options;
    if (choices?.some(c => c.toLowerCase() === v.trim().toLowerCase()) || (/\?\s*$/.test(label) && /^(yes|no|y|n|是|否)$/i.test(v.trim()))) continue;
    if (PLACEHOLDER.test(v)) { add(err(f.label, B("Still has a placeholder in it.", "仍包含占位文字。")), f.id); continue; }
    // the line against its source: a value read from a document must say what the document's own words say
    if (f.quote) { const s = sourceCheck(f, v); if (s) { add(s, f.id); continue; } }
    // a US agency's own form takes English letters (src/validate.ts latin); abroad, the agency's own script is fine
    if (offForm && (offForm.currency ?? "USD") === "USD" && a.kind === "file") { const p = latinCheck(v); if (p) { add({ level: p.level, label: f.label, note: p.note }, f.id); continue; } }
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
    // (the agency's own expedite fee the owner chose is on top of its standard fee, so it isn't compared with it)
    const fee = app.fees.filter(x => !x.expedite).reduce((s, x) => s + x.amount, 0);
    if (off && off.fee != null && !app.fees.some(x => x.tbd && !x.expedite) && Math.abs(fee - off.fee) > 0.5)
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
    // an email needs an address; a text goes to the people named, from the numbers on file
    const text = fields.some(f => /^from/i.test(f.label.en) && /\(?\d{3}\)?[\s.-]*[\d•]{3}[\s.-]*\d{4}/.test(f.value)) && !fields.some(f => /^subject/i.test(f.label.en));
    if (!text && !fields.some(f => /^(to|recipient|收件人)/i.test(f.label.en) && f.value.includes("@")) && fields.some(f => /^(to|recipient)/i.test(f.label.en)))
      add(err(B("To", "收件人"), B("No email address to send it to.", "没有收件邮箱。")));
    if (/\b(guarantee[ds]?|promise[ds]?)\b.{0,40}\b(approv|permit|open)/i.test(body))
      add(warn(B("Message", "内容"), B("It promises an approval or a date. Agencies decide those; say \"expect\" instead.", "内容承诺了获批或日期。这些由机构决定，建议改为“预计”。")));
    // the business's tax ID or bank details going to an address that isn't a government agency's
    const to = fields.filter(f => /^(to|recipient|收件人)/i.test(f.label.en)).flatMap(f => emailsIn(f.value));
    if (carriesIdentifier(body) && to.length && !to.every(governmentAddress))
      add(warn(B("Message", "内容"), B(`It sends a tax ID or bank details to ${to.filter(t => !governmentAddress(t)).join(", ")}, which isn't a government agency. Make sure you know who asked for it.`, `内容将税号或银行信息发送至 ${to.filter(t => !governmentAddress(t)).join("、")}，这不是政府机构的地址。请确认是谁要求的。`)));
  }
  return { checked, errors, warnings };
}

/* ---------------------------------------------------------------- opening path */

export type OpeningPath = {
  verdict: "on_track" | "tight" | "late" | "no_date" | "not_mapped" | "open";
  landing: string | null;        // the day the last permit should be in hand: the opening date, at the steps' usual times
  slack: number | null;          // planned opening minus landing, in days (negative: late)
  blocker?: { app: string; name: Bi; status: Status; on: "you" | "odelia" | "team" | "agency" | "someone_else"; why: Bi };
  guessed: number;               // permits with no published agency time, counted at the 30-day default
  basis: { measured: number; published: number; guessed: number };   // where each permit's time came from
  /** The same chain at every step's quickest and longest published time: "likely Dec 20 to Feb 3". */
  range: { fast: string; slow: string } | null;
  /** The one or two steps that decide the date: the longest on the critical chain, each with its time and source. */
  hinge: Hinge[];
  /** The critical chain, first step first: what has to finish before what. */
  chain: string[];
};
/** One step the date hinges on: its time from today (calendar days, quickest, usual, longest) and where that time comes from. */
export type Hinge = { app: string; name: Bi; agency: Bi; days: { fast: number; typical: number; slow: number }; timing: Timing; expedite?: { id: string; label: Bi } };
/** What makes the estimate real: when each application went to the agency, and how long Placetta's own filings of
    each form took (filing_stats, only forms with 3 or more). */
export type Evidence = { submitted?: Record<string, string>; stats?: FormStat[]; agencies?: AgencyStat[] };

/** An agency's observed time is used once this many of its filings were approved (outcome_rules agency_min_n). */
export const AGENCY_MIN_N = 5;
/** The key an agency's observed time is kept under (agency_times): its English name, trimmed and lower case. */
export const agencyKey = (name?: string | null) => (name ?? "").trim().toLowerCase();

const BUFFER = 7;
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const between = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

type Three = { fast: number; typical: number; slow: number };
const each = (x: Three, f: (n: number) => number): Three => ({ fast: f(x.fast), typical: f(x.typical), slow: f(x.slow) });

/** How long one step takes at the agency, in calendar days, and where that comes from. In order: the expedite the owner
 *  chose (when the agency publishes its time), Placetta's own filings of the form (the median, the slow end at p90), the
 *  agency's published time (src/forms/expedite.ts timingOf), else the 30-day default, said as a default. */
export function stepTiming(a: Application, ev: Evidence = {}): { timing: Timing; days: Three; expedite?: { id: string; label: Bi } } {
  const x = a.expedite ? expediteOptions(a.official).find(o => o.id === a.expedite) : undefined;
  const chosen = x ? { expedite: { id: x.id, label: x.label } } : {};
  if (x?.span) {
    const timing: Timing = { ...x.span, kind: "agency", say: x.turnaround, source: x.source.url, checked: x.source.checked };
    return { timing, days: each(x.span, n => calendarDays(n, x.span!.unit)), ...chosen };
  }
  const st = a.official ? ev.stats?.find(s => s.form === a.official && s.n >= 3) : undefined;
  if (st) {
    const sp = { fast: st.median_days, typical: st.median_days, slow: Math.max(st.median_days, st.p90_days), unit: "calendar" as const };
    return { timing: { ...sp, kind: "measured", say: B(`${st.median_days} days on Placetta's filings, ${st.p90_days} at the slow end`, `快哉实际办理 ${st.median_days} 天，慢的情况 ${st.p90_days} 天`) }, days: sp, ...chosen };
  }
  // the agency's own observed time on Placetta's approved filings (any of its forms), once 5 or more are behind it
  const ag = ev.agencies?.find(x => x.agency === agencyKey(a.agency?.en) && x.n >= AGENCY_MIN_N);
  if (ag) {
    const sp = { fast: ag.median_days, typical: ag.median_days, slow: Math.max(ag.median_days, ag.p90_days), unit: "calendar" as const };
    return { timing: { ...sp, kind: "measured", say: B(`${ag.median_days} days at this agency on ${ag.n} of Placetta's approved filings, ${ag.p90_days} at the slow end`, `该机构在快哉 ${ag.n} 份已批准申请中实际办理 ${ag.median_days} 天，慢的情况 ${ag.p90_days} 天`) }, days: sp, ...chosen };
  }
  const timing = timingOf(a);
  return { timing, days: each(timing, n => calendarDays(n, timing.unit)), ...chosen };
}

/** Days still to go for one application from today, before counting what it waits on: the agency's time, plus what's
 *  left before it's filed (a week to gather documents and fix what bounces, for one not ready yet). An application
 *  already with the agency counts from the day it was submitted. */
function remaining(a: Application, ev: Evidence, today: string): { days: Three; from: "measured" | "published" | "guessed" | "done"; step: ReturnType<typeof stepTiming> } {
  const step = stepTiming(a, ev);
  if (a.status === "approved") return { days: { fast: 0, typical: 0, slow: 0 }, from: "done", step };
  const from = step.timing.kind === "measured" ? "measured" : step.timing.kind === "default" ? "guessed" : "published";
  const sent = ev.submitted?.[a.id];
  const agency = step.days;
  const before: Record<string, number> = { filing: 2, ready: 3, needs: BUFFER, draft: BUFFER, todo: BUFFER, waiting: BUFFER };
  const days = a.status === "review"
    ? each(agency, n => (sent ? Math.max(2, n - Math.max(0, between(sent.slice(0, 10), today))) : Math.ceil(n / 2)))
    : each(agency, n => n + (before[a.status] ?? BUFFER));
  return { days, from, step };
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

/** Where a store's permits put its opening, what's holding it up, how much room is left, the range and the hinge. Each
 *  step starts when the steps it waits on are done (the company before the EIN, the EIN before the registrations, the
 *  plan check before the building permit and the health permit), so the date is the end of the longest chain. */
export function openingPath(s: Store, w: Workspace, today: string, ev: Evidence = {}): OpeningPath {
  const none = { measured: 0, published: 0, guessed: 0 };
  const empty = { range: null, hinge: [], chain: [] };
  if (s.stage === "open") return { verdict: "open", landing: s.opened ?? null, slack: null, guessed: 0, basis: none, ...empty };
  const apps = w.apps.filter(a => (s.apps ?? []).includes(a.id));
  if (!apps.length) return { verdict: "not_mapped", landing: null, slack: null, guessed: 0, basis: none, ...empty };
  const basis = { ...none };
  const byId = new Map(w.apps.map(a => [a.id, a]));
  const finish = new Map<string, Three>(), via = new Map<string, string | undefined>(), own = new Map<string, ReturnType<typeof remaining>>();
  let guessed = 0;
  const zero: Three = { fast: 0, typical: 0, slow: 0 };
  const visit = (a: Application, seen: Set<string>): Three => {
    if (finish.has(a.id)) return finish.get(a.id)!;
    if (seen.has(a.id)) return zero;   // a loop in the data: don't count it twice
    seen.add(a.id);
    // each of the three runs waits on its own slowest dependency; the critical chain is the usual run's
    const start = { ...zero };
    let from: string | undefined;
    for (const c of a.checklist) {
      const dep = c.dep ? byId.get(c.dep) : undefined;
      if (!dep || c.state === "done") continue;
      const f = visit(dep, seen);
      if (f.typical > start.typical) { start.typical = f.typical; from = dep.id; }
      start.fast = Math.max(start.fast, f.fast); start.slow = Math.max(start.slow, f.slow);
    }
    const r = remaining(a, ev, today);
    own.set(a.id, r);
    if (r.from !== "done") basis[r.from]++;
    if (r.from === "guessed") guessed++;
    const end = { fast: start.fast + r.days.fast, typical: start.typical + r.days.typical, slow: start.slow + r.days.slow };
    finish.set(a.id, end); via.set(a.id, from);
    return end;
  };
  let last: Application | undefined, far = 0, fast = 0, slow = 0;
  for (const a of apps) {
    const f = visit(a, new Set());
    if (f.typical > far || !last) { far = f.typical; last = a; }
    fast = Math.max(fast, f.fast); slow = Math.max(slow, f.slow);
  }
  const landing = addDays(today, far);
  // the critical chain, from the last step back to the first one that has to move
  const chain: string[] = [];
  for (let id: string | undefined = last!.id, i = 0; id && i < 40 && !chain.includes(id); i++, id = via.get(id)) chain.unshift(id);
  const b = byId.get(chain[0])!;
  const blocker = far > 0 ? { app: b.id, name: b.name, status: b.status, on: ON[b.status], why: why(b, w) } : undefined;
  // the hinge: the step on that chain that takes longest, and the next one too when it's at least half as long
  const ranked = chain.map(id => ({ a: byId.get(id)!, r: own.get(id) })).filter((x): x is { a: Application; r: ReturnType<typeof remaining> } => !!x.r && x.r.days.typical > 0)
    .sort((x, y) => y.r.days.typical - x.r.days.typical);
  const hinge: Hinge[] = ranked.filter((x, i) => i === 0 || (i === 1 && x.r.days.typical * 2 >= ranked[0].r.days.typical))
    .map(({ a, r }) => ({ app: a.id, name: a.name, agency: a.agency, days: r.days, timing: r.step.timing, ...(r.step.expedite ? { expedite: r.step.expedite } : {}) }));
  const range = far > 0 ? { fast: addDays(today, Math.min(fast, far)), slow: addDays(today, Math.max(slow, far)) } : null;
  const out = { landing, blocker, guessed, basis, range, hinge, chain };
  if (!s.plannedOpen) return { verdict: "no_date", slack: null, ...out };
  const slack = between(landing, s.plannedOpen);
  return { verdict: slack < 0 ? "late" : slack < 7 ? "tight" : "on_track", slack, ...out };
}

/* The opening date has one source: where a store's permits land today (openingPath). The store card, the cost line on
   Permits, Deadlines, Home and Odelia's answers all read it from here, so one store never shows three dates. The date
   the brand planned (plannedOpen) is only ever said as the room against it ("12 days to spare"). */

/** A store's opening: where its permits put it today; null for a store already open or not mapped yet. */
export function openingOf(s: Store, w: Workspace, today: string, ev: Evidence = {}): string | null {
  if (s.stage !== "opening") return null;
  const p = openingPath(s, w, today, ev);
  return p.verdict === "not_mapped" ? null : p.landing;
}

/** The workspace's opening: the latest of its stores still opening, else the plan written at sign-up (before any store
 *  has permits of its own). */
export function workspaceOpening(w: Workspace, today: string, ev: Evidence = {}): { date: string; store?: Store } | null {
  let best: { date: string; store?: Store } | null = null;
  for (const s of w.stores ?? []) {
    const d = openingOf(s, w, today, ev);
    if (d && (!best || d > best.date)) best = { date: d, store: s };
  }
  return best ?? (w.firstPlan?.projectedOpen ? { date: w.firstPlan.projectedOpen } : null);
}

/** The workspace's opening with everything said about it: the date, its range, the hinge, and the store it's for. The
 *  one estimate Home, Stores, the plan and the first-run build all show. The date is always workspaceOpening's. */
export function workspaceEstimate(w: Workspace, today: string, ev: Evidence = {}): { date: string; store?: Store; path?: OpeningPath } | null {
  const o = workspaceOpening(w, today, ev);
  if (!o) return null;
  return o.store ? { ...o, path: openingPath(o.store, w, today, ev) } : o;
}

const yearOf = (iso: string) => iso.slice(0, 4);
/** "Jan 7, 2027, likely Dec 20, 2026 to Feb 3" / "2027年1月7日，可能在 2026年12月20日 至 2月3日 之间": the date and its
 *  range, the range's ends with a year only where it differs from the date's. Just the date when there's no range. */
export function estimateSay(date: string, range?: { fast: string; slow: string } | null): Bi {
  const d = B(fmtDay(date, "en", true), fmtDay(date, "zh", true));
  if (!range || (range.fast === date && range.slow === date)) return d;
  const end = (x: string, l: "en" | "zh") => fmtDay(x, l, yearOf(x) !== yearOf(date));
  return B(`${d.en}, likely ${end(range.fast, "en")} to ${end(range.slow, "en")}`, `${d.zh}，可能在 ${end(range.fast, "zh")} 至 ${end(range.slow, "zh")} 之间`);
}

/** One step the date hinges on, said with its time and where the time comes from: "Food facility plan check, up to 20
 *  business days after payment, per deh.santaclaracounty.gov". A default says it's a default; a report or a statistic
 *  says what it is. */
export function hingeStepSay(h: Hinge): Bi {
  const t = h.timing, host = hostOf(t.source);
  const per = t.kind === "default" ? B("", "")
    : t.kind === "measured" ? B("", "")
    : t.kind === "report" ? B(`, per ${host}'s own performance report`, `，依据 ${host} 公布的绩效报告`)
    : t.kind === "statistic" ? B(`, per ${host} (a statistic, not the agency's)`, `，依据 ${host}（统计数据，非机构公布）`)
    : host ? B(`, per ${host}`, `，依据 ${host}`) : B("", "");
  const fast = h.expedite ? B(` with ${/^[A-Z][a-z]/.test(h.expedite.label.en) ? h.expedite.label.en.charAt(0).toLowerCase() + h.expedite.label.en.slice(1) : h.expedite.label.en}`, `（${h.expedite.label.zh}）`) : B("", "");
  return B(`${h.name.en}${fast.en}, ${t.say.en}${per.en}`, `${h.name.zh}${fast.zh}，${t.say.zh}${per.zh}`);
}

/** "The date hinges on: …" with the one or two steps that decide it, or null when nothing is left to wait on. */
export function hingeSay(p: Pick<OpeningPath, "hinge">): Bi | null {
  if (!p.hinge.length) return null;
  const parts = p.hinge.map(hingeStepSay);
  return B(`The date hinges on ${parts.map(x => x.en).join("; and ")}.`, `开业日期取决于：${parts.map(x => x.zh).join("；以及")}。`);
}

/** Deadlines with each opening store's opening as its one milestone. A stored "Target opening" milestone (the sample's,
 *  or the one written at sign-up from the month the person typed) is replaced, so the calendar never disagrees with
 *  the store card. */
export function withOpenings(w: Workspace, today: string, ev: Evidence = {}): Deadline[] {
  const opening = (w.stores ?? []).map(s => ({ s, d: openingOf(s, w, today, ev) })).filter((x): x is { s: Store; d: string } => !!x.d);
  if (!opening.length) return w.deadlines;
  const many = opening.length > 1;
  return [
    ...w.deadlines.filter(d => !isOpeningMilestone(d)),
    ...opening.map(({ s, d }) => ({ id: `open-${s.id}`, date: d, kind: "milestone" as const,
      title: many ? B(`Opening: ${s.name.en}`, `开业：${s.name.zh}`) : B("Opening, where the permits put it", "开业日（按许可进度）"),
      agency: B("Placetta, from the permits' progress", "快哉根据许可进度推算") })),
  ];
}
/** A stored opening milestone: superseded by the one worked out from the permits. */
export const isOpeningMilestone = (d: Deadline) => d.kind === "milestone" && (/(^|-)dl-open$/.test(d.id) || /^target opening/i.test(d.title.en));

/** One line for a store card or a text: "On track, 12 days to spare" / "9 days late: health permit, needs your lease". */
export function openingLine(p: OpeningPath): Bi | null {
  // only Placetta's own filing times are measured; anything else is said as an estimate
  const ab = p.basis.published + p.basis.guessed > 0 ? "About " : "", az = ab ? "约 " : "";
  const tail = (en: string, zh: string) => p.blocker ? B(`${en}. ${p.blocker.name.en}: ${p.blocker.why.en.charAt(0).toLowerCase() + p.blocker.why.en.slice(1)}`, `${zh}。${p.blocker.name.zh}：${p.blocker.why.zh}`) : B(en, zh);
  switch (p.verdict) {
    case "on_track": return B(`On track, ${ab.toLowerCase()}${p.slack} days to spare`, `进度正常，还有${az}${p.slack} 天余量`);
    case "tight": return tail(`Tight: ${ab.toLowerCase()}${p.slack} day${p.slack === 1 ? "" : "s"} to spare`, `时间紧张：仅余${az}${p.slack} 天`);
    case "late": return tail(`${ab}${-p.slack!} day${p.slack === -1 ? "" : "s"} behind the opening date`, `比开业日期晚${az}${-p.slack!} 天`);
    case "no_date": return p.landing ? B(`Permits in hand around ${fmtDay(p.landing, "en", true)}`, `预计 ${fmtDay(p.landing, "zh", true)}前后取得全部许可`) : null;
    case "not_mapped": return B("Permits not mapped yet", "尚未梳理许可");
    default: return null;
  }
}

/** Where the estimate comes from, in one sentence, so nobody plans rent around a guess without knowing it. */
export function basisLine(p: OpeningPath): Bi | null {
  const { measured: m, published: pu, guessed: g } = p.basis;
  if (!m && !pu && !g) return null;
  const en = [m && `Placetta's own filing times for ${m}`, pu && `the agency's published time for ${pu}`, g && `a 30-day default for ${g} with no published time`].filter(Boolean).join(", ");
  const zh = [m && `${m} 项按快哉实际办理时间`, pu && `${pu} 项按机构公布时间`, g && `${g} 项无公布时间，按默认 30 天估算`].filter(Boolean).join("，");
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
