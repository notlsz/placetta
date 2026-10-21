#!/usr/bin/env node
/* npm run test:seo: crawls site/ the way a search or AI crawler that runs no JavaScript does, and checks what it finds.
   One line per check, exits 1 on any failure. What it covers (the websiteaiscore and searchscore rubrics, plus our rules):
   crawler access (robots.txt, no stray noindex), the sitemap index and its lastmods, llms.txt matching the real coverage,
   the IndexNow key, a real 404, one origin everywhere (scripts/seo/config.mjs), and on every page: one h1, title and
   description, canonical, Open Graph and Twitter cards, heading order, JSON-LD that parses and links to the Organization,
   FAQ markup that matches the visible questions word for word, Article dates and authors, reciprocal hreflang, answer-first
   openings and tables on the guides, and the landing page's copy, FAQ and definition readable without JavaScript.
   It also runs `node scripts/seo/build.mjs --check`, so a page that wasn't rebuilt fails here. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { ORG_ID, ORIGIN } from "./seo/config.mjs";

let fails = 0, passes = 0;
const results = [];
function check(name, ok, detail = "") { if (ok) passes++; else { fails++; results.push(`FAIL ${name}${detail ? `: ${String(detail).slice(0, 400)}` : ""}`); } }
const group = (name, fn) => { const before = fails; fn(); console.log(`${fails === before ? "ok  " : "FAIL"} ${name}`); };

const read = f => readFileSync(f, "utf8");
const strip = h => h.replace(/<(script|style|svg|noscript|template|textarea)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const norm = s => s.replace(/\s+/g, " ").trim();
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** The page without elements carrying the hidden attribute (alternate-language blocks, closed views). */
function visible(html) {
  const re = /<([a-zA-Z0-9]+)\b[^>]*\shidden(?:=""|\b)[^>]*>/g; let m, out = "", last = 0;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase(); if (VOID.has(tag)) continue;
    const t = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, "gi"); t.lastIndex = m.index + m[0].length; let d = 1, x;
    while ((x = t.exec(html))) { if (x[1]) { if (!--d) break; } else if (!x[0].endsWith("/>")) d++; }
    out += html.slice(last, m.index); last = x ? x.index + x[0].length : html.length; re.lastIndex = last;
  }
  return out + html.slice(last);
}
const bodyOf = h => { const i = h.search(/<body\b/i); return (i >= 0 ? h.slice(i) : h.slice(h.indexOf("</style>") + 8)).replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, ""); };
const metaOf = (h, attr, name) => (h.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`)) ?? [])[1];
const linkOf = (h, rel) => (h.match(new RegExp(`<link rel="${rel}" href="([^"]*)"`)) ?? [])[1];
const lds = h => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
const fileFor = url => { const p = new URL(url).pathname; const map = { "/trust": "/trust.html" }; const q = map[p] ?? p; return "site" + (q.endsWith("/") ? q + "index.html" : q); };
const urlFor = file => ORIGIN + file.slice(4).replace(/index\.html$/, "").replace(/^\/trust\.html$/, "/trust");
const DATE = /^\d{4}-\d\d-\d\d(T[\d:.]+(Z|[+-]\d\d:\d\d)?)?$/;
const today = new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------ the files every crawler reads */
group("robots.txt: everything open but /app/, sitemap on the origin", () => {
  const r = read("site/robots.txt");
  check("robots has a * group", /User-agent: \*\nAllow: \/\nDisallow: \/app\/\n/.test(r));
  check("robots blocks nothing else", !/Disallow: \/\s*$/m.test(r) && [...r.matchAll(/Disallow: (\S+)/g)].every(m => m[1] === "/app/"), r.match(/Disallow: .*/g));
  check("robots names the sitemap", r.includes(`Sitemap: ${ORIGIN}/sitemap.xml`));
  for (const bot of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Bingbot", "Baiduspider"]) check(`robots welcomes ${bot}`, r.includes(`User-agent: ${bot}\nAllow: /`));
});

const sitemapUrls = new Map(); // url -> lastmod
group("sitemap index split by type, every URL live, dated and canonical", () => {
  const idx = read("site/sitemap.xml");
  check("sitemap.xml is an index", idx.includes("<sitemapindex"));
  const kids = [...idx.matchAll(/<sitemap><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/sitemap>/g)];
  check("index lists at least 5 sitemaps", kids.length >= 5, kids.length);
  for (const [, loc, lm] of kids) {
    check(`child on origin ${loc}`, loc.startsWith(ORIGIN + "/sitemaps/"));
    check(`child lastmod ${loc}`, DATE.test(lm) && lm <= today, lm);
    const f = "site" + new URL(loc).pathname; check(`child exists ${f}`, existsSync(f));
    if (!existsSync(f)) continue;
    for (const m of read(f).matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)) sitemapUrls.set(m[1], m[2]);
  }
  let bad = [];
  for (const [u, lm] of sitemapUrls) {
    if (!u.startsWith(ORIGIN + "/")) bad.push("off origin " + u);
    else if (!lm || !DATE.test(lm) || lm > today) bad.push("lastmod " + u);
    else if (!existsSync(fileFor(u))) bad.push("missing " + u);
  }
  check("every sitemap URL is on the origin, dated and has a file", !bad.length, bad.slice(0, 5));
  check("sitemaps hold the website and the guides", sitemapUrls.has(ORIGIN + "/") && sitemapUrls.has(ORIGIN + "/about.html") && sitemapUrls.has(ORIGIN + "/guides/") && sitemapUrls.size > 1000, sitemapUrls.size);
});

