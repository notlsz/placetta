#!/usr/bin/env node
/* npm run seo: the search and answer-engine layer of the website (site/), written into the pages themselves so crawlers
   that don't run JavaScript read the same thing people see.

   - Landing page (site/index.html): the English copy its script would set is written into the markup (data-i18n), the FAQ
     is pre-rendered, and a marked head block carries the description, canonical, Open Graph and Twitter cards and the
     JSON-LD (Organization, WebSite, WebPage, the Service with its published prices, the FAQ word for word). Visible copy
     and design don't change: the script still renders the same text over it.
   - Help Center: the home cards and the side menu pre-rendered, and a static page per article (/help/<section>/<article>/).
   - Trust, AI, privacy, terms and authorization pages: canonical, social cards and JSON-LD.
   - About and editorial-policy pages, from facts already published on the site.
   - sitemaps/pages.xml and the sitemap index (sitemap.xml), robots.txt and llms.txt.
   Every URL comes from scripts/seo/config.mjs. The guides (site/guides, their sitemaps and llms-full.txt) come from
   npm run guides. `--check` writes nothing and exits 1 when a file is out of date (npm run test:seo runs it). */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { BAIDU_META, DESCRIPTION, DESCRIPTION_ZH, ORG_ID, ORIGIN, SEARCH_PATH, SITE_ID, ldTag, orgLd, verifyTags, websiteLd } from "./config.mjs";
import { cutDecl, helpData, landingData } from "./extract.mjs";

const CHECK = process.argv.includes("--check");
const TODAY = process.env.SEO_TODAY ?? new Date().toISOString().slice(0, 10);
const out = new Map(); // file -> content
const read = f => (out.has(f) ? out.get(f) : readFileSync(f, "utf8"));
const put = (f, s) => out.set(f, s);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = h => String(h).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

/** Replace what sits between two markers, or put the marked block right after `anchor` the first time. */
function block(html, name, content, anchor) {
  const a = `<!-- seo:${name} -->`, b = `<!-- /seo:${name} -->`, i = html.indexOf(a), j = html.indexOf(b);
  if (i >= 0 && j > i) return html.slice(0, i + a.length) + "\n" + content + "\n" + html.slice(j);
  const k = html.indexOf(anchor); if (k < 0) throw new Error(`anchor not found for seo:${name}: ${anchor}`);
  return html.slice(0, k + anchor.length) + `\n${a}\n${content}\n${b}` + html.slice(k + anchor.length);
}
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** The end of the element whose opening tag ends at `from` (index just past ">"): the index of its closing tag. */
function closeOf(html, tag, from) {
  const re = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, "gi"); re.lastIndex = from; let d = 1, m;
  while ((m = re.exec(html))) { if (m[1]) { if (!--d) return m.index; } else if (!m[0].endsWith("/>")) d++; }
  throw new Error(`unclosed <${tag}>`);
}
/** Set the inner HTML of every element matching `attrRe` (with key in group 1) in html[lo, hi). */
function fillInner(html, lo, hi, attrRe, valueOf) {
  const re = new RegExp(`<([a-zA-Z0-9]+)\\b[^>]*?\\s${attrRe}[^>]*>`, "g"); re.lastIndex = lo; let m, res = "", last = 0;
  while ((m = re.exec(html)) && m.index < hi) {
    const tag = m[1].toLowerCase(); if (VOID.has(tag)) continue;
    const v = valueOf(m[2]); if (v == null) continue;
    const s = m.index + m[0].length, e = closeOf(html, tag, s);
    res += html.slice(last, s) + v; last = e; re.lastIndex = e;
  }
  return res + html.slice(last);
}
const setAttr = (tagHtml, name, value) => (new RegExp(`\\s${name}="[^"]*"`).test(tagHtml) ? tagHtml.replace(new RegExp(`(\\s${name}=")[^"]*(")`), `$1${esc(value)}$2`) : tagHtml.replace(/\s*\/?>$/, m => ` ${name}="${esc(value)}"${m}`));

/* ------------------------------------------------------------ dates: the day each page's content last changed */
const DATES_FILE = "scripts/seo/dates.json";
const DATES = existsSync(DATES_FILE) ? JSON.parse(readFileSync(DATES_FILE, "utf8")) : {};
const NEXT = {};
const dated = (path, html) => {
  const h = createHash("sha256").update(html.replace(/<!-- seo:head -->[\s\S]*?<!-- \/seo:head -->/, "")).digest("hex").slice(0, 16);
  const prev = DATES[path], d = prev && prev.h === h ? prev.d : TODAY; NEXT[path] = { h, d, p: prev?.p ?? d }; return NEXT[path];
};

/* ------------------------------------------------------------ shared head */
const OG_IMAGE = ORIGIN + "/media/og-home.png", GUIDES_OG = ORIGIN + "/guides/og.png";
function head({ path, title, desc, type = "website", image = OG_IMAGE, ld = [], zh = false, extra = "", locale = "en_US" }) {
  const url = ORIGIN + path;
  return [
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">`,
    `<link rel="canonical" href="${url}">`,
    zh ? BAIDU_META : "",
    verifyTags(),
    `<meta property="og:type" content="${type}">`, `<meta property="og:site_name" content="Placetta">`, `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`, `<meta property="og:url" content="${url}">`, `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`, `<meta property="og:locale" content="${locale}">`, `<meta property="og:locale:alternate" content="${locale === "en_US" ? "zh_CN" : "en_US"}">`,
    `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:title" content="${esc(title)}">`, `<meta name="twitter:description" content="${esc(desc)}">`, `<meta name="twitter:image" content="${image}">`,
    extra,
    ...ld.map(ldTag),
  ].filter(Boolean).join("\n");
}
const PUB = { "@type": "Organization", "@id": ORG_ID, name: "Placetta", url: ORIGIN + "/" };
const crumbsLd = items => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: ORIGIN + path })) });
const webPageLd = ({ path, title, desc, type = "WebPage", d, extra = {} }) => ({ "@context": "https://schema.org", "@type": type, "@id": ORIGIN + path + "#page", url: ORIGIN + path, name: title, description: desc,
  inLanguage: "en", isPartOf: { "@id": SITE_ID }, publisher: PUB, about: { "@id": ORG_ID }, ...(d ? { datePublished: d.p, dateModified: d.d } : {}), ...extra });

