// The finishing pass of 2026-10-22 (docs/COVERAGE.md): every guide city that wasn't fully covered, taken step by step
// through the national, state or regional, and city levels for a restaurant and a shop. Same rules as
// src/forms/europe.ts and src/forms/intl.ts: a proof is a sentence of under 25 words copied from the government's own
// page (in the page's language, with an English gloss), the URL that was fetched and the day it was read; an entry
// whose official page couldn't be read has no proof (UNVERIFIED), so its plan row abstains and names the office, and no
// fee or time is stated for it. A secondary source (a law firm, a blog, an aggregator) that led to a filing is kept only
// in the internal `lead` field, never shown or cited.
//
// FINISH_FIXES add a proof to an entry that was already in the registry (src/forms/audit.ts applies them after its own
// fixes), each with the sentence and the page it was read on.
import { B, type Bi } from "../bi";
import type { Level } from "../model";
import type { Method, Needs, OfficialForm, Segment } from "./registry";
import type { Fix } from "./audit";

export const READ_FIN = "2026-10-22";
type T = readonly [string, string];
const b = (t: T): Bi => B(t[0], t[1]);
const ALL: Segment[] = ["restaurant", "retail", "seller", "warehouse"];
const PREMISES: Segment[] = ["restaurant", "retail", "warehouse"];
const STORES: Segment[] = ["restaurant", "retail"];

type Entry = {
  id: string; where: string; level: Level; segs?: Segment[]; needs?: Needs; unless?: (keyof Needs)[]; method: Method; order: number; form: string;
  title: T; agency: T; how: T; url: string; fee?: number | null; cur: string; feeNote?: T; takes?: T; renews?: T; foreign?: T; specialist?: T; plain?: T;
  /** [the page read, the sentence as written, its English translation when the page isn't in English] */
  proof?: readonly [string, string, string?];
  info?: string; except?: string[];
  /** internal only, never shown or cited: a secondary source that named the filing when no official page could be read */
  lead?: string;
};
function N(o: Entry): OfficialForm {
  const info = o.proof?.[0] ?? o.info ?? o.url;
  return {
    id: o.id, form: o.form, title: b(o.title), agency: b(o.agency), level: o.level, where: o.where, segments: o.segs ?? ALL,
    ...(o.needs ? { needs: o.needs } : {}), ...(o.unless ? { unless: o.unless } : {}), method: o.method, how: b(o.how), url: o.url, info,
    fee: o.fee === undefined ? null : o.fee, currency: o.cur, ...(o.feeNote ? { feeNote: b(o.feeNote) } : {}), ...(o.takes ? { takes: b(o.takes) } : {}),
    ...(o.renews ? { renews: b(o.renews) } : {}), fields: [], ...(o.foreign ? { foreign: b(o.foreign) } : {}), ...(o.specialist ? { specialist: b(o.specialist) } : {}),
    ...(o.plain ? { plain: b(o.plain) } : {}), ...(o.except ? { except: o.except } : {}), ...(o.lead ? { lead: o.lead } : {}), checked: o.proof ? "page" : "known", order: o.order,
    ...(o.proof ? { proof: { read: o.proof[0], quote: o.proof[1], checked: READ_FIN, ...(o.proof[2] ? { en: o.proof[2] } : {}) } } : {}),
  };
}
/** A proof added to an entry already in the registry: [id, the page read, the sentence, its English gloss, why]. */
const P = (id: string, read: string, quote: string, en: string | undefined, why: string): Fix => ({ id, info: read, proof: { read, quote, ...(en ? { en } : {}) }, why });

/* ------------------------------------------------------------------ Austria (Vienna, Graz) */
const AT_FB = "https://www.usp.gv.at/themen/betrieb-und-umwelt/laufender-betrieb/firmenbuch.html";
const AT_FA = "https://www.usp.gv.at/themen/steuern-finanzen/steuerliche-rechte-und-pflichten/pflichten-des-unternehmers.html";
const AT_SV = "https://www.usp.gv.at/themen/mitarbeiter-und-gesundheit/einstellung-mitarbeiter-und-arten-der-beschaeftigung/weitere-informationen-einstellen-von-personal/anmeldung-dienstnehmer.html";
const VIE_BA = "https://www.wien.gv.at/amtswege/genehmigung-betriebsanlage";
const VIE_GG = "https://www.wien.gv.at/amtswege/betrieb-gastgarten-anzeige";
const GRZ_BA = "https://www.graz.at/cms/beitrag/10223874/7708483";

const AUSTRIA: OfficialForm[] = [
  N({ id: "at-finanzamt", where: "AT", level: "federal", method: "pdf_mail", order: 25, cur: "EUR",
    form: "Verf 15 (Kapitalgesellschaften), Verf 24 (Einzelunternehmen)", title: ["Tax registration with the Finanzamt Österreich (tax number)", "向奥地利税务局登记（取得税号）"],
    agency: ["Finanzamt Österreich (Federal Ministry of Finance)", "奥地利税务局（联邦财政部）"],
    how: ["The opening of the business is reported to the Finanzamt Österreich within one month, which sends the questionnaire (Verf 15 for a company) and issues the tax number. A one-person GmbH can report it through the USP's eGründung.", "企业须在开业后一个月内向奥地利税务局申报，税务局随后寄送问卷（公司为 Verf 15）并发放税号。一人有限公司可通过 USP 的电子设立服务申报。"],
    url: AT_FA, takes: ["Within one month of opening.", "开业后一个月内。"],
    proof: [AT_FA, "Die Betriebseröffnung ist dem Finanzamt Österreich innerhalb eines Monats anzuzeigen.", "The opening of the business must be reported to the Finanzamt Österreich within one month."] }),
  N({ id: "at-oegk", where: "AT", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "EUR", fee: 0,
    form: "Beitragskontonummer and Anmeldung (ELDA)", title: ["Employer account and staff registration with the health insurance fund (ÖGK)", "向奥地利健康保险基金（ÖGK）登记雇主账户并为员工参保"],
    agency: ["Österreichische Gesundheitskasse (ÖGK)", "奥地利健康保险基金（ÖGK）"],
    how: ["Before the first hire the employer asks the ÖGK, free and online, for an employer account number, then registers every employee through ELDA before they start work.", "首次雇人前，雇主在线向 ÖGK 免费申请雇主账号，并在员工上岗前通过 ELDA 为每位员工登记参保。"],
    url: AT_SV, feeNote: ["The employer account number is free.", "雇主账号免费。"], takes: ["Each employee is registered before starting work.", "每位员工须在上岗前登记。"],
    proof: [AT_SV, "Die/der Dienstgebende muss jede beschäftigte Person (Voll- und Teilversicherte) vor Arbeitsantritt beim zuständigen Krankenversicherungsträger anmelden.", "The employer must register every employee (fully and partly insured) with the competent health insurance fund before they start work."] }),
  N({ id: "at-vie-betriebsanlage", where: "AT-VIE", level: "city", segs: PREMISES, method: "pdf_mail", order: 50, cur: "EUR",
    form: "Antrag um Genehmigung bzw. Änderung der Betriebsanlage", title: ["Premises use permit (Betriebsanlagengenehmigung)", "经营场所使用许可（Betriebsanlagengenehmigung）"],
    agency: ["City of Vienna, Magistratisches Bezirksamt for the district", "维也纳市所在区办事处（Magistratisches Bezirksamt）"],
    how: ["A restaurant or shop whose kitchen, machines or customers could affect neighbours, staff or guests needs the district office's approval before it is built or changed. The application is made on the city's form with plans and a description of the premises.", "厨房、设备或顾客可能影响邻居、员工或顾客的餐厅或商店，须在建设或改造前取得所在区办事处的批准。以市政府表格提交，附平面图和场所说明。"],
    url: "https://www.wien.gv.at/pdf/mba/ansuchen-gewerbe.pdf",
    feeNote: ["No federal fees. On-site hearings cost 25 euros per half hour and official (weekdays 7.30 to 15.30).", "无联邦规费。现场审查每位官员每半小时 25 欧元（工作日 7:30 至 15:30）。"],
    takes: ["The approval must be in hand before the premises are built or changed.", "须在场所建设或改造前取得批准。"],
    proof: [VIE_BA, "Die Genehmigung muss vor Errichtung oder Änderung der Betriebsanlage vorliegen.", "The approval must be in hand before the premises are built or changed."] }),
  N({ id: "at-vie-gastgarten", where: "AT-VIE", level: "city", segs: ["restaurant"], needs: { terrace: true }, method: "online", order: 73, cur: "EUR",
    form: "Anzeige Betrieb eines Gastgartens (§ 76a GewO)", title: ["Outdoor seating (Schanigarten) notice or permit", "户外座位（Schanigarten）申报或许可"],
    agency: ["City of Vienna, Magistratisches Bezirksamt for the district", "维也纳市所在区办事处（Magistratisches Bezirksamt）"],
    how: ["A garden of up to 75 seats that serves only food and drink is reported to the district office; a larger one needs a permit, and seating on public ground also needs a permit under the Gebrauchsabgabegesetz.", "最多 75 个座位、只供餐饮的户外区域向区办事处申报即可；更大的须取得许可，占用公共用地还须依《使用费法》另行申请许可。"],
    url: VIE_GG,
    proof: [VIE_GG, "Für den Betrieb von Gastgärten ist im Allgemeinen eine Bewilligung nach der Gewerbeordnung erforderlich.", "Running an outdoor garden generally needs a permit under the Trade Regulation Act."] }),
  N({ id: "at-grz-betriebsanlage", where: "AT-GRZ", level: "city", segs: PREMISES, method: "pdf_mail", order: 50, cur: "EUR",
    form: "Ansuchen um Genehmigung der Betriebsanlage", title: ["Premises use permit (Betriebsanlagengenehmigung)", "经营场所使用许可（Betriebsanlagengenehmigung）"],
    agency: ["City of Graz, Bau- und Anlagenbehörde (Referat für gastgewerbliche Betriebsanlagen)", "格拉茨市建筑与设施管理局（餐饮经营场所科）"],
    how: ["The signed application goes to the Bau- und Anlagenbehörde on paper with three sets of technical documents and one digital copy; a restaurant is handled by the department for hospitality premises.", "签名申请连同三套技术文件以纸质提交建筑与设施管理局，并附一份电子版；餐厅由餐饮经营场所科办理。"],
    url: GRZ_BA,
    feeNote: ["14.30 euros per application plus federal administrative charges; on-site hearings 50 euros per half hour and official.", "每份申请 14.30 欧元另加联邦行政规费；现场审查每位官员每半小时 50 欧元。"],
    takes: ["Decided within 6 months of a complete application.", "材料齐全后 6 个月内作出决定。"],
    proof: [GRZ_BA, "Grundsätzlich sind Bewilligungsverfahren binnen 6 Monaten ab Antragstellung zu erledigen", "Permit procedures are in principle to be decided within 6 months of the application"] }),
];

/* ------------------------------------------------------------------ Switzerland (Zurich, Bern) */
const CH_HR = "https://www.kmu.admin.ch/de/anmeldung-eines-unternehmens-im-handelsregister";
const CH_AHV = "https://faq.bsv.admin.ch/de/alters-und-hinterlassenenversicherung-ahv/ahv-beitraege-arbeitgeber/welche-pflichten-habe-ich-als";
const ZH_GMBH = "https://www.zh.ch/de/wirtschaft-arbeit/unternehmensportal/opu/firma-gruenden/rechtsform-waehlen/gmbh-gruenden.html";
const BE_GMBH = "https://www.hra.dij.be.ch/de/start/rechtsformen/gmbH.html";
const ZRH_GASTRO = "https://www.stadt-zuerich.ch/de/stadtleben/veranstaltungen-und-bewilligungen/gastgewerbe/der-weg-zum-restaurant.html";
const ZRH_FOOD = "https://www.stadt-zuerich.ch/de/planen-und-bauen/bauvorschriften-und-planerische-grundlagen/bauten-anlagen/lebensmittelbetriebe.html";
const ZRH_BAU = "https://www.stadt-zuerich.ch/de/planen-und-bauen/baubewilligungen/bewilligungspflichtige-vorhaben.html";
const ZRH_REKLAME = "https://www.stadt-zuerich.ch/de/planen-und-bauen/baubewilligungen/reklame-aussenwerbung/gesuche.html";
const BE_GASTRO = "https://www.rsta.dij.be.ch/de/start/themen/gastgewerbe/betriebsbewilligung-gastgewerbe.html";
const BRN_BAU = "https://www.bern.ch/themen/planen-und-bauen/baubewilligung/baugesuche-gastgewerbe-und-aussenbewirtungsflaechen";

