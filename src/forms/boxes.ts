/* Where each answer goes on an agency's own PDF. One file per form in ./maps/<form id>.json, written by reading the
   form's fillable boxes (their names, tooltips and the printed words beside them) and checked by filling a test copy
   and looking at every page. Pure data plus a pure writer, so the app, the tests and the checks share one code path. */

/** How one answer is written into one box. */
export type Box =
  | { text: string; pick?: string; max?: number; upper?: boolean; value?: string; if?: string }   // a text box (value: fixed text, written when `if` matches)
  | { check: string; if?: string }                                                                // a checkbox, ticked when the answer matches `if` (always when absent)
  | { radio: string; value: string; if?: string }                                                  // a radio group set to its export value
  | { choice: string; if?: string; value?: string };                                              // a dropdown set to the answer (or `value`)

/** Part of an answer: "123 Main St, Suite 4, San Jose, CA 95112" splits into street, city, state, zip. Picks chain with
    "|", left to right: "line2|head" is the name on the answer's second line, "line2|tail|zip" that line's ZIP code.
    line1..line9: one line of a multi-line answer (one person or item per line). head: before the first comma or " - ";
    tail: after it. first/middle/last: parts of a person's name. mm/dd/yyyy/date: parts of a date. */
export type Pick = "street" | "city" | "state" | "zip" | "country" | "citystatezip" | "first" | "last" | "middle" | "mi" | "digits" | "head" | "tail" | "mm" | "dd" | "yyyy" | "date" | `line${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export type FormMap = {
  form: string;          // our form id
  rev: string;           // the revision printed on the PDF this map was checked against
  pdf: string;           // file name under public/forms/
  checked: string;       // when the map was checked by filling a test copy
  boxes: Record<string, Box[]>;   // our field id -> the boxes it fills
  fixed?: Box[];         // boxes Placetta fills the same way every time (e.g. "new registration")
  sign?: { page: number; x: number; y: number; w: number; h: number; date?: { x: number; y: number; size: number } };   // the signature line (PDF points, page from 0)
  notes?: string;
};

export type Writer = {
  text: (name: string, v: string) => boolean;
  check: (name: string) => boolean;
  radio: (name: string, value: string) => boolean;
  choice: (name: string, value: string) => boolean;
};

// SSN or ITIN shapes are never written: the signer writes them by hand. Dashed ones anywhere; a bare 9-digit number only
// into a box that is itself for an SSN or ITIN (a bare 9-digit EIN or state file number is fine elsewhere).
const SECRET = /\b\d{3}-\d{2}-\d{4}\b|\b9\d{2}[- ]?[5-9]\d[- ]?\d{4}\b/;
const SECRET_BOX = /ssn|social.?sec|itin|taxpayer.?id/i;
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
  return chain.split("|").reduce((s, p) => (s ? pick1(s, p.trim() as Pick) : ""), v);
}

const SPLIT = /\s*(?:,|\s-\s|:)\s*/;
function pick1(v: string, p: Pick): string {
  switch (p) {
    case "street": case "city": case "state": case "zip": case "country": return address(v)[p];
    case "citystatezip": { const a = address(v); return a.city ? `${a.city}, ${a.state} ${a.zip}` : ""; }
    case "first": case "last": case "middle": case "mi": {
      const w = v.trim().split(/\s+/);
      if (w.length < 2) return p === "last" ? v.trim() : "";
      if (p === "mi") return w.length > 2 ? w[1][0].toUpperCase() : "";
      return p === "first" ? w[0] : p === "last" ? w[w.length - 1] : w.slice(1, -1).join(" ");
    }
    case "head": return v.split(SPLIT)[0].trim();
    case "tail": { const m = SPLIT.exec(v); return m ? v.slice(m.index + m[0].length).trim() : ""; }
    case "digits": return v.replace(/\D/g, "");
    case "line1": case "line2": case "line3": case "line4": case "line5": case "line6": case "line7": case "line8": case "line9":
      return v.split(/\n|;\s*/).map(x => x.trim()).filter(Boolean)[Number(p.slice(-1)) - 1] ?? "";
    case "mm": case "dd": case "yyyy": return date(v)?.[p] ?? "";
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
    if ("text" in b) {
      let s = b.value ?? pick(v, b.pick);
      if (!s || (!b.value && (SECRET.test(s) || (SECRET_BOX.test(b.text) && NINE.test(s.replace(/[- ]/g, "")))))) return;
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

/** pdf-lib's form as a Writer: a box this revision doesn't have is skipped, never an error. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pdfLibWriter(form: any): Writer {
  const t = <T,>(f: () => T) => { try { return f(); } catch { return undefined; } };
  return {
    text: (n, v) => !!t(() => {
      const f = form.getTextField(n);
      const max = f.getMaxLength?.();
      const s = max ? v.slice(0, max) : v;
      f.setText(s);
      // Auto-sized boxes (font size 0) print a short answer huge, and a long one runs off the line: fit it instead.
      t(() => {
        const r = f.acroField.getWidgets()[0].getRectangle();
        const da = String(f.acroField.getDefaultAppearance?.() ?? "");
        const set = /(\d+(?:\.\d+)?)\s+Tf/.exec(da);
        const size = set ? Number(set[1]) : 0;
        if (f.isMultiline() || f.isCombed()) { if (!size) f.setFontSize(Math.min(10, Math.max(7, r.height / 4))); return; }
        const fit = Math.min(size || 10, r.height * 0.72, (r.width - 4) / Math.max(1, s.length * 0.52));
        if (!size || fit < size) f.setFontSize(Math.max(5.5, Math.round(fit * 2) / 2));
      });
      return true;
    }),
    check: n => !!t(() => { form.getCheckBox(n).check(); return true; }),
    radio: (n, v) => !!t(() => { form.getRadioGroup(n).select(v); return true; }),
    choice: (n, v) => !!t(() => {
      const f = t(() => form.getDropdown(n)) ?? form.getOptionList(n);
      const opt = (f.getOptions() as string[]).find(o => o.toLowerCase() === v.toLowerCase()) ?? (f.getOptions() as string[]).find(o => o.toLowerCase().startsWith(v.toLowerCase()));
      if (!opt) return false;
      f.select(opt); return true;
    }),
  };
}
