import { addressProblems } from "./addressCheck";
import type { Field } from "../model";
import { formById } from "./registry";
import { MAPS } from "./maps";
import { pdfLibWriter, writeAnswers, type FormMap, type Spot, type Writer } from "./boxes";
import { BY_HAND } from "../guard";

/* Fills the official PDF itself: the agency's own form, downloaded from the agency (federal forms are public domain),
   with each answer written into the form's own field for that line. Nothing private goes in: SSNs, ITINs and passport
   numbers stay blank for the signer to write by hand. The PDF and pdf-lib load only when a form is filled.
   Every fill also keeps what it wrote on which line, so the filled copy can be read back and checked against the
   answers (./readback.ts). The app, the server (agent-run, through the agent's bundle) and the tests run this same code. */

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
  // the type goes on the short blank beside the box (about 11 characters at its size, whole words) and runs on to the
  // line below; it used to be cut at 18 characters, which ran past the blank ("Started a new m" showed, "ilk" didn't)
  if (v.l10) {
    put.check(P + "c1_4[0]");
    const words = v.l10.trim().split(/\s+/);
    let first = "";
    while (words.length && (first ? first + " " + words[0] : words[0]).length <= 11) first = first ? first + " " + words.shift() : words.shift()!;
    if (first) put.text(P + "f1_25[0]", first);
    if (words.length) put.text(P + "f1_26[0]", words.join(" "));
  }
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

const FILL = { ss4, cbp5106 };
/** The lines a code-filled form reads (by field id), and the answers it cuts to fit a box (the rest doesn't show). */
const CODE_LINES: Record<keyof typeof FILL, string[]> = {
  ss4: ["l1", "l2", "l4a", "l4b", "l5a", "l5b", "l6", "l7a", "l7b", "l8a", "l8b", "l8c", "l9a", "l9b", "l10", "l11", "l12", "l13", "l15", "l16", "l17", "l18", "sign", "phone"],
  cbp5106: ["c1a", "c1b", "c1bn", "c1d", "c1g", "c1h", "c1i", "c2a1", "c2acity", "c2ast", "c2azip", "c2aiso", "c2atype", "c2c", "c2e", "c2f", "c3a", "c3b", "c3c", "c3e", "c3jpos", "c3jlast", "c3jfirst", "c3jphone", "c3jmail"],
};
export const CODE_ROOM: Record<string, Record<string, number>> = { cbp5106: { c2a1: 32, c3jlast: 25, c3jfirst: 25 } };

/** "By hand": the line is answered, and the signer writes it on the printed copy (src/guard.ts, where the check before
 *  approval reads it too). It counts as filled, and nothing is printed in that box. */
export { BY_HAND };
/** The values by form field id: the application's fields carry the form's field ids. */
// a value shown masked ("••-•••4471") is never written: the form would get the dots' leftovers, not the number
const MASKED = /[•●*]{2,}/;
export const valuesOf = (fields: Field[]) => Object.fromEntries(fields.filter(f => f.value && !BY_HAND.test(f.value.trim()) && !MASKED.test(f.value)).map(f => [f.id, f.value]));

/** Placetta writes the answers into this form's own PDF (the agency's file, never a Placetta copy). */
export const fillable = (formId: string) => !!formById(formId)?.fill || !!MAPS[formId];

/** A line with set choices (Yes/No, a box to tick): the answer as the form will take it, or null when no box on the
 *  form takes it. Decided the way the fill decides (each box's own `if` on the form's map), with an answer that starts
 *  with a choice ("No, it's an LLC") taken as that choice. A line with no choices, or not on a map, takes anything. */