const SWITZERLAND: OfficialForm[] = [
  N({ id: "ch-zh-hr", where: "CH-ZH", level: "state", needs: { newEntity: true }, method: "pdf_mail", order: 10, cur: "CHF",
    form: "Anmeldung Neueintragung GmbH (Handelsregisteramt des Kantons Zürich)", title: ["Commercial register entry in the canton of Zurich", "在苏黎世州商业登记处登记公司"],
    agency: ["Handelsregisteramt des Kantons Zürich", "苏黎世州商业登记处"],
    how: ["After a notary has recorded the founding deed, the GmbH is filed with the Zurich commercial register office with the deed and the office's application form. The company exists from its entry.", "公证人作成设立文书后，持文书和登记处申请表向苏黎世州商业登记处申请登记。公司自登记之日起成立。"],
    url: ZH_GMBH, specialist: ["A Swiss notary records the founding deed of a GmbH or AG: Placetta prepares the details and hands them to one.", "瑞士 GmbH 或 AG 的设立文书须由瑞士公证人作成：快哉准备资料并交给公证人。"],
    proof: [ZH_GMBH, "Nach der notariellen Beurkundung melden Sie Ihre GmbH beim Handelsregisteramt Zürich an.", "After the notarial deed, you register your GmbH with the Zurich commercial register office."] }),
  N({ id: "ch-be-hr", where: "CH-BE", level: "state", needs: { newEntity: true }, method: "pdf_mail", order: 10, cur: "CHF",
    form: "Anmeldeformular Neueintragung GmbH (Handelsregisteramt des Kantons Bern)", title: ["Commercial register entry in the canton of Bern", "在伯尔尼州商业登记处登记公司"],
    agency: ["Handelsregisteramt des Kantons Bern", "伯尔尼州商业登记处"],
    how: ["The founding of a GmbH is recorded by a notary, who usually files the documents with the Bern commercial register office.", "GmbH 的设立须经公证，通常由公证人向伯尔尼州商业登记处提交文件。"],
    url: BE_GMBH, specialist: ["A Swiss notary records the founding deed of a GmbH or AG: Placetta prepares the details and hands them to one.", "瑞士 GmbH 或 AG 的设立文书须由瑞士公证人作成：快哉准备资料并交给公证人。"],
    proof: [BE_GMBH, "Die Gründung einer Gesellschaft mit beschränkter Haftung muss öffentlich beurkundet werden.", "The founding of a limited liability company must be publicly notarised."] }),
  N({ id: "ch-zrh-gastro-project", where: "CH-ZRH", level: "city", segs: ["restaurant", "retail"], needs: { food: true }, method: "online", order: 48, cur: "CHF",
    form: "Projektbewilligung Gastwirtschafts- und Lebensmittelbetriebe", title: ["Food business project approval", "餐饮与食品经营项目审批"],
    agency: ["City of Zurich, Umwelt- und Gesundheitsschutz (UGZ)", "苏黎世市环境与健康保护局（UGZ）"],
    how: ["A business that serves food and drink, or a food shop, has its project approved by the city's food inspectorate, usually as a condition of the building permit, and reports readiness for the joint opening inspection.", "供应餐饮的场所或食品店，其项目须经市食品监管部门审批（通常为建筑许可的附带条件），完工后申报联合开业验收。"],
    url: ZRH_FOOD,
    proof: [ZRH_FOOD, "Betriebe benötigen eine Bewilligung, wenn sie Speisen und Getränke mit oder ohne Bedienung anbieten.", "Businesses need a permit when they offer food and drink, with or without table service."] }),
  N({ id: "ch-zrh-patent", where: "CH-ZRH", level: "city", segs: ["restaurant"], method: "pdf_mail", order: 76, cur: "CHF",
    form: "Gesuch für ein Patent zur Führung einer Gastwirtschaft", title: ["Restaurant licence (Gastwirtschaftspatent)", "餐饮经营执照（Gastwirtschaftspatent）"],
    agency: ["City of Zurich, Stadtpolizei, Kommissariat Verwaltungspolizei (Bewilligung Gastro)", "苏黎世市警察局行政警察科（餐饮许可）"],
    how: ["Filed at least 4 weeks before opening, once the building permit and the food project approval are final; the licence can be granted at the opening inspection.", "在建筑许可和食品项目审批生效后、开业至少 4 周前提交；可在开业验收时当场发放。"],
    url: "https://www.stadt-zuerich.ch/content/dam/web/de/stadtleben/veranstaltungen-und-bewilligungen/dokumente/gastgewerbe/der-weg-zum-restaurant/gesuch-fuer-ein-patent-zur-fuehrung-einer-gastwirtschaft.pdf",
    feeNote: ["CHF 341 without an opening inspection, CHF 451 with one.", "无开业验收 341 瑞士法郎，含开业验收 451 瑞士法郎。"], takes: ["Filed at least 4 weeks before opening.", "开业至少 4 周前提交。"],
    proof: [ZRH_GASTRO, "Dafür brauchen Sie ein Gastwirtschaftspatent und eine Betriebsbewilligung.", "For that you need a restaurant licence and an operating permit."] }),
  N({ id: "ch-zrh-baubewilligung", where: "CH-ZRH", level: "city", segs: PREMISES, method: "online", order: 50, cur: "CHF",
    form: "Baugesuch (eBaugesucheZH)", title: ["Building permit, including a change of use", "建筑许可（含用途变更）"],
    agency: ["City of Zurich, Amt für Baubewilligungen", "苏黎世市建筑许可局"],
    how: ["New building, alterations and certain changes of use need a building permit, applied for on the canton's eBaugesucheZH platform; ventilation and air conditioning are permit items too.", "新建、改建和部分用途变更须申请建筑许可，在州 eBaugesucheZH 平台提交；通风和空调设备也须许可。"],
    url: ZRH_BAU, takes: ["About 2 months (notice procedure), 3 months (ordinary fast) or 5 months (ordinary long), after a 21-day completeness check.", "21 天完整性预审后，申报程序约 2 个月，普通快速程序约 3 个月，普通长程序约 5 个月。"],
    proof: [ZRH_BAU, "Eine Baubewilligung ist zum Beispiel nötig für:", "A building permit is needed, for example, for:"] }),
  N({ id: "ch-zrh-reklame", where: "CH-ZRH", level: "city", segs: STORES, needs: { signage: true }, method: "online", order: 80, cur: "CHF",
    form: "Reklamegesuch (eBaugesucheZH)", title: ["Sign permit (Reklamebewilligung)", "招牌许可（Reklamebewilligung）"],
    agency: ["City of Zurich, Amt für Baubewilligungen", "苏黎世市建筑许可局"],
    how: ["A new or changed sign needs a permit first; a pre-enquiry or the application itself is made online.", "新设或更改招牌须事先取得许可；可在线预询或直接提交申请。"],
    url: ZRH_REKLAME,
    proof: [ZRH_REKLAME, "Sie brauchen vorgängig eine Bewilligung, wenn Sie bestehende Reklameanlagen abändern oder neue Reklameanlagen anbringen wollen.", "You need a permit beforehand to change an existing sign or put up a new one."] }),
  N({ id: "ch-zrh-boulevard", where: "CH-ZRH", level: "city", segs: ["restaurant"], needs: { terrace: true }, method: "online", order: 73, cur: "CHF",
    form: "Bewilligung Boulevardgastronomie", title: ["Outdoor seating on public ground (Boulevardcafé)", "公共用地户外座位（Boulevardcafé）"],
    agency: ["City of Zurich, Stadtpolizei", "苏黎世市警察局"],
    how: ["Tables and chairs on public ground need the city police's permit.", "在公共用地摆放桌椅须取得市警察局许可。"],
    url: "https://www.stadt-zuerich.ch/de/stadtleben/veranstaltungen-und-bewilligungen/gastgewerbe/boulevardgastronomie.html",
    proof: [ZRH_FOOD, "Die Bewilligung für die Benutzung des öffentlichen Grundes (Boulevardcafé) erteilt die Stadtpolizei.", "The permit to use public ground (a pavement café) is granted by the city police."] }),
  N({ id: "ch-be-gastro", where: "CH-BE", level: "state", segs: ["restaurant"], method: "pdf_mail", order: 76, cur: "CHF",
    form: "Gesuch um Betriebsbewilligung Gastgewerbe", title: ["Restaurant operating permit (Betriebsbewilligung Gastgewerbe)", "餐饮经营许可（Betriebsbewilligung Gastgewerbe）"],
    agency: ["Regierungsstatthalteramt Bern-Mittelland (filed through the City of Bern)", "伯尔尼中部地区政府专员办公室（经伯尔尼市提交）"],
    how: ["To open or take over a restaurant in the canton of Bern, the operating permit is applied for once the building permit is in hand; in the city, the form goes to the city's office, which forwards it.", "在伯尔尼州开设或接手餐厅，须在取得建筑许可后申请经营许可；在伯尔尼市，表格交市政府办公室转呈。"],
    url: "https://www.rsta.dij.be.ch/content/dam/rsta_dij/dokumente/de/themen/gastgewerbe/RSTA_Gesuch_Betriebsbewilligung_Gastgewerbe_de.pdf",
    proof: [BE_GASTRO, "Um im Kanton Bern einen Gastgewerbebetrieb zu eröffnen oder zu übernehmen, benötigen Sie eine Betriebsbewilligung Gastgewerbe.", "To open or take over a restaurant in the canton of Bern you need a restaurant operating permit."] }),
  N({ id: "ch-be-food", where: "CH-BE", level: "state", segs: ["restaurant"], needs: { food: true }, method: "pdf_mail", order: 74, cur: "CHF",
    form: "Dokumentation zur Selbstkontrolle (with the operating permit application)", title: ["Food safety self-check review by the cantonal laboratory", "州实验室审核食品安全自检文件"],
    agency: ["Kantonales Laboratorium Bern", "伯尔尼州实验室"],
    how: ["The restaurant's food safety self-check documentation goes to the cantonal laboratory with the operating permit application, which confirms it on the form.", "餐厅的食品安全自检文件连同经营许可申请提交州实验室，由其在申请表上确认。"],
    url: BE_GASTRO,
    proof: [BE_GASTRO, "Erstellen Sie die Dokumentation zur Selbstkontrolle und reichen Sie diese zusammen mit dem Gesuch um Betriebsbewilligung Gastgewerbe dem Kantonalen Laboratorium Bern ein.", "Prepare the self-check documentation and submit it with the restaurant operating permit application to the Bern cantonal laboratory."] }),
  N({ id: "ch-brn-baubewilligung", where: "CH-BRN", level: "city", segs: PREMISES, method: "pdf_mail", order: 50, cur: "CHF",
    form: "Baugesuch (Bauinspektorat der Stadt Bern)", title: ["Building permit, including a change of use", "建筑许可（含用途变更）"],
    agency: ["City of Bern, Bauinspektorat", "伯尔尼市建筑监察局"],
    how: ["A restaurant's building permit, and one for outdoor seating, is applied for with the city's building inspectorate, which publishes guidance for restaurant applications.", "餐厅及其户外座位的建筑许可向市建筑监察局申请，该局发布餐饮类申请指南。"],
    url: BRN_BAU,
    proof: [BE_GASTRO, "Prüfen Sie vorgängig, ob die erforderliche Baubewilligung vorliegt.", "Check first that the required building permit is in hand."] }),
];

/* ------------------------------------------------------------------ Sweden (Stockholm, Gothenburg) */
const SE_BV = "https://bolagsverket.se/foretag/aktiebolag/startaaktiebolag.html";
const SE_MOMS = "https://www.skatteverket.se/foretag/moms/momsregistrering/registreradittforetagformoms.4.deeebd105a602bfe38000256.html";
const SE_AG = "https://www.skatteverket.se/foretag/arbetsgivare/arbetsgivarregistrering/registreradig.4.18e1b10334ebe8bc80003496.html";
const STO_FOOD = "https://tillstand.stockholm/tillstand-regler-och-tillsyn/servering-av-mat/anmala-livsmedels--eller-kontaktmaterialverksamhet/";
const STO_BYGG = "https://tillstand.stockholm/tillstand-regler-och-tillsyn/lokal-och-fastigheter/ansoka-om-bygglov-eller-gora-en-bygganmalan/";
const STO_SKYLT = "https://tillstand.stockholm/tillstand-regler-och-tillsyn/lokal-och-fastigheter/ansoka-om-bygglov-for-skylt/";
const STO_ALK = "https://tillstand.stockholm/tillstand-regler-och-tillsyn/servering-av-alkohol/ansok-om-serveringstillstand-for-alkohol/";
const STO_UTE = "https://tillstand.stockholm/tillstand-regler-och-tillsyn/anvanda-offentlig-plats/anvanda-offentlig-plats-for-uteservering/";
const GOT_FOOD = "https://goteborg.se/wps/portal/start/foretag-och-organisationer/tillstand-och-regler/salja-och-servera/livsmedel/registrera-livsmedelsverksamhet";
const GOT_BYGG = "https://goteborg.se/wps/portal/start/bygga-bo-och-leva-hallbart/bygga-riva-och-forandra/vad-ska-du-bygga/andra-inomhus/andra-anvandning";
const GOT_ALK = "https://goteborg.se/wps/portal/start/foretag-och-organisationer/tillstand-och-regler/salja-och-servera/serveringstillstand-for-alkohol/ansok-om-serveringstillstand-ny/serveringstillstand-for-restauranger-ny2";

