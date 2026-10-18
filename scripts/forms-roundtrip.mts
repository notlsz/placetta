// Proof that every form Placetta fills comes out as the agency's own PDF with each answer on its line.
//   npm run test:forms                       every mapped form, two answer sets each
//   npm run test:forms -- tx-205 hou-co      only these
//   npm run test:forms -- --png <dir>        also keep each filled PDF and a picture of its pages (needs pdftoppm)
// For each form: realistic answers for every line (scripts/forms-samples.mts) go through the app's own fill code
// (fillMapped, or fillOfficial for the two forms filled by code); then the PDF is READ BACK, independently of the
// writer: pdf-lib's form values for fillable boxes, pdfjs-dist's text with positions for flat forms. It fails when an
// answer is missing or on the wrong spot, a box overflows, a checkbox isn't ticked, two lines write the same box, a
// line of the form has no place and no reason, or an SSN or ITIN reaches the page.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PDFDocument, PDFName, StandardFonts, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList, type PDFFont } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { FORMS } from "../src/forms/registry.ts";
import { MAPS } from "../src/forms/maps/index.ts";
import { fillMapped, fillOfficial, valuesOf } from "../src/forms/fill.ts";
import { layout, pdfLibWriter, writeAnswers, type FormMap, type Spot, type Writer } from "../src/forms/boxes.ts";
import { addressProblems } from "../src/forms/addressCheck.ts";
import type { Field } from "../src/model.ts";
import { sample, secretLine, type Pass } from "./forms-samples.mts";

const argv = process.argv.slice(2);
const pngDir = argv.includes("--png") ? argv[argv.indexOf("--png") + 1] : "";
const only = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--png");
const SECRET_NAME = /\bssn\b|social.?sec|\bitin\b|taxpayer.?id(entification)? ?num/i;

type Call =
  | { kind: "text"; id: string; name: string; value: string }
  | { kind: "check"; id: string; name: string }
  | { kind: "radio"; id: string; name: string; value: string }
  | { kind: "choice"; id: string; name: string; value: string }
  | { kind: "draw"; id: string; at: Spot; value: string };

/** What the map writes for these answers: the same steps as fillMapped, on a scratch copy, one line at a time so each
 *  write is known by its line. */
async function record(bytes: Uint8Array, map: FormMap, fields: Field[]) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const w = pdfLibWriter(doc.getForm(), doc, font);
  const values = valuesOf(fields);
  const rejected = addressProblems(map.form, values).map(p => p.field);
  for (const f of rejected) delete values[f];
  const calls: Call[] = [];
  const tag = (id: string): Writer => ({
    draw: (at, v) => { const ok = w.draw!(at, v); if (ok) calls.push({ kind: "draw", id, at, value: v }); return ok; },
    text: (name, v) => { const ok = w.text(name, v); if (ok) calls.push({ kind: "text", id, name, value: v }); return ok; },
    check: name => { const ok = w.check(name); if (ok) calls.push({ kind: "check", id, name }); return ok; },
    radio: (name, v) => { const ok = w.radio(name, v); if (ok) calls.push({ kind: "radio", id, name, value: v }); return ok; },
    choice: (name, v) => { const ok = w.choice(name, v); if (ok) calls.push({ kind: "choice", id, name, value: v }); return ok; },
  });
  const filled = new Set<string>();
  writeAnswers({ ...map, boxes: {} }, values, tag("(fixed)"));
  for (const id of Object.keys(map.boxes)) for (const x of writeAnswers({ ...map, fixed: [], boxes: { [id]: map.boxes[id] } }, values, tag(id))) filled.add(x);
  return { calls, filled, values, rejected, font };
}

type Item = { str: string; x: number; y: number; w: number; h: number };
async function textItems(bytes: Uint8Array): Promise<{ items: Item[][]; boxes: number[][] }> {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, disableFontFace: true, useSystemFonts: false, isEvalSupported: false });
  const doc = await task.promise;
  const items: Item[][] = [], boxes: number[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items.push((tc.items as any[]).filter(i => typeof i.str === "string" && i.str.trim()).map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.hypot(i.transform[2], i.transform[3]) || i.height })));
    boxes.push(page.view);
  }
  await task.destroy();
  return { items, boxes };
}

