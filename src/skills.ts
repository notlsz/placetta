import { B, type Bi } from "./bi";
import type { Application, Skill, Workspace } from "./model";

/* Skills: instructions Placetta follows for one kind of job, like Claude's. Three sources:
   - placetta: built in, the way Placetta works.
   - auto: written by the agent from a job it finished. A form skill remembers where every line of an official form
     came from (never the values), so the next time it files that form it fills it in one step from the workspace.
     A place skill keeps the local steps it researched for a city the library doesn't cover.
   - you: written by the person. */

const DAY = "2026-10-07";
const P = (id: string, name: Bi, description: Bi, body: string): Skill => ({ id, name, description, body, source: "placetta", on: true, kind: "workflow", uses: 0, created: DAY, updated: DAY });

export const BUILTIN: Skill[] = [
  P("open-a-store", B("Open a store", "开设门店"), B("Maps every license a new store needs, prepares and fills each one, adds the deadlines and puts the ready ones up for approval, in one go.", "一次完成：梳理新门店所需的全部许可，逐一准备并填写，添加截止日期，把已就绪的提交审批。"),
    `1. find_official_forms for the business and the store's city.
2. prepare_application for each form, in filing order, with its official_form_id. If a form skill exists for it, the form fills itself; fill only what's left.
3. Fill every line from the workspace, memory and documents. Ask once, at the end, for what's truly missing.
4. add_deadline for each due date (opening dates, renewals, the 30-day rules).
5. request_filing_approval for each application that is ready.
6. For a city with no local steps in the library, follow "Research a new city".`),
  P("research-city", B("Research a new city", "调研新城市"), B("For a city the library doesn't cover: finds the local permits on the city's own sites, cites them, and saves them as a skill for next time.", "针对资料库未覆盖的城市：在当地政府官网查找本地许可并注明出处，存为技能供下次使用。"),
    `1. Start from the national steps find_official_forms returns for the country.
2. Search the city's and province's or state's official sites (gov, gouv, gov.cn, gov.uk, gov.ae and the like) for: business or trade registration, food or health permit, fire safety, signs, alcohol, and certificate of occupancy or opening licence.
3. Read the agency's own page for each and cite it. Call anything you couldn't confirm an estimate.
4. prepare_application for each local permit with the agency's root domain as agency_url and its fee in the local currency.
5. skill_save a place skill: one line per local permit with the agency, the official link, how it's filed and what it needs.`),
  P("fill-official-form", B("Fill an official form", "填写官方表格"), B("Fills a government form line by line with the form's own labels, from the workspace first, and never stores ID or bank numbers.", "按表格原有标签逐行填写政府表格，优先使用工作区资料，绝不保存证件号或银行卡号。"),
    `1. Use the official form from the library whenever it exists; never a template.
2. Fill by the form's own line numbers and labels.
3. Take values from Context, memory and uploaded documents, in that order, and keep each value's source.
4. Leave SSN, ITIN, passport, bank and card numbers empty: the signer writes them on the agency's site.
5. Mark the form ready only when every line is filled and every checklist item is in.`),
  P("renewals", B("Keep everything current", "保持证照有效"), B("Checks every license's renewal date and inspection, adds reminders, and prepares the renewal before it's due.", "检查每项证照的续期日期和检查安排，添加提醒，并在到期前准备好续期申请。"),
    `1. check_progress and read each application's renewal rule.
2. add_deadline 30 days before every renewal, inspection and annual report.
3. Prepare the renewal application early and put it up for approval.
4. If email is connected, search_email for agency notices and act on them.`),
  P("inspection-ready", B("Get a store inspection-ready", "让门店随时迎检"), B("Walks a store through what the inspector checks, finds every gap in permits, certificates, logs and vendor proof, and turns each one into a fix with a date.", "按检查员的检查项逐一排查门店，找出许可、证书、日志和服务商证明的每个缺口，并为每项定好整改日期。"),
    `1. show_licenses and check_progress for the store; list every permit, certificate and log with its status.
2. Check the items inspectors cite most: a manager with the food protection certificate on site, food handler cards, temperature and cleaning logs, pest control and hood cleaning proof, posted permits and letter grade.
3. For each gap: update_store with the gap, add_deadline for the fix (7 days for anything an inspector would cite as critical, 30 days otherwise), and prepare_application where a filing fixes it.
4. draft_document a one-page "before the inspector comes" checklist for the manager, in their language.
5. After any real inspection, read the result, update_store, and turn every cited violation into a fix the same day.`),
  P("vendor-services", B("Book vendor services", "预约服务商"), B("Tracks hood cleaning, pest control, fire extinguishers, backflow and grease traps at every store, books each one before it's due and keeps the proof.", "跟踪每家门店的排烟罩清洗、虫害防治、灭火器、防回流装置和隔油池，到期前预约并保存证明。"),
    `1. For each store, list the recurring services its permits and its fire and health inspections rely on: kitchen hood and duct cleaning, pest control, fire extinguisher service, fire suppression system service, backflow testing, grease trap pumping.
2. add_deadline for each from the date on its last service tag or invoice. If no date is known, ask once and record it.
3. 21 days before each is due, draft_message to the store's vendor (or the vendor the person names) to book it, for approval. Never book or pay on your own.
4. When it's done, review_documents for the tag or invoice, update_store with the date and the proof, and set the next deadline.`),
  P("nothing-lapses", B("Make sure nothing lapses", "确保证照零过期"), B("Watches every license, permit, certificate and service Odelia owns at every store, and escalates anything at risk of lapsing before it costs a fine or a closure.", "盯住 Odelia 负责的每家门店的每项执照、许可、证书和服务，在可能过期导致罚款或停业前及时上报。"),
    `1. Each day, check_progress across every store and list every item Odelia owns with its due date and status.
2. Anything due in 30 days and not prepared: prepare it now and request_filing_approval.
3. Anything due in 7 days and not filed: tell the person in plain words what is at risk (a fine, a closure, a lost grade), what is missing, and the one thing they need to do. Also flag it for the Placetta team.
4. Anything past due: file the late renewal or the cure at once, and draft_document a short note of what happened and what changed so it doesn't repeat.
5. Keep a running record per store: items owned, renewed on time, late, and fines. That record backs Placetta's fine promise.`),
  P("importer-filings", B("Import food and products", "食品与商品进口"), B("For brands shipping goods into the US: importer registrations, FDA facility registration and renewals, prior notice for every food shipment, supplier verification and customs paperwork.", "面向向美国发货的品牌：进口商登记、FDA 食品设施注册及续期、每批食品的预先通知、供应商核查及报关文件。"),
    `1. find_official_forms for the product type (food, cosmetics, devices, consumer products) and the US.
2. Food: confirm every foreign facility that makes, packs or holds the product has an FDA food facility registration; renewals run October 1 to December 31 of every even-numbered year, so add_deadline for each.
3. For each food shipment, prepare the FDA prior notice before it arrives, and keep the Foreign Supplier Verification Program records for each supplier.
4. Meat and poultry, like Japanese wagyu: confirm the plant is eligible to export to the US under USDA FSIS, and keep the export certificate for every lot.
5. Customs: the importer of record number and a customs bond; draft_message to the customs broker with the commercial invoice and product details, for approval.
6. Consumer products: the children's or general certificate of conformity where it applies.`),
  P("hq-report", B("Report to headquarters", "向总部汇报"), B("Every week, a one-page report per brand: which stores are current, what is due, what was filed and approved, and anything at risk, for headquarters and franchise owners.", "每周为每个品牌生成一页报告：哪些门店证照齐全、哪些即将到期、提交与获批情况及风险，供总部和加盟商查看。"),
    `1. check_progress for every store under the brand.
2. Count: stores fully current, items renewed on time, filings approved, items due in 30 days, items at risk, fines.
3. List each store at risk in one line: the item, the date, what's needed, who owns it.
4. draft_document the report in English and in the headquarters' language, and draft_message it to headquarters for approval.
5. Name the stores that are all current first. Owners compare, and the list moves the stragglers.
6. Franchisees share with headquarters in Settings, Headquarters: HQ then sees every linked franchisee's stores live in its Headquarters view and gets this summary by email each Monday. Share only store status, never documents, logins or chats.`),
  P("agency-letters", B("Write to an agency", "致函政府机构"), B("Drafts letters, narratives and statements an agency asks for, in the agency's language, ready to approve and send.", "起草机构要求的信函、说明和声明，使用该机构的语言，待批准后发送。"),
    `1. Write in the agency's language (English for US agencies, Chinese for Chinese agencies, the local language elsewhere) with a translation for the person if it differs.
2. Use the application's facts and cite the requirement it answers.
3. draft_document it, then draft_message or send_email for approval. Never send on your own.`),
];

