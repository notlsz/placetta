/* Reads the copy and data the website's own scripts carry (the landing page's T, FAQ and TIERS; the Help Center's UI and
   articles) without running the pages: each declaration is cut out of the inline script by matching its brackets and
   evaluated on its own in an empty context. Nothing here touches a DOM. */
import vm from "node:vm";

/** The source of `const NAME = <value>;` (the value only), matched bracket by bracket, strings and comments skipped. */
export function cutDecl(src, name, from = 0) {
  const m = new RegExp(`\\bconst ${name}\\s*=\\s*`, "g"); m.lastIndex = from;
  const hit = m.exec(src); if (!hit) throw new Error(`no const ${name}`);
  let i = hit.index + hit[0].length, depth = 0; const start = i;
  if (src[i] === '"' || src[i] === "'" || src[i] === "`") { const e = skipString(src, i); return { code: src.slice(start, e + 1), end: e + 1 }; }
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") { i = skipString(src, i); continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") { depth--; if (depth === 0) return { code: src.slice(start, i + 1), end: i + 1 }; }
  }
  throw new Error(`unbalanced const ${name}`);
}
function skipString(src, i) {
  const q = src[i];
  for (i++; i < src.length; i++) {
    if (src[i] === "\\") { i++; continue; }
    if (q === "`" && src[i] === "$" && src[i + 1] === "{") { let d = 1; i += 2; for (; i < src.length && d; i++) { if (src[i] === "{") d++; else if (src[i] === "}") d--; else if (src[i] === '"' || src[i] === "'" || src[i] === "`") i = skipString(src, i); } i--; continue; }
    if (src[i] === q) return i;
  }
  return i;
}
const run = (code, ctx = {}) => vm.runInNewContext(code, ctx, { timeout: 2000 });

/** The landing page: final English and Chinese copy (T after the dated Object.assign blocks and the PROOF-gated CLAIMS),
 *  the FAQ and the price tiers. */
export function landingData(html) {
  const T0 = cutDecl(html, "T");
  const ctx = { T: run("(" + T0.code + ")") };
  // every Object.assign(T.xx, {...}); in source order
  const re = /Object\.assign\(T\.(en|zh),\s*/g; let m;
  while ((m = re.exec(html))) {
    let i = m.index + m[0].length, depth = 0, s = i;
    for (; i < html.length; i++) { const c = html[i]; if (c === '"' || c === "'" || c === "`") { i = skipString(html, i); continue; } if (c === "{") depth++; else if (c === "}") { depth--; if (!depth) break; } }
    Object.assign(ctx.T[m[1]], run("(" + html.slice(s, i + 1) + ")"));
  }
  const PROOF = run("(" + cutDecl(html, "PROOF").code + ")"), CLAIMS = run("(" + cutDecl(html, "CLAIMS").code + ")");
  for (const f in CLAIMS) if (PROOF[f]) for (const l of ["en", "zh"]) Object.assign(ctx.T[l], CLAIMS[f][l]);
  const FAQ = run("(" + cutDecl(html, "FAQ").code + ")"), TIERS = run("(" + cutDecl(html, "TIERS").code + ")");
  return { T: ctx.T, FAQ, TIERS };
}

/** The Help Center: its UI strings, sections and articles, the start and featured lists and the icons. */
export function helpData(html) {
  const names = ["UI", "IC", "CHEV", "S", "START", "FEAT"];
  const out = {};
  let code = "";
  for (const n of names) code += `const ${n} = ${cutDecl(html, n).code};\n`;
  // AIC refers to IC, so it's evaluated after it
  code += `const AIC = ${cutDecl(html, "AIC").code};\n({ ${[...names, "AIC"].join(", ")} })`;
  Object.assign(out, run(code));
  return out;
}