export function asChoice(formId: string, lineId: string, value: string): string | null {
  const line = formById(formId)?.fields.find(f => f.id === lineId);
  const options = line?.options ?? [];
  const boxes = MAPS[formId]?.boxes[lineId];
  // only a form filled by its map decides box by box; the two filled by code (the SS-4, CBP 5106) take free text on
  // their "Other" lines, and a form Placetta doesn't fill takes whatever the person writes
  if (!options.length || !boxes?.length) return value;
  // a listed choice is always an answer, even one that ticks nothing ("Neither")
  const exact = options.find(c => c.toLowerCase() === value.trim().toLowerCase());
  if (exact) return exact === value ? value : exact;
  // a line whose choices don't include this business ("Non-Food Facility Type: laundry or pet shop" for a restaurant,
  // a patio line with no "no patio" box): the line's own negative choice when it has one, else "Not applicable", which
  // ticks nothing and reads back as answered (src/forms/readback.ts). Production probe, 2026-10-30.
  if (/^(n\/?a|not applicable|none|does not apply|不适用|无)\.?$/i.test(value.trim())) {
    const neg = options.find(c => /^(no|none|neither|not applicable|n\/a)\b/i.test(c));
    return neg ?? "Not applicable";
  }
  const takes = (v: string) => boxes.some(b => !("if" in b) || !b.if || new RegExp(b.if, "i").test(v.trim()));
  if (takes(value)) return value;
  const low = value.trim().toLowerCase();
  const lead = options.find(c => low.startsWith(c.toLowerCase()) && !/[a-z0-9]/i.test(low.charAt(c.length)));
  return lead && takes(lead) ? lead : null;
}

/** Where the app keeps the agencies' PDFs: /app/forms/ in the app, ./forms/ next to the one-file preview. */
const FORMS_BASE = import.meta.env?.MODE === "single" ? "forms/" : `${import.meta.env?.BASE_URL ?? "/"}forms/`;

/* ------------------------------ which PDF, and where it comes from ------------------------------ */

/** The file a form fills: an agency's PDF under public/forms/ (the box maps), or one of the two kept with this code
 *  ("pdf/…", the SS-4 and CBP 5106, filled by code above). null when Placetta doesn't fill this form itself. */
export function pdfFile(formId: string): string | null {
  const form = formById(formId);
  if (form?.fill) return form.fill === "ss4" ? "pdf/irs-fss4.pdf" : "pdf/cbp-5106.pdf";
  return MAPS[formId]?.pdf ?? null;
}
/** Gets an agency PDF's bytes by its file name (pdfFile). null when this place can't get it. */
export type LoadPdf = (file: string) => Promise<Uint8Array | null>;
const INLINE: Record<string, () => Promise<string>> = {
  "pdf/irs-fss4.pdf": () => import("./pdf/irs-fss4.pdf?inline").then(m => m.default as string),
  "pdf/cbp-5106.pdf": () => import("./pdf/cbp-5106.pdf?inline").then(m => m.default as string),
};
const fromDataUrl = (dataUrl: string) => {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};
/** The app's own way to the PDFs: the two kept with the code come inside the app (and inside the server's bundle,
 *  scripts/build-agent.mjs); the rest from /app/forms/. */
