import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/** The website (site/: the landing page and legal pages) goes at the root of dist/, next to the app in dist/app/. */
const website = (): Plugin => ({
  name: "placetta-website",
  apply: "build",
  closeBundle() { if (existsSync("site")) cpSync("site", "dist", { recursive: true }); },
});

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
export default defineConfig(({ mode }) => mode === "single"
  ? { plugins: [react(), viteSingleFile()], build: { outDir: "dist-single" } }
  : { base: "/app/", plugins: [react(), website(), pdfjsAssets()], build: { outDir: "dist/app", emptyOutDir: true } });
