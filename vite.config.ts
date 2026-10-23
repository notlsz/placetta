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
  closeBundle() { if (existsSync("site")) { cpSync("site", "dist", { recursive: true }); externalizeScripts("dist"); } selfHostFonts("dist"); },
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

/** The fonts are served from the site itself (/fonts/), not Google Fonts: no third party sees each visit, and the CSP
 *  allows fonts and styles from the site only. Every page's Google Fonts link becomes a link to each family's own
 *  stylesheet, written from the @fontsource packages with the family names the pages already use; only the woff2
 *  files are copied, and a browser downloads just the character ranges a page uses. */
const FONT_FAMILIES: Record<string, { slug: string; css: string[]; as?: string }> = {
  "Inter": { slug: "inter", css: ["@fontsource-variable/inter/index.css"], as: "Inter Variable" },
  "Noto Sans SC": { slug: "noto-sans-sc", css: ["@fontsource/noto-sans-sc/400.css", "@fontsource/noto-sans-sc/500.css", "@fontsource/noto-sans-sc/600.css"] },
  "Noto Serif SC": { slug: "noto-serif-sc", css: ["@fontsource/noto-serif-sc/400.css", "@fontsource/noto-serif-sc/500.css"] },
  "Newsreader": { slug: "newsreader", css: ["@fontsource-variable/newsreader/opsz.css", "@fontsource-variable/newsreader/opsz-italic.css"], as: "Newsreader Variable" },
  "IBM Plex Mono": { slug: "ibm-plex-mono", css: ["@fontsource/ibm-plex-mono/400.css", "@fontsource/ibm-plex-mono/500.css"] },
};
export function selfHostFonts(root: string) {
  const out = join(root, "fonts"), files = join(out, "files"), written = new Set<string>();
  const family = (name: string) => {
    const f = FONT_FAMILIES[name];
    if (!f) throw new Error(`The page asks Google Fonts for "${name}", which isn't self-hosted yet: add it to FONT_FAMILIES in vite.config.ts`);
    if (!written.has(f.slug)) {
      mkdirSync(files, { recursive: true });
      const css = f.css.map(p => {
        const dir = join("node_modules", p, "..");
        return readFileSync(join("node_modules", p), "utf8")
          .replace(/,\s*url\(\.\/files\/[^)]+\.woff\) format\('woff'\)/g, "")
          .replace(/url\(\.\/files\/([^)]+\.woff2)\)/g, (_m, file: string) => { writeFileSync(join(files, file), readFileSync(join(dir, "files", file))); return `url(/fonts/files/${file})`; })
          .replace(f.as ? new RegExp(`font-family: '${f.as}'`, "g") : /^$/, `font-family: '${name}'`);
      }).join("\n");
      writeFileSync(join(out, `${f.slug}.css`), css);
      written.add(f.slug);
    }
    return `/fonts/${f.slug}.css`;
  };
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? (p === out ? [] : walk(p)) : p.endsWith(".html") ? [p] : []; });
  for (const file of walk(root)) {
    const html = readFileSync(file, "utf8");
    if (!html.includes("fonts.g")) continue;
    const next = html
      .replace(/<link\b[^>]*\bhref="https:\/\/fonts\.(googleapis|gstatic)\.com\/?"[^>]*>\s*/g, "")
      .replace(/<link\b[^>]*\bhref="https:\/\/fonts\.googleapis\.com\/css2\?([^"]+)"[^>]*>/g, (_m, q: string) =>
        [...new URLSearchParams(q.replace(/&amp;/g, "&")).getAll("family")].map(v => `<link rel="stylesheet" href="${family(v.split(":")[0])}">`).join(""));
    if (next !== html) writeFileSync(file, next);
  }
  return written.size;
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

/** Modules that hold Odelia's instructions, her tool definitions, the filing playbooks or the server's own run loop.
 *  They are bundled into the server (scripts/build-agent.mjs: agent-run, the monitor, the MCP server) and never into
 *  what a browser loads. Listed in docs/SECURITY.md; a new server-only module goes here too. */
export const SERVER_ONLY = [
  /\/src\/live\.ts$/, /\/src\/harness\.ts$/, /\/src\/serverRun\.ts$/, /\/src\/held\.ts$/, /\/src\/localAgent\.ts$/, /\/src\/nextPath\.ts$/,
  /\/src\/filingPlaybooks\//, /\/src\/server\//, /\/supabase\/functions\//,
];
/** Fails the build when the app's module graph reaches a server-only module (unless this is a local agent build). A
 *  type-only import is fine: TypeScript erases it, so it never reaches the graph. */
const serverOnly = (local: boolean): Plugin => ({
  name: "placetta-server-only",
  apply: "build",
  buildEnd(err) {
    if (err || local) return;
    const hits = [...this.getModuleIds()].map(id => id.split("?")[0].replace(/\\/g, "/")).filter(id => !id.includes("/node_modules/") && SERVER_ONLY.some(r => r.test(id)));
    // shared on purpose, with no secret, prompt or model choice in them: the stream parser, the injection scorer, the
    // address check, the public price list, the connected-apps catalog, the credential patterns and cache pricing shares
    const bad = hits.filter(id => !/\/supabase\/functions\/_shared\/(stream|injection|reach|stripe_catalog|mcp_catalog|secrets|cache_rates)\.ts$/.test(id));
    if (bad.length) {
      const who = bad.map(id => { const by = this.getModuleInfo(id)?.importers ?? []; return `  ${id.replace(process.cwd(), "")}  (imported by ${by.map(b => b.replace(process.cwd(), "")).join(", ") || "?"})`; });
      this.error(`Server-only code in the browser build. These hold Odelia's instructions, tools or playbooks and must never ship (docs/SECURITY.md):\n${who.join("\n")}\nImport only types from them (import type), or move what the app needs into a browser-safe module such as src/agentCore.ts.`);
    }
  },
});

// `npm run build`: the whole site for production. The website at /, the app at /app/ (one origin, so the
//   website's "Get my plan" answers carry straight into the app).
// `npm run build:single`: the app inlined into one HTML file (the shareable preview and the sample demo).
//
// __LOCAL_AGENT__ (src/env.d.ts, src/localAgent.ts): the whole agent in the browser, for local development. On under
// `vite` (npm run dev) and when PLACETTA_LOCAL_AGENT=1 is set; off in every other build, so the production bundle and
// the one-file build carry none of Odelia's instructions, tools or playbooks (npm run test:leak).
// serverOnly(): the build fails if anything the browser loads imports a server-only module (docs/SECURITY.md).
export default defineConfig(({ mode, command }) => {
  const local = command === "serve" || process.env.PLACETTA_LOCAL_AGENT === "1";
  const define = { __LOCAL_AGENT__: JSON.stringify(local), __PLACETTA_PUBLIC_BUNDLE__: JSON.stringify(!local) };
  const guard = serverOnly(define.__LOCAL_AGENT__ === "true");
  return mode === "single"
    ? { define, plugins: [react(), viteSingleFile(), guard], build: { outDir: "dist-single" } }
    : { define, base: "/app/", plugins: [react(), website(), pdfjsAssets(), guard], build: { outDir: "dist/app", emptyOutDir: true, sourcemap: false } };
});
