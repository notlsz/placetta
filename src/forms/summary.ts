import type { Application } from "../model";
import { BY_HAND } from "../guard";
import { formById } from "./registry";

/* For a filing the agency only takes on its own website (no paper form to fill): the answers as a plain, printable
   page, in the same order the agency's site asks for them, so the person can read exactly what Placetta enters there.
   It's titled for what it is, "Answers for <agency>'s online application", and laid out as a plain list: no boxes, no
   rules, nothing that could pass for the agency's own form. English, as the agency's site asks. */

const latin = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
const printable = (s: string) => latin(s).replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

/** The answers page, as PDF bytes. today: the date it was prepared (YYYY-MM-DD). */
export async function answersPdf(a: Application, today: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const off = a.official ? formById(a.official) : undefined;
  const agency = printable(off?.agency.en ?? a.agency.en) || "the agency";
  const title = `Answers for ${agency}'s online application`;
  doc.setTitle(title); doc.setAuthor("Placetta"); doc.setSubject(off?.form ?? a.name.en);
  const W = 612, H = 792, M = 56, ink = rgb(0.11, 0.11, 0.12), soft = rgb(0.38, 0.38, 0.42);
  let page = doc.addPage([W, H]), y = H - M;
  const wrap = (text: string, font: typeof regular, size: number, width: number) => {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (line && font.widthOfTextAtSize(next, size) > width) { out.push(line); line = word; } else line = next;
      }
      out.push(line);
    }
    return out;
  };
  const write = (text: string, font: typeof regular, size: number, color = ink, gap = 4) => {
    for (const line of wrap(text, font, size, W - 2 * M)) {
      if (y - size < M + 24) { page = doc.addPage([W, H]); y = H - M; }
      page.drawText(line, { x: M, y: y - size, size, font, color });
      y -= size + gap;
    }
  };
  write(title, bold, 17, ink, 6);
  write(`${printable(off?.form ?? a.name.en)}: ${printable(a.name.en)}`, regular, 11, soft);
  y -= 4;
  write(`Not an official form. Placetta enters these answers on ${agency}'s own website, in this order. Prepared ${today}.`, regular, 9.5, soft);
  y -= 14;
  let dropped = false;
  for (const f of a.fields) {
    const v = f.value.trim();
    const shown = !v ? "Not answered yet" : BY_HAND.test(v) ? "Written by the signer, not stored by Placetta" : printable(v);
    if (v && printable(v) !== latin(v)) dropped = true;
    write(printable(f.label.en), bold, 9.5, soft, 3);
    write(shown || "(see the app)", regular, 11.5, !v ? soft : ink, 4);
    y -= 9;
  }
  if (dropped) { y -= 4; write("Some answers have characters this page can't show. The app shows them in full.", regular, 9, soft); }
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Placetta. Page ${i + 1} of ${pages.length}`, { x: M, y: 28, size: 8.5, font: regular, color: soft }));
  return await doc.save();
}
