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

export const FINISH_FORMS: OfficialForm[] = [...AUSTRIA, ...SWITZERLAND, ...SWEDEN, ...DENMARK];

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
  P("ch-ahv", CH_AHV, "Als Arbeitgeber melden Sie sich bei der Ausgleichskasse an.", "As an employer you register with the compensation fund.",
    "Proof added from the Federal Social Insurance Office's FAQ (bsv.admin.ch)."),
];
