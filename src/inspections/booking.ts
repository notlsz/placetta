/* Booking inspections: how each agency in the covered cities takes a request, and what Odelia does for each.

   From the inspection guides (./data/*.json, each inspection's `book`, `bookUrl`, `phone` and `source`, read from the
   agencies' own pages on 2026-10-15). The method below is what that text says; nothing is added to it.
     portal               the agency books it on its own site with the permit holder's account. Where Placetta has a
                          verified destination (supabase/functions/file/destinations.ts, `insp-*`), the portal worker
                          books it with the owner's vaulted login after the owner approves the slot, like a filing; it
                          never creates an account and hands any CAPTCHA to the owner in the live view. Without one,
                          Placetta's team books it with the owner's login.
     applicant_of_record  only the licensed professional on the job may request it (NYC DOB NOW): Odelia drafts the
                          request to them.
     phone, email,        Odelia drafts the email or the call script; the team makes the call. A plan checker or an
     plan_checker         assigned inspector is reached the same way.
     not_booked           the agency schedules it or comes unannounced: nothing to book, prep only.

   Copied from what works: Calendly's and OpenTable's pick a slot, then confirm (the owner picks one of the times
   Odelia proposes, then approves exactly that one); the agencies' own portals do the booking. A booked inspection goes
   on Deadlines (the calendar feed and reminders read it), the reminder carries the prep, and the result is tracked:
   passed, failed with corrections, or a re-inspection booked.

   The mock inspection copies Jack & Jill's mock interview: before the real one, Odelia walks the inspector's own
   checklist with the owner one item at a time, by chat or text, a photo where it helps (hood tag, hand sink,
   thermometer), and each gap becomes a fix to do. It fills the store's existing mock inspection tray (store.mock). */
import { B, type Bi } from "../bi";
import type { Inspection } from "./types";

export type Method = "portal" | "form" | "applicant_of_record" | "phone" | "email" | "plan_checker" | "not_booked";
export type BookingWay = {
  method: Method;
  /** The destination id the filer books through, when Placetta has a verified one. */
  dest?: string;
  /** What the agency needs to take the request, as its page says. */
  needs: Bi;
  /** The portal needs the permit holder's account (never created by Placetta). */
  account?: boolean;
  /** Another way for some permits, told apart by the permit number (San Francisco: numeric permits are booked by phone). */
  alt?: { permit: RegExp; way: BookingWay };
};