export const appPdf: LoadPdf = async file => {
  if (INLINE[file]) return fromDataUrl(await INLINE[file]());
  const res = await fetch(FORMS_BASE + file);
  if (!res.ok) throw new Error(`The official form ${file} didn't load (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
};
/** The caller's own way first (the server fetches the site's /app/forms/, a test reads the disk), then the app's. */
export const loaderWith = (own?: LoadPdf): LoadPdf => (own ? async file => (await own(file).catch(() => null)) ?? appPdf(file) : appPdf);

/* ------------------------------ what each line writes ------------------------------ */

/** One thing a fill wrote on the form, with the line (field id) it came from (null: written every time, like the
 *  "new registration" box), and whether the PDF had that box (ok). The read-back checks each one (./readback.ts). */
export type Wrote = (
  | { kind: "text"; name: string; v: string }
  | { kind: "check"; name: string }
  | { kind: "radio"; name: string; v: string }
  | { kind: "choice"; name: string; v: string }
  | { kind: "draw"; at: Spot; v: string }
) & { id: string | null; ok?: boolean };
type Sink = Required<Pick<Writer, "text" | "check" | "radio" | "choice">> & { draw?: Writer["draw"] };

/** Runs a form's fill (its code, or its box map) into a sink. */
function runFill(formId: string, values: Record<string, string>, s: Sink): void {
  const form = formById(formId);
  if (form?.fill) {
    // the PDF's boxes take Latin-1: curly quotes and dashes become straight ones, anything else it can't print is left out
    const latin = (v: string) => v.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
    FILL[form.fill](values, { text: (n, v) => { s.text(n, latin(v)); }, check: n => { s.check(n); } });
    return;
  }
  const map = MAPS[formId];
  if (map) writeAnswers(map, values, s);
}
/** A sink that writes nothing (or passes through to the real one) and keeps a list of every write, in order. */
function recorder(out: Wrote[], inner?: Sink): Sink {
  const rec = (w: Wrote, ok: boolean) => { out.push({ ...w, ok }); return ok; };
  return {
    text: (name, v) => rec({ kind: "text", name, v, id: null }, inner ? inner.text(name, v) : true),
    check: name => rec({ kind: "check", name, id: null }, inner ? inner.check(name) : true),
    radio: (name, v) => rec({ kind: "radio", name, v, id: null }, inner ? inner.radio(name, v) : true),
    choice: (name, v) => rec({ kind: "choice", name, v, id: null }, inner ? inner.choice(name, v) : true),
    draw: (at, v) => rec({ kind: "draw", at, v, id: null }, inner ? !!inner.draw?.(at, v) : true),
  };
}
/** Every write a fill makes, each with the line it came from. Worked out without a PDF: fill once with every answer,
 *  then once without each answer in turn; the writes that go away were that answer's. Works the same for the code
 *  fills (SS-4, CBP 5106) and the box maps, whatever splits or picks a line uses. */
export function linesOf(formId: string, values: Record<string, string>): Wrote[] {
  const dry = (v: Record<string, string>) => { const out: Wrote[] = []; runFill(formId, v, recorder(out)); return out; };
  const all = dry(values);
  const key = (x: Wrote) => JSON.stringify({ ...x, id: null, ok: null });
  const owner: (string | null)[] = all.map(() => null);
  for (const id of Object.keys(values)) {
    const rest = { ...values };
    delete rest[id];
    const left = new Map<string, number>();
    for (const x of dry(rest)) left.set(key(x), (left.get(key(x)) ?? 0) + 1);
    all.forEach((x, i) => { const k = key(x), n = left.get(k) ?? 0; if (n) left.set(k, n - 1); else owner[i] ??= id; });
  }
  return all.map((x, i) => ({ ...x, id: owner[i] }));
}
/** The lines this form puts somewhere on its PDF (by field id). An answer to any other line isn't printed anywhere. */
export function placedLines(formId: string): Set<string> {
  const form = formById(formId);
  if (form?.fill) return new Set(CODE_LINES[form.fill]);
  return new Set(Object.keys(MAPS[formId]?.boxes ?? {}));
}

/* ------------------------------ the fill ------------------------------ */

/** A filled copy: the PDF, every write with its line, the answers it was filled from, and the answers kept off the
 *  form on purpose (an address the agency doesn't accept on that line: the app and Odelia say why). */
export type Filled = { pdf: Uint8Array; wrote: Wrote[]; values: Record<string, string>; skipped: string[] };

/** Fills the agency's own PDF with an application's answers. The one fill the app, the server, the checks and the tests
 *  all run. null when Placetta doesn't fill this form itself. */
export async function fillForm(formId: string, fields: Field[], load: LoadPdf = appPdf): Promise<Filled | null> {
  const file = pdfFile(formId);
  if (!file) return null;
  const bytes = await load(file);
  if (!bytes) throw new Error(`The official ${formById(formId)?.form ?? formId} PDF didn't load.`);
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const form = formById(formId), map = MAPS[formId];
  const values = valuesOf(fields), skipped: string[] = [];
  // an address the agency doesn't accept on its line never goes on the agency's form (the app and Odelia already say why)
  if (map && !form?.fill) for (const p of addressProblems(map.form, values)) { delete values[p.field]; skipped.push(p.field); }
  const tagged = linesOf(formId, values);
  const real: Wrote[] = [];
  let pdf: Uint8Array;
  if (form?.fill) {
    const doc = await PDFDocument.load(bytes);
    const f = doc.getForm();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    // the same writer as the mapped forms: a box this revision doesn't have is skipped, and a long answer shrinks to fit its box
    runFill(formId, values, recorder(real, pdfLibWriter(f, doc, font) as Sink));
    pdf = await doc.save();
  } else {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const f = doc.getForm();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    runFill(formId, values, recorder(real, pdfLibWriter(f, doc, font) as Sink));
    // XFA forms (the IRS's and Arizona's) would show their own empty copy in Acrobat; drop it so the filled boxes show.
    try { f.deleteXFA(); } catch { /* no XFA */ }
    try { f.updateFieldAppearances(); } catch { /* a box with an odd font keeps its own look */ }
    pdf = await doc.save();
  }
  // the dry run and the real one write the same things in the same order: the real one says which boxes the PDF had
  return { pdf, wrote: tagged.map((x, i) => ({ ...x, ok: real[i]?.ok ?? false })), values, skipped };
}

export async function fillMapped(bytes: Uint8Array, map: FormMap, fields: Field[]): Promise<{ pdf: Uint8Array; filled: Set<string> }> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // an address the agency doesn't accept on its line never goes on the agency's form (the app and Odelia already say why)
  const values = valuesOf(fields);
  for (const p of addressProblems(map.form, values)) delete values[p.field];
  const filled = writeAnswers(map, values, pdfLibWriter(form, doc, font));
  // XFA forms (the IRS's and Arizona's) would show their own empty copy in Acrobat; drop it so the filled boxes show.
  try { form.deleteXFA(); } catch { /* no XFA */ }
  try { form.updateFieldAppearances(); } catch { /* a box with an odd font keeps its own look */ }
  return { pdf: await doc.save(), filled };
}