const SWEDEN: OfficialForm[] = [
  N({ id: "se-moms", where: "SE", level: "federal", method: "online", order: 25, cur: "SEK", fee: 0,
    form: "Skatte- och avgiftsanmälan (SKV 4620), on verksamt.se", title: ["VAT and F-tax registration with Skatteverket", "向瑞典税务局（Skatteverket）登记增值税和 F 税"],
    agency: ["Skatteverket (Swedish Tax Agency)", "瑞典税务局（Skatteverket）"],
    how: ["Registered on verksamt.se with the company registration, or on form SKV 4620; a business with taxable sales registers for VAT.", "在 verksamt.se 与公司注册一并办理，或填写 SKV 4620 表；有应税销售的企业须登记增值税。"],
    url: "https://www.skatteverket.se/foretag/etjansterochblanketter/blanketterbroschyrer/blanketter/info/4620.4.6efe6285127ab4f1d2580003836.html",
    proof: [SE_MOMS, "Du ska registrera ditt företag för moms om båda dessa förutsättningar gäller för dig:", "You must register your business for VAT if both of these conditions apply to you:"] }),
  N({ id: "se-arbetsgivare", where: "SE", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "SEK", fee: 0,
    form: "Arbetsgivarregistrering (verksamt.se, or SKV 4620)", title: ["Employer registration with Skatteverket", "向瑞典税务局登记为雇主"],
    agency: ["Skatteverket (Swedish Tax Agency)", "瑞典税务局（Skatteverket）"],
    how: ["A company that pays wages registers as an employer through the e-service on verksamt.se, or on form SKV 4620, and then files a monthly employer return.", "支付工资的公司须通过 verksamt.se 的电子服务或 SKV 4620 表登记为雇主，此后每月提交雇主申报。"],
    url: SE_AG,
    proof: [SE_AG, "Du behöver registrera dig som arbetsgivare om du ska betala ut ersättning för arbete", "You need to register as an employer if you will pay compensation for work"] }),
  N({ id: "se-sto-livsmedel", where: "SE-STO", level: "city", segs: ["restaurant", "retail", "warehouse"], needs: { food: true }, method: "online", order: 74, cur: "SEK",
    form: "Anmälan om registrering av livsmedelsanläggning (MF4037)", title: ["Food business registration with the city's food control", "向斯德哥尔摩市食品监管部门登记食品经营"],
    agency: ["City of Stockholm, Miljöförvaltningen (food control)", "斯德哥尔摩市环境管理局（食品监管）"],
    how: ["Most businesses that sell, serve or handle food register with the environment department's food control before they start; a few register with Livsmedelsverket instead.", "多数销售、供应或经营食品的企业须在开业前向市环境管理局食品监管部门登记；少数改向瑞典食品局登记。"],
    url: STO_FOOD, takes: ["Registered before the business starts.", "开业前登记。"],
    proof: [STO_FOOD, "Du får inte starta verksamheten innan du anmält den.", "You may not start the business before you have registered it."] }),
  N({ id: "se-sto-bygglov", where: "SE-STO", level: "city", segs: PREMISES, method: "online", order: 50, cur: "SEK",
    form: "Ansökan om bygglov eller bygganmälan", title: ["Building permit or building notice, including a change of use", "建筑许可或建筑申报（含用途变更）"],
    agency: ["City of Stockholm, Stadsbyggnadskontoret (building permits)", "斯德哥尔摩市城市建设局（建筑许可）"],
    how: ["Building, extending or altering premises, including changing their use or façade, often needs a building permit or a notice to the city.", "新建、扩建或改造场所，包括变更用途或外立面，通常须申请建筑许可或向市政府申报。"],
    url: "https://bygglov.stockholm/",
    proof: [STO_BYGG, "Ska du bygga nytt, bygga till, riva eller göra en ändring av din lokal? Då kan du behöva söka bygglov eller göra en anmälan.", "Building new, extending, demolishing or altering your premises? Then you may need a building permit or to file a notice."] }),
  N({ id: "se-sto-skylt", where: "SE-STO", level: "city", segs: STORES, needs: { signage: true }, method: "online", order: 80, cur: "SEK",
    form: "Bygglov för skylt", title: ["Sign permit (bygglov för skylt)", "招牌建筑许可"],
    agency: ["City of Stockholm, Stadsbyggnadskontoret (building permits)", "斯德哥尔摩市城市建设局（建筑许可）"],
    how: ["Putting up, moving or changing a sign usually needs a building permit; the rules depend on where it is and how it looks.", "安装、移动或更改招牌通常须申请建筑许可，具体视位置和样式而定。"],
    url: STO_SKYLT,
    proof: [STO_SKYLT, "Du behöver oftast bygglov för att sätta upp, flytta eller ändra en skylt.", "You usually need a building permit to put up, move or change a sign."] }),
  N({ id: "se-sto-servering", where: "SE-STO", level: "city", segs: ["restaurant"], needs: { alcohol: true }, method: "online", order: 71, cur: "SEK", fee: 12590,
    form: "Ansökan om stadigvarande serveringstillstånd", title: ["Alcohol serving licence (serveringstillstånd)", "酒类供应许可（serveringstillstånd）"],
    agency: ["City of Stockholm, permits unit for alcohol serving", "斯德哥尔摩市酒类供应许可部门"],
    how: ["A restaurant that serves alcohol all year applies for a permanent serving licence, by e-service or form.", "全年供应酒类的餐厅须通过电子服务或表格申请长期供应许可。"],
    url: STO_ALK, feeNote: ["12,590 kronor for a new permanent licence, invoiced; not refunded if refused.", "新长期许可 12,590 瑞典克朗，开票收取；被拒不退。"], takes: ["About 3 months.", "约 3 个月。"],
    proof: [STO_ALK, "Ska du servera alkohol året runt behöver du ett stadigvarande tillstånd för allmänheten eller slutet sällskap.", "To serve alcohol all year you need a permanent licence for the public or a closed party."] }),
  N({ id: "se-sto-uteservering", where: "SE-STO", level: "city", segs: STORES, needs: { terrace: true }, method: "online", order: 73, cur: "SEK",
    form: "Polistillstånd för uteservering", title: ["Outdoor seating on public ground (police permit)", "公共用地户外座位（警察许可）"],
    agency: ["Polismyndigheten, after the City of Stockholm's review", "瑞典警察局（经斯德哥尔摩市审查）"],
    how: ["Outdoor seating outside a shop, restaurant or café, or on a parking space, needs a police permit, and sometimes a building permit too.", "在商店、餐厅或咖啡馆外或停车位上设置户外座位，须取得警察许可，有时还须建筑许可。"],
    url: STO_UTE,
    proof: [STO_UTE, "Vill du ha en uteservering utanför din butik, restaurang, ett kafé eller på en parkeringsyta måste du söka polistillstånd.", "To have outdoor seating outside your shop, restaurant or café, or on a parking space, you must apply for a police permit."] }),
  N({ id: "se-got-livsmedel", where: "SE-GOT", level: "city", segs: ["restaurant", "retail", "warehouse"], needs: { food: true }, method: "online", order: 74, cur: "SEK",
    form: "Registrering av livsmedelsverksamhet (e-tjänst, or form RA9112)", title: ["Food business registration with the city", "向哥德堡市登记食品经营"],
    agency: ["City of Gothenburg, Miljöförvaltningen", "哥德堡市环境管理局"],
    how: ["A food business is registered with the environment department before it starts or is taken over, online or on paper; a move or a new company number needs a new registration.", "食品经营须在开业或接手前向市环境管理局登记，可在线或纸质办理；搬迁或更换公司号码须重新登记。"],
    url: GOT_FOOD, feeNote: ["Charged at the hourly rate of 1,786 kronor (2026); a registration usually takes about an hour.", "按每小时 1,786 瑞典克朗（2026 年）收费，登记通常约需一小时。"],
    proof: [GOT_FOOD, "Innan du tar över eller startar en livsmedelsverksamhet i Göteborg måste du registrera den.", "Before you take over or start a food business in Gothenburg you must register it."] }),
  N({ id: "se-got-bygglov", where: "SE-GOT", level: "city", segs: PREMISES, method: "online", order: 50, cur: "SEK",
    form: "Ansökan för byggärenden (lov och anmälan)", title: ["Building permit for a change of use", "用途变更建筑许可"],
    agency: ["City of Gothenburg, Stadsbyggnadskontoret", "哥德堡市城市建设局"],
    how: ["Changing the use of a building, or part of one, substantially needs a building permit from the city.", "对建筑物或其一部分的用途作重大变更，须向市政府申请建筑许可。"],
    url: GOT_BYGG,
    proof: [GOT_BYGG, "Du behöver bygglov för att avsevärt ändra användningen av en byggnad eller en del av en byggnad.", "You need a building permit to substantially change the use of a building or part of a building."] }),
  N({ id: "se-got-servering", where: "SE-GOT", level: "city", segs: ["restaurant"], needs: { alcohol: true }, method: "online", order: 71, cur: "SEK", fee: 12090,
    form: "Ansökan om stadigvarande serveringstillstånd till allmänheten", title: ["Alcohol serving licence (serveringstillstånd)", "酒类供应许可（serveringstillstånd）"],
    agency: ["City of Gothenburg, permits unit (tillståndsenheten) of the Miljöförvaltningen", "哥德堡市环境管理局许可科"],
    how: ["A restaurant or bar that serves alcohol applies, in the name of its company, for a permanent serving licence to the public.", "供应酒类的餐厅或酒吧须以其公司名义申请面向公众的长期供应许可。"],
    url: GOT_ALK, feeNote: ["12,090 kronor for a new permanent licence, plus a yearly supervision fee.", "新长期许可 12,090 瑞典克朗，另每年缴纳监管费。"],
    proof: [GOT_ALK, "Om du ska servera alkohol på en restaurang, bar eller liknande behöver du ett serveringstillstånd som gäller tills vidare", "To serve alcohol in a restaurant, bar or similar you need a serving licence valid until further notice"] }),
];

/* ------------------------------------------------------------------ Denmark (Copenhagen, Aarhus) */
const DK_ERST = "https://erhvervsstyrelsen.dk/vejledning-stiftelse-af-aps-og-as";
const DK_MOMS = "https://skat.dk/erhverv/guides-og-webinarer-til-start-ups/start-up-med-skat/for-selskaber/de-foerste-trin";
const DK_AG = "https://skat.dk/erhverv/guides-og-webinarer-til-start-ups/start-up-med-skat/for-selskaber/ansatte/del-1-kom-i-gang";
const CPH_TJEK = "https://www.kk.dk/erhverv/butik-gadesalg-og-restaurant/tjekliste-for-nye-restauratoerer";
const CPH_ALK = "https://www.kk.dk/erhverv/butik-gadesalg-og-restaurant/alkoholbevilling";
const AAR_ALK = "https://aarhus.dk/virksomhed/tilladelser/alkoholbevilling";
const AAR_BYGG = "https://aarhus.dk/borger/bolig-byggeri-og-miljoe/byggeri/vil-du-aendre-brugen-af-din-bygning";
const AAR_UDE = "https://aarhus.dk/virksomhed/tilladelser/soeg-til-udeservering";

const DENMARK: OfficialForm[] = [
  N({ id: "dk-moms", where: "DK", level: "federal", method: "online", order: 25, cur: "DKK", fee: 0,
    form: "Momsregistrering (virk.dk)", title: ["VAT registration with the Danish Tax Agency", "向丹麦税务局登记增值税"],
    agency: ["Skattestyrelsen (Danish Tax Agency), through virk.dk", "丹麦税务局（经 virk.dk）"],
    how: ["Once the company exists it registers on virk.dk for the duties that apply; a company expected to sell more than 50,000 kroner in 12 months registers for VAT.", "公司成立后在 virk.dk 登记适用的义务；预计 12 个月内营业额超过 5 万丹麦克朗的公司须登记增值税。"],
    url: "https://virk.dk/integration/ERST/Startblanketten_momsregistrering_mv",
    proof: [DK_MOMS, "Hvis selskabet forventes at omsætte for mere end 50.000 kr. i løbet af 12 måneder, skal det som udgangspunkt registreres for moms.", "If the company is expected to turn over more than 50,000 kroner in 12 months, it must as a rule register for VAT."] }),
  N({ id: "dk-arbejdsgiver", where: "DK", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "DKK", fee: 0,
    form: "Registrering som arbejdsgiver (virk.dk), then eIndkomst", title: ["Employer registration (A-tax and labour market contribution)", "雇主登记（A 税与劳动力市场缴款）"],
    agency: ["Skattestyrelsen (Danish Tax Agency), through virk.dk", "丹麦税务局（经 virk.dk）"],
    how: ["Before paying wages the company registers as an employer on virk.dk, then reports and pays A-tax and labour market contributions every month in eIndkomst.", "支付工资前，公司须在 virk.dk 登记为雇主，此后每月在 eIndkomst 申报并缴纳 A 税和劳动力市场缴款。"],
    url: "https://virk.dk/integration/ERST/Startblanketten_momsregistrering_mv",
    proof: [DK_AG, "Før du kan udbetale løn fra selskabet, skal du registrere selskabet som arbejdsgiver.", "Before you can pay wages from the company, you must register the company as an employer."] }),
  N({ id: "dk-cph-byggetilladelse", where: "DK-CPH", level: "city", segs: PREMISES, method: "online", order: 50, cur: "DKK",
    form: "Byggeansøgning (Byg og Miljø)", title: ["Building permit for a restaurant or change of use", "餐厅或用途变更建筑许可"],
    agency: ["City of Copenhagen, Område for Bygninger", "哥本哈根市建筑管理处"],
    how: ["Setting up a restaurant needs a building permit, applied for in Byg og Miljø, with the fire safety, escape route and access requirements that go with it.", "开设餐厅须通过 Byg og Miljø 申请建筑许可，并满足相应的消防安全、疏散通道和无障碍要求。"],
    url: "https://www.kk.dk/borger/bolig-og-byggeri/byggetilladelse/byggetilladelse-trin-for-trin/restaurant-og-cafe",
    proof: [CPH_TJEK, "Hvis du ønsker at etablere en restaurant, skal du ansøge om byggetilladelse.", "If you want to set up a restaurant, you must apply for a building permit."] }),
  N({ id: "dk-cph-alkohol", where: "DK-CPH", level: "city", segs: ["restaurant"], needs: { alcohol: true }, method: "pdf_mail", order: 71, cur: "DKK",
    form: "Ansøgning om alkoholbevilling (Københavns Politi)", title: ["Alcohol licence (alkoholbevilling)", "酒类许可（alkoholbevilling）"],
    agency: ["Copenhagen Police, for the City of Copenhagen's licensing board (Bevillingsnævnet)", "哥本哈根警察局（代哥本哈根市许可委员会）"],
    how: ["A restaurant applies on the police's forms once it is registered with the Danish Veterinary and Food Administration; the licensing board can give a provisional indication for an address before the premises are taken.", "餐厅在食品管理局完成登记后，以警方表格申请；租用场所前可向许可委员会申请预先意见。"],
    url: CPH_ALK,
    proof: [CPH_ALK, "Restaurationer i København skal søge via blanketter på Politiets hjemmeside.", "Restaurants in Copenhagen must apply on the forms on the police's website."] }),
  N({ id: "dk-cph-udeservering", where: "DK-CPH", level: "city", segs: STORES, needs: { terrace: true }, method: "online", order: 73, cur: "DKK",
    form: "Tilladelse til udeservering", title: ["Outdoor seating permit (udeservering)", "户外座位许可（udeservering）"],
    agency: ["City of Copenhagen, Område for Miljø og Byliv", "哥本哈根市环境与城市生活处"],
    how: ["Where there is room outside, a café or restaurant can apply to the city for outdoor seating.", "门外有空间时，咖啡馆或餐厅可向市政府申请户外座位。"],
    url: CPH_TJEK,
    proof: [CPH_TJEK, "Hvis der er nok plads uden for din café eller restaurant, kan du muligvis få tilladelse til udeservering.", "If there is enough room outside your café or restaurant, you may be able to get an outdoor seating permit."] }),
  N({ id: "dk-aar-byggetilladelse", where: "DK-AAR", level: "city", segs: PREMISES, method: "online", order: 50, cur: "DKK",
    form: "Byggeansøgning (Byg og Miljø)", title: ["Building permit, including a change of use", "建筑许可（含用途变更）"],
    agency: ["Aarhus Municipality, Byggeri", "奥胡斯市建筑管理处"],
    how: ["Building work or a new use of premises needs a building permit from the municipality before work starts or the use changes.", "建筑工程或场所用途变更须在开工或变更前取得市政府建筑许可。"],
    url: AAR_BYGG,
    proof: [AAR_BYGG, "Du må ikke begynde på byggeriet, og du må ikke ændre anvendelsen, før du har en byggetilladelse.", "You may not start building or change the use before you have a building permit."] }),
  N({ id: "dk-aar-alkohol", where: "DK-AAR", level: "city", segs: ["restaurant"], needs: { alcohol: true }, method: "pdf_mail", order: 71, cur: "DKK",
    form: "Ansøgning om alkoholbevilling (Østjyllands Politi)", title: ["Alcohol licence (alkoholbevilling)", "酒类许可（alkoholbevilling）"],
    agency: ["East Jutland Police, for Aarhus Municipality's licensing board", "东日德兰警察局（代奥胡斯市许可委员会）"],
    how: ["Serving drinks of 2.8% alcohol or more needs an alcohol licence, applied for on the East Jutland Police's forms.", "供应酒精度 2.8% 及以上的饮品须取得酒类许可，以东日德兰警察局表格申请。"],
    url: AAR_ALK,
    proof: [AAR_ALK, "Hvis du vil servere alkohol, med en alkoholvolumen på 2,8% eller højere, skal du have en alkoholbevilling.", "If you want to serve alcohol of 2.8% by volume or more, you must have an alcohol licence."] }),
  N({ id: "dk-aar-udeservering", where: "DK-AAR", level: "city", segs: STORES, needs: { terrace: true }, method: "online", order: 73, cur: "DKK",
    form: "Tilladelse til udeservering", title: ["Outdoor seating permit (udeservering)", "户外座位许可（udeservering）"],
    agency: ["Aarhus Municipality", "奥胡斯市政府"],
    how: ["A restaurant using public ground in front of its premises for outdoor seating applies to the municipality.", "餐厅使用店前公共用地设置户外座位须向市政府申请。"],
    url: AAR_UDE,
    proof: [AAR_UDE, "Hvis du som restauratør i Aarhus Kommune vil bruge et offentligt areal foran din café eller restaurant til udeservering, skal du søge om tilladelse.", "If you, as a restaurateur in Aarhus, want to use public ground in front of your café or restaurant for outdoor seating, you must apply for a permit."] }),
];

