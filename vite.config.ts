import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/** The website (site/: the landing page and legal pages) goes at the root of dist/, next to the app in dist/app/. */
const website = (): Plugin => ({
  name: "placetta-website",
  apply: "build",
  closeBundle() { if (existsSync("site")) { cpSync("site", "dist", { recursive: true }); externalizeScripts("dist"); } },
});

/** The website's CSP allows scripts from the site itself only (no 'unsafe-inline', vercel.json), so every inline
 *  <script> in the built pages becomes a file named by its content's hash (/js/inline/<hash>.js) and the page loads it
 *  from there, in the same place, so it runs in the same order. Authors keep writing inline scripts; JSON-LD and other
 *  data blocks stay inline (they never run). Inline event handlers aren't allowed: the build fails on one. */
export function externalizeScripts(root: string) {
  const out = join(root, "js", "inline"), made = new Set<string>();
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? (p === join(root, "app") ? [] : walk(p)) : p.endsWith(".html") ? [p] : []; });
  for (const file of walk(root)) {
    const html = readFileSync(file, "utf8");
    if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html.replace(/<script\b[\s\S]*?<\/script>/gi, ""))) throw new Error(`${file}: an inline event handler (onclick= and the like) is blocked by the CSP; attach it from a script instead`);
    const next = html.replace(/<script\b(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs: string, body: string) => {
      if (/\btype\s*=\s*["']?(application\/(ld\+)?json|text\/template|importmap|speculationrules)/i.test(attrs) || !body.trim()) return m;
      const name = createHash("sha256").update(body).digest("hex").slice(0, 20) + ".js";
      if (!made.has(name)) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, name), body); made.add(name); }
      return `<script${attrs} src="/js/inline/${name}"></script>`;
    });
    if (next !== html) writeFileSync(file, next);
  }
  return made.size;
}

/** pdf.js's image decoders and standard fonts, next to the app (pdfjs/), for drawing the filled forms' pages
 *  (src/forms/render.ts). Without them a form still draws, minus the odd scanned image. Not in the one-file build. */
const pdfjsAssets = (): Plugin => ({
  name: "placetta-pdfjs-assets",
  apply: "build",
  generateBundle() {
    const root = "node_modules/pdfjs-dist/";
    for (const dir of ["wasm", "standard_fonts"]) {
      if (!existsSync(root + dir)) continue;
      for (const f of readdirSync(root + dir)) {
        if (/^quickjs/.test(f)) continue;   // the PDF scripting engine: never used here
        this.emitFile({ type: "asset", fileName: `pdfjs/${dir}/${f}`, source: readFileSync(root + dir + "/" + f) });
      }
    }
  },
});

// `npm run build`: the whole site for production. The website at /, the app at /app/ (one origin, so the
//   website's "Get my plan" answers carry straight into the app).
// `npm run build:single`: the app inlined into one HTML file (the shareable preview and the sample demo).
// Both are public, so Odelia's instructions are compiled out of them (src/publicBundle.ts); she runs on the server.
const define = { __PLACETTA_PUBLIC_BUNDLE__: "true" };
export default defineConfig(({ mode }) => mode === "single"
  ? { define, plugins: [react(), viteSingleFile()], build: { outDir: "dist-single" } }
  : { define, base: "/app/", plugins: [react(), website(), pdfjsAssets()], build: { outDir: "dist/app", emptyOutDir: true } });
