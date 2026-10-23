/* Business facts read from whatever an owner pastes or drops at sign-up, so the last screen of onboarding is a few taps
   to confirm, not a form to type (Stripe Atlas and Mercury prefill from what they already have). It reads:
     an email signature    "Mei Chen | Owner\nLucky Leaf Tea LLC\n1 N First St, San Jose, CA 95113\n(408) 555-0142"
     a website address     "luckyleaftea.com": kept as the website, for Odelia to read later
     an IRS EIN letter     CP 575: "assigned you an Employer Identification Number (EIN) 88-1234471" and the name on it
     articles, a lease or a business license: the company's name with LLC or Inc, the street address
   Every value carries the words it came from (quote), the way Odelia's own document reading does (review_documents).
   Pure and offline: nothing typed or dropped here leaves the browser until the workspace exists. */

export type Found = { value: string; quote: string };
export type Read = { legal?: Found; owner?: Found; address?: Found; ein?: Found; website?: Found; phone?: Found; email?: Found };

const SUFFIX = /\b(L\.?L\.?C\.?|Inc\.?|Incorporated|Corp\.?|Corporation|Co\.|Company|Ltd\.?|LLP|L\.?P\.?|PLLC|PC)(?=$|[\s,.)])/;
const STREET = /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Z0-9][\w.'-]*(?:\s+[A-Z0-9][\w.'-]*){0,4}\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Pl|Place|Ct|Court|Pkwy|Parkway|Hwy|Highway|Sq|Square|Ter|Terrace|Cir|Circle|Plaza|Broadway)\b\.?(?:,?\s*(?:Suite|Ste\.?|Unit|#|Apt\.?)\s*[\w-]+)?,?\s+[A-Z][A-Za-z.' ]{1,30},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/;
const NOT_A_NAME = /\b(LLC|Inc|Corp|Street|St|Ave|Suite|Tea|Shop|Cafe|Restaurant|Bakery|Kitchen|Store|Market|Owner|Manager|Founder|CEO|President|Member|Department|Internal|Revenue|Service|State|County|City|Dear|Thanks|Thank|Best|Regards|Sincerely)\b/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const lineOf = (text: string, at: number) => clean(text.slice(text.lastIndexOf("\n", at) + 1, (text.indexOf("\n", at) + 1 || text.length + 1) - 1));

/** The company's legal name: a line (or phrase) ending in LLC, Inc, Corp and the like. */
function legalName(text: string): Found | undefined {
  // a labeled one first: "Name of the limited liability company: Lucky Leaf Tea LLC", "Entity name", "Taxpayer name"
  const lab = /(?:name of (?:the )?(?:limited liability company|corporation|entity|business)|entity name|business name|legal name|company name)\s*[:\-]\s*([^\n]{2,90})/i.exec(text);
  if (lab && SUFFIX.test(lab[1])) return { value: clean(lab[1]).replace(/[.,;]+$/, ""), quote: clean(lab[0]) };
  for (const raw of text.split(/\n|\s{3,}|\s\|\s/)) {
    const m = new RegExp(String.raw`([A-Z0-9&][\w&'.-]*(?:\s+[A-Z0-9&][\w&'.-]*){0,6}\s*,?\s+` + SUFFIX.source + ")").exec(raw);
    if (m) {
      const v = clean(m[1]).replace(/^(?:the|dear|from|to|at)\s+/i, "").replace(/[,;]+$/, "");
      if (v.split(" ").length >= 2) return { value: v, quote: clean(raw).slice(0, 140) };
    }
  }
  return undefined;
}

/** A person's name: a labeled one ("Owner: Mei Chen", "Organizer", "Managing member", "Signed"), or the first line of a
 *  signature that reads as two or three capitalized words. */
function ownerName(text: string): Found | undefined {
  const label = /(?:owner|organizer|managing member|member|signature|signed|responsible party|applicant|tenant)\s*(?:name)?\s*[:\-]\s*/gi;
  for (let m = label.exec(text); m; m = label.exec(text)) {
    const name = /^[A-Z][a-z'-]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z'-]+){1,2}/.exec(text.slice(m.index + m[0].length));
    if (name && !NOT_A_NAME.test(name[0])) return { value: clean(name[0]), quote: clean(m[0] + name[0]) };
  }
  for (const raw of text.split("\n").slice(0, 6)) {
    const head = clean(raw.split(/\s[|,–-]\s|,\s/)[0]);
    if (/^[A-Z][a-z'-]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z'-]+){1,2}$/.test(head) && !NOT_A_NAME.test(head)) return { value: head, quote: clean(raw) };
  }
  return undefined;
}

export function readPasted(input: string): Read {
  const text = input.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const out: Read = {};
  const legal = legalName(text); if (legal) out.legal = legal;
  const owner = ownerName(text); if (owner && owner.value !== legal?.value) out.owner = owner;
  const flat = text.replace(/\n/g, ", ").replace(/,\s*,/g, ",");
  const addr = STREET.exec(flat);
  if (addr) out.address = { value: clean(addr[0]).replace(/,\s*,/g, ","), quote: clean(addr[0]) };
  const ein = /\b(\d{2})[-–]\s?(\d{7})\b/.exec(text);
  if (ein && /\b(EIN|Employer Identification|federal tax id|FEIN|TIN)\b/i.test(text)) out.ein = { value: `${ein[1]}-${ein[2]}`, quote: lineOf(text, ein.index) };
  const mail = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(text);
  if (mail) out.email = { value: mail[0], quote: mail[0] };
  const web = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|co|us|biz|shop|cafe|tea|io|ca|uk|au|nz|jp))(?:\/[^\s]*)?/i.exec(text.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, " "));
  if (web) out.website = { value: web[1].toLowerCase(), quote: web[0] };
  const phone = /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/.exec(text);
  if (phone) out.phone = { value: phone[0], quote: phone[0] };
  return out;
}

/** What a reading found, merged: what's already confirmed stays. */
export const merge = (a: Read, b: Read): Read => ({ ...b, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v)) });