const helvetica = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
const widthOf = (font: PDFFont) => (s: string, size: number) => font.widthOfTextAtSize(s, size);
const overlap = (a: number[], b: number[]) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const area = (a: number[]) => (a[2] - a[0]) * (a[3] - a[1]);
const glyphWidth = new Map<string, number>();
function measure(s: string): number {
  let w = 0;
  for (const ch of s) {
    if (!glyphWidth.has(ch)) { let x = 0.6; try { x = helvetica.widthOfTextAtSize(ch, 1); } catch { /* a symbol Helvetica lacks */ } glyphWidth.set(ch, x); }
    w += glyphWidth.get(ch)!;
  }
  return w || 1;
}
/** The printed words of a text run, each with its own box: "Owner Name______" is a label then a blank line, and an
 *  answer belongs on the blank, not on the label. Very large text (a "PROOF" watermark) is left out. */
function words(i: Item): { box: number[]; glyph: boolean; str: string }[] {
  if (i.h > 30 || !i.str.length) return [];
  const out: { box: number[]; glyph: boolean; str: string }[] = [];
  const re = /[^\s_.·…\-–—|]+/g;
  // where each word starts along the run, by Helvetica widths (close enough to the form's own font to tell words apart)
  const total = measure(i.str);
  for (let m; (m = re.exec(i.str));) {
    const a = i.x + (i.w * measure(i.str.slice(0, m.index))) / total, b = i.x + (i.w * measure(i.str.slice(0, m.index + m[0].length))) / total;
    out.push({ box: [a, i.y - 0.2 * i.h, b, i.y + 0.7 * i.h], glyph: !/[A-Za-z0-9]/.test(m[0]), str: m[0] });
  }
  return out;
}

/** Wraps text the way pdf-lib lays out a multi-line box, to tell whether it fits. */
function rows(text: string, w: number, size: number): number {
  let n = 0;
  for (const para of text.split(/\n/)) {
    let row = "";
    for (const word of para.split(/\s+/).filter(Boolean)) { const next = row ? `${row} ${word}` : word; if (row && helvetica.widthOfTextAtSize(next, size) > w) { n++; row = word; } else row = next; }
    n++;
  }
  return n;
}

type Result = { id: string; kind: string; lines: number; mapped: number; unmapped: number; writes: number; fails: string[] };
const results: Result[] = [];

