// A question about a requirement ("Do I need a seller's permit in California?", "When does the San José business tax
// renew?"), answered from Placetta's official forms library alone, with no model: the form's agency, what the agency's
// page says (how it's filed, the fee it publishes, how long it takes, when it renews) and that page as the source. When
// the library doesn't have the answer for that place, the answer says so and names who to ask, never a guess.
// The demo agent (src/agent.ts) answers with it; the live agent answers the same questions from find_official_forms
// under the same rule (src/live.ts rules). Pure: the tests call it directly (scripts/eval/answers.ts).
import { B, type Bi } from "./bi";
import { FORMS, placeInfo, placesOf, type OfficialForm } from "./forms/registry";
import { worldPlaces } from "./forms/world";
import { stateAgency, stateOf } from "./plan/preview";
import { proofCurrent, whoToAsk } from "./plan/ask";
import { usPlace } from "./forms/usplace";
import { daysFromNow } from "./time";
import { formQuote, type Cite } from "./sources";

export type Grounded = {
  text: Bi;
  sources: Cite[];          // numbered in the reply, each with its quote and read date when the registry has them
  forms: string[];          // the library forms the answer comes from, most specific first
  sure: boolean;            // false: the library doesn't have it, and the answer names who to ask instead
};

type Topic = { id: string; ask: RegExp; form: (f: OfficialForm) => boolean; local: boolean; en: string; zh: string };
const name = (f: OfficialForm) => `${f.id} ${f.form} ${f.title.en}`.toLowerCase();
/** What the question is about, and which library forms answer it. local: issued by a city or county, so the place decides. */
const TOPICS: Topic[] = [
  { id: "alcohol", ask: /liquor|alcohol|beer|wine|spirits|酒/i, form: f => !!f.needs?.alcohol, local: true, en: "an alcohol license", zh: "酒类执照" },
  { id: "seller", ask: /seller'?s permit|sales (and use )?tax|certificate of authority|销售许可|销售税/i, form: f => /sales (and use )?tax|seller'?s permit|certificate of authority|sales tax vendor|reg-1|business tax registration|tax registration/.test(name(f)) && f.level === "state", local: false, en: "sales tax registration", zh: "销售税登记" },
  { id: "ein", ask: /\bEIN\b|employer identification|federal tax (id|number)|税号/i, form: f => f.id === "irs-ss4", local: false, en: "an EIN", zh: "EIN" },
  { id: "handler", ask: /food (handler|worker)|handler card|食品处理员|食品从业/i, form: f => /food (handler|worker)|food safety training card/.test(name(f)), local: false, en: "food handler cards", zh: "食品处理员卡" },
  { id: "manager", ask: /food (safety |protection )?manager|food protection certificate|sanitation certificate|食品(安全|保护)?经理/i, form: f => /food (safety |protection )?manager|food protection certificate|sanitation certificate|food safety certif|person in charge/.test(name(f)), local: false, en: "a food manager certificate", zh: "食品经理证书" },
  { id: "plan", ask: /plan (check|review)|图纸审查/i, form: f => /plan (check|review)/.test(name(f)), local: true, en: "a plan review", zh: "图纸审查" },
  { id: "health", ask: /health permit|food (service |establishment |dealer |retail )?(permit|license)|retail food|卫生许可|食品经营许可/i, form: f => /health permit|food service establishment|food (service|dealer|establishment|preparation)|retail food|permit to operate/.test(name(f)) && !/plan|manager|handler|worker|certificate|training/.test(name(f)), local: true, en: "a food permit", zh: "食品经营许可" },
  { id: "business", ask: /business (tax|license|licence|registration|certificate)|commercial activity license|营业执照|营业税|营业登记/i, form: f => (f.level === "city" || f.level === "county") && /business (tax|license|licence|registration|certificate)|commercial activity|limited business/.test(name(f)), local: true, en: "a business license", zh: "营业执照" },
  { id: "employer", ask: /employer|unemployment|payroll|雇主|失业保险/i, form: f => /unemployment|employer registration|payroll tax|commercial employers/.test(name(f)) && f.level === "state", local: false, en: "employer registration", zh: "雇主登记" },
  { id: "llc", ask: /\bLLC\b|form (a|my|the) company|articles of organization|certificate of formation|成立公司|注册公司/i, form: f => !!f.needs?.newEntity && f.id !== "ny-dos-pub", local: false, en: "forming the LLC", zh: "成立 LLC" },
  { id: "building", ask: /building permit|build-?out|construction permit|renovat|装修|建筑许可/i, form: f => /building permit|buildout|construction permit|tenant improvement/.test(name(f)), local: true, en: "a building permit", zh: "建筑许可" },
  { id: "sign", ask: /\bsign\b|signage|招牌/i, form: f => /\bsign\b/.test(name(f)), local: true, en: "a sign permit", zh: "招牌许可" },
  { id: "occupancy", ask: /certificate of occupancy|占用证/i, form: f => /certificate of occupancy/.test(name(f)), local: true, en: "a certificate of occupancy", zh: "占用证" },
  { id: "import", ask: /import|customs|\bcbp\b|bond|进口|海关/i, form: f => !!f.needs?.imports && f.level === "federal", local: false, en: "importing", zh: "进口" },
  { id: "fda", ask: /\bfda\b|food facility registration/i, form: f => f.id === "fda-ffr", local: false, en: "FDA food facility registration", zh: "FDA 食品设施注册" },
];

