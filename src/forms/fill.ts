import type { Field } from "../model";
import { formById } from "./registry";

/* Fills the official PDF itself: the agency's own form, downloaded from the agency (federal forms are public domain),
   with each answer written into the form's own field for that line. Nothing private goes in: SSNs, ITINs and passport
   numbers stay blank for the signer to write by hand. The PDF and pdf-lib load only when someone downloads. */

type Put = { text: (name: string, v: string) => void; check: (name: string) => void };
const norm = (s: string) => s.trim().toLowerCase();
const yes = (v: string) => /^(y|yes|是|true)$/i.test(v.trim());
const no = (v: string) => /^(n|no|否|false)$/i.test(v.trim());
const SECRET = /\b\d{3}-?\d{2}-?\d{4}\b|\b9\d{2}-?[78]\d-?\d{4}\b/;   // SSN or ITIN shapes

/** IRS Form SS-4 (Rev. December 2025): every field name checked against the printed line it sits on. */
function ss4(v: Record<string, string>, put: Put) {
  const P = "topmostSubform[0].Page1[0].";
  const T: Record<string, string> = { l1: "f1_2", l2: "f1_3", l5a: "f1_7", l5b: "f1_8", l6: "f1_9", l7a: "f1_10", l8b: "f1_12", l9b: "f1_21", l11: "f1_31", l12: "f1_32", l13: "f1_35", l15: "f1_36", l17: "f1_38", sign: "f1_44", phone: "f1_45" };
  for (const [k, f] of Object.entries(T)) if (v[k]) put.text(P + f + "[0]", v[k]);
  if (v.l4a) put.text(P + "Line4ReadOrder[0].f1_5[0]", v.l4a);
  if (v.l4b) put.text(P + "Line4ReadOrder[0].f1_6[0]", v.l4b);
  if (v.l7b && !SECRET.test(v.l7b)) put.text(P + "f1_11[0]", v.l7b);   // "Foreign" or an EIN; never an SSN or ITIN
  if (v.l8a) { if (yes(v.l8a)) put.check(P + "c1_1[0]"); else if (no(v.l8a)) put.check(P + "c1_1[1]"); }
  if (v.l8c) { if (yes(v.l8c)) put.check(P + "c1_2[0]"); else if (no(v.l8c)) put.check(P + "c1_2[1]"); }
  const e = norm(v.l9a ?? "");
  if (e.startsWith("partnership")) put.check(P + "c1_3[2]");
  else if (e.startsWith("corporation")) { put.check(P + "c1_3[4]"); const m = /(\d{4}[a-z-]*)/i.exec(v.l9a); put.text(P + "f1_16[0]", m ? m[1] : "1120"); }
  else if (e.startsWith("sole")) put.check(P + "c1_3[0]");
  else if (e) { put.check(P + "c1_3[15]"); put.text(P + "f1_19[0]", v.l9a.replace(/^other\s*[:(-]?\s*/i, "").replace(/\)$/, "")); }
  if (v.l10) { put.check(P + "c1_4[0]"); put.text(P + "f1_25[0]", v.l10.slice(0, 18)); if (v.l10.length > 18) put.text(P + "f1_26[0]", v.l10.slice(18, 60)); }
  const a = norm(v.l16 ?? "");
  const ACT: [RegExp, number][] = [[/health/, 0], [/agent|broker/, 1], [/construction/, 2], [/rental|leasing/, 3], [/transport|warehous/, 4], [/accommodation|food/, 5], [/wholesale/, 6], [/retail/, 7], [/real estate/, 8], [/manufactur/, 9], [/finance|insurance/, 10]];
  const hit = ACT.find(([r]) => r.test(a));
  if (hit) put.check(P + `c1_6[${hit[1]}]`); else if (a) { put.check(P + "c1_6[11]"); put.text(P + "f1_37[0]", v.l16.replace(/^other\s*[:(-]?\s*/i, "")); }
  if (v.l18) { if (yes(v.l18)) put.check(P + "c1_7[0]"); else if (no(v.l18)) put.check(P + "c1_7[1]"); }
}

/** CBP Form 5106 (06/26): blocks 1 to 3, by the form's own field names. */
function cbp5106(v: Record<string, string>, put: Put) {
  const P0 = "topmostSubform[0].#subform[0].", P1 = "topmostSubform[0].#subform[1].";
  put.check(P0 + "ActionType[1]");   // notification of identification number
  if (v.c1a) put.text(P0 + "Importer[0]", v.c1a);
  const t = norm(v.c1b ?? "");
  if (t.includes("request")) put.check(P0 + "CBPReq[0]");
  else if (t.includes("ein") || v.c1bn) { put.check(P0 + "CheckIRS[0]"); if (v.c1bn && /^\d{2}-?\d{7}$/.test(v.c1bn.trim())) put.text(P0 + "IRS[0]", v.c1bn.trim()); }
  if (v.c1d) { put.check(P0 + "ONE_C[0]"); put.text(P0 + "DIVName[0]", v.c1d); }
  const co: Record<string, string> = { corporation: "Company[4]", partnership: "Company[0]", llc: "Company[1]", "sole proprietorship": "Company[2]" };
  const c = co[norm(v.c1g ?? "")]; if (c) put.check(P0 + c);
  const en: Record<string, string> = { "1-4 per year": "Entries[0]", "5-24 per year": "Entries[1]", "25 or more per year": "Entries[2]" };
  const n = en[norm(v.c1h ?? "")]; if (n) put.check(P0 + n);
  if (/importer/i.test(v.c1i ?? "")) put.check(P0 + "Utilized[4]");
  if (/consignee/i.test(v.c1i ?? "")) put.check(P0 + "Utilized[0]");
  const T0: Record<string, string> = { c2a1: "Address[0]", c2acity: "City[0]", c2ast: "State[0]", c2azip: "Zip[0]", c2aiso: "CountryISOCode[0]" };
  for (const [k, f] of Object.entries(T0)) if (v[k]) put.text(P0 + f, k === "c2a1" ? v[k].slice(0, 32) : k === "c2ast" ? v[k].slice(0, 2).toUpperCase() : v[k]);
  const ty: Record<string, string> = { "corporate office": "TypeofResidence[1]", warehouse: "TypeofResidence[2]", "retail location": "TypeofResidence[7]", "office building": "TypeofResidence[3]", "business service center": "TypeofResidence[4]" };
  const r = ty[norm(v.c2atype ?? "")]; if (r) put.check(P0 + r);
  const T1: Record<string, string> = { c2c: "PhoneNumber[0]", c2e: "Email[0]", c2f: "Website[0]", c3a: "BusinessDescription[0]", c3b: "NAICSCode[0]", c3c: "DUNSNumber[0]", c3e: "Year[0]", c3jpos: "CompanyPosition[1]", c3jlast: "Name[6]", c3jfirst: "Name[5]", c3jphone: "DirectPhoneNumber[1]", c3jmail: "DirectEmail[1]" };
  for (const [k, f] of Object.entries(T1)) if (v[k]) put.text(P1 + f, k === "c3b" ? v[k].replace(/\D/g, "").slice(0, 6) : k === "c3e" ? v[k].replace(/\D/g, "").slice(0, 4) : k === "c3jlast" || k === "c3jfirst" ? v[k].slice(0, 25) : v[k]);
}

const PDFS: Record<string, () => Promise<string>> = {
  ss4: () => import("./pdf/irs-fss4.pdf?inline").then(m => m.default as string),
  cbp5106: () => import("./pdf/cbp-5106.pdf?inline").then(m => m.default as string),
};
const FILL = { ss4, cbp5106 };

/** The values by form field id: the application's fields carry the form's field ids. */
export const valuesOf = (fields: Field[]) => Object.fromEntries(fields.filter(f => f.value).map(f => [f.id, f.value]));

/** The agency's own PDF with the answers written in. Returns null when Placetta can't fill this form itself. */
export async function fillOfficial(formId: string, fields: Field[]): Promise<Blob | null> {
  const form = formById(formId);
  if (!form?.fill) return null;
  const [{ PDFDocument }, dataUrl] = await Promise.all([import("pdf-lib"), PDFS[form.fill]()]);
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const doc = await PDFDocument.load(bytes);
  const pdf = doc.getForm();
  const put: Put = {
    text: (name, v) => { try { pdf.getTextField(name).setText(v.replace(/[^\x20-\x7E -ÿ]/g, "")); } catch { /* a field this revision doesn't have */ } },
    check: name => { try { pdf.getCheckBox(name).check(); } catch { /* idem */ } },
  };
  FILL[form.fill](valuesOf(fields), put);
  const out = await doc.save();
  return new Blob([out as BlobPart], { type: "application/pdf" });
}
