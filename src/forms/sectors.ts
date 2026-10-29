// The sectors on the landing page that the library didn't cover yet: beauty and personal care (salon establishment
// licenses), automotive (auto repair dealer registration), healthcare and life sciences (FDA's device establishment
// registration, for an importer of medical devices), manufacturing (industrial stormwater permits, an air district's
// equipment permits and California's hazardous materials business plan)).
// Read 2026-10-23 from the agencies' own pages with curl
// (scripts/eval/proof-read.py), each quote under 25 words, copied from the page as fetched. A fee is stated only where
// the agency's page publishes it; otherwise it is null ("Varies") and the agency confirms it.
//
//   salon         a nail, hair or beauty salon: the state board's establishment (salon, shop or facility) license
//   autoRepair    a shop that repairs other people's vehicles for pay: the state's repair dealer or shop registration
//   devices       an importer or distributor of medical devices: FDA establishment registration (initial importer)
//   manufactures  a facility that makes products: stormwater, air and hazardous materials filings where they apply
//   office        an office (a tech company, a game studio): not a retail store, so a chain store affidavit isn't asked
//
// Left out, with the reason (docs/COVERAGE.md lists them too): EV charging sites (no official page read states a filing
// the site itself makes beyond the electrical permit; California's Division of Measurement Standards describes type
// evaluation and county sealer testing, not the operator's own registration), pharmacies and clinics (state board and
// facility licensing not read in this pass), the Bay Area air district's permits (its permit pages didn't open), and
// salon licenses in the states whose board pages weren't read (Illinois, Florida, Nevada, Arizona, New Jersey, Colorado,
// Minnesota, Ohio, Maryland and the District of Columbia): no guide is built for a salon there rather than one that
// leaves out its main license.
import { B } from "../bi";
import type { Needs, OfficialForm, Segment } from "./registry";
import { FURNITURE } from "./furniture";

const READ = "2026-10-23";
const P = (read: string, quote: string) => ({ quote, read, checked: READ });
const STORES: Segment[] = ["retail"];

const CA_BBC = "https://www.barbercosmo.ca.gov/forms_pubs/forms/estab_app.pdf";
const NY_AEB = "https://dos.ny.gov/appearance-enhancement-business";
export const NY_AEB_APPLY = "https://dos.ny.gov/become-appearance-enhancement-business";
const TX_TDLR = "https://www.tdlr.texas.gov/barbering-and-cosmetology/establishments/apply.htm";
const WA_DOL = "https://dol.wa.gov/node/1395";
/** Where the fee is published, when it isn't on the page the proof is read from. */
export const WA_FEES = "https://dol.wa.gov/professional-licenses/cosmetology/fees-cosmetologists";
const MA_SALON = "https://www.mass.gov/how-to/apply-for-a-cosmetology-salon-license";
const GA_RULE = "https://rules.sos.ga.gov/gac/240-12";
const VA_APP = "https://www.dpor.virginia.gov/sites/default/files/boards/BarberCosmo/A450-1213BUS.pdf";
const OR_HLO = "https://www.oregon.gov/oha/PH/HLO/Pages/Board-Cosmetology-Business-Authorizations.aspx";
const PA_BOARD = "https://www.pa.gov/agencies/dos/department-and-offices/bpoa/boards-commissions/cosmetology.html";
const CA_BAR = "https://www.bar.ca.gov/apply";
const NY_REPAIR = "https://dmv.ny.gov/business/open-repair-or-body-shop";
const FL_REPAIR = "https://www.fdacs.gov/Business-Services/Motor-Vehicle-Repair";
export const FDA_DEVICE = "https://www.fda.gov/medical-devices/how-study-and-market-your-device/device-registration-and-listing";
export const FDA_DEVICE_WHO = "https://www.fda.gov/medical-devices/device-registration-and-listing/who-must-register-list-and-pay-fee";
const FDA_DEVICE_WHEN = "https://www.fda.gov/medical-devices/device-registration-and-listing/when-register-and-list";
export const FDA_MDUFA = "https://www.fda.gov/industry/fda-user-fee-programs/medical-device-user-fee-amendments-mdufa";
const CA_IGP = "https://www.waterboards.ca.gov/water_issues/programs/stormwater/industrial.html";
const TX_MSGP = "https://www.tceq.texas.gov/permitting/stormwater/industrial";
const SCAQMD = "https://www.aqmd.gov/home/permits";
const CA_HMBP = "https://calepa.ca.gov/hazardous-materials-business-plan-program/";

