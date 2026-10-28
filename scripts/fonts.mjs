#!/usr/bin/env node
/* npm run fonts: the website's and the app's fonts, served from the site itself (/fonts/), never from Google Fonts, so
   no third party sees each visit and the CSP allows fonts and styles from the site only (vercel.json).

   Writes, from the @fontsource packages in devDependencies:
   - site/fonts/fonts.css       one stylesheet with every @font-face the pages use, font-display: swap, each with its
                                unicode-range, so a browser downloads only the chunks whose characters a page shows
                                (an English page never fetches a Chinese chunk)
   - site/fonts/files/*.woff2   only the weights and subsets used: latin and latin-ext, plus the Chinese chunks of the
                                SC fonts. No woff, no cyrillic, greek or vietnamese.
   - site/fonts/LICENSES/       each family's SIL Open Font License, as the license asks

   Pages link it with <link rel="stylesheet" href="/fonts/fonts.css">. The family names are the ones the pages' CSS
   already uses (the variable fonts are renamed from "Inter Variable" and "Newsreader Variable").
   `--check` writes nothing and exits 1 when site/fonts is out of date (npm run test:seo runs it). */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Every family and weight a page asks for (the union of what the Google Fonts links asked for). */
export const FAMILIES = [
  { name: "Inter", pkg: "@fontsource-variable/inter", css: ["index.css"], from: "Inter Variable" },                 // 400 to 600, one variable file
  { name: "Newsreader", pkg: "@fontsource-variable/newsreader", css: ["opsz.css", "opsz-italic.css"], from: "Newsreader Variable" }, // opsz 6 to 72, 300 to 500, roman and italic
  { name: "Noto Sans SC", pkg: "@fontsource/noto-sans-sc", css: ["400.css", "500.css", "600.css"] },
  { name: "Noto Serif SC", pkg: "@fontsource/noto-serif-sc", css: ["400.css", "500.css"] },
  { name: "IBM Plex Mono", pkg: "@fontsource/ibm-plex-mono", css: ["400.css", "500.css"] },
];
/** A face is kept when its subset is latin, latin-ext, or one of the numbered Chinese chunks ([0] to [119]). */
const KEEP = subset => subset === "latin" || subset === "latin-ext" || /^\[\d+\]$/.test(subset);

const OUT = "site/fonts", FILES = join(OUT, "files"), LIC = join(OUT, "LICENSES");
const CHECK = process.argv.includes("--check");

export function build(root = "node_modules") {
  const files = new Map(); // file name -> source path
  const css = [`/* Self-hosted fonts (npm run fonts, from the @fontsource packages). Licenses: /fonts/LICENSES/. */`];
  const licenses = new Map();
  for (const f of FAMILIES) {
    const faces = []; // { subset, text }, put in order below
    const dir = join(root, f.pkg);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (pkg.license !== "OFL-1.1") throw new Error(`${f.pkg} is licensed ${pkg.license}, not the SIL Open Font License: check it before shipping`);
    licenses.set(f.name, `${f.name} (${f.pkg} ${pkg.version}, ${pkg.license})\n\n${readFileSync(join(dir, "LICENSE"), "utf8").trim()}\n`);
    for (const sheet of f.css) {
      const src = readFileSync(join(dir, sheet), "utf8");
      const rules = [...src.matchAll(/\/\* ([^*]+?) \*\/\s*(@font-face\s*\{[^}]*\})/g)];
      if (!rules.length) throw new Error(`${f.pkg}/${sheet}: no @font-face rules`);
      let kept = 0;
      for (const [, label, face] of rules) {
        // labels look like "inter-latin-ext-wght-normal" or "noto-sans-sc-[42]-400-normal"
        const m = /-(\[\d+\]|latin-ext|latin|cyrillic-ext|cyrillic|greek-ext|greek|vietnamese|math|symbols)-(?:wght|opsz|standard|\d{3})-/.exec(label);
        if (!m) throw new Error(`${f.pkg}/${sheet}: can't tell the subset of "${label}"`);
        if (!KEEP(m[1])) continue;
        let rule = face
          .replace(/,\s*url\(\.\/files\/[^)]+\.woff\) format\('woff'\)/g, "")
          .replace(/url\(\.\/files\/([^)]+\.woff2)\)/g, (_x, file) => { files.set(file, join(dir, "files", file)); return `url(files/${file})`; });
        if (f.from) rule = rule.replace(`font-family: '${f.from}'`, `font-family: '${f.name}'`);
        if (!rule.includes(`font-family: '${f.name}'`)) throw new Error(`${f.pkg}/${sheet}: "${label}" isn't ${f.name}`);
        if (!/font-display:\s*swap/.test(rule)) throw new Error(`${f.pkg}/${sheet}: "${label}" has no font-display: swap`);
        if (!/unicode-range:/.test(rule)) throw new Error(`${f.pkg}/${sheet}: "${label}" has no unicode-range`);
        faces.push({ subset: m[1], text: `/* ${label} */\n${rule}` });
        kept++;
      }
      if (!kept) throw new Error(`${f.pkg}/${sheet}: no latin or Chinese faces kept`);
    }
    // the same chunk's weights side by side: their unicode-ranges are identical, so gzip (a 32 KB window) finds the
    // repeat and fonts.css compresses about as well under gzip as under brotli. The order doesn't change which face
    // a browser picks.
    const first = new Map(); faces.forEach((x, i) => { if (!first.has(x.subset)) first.set(x.subset, i); });
    faces.sort((a, b) => first.get(a.subset) - first.get(b.subset));
    css.push(...faces.map(x => x.text));
  }
  return { css: css.join("\n") + "\n", files, licenses };
}

const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

if (import.meta.url === `file://${process.argv[1]}`) {
  const { css, files, licenses } = build();
  const want = new Map([[join(OUT, "fonts.css"), Buffer.from(css)]]);
  for (const [file, src] of files) want.set(join(FILES, file), readFileSync(src));
  for (const [name, text] of licenses) want.set(join(LIC, `${slug(name)}.txt`), Buffer.from(text));
  const have = dir => (existsSync(dir) ? readdirSync(dir).map(f => join(dir, f)) : []);
  const stale = [...have(FILES), ...have(LIC)].filter(f => !want.has(f));
  const changed = [...want].filter(([f, b]) => !existsSync(f) || !readFileSync(f).equals(b)).map(([f]) => f);
  if (CHECK) {
    if (changed.length || stale.length) {
      console.error(`fonts: site/fonts is out of date (${changed.length} to write, ${stale.length} to remove, e.g. ${[...changed, ...stale].slice(0, 3).join(", ")}): run npm run fonts`);
      process.exit(1);
    }
    console.log(`fonts: site/fonts up to date (${files.size} woff2 files)`);
  } else {
    mkdirSync(FILES, { recursive: true }); mkdirSync(LIC, { recursive: true });
    for (const f of stale) rmSync(f);
    for (const f of changed) writeFileSync(f, want.get(f));
    const bytes = [...files.keys()].reduce((n, f) => n + want.get(join(FILES, f)).length, 0);
    console.log(`fonts: ${FAMILIES.length} families, ${files.size} woff2 files (${(bytes / 1048576).toFixed(1)} MB), fonts.css ${(css.length / 1024).toFixed(0)} KB, ${changed.length} written, ${stale.length} removed`);
  }
}