export const allSkills = (w: Workspace): Skill[] => {
  const mine = w.skills ?? [];
  const off = new Set(mine.filter(s => s.source === "placetta" && !s.on).map(s => s.id));
  return [...mine.filter(s => s.source !== "placetta"), ...BUILTIN.map(s => (off.has(s.id) ? { ...s, on: false } : s))];
};
export const activeSkills = (w: Workspace) => allSkills(w).filter(s => s.on);

/** The index the agent sees: one line a skill, like Claude's skill list. */
export function skillIndex(w: Workspace): string {
  return activeSkills(w).map(s => `- ${s.id}: ${s.name.en}. ${s.description.en}${s.uses ? ` (used ${s.uses}x)` : ""}`).join("\n");
}

export const skillFor = (w: Workspace, key: string) => (w.skills ?? []).find(s => s.key === key && s.on);

const now = () => new Date().toISOString();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "skill";

/** Save or update a skill. Updating keeps its id, uses and created date. */
export const putSkill = (s: Partial<Skill> & { name: Bi; description: Bi; body: string; source: Skill["source"]; kind: Skill["kind"] }) => (w: Workspace): Workspace => {
  const list = w.skills ?? [];
  const at = list.findIndex(x => (s.id && x.id === s.id) || (s.key && x.key === s.key));
  if (at >= 0) {
    const old = list[at];
    return { ...w, skills: list.map((x, i) => (i === at ? { ...old, ...s, id: old.id, created: old.created, uses: s.uses ?? old.uses, updated: now() } : x)) };
  }
  let id = s.id ?? slugify(s.name.en);
  while (list.some(x => x.id === id) || BUILTIN.some(x => x.id === id)) id += "-2";
  return { ...w, skills: [{ on: true, uses: 0, created: now(), updated: now(), ...s, id }, ...list] };
};

