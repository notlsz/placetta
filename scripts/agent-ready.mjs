#!/usr/bin/env node
/* The website for AI agents and feed readers, made from the built site (runs after vite build; `npm run build` does it).
   - A Markdown copy of every public page next to it: /index.md, /zh.md, /guides/<city>/<business>.md,
     /help/<section>/<article>/index.md, and so on. Each page names its copy with
     <link rel="alternate" type="text/markdown">, and llms.txt says the rule.
   - /feed.xml (Atom) and /rss.xml (RSS 2.0): the news, and the guides and help articles most recently changed, with the
     dates their own structured data carries. Every page names /feed.xml with <link rel="alternate">.
   Nothing here changes what a person sees. The app (dist/app) is left alone.
   Usage: node scripts/agent-ready.mjs [dist] */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = "https://www.placetta.com";
const FEED_MAX = 60;

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", middot: "·", copy: "©", times: "×", rarr: "→", larr: "←" };
export const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Removes every element whose opening tag matches `open` (with its content), counting nested tags of the same name. */
function dropElements(html, open) {
  let out = "", last = 0, m;
  const re = new RegExp(open.source, "gi");
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    if (VOID.has(tag) || m[0].endsWith("/>")) { out += html.slice(last, m.index); last = m.index + m[0].length; continue; }
    const t = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, "gi"); t.lastIndex = m.index + m[0].length; let d = 1, x;
    while ((x = t.exec(html))) { if (x[1]) { if (!--d) break; } else if (!x[0].endsWith("/>")) d++; }
    out += html.slice(last, m.index); last = x ? x.index + x[0].length : html.length; re.lastIndex = last;
  }
  return out + html.slice(last);
}

const inline = h => decode(h
  .replace(/<br\s*\/?>/gi, "  \n")
  .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => (t.trim() ? `**${t.trim()}**` : ""))
  .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => (t.trim() ? `*${t.trim()}*` : ""))
  .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => "`" + t + "`")
  .replace(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => { const w = t.replace(/<[^>]+>/g, "").trim(); if (!w) return ""; if (/^(javascript|data):/i.test(href) || href.startsWith("#")) return w; return `[${w}](${href.startsWith("/") ? ORIGIN + href : href})`; })
  .replace(/<[^>]+>/g, ""))
  .replace(/[ \t\f\v\r\n]+/g, " ").replace(/ {2}\n/g, "\n").trim();

/** A page's content as Markdown: headings, paragraphs, lists, tables, quotes and links; no scripts, styles, navigation,
 *  forms or hidden blocks. */