const data = JSON.parse(read("site/guides/data.json"));
group("llms.txt and llms-full.txt match the real coverage", () => {
  const t = read("site/llms.txt"), full = read("site/llms-full.txt"), cov = data.coverage;
  check("llms.txt starts with the name and a summary", /^# Placetta\n\n> /.test(t));
  check("llms.txt states the real city count", t.includes(`${cov.cities} cities in ${cov.countries} countries`) && !/\b66 cities\b/.test(t), (t.match(/\d+ cities/g) || []).join(","));
  check("llms.txt states the real form count", t.includes(`${cov.official_forms} official forms`));
  const links = [...t.matchAll(/\]\((https?:[^)]+)\)/g)].map(m => m[1]);
  const off = links.filter(u => !u.startsWith(ORIGIN + "/")), missing = links.filter(u => u.startsWith(ORIGIN) && !/\.(txt|json)$/.test(u) && !existsSync(fileFor(u)));
  check("llms.txt links are on the origin", !off.length, off.slice(0, 3));
  check("llms.txt links all resolve", !missing.length, missing.slice(0, 3));
  check("llms.txt links About, editorial policy and pricing", t.includes("/about.html") && t.includes("/editorial.html") && t.includes("## Pricing"));
  check("llms-full.txt has the guides", full.split("\n### ").length > 100);
});