/** "<where>:<inspection id>" → how it's booked. Inspections not listed are prep only. */
export const BOOKING: Record<string, BookingWay> = {
  "LA:building-final": { method: "portal", dest: "insp-la-building-final", account: true, needs: B("The permit number; the inspection type (final)", "许可证号；检查类型（终验）") },
  "LA:fire-final": { method: "portal", dest: "insp-la-fire-final", account: false, needs: B("The 9-character Transaction ID and the street name from the Fire Development Services application; the preferred date; the fee is paid online", "消防开发服务申请的 9 位交易编号和街道名称；首选日期；费用在线支付") },
  "LAC:health-preopening": { method: "plan_checker", needs: B("The plan check file; the plan checker who approved the plans", "图纸审查档案；批准图纸的审图员") },
  // PermitSF, confirmed 2026-10-22 on sf.gov: "Once your permit is issued in PermitSF, you will be able to request
  // inspections online from your PermitSF dashboard"; a permit that starts with numbers is booked by phone instead
  "SF:building-final": { method: "portal", dest: "insp-sf-building-final", account: true, needs: B("The PermitSF permit number (letters first: BLDG, ELEC, PLMB); the inspector calls the morning of the inspection", "PermitSF 许可证号（字母开头：BLDG、ELEC、PLMB）；检查当天上午检查员会来电"),
    alt: { permit: /^\d/, way: { method: "phone", needs: B("A permit that starts with numbers: the Voice Inspection Scheduling System at 628-652-3401 (24/7), with the permit application number and the inspection code", "以数字开头的许可：致电语音检查预约系统 628-652-3401（全天候），需提供许可申请号和检查代码") } } },
  "SF:fire-clearance": { method: "phone", needs: B("The fee paid first; then the district inspector at 415-558-3300", "先付费，再致电 415-558-3300 找区域检查员") },
  "SF:health-preopening": { method: "email", needs: B("The DPH plan reviewer (DPH-OTCPlanCheck@sfdph.org)", "卫生局审图员（DPH-OTCPlanCheck@sfdph.org）") },
  "SF:health-permit": { method: "not_booked", needs: B("The district inspector inspects after the permit application", "申请卫生许可后区域检查员上门检查") },
  "NYC:building-final": { method: "applicant_of_record", needs: B("The applicant of record requests it in DOB NOW: Inspections", "由登记申请人在 DOB NOW: Inspections 中申请") },
  "NYC:fire-hood": { method: "portal", dest: "insp-nyc-fire-hood", account: true, needs: B("An NYC.ID account on FDNY Business; the permit or application number", "FDNY Business 的 NYC.ID 账户；许可或申请编号") },
  "NYC:health-preopening": { method: "phone", needs: B("Call 212-676-1600 to schedule the pre-operating inspection", "致电 212-676-1600 预约开业前检查") },
  "SJ:building-final": { method: "portal", dest: "insp-sj-building-final", account: true, needs: B("The permit number; \"Schedule an Inspection\" on SJPermits.org", "许可证号；在 SJPermits.org 点“Schedule an Inspection”") },
  "SJ:fire-final": { method: "phone", needs: B("Call 408-535-3555 for each inspection", "每项检查致电 408-535-3555") },
  "SCC:health-preopening": { method: "phone", needs: B("All plan review fees paid; call 408-918-3400 or email the plan check team", "付清全部审图费；致电 408-918-3400 或邮件联系审图组") },
  "AUS:building-final": { method: "portal", dest: "insp-aus-building-final", account: true, needs: B("The AB+C account linked to the permit; the permit Active and its fees paid; anyone listed on the permit or their agent", "与许可关联的 AB+C 账户；许可为 Active 状态且已付费；许可上列明的人或其代理人") },
  "AUS:fire-final": { method: "form", needs: B("The permit number; fees paid in AB+C first", "许可证号；先在 AB+C 付费") },
  "AUS:health-preopening": { method: "portal", account: true, needs: B("The Pre-Opening Inspection Application in My Health Department", "在 My Health Department 提交开业前检查申请") },
  "DAL:building-final": { method: "portal", dest: "insp-dal-building-final", account: true, needs: B("The permit in DallasNow", "DallasNow 中的许可") },
  "DAL:fire-acceptance": { method: "portal", account: true, needs: B("The Pre-Test Certification form for the inspector", "交给检查员的预测试证明表") },
  "DAL:health-preopening": { method: "phone", needs: B("Your permitting inspector", "负责您许可的检查员") },
  "FTW:building-final": { method: "portal", dest: "insp-ftw-building-final", account: true, needs: B("The permit in Accela Citizen Access, with the inspection contact filled in the ACA profile", "Accela Citizen Access 中的许可，并在 ACA 资料中填写检查联系人") },
  "FTW:fire-final": { method: "phone", needs: B("The permit number and address; only the applicant or its company may call", "许可证号和地址；仅申请人或其公司可致电") },
  "FTW:health-preopening": { method: "plan_checker", needs: B("The Consumer Health plan reviewer at (817) 392-7255", "消费者卫生审图员 (817) 392-7255") },
  "HOU:building-final": { method: "portal", account: true, needs: B("The project number and scheduling PIN; trade inspections by the licensed contractor", "项目编号和预约 PIN；专业检查由持牌承包商预约") },
  "HOU:building-occupancy": { method: "email", needs: B("Form CE-1045A as a PDF to Occupancy.Inspections@houstontx.gov", "将 CE-1045A 表 PDF 发送至 Occupancy.Inspections@houstontx.gov") },
  "HOU:fire-opening": { method: "phone", needs: B("Call 713-535-7897", "致电 713-535-7897") },
  "HOU:health-preopening": { method: "phone", needs: B("The certified food manager's name, phone and email", "持证食品经理的姓名、电话和邮箱") },
  "IRV:building-final": { method: "portal", dest: "insp-irv-building-final", account: true, needs: B("The permit number and the inspection code", "许可证号和检查代码") },
  "IRV:fire-final": { method: "email", needs: B("The OCFA service request number, building or suite, scope; reinspection fees paid first", "OCFA 服务申请号、楼栋或单元、范围；先付复检费") },
  "IRV:health-preopening": { method: "plan_checker", needs: B("The plan checker named on the approved plans", "已批准图纸上的审图员") },
  "PHX:building-final": { method: "portal", dest: "insp-phx-building-final", account: true, needs: B("The permit number and the web inspection key on the permit receipt, saved like a login", "许可证号和许可收据上的网上检查密钥，按登录信息保存") },
  "PHX:fire-final": { method: "phone", needs: B("The area fire inspector on the fire permit", "消防许可上的区域检查员") },
  "PHX:health-preopening": { method: "portal", account: true, needs: B("Maricopa County's Permit Center", "马里科帕县许可中心") },
  "SAT:building-final": { method: "portal", account: true, needs: B("BuildSA (phone booking adds a $3 fee)", "BuildSA（电话预约每次加收 $3）") },
  "SAT:fire-final": { method: "portal", account: false, needs: B("SAFD's Inspection Scheduler, or the request form by email", "SAFD 检查预约系统，或邮件提交申请表") },
  "SAT:health-preopening": { method: "not_booked", needs: B("Development Services schedules it after the CofO application", "申请入住证后由开发服务部安排") },
  "SDG:building-final": { method: "portal", dest: "insp-sdg-building-final", account: true, needs: B("The permit or approval number in the DSD portal (Accela)", "DSD 门户（Accela）中的许可或批准编号") },
  "SDG:fire-final": { method: "portal", account: true, needs: B("The fire permit number in the DSD portal", "DSD 门户中的消防许可编号") },
  "SDG:health-preopening": { method: "plan_checker", needs: B("The plan checker on the approval letter, or (858) 505-6660", "批准函上的审图员，或 (858) 505-6660") },
};

