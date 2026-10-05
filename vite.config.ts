import { cpSync, existsSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/** The website (site/: the landing page and legal pages) goes at the root of dist/, next to the app in dist/app/. */
const website = (): Plugin => ({
  name: "placetta-website",
  apply: "build",
  closeBundle() { if (existsSync("site")) cpSync("site", "dist", { recursive: true }); },
});

// `npm run build`: the whole site for production. The website at /, the app at /app/ (one origin, so the
//   website's "Get my plan" answers carry straight into the app).
// `npm run build:single`: the app inlined into one HTML file (the shareable preview and the sample demo).
export default defineConfig(({ mode }) => mode === "single"
  ? { plugins: [react(), viteSingleFile()], build: { outDir: "dist-single" } }
  : { base: "/app/", plugins: [react(), website()], build: { outDir: "dist/app", emptyOutDir: true } });
