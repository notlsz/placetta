/* ------------------------------------------------------------------ *
 * What a PDF hides. A model reading a PDF sees text a person never
 * would: text drawn invisibly (render mode 3), in a font too small to
 * read, or in white. And a PDF can carry scripts and actions that run
 * when it's opened. Before an uploaded PDF goes to a model, its content
 * streams are read (inflated where compressed) and checked, by plain
 * code:
 *
 *   hidden    text shown with render mode 3, a font under 2 points, or a
 *             white fill, and the words it draws where they're readable
 *   active    JavaScript, an open action, additional actions, launch,
 *             embedded files, submit-form and rich media
 *
 * Hidden text with instructions in it quarantines the document (the model
 * never reads it); scripts are flagged (a model can't run them, but the
 * person should know, and Placetta strips them from forms it fills:
 * src/forms/fill.ts).
 * ------------------------------------------------------------------ */

export type PdfScan = { hidden: { why: string; text: string }[]; active: string[] };

const latin1 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return s; };

/** The strings a content stream draws (Tj, TJ, ' and "), as far as they're plain or hex-encoded single-byte text. */
function drawn(chunk: string): string {
  const out: string[] = [];
  for (const m of chunk.matchAll(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]{2,}>/g)) {
    const t = m[0];
    if (t.startsWith("(")) out.push(t.slice(1, -1).replace(/\\([nrtbf()\\])/g, (_x, c: string) => ({ n: "\n", r: "", t: " ", b: "", f: "" }[c] ?? c)).replace(/\\(\d{1,3})/g, (_x, o: string) => String.fromCharCode(parseInt(o, 8))));
    else { const hex = t.slice(1, -1).replace(/\s+/g, ""); let s = ""; for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16)); out.push(s); }
  }
  return out.join("").replace(/[^\x20-\x7e\n -ÿ]/g, "");
}

/** Text drawn in a state that hides it: render mode 3, an effective size under 2 points, or a white fill. */
function hiddenIn(stream: string): { why: string; text: string }[] {
  const found: { why: string; text: string }[] = [];
  const N = "(-?\\d*\\.?\\d+)";
  const OPS = new RegExp([`${N}\\s+${N}\\s+${N}\\s+rg\\b`, `${N}\\s+g\\b`, `${N}\\s+${N}\\s+${N}\\s+${N}\\s+k\\b`, `(\\d)\\s+Tr\\b`, `/[^\\s/]+\\s+${N}\\s+Tf\\b`,
    `${N}\\s+${N}\\s+${N}\\s+${N}\\s+${N}\\s+${N}\\s+Tm\\b`, `(\\((?:\\\\.|[^\\\\)])*\\)\\s*(?:Tj|'|")|<[0-9A-Fa-f\\s]+>\\s*Tj|\\[(?:\\((?:\\\\.|[^\\\\)])*\\)|<[0-9A-Fa-f\\s]*>|[^\\]])*\\]\\s*TJ)`].join("|"), "g");
  let white = false, mode = 0, size = 12, scale = 1;
  let run: { why: string; text: string } | null = null;
  const end = () => { if (run && /[A-Za-z]{2}/.test(run.text)) found.push({ why: run.why, text: run.text.trim().slice(0, 2000) }); run = null; };
  for (const m of stream.matchAll(OPS)) {
    const v = (i: number) => parseFloat(m[i]);
    if (m[1] !== undefined) white = v(1) >= 0.97 && v(2) >= 0.97 && v(3) >= 0.97;
    else if (m[4] !== undefined) white = v(4) >= 0.97;
    else if (m[5] !== undefined) white = v(5) <= 0.03 && v(6) <= 0.03 && v(7) <= 0.03 && v(8) <= 0.03;
    else if (m[9] !== undefined) mode = Number(m[9]);
    else if (m[10] !== undefined) size = v(10);
    else if (m[11] !== undefined) scale = Math.max(Math.abs(v(11)), Math.abs(v(14))) || 1;
    else if (m[17] !== undefined) {
      const why = [mode === 3 ? "invisible text (render mode 3)" : "", Math.abs(size * scale) > 0 && Math.abs(size * scale) < 2 ? "text under 2 points" : "", white ? "white text" : ""].filter(Boolean).join(", ");
      const text = drawn(m[17]);
      if (!why) { end(); continue; }
      if (run && run.why === why) run.text += text; else { end(); run = { why, text }; }
    }
  }
  end();
  return found;
}

export async function scanPdf(bytes: Uint8Array): Promise<PdfScan> {
  const raw = latin1(bytes);
  const active = [
    [/\/JavaScript\b|\/JS\s*[(<\[]/, "JavaScript"], [/\/OpenAction\b/, "an action that runs when it opens"], [/\/AA\s*<</, "additional actions"],
    [/\/Launch\b/, "a launch action"], [/\/EmbeddedFile\b/, "an embedded file"], [/\/SubmitForm\b/, "a form that submits somewhere"], [/\/RichMedia\b/, "rich media"],
  ].filter(([re]) => (re as RegExp).test(raw)).map(([, why]) => why as string);
  const hidden: { why: string; text: string }[] = [];
  let inflate: ((b: Uint8Array) => Uint8Array) | null = null;
  try { inflate = (await import("fflate")).unzlibSync; } catch { inflate = null; }
  let streams = 0;
  for (const m of raw.matchAll(/<<((?:(?!>>)[\s\S]){0,800})>>\s*stream\r?\n/g)) {
    if (++streams > 400) break;
    const start = m.index! + m[0].length, end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const dict = m[1];
    if (/\/Subtype\s*\/Image|\/Type\s*\/XRef|\/Type\s*\/ObjStm|\/FontFile/.test(dict)) continue;
    let content = raw.slice(start, end);
    if (/\/FlateDecode/.test(dict)) {
      if (!inflate) continue;
      try { content = latin1(inflate(bytes.subarray(start, end))); } catch { try { content = latin1(inflate(bytes.subarray(start, end - 1))); } catch { continue; } }
    } else if (/\/Filter/.test(dict)) continue;
    if (!/\bBT\b/.test(content)) continue;
    hidden.push(...hiddenIn(content));
    if (hidden.length > 40) break;
  }
  return { hidden, active };
}