/** How a guide's inspection is booked. Not listed, or routine: prep only. With the permit number, a permit the agency
 *  books another way gets that way (San Francisco's numeric permits by phone). */
export function bookingWay(where: string, ins: Inspection, permit = ""): BookingWay {
  if (ins.stage === "routine") return { method: "not_booked", needs: ins.book };
  const way = BOOKING[`${where}:${ins.id.replace(/^[a-z]+-(?=(building|fire|health)-)/, "")}`] ?? { method: "not_booked", needs: ins.book };
  return way.alt && permit.trim() && way.alt.permit.test(permit.trim()) ? way.alt.way : way;
}

export const METHOD_WORDS: Record<Method, Bi> = {
  portal: B("Booked on the agency's site", "在机构网站预约"), form: B("The agency's online request form", "机构在线申请表"),
  applicant_of_record: B("Requested by your architect or engineer of record", "由登记的建筑师或工程师申请"), phone: B("By phone", "电话预约"),
  email: B("By email", "邮件预约"), plan_checker: B("Through your plan checker", "通过审图员预约"), not_booked: B("The agency schedules it", "由机构安排"),
};

/** A slot as the owner picks it: a date and a window ("morning", "afternoon", or "08:00-10:00"). */
export const slotText = (date: string, window: string) => `${date}, ${window}`;
export const isWindow = (w: string) => /^(morning|afternoon|all day|any time|\d{2}:\d{2}-\d{2}:\d{2})$/i.test(w.trim());

/** The call script for a phone booking, read by the team (or the owner) on the call. */
export function callScript(o: { business: string; address: string; inspection: Bi; agency: Bi; permit?: string; slots: string[]; contact?: string; phone?: string }): string {
  return [
    `Calling ${o.agency.en}${o.phone ? ` at ${o.phone}` : ""} to book the ${o.inspection.en}.`,
    `"Hello, I'm calling for ${o.business} at ${o.address}${o.permit ? `, permit ${o.permit}` : ""}. We'd like to schedule the ${o.inspection.en}."`,
    `Ask for, in order: ${o.slots.join("; ") || "the first opening they have"}.`,
    `Confirm: the date and time window, the inspector's name if given, anything to have ready on site, and a confirmation number.`,
    `Site contact for the inspector: ${o.contact || "(ask the owner)"}.`,
    `After the call: record the time with inspection_booking "confirm" so it goes on Deadlines with a reminder.`,
  ].join("\n");
}
