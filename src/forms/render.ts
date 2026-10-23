import type { Mark } from "./versions";

/* The filled form's pages as pictures, drawn here with pdf.js: the app's pages may not embed a PDF (its security
   policy allows no frames), and a phone's browser often can't show one inline anyway. pdf.js, its worker and its
   decoders load only when a filled form is opened (the decoders and fonts are copied next to the app at build time,
   vite.config.ts). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lib: Promise<any> | null = null;
async function pdfjs() {
  lib ??= (async () => {
    // the legacy build: it carries what this pdf.js version needs that browsers before late 2026 don't have
    const [m, worker] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")]);
    m.GlobalWorkerOptions.workerSrc = worker.default;
    return m;
  })();
  return lib;
}
/** Where the build put pdf.js's image decoders and standard fonts. */
const BASE = (import.meta.env?.MODE === "single" ? "" : (import.meta.env?.BASE_URL ?? "/")) + "pdfjs/";

/** The words on the first pages of a PDF, for reading business facts out of a document dropped at sign-up
 *  (src/intakeParse.ts). Nothing leaves the browser. */
export async function pdfText(bytes: Uint8Array, pages = 4): Promise<string> {
  const m = await pdfjs();
  const doc = await m.getDocument({ data: bytes.slice(), isEvalSupported: false, wasmUrl: BASE + "wasm/", standardFontDataUrl: BASE + "standard_fonts/" }).promise;
  const out: string[] = [];
  try {
    for (let n = 1; n <= Math.min(pages, doc.numPages); n++) {
      const c = await (await doc.getPage(n)).getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out.push(c.items.map((i: any) => (i.str ?? "") + (i.hasEOL ? "\n" : " ")).join(""));
    }
  } finally { void doc.destroy(); }
  return out.join("\n");
}

const toUrl = (c: HTMLCanvasElement) => new Promise<string>((ok, no) => c.toBlob(b => (b ? ok(URL.createObjectURL(b)) : no(new Error("no image"))), "image/png"));
export type Picture = { url: string; w: number; h: number };

/** Every page as an image (object URLs; the caller revokes them), sharp at `width` CSS pixels, each handed over as
 *  soon as it's drawn (onPage), and a close-up of the marked lines on the first page that has any. */
export async function renderPdf(bytes: Uint8Array, o: { width: number; marks?: Mark[]; onPage?: (p: Picture, n: number) => void; onCloseUp?: (p: Picture) => void }): Promise<void> {
  const m = await pdfjs();
  const task = m.getDocument({ data: bytes.slice(), isEvalSupported: false, wasmUrl: BASE + "wasm/", standardFontDataUrl: BASE + "standard_fonts/" });
  const doc = await task.promise;
  const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const marked = o.marks?.length ? o.marks[0].page : -1;
  // the page with the changes first, so the close-up shows as early as it can
  const order = [...Array(doc.numPages).keys()].map(k => k + 1).sort((x, y) => (x - 1 === marked ? -1 : y - 1 === marked ? 1 : x - y));
  try {
    for (const n of order) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // sharp enough to zoom into once: one and a half times the width it's shown at
      const scale = (o.width * dpr * 1.5) / base.width;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      if (n - 1 === marked && o.marks && o.onCloseUp) {
        // the close-up: every mark on this page with room around it, at least a third of the page wide so the line's
        // own printed label is in it, cut from the page as drawn and shown at the column's width
        const on = o.marks.filter(k => k.page === marked), pad = 14;
        const x0 = Math.max(0, Math.min(...on.map(k => k.x)) - pad), x1 = Math.min(base.width, Math.max(...on.map(k => k.x + k.w)) + pad);
        const yTop = Math.min(base.height, Math.max(...on.map(k => k.y + k.h)) + pad), yBot = Math.max(0, Math.min(...on.map(k => k.y)) - pad);
        const wPt = Math.max(x1 - x0, base.width / 3), hPt = Math.min(yTop - yBot, base.height / 2);
        const sx = Math.max(0, Math.min(base.width - wPt, x0)) * scale, sy = (base.height - yTop) * scale;
        const out = document.createElement("canvas");
        out.width = Math.round(o.width * dpr); out.height = Math.round(o.width * dpr * (hPt / wPt));
        out.getContext("2d")!.drawImage(canvas, sx, sy, wPt * scale, hPt * scale, 0, 0, out.width, out.height);
        o.onCloseUp({ url: await toUrl(out), w: wPt, h: hPt });
      }
      o.onPage?.({ url: await toUrl(canvas), w: base.width, h: base.height }, n);
      page.cleanup();
    }
  } finally { void Promise.resolve(task.destroy?.()).catch(() => undefined); }
}
