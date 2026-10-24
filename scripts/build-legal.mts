// Publishes the legal text in src/legal.ts everywhere else it appears, so there is one source:
//   legal/<id>.md                         Markdown copies (English, then Chinese)
//   site/terms.html, privacy.html,        the website's pages, in the shell of site/terms.html
//   authorization.html, ai.html
//   site/trust.html                       only its shell (head, header, footer); its text is written by hand
// It also checks that the English and Chinese headings and **bold** spans line up, that every ** is closed, that no em or
// en dash slipped in, and that the version people accept in the app (public.current_terms_version() in the newest
// migration that defines it) is UPDATED.
// Run: node scripts/build-legal.mts   (Node 22.18+ runs TypeScript directly)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { LEGAL, UPDATED, type LegalDoc } from "../src/legal.ts";

// An anchor for an English heading, so other pages can link to a section (/terms#plans-and-billing).
const slug = (h: string) => { const id = h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); return /^[a-z]/.test(id) ? ` id="${id}"` : ""; };

type Lang = "en" | "zh";
const PAGE: Record<LegalDoc["id"], { file: string; desc: Record<Lang, string> }> = {
  terms: { file: "terms.html", desc: { en: "The terms that govern your use of Placetta.", zh: "您使用快哉须遵守的条款。" } },
  privacy: { file: "privacy.html", desc: { en: "How Placetta collects, uses and protects your information.", zh: "快哉如何收集、使用和保护您的信息。" } },
  authorization: { file: "authorization.html", desc: { en: "The limited authority you give Placetta to file for your business.", zh: "您授予快哉为您的企业代为申报的有限权限。" } },
  ai: { file: "ai.html", desc: { en: "What Placetta's AI agent does, and where its limits are.", zh: "快哉的 AI 智能体能做什么，以及它的局限。" } },
};

const problems: string[] = [];
for (const d of LEGAL) {
  const heads = (l: Lang) => d.body[l].split("\n").filter(s => s.startsWith("## ")).length;
  if (heads("en") !== heads("zh")) problems.push(`${d.id}: ${heads("en")} English headings, ${heads("zh")} Chinese`);
  for (const l of ["en", "zh"] as Lang[]) if (/[–—]/.test(d.body[l] + d.title[l])) problems.push(`${d.id} (${l}): has an en or em dash`);
  for (const l of ["en", "zh"] as Lang[]) d.body[l].split(/\n\s*\n/).forEach(blk => blk.split("\n").forEach(line => {
    if ((line.match(/\*\*/g) ?? []).length % 2) problems.push(`${d.id} (${l}): unclosed ** in "${line.slice(0, 60)}"`);
  }));
  const bolds = (l: Lang) => (d.body[l].match(/\*\*/g) ?? []).length / 2;
  if (bolds("en") !== bolds("zh")) problems.push(`${d.id}: ${bolds("en")} English bold spans, ${bolds("zh")} Chinese`);
}
const defs = readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()
  .map(f => /function public\.current_terms_version\(\)[\s\S]*?select '([^']+)'/.exec(readFileSync(`supabase/migrations/${f}`, "utf8"))?.[1]).filter(Boolean);
if (defs.at(-1) !== UPDATED) problems.push(`public.current_terms_version() is ${defs.at(-1) ?? "missing"} in the migrations, UPDATED is ${UPDATED}: add a migration that returns '${UPDATED}'`);
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }

/* ------------------------------ Markdown ------------------------------ */

for (const d of LEGAL) {
  const md = `# ${d.title.en}\n\nLast updated: ${d.updated}\n\n${d.body.en.trim()}\n\n## 中文\n\n# ${d.title.zh}\n\n最后更新：${d.updated}\n\n${d.body.zh.trim()}\n`;
  writeFileSync(`legal/${d.id}.md`, md);
}

/* ------------------------------ website ------------------------------ */

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
/** Same rule as the app (src/Legal.tsx): bare URLs and emails become links, **text** is bold, nothing else. */
const links = (s: string) => s.split(/(https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]+)/g).map(p =>
  /^https?:\/\//.test(p) ? `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(p.replace(/^https?:\/\//, ""))}</a>`
  : /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(p) ? `<a href="mailto:${esc(p)}">${esc(p)}</a>` : esc(p)).join("");
const linkify = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? `<strong>${links(p)}</strong>` : links(p))).join("");

/** The body markup ("## " headings, "- " bullets, paragraphs, **bold**) as HTML, the way the app renders it. */
function bodyHtml(text: string): string {
  return text.trim().split(/\n\s*\n/).map(blk => {
    const lines = blk.split("\n");
    if (lines.every(l => l.startsWith("- "))) return `<ul class="dot">\n${lines.map(l => `<li>${linkify(l.slice(2))}</li>`).join("\n")}\n</ul>`;
    if (lines[0].startsWith("## ")) return `<h2${slug(lines[0].slice(3))}>${esc(lines[0].slice(3))}</h2>${lines.length > 1 ? `\n<p>${linkify(lines.slice(1).join(" "))}</p>` : ""}`;
    return `<p>${linkify(lines.join(" "))}</p>`;
  }).join("\n");
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const day = (iso: string, l: Lang) => { const [y, m, d] = iso.split("-").map(Number); return l === "zh" ? `${y}年${m}月${d}日` : `${MONTHS[m - 1]} ${d}, ${y}`; };

// The shell (head, header, footer) is site/terms.html's: everything outside <main>, with the title and description swapped.
const shellSrc = readFileSync("site/terms.html", "utf8");
const a = shellSrc.indexOf('<main class="lw">'), b = shellSrc.indexOf("</main>");
if (a < 0 || b < 0) { console.error("site/terms.html: no <main class=\"lw\"> ... </main> to replace"); process.exit(1); }
const head = shellSrc.slice(0, a), tail = shellSrc.slice(b + "</main>".length);

for (const d of LEGAL) {
  const p = PAGE[d.id];
  const art = (l: Lang) => `<article data-block="${l}" lang="${l === "zh" ? "zh-CN" : "en"}" data-title="${esc(d.title[l])} | ${l === "zh" ? "快哉" : "Placetta"}"${l === "zh" ? " hidden" : ""}>
<h1>${esc(d.title[l])}</h1>
<p class="upd">${l === "zh" ? `最后更新：${day(d.updated, l)}` : `Last updated: ${day(d.updated, l)}`}</p>
${bodyHtml(d.body[l])}
</article>`;
  const page = head
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(d.title.en)} | Placetta</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(p.desc.en)}">`)
    + `<main class="lw">\n${art("en")}\n${art("zh")}\n</main>` + tail;
  writeFileSync(`site/${p.file}`, page);
}

// The trust page (site/trust.html) is written by hand, but wears the same shell: its <main> is kept, and the head,
// header and footer around it are refreshed from site/terms.html so its links stay in step with the legal pages.
const trustSrc = readFileSync("site/trust.html", "utf8");
const ta = trustSrc.indexOf('<main class="lw">'), tb = trustSrc.indexOf("</main>");
if (ta < 0 || tb < 0) { console.error("site/trust.html: no <main class=\"lw\"> ... </main> to keep"); process.exit(1); }
writeFileSync("site/trust.html", head
  .replace(/<title>[^<]*<\/title>/, "<title>Trust and security | Placetta</title>")
  .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc("How Placetta protects your business's data, and which companies process it.")}">`)
  + trustSrc.slice(ta, tb + "</main>".length) + tail);

console.log(`legal: ${LEGAL.length} documents, updated ${LEGAL[0].updated}, written to legal/*.md and site/*.html (and the trust page's shell)`);