/* ------------------------------------------------------------------ Finland (Helsinki) */
const FI_PRH = "https://www.prh.fi/fi/yrityksetjayhteisot/yrityksenperustaminen/osakeyhtion-perustaminen-ja-perustamisilmoitus_1.html";
const FI_VAT = "https://www.vero.fi/en/businesses-and-corporations/taxes-and-charges/vat/how-to-register-for-vat/";
const FI_EMP = "https://www.vero.fi/en/businesses-and-corporations/taxes-and-charges/being-an-employer/employer-register/";
const HEL_FOOD = "https://www.hel.fi/en/business-and-work/apply-for-permits-and-facilities/food-business/registering-a-food-business";
const HEL_BUILD = "https://www.hel.fi/static/rakvv/ohjeet/Ravintola_kahvila.pdf";

const FINLAND: OfficialForm[] = [
  N({ id: "fi-vat", where: "FI", level: "federal", method: "online", order: 25, cur: "EUR", fee: 0,
    form: "VAT register entry (start-up notification on ytj.fi, or MyTax)", title: ["VAT registration with the Finnish Tax Administration", "向芬兰税务局登记增值税"],
    agency: ["Verohallinto (Finnish Tax Administration)", "芬兰税务局（Verohallinto）"],
    how: ["A company is entered in the VAT register with its start-up notification on ytj.fi, or later in MyTax; it must register once turnover passes 20,000 euros in a calendar year.", "公司可在 ytj.fi 提交开业通知时一并登记增值税，或稍后在 MyTax 办理；日历年营业额超过 2 万欧元时必须登记。"],
    url: "https://www.ytj.fi",
    proof: [FI_VAT, "it has to be entered in the VAT register if its turnover exceeds €20,000 in a calendar year."] }),
  N({ id: "fi-employer", where: "FI", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "EUR", fee: 0,
    form: "Employer register entry (ytj.fi, or MyTax)", title: ["Employer registration with the Finnish Tax Administration", "向芬兰税务局登记雇主"],
    agency: ["Verohallinto (Finnish Tax Administration)", "芬兰税务局（Verohallinto）"],
    how: ["A company that pays wages regularly signs up for the employer register and reports every payment of wages to the Incomes Register.", "定期支付工资的公司须登记进入雇主登记册，每次发薪均向收入登记处申报。"],
    url: "https://www.ytj.fi",
    proof: [FI_EMP, "Companies acting as regular employers must always sign up for the register of employers."] }),
  N({ id: "fi-hel-food", where: "FI-HEL", level: "city", segs: ["restaurant", "retail", "warehouse"], needs: { food: true }, method: "online", order: 74, cur: "EUR",
    form: "Food business notification (elintarvikehuoneistoilmoitus, Ilppa)", title: ["Food premises notification to the city", "向赫尔辛基市申报食品经营场所"],
    agency: ["City of Helsinki, Environmental Services (food safety unit)", "赫尔辛基市环境服务局（食品安全科）"],
    how: ["A restaurant or shop notifies the city of its food business four weeks before it starts, online, by email or by post, with a floor plan; the city processes it within a week.", "餐厅或商店须在开业前四周以在线、电邮或邮寄方式向市政府申报食品经营，附平面图；市政府一周内处理。"],
    url: HEL_FOOD, takes: ["Filed four weeks before opening; processed within a week.", "开业前四周申报；一周内处理。"],
    proof: [HEL_FOOD, "Submit your notification four weeks before commencing food business activities."] }),
  N({ id: "fi-hel-build", where: "FI-HEL", level: "city", segs: PREMISES, method: "online", order: 50, cur: "EUR",
    form: "Rakentamislupa (käyttötarkoituksen muutos), Lupapiste", title: ["Building permit for a change of use (to a restaurant)", "用途变更建筑许可（改为餐厅）"],
    agency: ["City of Helsinki, Building Control Services (rakennusvalvonta)", "赫尔辛基市建筑监管服务处"],
    how: ["Turning a shop, café or other premises into a restaurant, or making permit-level changes to the kitchen, ventilation, exits or fire compartments, needs a building permit, applied for in Lupapiste.", "将商店、咖啡馆或其他场所改为餐厅，或对厨房、通风、出口或防火分区作须许可的改动，须在 Lupapiste 申请建筑许可。"],
    url: HEL_BUILD,
    proof: [HEL_BUILD, "Rakentamislupa käyttötarkoituksen muutokselle tai teknisille muutoksille tarvitaan, jos huoneiston käyttötarkoitus muutetaan esimerkiksi myymälästä, kahvilasta tai liiketilasta ravintolaksi", "A building permit for a change of use or technical changes is needed if the premises' use is changed, for example from a shop, café or business premises to a restaurant"] }),
];

/* ------------------------------------------------------------------ Poland (Warsaw) */
const PL_KRS = "https://www.biznes.gov.pl/pl/portal/ou1503";
const PL_VAT = "https://www.biznes.gov.pl/pl/portal/ou1609";
const PL_ZUS = "https://www.biznes.gov.pl/pl/portal/00275";
const PL_SAN = "https://www.biznes.gov.pl/pl/portal/ou521";
const PL_USE = "https://www.biznes.gov.pl/pl/portal/ou555";
const WAW_ALK = "https://warszawa19115.pl/en/-/zezwolenie-na-sprzedaz-napojow-alkoholowych-przeznaczonych-do-spozycia-w-miejscu-sprzedazy-gastronomia-";

const POLAND: OfficialForm[] = [
  N({ id: "pl-vat", where: "PL", level: "federal", method: "online", order: 25, cur: "PLN",
    form: "VAT-R (zgłoszenie rejestracyjne w zakresie podatku od towarów i usług)", title: ["VAT registration with the tax office (VAT-R)", "向税务局登记增值税（VAT-R）"],
    agency: ["Urząd skarbowy (tax office), Krajowa Administracja Skarbowa", "波兰税务局（国家财政管理局）"],
    how: ["The VAT-R form goes to the tax office, online through the tax portal with a qualified signature or on paper; registering is required once the year's sales pass 240,000 złoty, and optional before.", "VAT-R 表交税务局，可凭合格电子签名经税务门户在线提交或纸质提交；年销售额超过 24 万兹罗提时必须登记，之前可自愿登记。"],
    url: PL_VAT,
    proof: [PL_VAT, "Masz obowiązek rejestracji jako podatnik VAT, jeżeli: wartość twojej sprzedaży w poprzednim roku przekroczyła kwotę 240 000 złotych", "You must register as a VAT taxpayer if the value of your sales in the previous year exceeded 240,000 złoty"] }),
  N({ id: "pl-zus", where: "PL", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "PLN", fee: 0,
    form: "ZUS ZUA (zgłoszenie pracownika), on PUE/eZUS", title: ["Employer contributions account and staff registration with ZUS", "向波兰社保局（ZUS）登记雇主缴费账户和员工参保"],
    agency: ["Zakład Ubezpieczeń Społecznych (ZUS)", "波兰社会保险局（ZUS）"],
    how: ["A company in the KRS is registered as a contribution payer from the court register's data; each employee is then registered with ZUS within 7 days of starting work.", "在 KRS 登记的公司依法院登记数据自动登记为缴费人；每位员工须在开始工作后 7 天内向 ZUS 登记。"],
    url: PL_ZUS, takes: ["Each employee within 7 days of starting work.", "每位员工开始工作后 7 天内。"],
    proof: [PL_ZUS, "Pracownika lub współpracownika musisz zgłosić do ZUS w ciągu 7 dni od dnia rozpoczęcia pracy lub współpracy,", "You must register an employee or contractor with ZUS within 7 days of the day they start work,"] }),
  N({ id: "pl-waw-sanepid", where: "PL-WAW", level: "city", segs: ["restaurant", "retail", "warehouse"], needs: { food: true }, method: "online", order: 74, cur: "PLN",
    form: "Wniosek o wpis do rejestru zakładów podlegających urzędowej kontroli Państwowej Inspekcji Sanitarnej", title: ["Food premises entry in the sanitary inspection's register (Sanepid)", "食品经营场所在卫生监督局（Sanepid）登记"],
    agency: ["Państwowy Powiatowy Inspektor Sanitarny w m.st. Warszawie (PSSE Warszawa)", "华沙市县级国家卫生监督员（华沙卫生防疫站）"],
    how: ["A restaurant or shop selling food asks the Warsaw sanitary inspector to enter its premises in the register at least 14 days before it starts; some activities need approval instead.", "销售食品的餐厅或商店须在开业至少 14 天前申请华沙卫生监督员将其场所登记入册；部分活动须改为审批。"],
    url: PL_SAN, takes: ["Filed at least 14 days before opening.", "开业至少 14 天前提交。"],
    proof: [PL_SAN, "Wniosek złóż co najmniej 14 dni przed planowanym rozpoczęciem działalności.", "File the application at least 14 days before the planned start of the business."] }),
  N({ id: "pl-waw-use", where: "PL-WAW", level: "city", segs: PREMISES, method: "online", order: 50, cur: "PLN",
    form: "Zgłoszenie zmiany sposobu użytkowania obiektu budowlanego lub jego części (PB-18)", title: ["Change-of-use notice for the building (PB-18)", "建筑用途变更申报（PB-18）"],
    agency: ["Prezydent m.st. Warszawy (the district office's architecture and building department)", "华沙市长（所在区办事处建筑与施工处）"],
    how: ["Changing the use of a building or unit, for example to a restaurant, is notified to the city (a city with county rights) on form PB-18, online through e-Budownictwo or on paper; works needing a building permit are applied for together.", "变更建筑物或单元的用途（例如改为餐厅），须以 PB-18 表经 e-Budownictwo 在线或纸质向市政府（具县级权限）申报；需建筑许可的工程一并申请。"],
    url: "https://wnioski.gunb.gov.pl/",
    proof: [PL_USE, "Chcesz zmienić sposób użytkowania budynku lub lokalu? Musisz zgłosić zmianę sposobu użytkowania.", "Want to change the use of a building or unit? You must notify the change of use."] }),
  N({ id: "pl-waw-alcohol", where: "PL-WAW", level: "city", segs: ["restaurant"], needs: { alcohol: true }, method: "pdf_mail", order: 71, cur: "PLN",
    form: "Wniosek o wydanie zezwolenia na sprzedaż napojów alkoholowych przeznaczonych do spożycia w miejscu sprzedaży", title: ["Alcohol licence for on-site consumption", "店内饮用酒类销售许可"],
    agency: ["City of Warsaw, district office (opinion of the city's alcohol problems commission)", "华沙市所在区办事处（经市酒类问题委员会审议）"],
    how: ["A restaurant applies to the district office; staff inspect the premises and the city's commission reviews the location and the licence limit before the licence is issued, separately for each of three strengths of drink.", "餐厅向区办事处申请；工作人员现场查看，市委员会审查位置和许可数量上限后签发，三种酒精度分别发证。"],
    url: WAW_ALK,
    feeNote: ["First year at a new location: 525 złoty for drinks up to 4.5% and beer, 525 złoty for 4.5% to 18%, 2,100 złoty above 18%.", "新地点首年：4.5% 以下及啤酒 525 兹罗提，4.5% 至 18% 525 兹罗提，18% 以上 2,100 兹罗提。"],
    proof: [WAW_ALK, "Zezwolenie wydawane jest w formie decyzji administracyjnej.", "The licence is issued as an administrative decision."] }),
];

