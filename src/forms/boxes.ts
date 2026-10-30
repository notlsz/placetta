/* Where each answer goes on an agency's own PDF. One file per form in ./maps/<form id>.json, written by reading the
   form's fillable boxes (their names, tooltips and the printed words beside them) and checked by filling a test copy
   and looking at every page. Pure data plus a pure writer, so the app, the tests and the checks share one code path. */

/** How one answer is written into one box. */
export type Box =
  | { text: string; pick?: string; max?: number; upper?: boolean; value?: string; if?: string }   // a text box (value: fixed text, written when `if` matches)
  | { check: string; if?: string }                                                                // a checkbox, ticked when the answer matches `if` (always when absent)
  | { radio: string; value: string; if?: string }                                                  // a radio group set to its export value
  | { choice: string; if?: string; value?: string }                                               // a dropdown set to the answer (or `value`)
  // Forms with no fillable boxes (a flat scan or print-only PDF): the answer is printed at a spot on the page, in PDF
  // points from the bottom-left (page from 0). w: the line's width, so a long answer shrinks to fit; lines: how many
  // printed lines the answer may wrap onto (each `lead` points below the last); comb: the number of character boxes
  // across w, one character centred in each (EIN and ZIP boxes); mark: an "X" in a printed checkbox, when the answer
  // matches `if`.
  | { at: Spot; pick?: string; max?: number; upper?: boolean; value?: string; if?: string }
  | { mark: { page: number; x: number; y: number; size?: number }; if?: string };

/** Part of an answer: "123 Main St, Suite 4, San Jose, CA 95112" splits into street, city, state, zip. Picks chain with
    "|", left to right: "line2|head" is the name on the answer's second line, "line2|tail|zip" that line's ZIP code.
    statezip: "CA 95112". streetno, streetname: a street line split into its house number and the rest ("street|streetno").
    line1..line9: one line of a multi-line answer (one person or item per line). head: before the first comma or " - ";
    tail: after it. first/middle/last: parts of a person's name. mm/dd/yyyy/date: parts of a date (yy: the year's last two digits; last1: the last character, for a box after a printed part). phone: a US number as
    408-555-0142 (phone1, phone2, phone3: its three parts; phonelocal: 555-0142 after a printed area code), ein: an EIN
    as 12-3456789 (for boxes printed with the dashes in place). d1..d9: one digit of a number, for a form that prints
    each digit in its own box (the EIN and account numbers on Georgia's DOL-1N). */
export type Pick = "street" | "city" | "state" | "zip" | "country" | "citystatezip" | "statezip" | "streetno" | "streetname" | "first" | "last" | "middle" | "mi" | "digits" | "head" | "tail" | "mm" | "dd" | "yyyy" | "yy" | "last1" | "date" | "phone" | "ein" | "phone1" | "phone2" | "phone3" | "phonelocal" | "ein1" | "ein2" | "zip5" | "zip4" | `line${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | `d${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

/** One line of a form as printed on its PDF: what Placetta asks, in English and Chinese. */
export type MapLine = { id: string; line: string; en: string; zh: string; options?: string[]; hint?: { en: string; zh: string } };

export type FormMap = {
  form: string;          // our form id
  rev: string;           // the revision printed on the PDF this map was checked against
  pdf: string;           // file name under public/forms/
  url?: string;          // where the agency publishes this PDF (the library's official form link when it has none)
  checked: string;       // when the map was checked by filling a test copy
  /** The form's lines as printed on this PDF, in order. A library entry that lists fewer lines takes these. */
  lines?: MapLine[];
  boxes: Record<string, Box[]>;   // our field id -> the boxes it fills
  fixed?: Box[];         // boxes Placetta fills the same way every time (e.g. "new registration")
  /** Lines of the form with no place on this PDF, each with the reason (e.g. the agency asks it only on its portal). */
  unmapped?: Record<string, string>;
  /** Answers that leave a line blank on purpose, as a pattern per line (e.g. "^no$" where the form only has a box to
      tick for yes). The checks treat them as written. */
  blank?: Record<string, string>;
  sign?: { page: number; x: number; y: number; w: number; h: number; date?: { x: number; y: number; size: number } };   // the signature line (PDF points, page from 0)
  notes?: string;
};

export type Spot = { page: number; x: number; y: number; w?: number; size?: number; lines?: number; lead?: number; comb?: number };
/** One run of text as it lands on a flat form. */
export type Piece = { page: number; x: number; y: number; size: number; text: string };

/** Splits an answer into lines no wider than w (on spaces, and on its own line breaks). */
function wrap(v: string, w: number, width: (s: string) => number): string[] {
  const rows: string[] = [];
  for (const para of v.split(/\n/)) {
    let row = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = row ? `${row} ${word}` : word;
      if (!row || width(next) <= w) row = next;
      else { rows.push(row); row = word; }
    }
    if (row) rows.push(row);
  }
  return rows;
}