/** What about it they ask. */
const ASPECT = { renew: /renew|expire|due\b|good for|valid|续期|到期|有效期/i, fee: /how much|fee|cost|price|charge|费用|多少钱|收费/i, time: /how long|processing|take\b|takes\b|多久|多长时间/i };
const QUESTION = /\?|？|^(do|does|did|when|how|what|which|is|are|can|should|who|where|will|must)\b|需要|什么时候|何时|怎么|如何|多少|多久|是否|吗|哪/i;
const REQUIREMENT = /permit|licen[cs]e|registration|register|certificate|card|tax|EIN|LLC|bond|许可|执照|登记|证|税|卡/i;

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const SBA = { title: "sba.gov", url: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits" };
const LEVEL_RANK: Record<string, number> = { city: 0, county: 1, state: 2, federal: 3 };

/** The place the question names, or the business's own store when it names none. */
function placeOf(q: string, home?: string): string {
  // a place the library knows, a state, or a place it doesn't know ("in Boise"): the question's own, never the store's
  const named = placesOf(q).length > 1 || !!stateOf(q) || !!worldPlaces(q).city || /\b(in|at|near) [A-Z][a-z]+/.test(q);
  return named ? q : home ?? q;
}

export function isRequirementQuestion(q: string): boolean {
  return QUESTION.test(q.trim()) && REQUIREMENT.test(q);
}

/** The grounded answer, or null when it isn't a question about a requirement (the caller handles it as before). */
export function groundedAnswer(q: string, o: { home?: string; today?: string } = {}): Grounded | null {
  if (!isRequirementQuestion(q)) return null;
  const topic = TOPICS.find(t => t.ask.test(q));
  const where = placeOf(q, o.home);
  const places = placesOf(where), info = placeInfo(where), code = stateOf(where) ?? places.find(p => /^[A-Z]{2}$/.test(p) && p !== "US");
  if (!topic) return notSure(B("that", "这一项"), where, code);
  // the forms for this place: a city or county form only where the place is; the most local first. Fail closed: only a
  // form whose page quote was seen recently (src/plan/ask.ts) answers; one without is "not sure", naming its agency
  const today = o.today ?? daysFromNow(0);
  const all = FORMS.filter(f => topic.form(f) && places.includes(f.where) && !f.needs?.reference && (f.currency ?? "USD") === (info.currency ?? "USD"))
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.order - b.order);
  const hits = all.filter(f => f.proof && proofCurrent(f.proof, today));
  const unquoted = all.find(f => !hits.includes(f));
  // a local question needs a local answer: the federal TTB registration alone doesn't answer "a liquor license in
  // Austin", and a state form doesn't answer "a business license in Houston"
  const answered = topic.id === "alcohol" ? hits.some(f => f.level !== "federal") : topic.local ? hits.some(f => f.level === "city" || f.level === "county") : hits.length > 0;
  if (!answered) return notSure(B(topic.en, topic.zh), where, code, topic, unquoted);
  const top = topic.id === "alcohol" ? hits : hits.slice(0, 1);
  const parts = top.map(f => sayForm(f, q));
  return {
    text: B(parts.map(p => p.en).join(" "), parts.map(p => p.zh).join("")),
    sources: top.map(f => ({ title: host(f.info || f.url), url: f.info || f.url, ...formQuote(f, f.info || f.url), keys: [f.form.split(" (")[0], f.title.en, f.title.zh, f.agency.en, f.agency.zh].filter(k => k.length > 2) })),
    forms: top.map(f => f.id), sure: true,
  };
}