/** The agency's own PDF with the answers written in. Returns null when Placetta can't fill this form itself. */
export async function fillOfficial(formId: string, fields: Field[], load: LoadPdf = appPdf): Promise<Blob | null> {
  const out = await fillForm(formId, fields, load);
  return out ? new Blob([out.pdf as BlobPart], { type: "application/pdf" }) : null;
}

/** Where a signature and its date go on the form's official PDF, when Placetta knows (the registry, or its box map). */
export const signSpotOf = (formId: string) => formById(formId)?.sign ?? MAPS[formId]?.sign;

/** Draw a signature image (PNG) on the form's signature line with today's date in its date box. One filing, one
    signature: callers never keep the image for another form. Returns the signed PDF, or null when the form has no spot. */
export async function stampSignature(pdfBytes: Uint8Array, png: Uint8Array, formId: string, today = new Date()): Promise<Uint8Array | null> {
  const spot = signSpotOf(formId);
  if (!spot) return null;
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPages()[spot.page];
  if (!page) return null;
  const img = await doc.embedPng(png);
  const scale = Math.min(spot.w / img.width, spot.h / img.height);
  const w = img.width * scale, h = img.height * scale;
  page.drawImage(img, { x: spot.x, y: spot.y + (spot.h - h) / 2, width: w, height: h });
  if (spot.date) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const d = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
    page.drawText(d, { x: spot.date.x, y: spot.date.y, size: spot.date.size, font, color: rgb(0, 0, 0) });
  }
  return await doc.save();
}