/* ------------------------------------------------------------------ Belgium (Brussels) */
const BE_SOC = "https://business.belgium.be/fr/creer-votre-entreprise/enregistrer-votre-entreprise/creer-votre-societe";
const BE_ONSS = "https://www.socialsecurity.be/site_fr/general/first_visit/access/register-as-employer.htm";
const BRU_HORECA = "https://www.bruxelles.be/horeca-autorisation-exploitation";
const BRU_URB = "https://www.bruxelles.be/obtenir-une-autorisation-pour-ouvrir-un-commerce";
const BRU_TERR = "https://www.bruxelles.be/horeca-terrasse";

const BELGIUM: OfficialForm[] = [
  N({ id: "be-societe", where: "BE", level: "federal", needs: { newEntity: true }, method: "in_person", order: 10, cur: "EUR",
    form: "Acte constitutif (SRL, SA or SC), filed with the enterprise court registry", title: ["Company formation: deed of incorporation filed with the enterprise court", "设立公司：设立文书提交企业法院"],
    agency: ["Greffe du tribunal de l'entreprise (through the notary)", "企业法院书记处（经公证人提交）"],
    how: ["The founders sign the deed (an authentic notarial deed for an SRL, SA or SC) with a financial plan, and the deed is filed with the competent enterprise court registry within 30 days of signing.", "创始人签署设立文书（SRL、SA 或 SC 须为公证文书）并附财务计划，签署后 30 天内提交主管企业法院书记处。"],
    url: BE_SOC, takes: ["Filed within 30 days of signing the deed.", "签署设立文书后 30 天内提交。"],
    specialist: ["A Belgian notary draws up the deed of an SRL, SA or SC: Placetta prepares the details and hands them to one.", "比利时 SRL、SA 或 SC 的设立文书须由比利时公证人作成：快哉准备资料并交给公证人。"],
    proof: [BE_SOC, "L’acte constitutif doit être déposé au greffe du tribunal de l’entreprise compétent, dans les 30 jours après la signature de l’acte constitutif.", "The deed of incorporation must be filed with the competent enterprise court registry within 30 days of signing it."] }),
  N({ id: "be-onss", where: "BE", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "EUR", fee: 0,
    form: "Identification employeur (WIDE), then Dimona for each hire", title: ["Employer registration with the social security office (ONSS)", "向比利时社会保障局（ONSS）登记雇主"],
    agency: ["Office national de sécurité sociale (ONSS)", "比利时国家社会保障局（ONSS）"],
    how: ["Before the first hire the business identifies itself as an employer with the ONSS through the online service WIDE and receives an ONSS number; each hire is then declared in Dimona.", "首次雇人前，企业通过在线服务 WIDE 向 ONSS 登记为雇主并取得 ONSS 编号；此后每次雇人均须在 Dimona 申报。"],
    url: BE_ONSS,
    proof: [BE_ONSS, "Tout employeur qui engage quelqu'un pour la première fois doit s'identifier en tant qu'employeur à l'ONSS.", "Every employer who hires someone for the first time must identify itself as an employer with the ONSS."] }),
  N({ id: "be-bru-urbanisme", where: "BE-BRU", level: "city", segs: PREMISES, method: "online", order: 50, cur: "EUR",
    form: "Permis d'urbanisme (changement d'affectation)", title: ["Planning permit for the use (permis d'urbanisme)", "城市规划许可（用途）"],
    agency: ["City of Brussels, Urbanisme (under the Brussels-Capital Region's planning code)", "布鲁塞尔市城市规划处（依布鲁塞尔首都大区规划法规）"],
    how: ["A restaurant, café, snack bar or any shop where food or drink is consumed on site needs a planning permit for that use; the operating licence is refused if the building's planning use doesn't match.", "餐厅、咖啡馆、小吃店或任何可现场饮食的商店，须为该用途取得规划许可；建筑规划用途不符时经营许可会被拒绝。"],
    url: BRU_URB,
    proof: [BRU_URB, "D’après l’ordonnance régionale du 12 décembre 2002, les activités ci-dessous sont soumises à un permis d’urbanisme :", "Under the regional ordinance of 12 December 2002, the activities below are subject to a planning permit:"] }),
  N({ id: "be-bru-horeca", where: "BE-BRU", level: "city", segs: ["restaurant"], method: "online", order: 76, cur: "EUR", fee: 150,
    form: "Autorisation d'exploitation (attestation de conformité)", title: ["Hospitality operating licence (attestation de conformité)", "餐饮经营许可（合规证明）"],
    agency: ["City of Brussels, Affaires économiques (Horeca)", "布鲁塞尔市经济事务处（餐饮）"],
    how: ["A restaurant, café or snack bar applies to the city at least 3 months before opening so the file can be finished 20 days before; the licence certifies the premises meet the rules for receiving the public.", "餐厅、咖啡馆或小吃店须在开业至少 3 个月前向市政府申请，以便在开业前 20 天完成；该许可证明场所符合接待公众的规定。"],
    url: BRU_HORECA, feeNote: ["150 euros file fee.", "档案费 150 欧元。"], takes: ["Filed at least 3 months before opening.", "开业至少 3 个月前提交。"], renews: ["Every 5 years.", "每 5 年。"],
    proof: [BRU_HORECA, "Vous ouvrez un restaurant, café, snack ? N'oubliez pas de faire une demande d'autorisation d'exploitation ! Vous devez l'obtenir avant l'ouverture.", "Opening a restaurant, café or snack bar? Remember to apply for the operating licence! You must have it before opening."] }),
  N({ id: "be-bru-terrasse", where: "BE-BRU", level: "city", segs: ["restaurant"], needs: { terrace: true }, method: "online", order: 73, cur: "EUR",
    form: "Autorisation pour placer une terrasse dans l'espace public", title: ["Outdoor seating on public ground (terrasse)", "公共用地户外座位（terrasse）"],
    agency: ["City of Brussels, Affaires économiques (Horeca)", "布鲁塞尔市经济事务处（餐饮）"],
    how: ["A restaurant or café that puts a terrace on public ground applies to the city.", "在公共用地设置露台的餐厅或咖啡馆须向市政府申请。"],
    url: BRU_TERR,
    proof: [BRU_TERR, "Une autorisation est nécessaire pour garantir le respect des règles d'occupation de l'espace public et assurer la sécurité des usagers.", "A permit is needed to ensure the rules on occupying public space are kept and users are safe."] }),
];

/* ------------------------------------------------------------------ Portugal (Lisbon) */
const PT_EH = "https://registo.justica.gov.pt/Empresas/Empresa-na-Hora";
const PT_GUIA = "https://areadocomerciante.dgae.gov.pt/documentacao1/documentos/20250530-guia-da-restauracao_2025-pdf.aspx";

const PORTUGAL: OfficialForm[] = [
  N({ id: "pt-seg-social", where: "PT", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "EUR", fee: 0,
    form: "Comunicação de admissão de trabalhador (Segurança Social Direta)", title: ["Employer duties with Social Security: hiring declarations", "社会保障雇主义务：雇佣申报"],
    agency: ["Instituto da Segurança Social (Segurança Social Direta)", "葡萄牙社会保障局（Segurança Social Direta）"],
    how: ["The company's registration with Social Security follows from the tax start-of-activity declaration; as an employer it declares every new hire online in Segurança Social Direta within the 24 hours before the contract starts.", "公司在社会保障局的登记随税务开业申报自动完成；作为雇主，每名新员工须在合同生效前 24 小时内通过 Segurança Social Direta 在线申报。"],
    url: "https://www.seg-social.pt/admissao-de-trabalhadores", takes: ["Each hire declared within the 24 hours before the contract starts.", "每名新员工须在合同生效前 24 小时内申报。"],
    proof: [PT_GUIA, "A admissão de novos trabalhadores nas 24 horas anteriores ao início de produção de efeitos do contrato de trabalho", "Hiring new workers [is declared] in the 24 hours before the employment contract takes effect"] }),
  N({ id: "pt-lis-utilizacao", where: "PT-LIS", level: "city", segs: PREMISES, method: "online", order: 50, cur: "EUR",
    form: "Autorização de utilização (or a change of use)", title: ["Use permit for the premises (autorização de utilização)", "场所使用许可（autorização de utilização）"],
    agency: ["Câmara Municipal de Lisboa (Urbanismo)", "里斯本市政府（城市规划）"],
    how: ["Whatever the premises, a restaurant needs a use authorisation from the city; in a used building the existing one is checked for restaurant use, or a change of use is applied for.", "无论何种场所，餐厅均须取得市政府的使用许可；旧建筑须核查现有许可是否涵盖餐饮用途，否则须申请用途变更。"],
    url: PT_GUIA,
    proof: [PT_GUIA, "Qualquer que seja o espaço onde irá ser instalado o seu estabelecimento, necessita de autorização de utilização, que é concedida pela câmara municipal.", "Whatever the space where your establishment will be installed, you need a use authorisation, which is granted by the municipal council."] }),
  N({ id: "pt-lis-mcp", where: "PT-LIS", level: "city", segs: ["restaurant"], method: "online", order: 76, cur: "EUR",
    form: "Mera comunicação prévia (Balcão do Empreendedor, gov.pt)", title: ["Opening notice for a restaurant or bar (mera comunicação prévia)", "餐饮场所开业事先申报（mera comunicação prévia）"],
    agency: ["Câmara Municipal de Lisboa, through the gov.pt business counter", "里斯本市政府（经 gov.pt 企业服务窗口）"],
    how: ["Opening a restaurant or bar is, as a rule, a prior notice to the city made on gov.pt, kept on file with proof of the fees paid; where some requirements can't be met, the city's authorisation is needed instead.", "开设餐厅或酒吧一般须在 gov.pt 向市政府提交事先申报，并保存已缴费用的凭证；部分要求无法满足时，须改为取得市政府批准。"],
    url: "https://www.gov.pt/servicos/abrir-um-estabelecimento-de-restauracao-ou-bebidas",
    proof: [PT_GUIA, "A abertura de um estabelecimento de restauração ou de bebidas está sujeita a um de dois procedimentos, a efetuar no Portal Gov.pt:", "Opening a restaurant or bar is subject to one of two procedures, made on the Gov.pt portal:"] }),
];

/* ------------------------------------------------------------------ Ireland (Dublin, Cork) */
const IE_CRO = "https://cro.ie/registration/company/required-steps/";
const IE_PAYE = "https://www.revenue.ie/en/employing-people/becoming-an-employer-and-ongoing-obligations/registration-of-employers-for-paye-purposes/index.aspx";
const IE_FSC = "https://www.gov.ie/en/dublin-city-council/services/getting-a-fire-safety-certificate/";
const DUB_PLAN = "https://www.dublincity.ie/planning-and-land-use/make-planning-application/apply-planning-permission";
const ORK_PLAN = "https://www.corkcity.ie/en/council-services/services/planning/planning-application-process/";

const IRELAND: OfficialForm[] = [
  N({ id: "ie-paye", where: "IE", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "EUR", fee: 0,
    form: "Employer registration for PAYE (MyEnquiries in ROS)", title: ["Employer registration with Revenue (PAYE)", "向爱尔兰税务局登记雇主（PAYE）"],
    agency: ["Revenue (Office of the Revenue Commissioners)", "爱尔兰税务局"],
    how: ["Before paying an employee, the company tells Revenue through MyEnquiries in ROS that it will pay staff; a company registers even if its only employees are its directors.", "向员工发薪前，公司须通过 ROS 中的 MyEnquiries 告知税务局将支付工资；即使只有董事领薪，公司也须登记。"],
    url: IE_PAYE,
    proof: [IE_PAYE, "If you hire an employee, you must register as an employer."] }),
  N({ id: "ie-fsc", where: "IE", level: "city", segs: PREMISES, needs: { buildout: true }, method: "online", order: 52, cur: "EUR",
    form: "Fire Safety Certificate (BCMS)", title: ["Fire safety certificate for a fit-out or change of use", "装修或用途变更消防安全证书"],
    agency: ["The council's building control authority (Dublin City Council, Cork City Council fire prevention)", "市议会建筑管控机关（都柏林市议会、科克市议会消防预防科）"],
    how: ["A fire safety certificate is applied for through the national Building Control Management System before work starts on a new building, an extension, a material alteration or a change of use.", "新建、扩建、重大改建或用途变更，须在开工前通过全国建筑管控管理系统（BCMS）申请消防安全证书。"],
    url: IE_FSC,
    feeNote: ["In Dublin, 2.90 euros per square metre, at least 125 euros and at most 12,500 euros.", "都柏林按每平方米 2.90 欧元计，最低 125 欧元，最高 12,500 欧元。"],
    proof: [IE_FSC, "This is required where the applicant proposes a new building, a new building extension, material alterations to an existing building", "This is required where the applicant proposes a new building, a new building extension, material alterations to an existing building"] }),
  N({ id: "ie-dub-planning", where: "IE-DUB", level: "city", segs: PREMISES, method: "online", order: 48, cur: "EUR",
    form: "Planning application (Dublin City Council planning portal)", title: ["Planning permission for a change of use", "用途变更规划许可"],
    agency: ["Dublin City Council, Planning", "都柏林市议会规划处"],
    how: ["A significant change of use, such as turning a shop into a restaurant, needs planning permission, applied for online with public notices and the fee in the council's checklist.", "重大用途变更（如将商店改为餐厅）须申请规划许可，在线提交并刊登公告，按市议会清单缴费。"],
    url: DUB_PLAN,
    proof: [DUB_PLAN, "In general, you need to apply for planning permission for:"] }),
  N({ id: "ie-ork-planning", where: "IE-ORK", level: "city", segs: PREMISES, method: "online", order: 48, cur: "EUR",
    form: "Planning application (Cork City Council)", title: ["Planning permission for a change of use", "用途变更规划许可"],
    agency: ["Cork City Council, Planning", "科克市议会规划处"],
    how: ["Development that isn't exempt, including a material change of use, needs planning permission from Cork City Council.", "非豁免开发（包括实质性用途变更）须向科克市议会申请规划许可。"],
    url: ORK_PLAN,
    proof: [ORK_PLAN, "All development that is not exempted under planning law requires planning permission."] }),
];