const BOARD_HOW = B("Filed with the state board before the salon opens, with the owners' details and the licensed operator in charge; the board may inspect the premises first.",
  "开业前向州委员会申请，填写业主信息及负责的持证从业人员；委员会可能先检查场所。");
const SALON_PLAIN = B("The state's license for the salon itself, separate from each stylist's or technician's own license.", "州政府为沙龙本身颁发的执照，与每位美发师或美甲师的个人执照分开。");

/** One state's salon establishment license. */
const salon = (o: { id: string; where: string; form: string; title: [string, string]; agency: [string, string]; url: string; info?: string; fee: number | null; feeNote?: [string, string]; renews?: [string, string]; how?: [string, string]; read: string; quote: string }): OfficialForm => ({
  id: o.id, form: o.form, title: B(...o.title), agency: B(...o.agency), level: "state", where: o.where, segments: STORES, needs: { salon: true }, method: "online", order: 74,
  how: o.how ? B(...o.how) : BOARD_HOW, url: o.url, info: o.info ?? o.url, fee: o.fee, ...(o.feeNote ? { feeNote: B(...o.feeNote) } : {}), ...(o.renews ? { renews: B(...o.renews) } : {}),
  checked: "page", fields: [], plain: SALON_PLAIN, proof: P(o.read, o.quote),
});