export function toMarkdown(html) {
  let h = html;
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(h); if (main) h = main[1]; else { const b = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(h); if (b) h = b[1]; }
  h = h.replace(/<!--[\s\S]*?-->/g, "");
  h = dropElements(h, /<(script|style|svg|noscript|template|nav|header|footer|form|button|select|textarea|dialog|iframe|video|audio|canvas|picture|figure)\b[^>]*>/);
  h = dropElements(h, /<([a-z][a-z0-9]*)\b[^>]*\s(?:hidden|aria-hidden="true")(?:=""|\b)[^>]*>/);
  const out = [];
  // tables first, as pipe tables
  h = h.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, t) => {
    const rows = [...t.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => [...r[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => inline(c[1]).replace(/\|/g, "\\|")));
    if (!rows.length) return "";
    const n = Math.max(...rows.map(r => r.length));
    const line = r => `| ${[...r, ...Array(n - r.length).fill("")].join(" | ")} |`;
    return `\n\n@@BLOCK${out.push([line(rows[0]), `|${" --- |".repeat(n)}`, ...rows.slice(1).map(line)].join("\n")) - 1}@@\n\n`;
  });
  h = h.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => `\n\n@@BLOCK${out.push("```\n" + decode(t.replace(/<[^>]+>/g, "")).trim() + "\n```") - 1}@@\n\n`);
  h = h.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => { const w = inline(t); return w ? `\n\n${"#".repeat(Number(l))} ${w}\n\n` : ""; });
  h = h.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => { const w = inline(t.replace(/<\/?(ul|ol)\b[^>]*>/gi, " ")); return w ? `\n- ${w}` : ""; });
  h = h.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => `\n\n> ${inline(t)}\n\n`);
  h = h.replace(/<(p|div|section|article|aside|dl|dt|dd|ul|ol|summary|details|caption|address)\b[^>]*>/gi, "\n\n").replace(/<\/(p|div|section|article|aside|dl|dt|dd|ul|ol|summary|details|caption|address)>/gi, "\n\n");
  const md = h.split(/\n{2,}/).map(block => {
    const b = block.trim();
    if (!b) return "";
    if (/^@@BLOCK\d+@@$/.test(b)) return out[Number(b.slice(7, -2))];
    if (/^#{1,6} /.test(b)) return b;
    if (b.split("\n").every(l => l.startsWith("- ") || !l.trim())) return b.split("\n").filter(l => l.trim()).join("\n");
    if (b.startsWith("> ")) return b;
    return inline(b);
  }).filter(Boolean).join("\n\n");
  return md.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const meta = (h, attr, name) => decode((h.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`)) ?? [])[1] ?? "");
const canonicalOf = h => (h.match(/<link rel="canonical" href="([^"]*)"/) ?? [])[1] ?? null;
function dates(h) {
  const d = { published: null, modified: null };
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const walk = o => { if (!o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(walk);
        if (typeof o.dateModified === "string" && (!d.modified || o.dateModified > d.modified)) d.modified = o.dateModified;
        if (typeof o.datePublished === "string" && (!d.published || o.datePublished < d.published)) d.published = o.datePublished;
        Object.values(o).forEach(walk); };
      walk(JSON.parse(m[1]));
    } catch { /* not JSON */ }
  }
  return d;
}
const xml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const iso = d => (d.length === 10 ? d + "T00:00:00Z" : d);

export function run(dist = "dist") {
  const pages = [];
  const walk = dir => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (p !== join(dist, "app") && p !== join(dist, "js")) walk(p); } else if (p.endsWith(".html")) pages.push(p); } };
  walk(dist);
  const FEED_LINK = `<link rel="alternate" type="application/atom+xml" title="Placetta: news, guides and help" href="/feed.xml">`;
  const entries = [];
  let mds = 0;
  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    const canonical = canonicalOf(html);
    if (!canonical || !canonical.startsWith(ORIGIN) || /<meta name="robots" content="[^"]*noindex/i.test(html)) continue;
    const rel = file.slice(dist.length);                       // /guides/x/y.html, /help/a/b/index.html, /index.html
    const mdPath = rel.replace(/\.html$/, ".md");
    const title = decode((html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? "").trim();
    const desc = meta(html, "name", "description");
    const body = toMarkdown(html);
    const d = dates(html);
    const head = [`# ${title}`, "", `Source: ${canonical}`, ...(d.modified ? [`Last changed: ${d.modified.slice(0, 10)}`] : []), ...(desc ? ["", `> ${desc}`] : []), ""].join("\n");
    writeFileSync(join(dist, mdPath), head + "\n" + body);
    mds++;
    const links = `<link rel="alternate" type="text/markdown" href="${mdPath}">\n${FEED_LINK}`;
    // right after the canonical link: every indexed page has one, and some pages leave out </head>
    if (!html.includes(`type="text/markdown"`)) writeFileSync(file, html.replace(/<link rel="canonical" href="[^"]*">/, m => `${m}\n${links}`));
    const kind = rel.startsWith("/news/") ? "news" : rel.startsWith("/guides/") ? "guide" : rel.startsWith("/help/") && rel !== "/help/index.html" ? "help" : null;
    if (kind && d.modified) entries.push({ kind, title, url: canonical, summary: desc, updated: d.modified, published: d.published ?? d.modified });
  }
  // the news always; then the most recently changed guides and help articles (newest first, then by address, so the same
  // build gives the same feed)
  const byDate = (a, b) => b.updated.localeCompare(a.updated) || a.url.localeCompare(b.url);
  const news = entries.filter(e => e.kind === "news").sort(byDate);
  // every help article (there are a few dozen), then the newest guides in what's left (English; the Chinese guides
  // mirror them)
  const help = entries.filter(e => e.kind === "help").sort(byDate);
  const guides = entries.filter(e => e.kind === "guide" && !/\/guides\/zh\//.test(e.url)).sort(byDate).slice(0, Math.max(10, FEED_MAX - news.length - help.length));
  const feed = [...news, ...help, ...guides].sort(byDate);
  const updated = feed.length ? iso(feed[0].updated) : new Date(0).toISOString();
  writeFileSync(join(dist, "feed.xml"), `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Placetta: news, license guides and help</title>
<subtitle>What Placetta announces, and the license guides and help articles that changed most recently.</subtitle>
<link rel="self" type="application/atom+xml" href="${ORIGIN}/feed.xml"/>
<link rel="alternate" type="text/html" href="${ORIGIN}/"/>
<id>${ORIGIN}/feed.xml</id>
<updated>${updated}</updated>
<author><name>Placetta</name><uri>${ORIGIN}/</uri></author>
${feed.map(e => `<entry>
<title>${xml(e.title)}</title>
<link rel="alternate" type="text/html" href="${xml(e.url)}"/>
<link rel="alternate" type="text/markdown" href="${xml(e.url.replace(/\.html$/, ".md").replace(/\/$/, "/index.md"))}"/>
<id>${xml(e.url)}</id>
<published>${iso(e.published)}</published>
<updated>${iso(e.updated)}</updated>
<category term="${e.kind}"/>
<summary>${xml(e.summary)}</summary>
</entry>`).join("\n")}
</feed>
`);
  const rfc822 = d => new Date(iso(d)).toUTCString();
  writeFileSync(join(dist, "rss.xml"), `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>Placetta: news, license guides and help</title>
<link>${ORIGIN}/</link>
<description>What Placetta announces, and the license guides and help articles that changed most recently.</description>
<atom:link href="${ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>
<lastBuildDate>${rfc822(updated)}</lastBuildDate>
${feed.map(e => `<item>
<title>${xml(e.title)}</title>
<link>${xml(e.url)}</link>
<guid isPermaLink="true">${xml(e.url)}</guid>
<pubDate>${rfc822(e.updated)}</pubDate>
<category>${e.kind}</category>
<description>${xml(e.summary)}</description>
</item>`).join("\n")}
</channel>
</rss>
`);
  return { pages: mds, feed: feed.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] ?? "dist";
  if (!existsSync(dist)) { console.error(`agent-ready: no ${dist}/; run vite build first`); process.exit(1); }
  const r = run(dist);
  console.log(`agent-ready: ${r.pages} Markdown pages, ${r.feed} feed entries`);
}