/* ------------------------------------------------------------------ Germany (Munich, Hamburg, Frankfurt), Spain (Barcelona), Italy */
const MUC_GEW = "https://stadt.muenchen.de/service/info/gewerbeamt/10164604/";
const MUC_BAU = "https://stadt.muenchen.de/service/info/referat-fur-stadtplanung-und-bauordnung/10331531/";
const MUC_GAST = "https://stadt.muenchen.de/service/info/gaststattenerlaubnis/1063662/n0/";
const HAM_GEW = "https://www.hamburg.de/service/info/11258072/n0/";
const HAM_BAU = "https://www.hamburg.de/service/info/11981617/n0/";
const GEWO_14 = "https://www.gesetze-im-internet.de/gewo/__14.html";
const BCN_OPEN = "https://ajuntament.barcelona.cat/comerc/en/do-you-have-establishment/how-open-business-barcelona-step-step";
const BCN_OBRES = "https://ajuntament.barcelona.cat/urbanisme-accio-climatica-mobilitat-pla-barris-serveis-urbans/en/services/urban-planning/eobres";
const VVF = "https://www.vigilfuoco.it/comando-vvf-potenza/prevenzione-incendi";

const GERMANY_SPAIN_ITALY: OfficialForm[] = [
  N({ id: "de-muc-bau", where: "DE-MUC", level: "city", segs: PREMISES, method: "online", order: 50, cur: "EUR",
    form: "Bauantrag (Baugenehmigung or Nutzungsänderung)", title: ["Building permit, including a change of use", "建筑许可（含用途变更）"],
    agency: ["Landeshauptstadt München, Referat für Stadtplanung und Bauordnung, Lokalbaukommission (LBK)", "慕尼黑市城市规划与建筑管理局（地方建筑委员会 LBK）"],
    how: ["New building, extensions, alterations and changes of use as a rule need a building permit from the city's lower building authority; a new restaurant's licence waits for the LBK's written release.", "新建、扩建、改建及用途变更原则上须取得市下级建筑监管机关的建筑许可；新餐厅的经营许可须待 LBK 书面放行。"],
    url: MUC_BAU,
    proof: [MUC_BAU, "In der Regel benötigen Sie für Baumaßnahmen wie Neubau, Erweiterung oder Umbau sowie für Nutzungsänderungen eine Baugenehmigung durch die Untere Bauaufsichtsbehörde.", "As a rule, building work such as new construction, extension or conversion, and changes of use, need a building permit from the lower building authority."] }),
  N({ id: "de-muc-gaststaette", where: "DE-MUC", level: "city", segs: ["restaurant"], needs: { alcohol: true }, method: "online", order: 71, cur: "EUR",
    form: "Gaststättenerlaubnis", title: ["Restaurant licence to serve alcohol (Gaststättenerlaubnis)", "供应酒类的餐饮经营许可（Gaststättenerlaubnis）"],
    agency: ["Landeshauptstadt München, Kreisverwaltungsreferat (Gewerbeamt)", "慕尼黑市行政管理局（营业管理处）"],
    how: ["A restaurant that serves alcohol needs the city's licence; for a new or altered restaurant the final licence follows the building authority's written release, and a food law course at the IHK is required.", "供应酒类的餐厅须取得市政府许可；新建或改建餐厅须待建筑监管机关书面放行后取得正式许可，并须参加工商会的食品法课程。"],
    url: MUC_GAST, feeNote: ["100 to 6,000 euros, depending on the size and location of the premises.", "100 至 6,000 欧元，视场所面积和所在区域而定。"],
    proof: [MUC_GAST, "Schank- und Speisewirtschaften sowie Beherbergungsbetriebe benötigen eine Gaststättenerlaubnis, wenn alkoholische Getränke ausgeschenkt werden.", "Bars, restaurants and accommodation businesses need a restaurant licence if they serve alcoholic drinks."] }),
  N({ id: "de-ham-bau", where: "DE-HAM", level: "city", segs: PREMISES, method: "online", order: 50, cur: "EUR",
    form: "Bauantrag zur Nutzungsänderung", title: ["Building permit for a change of use", "用途变更建筑许可"],
    agency: ["Freie und Hansestadt Hamburg, Bezirksamt (Bauprüfabteilung) for the address", "汉堡市地址所属区政府（建筑审查处）"],
    how: ["Changing the approved use of a building that needs a permit, for example a shop into a restaurant, needs a building permit for the change of use, applied for with the district's building office.", "变更须经许可之建筑物的核准用途（例如将商店改为餐厅），须向区建筑审查处申请用途变更建筑许可。"],
    url: HAM_BAU,
    proof: [HAM_BAU, "Bevor Sie die genehmigte Nutzungsart einer baugenehmigungsbedürftigen Anlage ändern können, benötigen Sie eine Baugenehmigung zur Nutzungsänderung.", "Before you can change the approved use of a structure that needs a building permit, you need a building permit for the change of use."] }),
  N({ id: "es-bcn-obres", where: "ES-BCN", level: "city", segs: PREMISES, needs: { buildout: true }, method: "online", order: 50, cur: "EUR",
    form: "Consulta prèvia d'obres, then a works licence or notice (comunicat)", title: ["Building works licence or notice (after the mandatory prior consultation)", "装修工程许可或申报（须先经强制预先咨询）"],
    agency: ["Ajuntament de Barcelona, Urbanisme (district licensing department)", "巴塞罗那市政府城市规划处（区许可部门）"],
    how: ["Works start with the mandatory prior consultation, which sets the regime (licence, or immediate or deferred notice) and the documents; the file is then created online with a digital certificate.", "工程须先进行强制预先咨询，确定适用的程序（许可、即时申报或延后申报）及所需文件，然后凭数字证书在线建档。"],
    url: BCN_OBRES,
    proof: [BCN_OBRES, "The Prior Consultation procedure is mandatory and allows you to find out the intervention regime that will be applied to the works"] }),
];

/* ------------------------------------------------------------------ United Arab Emirates (Dubai, Abu Dhabi, Sharjah)
   The emirates' own licensing sites (dubaidet.gov.ae, investindubai.gov.ae, sedd.ae, TAMM's pages, ADAFSA, Sharjah
   Municipality's documents) refused every read from here, so the steps are quoted from the federal government's own
   portal (u.ae), the Ministry of Finance, Dubai Municipality and the federal food safety law the emirates apply. */
const AE_STEPS = "https://u.ae/en/information-and-services/business/Doing-business/doing-business-on-the-mainland/steps-to-start-a-business-on-the-mainland";
const AE_CT = "https://mof.gov.ae/en/public-finance/tax/corporate-tax-in-the-uae/";
const AE_WP = "https://u.ae/en/information-and-services/jobs/Sector-of-employment/employment-in-the-private-sector/work-permits";
const AE_FOODLAW = "https://moccae.gov.ae/assets/download/3d703379/L10-15%20Eng.pdf.aspx";
const DXB_FOOD = "https://www.dm.gov.ae/municipality-business/food-safety-department-2/important-information-to-food-establishment/";
const AE_PREMISES = (where: string, en: string, zh: string, agency: T) => N({ id: `ae-${where.slice(3).toLowerCase()}-premises`, where, level: "city", segs: PREMISES, method: "online", order: 50, cur: "AED",
  form: "Premises location approval with the licence (lease and land use)", title: [`Premises zoning and lease for the licence (${en})`, `营业执照所需的场所用地与租约（${zh}）`], agency,
  how: [`The premises' location must meet ${en}'s economic department requirements and the municipality's land planning rules; the attested lease goes with the licence application.`, `场所位置须符合${zh}经济部门的要求和市政土地规划规定；经认证的租约随执照申请一并提交。`],
  url: AE_STEPS,
  proof: [AE_STEPS, "The business premises and location must comply with the requirements defined by the respective emirate’s Department of Economic Development"] });

const UAE: OfficialForm[] = [
  N({ id: "ae-company", where: "AE", level: "federal", needs: { newEntity: true }, method: "online", order: 8, cur: "AED",
    form: "Trade name, initial approval and memorandum of association (mainland company)", title: ["Company formation on the mainland: trade name, initial approval and memorandum of association", "在大陆设立公司：商号、初步批准与公司章程"],
    agency: ["The emirate's economic department, under the federal Commercial Companies Law", "所在酋长国经济部门（依联邦商业公司法）"],
    how: ["A mainland company reserves its trade name and gets initial approval from the emirate's economic department, then signs an attested memorandum of association before the licence is issued; a free zone company forms with its free zone authority instead.", "大陆公司须先向所在酋长国经济部门预留商号并取得初步批准，再签署经认证的公司章程，然后签发执照；自贸区公司改向自贸区管理局设立。"],
    url: AE_STEPS,
    proof: [AE_STEPS, "drafting a Memorandum of Association and local service agent agreement"] }),
  N({ id: "ae-food-consent", where: "AE", level: "federal", segs: ["restaurant", "retail", "warehouse", "seller"], needs: { food: true }, except: ["AE-DXB"], method: "online", order: 60, cur: "AED",
    form: "Food establishment approval (the emirate's food authority)", title: ["Food establishment approval before trading food", "经营食品前的食品场所审批"],
    agency: ["The emirate's food authority (Abu Dhabi Agriculture and Food Safety Authority; Sharjah Municipality, Public Health)", "所在酋长国食品主管机关（阿布扎比农业与食品安全局；沙迦市政局公共卫生部）"],
    how: ["A business that trades in food needs the competent authority's prior consent before it starts; the emirate's food authority approves the premises and inspects it.", "经营食品的企业须在开业前取得主管机关的事先同意；由所在酋长国食品主管机关审批场所并检查。"],
    url: AE_FOODLAW,
    proof: [AE_FOODLAW, "related to the trading of food or feed, including the initial production facilities, before obtaining the prior official consent of the competent authority"] }),
  AE_PREMISES("AE-DXB", "Dubai", "迪拜", ["Dubai Department of Economy and Tourism; Dubai Land Department (Ejari); Dubai Municipality", "迪拜经济与旅游局；迪拜土地局（Ejari）；迪拜市政局"]),
  AE_PREMISES("AE-AUH", "Abu Dhabi", "阿布扎比", ["Abu Dhabi Department of Economic Development; Department of Municipalities and Transport", "阿布扎比经济发展局；市政与交通局"]),
  AE_PREMISES("AE-SHJ", "Sharjah", "沙迦", ["Sharjah Economic Development Department; Sharjah Municipality", "沙迦经济发展局；沙迦市政局"]),
];

/* ------------------------------------------------------------------ Türkiye (Istanbul) */
const TR_MERSIS = "https://ticaret.gov.tr/ic-ticaret/ticaret-sicili/merkezi-sicil-kayit-sistemi-mersis";
const TR_GIB = "https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv%2Fonceki-dokumanlar%2Fuser_upload%2Fyayinlar%2Fkurumlar_vergisi.pdf";
const TR_SGK = "https://www.sgk.gov.tr/Content/Post/3affeaef-df73-4c5b-926f-86376b4e07bf/Isyeri-Isveren-ve-Isyerinin-Bildirimi-2022-05-15-06-04-21";
const IST_GIDA = "https://istanbul.tarimorman.gov.tr/Belgeler/DepoPerakende%20ve%20Toplu%20T%C3%BCketim%20Yerleri%20Kay%C4%B1t%20%C4%B0%C5%9Flemleri%20(04.01.2023).pdf";
const IST_RUHSAT = "https://beyoglu.bel.tr/hizmetlerimiz/basvuru-kaynaklari/isyeri-acma-ve-calisma-ruhsatlari/";
const IST_SIHHI = "https://beyoglu.bel.tr/hizmetlerimiz/basvuru-kaynaklari/isyeri-acma-ve-calisma-ruhsatlari/sihhi-muesseseler-ve-aranacak-sartlar/";

