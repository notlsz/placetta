import { CODE_ROOM, placedLines, type Filled, type Wrote } from "./fill";
import { formById } from "./registry";

/* The read-back: after a form is filled, the saved PDF is opened again and every line is checked against what was
   asked. A fillable form's boxes are read with pdf-lib (the text in each box, each tick, each choice); a flat form's
   printed words are read out of the page itself (the text the fill drew there). What it finds wrong on a line:
     missing     the answer has a place on the form but nothing of it reached the PDF (a choice the form doesn't offer,
                 an address that didn't split into its boxes, a box this revision of the form doesn't have)
     wrong       the box holds something other than what was written
     overflow    it doesn't fit: the box takes fewer characters, or the words run past the box at the smallest size
     characters  the answer has characters the agency's form can't print (Chinese, for one): write it in English letters
     secret      an SSN or ITIN, which Placetta never prints; the signer writes it by hand
   Any of these keeps the application from being ready to file (src/forms/versions.ts). Runs the same in the app, on
   the server and in the tests. */

export type ReadKind = "missing" | "wrong" | "overflow" | "characters" | "secret";
export type ReadIssue = { id: string; kind: ReadKind; want: string; got?: string };
export type ReadBack = { ok: boolean; checked: number; issues: ReadIssue[] };

const SSN = /\b\d{3}-\d{2}-\d{4}\b|\b9\d{2}[- ]?[5-9]\d[- ]?\d{4}\b/;
const DASHED_SSN = /\b\d{3}-\d{2}-\d{4}\b/;
/** Characters an agency's PDF can print: Latin-1, plus the curly quotes and dashes the fill turns into straight ones. */
const UNPRINTABLE = /[^\t\n\r\x20-\x7E\xA0-\xFF‘’“”–—]/;