/* ------------------------------------------------------------ the landing page */
const LANDING = "site/index.html";
let landing = read(LANDING);
const { T, FAQ, TIERS } = landingData(landing);
const en = k => T.en[k];
{
  const bodyAt = landing.indexOf('<div class="hwrap">') >= 0 ? landing.indexOf("</style>") : 0;
  const scriptAt = landing.indexOf("<script", bodyAt);
  // the English copy the script sets, in the markup
  landing = fillInner(landing, bodyAt, scriptAt, 'data-i18n="([^"]+)"', k => (typeof en(k) === "string" && !/\{[a-z]+\}/.test(en(k)) ? en(k) : null));
  const scriptAt2 = landing.indexOf("<script", bodyAt);
  landing = landing.slice(0, bodyAt) + landing.slice(bodyAt, scriptAt2)
    .replace(/<[a-zA-Z][^>]*\sdata-i18n-aria="([^"]+)"[^>]*>/g, (tag, k) => (typeof en(k) === "string" ? setAttr(tag, "aria-label", strip(en(k))) : tag))
    .replace(/<input\b[^>]*\sdata-i18n-ph="([^"]+)"[^>]*>/g, (tag, k) => (typeof en(k) === "string" ? setAttr(tag, "placeholder", en(k)) : tag)) + landing.slice(scriptAt2);
  // the FAQ, as renderFaq() draws it with the first question open
  const faqHtml = FAQ.map((f, k) => `<div class="fq ${k === 0 ? "on" : ""}"><button type="button" data-f="${k}" aria-expanded="${k === 0}"><span class="fqt">${f[0][0]}</span><svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 1v12M1 7h12"/></svg></button><div class="tg"><div><p>${f[1][0]}</p></div></div></div>`).join("");
  // the price cards, as renderPrice() draws them
  const CHECKSVG = cutDecl(landing, "CHECK").code.slice(1, -1);
  const tiersHtml = TIERS.map(p => `<div class="plan${p.hl ? " pfeat" : ""}"><p class="pl"><span>${p.l[0]}</span>${p.tag ? `<span class="ptag">${p.tag[0]}</span>` : ""}</p><p class="pv">${p.v[0]}<small>${p.u[0]}</small></p><p class="pps">${p.ps[0]}</p><p class="pn">${p.n[0]}</p><ul class="plist">${p.f.map(f => `<li>${CHECKSVG}<p>${f[0]}</p></li>`).join("")}</ul><div class="pcta">${p.mail ? `<a class="btn b-out" href="mailto:support@placetta.com?subject=Odelia%20for%20franchisors" data-track="price_scale">${p.cta[0]}</a>` : `<button type="button" class="btn ${p.hl ? "b-ink" : "b-out"}" data-open="pricing">${p.cta[0]}</button>`}${p.hl ? `<small>${en("price.risk")}</small>` : ""}</div></div>`).join("");
  const ti = landing.indexOf('<div class="plans" id="tiers">'); if (ti < 0) throw new Error("no #tiers");
  const ts = ti + '<div class="plans" id="tiers">'.length;
  landing = landing.slice(0, ts) + tiersHtml + landing.slice(closeOf(landing, "div", ts));
  const fa = landing.indexOf('<div class="faq" id="faqList">'); if (fa < 0) throw new Error("no #faqList");
  const fs = fa + '<div class="faq" id="faqList">'.length;
  landing = landing.slice(0, fs) + faqHtml + landing.slice(closeOf(landing, "div", fs));
}
const price = s => { const m = String(s).replace(/,/g, "").match(/\$(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };
const tierBy = name => TIERS.find(x => x.l[0] === name);
function offers() {
  const o = [], add = (name, p, unit, desc, extra = {}) => { if (p != null) o.push({ "@type": "Offer", name, description: desc, price: p, priceCurrency: "USD", priceSpecification: { "@type": "UnitPriceSpecification", price: p, priceCurrency: "USD", unitText: unit }, url: ORIGIN + "/pricing", ...extra }); };
  for (const x of TIERS) {
    if (/\+$/.test(x.v[0])) { const p = price(x.v[0]); if (p != null) o.push({ "@type": "Offer", name: x.l[0], description: `${x.n[0]} ${x.ps[0]}`, priceCurrency: "USD", priceSpecification: { "@type": "PriceSpecification", minPrice: p, priceCurrency: "USD", unitText: x.u[0].replace(/^\//, "") }, url: ORIGIN + "/pricing" }); continue; }
    add(x.l[0], price(x.v[0]), x.u[0].replace(/^\//, "") + (/yearly/i.test(x.ps[0]) ? ", billed yearly" : ""), x.n[0]);
    const food = x.ps[0].match(/\$([\d,]+) for a restaurant or food store/); if (food) add(`${x.l[0]}, restaurant or food store`, price("$" + food[1]), "restaurant or food store", x.n[0]);
    // the simple model's complex licenses: "$999 for a liquor license, building plan review or an import permit."
    const complex = x.ps[0].match(/\$([\d,]+) for (a liquor license[^.]*)/); if (complex) add(`${x.l[0]}, complex`, price("$" + complex[1]), complex[2], x.n[0]);
  }
  const entry = strip(FAQ[0][1][0]).match(/\$(\d[\d,]*) one-time per market/); if (entry) add("Entry plan", price("$" + entry[1]), "one-time per market", strip(FAQ.find(f => /entry plan/i.test(f[0][0]))?.[1][0] ?? ""));
  return o;
}
const HREFLANG = `<link rel="alternate" hreflang="en" href="${ORIGIN}/">\n<link rel="alternate" hreflang="zh-CN" href="${ORIGIN}/zh">\n<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">`;
const LANDING_TITLE = { en: "Placetta: licenses, permits and registrations to open in a new market", zh: "快哉：进入新市场所需的执照、许可和登记" };
{
  const d = dated("/", landing);
  const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", "@id": ORIGIN + "/#faq", mainEntity: FAQ.map(f => ({ "@type": "Question", name: strip(f[0][0]), acceptedAnswer: { "@type": "Answer", text: strip(f[1][0]) } })) };
  const service = { "@context": "https://schema.org", "@type": "Service", "@id": ORIGIN + "/#service", name: "Placetta", alternateName: "快哉", serviceType: "Business licenses, permits and registrations", description: DESCRIPTION,
    provider: { "@id": ORG_ID }, availableLanguage: ["English", "Chinese"], url: ORIGIN + "/",
    hasOfferCatalog: { "@type": "OfferCatalog", name: "Placetta plans", itemListElement: offers() } };
  const page = webPageLd({ path: "/", title: LANDING_TITLE.en, desc: DESCRIPTION, d, extra: { mainEntity: { "@id": ORIGIN + "/#service" }, primaryImageOfPage: OG_IMAGE } });
  landing = block(landing, "head", head({ path: "/", title: LANDING_TITLE.en, desc: DESCRIPTION, ld: [orgLd(), websiteLd(SEARCH_PATH), page, service, faqLd],
    extra: `<link rel="preload" as="image" href="/media/hero-poster.jpg" fetchpriority="high">\n${HREFLANG}\n<link rel="alternate" type="text/plain" title="llms.txt" href="${ORIGIN}/llms.txt">` }), "</title>");
  landing = landing.replace(/<title>[^<]*<\/title>/, `<title>${esc(LANDING_TITLE.en)}</title>`);
  // crawlable links to the content for anything that doesn't run the page's script (people with it see the page as before)
  const data = JSON.parse(readFileSync("site/guides/data.json", "utf8"));
  const links = [["/guides/", "License guides, city by city"], ...data.hubs.business.slice(0, 7).map(x => [x.url.replace(ORIGIN, ""), x.name]), ...data.hubs.permits.map(x => [x.url.replace(ORIGIN, ""), x.name]),
    ...data.cities.slice(0, 12).map(c => [c.url.replace(ORIGIN, ""), `Opening a business in ${c.city}`]), ["/about.html", "About Placetta"], ["/editorial.html", "How we source and check the guides"], ["/help/", "Help Center"], ["/trust", "Trust and security"], ["/ai.html", "How Placetta's AI works"]];
  landing = block(landing, "links", `<noscript><nav class="ctr" aria-label="Site" style="display:flex;flex-wrap:wrap;gap:8px 20px;padding:24px 0;font-size:14px">${links.map(([h, n]) => `<a href="${h}">${esc(n)}</a>`).join("")}</nav></noscript>`, "<footer>");
  put(LANDING, landing);
}

/* ------------------------------------------------------------ the Chinese landing page (/zh, served from site/zh.html)
   The same page, with the Chinese copy its script would set written into the markup, so Baidu and other crawlers that
   don't run JavaScript read it in Chinese. The page's script starts in Chinese on /zh. */
{
  const ZH = "site/zh.html";
  const zh = k => T.zh[k] ?? T.en[k];
  let page = landing.replace(/<html lang="[^"]*"/, '<html lang="zh-CN"');
  const bodyAt = page.indexOf("</style>"), scriptAt = page.indexOf("<script", bodyAt);
  page = fillInner(page, bodyAt, scriptAt, 'data-i18n="([^"]+)"', k => (typeof zh(k) === "string" && !/\{[a-z]+\}/.test(zh(k)) ? zh(k) : null));
  const s2 = page.indexOf("<script", bodyAt);
  page = page.slice(0, bodyAt) + page.slice(bodyAt, s2)
    .replace(/<[a-zA-Z][^>]*\sdata-i18n-aria="([^"]+)"[^>]*>/g, (tag, k) => (typeof zh(k) === "string" ? setAttr(tag, "aria-label", strip(zh(k))) : tag))
    .replace(/<input\b[^>]*\sdata-i18n-ph="([^"]+)"[^>]*>/g, (tag, k) => (typeof zh(k) === "string" ? setAttr(tag, "placeholder", zh(k)) : tag)) + page.slice(s2);
  const CHECKSVG = cutDecl(page, "CHECK").code.slice(1, -1);
  const tiersHtml = TIERS.map(p => `<div class="plan${p.hl ? " pfeat" : ""}"><p class="pl"><span>${p.l[1]}</span>${p.tag ? `<span class="ptag">${p.tag[1]}</span>` : ""}</p><p class="pv">${p.v[1]}<small>${p.u[1]}</small></p><p class="pps">${p.ps[1]}</p><p class="pn">${p.n[1]}</p><ul class="plist">${p.f.map(f => `<li>${CHECKSVG}<p>${f[1]}</p></li>`).join("")}</ul><div class="pcta">${p.mail ? `<a class="btn b-out" href="mailto:support@placetta.com?subject=Odelia%20for%20franchisors" data-track="price_scale">${p.cta[1]}</a>` : `<button type="button" class="btn ${p.hl ? "b-ink" : "b-out"}" data-open="pricing">${p.cta[1]}</button>`}${p.hl ? `<small>${zh("price.risk")}</small>` : ""}</div></div>`).join("");
  const ts = page.indexOf('<div class="plans" id="tiers">') + '<div class="plans" id="tiers">'.length;
  page = page.slice(0, ts) + tiersHtml + page.slice(closeOf(page, "div", ts));
  const faqHtml = FAQ.map((f, k) => `<div class="fq ${k === 0 ? "on" : ""}"><button type="button" data-f="${k}" aria-expanded="${k === 0}"><span class="fqt">${f[0][1]}</span><svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 1v12M1 7h12"/></svg></button><div class="tg"><div><p>${f[1][1]}</p></div></div></div>`).join("");
  const fs = page.indexOf('<div class="faq" id="faqList">') + '<div class="faq" id="faqList">'.length;
  page = page.slice(0, fs) + faqHtml + page.slice(closeOf(page, "div", fs));
  const d = dated("/zh", page);
  const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", "@id": ORIGIN + "/zh#faq", inLanguage: "zh-CN", mainEntity: FAQ.map(f => ({ "@type": "Question", name: strip(f[0][1]), acceptedAnswer: { "@type": "Answer", text: strip(f[1][1]) } })) };
  const wp = { ...webPageLd({ path: "/zh", title: LANDING_TITLE.zh, desc: DESCRIPTION_ZH, d, extra: { mainEntity: { "@id": ORIGIN + "/#service" }, primaryImageOfPage: OG_IMAGE } }), inLanguage: "zh-CN" };
  page = block(page, "head", head({ path: "/zh", title: LANDING_TITLE.zh, desc: DESCRIPTION_ZH, zh: true, locale: "zh_CN", ld: [orgLd(), websiteLd(SEARCH_PATH), wp, faqLd],
    extra: `<link rel="preload" as="image" href="/media/hero-poster.jpg" fetchpriority="high">\n${HREFLANG}` }), "</title>");
  page = page.replace(/<title>[^<]*<\/title>/, `<title>${esc(LANDING_TITLE.zh)}</title>`);
  const data = JSON.parse(readFileSync("site/guides/data.json", "utf8"));
  const zlinks = [["/guides/zh/", "开店许可指南"], ...data.cities.slice(0, 12).map(c => [c.url.replace(ORIGIN, "").replace("/guides/", "/guides/zh/"), `${c.city} 开店许可指南`]), ["/help/", "帮助中心"], ["/trust", "信任中心"], ["/about.html", "关于快哉"]];
  page = block(page, "links", `<noscript><nav class="ctr" aria-label="网站" style="display:flex;flex-wrap:wrap;gap:8px 20px;padding:24px 0;font-size:14px">${zlinks.map(([h, n]) => `<a href="${h}">${esc(n)}</a>`).join("")}</nav></noscript>`, "<footer>");
  put(ZH, page);
}

/* ------------------------------------------------------------ the Help Center */
const HELP = "site/help/index.html";
{
  const src = readFileSync(HELP, "utf8");
  const H = helpData(src), i = 0, u = k => H.UI.en[k];
  const find = key => { const [si, ai] = key.split("/"); const s = H.S.find(x => x.id === si); const a = s && s.a.find(x => x.id === ai); return a ? { s, a } : null; };
  const href = (s, a) => "/help/" + s.id + "/" + a.id;
  const all = H.S.flatMap(s => s.a.map(a => ({ s, a })));
  const card = (k, icon) => { const f = find(k); return `<a class="card" href="${href(f.s, f.a)}"><span class="ic">${icon || H.IC[f.s.id]}</span><h3>${f.a.t[i]}</h3><p>${f.a.l[i]}</p></a>`; };
  const side = cur => `<a class="home" href="/help/"${cur ? "" : ' aria-current="page"'}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5V20H3z"/></svg>${u("home")}</a>` +
    H.S.map(s => { const open = cur && cur.s === s; return `<div class="grp${open ? " open" : ""}" data-g="${s.id}"><button type="button" class="gbtn" aria-expanded="${!!open}">${s.t[i]}${H.CHEV}</button><ul>${s.a.map(a => `<li><a href="${href(s, a)}"${cur && cur.a === a ? ' aria-current="page"' : ""}>${a.t[i]}</a></li>`).join("")}</ul></div>`; }).join("") +
    `<div class="sfoot"><a href="mailto:support@placetta.com">${u("contact")}</a><a href="/">${u("site")}</a></div>`;
  const setInner = (html, id, inner) => { const re = new RegExp(`<([a-z0-9]+)\\b[^>]*\\sid="${id}"[^>]*>`); const m = html.match(re); if (!m) throw new Error("help: no #" + id); const s = m.index + m[0].length; return html.slice(0, s) + inner + html.slice(closeOf(html, m[1], s)); };
  const setHidden = (html, id, hidden) => html.replace(new RegExp(`(<[a-z]+\\b[^>]*\\sid="${id}")( hidden)?`), (_, a) => a + (hidden ? " hidden" : ""));
  const helpLd = { "@context": "https://schema.org", "@type": "CollectionPage", "@id": ORIGIN + "/help/#page", url: ORIGIN + "/help/", name: u("h1"), description: strip(u("hsub")), inLanguage: "en", isPartOf: { "@id": SITE_ID }, publisher: PUB,
    hasPart: all.map(f => ({ "@type": "Article", name: f.a.t[0], url: ORIGIN + href(f.s, f.a) })) };
  let home = src.replace(/<meta name="description" content="[^"]*">\n?/, "");
  home = setInner(home, "startCards", H.START.map(k => card(k, H.AIC[k])).join(""));
  home = setInner(home, "secCards", H.S.map(s => `<a class="card" href="${href(s, s.a[0])}"><span class="ic">${H.IC[s.id]}</span><h3>${s.t[i]}</h3><p>${s.d[i]}</p><small>${typeof u("articles") === "function" ? u("articles")(s.a.length) : ""}</small></a>`).join(""));
  home = setInner(home, "featCards", H.FEAT.filter(k => !H.START.includes(k)).slice(0, 4).map(k => card(k)).join(""));
  home = setInner(home, "side", side(null));
  const homeD = dated("/help/", home);
  home = block(home, "head", head({ path: "/help/", title: "Placetta Help Center", desc: strip(u("hsub")), ld: [{ ...helpLd, datePublished: homeD.p, dateModified: homeD.d }, crumbsLd([["Placetta", "/"], [u("h1"), "/help/"]])] }), "</title>");
  put(HELP, home);
  /* a page per article, the article already drawn; the script redraws the same on load */
  all.forEach((f, k) => {
    const path = href(f.s, f.a) + "/", title = `${f.a.t[0]} | ${u("h1")}`, body = f.a.b[0];
    // the lede, and the article's first paragraph when the lede alone is too short to describe it
    const lede = strip(f.a.l[0]), first = strip((body.match(/<p>([\s\S]*?)<\/p>/) ?? [, ""])[1]);
    const desc = lede.length >= 70 || !first ? lede : (`${lede} ${first}`.length > 200 ? `${lede} ${first}`.slice(0, 200).replace(/\s+\S*$/, "") + "…" : `${lede} ${first}`);
    const hs = [...body.matchAll(/<h2 id="([^"]+)">([^<]*)<\/h2>/g)];
    const p = all[k - 1], n = all[k + 1];
    let html = src;
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`).replace(/<meta name="description" content="[^"]*">\n?/, "");
    html = setHidden(html, "homeView", true); html = setHidden(html, "docView", false);
    html = setInner(html, "side", side(f));
    html = setInner(html, "crumbs", `<a href="/help/">${u("home")}</a>${H.CHEV}<a href="${href(f.s, f.s.a[0])}">${f.s.t[0]}</a>`);
    html = setInner(html, "art", `<h1>${f.a.t[0]}</h1><p class="lede">${f.a.l[0]}</p>${body}<p class="upd">${u("updated")}<span class="hviews" id="hViews"></span></p>`);
    html = setInner(html, "toc", hs.length ? `<b><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h13"/></svg>${u("onpage")}</b><nav>` + hs.map(h => `<a href="${href(f.s, f.a)}/${h[1]}" data-h="${h[1]}">${esc(h[2])}</a>`).join("") + "</nav>" : "");
    html = setInner(html, "pn", (p ? `<a href="${href(p.s, p.a)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 6-6 6 6 6"/></svg><span><small>${u("prev")}</small>${p.a.t[0]}</span></a>` : "") + (n ? `<a class="nx" href="${href(n.s, n.a)}"><span><small>${u("next")}</small>${n.a.t[0]}</span>${H.CHEV}</a>` : ""));
    // the home view's own h1 stays in the markup (the script needs it) but hidden, so the article's is the page's one h1
    html = html.replace(/<h1 data-t="h1">/, '<h1 data-t="h1" hidden>').replace('<h1 data-t="h1" hidden hidden>', '<h1 data-t="h1" hidden>');
    const d = dated(path, html);
    const art = { "@context": "https://schema.org", "@type": "TechArticle", "@id": ORIGIN + path + "#article", headline: f.a.t[0], description: desc, url: ORIGIN + path, mainEntityOfPage: ORIGIN + path, inLanguage: "en",
      isPartOf: { "@id": ORIGIN + "/help/#page" }, author: PUB, publisher: { ...PUB, logo: { "@type": "ImageObject", url: ORIGIN + "/icon-512.png" } }, datePublished: d.p, dateModified: d.d, image: OG_IMAGE, articleSection: f.s.t[0] };
    html = block(html, "head", head({ path, title, desc, type: "article", ld: [art, crumbsLd([["Placetta", "/"], [u("h1"), "/help/"], [f.s.t[0], href(f.s, f.s.a[0]) + "/"], [f.a.t[0], path]])] }), "</title>");
    put("site" + path + "index.html", html);
  });
}

/* ------------------------------------------------------------ the legal and trust pages */
const SIMPLE = [
  ["site/trust.html", "/trust", "Trust and security"],
  ["site/ai.html", "/ai.html", "How Placetta's AI works"],
  ["site/privacy.html", "/privacy.html", "Privacy Policy"],
  ["site/terms.html", "/terms.html", "Terms of Service"],
  ["site/authorization.html", "/authorization.html", "Filing Authorization"],
];
for (const [file, path, name] of SIMPLE) {
  let html = read(file);
  const title = (html.match(/<title>([^<]*)<\/title>/) ?? [, name])[1], desc = (html.match(/<meta name="description" content="([^"]*)"/) ?? [, ""])[1];
  const d = dated(path, html);
  html = block(html, "head", head({ path, title, desc: desc.replace(/&amp;/g, "&").replace(/&quot;/g, '"'), ld: [webPageLd({ path, title, desc, d }), crumbsLd([["Placetta", "/"], [name, path]])] }).replace(/<meta name="description"[^>]*>\n/, ""), "</title>");
  put(file, html);
}

/* ------------------------------------------------------------ About and the editorial policy, from published facts */
const data = JSON.parse(readFileSync("site/guides/data.json", "utf8")), cov = data.coverage;
const proofLog = JSON.parse(readFileSync("scripts/eval/proof-log.json", "utf8"));
const proven = new Set(proofLog.filter(r => r.found !== false && r.checked).map(r => r.id)).size;
const lastProof = proofLog.map(r => r.checked || "").sort().pop();
const shellSrc = readFileSync("site/trust.html", "utf8");
const shellHead = shellSrc.slice(0, shellSrc.indexOf('<main class="lw">')), shellFoot = shellSrc.slice(shellSrc.indexOf("</main>"));
const faqA = (re, l) => { const f = FAQ.find(x => re.test(x[0][0])); return f ? f[1][l] : ""; };
function infoPage({ file, path, title, titleZh, desc, en: enBody, zh: zhBody, type, extraLd = [] }) {
  let html = shellHead.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} | Placetta</title>`).replace(/<meta name="description" content="[^"]*">\n?/, "").replace(/<!-- seo:head -->[\s\S]*?<!-- \/seo:head -->\n?/, "")
    + `<main class="lw">\n<article data-block="en" lang="en" data-title="${esc(title)} | Placetta" class="trust">\n<h1>${esc(title)}</h1>\n${enBody}\n</article>\n<article data-block="zh" lang="zh-CN" data-title="${esc(titleZh)} | 快哉" class="trust" hidden>\n<h1>${esc(titleZh)}</h1>\n${zhBody}\n</article>\n` + shellFoot;
  const d = dated(path, html);
  html = block(html, "head", head({ path, title: `${title} | Placetta`, desc, ld: [webPageLd({ path, title, desc, d, type }), crumbsLd([["Placetta", "/"], [title, path]]), ...extraLd] }), "</title>");
  put(file, html);
}
const tierRows = l => TIERS.map(x => `<tr><th scope="row">${x.l[l]}</th><td>${x.v[l]}${x.u[l]}</td><td>${x.ps[l]}</td></tr>`).join("");
infoPage({
  file: "site/about.html", path: "/about.html", title: "About Placetta", titleZh: "关于快哉", type: "AboutPage", desc: DESCRIPTION,
  extraLd: [orgLd()],
  en: `<p>${esc(DESCRIPTION)} Its Chinese name is 快哉. It works in English and Chinese.</p>
<h2>What Placetta does</h2>
<p>${faqA(/Who files/, 0)}</p>
<p>${faqA(/after my store opens/, 0)}</p>
<h2>Where it works</h2>
<p>${faqA(/Which markets/, 0)}</p>
<p>Placetta's free <a href="/guides/">license guides</a> cover ${cov.cities} cities in ${cov.countries} countries, ${cov.business_kinds} kinds of business and ${cov.official_forms} official forms, in English and Chinese. Every filing links to the agency's own page; <a href="/editorial.html">how the guides are sourced and checked</a>.</p>
<h2>Pricing</h2>
<table><thead><tr><th scope="col">Plan</th><th scope="col">Price</th><th scope="col">Terms</th></tr></thead><tbody>${tierRows(0)}</tbody></table>
<p>${faqA(/How much/, 0)}</p>
<h2>What Placetta is not</h2>
<p>${en("foot.disc")}</p>
<p>${en("foot.disc2")}</p>
<h2>Company</h2>
<p>Placetta Inc., 9 W 57th St, Fl 48, New York, NY 10019, United States. Email <a href="mailto:support@placetta.com">support@placetta.com</a>.</p>
<p><a href="/trust">Trust and security</a>, <a href="/ai.html">how Placetta's AI works</a>, <a href="/help/">Help Center</a>, <a href="/privacy.html">Privacy Policy</a> and <a href="/terms.html">Terms of Service</a>.</p>`,
  zh: `<p>${esc(DESCRIPTION_ZH)}英文名为 Placetta，支持中文和英文。</p>
<h2>快哉做什么</h2>
<p>${faqA(/Who files/, 1)}</p>
<p>${faqA(/after my store opens/, 1)}</p>
<h2>覆盖范围</h2>
<p>${faqA(/Which markets/, 1)}</p>
<p>快哉的免费<a href="/guides/zh/">开店许可指南</a>覆盖 ${cov.countries} 个国家的 ${cov.cities} 座城市、${cov.business_kinds} 类业务和 ${cov.official_forms} 张官方表格，提供中英文版本。每项申请都链接到机构官网；<a href="/editorial.html">我们如何核对来源</a>。</p>
<h2>价格</h2>
<table><thead><tr><th scope="col">方案</th><th scope="col">价格</th><th scope="col">说明</th></tr></thead><tbody>${tierRows(1)}</tbody></table>
<p>${faqA(/How much/, 1)}</p>
<h2>快哉不是什么</h2>
<p>${T.zh["foot.disc"]}</p>
<p>${T.zh["foot.disc2"]}</p>
<h2>公司信息</h2>
<p>Placetta Inc.，地址：9 W 57th St, Fl 48, New York, NY 10019, United States。邮箱 <a href="mailto:support@placetta.com">support@placetta.com</a>。</p>
<p><a href="/trust">信任与安全</a>、<a href="/ai.html">快哉的 AI 如何工作</a>、<a href="/help/">帮助中心</a>、<a href="/privacy.html">隐私政策</a>和<a href="/terms.html">服务条款</a>。</p>`,
});
const fmt = iso => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const fmtZh = iso => iso.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, "$1 年 $2 月 $3 日");
infoPage({
  file: "site/editorial.html", path: "/editorial.html", title: "How we source and check the guides", titleZh: "我们如何核对指南的来源", type: "WebPage",
  desc: "Placetta's license guides take every fact from an official form or a government agency's own page, link that page, and show when it was last checked.",
  en: `<p>Every fact in Placetta's license guides comes from an official government form or an agency's own web page, and every filing links to that page. If a fact can't be traced to an official source, it isn't published.</p>
<h2>The official-source rule</h2>
<p>Each guide lists the filings in the order they are made, with the agency, how each is filed, the government fee and a link to the agency's own page. The facts come from Placetta's library of official forms (${cov.official_forms} forms), and each one is checked against the agency's own page or the form itself.</p>
<p>For ${proven} of those forms, Placetta keeps a passage-level proof: a sentence of under 25 words copied from the official page that states the requirement, the address of the page it was read on and the day it was read. A guide shows the latest of those days as "Sources checked"${lastProof ? `; the latest read was on ${fmt(lastProof)}` : ""}.</p>
<h2>What we don't publish</h2>
<p>No invented numbers, no testimonials and no ratings in the guides. Fees are the government's own; build-out, insurance and adviser costs are on top and are said to be. When a city's filings are the same for several kinds of business and no official page states anything that differs between them, one guide is indexed and names the others, so search engines don't see the same page twice. Where an official page does state a difference for one kind of business, such as a bakery's wholesale registration or a coffee shop's inspection category, that guide quotes it in the agency's own words, with the link and the day it was read.</p>
<h2>Review and dates</h2>
<p>A person reviews new government facts before they go live. Each page shows the date its content last changed, and its structured data carries the date it was first published and the date it last changed.</p>
<h2>Limits</h2>
<p>The guides are general information, not legal or tax advice. ${en("foot.disc")} Agency requirements change; check the agency's page before you file.</p>
<h2>Corrections</h2>
<p>To report an error, write to <a href="mailto:support@placetta.com">support@placetta.com</a> with the page and the agency source.</p>
<p><a href="/guides/">License guides</a>, <a href="/about.html">About Placetta</a>, <a href="/ai.html">how Placetta's AI works</a>.</p>`,
  zh: `<p>快哉开店许可指南中的每一项事实，都来自政府官方表格或机构官网，每项申请都链接到该页面。无法追溯到官方来源的内容不予发布。</p>
<h2>官方来源原则</h2>
<p>每份指南按办理顺序列出申请，注明机构、办理方式、政府规费和机构官网链接。这些事实来自快哉的官方表格库（共 ${cov.official_forms} 张表格），每一项都依据机构官网或表格本身核对。</p>
<p>其中 ${proven} 张表格附有段落级证据：从官网原文摘录的一句不超过 25 个单词的要求说明、读取该句的网址和读取日期。指南中的“来源核对于”显示其中最新的日期${lastProof ? `；最近一次读取在 ${fmtZh(lastProof)}` : ""}。</p>
<h2>我们不发布什么</h2>
<p>指南中没有编造的数字、没有客户评价、也没有评分。所列费用均为政府规费；装修、保险和顾问费用另计，并会注明。若某城市多类业务的申请完全相同，且没有官方页面说明它们之间有何不同，只有一份指南会被搜索引擎收录，并列出其他业务。若官方页面说明了某类业务的不同之处（例如烘焙店的批发登记、咖啡店的检查类别），该指南会以机构原文引用，并附链接和读取日期。</p>
<h2>审核与日期</h2>
<p>新的政府信息在上线前由人工审核。每个页面显示内容最后变更的日期，结构化数据中包含首次发布日期和最后变更日期。</p>
<h2>局限</h2>
<p>指南是一般信息，不是法律或税务意见。${T.zh["foot.disc"]}各机构要求可能变化，提交前请以机构官网为准。</p>
<h2>纠错</h2>
<p>如发现错误，请发邮件至 <a href="mailto:support@placetta.com">support@placetta.com</a>，注明页面和机构来源。</p>
<p><a href="/guides/zh/">开店许可指南</a>、<a href="/about.html">关于快哉</a>、<a href="/ai.html">快哉的 AI 如何工作</a>。</p>`,
});

/* ------------------------------------------------------------ sitemaps, robots, llms.txt */
const PAGES = ["/", "/zh", "/about.html", "/editorial.html", "/help/", ...[...out.keys()].filter(f => /^site\/help\/.+\/index\.html$/.test(f)).map(f => f.slice(4).replace(/index\.html$/, "")), "/trust", "/ai.html", "/privacy.html", "/terms.html", "/authorization.html"];
const pagesXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(p => `<url><loc>${ORIGIN}${p}</loc><lastmod>${NEXT[p]?.d ?? TODAY}</lastmod></url>`).join("\n")}\n</urlset>\n`;
put("site/sitemaps/pages.xml", pagesXml);
const maps = [...new Set(["pages.xml", ...readdirSync("site/sitemaps").filter(f => f.endsWith(".xml"))])].sort();
const lastOf = f => { const x = f === "pages.xml" ? pagesXml : readFileSync("site/sitemaps/" + f, "utf8"); return [...x.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1]).sort().pop() ?? TODAY; };
put("site/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map(f => `<sitemap><loc>${ORIGIN}/sitemaps/${f}</loc><lastmod>${lastOf(f)}</lastmod></sitemap>`).join("\n")}\n</sitemapindex>\n`);
// search engines and AI answer engines are welcome on the website and the guides; the app stays private
const bots = ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot", "Applebot-Extended", "Baiduspider", "Bytespider", "Sogou web spider", "360Spider", "YisouSpider", "YandexBot", "DuckDuckBot", "meta-externalagent", "MistralAI-User", "cohere-ai", "Amazonbot", "DuckAssistBot", "PetalBot", "Yeti", "Google-CloudVertexBot"];
put("site/robots.txt", `${bots.map(b => `User-agent: ${b}\nAllow: /\nDisallow: /app/\n`).join("\n")}\nUser-agent: *\nAllow: /\nDisallow: /app/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
const helpLinks = [...out.keys()].filter(f => /^site\/help\/.+\/index\.html$/.test(f)).map(f => { const h = out.get(f); return `- [${strip((h.match(/<title>([^<]*)</) ?? [, ""])[1]).replace(/ \| Placetta Help Center$/, "")}](${ORIGIN}${f.slice(4).replace(/index\.html$/, "")})`; });
put("site/llms.txt", `# Placetta

> ${DESCRIPTION} Placetta (Chinese name 快哉) maps every license, permit and registration a store needs for its address, fills the official government forms, files them after the customer approves, and tracks renewals, inspections and rule changes. It works in English and Chinese.

${faqA(/Who files/, 0)}

Free license guides: ${cov.cities} cities in ${cov.countries} countries (${cov.us_cities} in the US), ${cov.business_kinds} kinds of business, ${cov.official_forms} official forms, in English and Chinese. Every guide lists the filings in the order they are made, with the agency, how each is filed, the government fee and a link to the agency's own page. Agencies change requirements; check the agency's page before filing. Placetta is not a law firm and does not give legal advice.

## 中文简介
${DESCRIPTION_ZH}快哉为每个门店地址梳理所需的全部执照、许可和登记，填写政府官方表格，经客户批准后提交，并跟踪续期、检查和规则变化。中英文服务。

## Start here
- [Placetta](${ORIGIN}/): what it does, pricing and the FAQ
- [快哉 (Placetta in Chinese)](${ORIGIN}/zh): the same page in Simplified Chinese
- [中文开店许可指南](${ORIGIN}/guides/zh/): every city guide in Chinese
- [About Placetta](${ORIGIN}/about.html): the company, what it does, where it works and its prices
- [How the guides are sourced and checked](${ORIGIN}/editorial.html): the official-source rule
- [License guides, city by city](${ORIGIN}/guides/): every city, business and official form
- [Full text of the answers and city guides](${ORIGIN}/llms-full.txt)
- [Structured data for all guides](${ORIGIN}/guides/data.json)

## For agents
Every page has a Markdown copy at the same address ending in .md: [${ORIGIN}/index.md](${ORIGIN}/index.md), [a city guide](${ORIGIN}/guides/new-york-city/milk-tea-shop.md), [a help article](${ORIGIN}/help/essentials/sign-in/index.md).
- [What agents may read and use](${ORIGIN}/agents.txt): the public pages, the plan preview and the MCP server; not the signed-in app (/app/)
- [News, guides and help as they change](${ORIGIN}/feed.xml) (Atom; [RSS](${ORIGIN}/rss.xml))
- [The plan preview and Partner API (OpenAPI)](${ORIGIN}/openapi.json)
- [Placetta's MCP server](${ORIGIN}/.well-known/mcp/server-card.json): a customer's own stores, read only, with a workspace token

## Pricing
${TIERS.map(x => `- ${x.l[0]}: ${x.v[0]}${x.u[0]}. ${x.ps[0]}. ${x.n[0]}`.replace(/\.\./g, ".")).join("\n")}
- ${strip(FAQ[0][1][0]).replace(/ See pricing$/, "")}

## Guides by kind of business
${data.hubs.business.map(x => `- [${x.name}](${x.url})`).join("\n")}

## Guides by kind of permit
${data.hubs.permits.map(x => `- [${x.name}](${x.url})`).join("\n")}

## Guides by US state
${data.hubs.states.map(x => `- [${x.name}](${x.url})`).join("\n")}

## Answers
${data.answers.map(a => `- [${a.question}](${a.url})`).join("\n")}

## Cities
${data.cities.map(c => `- [${c.city}, ${c.country}](${c.url})`).join("\n")}

## Help Center
${helpLinks.join("\n")}

## Trust
- [Trust and security](${ORIGIN}/trust)
- [How Placetta's AI works](${ORIGIN}/ai.html)
- [Privacy Policy](${ORIGIN}/privacy.html)
- [Terms of Service](${ORIGIN}/terms.html)
`);
put(DATES_FILE, JSON.stringify(Object.fromEntries(Object.entries({ ...NEXT }).sort()), null, 0).replace(/},"/g, '},\n"') + "\n");

/* ------------------------------------------------------------ write, or check */
let stale = [];
for (const [f, s] of out) {
  const cur = existsSync(f) ? readFileSync(f, "utf8") : null;
  if (cur === s) continue;
  if (CHECK) { if (f !== DATES_FILE) stale.push(f); continue; }
  mkdirSync(f.slice(0, f.lastIndexOf("/")), { recursive: true }); writeFileSync(f, s);
}
if (CHECK && stale.length) { console.error(`seo: ${stale.length} file(s) out of date, run npm run seo:\n  ${stale.slice(0, 20).join("\n  ")}`); process.exit(1); }
console.log(CHECK ? "seo: every file up to date" : `seo: ${out.size} files (${PAGES.length} website pages in sitemaps/pages.xml, ${maps.length} sitemaps)`);
