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

/** Modules that hold Odelia's instructions, her tool definitions, the filing playbooks or the server's own run loop.
 *  They are bundled into the server (scripts/build-agent.mjs: agent-run, the monitor, the MCP server) and never into
 *  what a browser loads. Listed in docs/SECURITY.md; a new server-only module goes here too. */
export const SERVER_ONLY = [
  /\/src\/live\.ts$/, /\/src\/harness\.ts$/, /\/src\/serverRun\.ts$/, /\/src\/held\.ts$/, /\/src\/localAgent\.ts$/,
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
  const define = { __LOCAL_AGENT__: JSON.stringify(command === "serve" || process.env.PLACETTA_LOCAL_AGENT === "1") };
  const guard = serverOnly(define.__LOCAL_AGENT__ === "true");
  return mode === "single"
    ? { define, plugins: [react(), viteSingleFile(), guard], build: { outDir: "dist-single" } }
    : { define, base: "/app/", plugins: [react(), website(), pdfjsAssets(), guard], build: { outDir: "dist/app", emptyOutDir: true, sourcemap: false } };
});