/** Where a flat answer is printed: one piece per line (wrapped onto at most `lines` lines, shrinking to fit), or one
 *  per character for comb boxes. The writer and the checks both use it, so they agree on what lands where. */
export function layout(at: Spot, v: string, width: (s: string, size: number) => number): Piece[] {
  const size0 = at.size ?? 9, page = at.page;
  if (at.comb && at.w) {
    const cell = at.w / at.comb;
    return [...v.replace(/\s+/g, "")].slice(0, at.comb).map((ch, i) => ({ page, x: at.x + i * cell + (cell - width(ch, size0)) / 2, y: at.y, size: size0, text: ch }));
  }
  if ((at.lines ?? 1) <= 1 || !at.w) {
    let size = size0;
    if (at.w) while (size > 5.5 && width(v, size) > at.w) size -= 0.5;
    return [{ page, x: at.x, y: at.y, size, text: v }];
  }
  let size = size0, rows = wrap(v, at.w, s => width(s, size));
  while (size > 5.5 && (rows.length > at.lines! || rows.some(r => width(r, size) > at.w!))) { size -= 0.5; rows = wrap(v, at.w, s => width(s, size)); }
  const lead = at.lead ?? size * 1.25;
  return rows.map((text, i) => ({ page, x: at.x, y: at.y - i * lead, size, text }));
}
export type Writer = {
  /** Print text at a spot (flat forms). Optional: a Writer without it skips flat boxes. */
  draw?: (at: Spot, v: string) => boolean;
  text: (name: string, v: string) => boolean;
  check: (name: string) => boolean;
  radio: (name: string, value: string) => boolean;
  choice: (name: string, value: string) => boolean;
};

// SSN or ITIN shapes are never written: the signer writes them by hand. Dashed ones anywhere; a bare 9-digit number only
// into a box that is itself for an SSN or ITIN (a bare 9-digit EIN or state file number is fine elsewhere).
const SECRET = /\b\d{3}-\d{2}-\d{4}\b|\b9\d{2} [5-9]\d \d{4}\b/;   // a bare 9-digit EIN (e.g. 934567890) is not an ITIN
const SECRET_BOX = /ssn|social.?sec|itin|taxpayer.?id/i;
// ...unless the box itself is named for the EIN (Form 2848's "TaxpayerIDEIN"), where a bare 9-digit EIN belongs
const EIN_BOX = /EIN(\[\d+\])?$|\bf?ein\b|employer/;
const NINE = /\b\d{9}\b/;
const STATES = /^(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY]|PR|GU|VI)$/i;

/** Splits a one-line address. US: "street, City, ST 12345". Abroad: "street, [district,] City, Province 518000, Country"
 *  (country is "USA" for a US address). Unknown shapes return the whole line as the street. */
