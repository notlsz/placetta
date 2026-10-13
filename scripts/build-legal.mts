// Publishes the legal text in src/legal.ts everywhere else it appears, so there is one source:
//   legal/<id>.md                         Markdown copies (English, then Chinese)
//   site/terms.html, privacy.html,        the website's pages, in the shell of site/terms.html
//   authorization.html, ai.html
// It also checks that the English and Chinese headings line up and that no em or en dash slipped in.
// Run: node scripts/build-legal.mts   (Node 22.18+ runs TypeScript directly)
import { readFileSync, writeFileSync } from "node:fs";
import { LEGAL, type LegalDoc } from "../src/legal.ts";

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
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }

/* ------------------------------ Markdown ------------------------------ */

for (const d of LEGAL) {
  const md = `# ${d.title.en}\n\nLast updated: ${d.updated}\n\n${d.body.en.trim()}\n\n## 中文\n\n# ${d.title.zh}\n\n最后更新：${d.updated}\n\n${d.body.zh.trim()}\n`;
  writeFileSync(`legal/${d.id}.md`, md);
}

/* ------------------------------ website ------------------------------ */

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
/** Same rule as the app (src/Legal.tsx): bare URLs and emails become links, nothing else. */
const linkify = (s: string) => s.split(/(https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]+)/g).map(p =>
  /^https?:\/\//.test(p) ? `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(p.replace(/^https?:\/\//, ""))}</a>`
  : /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(p) ? `<a href="mailto:${esc(p)}">${esc(p)}</a>` : esc(p)).join("");

/** The body markup ("## " headings, "- " bullets, paragraphs) as HTML, the way the app renders it. */
function bodyHtml(text: string): string {
  return text.trim().split(/\n\s*\n/).map(blk => {
    const lines = blk.split("\n");
    if (lines.every(l => l.startsWith("- "))) return `<ul class="dot">\n${lines.map(l => `<li>${linkify(l.slice(2))}</li>`).join("\n")}\n</ul>`;
    if (lines[0].startsWith("## ")) return `<h2>${esc(lines[0].slice(3))}</h2>${lines.length > 1 ? `\n<p>${linkify(lines.slice(1).join(" "))}</p>` : ""}`;
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

console.log(`legal: ${LEGAL.length} documents, updated ${LEGAL[0].updated}, written to legal/*.md and site/*.html`);