const TURKIYE: OfficialForm[] = [
  N({ id: "tr-sgk", where: "TR", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "TRY", fee: 0,
    form: "İşyeri bildirgesi and sigortalı işe giriş bildirgesi (e-SGK)", title: ["Employer workplace registration with social security (SGK)", "向社会保障局（SGK）登记雇主工作场所"],
    agency: ["Sosyal Güvenlik Kurumu (SGK)", "土耳其社会保障局（SGK）"],
    how: ["An employer files the workplace registration with SGK electronically by the day it first employs an insured worker, and registers each employee's start.", "雇主须最迟在首次雇用参保员工当日以电子方式向 SGK 提交工作场所登记，并为每名员工办理入职登记。"],
    url: TR_SGK, takes: ["By the day the first employee starts.", "最迟于首名员工入职当日。"],
    proof: [TR_SGK, "işverenler, örneği Kurumca hazırlanacak işyeri bildirgesini en geç sigortalı çalıştırmaya başladığı tarihte, Kuruma vermekle yükümlü tutulmuşlardır.", "employers must file the workplace registration form, as prepared by the Institution, at the latest on the day they start employing insured workers."] }),
  N({ id: "tr-ist-gida", where: "TR-IST", level: "city", segs: ["restaurant", "retail", "warehouse"], needs: { food: true }, method: "pdf_mail", order: 74, cur: "TRY",
    form: "İşletme Kayıt Belgesi başvuru ve beyannamesi", title: ["Food business registration certificate (İşletme Kayıt Belgesi)", "食品经营登记证（İşletme Kayıt Belgesi）"],
    agency: ["Istanbul Provincial Directorate of Agriculture and Forestry (the district directorate for the address)", "伊斯坦布尔省农林局（地址所属区分局）"],
    how: ["Shops, restaurants and stores that handle food apply to the district directorate with the registration application and declaration, and get the business registration certificate.", "经营食品的商店、餐厅和仓储须向区分局提交登记申请和声明，取得经营登记证。"],
    url: IST_GIDA,
    proof: [IST_GIDA, "gıda işletmelerinin kayıt belgesi alma zorunluluğu bulunmaktadır.", "food businesses are obliged to obtain a registration certificate."] }),
  N({ id: "tr-ist-imar-itfaiye", where: "TR-IST", level: "city", segs: PREMISES, method: "in_person", order: 52, cur: "TRY",
    form: "İmar ve itfaiye uygunluk görüşü (with the opening licence)", title: ["Zoning and fire compliance opinions for the premises", "场所规划与消防合规意见"],
    agency: ["The district municipality's zoning department and the Istanbul Metropolitan Fire Department", "区政府规划部门与伊斯坦布尔大都市消防局"],
    how: ["With the opening licence application, the district's licensing department asks the metropolitan fire department (fire and explosion) and the municipality's zoning department (land use) for compliance opinions before the on-site inspection.", "提交营业许可申请后，区许可部门会在现场检查前征求大都市消防局（火灾与爆炸）和市政规划部门（用地）的合规意见。"],
    url: IST_SIHHI,
    proof: [IST_SIHHI, "İstanbul Büyük Şehir İtfaiye Müdürlüğüne (Yangın, patlama v.b yönünden), Belediye İmar ve Şehircilik Müdürlüğüne (imar yönünden)", "to the Istanbul Metropolitan Fire Department (for fire, explosion and the like), to the municipality's zoning department (for zoning)"] }),
];

/* ------------------------------------------------------------------ Mexico (Guadalajara, Cancún, and the IMSS) */
const MX_IMSS = "https://ventanillamipymes.economia.gob.mx/inscripcion-al-imss-persona-moral/";
const GDL_USO = "https://apitramites.guadalajara.gob.mx/pdf/375";
const GDL_LIC = "https://apitramites.guadalajara.gob.mx/pdf/380";
const CUN_LIC = "https://cancun.gob.mx/cancun/noticias/leer/3383";

const MEXICO_MORE: OfficialForm[] = [
  N({ id: "mx-gdl-uso-suelo", where: "MX-GDL", level: "city", segs: PREMISES, method: "online", order: 50, cur: "MXN", fee: 2045,
    form: "Dictamen de Trazo, Usos y Destinos Específicos", title: ["Land use and zoning certificate (Dictamen de Trazo, Usos y Destinos)", "土地用途与分区证明（Dictamen de Trazo, Usos y Destinos）"],
    agency: ["Gobierno de Guadalajara, Dirección de Ordenamiento del Territorio", "瓜达拉哈拉市政府国土规划局"],
    how: ["The certificate states the land uses allowed at the address and the building rules that apply; a business licence needs a favourable or conditioned land use for the activity.", "该证明载明该地址允许的土地用途和适用的建筑规则；经营许可要求该经营活动的土地用途为允许或有条件允许。"],
    url: GDL_USO, takes: ["10 business days.", "10 个工作日。"],
    proof: [GDL_USO, "El Dictamen de Trazo, Usos y Destinos Específicos te permite certificar los usos de suelo permitidos en el predio", "The Dictamen de Trazo, Usos y Destinos Específicos certifies the land uses allowed on the property"] }),
  N({ id: "mx-cun-uso-suelo", where: "MX-CUN", level: "city", segs: PREMISES, method: "online", order: 50, cur: "MXN",
    form: "Permiso de utilización de uso de suelo; dictamen de Protección Civil", title: ["Land use permit and civil protection opinion (uso de suelo)", "土地用途许可与民防意见（uso de suelo）"],
    agency: ["Municipio de Benito Juárez (Cancún), Desarrollo Urbano and Protección Civil", "贝尼托华雷斯市政府（坎昆）城市发展与民防部门"],
    how: ["The operating licence requires a current land use permit for the premises and a current civil protection opinion, both from the municipality.", "经营许可要求具备场所的有效土地用途许可和有效民防意见，均由市政府出具。"],
    url: "https://imdai.cancun.gob.mx/ventanilla",
    proof: [CUN_LIC, "permiso de utilización de uso de suelo y dictamen de Protección Civil vigente.", "a land use permit and a current civil protection opinion."] }),
];

/* ------------------------------------------------------------------ United States: the five guide cities short of covered */
const AZ_WH = "https://azdor.gov/business/withholding-tax/employer-withholding-filing-obligations";
const IL_DCEO = "https://dceo.illinois.gov/content/dam/soi/en/web/dceo/smallbizassistance/beginhere/documents/starting-your-business-handbook-2026.pdf";
const TPA_BTR = "https://www.tampa.gov/service/new-business-tax-receipt-application";
const SACC_PR = "https://emd.saccounty.gov/us/en/environmental-health/eh-plan-review.html";
const CMH_FOOD = "https://www.columbus.gov/Services/Food-Protection-Program";
const ORC_LLC = "https://codes.ohio.gov/ohio-revised-code/section-1706.16";
const ORC_UI = "https://codes.ohio.gov/ohio-revised-code/section-4141.20";
const FCA_VENDOR = "https://auditor.franklincountyohio.gov/Consumer/Licensing-Types";
const DAL_FIRE_FEES = "https://dallascityhall.com/departments/fire-rescue/FPEI%20Docs/Schedule%20of%20Permit%20Fees%202024.pdf";
const DAL_DSD_FEES = "https://dallascityhall.com/departments/sustainabledevelopment/DCH%20documents/DSD%20Fees.pdf";
const CA_FEES = "https://bpd.cdn.sos.ca.gov/pdf/be-fee-schedule-062018.pdf";

const US_FINISH: OfficialForm[] = [
  N({ id: "az-jt1", where: "AZ", level: "state", needs: { employees: true }, method: "online", order: 60, cur: "USD", fee: 0,
    form: "Arizona Joint Tax Application (Form JT-1), on AZTaxes.gov", title: ["Employer registration for withholding and unemployment insurance (JT-1)", "雇主预扣税与失业保险登记（JT-1）"],
    agency: ["Arizona Department of Revenue, with the Arizona Department of Economic Security", "亚利桑那州税务局与经济保障局"],
    how: ["An employer that withholds Arizona income tax registers its EIN with ADOR on the Joint Tax Application in AZTaxes.gov; the same form starts the unemployment insurance registration with DES.", "预扣亚利桑那州所得税的雇主须在 AZTaxes.gov 以联合税务申请表向州税务局登记其 EIN；同一表格也启动在经济保障局的失业保险登记。"],
    url: "https://www.aztaxes.gov", feeNote: ["No fee for the employer registration.", "雇主登记不收费。"],
    proof: [AZ_WH, "Completing and submitting Arizona Form JT-1 also begins the process of registering the employer for unemployment compensation insurance"] }),
];

export const FINISH_FORMS: OfficialForm[] = [...AUSTRIA, ...SWITZERLAND, ...SWEDEN, ...DENMARK, ...FINLAND, ...POLAND, ...BELGIUM, ...PORTUGAL, ...IRELAND, ...GERMANY_SPAIN_ITALY, ...UAE, ...TURKIYE, ...MEXICO_MORE, ...US_FINISH];