/** The strings drawn on each page (pdf-lib writes them as <hex> Tj, other writers as (text) Tj). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function drawnText(doc: any, pages: Set<number>): Promise<Map<number, string[]>> {
  const { PDFArray, PDFRawStream, decodePDFRawStream } = await import("pdf-lib");
  const out = new Map<number, string[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.getPages().forEach((page: any, i: number) => {
    if (!pages.has(i)) return;
    const c = page.node.Contents();
    const streams = c instanceof PDFArray ? c.asArray().map((r: unknown) => doc.context.lookup(r)) : c ? [c] : [];
    const found: string[] = [];
    for (const s of streams) {
      if (!(s instanceof PDFRawStream)) continue;
      let bytes: Uint8Array;
      try { bytes = decodePDFRawStream(s).decode(); } catch { continue; }
      let t = "";
      for (let k = 0; k < bytes.length; k += 0x8000) t += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
      for (const m of t.matchAll(/<([0-9A-Fa-f\s]*)>\s*Tj/g)) {
        const hex = m[1].replace(/\s+/g, "");
        let str = "";
        for (let k = 0; k + 1 < hex.length; k += 2) str += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
        found.push(str);
      }
      for (const m of t.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) found.push(m[1].replace(/\\([()\\])/g, "$1"));
    }
    out.set(i, found);
  });
  return out;
}

/** Reads a filled copy back and checks every line against the answers it was filled from. */
export async function readBack(formId: string, f: Filled): Promise<ReadBack> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.load(f.pdf, { ignoreEncryption: true });
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const issues: ReadIssue[] = [];
  const add = (x: ReadIssue) => { if (!issues.some(y => y.id === x.id && y.kind === x.kind)) issues.push(x); };
  const want = (id: string) => f.values[id] ?? "";
  const ours = f.wrote.filter((w): w is Wrote & { id: string } => !!w.id && !!w.ok);
  const drawn = ours.some(w => w.kind === "draw") ? await drawnText(doc, new Set(ours.filter(w => w.kind === "draw").map(w => (w as { at: { page: number } }).at.page))) : new Map<number, string[]>();
  const pages = doc.getPages();
  const fits = (s: string, size: number, room: number) => font.widthOfTextAtSize(s, size) <= room + 0.5;

  for (const w of ours) {
    try {
      if (w.kind === "text") {
        const tf = form.getTextField(w.name);
        const got = tf.getText() ?? "";
        if (got !== w.v) { add({ id: w.id, kind: w.v.startsWith(got) && got.length < w.v.length ? "overflow" : "wrong", want: w.v, got }); continue; }
        // the words have to fit the box at the size they're printed
        const widget = tf.acroField.getWidgets()[0];
        const r = widget?.getRectangle();
        const da = String(tf.acroField.getDefaultAppearance?.() ?? "");
        const size = Number(/(\d+(?:\.\d+)?)\s+Tf/.exec(da)?.[1] ?? 0);
        if (r && size > 0 && !tf.isCombed()) {
          if (!tf.isMultiline()) { if (!fits(got, size, r.width - 2)) add({ id: w.id, kind: "overflow", want: w.v, got }); }
          else {
            // wrapped at the box's width, the lines have to fit its height
            let lines = 0;
            for (const para of got.split("\n")) {
              let line = "";
              for (const word of para.split(/\s+/)) { const next = line ? line + " " + word : word; if (line && !fits(next, size, r.width - 4)) { lines++; line = word; } else line = next; }
              lines++;
            }
            if (lines * size * 1.15 > r.height + 1) add({ id: w.id, kind: "overflow", want: w.v, got });
          }
        }
      } else if (w.kind === "check") {
        if (!form.getCheckBox(w.name).isChecked()) add({ id: w.id, kind: "wrong", want: want(w.id), got: "not ticked" });
      } else if (w.kind === "radio") {
        const got = form.getRadioGroup(w.name).getSelected() ?? "";
        if (got !== w.v) add({ id: w.id, kind: "wrong", want: w.v, got });
      } else if (w.kind === "choice") {
        let sel: string[] = [];
        try { sel = form.getDropdown(w.name).getSelected(); } catch { sel = form.getOptionList(w.name).getSelected(); }
        if (!sel.some(o => o.toLowerCase().startsWith(w.v.toLowerCase()))) add({ id: w.id, kind: "wrong", want: w.v, got: sel.join(", ") });
      } else if (w.kind === "draw") {
        if (!(drawn.get(w.at.page) ?? []).includes(w.v)) { add({ id: w.id, kind: "wrong", want: w.v, got: "" }); continue; }
        const page = pages[w.at.page], { width } = page.getSize();
        // the fill shrinks a long answer down to 5.5 points to fit its line; past that it runs over
        if ((w.at.w && !fits(w.v, 5.5, w.at.w)) || w.at.x + font.widthOfTextAtSize(w.v, Math.min(w.at.size ?? 9, 5.5)) > width) add({ id: w.id, kind: "overflow", want: w.v, got: w.v });
      }
    } catch {
      add({ id: w.id, kind: "wrong", want: want(w.id), got: "" });
    }
  }

  // every answer that has a place on the form reached it, in characters the form can print, and no SSN anywhere
  const placed = placedLines(formId), skipped = new Set(f.skipped);
  const room = CODE_ROOM[formById(formId)?.fill ?? ""] ?? {};
  for (const [id, v] of Object.entries(f.values)) {
    if (!placed.has(id) || skipped.has(id)) continue;
    const value = v.trim();
    if (SSN.test(value) && (DASHED_SSN.test(value) || /ssn|itin|7b/i.test(id))) { add({ id, kind: "secret", want: "" }); continue; }
    if (UNPRINTABLE.test(value)) add({ id, kind: "characters", want: value });
    if (!ours.some(w => w.id === id)) add({ id, kind: "missing", want: value });
    if (room[id] && value.length > room[id]) add({ id, kind: "overflow", want: value, got: value.slice(0, room[id]) });
  }
  for (const fl of form.getFields()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = (fl as any).getText?.() as string | undefined;
      if (t && DASHED_SSN.test(t)) add({ id: ours.find(w => (w as { name?: string }).name === fl.getName())?.id ?? fl.getName(), kind: "secret", want: "" });
    } catch { /* not a text box */ }
  }
  for (const w of ours) if (w.kind === "draw" && DASHED_SSN.test(w.v)) add({ id: w.id, kind: "secret", want: "" });
  const checked = new Set(ours.map(w => w.id)).size;
  return { ok: !issues.length, checked, issues };
}