export const SECTOR_FORMS: OfficialForm[] = [
  /* ------------------------------------------------ beauty and personal care: the salon itself ------------------------------------------------ */
  salon({ id: "ca-bbc-establishment", where: "CA", form: "Application for Establishment License (Form F-BBC-05)", title: ["Barbering and cosmetology establishment license", "美容美发场所执照"],
    agency: ["California Board of Barbering and Cosmetology", "加州美容美发委员会"], url: CA_BBC, fee: 50,
    feeNote: ["$50 application fee, not refundable; the board's schedule lists a $40 renewal fee.", "申请费 50 美元，不予退还；委员会收费表列明续期费 40 美元。"], renews: ["Renewal fee $40.", "续期费 40 美元。"],
    how: ["Mailed to the Board of Barbering and Cosmetology with the $50 fee before the salon opens. A nail, hair or skin care salon holds one, besides each worker's own license.", "开业前连同 50 美元费用邮寄至加州美容美发委员会。美甲、美发或护肤沙龙均须持有，另需每位从业人员的个人执照。"],
    read: CA_BBC, quote: "The non-refundable application fee of $50 must accompany this application." }),
  salon({ id: "ny-dos-aeb", where: "NY", form: "Appearance Enhancement Business License", title: ["Appearance enhancement business license", "美容美甲经营执照"],
    agency: ["New York Department of State, Division of Licensing Services", "纽约州务院执照服务处"], url: NY_AEB_APPLY, info: NY_AEB, fee: 60,
    feeNote: ["$60 initial application and $60 renewal, on the Department of State's page.", "纽约州务院页面列明首次申请 60 美元，续期 60 美元。"], renews: ["Renewal fee $60.", "续期费 60 美元。"],
    how: ["Applied for with the Department of State before opening, with proof of the required bond or liability insurance; a nail salon also keeps a wage bond sized to its nail staff.", "开业前向纽约州务院申请，附所需保证金或责任保险证明；美甲店还须按美甲员工人数备有工资保证金。"],
    read: NY_AEB, quote: "An Appearance Enhancement Business License allows an individual to operate an Appearance Enhancement establishment" }),
  salon({ id: "tx-tdlr-establishment", where: "TX", form: "Barbering or Cosmetology Establishment License", title: ["Cosmetology establishment license", "美容美发场所执照"],
    agency: ["Texas Department of Licensing and Regulation", "德州执照与管理局（TDLR）"], url: TX_TDLR, fee: 78,
    feeNote: ["$78 for an establishment or specialty establishment license, not refundable.", "场所执照或专项场所执照 78 美元，不予退还。"], renews: ["Every two years.", "每两年一次。"],
    read: TX_TDLR, quote: "Establishment licenses are valid for two years from the date of issue." }),
  salon({ id: "wa-dol-salon", where: "WA", form: "Salon Shop license", title: ["Salon or shop license", "美容美发店执照"],
    agency: ["Washington State Department of Licensing, Cosmetology Program", "华盛顿州执照部美容项目"], url: WA_DOL, fee: 121,
    feeNote: ["$121 on the Department of Licensing's fee table, which also lists a $121 renewal.", "华盛顿州执照部收费表列明 121 美元，续期同为 121 美元。"], renews: ["Renewal fee $121.", "续期费 121 美元。"],
    how: ["Applied for with the Department of Licensing after the business license application with the Department of Revenue, with proof of at least $100,000 of liability insurance.", "先向州税务局提交营业执照申请，再向执照部申请，并附至少 10 万美元责任保险的证明。"],
    read: WA_DOL, quote: "Anyone who operates a Salon Shop, Personal Service, or Mobile Unit in Washington" }),
  salon({ id: "ma-cosmetology-salon", where: "MA", form: "Aesthetics, cosmetology or manicuring salon license", title: ["Cosmetology, aesthetics or manicuring salon license", "美容、美肤或美甲沙龙执照"],
    agency: ["Massachusetts Board of Registration of Cosmetology and Barbering", "马萨诸塞州美容美发注册委员会"], url: MA_SALON, fee: 136,
    feeNote: ["$136 application fee, not refundable.", "申请费 136 美元，不予退还。"],
    how: ["Applied for online in eLIPSE with the floor plan, owner photos and notarized CORI forms; an investigator inspects the finished salon before the license issues.", "在 eLIPSE 在线申请，附平面图、业主照片及经公证的 CORI 表；调查员会在发证前检查已布置完毕的沙龙。"],
    read: MA_SALON, quote: "If your salon has a new address or a new owner, you must apply for a new salon license." }),
  salon({ id: "ga-salon", where: "GA", form: "Application for Cosmetology/Barber Salon/Shop (Rule 240-12-.01)", title: ["Cosmetology or barber salon license", "美容美发沙龙执照"],
    agency: ["Georgia State Board of Cosmetology and Barbers", "佐治亚州美容美发委员会"], url: GA_RULE, fee: null,
    read: GA_RULE, quote: "Any person or persons desiring to operate a salon/shop which offers and performs cosmetology or barber services shall submit a complete application" }),
  salon({ id: "va-salon", where: "VA", form: "Salon, Shop, Spa and Parlor License Application (A450-1213BUS)", title: ["Cosmetology or nail salon license", "美容或美甲沙龙执照"],
    agency: ["Virginia Board for Barbers and Cosmetology (DPOR)", "弗吉尼亚州美容美发委员会（DPOR）"], url: VA_APP, fee: 234.5,
    feeNote: ["$234.50 initial application fee per license, not refundable.", "每张执照首次申请费 234.50 美元，不予退还。"],
    read: VA_APP, quote: "Provide the name of the legal business entity which will operate the salon, shop, spa, or parlor." }),
  salon({ id: "or-hlo-facility", where: "OR", form: "Cosmetology facility license", title: ["Cosmetology facility license", "美容场所执照"],
    agency: ["Oregon Health Licensing Office, Board of Cosmetology", "俄勒冈州卫生执照办公室美容委员会"], url: OR_HLO, fee: null,
    read: OR_HLO, quote: "All practitioners who provide services in Oregon must do so in a licensed facility" }),
  salon({ id: "pa-cosmetology-salon", where: "PA", form: "Cosmetology salon license", title: ["Cosmetology or nail technology salon license", "美容或美甲沙龙执照"],
    agency: ["Pennsylvania State Board of Cosmetology", "宾夕法尼亚州美容委员会"], url: PA_BOARD, fee: null,
    read: PA_BOARD, quote: "cosmetology salons, esthetician salons, nail technology salons, and cosmetology schools" }),

  /* ------------------------------------------------ automotive: repair shops ------------------------------------------------ */
  {
    id: "ca-bar-ard", form: "Automotive Repair Dealer registration", title: B("Automotive repair dealer registration", "汽车维修商登记"),
    agency: B("California Bureau of Automotive Repair", "加州汽车维修局（BAR）"), level: "state", where: "CA", segments: STORES, needs: { autoRepair: true }, method: "online", order: 74,
    how: B("Applied for online with the Bureau of Automotive Repair before the shop takes paid work; the registration and the dealer sign are posted at the shop.", "在承接有偿维修前向汽车维修局在线申请；登记证书和维修商标识须张贴在店内。"),
    url: CA_BAR, info: CA_BAR, fee: 200, feeNote: B("$200 application fee and $200 a year to renew.", "申请费 200 美元，每年续期 200 美元。"), renews: B("Every year ($200).", "每年一次（200 美元）。"),
    checked: "page", fields: [], plain: B("The state registration for any business paid to diagnose, service or repair vehicles.", "凡有偿诊断、保养或维修车辆的企业须办理的州登记。"),
    proof: P(CA_BAR, "Required to diagnose, service, or repair vehicles for compensation."),
  },
  {
    id: "ny-dmv-repair", form: "Original Facility Application (VS-1)", title: B("Repair shop registration", "汽车维修店登记"),
    agency: B("New York State Department of Motor Vehicles, Office of Vehicle Safety", "纽约州机动车管理局车辆安全办公室"), level: "state", where: "NY", segments: STORES, needs: { autoRepair: true }, method: "pdf_mail", order: 74,
    how: B("The Original Facility Application (VS-1) goes to DMV with proof of the right to use the property; the shop meets DMV's repair shop and zoning requirements first.", "向 DMV 提交原始设施申请表（VS-1），附场地使用权证明；维修店须先符合 DMV 的维修店及分区要求。"),
    url: NY_REPAIR, info: NY_REPAIR, fee: null, checked: "page", fields: [],
    plain: B("New York's registration for a shop that repairs motor vehicles, before it opens.", "纽约州机动车维修店开业前须办理的登记。"),
    proof: P(NY_REPAIR, "To become a registered repair shop in New York State, you must submit Original Facility Application (VS-1)"),
  },
  {
    id: "fl-fdacs-repair", form: "Motor Vehicle Repair Shop registration", title: B("Motor vehicle repair shop registration", "机动车维修店登记"),
    agency: B("Florida Department of Agriculture and Consumer Services", "佛罗里达州农业与消费者服务部"), level: "state", where: "FL", segments: STORES, needs: { autoRepair: true }, method: "online", order: 74,
    how: B("Registered online with FDACS (ConsumerCompliance.FDACS.gov) before the shop takes paid repairs.", "在承接有偿维修前，向 FDACS 在线登记（ConsumerCompliance.FDACS.gov）。"),
    url: FL_REPAIR, info: FL_REPAIR, fee: null, checked: "page", fields: [],
    plain: B("Florida's registration for anyone paid to repair other people's vehicles.", "佛罗里达州对有偿维修他人车辆者的登记。"),
    proof: P(FL_REPAIR, "requires anyone who is paid to repair motor vehicles owned by other individuals to register with the Florida Department of Agriculture and Consumer Services"),
  },

  /* ------------------------------------------------ healthcare: medical devices ------------------------------------------------ */
  {
    id: "fda-device-reg", form: "FDA Unified Registration and Listing System (FURLS) establishment registration", title: B("Medical device establishment registration (initial importer)", "医疗器械企业注册（首次进口商）"),
    agency: B("U.S. Food and Drug Administration, Center for Devices and Radiological Health", "美国食品药品监督管理局器械与放射健康中心"), level: "federal", where: "US", segments: ["seller", "warehouse", "retail"], needs: { devices: true }, method: "online", order: 48,
    how: B("The annual registration fee is paid first, then the establishment registers in FDA's online system within 30 days of starting; an initial importer registers and identifies the foreign manufacturers it imports from.", "先缴纳年度注册费，再于开始经营后 30 天内在 FDA 在线系统注册；首次进口商须注册并列明其进口的境外制造商。"),
    url: "https://www.fda.gov/medical-devices/device-registration-and-listing/how-register-and-list", info: FDA_DEVICE, fee: 13785,
    feeNote: B("$13,785 for FY 2027 (October 1, 2026 to September 30, 2027), FDA's annual establishment registration fee.", "2027 财年（2026 年 10 月 1 日至 2027 年 9 月 30 日）FDA 年度企业注册费 13,785 美元。"),
    takes: B("Within 30 days of beginning the activity.", "开始经营后 30 天内。"), takesSource: `${FDA_DEVICE_WHEN} (2026-10-23)`, renews: B("Every year, between October 1 and December 31.", "每年 10 月 1 日至 12 月 31 日之间。"),
    checked: "page", fields: [], plain: B("FDA's yearly registration for a business that brings medical devices into the US and passes them on to sellers or users.", "FDA 对将医疗器械进口到美国并转交销售方或使用者的企业的年度注册。"),
    proof: P(FDA_DEVICE, "intended for use in the U.S. are required to register annually with the FDA."),
  },

  /* ------------------------------------------------ manufacturing ------------------------------------------------ */
  {
    id: "ca-igp", form: "Industrial General Permit coverage (Notice of Intent in SMARTS)", title: B("Industrial stormwater permit coverage", "工业雨水排放许可"),
    agency: B("California State Water Resources Control Board", "加州水资源控制委员会"), level: "state", where: "CA", segments: ["warehouse"], needs: { manufactures: true }, method: "online", order: 77,
    how: B("Where the facility's industrial activity is one the permit lists (most manufacturing, by its SIC code), it registers for coverage in SMARTS and keeps a stormwater pollution prevention plan.", "设施的工业活动属许可所列类别（多数制造业，按 SIC 代码）时，须在 SMARTS 登记取得许可，并制定雨水污染防治计划。"),
    url: CA_IGP, info: CA_IGP, fee: null, feeNote: B("An annual fee set by the Water Board's fee schedule.", "按水资源委员会收费表每年缴费。"), renews: B("Annual report and fee each year.", "每年提交年度报告并缴费。"),
    checked: "page", fields: [], plain: B("California's permit for rain running off an industrial site, which most factories need.", "加州针对工业场地雨水径流的许可，多数工厂需要。"),
    proof: P(CA_IGP, "The Industrial General Permit regulates industrial storm water discharges and authorized non-storm water discharges from industrial facilities in California."),
  },
  {
    id: "tx-msgp", form: "Multi-Sector General Permit TXR050000 (Notice of Intent)", title: B("Industrial stormwater permit coverage (MSGP)", "工业雨水排放许可（MSGP）"),
    agency: B("Texas Commission on Environmental Quality", "德州环境质量委员会（TCEQ）"), level: "state", where: "TX", segments: ["warehouse"], needs: { manufactures: true }, method: "online", order: 77,
    how: B("Where the facility's industrial activity is covered by the permit, a Notice of Intent (or a No Exposure Certification) is filed in TCEQ's online e-permitting system.", "设施的工业活动属许可范围时，须在 TCEQ 在线电子许可系统提交意向通知（或无暴露证明）。"),
    url: TX_MSGP, info: TX_MSGP, fee: null, checked: "page", fields: [],
    plain: B("Texas's permit for rain running off an industrial site.", "德州针对工业场地雨水径流的许可。"),
    proof: P(TX_MSGP, "Requirements and options for stormwater discharges from industrial facilities under the Multi-Sector General Permit TXR050000."),
  },
  ...(["LAC", "ORC"] as const).map((where): OfficialForm => ({
    id: `scaqmd-permit-${where.toLowerCase()}`, form: "South Coast AQMD Permit to Construct and Permit to Operate", title: B("Air quality permit for equipment (Permit to Construct)", "设备空气质量许可（建造许可）"),
    agency: B("South Coast Air Quality Management District", "南海岸空气质量管理区（South Coast AQMD）"), level: "county", where, segments: ["warehouse"], needs: { manufactures: true }, method: "online", order: 50,
    how: B("Equipment that emits air pollutants (spray booths, ovens, boilers, some printing and coating lines) needs a Permit to Construct before it is installed, then a Permit to Operate.", "排放空气污染物的设备（喷漆房、烘炉、锅炉、部分印刷和涂装线）须在安装前取得建造许可，之后取得运行许可。"),
    url: SCAQMD, info: SCAQMD, fee: null, checked: "page", fields: [],
    plain: B("The air district's permit for equipment that puts pollutants in the air, before it's installed.", "空气质量管理区对排放污染物设备的安装前许可。"),
    proof: P(SCAQMD, "For installation of new or relocated equipment or alteration of existing equipment"),
  })),
  {
    id: "ca-hmbp", form: "Hazardous Materials Business Plan (CERS)", title: B("Hazardous materials business plan", "危险品业务计划"),
    agency: B("The local Certified Unified Program Agency (CUPA), under CalEPA", "当地统一认证项目机构（CUPA），由加州环保局监管"), level: "county", where: "CA", except: ["LA"], segments: ["warehouse"], needs: { hazmat: true }, method: "portal", order: 79,
    how: B("Filed in the California Environmental Reporting System when hazardous materials on site reach the reporting amounts, and certified each year with the local CUPA.", "场地内危险品达到申报数量时在加州环境报告系统（CERS）提交，并每年向当地 CUPA 认证。"),
    url: "https://cers.calepa.ca.gov/", info: CA_HMBP, fee: null, renews: B("Certify every year.", "每年认证。"), checked: "page", fields: [],
    plain: B("An inventory and emergency plan for hazardous materials on site, filed with the local agency.", "向当地机构提交的场地危险品清单及应急计划。"),
    proof: P(CA_HMBP, "Certified Unified Program Agencies (CUPAs), and Participating Agencies (PAs), implement the program at the local level"),
  },

];