group("IndexNow key and a real 404", () => {
  const keys = readdirSync("site").filter(f => /^[0-9a-f]{32}\.txt$/.test(f));
  check("one IndexNow key file whose content is its name", keys.length === 1 && read("site/" + keys[0]).trim() === keys[0].slice(0, 32), keys);
  check("IndexNow workflow runs on production deploys", existsSync(".github/workflows/indexnow.yml") && read(".github/workflows/indexnow.yml").includes("deployment_status"));
  const nf = read("site/404.html");
  check("404.html exists and is noindex", /<meta name="robots" content="noindex/.test(nf));
  const v = JSON.parse(read("vercel.json"));
  check("no catch-all rewrite turns missing pages into 200s", !(v.rewrites ?? []).some(r => /^\/(\(\.\*\)|:path\*|\*)$/.test(r.source)), (v.rewrites ?? []).map(r => r.source));
  check("help articles are real files, not only a rewrite", readdirSync("site/help").some(f => statSync("site/help/" + f).isDirectory()));
});

group("every page is in sync with npm run seo", () => {
  try { execFileSync("node", ["scripts/seo/build.mjs", "--check"], { stdio: "pipe" }); check("seo --check", true); }
  catch (e) { check("seo --check", false, String(e.stdout) + String(e.stderr)); }
});

/* ------------------------------------------------------------ every page */
function walk(d, out = []) { for (const f of readdirSync(d)) { const p = d + "/" + f; if (statSync(p).isDirectory()) { if (f !== "app" && f !== "sponsors") walk(p, out); } else if (p.endsWith(".html")) out.push(p); } return out; }
const files = walk("site").filter(f => !/\/404\.html$/.test(f) && !/^site\/(app|legal)\//.test(f));
const pages = new Map(files.map(f => [f, read(f)]));
const hostRe = /https?:\/\/(?:www\.)?placetta\.com/g;

group(`every page (${files.length}): one h1, title, description, canonical, cards, JSON-LD, one origin`, () => {
  const bad = {};
  const note = (k, f) => { (bad[k] ??= []).push(f); };
  for (const [f, h] of pages) {
    const v = visible(h), b = bodyOf(v);
    const h1 = (b.match(/<h1\b/g) ?? []).length; if (h1 !== 1) note("one visible h1", `${f} (${h1})`);
    const title = (h.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? ""; if (title.length < 10 || title.length > 130) note("title 10-130 chars", `${f} "${title}"`);
    const desc = metaOf(h, "name", "description") ?? ""; const zh = /<html lang="zh-CN">/.test(h), lo = zh ? 18 : 40; if (desc.length < lo || desc.length > 320) note("description 40-320 chars (18 for Chinese)", `${f} (${desc.length})`);
    if ((h.match(/<meta name="description"/g) ?? []).length !== 1 || (h.match(/<link rel="canonical"/g) ?? []).length !== 1) note("one description and one canonical", f);
    const canon = linkOf(h, "canonical"); if (canon !== urlFor(f)) note("canonical is the page's own URL on the origin", `${f} ${canon}`);
    const robots = metaOf(h, "name", "robots") ?? ""; if (sitemapUrls.has(urlFor(f)) && /noindex/.test(robots)) note("no noindex on a sitemap page", f);
    if (!/noindex/.test(robots) && !sitemapUrls.has(urlFor(f))) note("every indexable page is in a sitemap", f);
    for (const [a, n] of [["property", "og:title"], ["property", "og:description"], ["property", "og:image"], ["property", "og:url"], ["name", "twitter:card"]]) if (!metaOf(h, a, n)) note(`${n} present`, f);
    if (metaOf(h, "property", "og:url") && metaOf(h, "property", "og:url") !== canon) note("og:url equals canonical", f);
    const hosts = [...new Set((h.match(/<head>[\s\S]*?<\/head>|<!-- seo:head -->[\s\S]*?<!-- \/seo:head -->/g) ?? []).join("").match(hostRe) ?? [])];
    if (hosts.some(x => x !== ORIGIN)) note("one origin in the head", `${f} ${hosts}`);
    // heading order: never skip a level going down
    let prev = 0; for (const m of b.matchAll(/<h([1-6])\b/g)) { const n = +m[1]; if (prev && n > prev + 1) { note("heading levels don't skip", `${f} h${prev}->h${n}`); break; } prev = n; }
    const blocks = lds(h); if (!blocks.length) note("has JSON-LD", f);
    for (const s of blocks) {
      let j; try { j = JSON.parse(s); } catch (e) { note("JSON-LD parses", `${f} ${e.message}`); continue; }
      if (j["@context"] !== "https://schema.org" || !j["@type"]) { note("JSON-LD has @context and @type", f); continue; }
      const txt = JSON.stringify(j); for (const u of txt.match(hostRe) ?? []) if (u !== ORIGIN) { note("JSON-LD on the origin", f); break; }
      if (/Article$/.test(j["@type"])) {
        for (const k of ["headline", "datePublished", "dateModified", "author", "publisher", "image"]) if (!j[k]) note(`Article has ${k}`, f);
        if (!DATE.test(j.datePublished ?? "") || !DATE.test(j.dateModified ?? "") || j.datePublished > j.dateModified) note("Article dates are ISO and in order", `${f} ${j.datePublished} ${j.dateModified}`);
        if (j.author?.["@id"] !== ORG_ID && j.author?.["@type"] !== "Person") note("Article author is the Organization entity or a Person", f);
      }
      if (j["@type"] === "FAQPage") for (const q of j.mainEntity ?? []) {
        const vis = strip(b);
        if (!vis.includes(norm(q.name))) note("FAQ question is visible on the page", `${f} "${q.name}"`);
        if (!vis.includes(norm(q.acceptedAnswer?.text ?? "").slice(0, 160))) note("FAQ answer is visible on the page", `${f} "${q.name}"`);
      }
      if (j["@type"] === "Organization" && (j["@id"] !== ORG_ID || !j.logo || !j.url)) note("Organization has @id, logo and url", f);
      if (j.sameAs && !j.sameAs.every(u => /^https:\/\//.test(u))) note("sameAs are https URLs", f);
      if (j.aggregateRating || txt.includes("AggregateRating") || txt.includes('"Review"')) note("no ratings or reviews in markup", f);
    }
    const vt = strip(b); if (/ · |•/.test(vt)) note("no dot separators in copy", f);
  }
  for (const [k, fs] of Object.entries(bad)) check(k, false, `${fs.length}: ${fs.slice(0, 4).join(" | ")}`);
  if (!Object.keys(bad).length) check("all page checks", true);
});

group("Organization entity on the landing, About and guides hub", () => {
  for (const f of ["site/index.html", "site/about.html", "site/guides/index.html"]) {
    const orgs = lds(pages.get(f)).map(s => JSON.parse(s)).filter(j => j["@type"] === "Organization");
    check(`${f} has the Organization`, orgs.length === 1 && orgs[0]["@id"] === ORG_ID && orgs[0].name === "Placetta" && orgs[0].alternateName === "快哉", orgs.length);
  }
  const site = lds(pages.get("site/index.html")).map(s => JSON.parse(s));
  check("landing has the WebSite with a SearchAction", site.some(j => j["@type"] === "WebSite" && j.potentialAction?.["@type"] === "SearchAction"));
  const svc = site.find(j => j["@type"] === "Service");
  check("landing has the Service with offers", svc && svc.hasOfferCatalog.itemListElement.length >= 5, svc?.hasOfferCatalog?.itemListElement?.length);
  const html = pages.get("site/index.html"), vis = strip(html);
  for (const o of svc?.hasOfferCatalog.itemListElement ?? []) {
    const p = o.price ?? o.priceSpecification?.minPrice; check(`offer ${o.name} price is on the page`, vis.includes("$" + Number(p).toLocaleString("en-US")), p);
  }
  check("About page has an AboutPage", lds(pages.get("site/about.html")).some(s => JSON.parse(s)["@type"] === "AboutPage"));
});

group("landing page readable without JavaScript", () => {
  const h = pages.get("site/index.html"), b = bodyOf(visible(h));
  const h1At = b.search(/<h1\b/), navAt = b.search(/<nav\b/);
  check("h1 comes before the nav", h1At >= 0 && (navAt < 0 || h1At < navAt), `${h1At} ${navAt}`);
  check("html has lang", /^<html lang="en">/.test(h) || /<html lang="en"/.test(h.slice(0, 200)));
  const empty = [...b.matchAll(/<([a-z0-9]+)[^>]*\sdata-i18n="[^"]+"[^>]*>(x?)<\/\1>/g)].filter(m => !/^(span)$/.test(m[1]) || m[2] === "x");
  check("no copy left for the script to fill (empty or 'x')", !empty.length, empty.slice(0, 3).map(m => m[0]));
  const faq = (b.match(/<div class="faq" id="faqList">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/) ?? [])[1] ?? "";
  check("FAQ is in the HTML", (faq.match(/class="fq/g) ?? []).length >= 5);
  check("description meta says what Placetta is", /^Placetta (gets|is)/.test(metaOf(h, "name", "description") ?? ""));
  check("crawlable links to the content", ["/guides/", "/about.html", "/help/"].every(p => b.includes(`href="${p}"`)) && (b.match(/href="\/guides\/[^"]+"/g) ?? []).length >= 10);
  check("hero poster preloaded", h.includes('rel="preload" as="image" href="/media/hero-poster.jpg"'));
  check("social card image exists", existsSync("site/media/og-home.png") && existsSync("site/guides/og.png"));
  check("document.title in the script matches the <title>", h.includes(`: "${(h.match(/<title>([^<]*)</) ?? [])[1]}";`));
});

group("help and trust pages readable without JavaScript", () => {
  const home = pages.get("site/help/index.html");
  check("help home cards are in the HTML", (home.match(/class="card"/g) ?? []).length >= 8);
  const arts = [...pages.keys()].filter(f => /^site\/help\/.+\/index\.html$/.test(f));
  check("a static page per help article", arts.length >= 10, arts.length);
  for (const f of arts) { const b = bodyOf(visible(pages.get(f))); if (!/<article class="art" id="art"><h1>/.test(b) || strip(b).length < 400) check(`help article rendered ${f}`, false); }
  const tr = pages.get("site/trust.html"); check("trust page text is in the HTML", strip(bodyOf(visible(tr))).length > 3000);
});

group("guides: answer first, quotable, tables, FAQ, hreflang, no thin duplicates", () => {
  const guides = [...pages.keys()].filter(f => /^site\/guides\/(?!zh\/|forms\/|answers\/|business\/|permits\/|states\/)[^/]+\/(?!index)[^/]+\.html$/.test(f));
  const bad = {}; const note = (k, f) => { (bad[k] ??= []).push(f); };
  for (const f of guides) {
    const h = pages.get(f), b = bodyOf(h);
    const dek = strip((b.match(/<p class="dek">([\s\S]*?)<\/p>/) ?? [])[1] ?? ""), words = dek.split(/\s+/).length;
    if (words < 20 || words > 90) note("opening answer is a 20-90 word passage", `${f} (${words})`);
    if (!/<table/.test(b)) note("fees and timelines in a table", f);
    if (!/\$|€|£|¥|AED|SAR|QAR|Free|Varies/.test(dek + strip(b).slice(0, 4000))) note("numbers present", f);
    const alt = (h.match(/<link rel="alternate" hreflang="zh-CN" href="([^"]+)"/) ?? [])[1];
    if (!alt || !existsSync(fileFor(alt)) || !read(fileFor(alt)).includes(`hreflang="en" href="${urlFor(f)}"`)) note("reciprocal EN/ZH hreflang", f);
    if (!/hreflang="x-default"/.test(h)) note("x-default hreflang", f);
    for (const sec of b.split(/<section\b/).slice(1)) { const n = strip(sec.split("</section>")[0]).split(/\s+/).length; if (n > 1200) { note("sections sized for AI chunking (<1200 words)", `${f} ${n}`); break; } }
    if (/<meta name="robots" content="noindex/.test(h) && !/The same filings as <a href=/.test(h)) note("a noindexed guide points to the one indexed", f);
  }
  // no two indexed guides in a city with the same filings
  const seen = new Map();
  for (const f of guides) { const h = pages.get(f); if (/noindex/.test(metaOf(h, "name", "robots") ?? "")) continue; const k = f.split("/")[2] + ":" + [...h.matchAll(/<li id="s\d+">[\s\S]*?<a href="([^"]+)"/g)].map(m => m[1]).join(","); if (seen.has(k)) note("no indexed near-duplicates", `${f} = ${seen.get(k)}`); seen.set(k, f); }
  const zh = [...pages.keys()].filter(f => f.startsWith("site/guides/zh/")).slice(0, 200);
  for (const f of zh) if (!/<meta name="applicable-device" content="pc,mobile">/.test(pages.get(f)) || !/<html lang="zh-CN">/.test(pages.get(f))) note("Chinese pages carry zh-CN and the Baidu tags", f);
  for (const [k, fs] of Object.entries(bad)) check(k, false, `${fs.length}: ${fs.slice(0, 4).join(" | ")}`);
  check(`${guides.length} English business and topic guides checked`, guides.length > 500);
  for (const hub of ["site/guides/business/restaurant.html", "site/guides/permits/permit-costs.html"]) check(`hub ${hub}`, pages.has(hub));
  check("state hubs", [...pages.keys()].filter(f => f.startsWith("site/guides/states/")).length >= 5);
  check("editorial policy page", pages.has("site/editorial.html") && strip(pages.get("site/editorial.html")).includes("official"));
});

for (const r of results) console.log("  " + r);
console.log(`\ntest:seo: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
