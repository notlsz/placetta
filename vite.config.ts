import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build` makes a normal app build in dist/.
// `npm run build:single` inlines everything into one HTML file (used for the shareable preview).
export default defineConfig(({ mode }) => ({
  plugins: mode === "single" ? [react(), viteSingleFile()] : [react()],
  build: mode === "single" ? { outDir: "dist-single" } : {},
}));
