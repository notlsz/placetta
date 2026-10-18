// Runs scripts/forms-roundtrip.mts (npm run test:forms). It is bundled first so it runs the app's own fill code: the
// two forms filled by code load their PDFs as `import("./pdf/x.pdf?inline")`, which Vite turns into a data URL; the
// small plugin below does the same here. Arguments pass through (e.g. --png <dir>, or form ids to check only those).
import { build } from "esbuild";
import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, ".forms-roundtrip.mjs");
const inlinePdf = {
  name: "inline-pdf",
  setup(b) {
    b.onResolve({ filter: /\.pdf\?inline$/ }, a => ({ path: resolve(a.resolveDir, a.path.replace(/\?inline$/, "")), namespace: "inline-pdf" }));
    b.onLoad({ filter: /.*/, namespace: "inline-pdf" }, a => ({ contents: `export default ${JSON.stringify("data:application/pdf;base64," + readFileSync(a.path).toString("base64"))};`, loader: "js" }));
  },
};
await build({
  entryPoints: [resolve(root, "scripts/forms-roundtrip.mts")], bundle: true, platform: "node", format: "esm", outfile: out,
  packages: "external", plugins: [inlinePdf], logLevel: "error",
});
const r = spawnSync(process.execPath, [out, ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
rmSync(out, { force: true });
process.exit(r.status ?? 1);
