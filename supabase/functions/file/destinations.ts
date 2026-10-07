// Where each official form may be sent. The file dispatcher sends only to these; a destination from the client is
// never used. Every entry is copied from the agency's own page, with the page and the date someone checked it.
// Re-check each entry every quarter: the monitor opens a team task when one is older than 90 days.
//
// Keys are official form ids from src/forms/registry.ts and world.ts.

export type Address = { name: string; line1: string; line2?: string; city: string; state: string; zip: string; country?: string };

export type Dest = {
  email?: string;                                   // agency inbox that accepts this form
  fax?: { us: string; foreign?: string };           // E.164; foreign = owner with no US address
  mail?: Address & { foreign?: Address };
  portal?: string;                                  // https host the worker may open, e.g. "bizfile.sos.ca.gov"
  signature: "none" | "typed" | "drawn" | "wet";    // what the agency accepts on this form
  checked: string;                                  // YYYY-MM-DD someone confirmed it on the agency's page
  source: string;                                   // that page
};

/** Verified destinations. Only these are used. */
export const DEST: Record<string, Dest> = {
  "irs-ss4": {
    // Foreign applicants: the IRS lists 855-215-1627 for faxes sent from within the US (Placetta's fax number is
    // in the US) and 304-707-9471 from outside it.
    fax: { us: "+18556416935", foreign: "+18552151627" },
    mail: {
      name: "Internal Revenue Service", line1: "Attn: EIN Operation", city: "Cincinnati", state: "OH", zip: "45999",
      foreign: { name: "Internal Revenue Service", line1: "Attn: EIN International Operation", city: "Cincinnati", state: "OH", zip: "45999" },
    },
    signature: "wet",                                 // until the IRS e-signature list includes Form SS-4
    checked: "2026-10-07",                            // page last reviewed 28-Apr-2026
    source: "https://www.irs.gov/filing/where-to-file-your-taxes-for-form-ss-4",
  },
};

/**
 * Waiting for someone to copy the numbers and addresses from the agency's page and date them. Nothing here is used:
 * move an entry into DEST once every value is confirmed on the source page.
 */
export const TO_VERIFY: Record<string, { source: string; note: string; partial?: Partial<Dest> }> = {
  "cbp-5106": {
    source: "https://www.cbp.gov/newsroom/publications/forms",
    note: "Usually goes through the customs broker. Leave it to the team at first.",
  },
};

const E164 = /^\+[1-9]\d{6,14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EMAIL = /^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function addressProblems(id: string, a: Address | undefined, label: string): string[] {
  if (!a) return [];
  const out: string[] = [];
  for (const k of ["name", "line1", "city", "state", "zip"] as const) if (!a[k]?.trim()) out.push(`${id}: ${label} ${k} is missing`);
  if (/[<>]/.test(JSON.stringify(a))) out.push(`${id}: ${label} still has a placeholder`);
  return out;
}

/** Every reason an entry can't ship. The tests fail on any. */
export function destinationProblems(dest: Record<string, Dest> = DEST): string[] {
  const out: string[] = [];
  for (const [id, d] of Object.entries(dest)) {
    if (!d.checked || !DATE.test(d.checked) || Number.isNaN(Date.parse(d.checked))) out.push(`${id}: checked must be the date it was confirmed (YYYY-MM-DD)`);
    if (!d.source || !/^https:\/\//.test(d.source)) out.push(`${id}: source must be the agency's https page`);
    if (!d.email && !d.fax && !d.mail && !d.portal) out.push(`${id}: has no destination`);
    if (d.email && !EMAIL.test(d.email)) out.push(`${id}: email is not an address`);
    if (d.fax && (!E164.test(d.fax.us) || (d.fax.foreign !== undefined && !E164.test(d.fax.foreign)))) out.push(`${id}: fax numbers must be E.164 (+1...)`);
    if (d.portal && !HOST.test(d.portal)) out.push(`${id}: portal must be a bare host name`);
    out.push(...addressProblems(id, d.mail, "mail"), ...addressProblems(id, d.mail?.foreign, "foreign mail"));
  }
  return out;
}

/** Entries last checked more than `days` ago. */
export function staleDestinations(today: string, days = 90, dest: Record<string, Dest> = DEST): { id: string; checked: string; source: string }[] {
  const now = Date.parse(today + "T00:00:00Z");
  return Object.entries(dest)
    .filter(([, d]) => now - Date.parse(d.checked + "T00:00:00Z") > days * 864e5)
    .map(([id, d]) => ({ id, checked: d.checked, source: d.source }));
}
