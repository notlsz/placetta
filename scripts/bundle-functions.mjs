// Bundles each Supabase function to one JS file (bundles/<name>.js) plus the list of its npm/jsr imports, for deploying
// without the Supabase CLI: a two-file function (index.ts importing deps.ts and the bundle) is deployed through the API.
// npm:/jsr:/https: imports stay outside the bundle and are handed in through globalThis.__placettaDeps.
//   node scripts/bundle-functions.mjs [name ...]     (default: every function)
import { build } from "esbuild";
import { mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";

const root = new URL("../supabase/functions/", import.meta.url).pathname;
const names = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(root).filter(n => !n.startsWith("_") && existsSync(`${root}${n}/index.ts`));
mkdirSync("bundles", { recursive: true });
const out = {};
for (const name of names) {
  const deps = new Set();
  await build({
    entryPoints: [`${root}${name}/index.ts`], bundle: true, format: "esm", platform: "neutral", target: "es2022",
    outfile: `bundles/${name}.js`, logLevel: "error", mainFields: ["module", "main"],
    plugins: [{
      name: "deps",
      setup(b) {
        b.onResolve({ filter: /^(npm|jsr|node|https?):/ }, a => ({ path: a.path, namespace: "dep" }));
        b.onLoad({ filter: /.*/, namespace: "dep" }, a => {
          deps.add(a.path);
          return { contents: `module.exports = globalThis.__placettaDeps[${JSON.stringify(a.path)}];`, loader: "js" };
        });
      },
    }],
  });
  out[name] = [...deps];
  const lines = [...deps].map((d, i) => `import * as d${i} from ${JSON.stringify(d)};`);
  writeFileSync(`bundles/${name}.deps.ts`, `// npm packages for the bundled function (it reads them from globalThis.__placettaDeps)\n${lines.join("\n")}\n(globalThis as Record<string, unknown>).__placettaDeps = { ${[...deps].map((d, i) => `${JSON.stringify(d)}: d${i}`).join(", ")} };\n`);
}
console.log(JSON.stringify(out));