async function checkMapped(id: string, map: FormMap) {
  const form = FORMS.find(f => f.id === id);
  const res: Result = { id, kind: "", lines: form?.fields.length ?? 0, mapped: 0, unmapped: 0, writes: 0, fails: [] };
  results.push(res);
  const fail = (m: string) => res.fails.push(m);
  if (!form) { fail("not in the registry"); return; }
  const path = `public/forms/${map.pdf}`;
  if (!existsSync(path)) { fail(`no PDF at ${path}`); return; }
  const bytes = new Uint8Array(readFileSync(path));
  // every line of the form has a place on the PDF, or a reason it has none
  for (const f of form.fields) {
    const has = !!map.boxes[f.id], why = map.unmapped?.[f.id];
    if (has && why) fail(`line ${f.id} is both mapped and marked unmapped`);
    else if (has) res.mapped++;
    else if (why) res.unmapped++;
    else fail(`line ${f.id} (${f.label.en.slice(0, 50)}) has no place on the PDF and no reason`);
  }
  for (const k of Object.keys(map.boxes)) if (!form.fields.some(f => f.id === k)) fail(`map writes "${k}", which is not a line of the form`);
  for (const k of Object.keys(map.unmapped ?? {})) if (!form.fields.some(f => f.id === k)) fail(`unmapped "${k}" is not a line of the form`);
  for (const k of Object.keys(map.blank ?? {})) if (!map.boxes[k]) fail(`blank "${k}" is not a mapped line`);
  const blank = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const acro = blank.getForm().getFields().length > 0;
  const printed = await textItems(bytes);
  res.kind = acro ? (Object.values(map.boxes).flat().some(b => "at" in b || "mark" in b) ? "fillable + printed" : "fillable") : "printed";

  for (const pass of ["a", "b"] as Pass[]) {
    const fields: Field[] = form.fields.map(f => ({ id: f.id, label: f.label, value: sample(form, f, pass) }));
    const P = (m: string) => fail(`[${pass}] ${m}`);
    const rec = await record(bytes, map, fields);
    for (const r of rec.rejected) P(`sample answer for ${r} broke the form's address rule (fix the sample)`);
    const { pdf, filled } = await fillMapped(bytes, map, fields);
    res.writes += rec.calls.length;
    // the app's fill and the recorded steps agree on which lines went in
    for (const f of form.fields) {
      const v = rec.values[f.id];
      if (secretLine(f) && filled.has(f.id)) P(`${f.id} is an SSN/ITIN line and was written`);
      if (!v || !map.boxes[f.id] || secretLine(f)) continue;
      const quiet = map.blank?.[f.id] && new RegExp(map.blank[f.id], "i").test(v.trim());
      if (!filled.has(f.id) && !quiet) P(`${f.id} answered "${v.slice(0, 40)}" but nothing was written`);
      if (filled.has(f.id) && quiet) P(`${f.id} answered "${v.slice(0, 40)}", which the map says leaves the line blank, but something was written`);
    }
    const out = await PDFDocument.load(pdf, { ignoreEncryption: true });
    const of = out.getForm();
    // the same box written by two different lines
    const owner = new Map<string, { id: string; value: string }>();
    // (two lines ticking the same checkbox agree, so only boxes that take words count)
    for (const c of rec.calls) if (c.kind === "text" || c.kind === "choice" || c.kind === "radio") {
      const o = owner.get(c.name);
      if (o && o.id !== c.id && c.id !== "(fixed)" && o.id !== "(fixed)" && o.value !== c.value) P(`box ${c.name} gets "${o.value.slice(0, 20)}" from ${o.id} and "${c.value.slice(0, 20)}" from ${c.id}`);
      owner.set(c.name, { id: c.id, value: c.value });
    }
    const last = new Map<string, Call>();
    for (const c of rec.calls) if (c.kind === "text") last.set(c.name, c);
    for (const c of rec.calls) {
      if (c.kind === "text") {
        if (last.get(c.name) !== c) continue;
        const f = of.getFieldMaybe(c.name);
        if (!(f instanceof PDFTextField)) { P(`${c.id}: box ${c.name} missing from the filled PDF`); continue; }
        const max = f.getMaxLength();
        const want = max ? c.value.slice(0, max) : c.value, got = f.getText() ?? "";
        if (got !== want) { P(`${c.id}: box ${c.name} reads "${got.slice(0, 40)}", expected "${want.slice(0, 40)}"`); continue; }
        const wd = f.acroField.getWidgets()[0];
        if (!wd) { P(`${c.id}: box ${c.name} has no place on a page`); continue; }
        const r = wd.getRectangle();
        const size = Number(/(\d+(?:\.\d+)?)\s+Tf/.exec(String(f.acroField.getDefaultAppearance() ?? ""))?.[1] ?? 0);
        if (f.isCombed()) { if (max && got.length > max) P(`${c.id}: ${got.length} characters in ${max} boxes`); }
        else if (f.isMultiline()) { if (size && rows(got, r.width - 4, size) * size * 1.11 > r.height + 1) P(`${c.id}: "${got.slice(0, 30)}…" overflows its ${Math.round(r.width)}x${Math.round(r.height)} box at ${size}pt`); }
        else if (size && helvetica.widthOfTextAtSize(got, size) > r.width - 2 + 0.5) P(`${c.id}: "${got.slice(0, 40)}" (${Math.round(helvetica.widthOfTextAtSize(got, size))}pt at ${size}pt) overflows box ${c.name} (${Math.round(r.width)}pt)`);
        if (size && size < 5.5) P(`${c.id}: box ${c.name} printed at ${size}pt, too small to read`);
      } else if (c.kind === "check") {
        const f = of.getFieldMaybe(c.name);
        if (!(f instanceof PDFCheckBox) || !f.isChecked()) P(`${c.id}: checkbox ${c.name} not ticked`);
      } else if (c.kind === "radio") {
        const f = of.getFieldMaybe(c.name);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = f instanceof PDFRadioGroup || f instanceof PDFCheckBox ? (f.acroField.dict.lookup(PDFName.of("V")) as any)?.decodeText?.() : undefined;
        const got = f instanceof PDFRadioGroup && f.getSelected() === c.value ? c.value : raw;
        if (got !== c.value) P(`${c.id}: ${c.name} set to "${got}", not "${c.value}"`);
      } else if (c.kind === "choice") {
        const f = of.getFieldMaybe(c.name);
        if (!(f instanceof PDFDropdown || f instanceof PDFOptionList) || !f.getSelected().some(s => s.toLowerCase().startsWith(c.value.toLowerCase().slice(0, 4)))) P(`${c.id}: dropdown ${c.name} not set to ${c.value}`);
      }
    }
    // printed answers: read the page text back with positions
    const draws = rec.calls.filter((c): c is Extract<Call, { kind: "draw" }> => c.kind === "draw");
    if (draws.length) {
      const got = await textItems(pdf);
      const mine: { id: string; box: number[]; page: number }[] = [];
      for (const c of draws) {
        const pieces = layout(c.at, c.value, widthOf(rec.font));
        if (c.at.comb && c.value.replace(/\s+/g, "").length > c.at.comb) P(`${c.id}: "${c.value}" has more characters than its ${c.at.comb} boxes`);
        if ((c.at.lines ?? 1) > 1 && pieces.length > c.at.lines!) P(`${c.id}: "${c.value.slice(0, 30)}…" needs ${pieces.length} lines, the form has ${c.at.lines}`);
        for (const p of pieces) {
          const items = got.items[p.page] ?? [];
          const hit = items.find(i => i.str.trim() === p.text.trim() && Math.abs(i.x - p.x) < 1.5 && Math.abs(i.y - p.y) < 1.5);
          if (!hit) { P(`${c.id}: "${p.text.slice(0, 40)}" not found on page ${p.page + 1} at (${Math.round(p.x)}, ${Math.round(p.y)})`); continue; }
          const pw = rec.font.widthOfTextAtSize(p.text, p.size);
          if (c.at.w && !c.at.comb && pw > c.at.w + 0.5) P(`${c.id}: "${p.text.slice(0, 40)}" is ${Math.round(pw)}pt wide at ${p.size}pt, its line is ${Math.round(c.at.w)}pt`);
          if (p.size < 5.5) P(`${c.id}: printed at ${p.size}pt, too small to read`);
          const box = [p.x, p.y - 0.2 * p.size, p.x + pw, p.y + 0.7 * p.size];
          const view = got.boxes[p.page];
          if (box[0] < view[0] || box[2] > view[2] || box[1] < view[1] || box[3] > view[3]) P(`${c.id}: "${p.text.slice(0, 30)}" runs off page ${p.page + 1}`);
          // printed on top of the form's own words: a sign the spot is wrong
          const isMark = c.value === "X" && p.text === "X";
          hits: for (const i of printed.items[p.page] ?? []) {
            for (const wd of words(i)) {
              if (isMark && wd.glyph) continue;   // an X in a printed box is where it belongs
              const o = overlap(box, wd.box);
              if (o > 3 && o > 0.2 * Math.min(area(box), area(wd.box))) { P(`${c.id}: "${p.text.slice(0, 30)}" covers the printed "${wd.str.slice(0, 30)}" on page ${p.page + 1}`); break hits; }
            }
          }
          for (const m of mine) if (m.page === p.page && m.id !== c.id && overlap(m.box, box) > 2) { P(`${c.id} and ${m.id} print on top of each other on page ${p.page + 1}`); break; }
          mine.push({ id: c.id, box, page: p.page });
        }
      }
    }
    // nothing private on the page: no SSN or ITIN box is ever filled
    for (const f of of.getFields()) {
      if (!(f instanceof PDFTextField)) continue;
      const tu = f.acroField.dict.lookup(PDFName.of("TU"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tip = tu && "decodeText" in tu ? String((tu as any).decodeText()) : "";
      // a word the form asks for there ("Foreign", "Applied for") is fine; a number is not
      if (SECRET_NAME.test(`${f.getName()} ${tip}`) && !/\bein\b|employer/i.test(tip) && /\d/.test(f.getText() ?? "")) P(`SSN/ITIN box ${f.getName()} has "${f.getText()}"`);
    }
    const allText = [...of.getFields().map(f => (f instanceof PDFTextField ? f.getText() ?? "" : "")), ...(await textItems(pdf)).items.flat().map(i => i.str)].join(" ");
    if (/\b123-45-6789\b|\b123456789\b/.test(allText)) P("the test SSN 123-45-6789 reached the PDF");
    if (pngDir && pass === "a") keep(id, pdf);
  }
}

/** The two forms filled by code (fill.ts): IRS SS-4 and CBP 5106. Which box each line lands in is listed here by
 *  hand, from the printed form; "" means the box must stay empty. */
type Spec = { lines: string[]; expect: (pass: Pass, v: Record<string, string>) => Record<string, string>; checks: (pass: Pass) => string[] };
const CODE: Record<string, Spec> = {
  "irs-ss4": {
    lines: ["l1", "l2", "l4a", "l4b", "l5a", "l5b", "l6", "l7a", "l7b", "l8a", "l8b", "l8c", "l9a", "l9b", "l10", "l11", "l12", "l13", "l15", "l16", "l17", "l18", "sign", "phone"],
    // pass a: a foreign-owned single-member LLC (8a yes, 8c yes, 9a Other), 7b "Foreign", food service (16), never had
    // an EIN (18 no); pass b: a corporation (8a no, 9a Corporation, Form 1120), retail (16), and an SSN on 7b
    expect: (pass, v) => ({
      f1_2: v.l1, f1_3: v.l2, "Line4ReadOrder[0].f1_5": v.l4a, "Line4ReadOrder[0].f1_6": v.l4b, f1_7: v.l5a, f1_8: v.l5b, f1_9: v.l6, f1_10: v.l7a,
      // line 10 breaks at a space: "Tea shop" beside "(specify type)", the rest on the line below
      f1_11: pass === "a" ? "Foreign" : "", f1_12: v.l8b, f1_21: v.l9b, f1_25: "Tea shop", f1_26: "serving milk tea and pastries",
      f1_19: pass === "a" ? "Foreign-owned U.S. disregarded entity" : "", f1_16: pass === "b" ? "1120" : "",
      f1_31: v.l11, f1_32: v.l12, f1_35: v.l13, f1_36: v.l15, f1_38: v.l17, f1_44: v.sign, f1_45: v.phone,
    }),
    checks: pass => pass === "a" ? ["c1_1[0]", "c1_2[0]", "c1_3[15]", "c1_4[0]", "c1_6[5]", "c1_7[1]"] : ["c1_1[1]", "c1_2[1]", "c1_3[4]", "c1_4[0]", "c1_6[7]", "c1_7[1]"],
  },
  "cbp-5106": {
    lines: ["c1a", "c1b", "c1bn", "c1d", "c1g", "c1h", "c1i", "c2a1", "c2acity", "c2ast", "c2azip", "c2aiso", "c2atype", "c2c", "c2e", "c2f", "c3a", "c3b", "c3c", "c3e", "c3jpos", "c3jlast", "c3jfirst", "c3jphone", "c3jmail"],
    // pass a: an EIN (1B), a corporation importing 1 to 4 times a year as importer of record; pass b: asking CBP for a
    // number, a sole proprietorship, 25 or more entries, as consignee
    expect: (pass, v) => ({
      "#subform[0].Importer": v.c1a, "#subform[0].IRS": pass === "a" ? v.c1bn : "", "#subform[0].DIVName": v.c1d, "#subform[0].Address": v.c2a1.slice(0, 32), "#subform[0].City": v.c2acity,
      "#subform[0].State": v.c2ast.slice(0, 2).toUpperCase(), "#subform[0].Zip": v.c2azip, "#subform[0].CountryISOCode": v.c2aiso,
      "#subform[1].PhoneNumber": v.c2c, "#subform[1].Email": v.c2e, "#subform[1].Website": v.c2f, "#subform[1].BusinessDescription": v.c3a, "#subform[1].NAICSCode": v.c3b.replace(/\D/g, "").slice(0, 6),
      "#subform[1].DUNSNumber": v.c3c, "#subform[1].Year": v.c3e.replace(/\D/g, "").slice(0, 4), "#subform[1].CompanyPosition[1]": v.c3jpos, "#subform[1].Name[6]": v.c3jlast.slice(0, 25),
      "#subform[1].Name[5]": v.c3jfirst.slice(0, 25), "#subform[1].DirectPhoneNumber[1]": v.c3jphone, "#subform[1].DirectEmail[1]": v.c3jmail,
    }),
    checks: pass => pass === "a" ? ["#subform[0].ActionType[1]", "#subform[0].CheckIRS", "#subform[0].ONE_C", "#subform[0].Company[4]", "#subform[0].Entries[0]", "#subform[0].Utilized[4]", "#subform[0].TypeofResidence[1]"] : ["#subform[0].ActionType[1]", "#subform[0].CBPReq", "#subform[0].ONE_C", "#subform[0].Company[2]", "#subform[0].Entries[2]", "#subform[0].Utilized[0]", "#subform[0].TypeofResidence[4]"],
  },
};
const full = (id: string, n: string) => (id === "irs-ss4" ? "topmostSubform[0].Page1[0]." : "topmostSubform[0].") + (/\[\d+\]$/.test(n) ? n : n + "[0]");

async function checkCode(id: string) {
  const form = FORMS.find(f => f.id === id)!;
  const spec = CODE[id];
  const res: Result = { id, kind: "fillable (by code)", lines: form.fields.length, mapped: 0, unmapped: 0, writes: 0, fails: [] };
  results.push(res);
  for (const f of form.fields) { if (spec.lines.includes(f.id)) res.mapped++; else res.fails.push(`line ${f.id} has no box in the code fill`); }
  for (const pass of ["a", "b"] as Pass[]) {
    const P = (m: string) => res.fails.push(`[${pass}] ${m}`);
    const fields: Field[] = form.fields.map(f => ({ id: f.id, label: f.label, value: sample(form, f, pass) }));
    const blob = await fillOfficial(id, fields);
    if (!blob) { P("fillOfficial returned nothing"); continue; }
    const pdf = new Uint8Array(await blob.arrayBuffer());
    const of = (await PDFDocument.load(pdf)).getForm();
    const v = Object.fromEntries(fields.map(f => [f.id, f.value]));
    for (const [box, want] of Object.entries(spec.expect(pass, v))) {
      const f = of.getFieldMaybe(full(id, box));
      if (!(f instanceof PDFTextField)) { P(`box ${box} not found`); continue; }
      const got = f.getText() ?? "";
      if (got !== want) { P(`box ${box} reads "${got.slice(0, 40)}", expected "${want.slice(0, 40)}"`); continue; }
      if (!want) continue;
      res.writes++;
      const r = f.acroField.getWidgets()[0]?.getRectangle();
      const size = Number(/(\d+(?:\.\d+)?)\s+Tf/.exec(String(f.acroField.getDefaultAppearance() ?? ""))?.[1] ?? 0) || 9;
      if (r && !f.isMultiline() && !f.isCombed() && helvetica.widthOfTextAtSize(got, size) > r.width + 2) P(`"${got.slice(0, 40)}" overflows box ${box} at ${size}pt`);
    }
    for (const box of spec.checks(pass)) { const f = of.getFieldMaybe(full(id, box)); if (!(f instanceof PDFCheckBox) || !f.isChecked()) P(`checkbox ${box} not ticked`); else res.writes++; }
    const allText = of.getFields().map(f => (f instanceof PDFTextField ? f.getText() ?? "" : "")).join(" ");
    if (/\b123-45-6789\b|\b123456789\b/.test(allText)) P("the test SSN 123-45-6789 reached the PDF");
    if (pngDir && pass === "a") keep(id, pdf);
  }
}

function keep(id: string, pdf: Uint8Array) {
  mkdirSync(pngDir, { recursive: true });
  writeFileSync(`${pngDir}/${id}.pdf`, pdf);
  try { execFileSync("pdftoppm", ["-png", "-r", "80", `${pngDir}/${id}.pdf`, `${pngDir}/${id}`], { stdio: "ignore" }); }
  catch { console.log(`(no pdftoppm: ${id} kept as PDF only)`); }
}

const ids = [...Object.keys(CODE), ...Object.keys(MAPS).sort()].filter(id => !only.length || only.includes(id));
for (const id of ids) {
  try { if (CODE[id]) await checkCode(id); else await checkMapped(id, MAPS[id]); }
  catch (e) {
    const fail = `crashed: ${String((e as Error)?.stack ?? e).slice(0, 300)}`;
    const r = results.find(x => x.id === id);
    if (r) r.fails.push(fail); else results.push({ id, kind: "?", lines: 0, mapped: 0, unmapped: 0, writes: 0, fails: [fail] });
  }
}
let bad = 0;
for (const r of results) {
  const ok = !r.fails.length;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${r.id.padEnd(26)} ${r.kind.padEnd(19)} lines ${String(r.lines).padStart(2)}  mapped ${String(r.mapped).padStart(2)}  no place ${String(r.unmapped).padStart(2)}  writes checked ${r.writes}`);
  for (const f of r.fails.slice(0, 25)) console.log(`       ${f}`);
  if (r.fails.length > 25) console.log(`       … and ${r.fails.length - 25} more`);
}
console.log(`\n${results.length - bad} of ${results.length} forms filled and read back correctly${pngDir ? `; filled PDFs and pages in ${pngDir}` : ""}`);
if (bad) process.exitCode = 1;