/** One form, as its agency states it: what the question asks about, or what it is and how it's filed. */
function sayForm(f: OfficialForm, q: string): Bi {
  const from = /^(the|your)\b/i.test(f.agency.en) ? f.agency.en.replace(/^./, c => c.toLowerCase()) : `the ${f.agency.en}`;
  const head = B(`${f.title.en}, from ${from}:`, `${f.title.zh}，由${f.agency.zh}办理：`);
  const end = (s: string) => (/[.。!?]$/.test(s.trim()) ? s.trim() : s.trim() + ".");
  let en: string, zh: string;
  if (ASPECT.renew.test(q)) {
    en = f.renews ? `it renews ${f.renews.en.replace(/^./, c => c.toLowerCase())}` : "the agency's page doesn't say when it renews; ask the agency";
    zh = f.renews ? `续期：${f.renews.zh}` : "机构页面未说明续期时间，请向机构确认";
  } else if (ASPECT.fee.test(q)) {
    en = f.fee != null ? `the fee is ${f.fee === 0 ? "nothing" : money(f.fee)}${f.feeNote ? `. ${f.feeNote.en}` : ""}` : f.feeNote ? f.feeNote.en : "the agency doesn't publish a fixed fee; it sets it case by case";
    zh = f.fee != null ? `费用${f.fee === 0 ? "为零" : "为 " + money(f.fee)}${f.feeNote ? `。${f.feeNote.zh}` : ""}` : f.feeNote ? f.feeNote.zh : "机构未公布固定费用，按个案核定";
  } else if (ASPECT.time.test(q)) {
    en = f.takes ? f.takes.en : "the agency doesn't publish a processing time";
    zh = f.takes ? f.takes.zh : "机构未公布办理时间";
  } else {
    const what = f.plain ?? f.how, saysFee = /\bfree\b|\bfee\b|\$/i.test(what.en);
    en = what.en + (f.fee != null && !saysFee ? ` Fee: ${f.fee === 0 ? "none" : money(f.fee)}.` : "");
    zh = what.zh + (f.fee != null && !saysFee ? `费用：${f.fee === 0 ? "免费" : money(f.fee)}。` : "");
  }
  return B(`${head.en} ${end(en)}`, `${head.zh}${zh.trim().replace(/[。.]?$/, "。")}`);
}

/** The library doesn't have it: say so, and who decides it. */
function notSure(what: Bi, where: string, code?: string, topic?: Topic, unquoted?: OfficialForm): Grounded {
  const st = code ? stateAgency(code) : undefined;
  // the library lists a form for it, but has no current quote from the agency's page: that agency decides, at that link
  if (unquoted) {
    // the agency's own site, where it's filed (the info page can be another office's guide that quotes it)
    const url = unquoted.url || unquoted.info;
    return {
      text: B(`I'm not sure about ${what.en} there, and I won't guess: Placetta's library lists ${unquoted.title.en}, but has no current quote from the agency's own page saying it applies. Here's who to ask: the ${unquoted.agency.en.replace(/^the /i, "")} (${url}). Tell me the answer they give and I'll keep it with your plan.`,
        `关于当地的${what.zh}我不确定，也不会猜：快哉的登记库列有${unquoted.title.zh}，但目前没有机构官方页面上说明其适用的最新原文。可以咨询：${unquoted.agency.zh}（${url}）。告诉我他们的答复，我会记入您的计划。`),
      sources: [{ title: host(url), url }], forms: [], sure: false,
    };
  }
  // the city's own site and name, from a city form the library has for the place ("City of Houston, Houston Permitting
  // Center" names the City of Houston)
  const places = placesOf(where);
  const cityForm = FORMS.find(f => f.level === "city" && f.where !== "US" && places.includes(f.where) && /^City (and County )?of /.test(f.agency.en));
  const cityUrl = cityForm ? new URL(cityForm.info || cityForm.url).origin : "";
  const cityName = cityForm ? /^(City (and County )?of [^,]+?)(?=,| Department| Office| Finance| Planning| Building| Community| Business|$)/.exec(cityForm.agency.en)?.[1] : undefined;
  const cityZh = cityForm ? cityForm.agency.zh.replace(/(市|市县).*$/, "$1") + "政府" : "";
  // no city form: the city's own .gov site from CISA's registry (src/forms/citySites.ts)
  const up = usPlace(where), asked = whoToAsk(up.city, up.state ?? code);
  // the agency that decides: the state's tax agency for a sales tax question, the state's alcohol agency for a liquor
  // license (SBA lists them by state), the city for a local permit, else SBA's directory of every state's agencies
  const who = topic?.id === "seller" && st ? { en: st.en, zh: st.zh, url: st.url }
    : topic?.id === "alcohol" ? { en: `${st ? st.state + "'s" : "the state's"} alcohol beverage control agency (SBA lists each state's)`, zh: `${st ? st.stateZh : "所在州"}的酒类管理机构（SBA 列有各州机构）`, url: SBA.url }
    : (!topic || topic.local) && cityName && cityUrl ? { en: `the ${cityName}`, zh: cityZh, url: cityUrl }
    : (!topic || topic.local) && asked.site !== "usa.gov" && up.city ? { en: `the ${asked.org ?? `City of ${up.city}`}`, zh: `${up.city}政府`, url: asked.source.url }
    : { en: "the licensing agencies SBA lists for each state", zh: "SBA 按州列出的各发证机构", url: SBA.url };
  const link = who.url ? ` (${who.url})` : "";
  return {
    text: B(`I'm not sure about ${what.en} there, and I won't guess: Placetta's library doesn't have it for that place yet. Here's who to ask: ${who.en}${link}. Tell me the answer they give and I'll keep it with your plan.`,
      `关于当地的${what.zh}我不确定，也不会猜：快哉的登记库里还没有这个地方的这一项。可以咨询：${who.zh}${link ? `（${who.url}）` : ""}。告诉我他们的答复，我会记入您的计划。`),
    sources: who.url ? [{ title: host(who.url), url: who.url }] : [SBA],
    forms: [], sure: false,
  };
}