/** Turn a skill on or off (built-in ones are remembered as turned off). */
export const toggleSkill = (id: string, on: boolean) => (w: Workspace): Workspace => {
  const list = w.skills ?? [];
  if (list.some(x => x.id === id)) return { ...w, skills: list.map(x => (x.id === id ? { ...x, on } : x)) };
  const b = BUILTIN.find(x => x.id === id);
  return b ? { ...w, skills: [...list, { ...b, on }] } : w;
};
export const dropSkill = (id: string) => (w: Workspace): Workspace => ({ ...w, skills: (w.skills ?? []).filter(x => x.id !== id || x.source === "placetta") });

/* ------------------------------------------------------------------ learning from a filled form */

const LOCAL = /address|street|city|zip|postal|county|premises|location|site|floor|square|seating|occupancy|lease|地址|街道|城市|邮编|县|场所|门店|面积|座位|租/i;

/** What a form skill can fill in a new application of the same form: the lines that aren't about one store's place,
 *  copied from the latest application of that form in this workspace. */
export function prefill(w: Workspace, formId: string, exceptId?: string): Map<string, { value: string; from: Bi }> {
  const out = new Map<string, { value: string; from: Bi }>();
  const sk = skillFor(w, "form:" + formId);
  if (!sk) return out;
  const last = [...w.apps].reverse().find(a => a.official === formId && a.id !== exceptId && a.fields.some(f => f.value));
  if (!last) return out;
  for (const f of last.fields) if (f.value && !LOCAL.test(f.label.en) && !LOCAL.test(f.label.zh)) out.set(f.id, { value: f.value, from: B(`From your ${last.name.en}`, `来自您的${last.name.zh}`) });
  return out;
}

/** After a form is filled: write (or refresh) the skill for that form, with where each line came from. */
export function learnForm(w: Workspace, a: Application, form: string, agency: Bi, steps: number): Workspace {
  if (w.skillsAuto === false || !a.official) return w;
  const filled = a.fields.filter(f => f.value);
  if (!filled.length) return w;
  const key = "form:" + a.official, old = skillFor(w, key);
  const fills = filled.map(f => ({ line: f.label.en, from: f.from?.en ?? "Filled by Placetta" }));
  const local = a.fields.filter(f => LOCAL.test(f.label.en) || LOCAL.test(f.label.zh)).map(f => f.label.en);
  const body = [`Form: ${form}. Agency: ${agency.en}.`,
    `1. prepare_application with official_form_id "${a.official}". Lines that don't depend on the store fill themselves from the last one.`,
    local.length ? `2. Fill the store's own lines: ${local.join("; ")}.` : "2. Check every line is filled.",
    `3. Where each line came from last time:`, ...fills.map(f => `   - ${f.line} <- ${f.from}`),
    `4. request_filing_approval when it's ready.`].join("\n");
  return putSkill({
    key, kind: "form", source: "auto", on: old?.on ?? true,
    name: B(`File ${form}`, `申报${form}`),
    description: B(`How to fill ${form} for ${agency.en}: which lines come from where, so the next one fills itself.`, `如何为${agency.zh}填写${form}：每一行的来源，下次可自动填写。`),
    body, fills, uses: (old?.uses ?? 0) + 1, firstSteps: old?.firstSteps ?? steps, lastSteps: steps,
  })(w);
}
