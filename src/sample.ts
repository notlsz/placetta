import { B, SAMPLE, type Application, type Workspace } from "./model";
import { formById } from "./forms/registry";

/* The demo workspace's applications are the real ones a tea shop in San José files, so every agency fact on them
   comes from the official forms library (src/forms/registry.ts and local-us.ts): the form, how long the agency says it
   takes, its fee or how the agency sets it, when it renews, and the agency's own page. Only the shop's own answers
   (name, address, sign size) are the demo's. */
const OFFICIAL: Record<string, string> = {
  ein: "irs-ss4", seller: "ca-cdtfa", edd: "ca-edd-de1", plancheck: "scc-plan-check", pto: "scc-health-permit",
  btc: "sj-business-tax", building: "sj-building-ti", sign: "sj-sign",
};

/* The shop's answers on the two forms Placetta fills on the agency's own PDF (the EIN application and the payroll
   registration), by the form's own line ids, so "Download the filled official form" shows a filled form, not a blank one. */
const ADDR = "100 N First St, San Jose, CA 95113";
const ANSWERS: Record<string, Record<string, string>> = {
  ein: { l1: "Moonleaf Tea LLC", l2: "Moonleaf Tea", l4a: "100 N First St", l4b: "San Jose, CA 95113", l6: "Santa Clara County, CA", l7a: "Mei Lin", l7b: "By hand",
    l8a: "Yes", l8b: "1", l8c: "Yes", l9a: "Other: Foreign-owned U.S. disregarded entity", l10: "Started a new milk tea shop", l11: "09/01/2026", l12: "December", l13: "6",
    l15: "11/15/2026", l16: "Accommodation & food service", l17: "Milk tea, fruit tea and snacks, made to order", l18: "No", sign: "Mei Lin, Managing Member", phone: "(408) 555-0142" },
  edd: { request_type: "Register for a New Employer Account Number", employer_type: "COMMERCIAL", taxpayer_type: "Limited Liability Company (LLC)", first_payroll_date: "2026-11-15",
    employees_in_ca: "Yes", employees_residing_ca_outside: "No", officer_member_info: "Mei Lin, Managing Member", legal_name: "Moonleaf Tea LLC", dba: "Moonleaf Tea", fein: "88-1234471",
    ownership_began: "2026-09-01", state_of_incorporation: "California", physical_location: ADDR, mailing_address: "Same as above",
    products_services: "Milk tea, fruit tea and snacks, made to order and sold over the counter", industry: "Retail" },
};
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

function official(a: Application): Application {
  const id = OFFICIAL[a.id], off = id ? formById(id) : undefined;
  if (!off) return a;
  return {
    ...a,
    official: off.id,
    agency: off.agency,
    form: B(off.form, off.form),
    est: off.takes ?? B("The agency doesn't publish a processing time. Placetta tracks it from the day it's filed.", "机构未公布办理时间。快哉从提交之日起跟踪。"),
    fees: off.fee != null ? [{ label: B("Agency fee", "机构费用"), amount: off.fee }] : [{ label: B("Agency fee", "机构费用"), amount: 0, tbd: true }],
    feeNote: off.feeNote,
    renews: off.renews,
    source: { label: host(off.info), url: off.info },
    ...(ANSWERS[a.id] ? { fields: off.fields.map(o => ({ id: o.id, label: o.label, value: ANSWERS[a.id][o.id] ?? "", from: B("From your documents", "来自您的文件") })) } : {}),
  };
}

export const SAMPLE_WS: Workspace = { ...SAMPLE, apps: SAMPLE.apps.map(official) };