export const FINISH_FIXES: Fix[] = [
  P("at-fb", AT_FB, "In der Regel erlangt die Gesellschaft mit der Eintragung in das Firmenbuch Rechtspersönlichkeit.", "As a rule the company becomes a legal person on its entry in the company register.",
    "Proof added from the Unternehmensserviceportal (usp.gv.at), the federal government's business portal."),
  { ...P("ch-hr", CH_HR, "Der Eintrag im Handelsregister erfolgt erst nach dem Gründungsakt bei der Notarin oder beim Notar.", "The entry in the commercial register follows only after the founding act before a notary.",
    "Proof added from the federal SME portal (kmu.admin.ch); Zurich's and Bern's own register offices are their own entries (ch-zh-hr, ch-be-hr)."), except: ["CH-ZH", "CH-BE"] },
  { ...P("se-verksamt", SE_BV, "Anmäl företaget för registrering till Bolagsverket.", "Register the company with the Swedish Companies Registration Office.",
    "Proof added from Bolagsverket's own page; the fee is from its fee table (bolagsverket.se/sjalvservice/avgifter/avgifterforaktiebolag.4358.html)."),
    fee: 2400, feeNote: { en: "2,400 kronor through the e-service, 2,700 on paper.", zh: "电子服务 2,400 瑞典克朗，纸质 2,700 瑞典克朗。" } },
  { ...P("dk-virk", DK_ERST, "Når du vil drive en virksomhed som et anpartsselskab eller aktieselskab, skal dette stiftes i overensstemmelse med lovgivningen og registreres på Virk.", "To run a business as a private or public limited company, it must be founded under the law and registered on Virk.",
    "Proof added from the Danish Business Authority's guide; the fee is from its fee table (erhvervsstyrelsen.dk/gebyrer-og-takster)."),
    fee: 670, feeNote: { en: "670 kroner to register an ApS or A/S.", zh: "注册 ApS 或 A/S 670 丹麦克朗。" } },
  { ...P("fi-ytj", FI_PRH, "Osakeyhtiö syntyy, kun se rekisteröidään kaupparekisteriin.", "A limited company comes into being when it is entered in the Trade Register.",
    "Proof added from the Finnish Patent and Registration Office (prh.fi); the fees are from its price list (prh.fi, kaupparekisterin käsittelymaksut, perustaminen). Retitled to the company registration it is."),
    title: { en: "Company registration with the Trade Register (YTJ start-up notification)", zh: "向贸易登记处注册公司（YTJ 开业通知）" },
    feeNote: { en: "300 euros for the guided founding on ytj.fi, 400 euros for a founding notification with the company's own documents.", zh: "在 ytj.fi 引导式设立 300 欧元，附自备文件的设立通知 400 欧元。" } },
  { ...P("pl-biznes", PL_KRS, "Musisz uzyskać wpis do rejestru przedsiębiorców w Krajowym Rejestrze Sądowym (KRS).", "You must obtain an entry in the register of businesses of the National Court Register (KRS).",
    "Proof added from biznes.gov.pl; the entry was retitled to the filing it is (the KRS entry, made only online) and its agency to the registry court."),
    url: PL_KRS, title: { en: "Company registration in the National Court Register (KRS)", zh: "在国家法院登记处（KRS）注册公司" },
    agency: { en: "Sąd rejonowy (the registry court), through the court registers portal (PRS) or S24", zh: "地区法院（登记法院），经法院登记门户（PRS）或 S24" } },
  { ...P("pt-empresa", PT_EH, "No balcão Empresa na Hora pode fazer todo o processo de constituição de uma sociedade comercial", "At an Empresa na Hora desk you can do the whole process of forming a company",
    "Proof restored from the Ministry of Justice's registry site (registo.justica.gov.pt), which states the 360-euro fee."),
    url: PT_EH, fee: 360, feeNote: { en: "360 euros for a normal request.", zh: "普通申请 360 欧元。" } },
  P("pt-financas", PT_GUIA, "A apresentação à Autoridade Tributária e Aduaneira (AT) da declaração início da atividade é obrigatória", "Filing the start-of-activity declaration with the Tax and Customs Authority (AT) is mandatory",
    "Proof added from the economic activities directorate's official restaurant guide (dgae.gov.pt, 2025)."),
  P("ie-cro", IE_CRO, "Please submit a Form A1 and constitution on CORE.", undefined,
    "Proof added from the Companies Registration Office (cro.ie, read through WebFetch: the site refuses curl)."),
  { ...P("ie-revenue", "https://www.revenue.ie/en/starting-a-business/registering-for-tax/index.aspx", "You must register for tax with Revenue when you:", undefined,
    "Retitled: the employer registration is its own entry now (ie-paye); this one is the company's corporation tax and VAT registration."),
    title: { en: "Tax registration with Revenue (corporation tax and VAT)", zh: "向爱尔兰税务局登记税务（公司税和增值税）" } },
  { ...P("de-gewerbe-muc", MUC_GEW, "Reichen Sie Ihre Gewerbeanmeldung rechtzeitig vor oder spätestens mit Aufnahme der Tätigkeit ein.", "File your trade registration in good time before, or at the latest when, you start the activity.",
    "Proof added from the City of Munich's own service page, which states the fee."),
    url: MUC_GEW, feeNote: { en: "50 to 60 euros, depending on the legal form.", zh: "50 至 60 欧元，视法律形式而定。" } },
  { ...P("de-gewerbe-ham", HAM_GEW, "Wenn Sie ein stehendes Gewerbe anfangen, müssen Sie dieses gleichzeitig anmelden.", "When you start a fixed-site trade, you must register it at the same time.",
    "Proof added from the City of Hamburg's own service page."), url: HAM_GEW },
  P("de-gewerbe-fra", GEWO_14, "Wer den selbständigen Betrieb eines stehenden Gewerbes, einer Zweigniederlassung oder einer unselbständigen Zweigstelle anfängt, muss dies der zuständigen Behörde gleichzeitig anzeigen.", "Whoever starts an independent fixed-site trade, a branch or a dependent outlet must notify the competent authority at the same time.",
    "Proof added from the federal Trade Regulation Act, section 14 (gesetze-im-internet.de, the federal law site): frankfurt.de and Hessen's service portal refuse automated reads (403, robots), so the requirement is quoted from the law the Ordnungsamt applies."),
  { ...P("es-bcn-licencia", BCN_OPEN, "It is compulsory to request it before starting any business activity.", undefined,
    "Proof added from the Ajuntament de Barcelona's own guide to opening a business (the municipal licence)."), url: BCN_OPEN },
  { ...P("it-registro", "https://www.impresainungiorno.gov.it/web/l-impresa-e-l-europa/setting-up-a-business", "Tutte le imprese di qualsiasi natura giuridica si debbono iscrivere al Registro delle imprese.", "Every business, whatever its legal form, must enter the business register.",
    "Retitled to the company registration it is (the proof was already there): the business register entry through ComUnica forms the company's legal record."),
    title: { en: "Company registration in the business register (ComUnica)", zh: "在企业登记处注册公司（ComUnica）" } },
  P("it-vvf", VVF, "considerate a maggior rischio d'incendio, che sono sottoposte a controllo dei Vigili del Fuoco.", "considered at higher fire risk, which are subject to the fire brigade's control.",
    "Proof added from the fire brigade's own page (vigilfuoco.it): the 80 activities listed in annex I of DPR 151/2011 are subject to its control."),
  /* China: the national steps quoted from the State Council's and the ministries' own publications of the law, and each
     city's one-stop opening from that city's own government site. Hangzhou, Chengdu, Chongqing, Tianjin and Xi'an
     refused every read from here (no connection, or a 412 bot wall), so their portals stay unverified. */
  P("cn-business-license", "https://www.gov.cn/zhengce/content/2021-08/24/content_5632964.htm", "未经登记，不得以市场主体名义从事经营活动。", "Without registration, no one may do business in the name of a market entity.",
    "Proof added from the Regulations on the Registration of Market Entities as the State Council publishes them (gov.cn)."),
  P("cn-tax", "https://fgk.chinatax.gov.cn/zcfgk/c100009/c5195081/content.html", "自领取营业执照之日起三十日内，持有关证件，向税务机关申报办理税务登记。", "Within thirty days of receiving the business licence, register for tax with the tax authority, with the relevant documents.",
    "Proof added from the Tax Collection Administration Law, article 15, in the State Taxation Administration's law database (chinatax.gov.cn)."),
  P("cn-social", "https://shanghai.chinatax.gov.cn/zcfw/zcfgk/sbf/202202/t462174.html", "用人单位应当自用工之日起三十日内为其职工向社会保险经办机构申请办理社会保险登记。", "An employer must register its employees for social insurance within thirty days of hiring them.",
    "Proof added from the Social Insurance Law, article 58, as published by the State Taxation Administration's Shanghai bureau (which collects social insurance contributions)."),
  P("cn-food-license", "https://www.gov.cn/gongbao/2023/issue_10606/202307/content_6894763.html", "从事食品销售和餐饮服务活动，应当依法取得食品经营许可。", "Selling food or providing catering services requires a food business licence.",
    "Proof added from SAMR Order 78 (Measures for Food Business Licensing and Filing, in force since 1 December 2023) in the State Council Gazette (gov.cn)."),
  P("cn-fire", "https://js.119.gov.cn/202111/608cd5a920fb4644b27aa41edc5ab073_c_86038aff349a45b5824e.html", "公众聚集场所投入使用、营业前消防安全检查实行告知承诺管理。", "The fire safety check before a public venue opens is done by notification and commitment.",
    "Proof added from the Fire Protection Law, article 15, as the Jiangsu Fire and Rescue Corps (119.gov.cn) publishes it."),
  P("cn-open-bj", "https://scjgj.beijing.gov.cn/ztzl/qykb/zcwjkb/202104/t20210413_2353382.html", "近年来，北京市已实现开办企业一网通办", "Beijing has made business opening a single online service",
    "Proof added from the Beijing Administration for Market Regulation's own page."),
  P("cn-open-sh", "https://www.shanghai.gov.cn/lctjkbqy/index.html", "开办企业一网通办 最快2天可营业", "Business opening as one online service; open for business in as little as 2 days",
    "Proof added from the Shanghai Municipal People's Government's own page."),
  P("cn-open-sz", "https://amr.sz.gov.cn/xxgk/qt/ztlm/qykb/", "整合企业设立登记、公章刻制、申领发票、员工参保登记、住房公积金企业缴存登记等环节。", "It combines company registration, seal making, invoices, employee social insurance and the housing fund registration.",
    "Proof added from the Shenzhen Administration for Market Regulation's one-window page."),
  P("cn-open-gz", "https://scjgj.gz.gov.cn/zmhd/cjwt/ssdj/content/post_8663614.html", "各部门在平台同步联办，最快0.5天就可以办结", "The departments handle it together on the platform; it can be done in as little as half a day",
    "Proof added from the Guangzhou Administration for Market Regulation's own answer on the one-network platform."),
  P("cn-open-wh", "https://fgw.wuhan.gov.cn/xwzx/fgyw/202102/t20210223_1638311.html", "我市全面推行企业开办“一事联办”“全城通办”", "The city has made business opening a single joint service available city-wide",
    "Proof added from the Wuhan Development and Reform Commission's own page."),
  P("cn-open-nj", "https://njsj.nanjing.gov.cn/xwdt/202308/t20230823_3993598.html", "已将企业开办涉及的市场主体登记、公章刻制、银行开户、税务登记、就业参保登记、医保参保登记、公积金登记等七个事项合并办理", "Business opening's seven steps (registration, seal, bank account, tax, employment and social insurance, medical insurance, housing fund) are handled together",
    "Proof added from the Nanjing Municipal Data Bureau's own page."),
  P("cn-open-su", "https://www.suzhou.gov.cn/szsrmzf/szyw/202603/4e27892a644d4fa19f6c544811639a30.shtml", "创业者通过“全链通”平台即可完成登录、信息填报、电子签名、提交审核全流程操作", "Founders complete the whole process (login, forms, e-signature, submission) on the Quanliantong platform",
    "Proof added from the Suzhou Municipal People's Government's own page."),
  /* UAE: the licences, the tax and the employer steps quoted from the federal portal and ministries */
  P("ae-tax", AE_CT, "All Taxable Persons (including Free Zone Persons) will be required to register for Corporate Tax and obtain a Corporate Tax Registration Number.", undefined,
    "Proof added from the Ministry of Finance's corporate tax page (mof.gov.ae)."),
  P("ae-mohre", AE_WP, "employers may not recruit or employ any worker unless a work permit is issued in accordance with MoHRE procedures.", undefined,
    "Proof added from the UAE government portal (u.ae): mohre.gov.ae refused every read."),
  P("ae-dxb-food", DXB_FOOD, "Request for Layout Assessment for Food Establishment Licensing", undefined,
    "Proof added from Dubai Municipality's Food Safety Department services page (its PDF guides now redirect to the home page)."),
  ...(["ae-dxb-licence", "ae-auh-licence", "ae-shj-licence"].map(id => P(id, AE_STEPS, "investor can collect the business licence from service centres of the economic departments or through their websites.", undefined,
    "Proof added from the UAE government portal (u.ae): each emirate's economic department issues the licence; the emirates' own licensing sites refused every read."))),
  /* Türkiye */
  { ...P("tr-mersis", TR_MERSIS, "Bu sayede, ticaret sicili müdürlükleri şirket kuruluşlarında tek temas noktası haline getirilmiştir.", "This makes the trade registry offices the single point of contact for forming a company.",
    "Proof added from the Ministry of Trade's own MERSİS page (ticaret.gov.tr); mersis.gtb.gov.tr refused reads."),
    title: { en: "Company registration (MERSİS and the trade registry)", zh: "公司注册（MERSİS 与商业登记处）" } },
  P("tr-gib", TR_GIB, "İşe başlama bildirimi, şirketlerin kuruluş aşamasında işe başlama tarihinden itibaren 10 gün içinde ticaret sicili memurluğunca ilgili vergi dairesine yapılır.", "For a company, the trade registry notifies the tax office of the start of business within 10 days, at formation.",
    "Proof added from the Revenue Administration's corporate tax guide (gib.gov.tr)."),
  { ...P("tr-ist-ruhsat", IST_RUHSAT, "İşyeri Açma ve Çalışma Ruhsatı Müracaatları Gerekli evraklar hazırlandıktan sonra Belediyemiz Ruhsat ve Denetim Müdürlüğüne Şahsen veya şirkette imzaya yetkili kişilerce yapılır.", "Applications for the business opening and operating licence are made to the municipality's licensing department, in person or by the company's signatories.",
    "Proof added from Beyoğlu Municipality's own page (one of Istanbul's district municipalities, each of which issues the licence for its district)."), url: IST_RUHSAT },
  /* Mexico */
  P("mx-imss", MX_IMSS, "Este trámite te permite registrarte ante el Instituto Mexicano del Seguro Social (IMSS) para cumplir con tus obligaciones patronales.", "This procedure registers you with the Mexican Social Security Institute (IMSS) to meet your obligations as an employer.",
    "Proof added from the Ministry of Economy's SME window (economia.gob.mx): imss.gob.mx builds its pages in script and its PDFs answer empty."),
  { ...P("mx-gdl-licencia", GDL_LIC, "Te permite obtener tu licencia de funcionamiento para giros de riesgo medio", "It gets you the operating licence for medium-risk businesses",
    "Proof added from the City of Guadalajara's own procedure sheet (Licencia de Giro Comercial Tipo B; type A covers small low-risk shops)."),
    url: GDL_LIC, feeNote: { en: "618 pesos to print the licence plus 57 pesos for the form; decided within 30 business days.", zh: "执照打印费 618 比索，另加表格费 57 比索；30 个工作日内决定。" } },
  { ...P("mx-cun-licencia", CUN_LIC, "La dependencia invita a la ciudadanía en general a que obtenga su licencia de funcionamiento en línea,", "The department invites everyone to get their operating licence online,",
    "Proof added from the Municipality of Benito Juárez's own notice (cancun.gob.mx), which lists the licence's requirements."), url: "https://cancun.gob.mx" },
  /* United States: the guide cities short of covered, and the five fees the audit couldn't confirm */
  { ...P("il-sos", IL_DCEO, "The following entities must file formation documents with the SOS:", undefined,
    "Proof added from the Illinois Department of Commerce's 2026 starting-a-business handbook (illinois.gov): ilsos.gov refused every connection. The $150 fee stays unconfirmed: no current official page that states it could be read, so it is no longer claimed."),
    fee: null, feeNote: { en: "Fee not confirmed: the Secretary of State's fee page couldn't be read.", zh: "费用未经确认：无法读取州务卿的收费页面。" } },
  P("tpa-business-tax", TPA_BTR, "the first step in applying for a business tax receipt for a new business operating in the City of Tampa.", undefined,
    "Proof added from the City of Tampa's own application page."),
  P("sacc-plan-review", SACC_PR, "that is built or remodeled in Sacramento County must submit plans and have them approved by the EMD Plan Review staff.", undefined,
    "Proof added from Sacramento County EMD's plan review page."),
  P("cmh-food-license", CMH_FOOD, "Before opening, you’ll need to complete an application for a license and pass a final inspection.", undefined,
    "Proof added from Columbus Public Health's Food Protection Program page."),
  P("oh-sos-llc", ORC_LLC, "A limited liability company is formed when the articles of organization are filed by the secretary of state", undefined,
    "Proof added from the Ohio Revised Code, section 1706.16 (codes.ohio.gov): ohiosos.gov refuses automated reads (403)."),
  P("oh-ui", ORC_UI, "Every contributory employer shall file a quarterly contribution and wage report.", undefined,
    "Proof added from the Ohio Revised Code, section 4141.20 (codes.ohio.gov): jfs.ohio.gov answered 404 for its employer pages."),
  { ...P("oh-vendor", FCA_VENDOR, "Upon completion, this application can be submitted along with the $50 filing fee to Franklin County Auditor,", undefined,
    "Fee confirmed: the Franklin County Auditor's licensing page states the $50 filing fee."), fee: 50 },
  { ...P("dal-fire-hood", DAL_FIRE_FEES, "Commercial Cooking Fire-Extinguishing System $250", undefined,
    "Fee confirmed: Dallas Fire-Rescue's Schedule of Permit Fees (2024) lists the permit at $250."), fee: 250 },
  { id: "dal-sign", fee: 281, feeNote: { en: "$281 for a premise sign in the city's permit fee schedule (effective May 1, 2024), which also lists a $281 sign plan review fee.", zh: "市政府收费表（2024 年 5 月 1 日起生效）列明场所招牌许可费 281 美元，另有招牌图纸审查费 281 美元。" },
    why: `Fee corrected: the $296 the registry stated isn't on any city page; the city's permit fee schedule (${DAL_DSD_FEES}) lists "Signs - Premise $281".` },
  { ...P("ca-llc-5", CA_FEES, "Application to Register a Foreign Limited Liability Company (Form LLC-5)", undefined,
    "Fee confirmed: the Secretary of State's Business Entities Fee Schedule lists Form LLC-5 at $70.00."), fee: 70 },
  P("ch-ahv", CH_AHV, "Als Arbeitgeber melden Sie sich bei der Ausgleichskasse an.", "As an employer you register with the compensation fund.",
    "Proof added from the Federal Social Insurance Office's FAQ (bsv.admin.ch)."),
];