export function address(v: string): { street: string; city: string; state: string; zip: string; country: string } {
  const us = usAddress(v);
  if (us.city) return { ...us, country: "USA" };
  const parts = v.split(/\s*[,\n]\s*/).filter(Boolean);
  if (parts.length >= 3 && /^[A-Za-z .'()-]+$/.test(parts[parts.length - 1]) && !/\d/.test(parts[parts.length - 1])) {
    const country = parts[parts.length - 1], rest = parts.slice(0, -1);
    // "Guangdong 518000", "ON M5V 2T6", "London SW1A 1AA": the postal code is the trailing token(s) with digits
    const pz = /^(.*?[^\d\s])\s+(\d[\d -]{2,8}\d|[A-Z]\d[A-Z] ?\d[A-Z]\d|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/i.exec(rest[rest.length - 1]) ?? /^()(\d[\d -]{2,8}\d)$/.exec(rest[rest.length - 1]);
    let state = "", zip = "";
    if (pz && rest.length >= 2) { state = pz[1]; zip = pz[2]; rest.pop(); }
    const city = rest.length >= 2 ? rest.pop()! : "";
    return { street: rest.join(", "), city, state, zip, country };
  }
  return { ...us, country: "" };
}

function usAddress(v: string): { street: string; city: string; state: string; zip: string } {
  const parts = v.split(/\s*[,\n]\s*/).filter(Boolean);
  const m = /^(.*?)[\s,]+([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)$/.exec(parts.slice(-1)[0] ?? "");
  if (parts.length >= 2 && m && STATES.test(m[2])) {
    const tail = m[1] ? [m[1]] : [];
    const head = parts.slice(0, -1);
    const city = tail.length ? tail[0] : head.pop() ?? "";
    return { street: head.join(", "), city, state: m[2].toUpperCase(), zip: m[3] };
  }
  if (parts.length >= 3) {
    const last = parts[parts.length - 1], sz = /^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(last);
    if (sz) return { street: parts.slice(0, -2).join(", "), city: parts[parts.length - 2], state: sz[1].toUpperCase(), zip: sz[2] };
  }
  return { street: v.trim(), city: "", state: "", zip: "" };
}

function date(v: string): { mm: string; dd: string; yyyy: string } | null {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v.trim());
  if (m) return { yyyy: m[1], mm: m[2].padStart(2, "0"), dd: m[3].padStart(2, "0") };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v.trim());
  if (m) return { mm: m[1].padStart(2, "0"), dd: m[2].padStart(2, "0"), yyyy: m[3] };
  const d = new Date(v);
  return isNaN(+d) ? null : { mm: String(d.getMonth() + 1).padStart(2, "0"), dd: String(d.getDate()).padStart(2, "0"), yyyy: String(d.getFullYear()) };
}

export function pick(v: string, chain?: string): string {
  if (!chain) return v;
  // a list of counts written on one line ("2, 0, 1" or "Stove 2, Range 0") for boxes that take one number per line:
  // the commas are the lines (Denver's plan review, production probe 2026-10-30). Only for numbers: a list of people
  // keeps "name, title" on one line.
  if (/^line\d\|digits$/.test(chain.trim()) && !/[\n;]/.test(v) && v.includes(",")) v = v.split(",").map(x => x.trim()).join("\n");
  return chain.split("|").reduce((s, p) => (s ? pick1(s, p.trim() as Pick) : ""), v);
}

const SPLIT = /\s*(?:,|\s-\s|:)\s*/;
function pick1(v: string, p: Pick): string {
  switch (p) {
    case "street": case "city": case "state": case "zip": case "country": return address(v)[p];
    case "citystatezip": { const a = address(v); return a.city ? `${a.city}, ${a.state} ${a.zip}` : ""; }
    case "statezip": { const a = address(v); return a.state ? `${a.state} ${a.zip}` : ""; }
    // a street line's house number and the rest, for forms that print them in separate boxes
    case "streetno": return /^\s*(\d+[A-Za-z]?(?:-\d+)?)\s/.exec(v)?.[1] ?? "";
    case "streetname": return v.replace(/^\s*\d+[A-Za-z]?(?:-\d+)?\s+/, "").trim();
    case "first": case "last": case "middle": case "mi": {
      const w = v.trim().split(/\s+/);
      if (w.length < 2) return p === "last" ? v.trim() : "";
      if (p === "mi") return w.length > 2 ? w[1][0].toUpperCase() : "";
      return p === "first" ? w[0] : p === "last" ? w[w.length - 1] : w.slice(1, -1).join(" ");
    }
    case "head": return v.split(SPLIT)[0].trim();
    case "tail": { const m = SPLIT.exec(v); return m ? v.slice(m.index + m[0].length).trim() : ""; }
    case "digits": return v.replace(/\D/g, "");
    case "phone": { const d = v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : v.trim(); }
    case "ein": { const d = v.replace(/\D/g, ""); return d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2)}` : ""; }
    // the parts of a number printed in separate boxes: a phone's area code, exchange and last four; an EIN's two parts;
    // a ZIP code's five digits and its plus-four
    case "phone1": case "phone2": case "phone3": { const d = v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? [d.slice(0, 3), d.slice(3, 6), d.slice(6)][Number(p.slice(-1)) - 1] : ""; }
    // the number after a separately printed area code: 555-0142
    case "phonelocal": { const d = v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `${d.slice(3, 6)}-${d.slice(6)}` : ""; }
    case "ein1": case "ein2": { const d = v.replace(/\D/g, ""); return d.length === 9 ? (p === "ein1" ? d.slice(0, 2) : d.slice(2)) : ""; }
    case "zip5": case "zip4": { const z = /(\d{5})(?:-(\d{4}))?\s*$/.exec(v.trim()); return z ? (p === "zip5" ? z[1] : z[2] ?? "") : ""; }
    // one digit of a number printed a digit to a box: empty when the number is shorter
    case "d1": case "d2": case "d3": case "d4": case "d5": case "d6": case "d7": case "d8": case "d9": return v.replace(/\D/g, "")[Number(p.slice(1)) - 1] ?? "";
    case "line1": case "line2": case "line3": case "line4": case "line5": case "line6": case "line7": case "line8": case "line9":
      return v.split(/\n|;\s*/).map(x => x.trim()).filter(Boolean)[Number(p.slice(-1)) - 1] ?? "";
    case "mm": case "dd": case "yyyy": return date(v)?.[p] ?? "";
    case "yy": return date(v)?.yyyy.slice(2) ?? "";   // a year printed as two boxes (New Jersey's NJ-REG)
    case "last1": return v.trim().slice(-1);   // the one box a form leaves after its printed part (San Mateo prints "9440" and boxes the ZIP's last digit)
    case "date": { const d = date(v); return d ? `${d.mm}/${d.dd}/${d.yyyy}` : v; }
  }
}

const matches = (v: string, re?: string) => !re || new RegExp(re, "i").test(v.trim());
/** PDF text boxes take Latin-1: drop what the standard fonts can't draw. */
const latin = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");

/** Writes the answers into the boxes. Returns the field ids that went somewhere, so callers can tell what stayed blank. */
export function writeAnswers(map: FormMap, values: Record<string, string>, w: Writer): Set<string> {
  const done = new Set<string>();
  const put = (b: Box, v: string, id?: string) => {
    if (!matches(v, b.if)) return;
    let ok = false;
    if ("mark" in b) { ok = !!w.draw?.({ ...b.mark, size: b.mark.size ?? 10 }, "X"); }
    else if ("at" in b) {
      let s = b.value ?? pick(v, b.pick);
      if (!s || (!b.value && SECRET.test(s))) return;
      s = latin(s); if (b.upper) s = s.toUpperCase(); if (b.max) s = s.slice(0, b.max);
      ok = !!w.draw?.(b.at, s);
    } else if ("text" in b) {
      let s = b.value ?? pick(v, b.pick);
      const einOnly = EIN_BOX.test(b.text) && !/ssn|social.?sec|itin/i.test(b.text);
      if (!s || (!b.value && (SECRET.test(s) || (SECRET_BOX.test(b.text) && !einOnly && NINE.test(s.replace(/[- ]/g, "")))))) return;
      s = latin(s);
      if (b.upper) s = s.toUpperCase();
      if (b.max) s = s.slice(0, b.max);
      ok = w.text(b.text, s);
    } else if ("check" in b) ok = w.check(b.check);
    else if ("radio" in b) ok = w.radio(b.radio, b.value);
    else ok = w.choice(b.choice, latin(b.value ?? v));
    if (ok && id) done.add(id);
  };
  for (const b of map.fixed ?? []) put(b, "");
  for (const [id, boxes] of Object.entries(map.boxes)) {
    const v = values[id]?.trim();
    if (!v) continue;
    for (const b of boxes) put(b, v, id);
  }
  return done;
}

/** pdf-lib's form as a Writer: a box this revision doesn't have is skipped, never an error. With the document and an
 *  embedded font it also prints on flat forms. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pdfLibWriter(form: any, doc?: any, font?: any): Writer {
  const t = <T,>(f: () => T) => { try { return f(); } catch { return undefined; } };
  // A box the agency's PDF leaves without the Print flag shows on screen but drops off the printed, faxed or mailed
  // copy (Maryland's CRA): every box Placetta fills is marked to print.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const printable = (f: any) => t(() => { for (const w of f.acroField.getWidgets()) w.setFlagTo(4, true); });
  return {
    draw: (at, v) => !!t(() => {
      if (!doc || !font) return false;
      const page = doc.getPages()[at.page]; if (!page) return false;
      for (const p of layout(at, v, (s, size) => font.widthOfTextAtSize(s, size))) page.drawText(p.text, { x: p.x, y: p.y, size: p.size, font });
      return true;
    }),
    text: (n, v) => !!t(() => {
      const f = form.getTextField(n);
      const max = f.getMaxLength?.();
      const s = max ? v.slice(0, max) : v;
      f.setText(s);
      printable(f);
      // Auto-sized boxes (font size 0) print a short answer huge, and a long one runs off the line: fit it instead,
      // measured in Helvetica, the font the filled boxes are drawn in.
      t(() => {
        // a box drawn upside down (Florida's HR-7005 finish schedule) has a negative height: size it by its real height
        const r0 = f.acroField.getWidgets()[0].getRectangle();
        const r = { ...r0, width: Math.abs(r0.width), height: Math.abs(r0.height) };
        const da = String(f.acroField.getDefaultAppearance?.() ?? "");
        const set = /(\d+(?:\.\d+)?)\s+Tf/.exec(da);
        const size = set ? Number(set[1]) : 0;
        const helv = font ?? t(() => form.getDefaultFont());
        const width = (x: string, sz: number): number => (helv ? helv.widthOfTextAtSize(x, sz) : x.length * 0.52 * sz);
        if (f.isCombed()) { if (!size) f.setFontSize(Math.min(10, Math.max(7, r.height / 4))); return; }
        if (f.isMultiline()) {
          // wrapped lines are 1.11 times the font size apart in Helvetica: shrink until every line fits the box
          let sz = size || Math.min(10, Math.max(7, r.height / 4));
          while (sz > 5.5 && wrap(s, r.width - 4, x => width(x, sz)).length * sz * 1.11 > r.height - 2) sz -= 0.5;
          if (sz !== size) f.setFontSize(sz);
          return;
        }
        const fit = Math.min(size || 10, r.height * 0.72, (r.width - 4) / Math.max(0.01, width(s, 1)));
        if (!size || fit < size) f.setFontSize(Math.max(5.5, Math.floor(fit * 2) / 2));
      });
      return true;
    }),
    check: n => !!t(() => { const c = form.getCheckBox(n); c.check(); printable(c); return true; }),
    radio: (n, v) => !!t(() => {
      const g = t(() => form.getRadioGroup(n));
      const opts: string[] = g ? g.getOptions() : [];
      if (g && opts.includes(v) && opts.indexOf(v) === opts.lastIndexOf(v)) { g.select(v); printable(g); return true; }
      // a radio row whose buttons are told apart only by their own value (its option list repeats one name), or
      // checkboxes that share one name, each with its own value (a pick-one row some forms draw as checkboxes)
      const af = (g ?? form.getCheckBox(n)).acroField;
      const on = af.getWidgets().map((w: { getOnValue: () => { decodeText?: () => string; toString: () => string } | undefined }) => w.getOnValue()).find((x: { decodeText?: () => string; toString: () => string } | undefined) => x && (x.decodeText?.() ?? x.toString().slice(1)) === v);
      if (!on) return false;
      // pdf-lib only sets such a box to its first value, so set the value and each box's look directly
      const off = af.dict.context.obj("Off");
      af.dict.set(af.dict.context.obj("V"), on);
      for (const w of af.getWidgets()) w.setAppearanceState(w.getOnValue() === on ? on : off);
      return true;
    }),
    choice: (n, v) => !!t(() => {
      const f = t(() => form.getDropdown(n)) ?? form.getOptionList(n);
      const opt = (f.getOptions() as string[]).find(o => o.toLowerCase() === v.toLowerCase()) ?? (f.getOptions() as string[]).find(o => o.toLowerCase().startsWith(v.toLowerCase()));
      if (!opt) return false;
      f.select(opt); return true;
    }),
  };
}