// What the words of a business say about the sector filings (the intake and the agent's tool can say it outright too).
const SALON = /\bnail (salon|spa|bar|studio)s?\b|\bhair ?(salon|studio)s?\b|\bbeauty (salon|parlou?r)s?\b|\b(barber ?shop|barbershop|salon)s?\b|美甲|美发|理发|发廊|美容院/i;
const AUTO = /\bauto(motive)? (repair|service|body)\b|\bcar repair\b|\bbody shop\b|\bmechanic\b|\bcollision\b|汽修|修车|汽车维修/i;
const DEVICES = /\bmedical (device|equipment|supplies)\b|\bdevices? (importer|distributor)\b|医疗器械|医疗设备/i;
const MANUFACTURES = /\bmanufactur(er|ers|ing)\b|\bfactory\b|\bproduction facility\b|工厂|制造|生产基地/i;
const OFFICE = /\b(office|startup|software|saas|tech(nology)? (company|office|startup)|game studio|gaming studio|video games?|r ?& ?d center|ai (company|lab))\b|科技公司|初创公司|初创企业|人工智能|软件|游戏工作室|办公室|研发中心/i;

/** The sector needs the words of a business name: a nail salon is `salon`, an auto body shop `autoRepair`, a medical
    device importer `devices`, a factory `manufactures`, a tech office or game studio `office`. */
export function sectorNeeds(what: string): Pick<Needs, "salon" | "autoRepair" | "devices" | "manufactures" | "office"> {
  const w = what || "";
  return { ...(SALON.test(w) ? { salon: true } : {}), ...(AUTO.test(w) ? { autoRepair: true } : {}), ...(DEVICES.test(w) ? { devices: true } : {}),
    ...(MANUFACTURES.test(w) && !FURNITURE.test(w) ? { manufactures: true } : {}), ...(OFFICE.test(w) && !SALON.test(w) && !FURNITURE.test(w) ? { office: true } : {}) };
}
