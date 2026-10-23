// The only numbers Odelia may call: each agency's public line, copied from the agency's own page, with the page and
// the day it was read. Nothing else is ever dialed: not a number in a letter, an email, a web page, a document or what
// someone says on a call, and never a person's own phone (TCPA: the FCC's February 8, 2024 declaratory ruling, FCC
// 24-17, holds that AI-generated voices are "artificial" voices under 47 U.S.C. 227(b), so calls to consumers need prior
// express consent; Placetta calls agency lines only). The team can add a number through agency_phone_add (migration
// 20261030120000_voice_calls.sql) only with a source page on a government host, and it lands here on the next build.
//
// Keys are official form ids (src/forms/registry.ts); a filing's payload.official picks its agency line.
// Re-check every quarter, as for file/destinations.ts.

export type AgencyLine = {
  agency: { en: string; zh: string };
  number: string;                 // E.164
  /** What to press to reach a person, as the agency's page says. Odelia sends these as DTMF after the greeting. */
  menu?: { digits: string; says: string };
  tz: string;
  /** Weekday hours the agency publishes, local time. null: not published; Odelia then dials only 9:00 to 16:00. */
  hours: { open: string; close: string } | null;
  /** The agency's own way to check a status online, when it has one: Odelia uses it before calling. */
  online?: string;
  source: string;
  checked: string;
  forms: string[];
};

export const AGENCY_LINES: Record<string, AgencyLine> = {
  cdtfa: {
    agency: { en: "California Department of Tax and Fee Administration", zh: "加州税务及收费管理局（CDTFA）" },
    number: "+18004007115", tz: "America/Los_Angeles", hours: { open: "07:30", close: "17:00" },
    source: "https://www.cdtfa.ca.gov/contact.htm", checked: "2026-10-23",       // "from 7:30 a.m. to 5:00 p.m. (Pacific time)", weekdays
    forms: ["ca-cdtfa"],
  },
  "ca-sos-be": {
    agency: { en: "California Secretary of State, Business Entities", zh: "加州州务卿办公室 企业实体部" },
    number: "+19166575448", tz: "America/Los_Angeles", hours: { open: "08:00", close: "17:00" },
    source: "https://sos.ca.gov/business-programs/business-entities/contact/", checked: "2026-10-23",
    forms: ["ca-llc-1", "ca-llc-12"],
  },
  "sj-business-tax": {
    agency: { en: "City of San José, Business Tax", zh: "圣何塞市 营业税处" },
    number: "+14085357055", menu: { digits: "2", says: "Click Option 2 for Business Tax" }, tz: "America/Los_Angeles", hours: null,
    source: "https://www.sanjoseca.gov/your-government/departments-offices/finance/business-tax-registration", checked: "2026-10-23",
    forms: ["sj-business-tax"],
  },
  "sj-building": {
    agency: { en: "City of San José, Building Division", zh: "圣何塞市 建筑部" },
    number: "+14085353555", tz: "America/Los_Angeles", hours: null,
    source: "https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/building-division", checked: "2026-10-23",
    forms: ["sj-building-ti", "sj-sign"],
  },
  "ny-sla": {
    agency: { en: "New York State Liquor Authority, Licensing", zh: "纽约州酒类管理局 执照部" },
    number: "+15184743114", menu: { digits: "13", says: "Press \"1\", then \"3\" for licensing assistance" }, tz: "America/New_York", hours: null,
    online: "https://lamp.sla.ny.gov",                                            // the SLA asks status questions to go there first
    source: "https://sla.ny.gov/contact-us", checked: "2026-10-23",
    forms: ["ny-sla-rw"],
  },
};

/** The agency line for a filing's official form, if Placetta has one. */
export function lineForForm(formId: string | null | undefined): (AgencyLine & { key: string }) | null {
  if (!formId) return null;
  for (const [key, l] of Object.entries(AGENCY_LINES)) if (l.forms.includes(formId)) return { key, ...l };
  return null;
}

/** Every official number, for the check before any dial. */
export const officialNumbers = (extra: string[] = []) => new Set([...Object.values(AGENCY_LINES).map((l) => l.number), ...extra]);
