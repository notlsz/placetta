/* Builds site/guides/: answers to the questions people ask before opening a business, made from the official forms
   library (src/forms/registry.ts and world.ts) and the answers in guides-answers.mts. Pages state only what the library
   holds and link the agencies' own pages. English and Chinese: a hub, a guide per business in each city, a page per
   official form, a page per question, plus the sitemap and robots.txt.
   Run: npm run guides (output is committed; Vite copies site/ into dist/). */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { CITIES, COUNTRIES } from "../src/forms/world.ts";
import { FORMS, METHOD, formById, formsFor, type Needs, type OfficialForm, type Segment } from "../src/forms/registry.ts";
import { ANSWERS } from "./guides-answers.mts";

const ORIGIN = "https://placetta.com";
const TODAY = new Date().toISOString().slice(0, 10);
type L = "en" | "zh";
type Bi = { en: string; zh: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// house style: no em dashes and no middle-dot separators in copy
const clean = (s: string) => s.replace(/\s*\u2014\s*/g, ", ").replace(/ \u00b7 /g, ", ");
const t = (b: Bi, l: L) => clean(b[l]);
const day = (l: L) => (l === "zh" ? TODAY.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, "$1 年 $2 月 $3 日") : new Date(TODAY + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
// "Seller's permit" reads "the seller's permit" mid-sentence; titles with other capitalized words keep their case
const lower1 = (s: string) => (/^[A-Z][a-z]/.test(s) && !s.split(/\s+/).slice(1).some(w => /^[A-Z][a-z]/.test(w)) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/* ------------------------------------------------------------ the businesses and places */

const BUSINESS: Record<Segment, { slug: string; name: Bi; short: Bi; needs: Needs }> = {
  restaurant: { slug: "restaurant", name: { en: "restaurant, cafe or milk tea shop", zh: "餐厅、咖啡店或奶茶店" }, short: { en: "Restaurant or cafe", zh: "餐厅与咖啡店" }, needs: { food: true, employees: true, newEntity: true, buildout: true, signage: true } },
  retail: { slug: "retail-store", name: { en: "retail store", zh: "零售门店" }, short: { en: "Retail store", zh: "零售门店" }, needs: { employees: true, newEntity: true, signage: true } },
  seller: { slug: "importer-ecommerce", name: { en: "importer or e-commerce seller", zh: "进口商或跨境电商卖家" }, short: { en: "Importer or online seller", zh: "进口与电商" }, needs: { imports: true, newEntity: true } },
  warehouse: { slug: "warehouse-3pl", name: { en: "warehouse or 3PL", zh: "仓库或第三方物流" }, short: { en: "Warehouse or 3PL", zh: "仓储物流" }, needs: { imports: true, employees: true, newEntity: true } },
};

type Place = { slug: string; name: Bi; where: string; country: string };
const PLACES: Place[] = [
  { slug: "new-york-city", name: { en: "New York City", zh: "纽约市" }, where: "Flushing, New York City, NY", country: "US" },
  { slug: "los-angeles", name: { en: "Los Angeles", zh: "洛杉矶" }, where: "Los Angeles, CA", country: "US" },
  { slug: "houston", name: { en: "Houston", zh: "休斯顿" }, where: "Houston, TX", country: "US" },
  ...CITIES.filter(c => c.guide).map(c => ({ slug: slug(c.en), name: { en: c.en, zh: c.zh }, where: c.aliases[0] + (c.state ? `, ${c.state}` : ""), country: c.country })),
];
const countryName = (code: string): Bi => { const c = COUNTRIES.find(x => x.code === code); return c ? { en: c.en, zh: c.zh } : { en: code, zh: code }; };

/* ------------------------------------------------------------ the shell */

const priv = readFileSync("site/privacy.html", "utf8");
const BRAND = (priv.match(/<span class="wm">[\s\S]*?<\/svg><\/span>/) ?? [""])[0];
const FAVICON = (priv.match(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>/g) ?? []).join("\n");
const FONTS = "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Inter:wght@400;500;600&family=Noto+Serif+SC:wght@500&family=Noto+Sans+SC:wght@400;500&display=swap";

const UI = {
  home: { en: "Home", zh: "首页" }, guides: { en: "Guides", zh: "指南" }, answers: { en: "Answers", zh: "问答" }, forms: { en: "Official forms", zh: "官方表格" },
  plan: { en: "Get my plan", zh: "获取我的方案" }, privacy: { en: "Privacy Policy", zh: "隐私政策" }, terms: { en: "Terms and Conditions", zh: "服务条款" },
  other: { en: "中文", zh: "English" }, onPage: { en: "In this guide", zh: "本页内容" }, updated: { en: "Updated", zh: "更新于" },
};
const base = (l: L) => (l === "zh" ? "/guides/zh" : "/guides");

function page(o: { l: L; path: string; alt: string; title: string; desc: string; crumbs: [string, string][]; body: string; ld: unknown[]; kind?: string }) {
  const url = ORIGIN + o.path, altUrl = ORIGIN + o.alt, l = o.l;
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: o.crumbs.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: ORIGIN + path })) };
  return `<!doctype html>
<html lang="${l === "zh" ? "zh-CN" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)} | Placetta</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="${l === "zh" ? "zh-CN" : "en"}" href="${url}">
<link rel="alternate" hreflang="${l === "zh" ? "en" : "zh-CN"}" href="${altUrl}">
<link rel="alternate" hreflang="x-default" href="${l === "en" ? url : altUrl}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Placetta">
<meta name="twitter:card" content="summary">
${FAVICON}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/guides/guides.css">
${[crumbs, ...o.ld].map(x => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body class="pg-${o.kind ?? "page"}">
<a class="skip" href="#main">${l === "zh" ? "跳到正文" : "Skip to content"}</a>
<header class="top"><div class="wrap">
  <a class="brand" href="/" aria-label="Placetta">${BRAND}</a>
  <nav class="topnav" aria-label="${l === "zh" ? "指南" : "Guides"}">
    <a href="${base(l)}/">${UI.guides[l]}</a>
    <a href="${base(l)}/#answers">${UI.answers[l]}</a>
    <a href="${base(l)}/#forms">${UI.forms[l]}</a>
  </nav>
  <a class="lang" href="${o.alt}" hreflang="${l === "zh" ? "en" : "zh-CN"}">${UI.other[l]}</a>
  <a class="btn" href="/app/">${UI.plan[l]}</a>
</div></header>
<main id="main">
<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${o.crumbs.map(([n, p], i) => (i < o.crumbs.length - 1 ? `<li><a href="${p}">${esc(n)}</a></li>` : `<li aria-current="page">${esc(n)}</li>`)).join("")}</ol></nav>
${o.body}
</main>
<footer class="foot"><div class="wrap">
  <a class="brand" href="/" aria-label="Placetta">${BRAND}</a>
  <p>${l === "zh" ? "快哉为进入新市场的企业办理执照、许可和登记，并保持有效。" : "Placetta gets the licenses, permits and registrations a business needs to open in a new market, and keeps them current."}</p>
  <nav><a href="/">${UI.home[l]}</a><a href="${base(l)}/">${UI.guides[l]}</a><a href="/help/">${l === "zh" ? "帮助中心" : "Help Center"}</a><a href="/privacy.html">${UI.privacy[l]}</a><a href="/terms.html">${UI.terms[l]}</a></nav>
  <small>© 2026 Placetta</small>
</div></footer>
${o.kind === "hub" ? `<script src="/guides/guides.js" defer></script>` : ""}
</body>
</html>
`;
}

const cta = (l: L, head: Bi, line: Bi) => `<section class="cta"><div class="wrap"><div><h2>${esc(t(head, l))}</h2><p>${esc(t(line, l))}</p></div><a class="btn light" href="/app/">${UI.plan[l]}</a></div></section>`;
const money = (n: number, cur = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const fee = (f: OfficialForm, l: L) => (f.fee === null ? (l === "zh" ? "视情况而定" : "Varies") : f.fee === 0 ? (l === "zh" ? "免费" : "Free") : money(f.fee, f.currency ?? "USD"));
const formPath = (f: OfficialForm, l: L) => `${base(l)}/forms/${f.id}.html`;
const answerPath = (s: string, l: L) => `${base(l)}/answers/${s}.html`;
const where = (f: OfficialForm, l: L) => {
  if (f.where === "US") return l === "zh" ? "美国联邦" : "US federal";
  const city = CITIES.find(c => c.code === f.where), country = COUNTRIES.find(c => c.code === f.where);
  if (city) return l === "zh" ? city.zh : city.en;
  if (country) return l === "zh" ? `${country.zh}全国` : `${country.en}, national`;
  const us: Record<string, Bi> = { NY: { en: "New York State", zh: "纽约州" }, NYC: { en: "New York City", zh: "纽约市" }, CA: { en: "California", zh: "加州" }, LA: { en: "City of Los Angeles", zh: "洛杉矶市" }, LAC: { en: "Los Angeles County", zh: "洛杉矶县" }, TX: { en: "Texas", zh: "德州" }, HOU: { en: "Houston", zh: "休斯顿" } };
  return us[f.where]?.[l] ?? f.where;
};
const sourceNote = (f: OfficialForm, l: L) => f.checked === "known"
  ? (l === "zh" ? "出自快哉的官方网站资料库。提交前请以机构官网为准，快哉会在每次提交前重新核对。" : "From Placetta's library of official sites. Check the agency's page before you file; Placetta re-checks it before every filing.")
  : (l === "zh" ? "依据机构官网核对。" : "Checked against the agency's own page.");
const facts = (f: OfficialForm, l: L) => `<dl class="facts">
<div><dt>${l === "zh" ? "费用" : "Fee"}</dt><dd>${fee(f, l)}</dd></div>
<div><dt>${l === "zh" ? "办理" : "Filed"}</dt><dd>${esc(t(METHOD[f.method], l))}</dd></div>
${f.takes ? `<div><dt>${l === "zh" ? "时长" : "Takes"}</dt><dd>${esc(t(f.takes, l))}</dd></div>` : ""}
${f.renews ? `<div><dt>${l === "zh" ? "续期" : "Renews"}</dt><dd>${esc(t(f.renews, l))}</dd></div>` : ""}
</dl>`;
const meta = (l: L, bits: string[]) => `<p class="meta">${bits.map(b => `<span>${b}</span>`).join("")}</p>`;
const hero = (l: L, title: string, dek: string, bits: string[]) => `<header class="hero wrap"><h1>${esc(title)}</h1><p class="dek">${esc(dek)}</p>${meta(l, bits)}</header>`;
const ldScript = (x: unknown) => x;

/* ------------------------------------------------------------ the guides per business and place */

const usedBy = new Map<string, { place: Place; seg: Segment }[]>();
const plans: { place: Place; seg: Segment; forms: OfficialForm[] }[] = [];
for (const place of PLACES) for (const seg of Object.keys(BUSINESS) as Segment[]) {
  const forms = formsFor({ segment: seg, where: place.where, needs: { ...BUSINESS[seg].needs, ...(place.country !== "US" ? { foreignEntity: true } : {}) } });
  if (forms.length < 3) continue;
  plans.push({ place, seg, forms });
  for (const f of forms) usedBy.set(f.id, [...(usedBy.get(f.id) ?? []), { place, seg }]);
}
const planPath = (p: { place: Place; seg: Segment }, l: L) => `${base(l)}/${p.place.slug}/${BUSINESS[p.seg].slug}.html`;
const findPlan = (place: string, seg: Segment) => plans.find(p => p.place.slug === place && p.seg === seg);
const planLabel = (p: { place: Place; seg: Segment }, l: L) => (l === "zh" ? `${p.place.name.zh}：${BUSINESS[p.seg].name.zh}` : `${BUSINESS[p.seg].short.en} in ${p.place.name.en}`);

/** The fixed government fees in a guide, and how many depend on the business. */
function costOf(p: { forms: OfficialForm[] }) {
  const fixed = p.forms.filter(f => typeof f.fee === "number" && f.fee > 0), free = p.forms.filter(f => f.fee === 0), varies = p.forms.filter(f => f.fee === null);
  return { total: fixed.reduce((s, f) => s + (f.fee as number), 0), fixed, free, varies, cur: p.forms.find(f => f.currency)?.currency ?? "USD" };
}

const urls: { path: string; alt: string }[] = [];
const write = (path: string, html: string) => { const file = "site" + path.replace(/\/$/, "/index.html"); mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true }); writeFileSync(file, html); };
rmSync("site/guides", { recursive: true, force: true });

for (const l of ["en", "zh"] as L[]) {
  const o: L = l === "en" ? "zh" : "en";

  for (const p of plans) {
    const biz = BUSINESS[p.seg].name[l], city = p.place.name[l], c = costOf(p);
    const title = l === "zh" ? `在${city}开${biz}需要哪些执照和许可` : `Licenses and permits to open a ${biz} in ${city}`;
    const desc = l === "zh" ? `在${city}开${biz}需要办理的 ${p.forms.length} 项执照、许可和登记，按办理顺序列出机构、办理方式、费用和官方链接。` : `The ${p.forms.length} licenses, permits and registrations a ${biz} in ${city} files, in order, with the agency, how each is filed, the fee and the official link.`;
    const dek = l === "zh" ? `按办理顺序排列的 ${p.forms.length} 项申请。具体需要哪些取决于您的业务，例如是否雇人、是否装修、是否进口。` : `${p.forms.length} filings, in the order they're made. Which apply depends on the business: whether you hire, build out the space, or import.`;
    const steps = p.forms.map((f, i) => `<li id="s${i + 1}"><span class="n" aria-hidden="true">${i + 1}</span><div class="step">
<h2><a href="${formPath(f, l)}">${esc(t(f.title, l))}</a></h2>
<p class="by">${esc(t(f.agency, l))}<span>${esc(where(f, l))}</span></p>
<p>${esc(t(f.how, l))}</p>
${facts(f, l)}
<p class="src"><a href="${esc(f.url)}" rel="noopener">${l === "zh" ? "机构官网办理入口" : "File on the agency's site"}</a><a href="${formPath(f, l)}">${l === "zh" ? "这项申请详解" : "How to fill it"}</a></p>
</div></li>`).join("\n");
    const rail = `<aside class="rail"><div class="rail-in">
<p class="rail-h">${UI.onPage[l]}</p>
<ol>${p.forms.map((f, i) => `<li><a href="#s${i + 1}">${esc(t(f.title, l))}</a></li>`).join("")}</ol>
<div class="sum"><p>${l === "zh" ? "固定政府规费" : "Fixed government fees"}</p><b>${money(c.total, c.cur)}</b><small>${l === "zh" ? `另有 ${c.varies.length} 项视业务而定，${c.free.length} 项免费` : `${c.varies.length} more depend on the business; ${c.free.length} are free`}</small></div>
</div></aside>`;
    const others = plans.filter(x => x.place === p.place && x.seg !== p.seg);
    const qs = ANSWERS.filter(a => a.plan?.some(x => x.place === p.place.slug && x.seg === p.seg) || (a.cost && a.cost.place === p.place.slug && a.cost.seg === p.seg));
    const body = `${hero(l, title, dek, [`${UI.updated[l]} ${day(l)}`, l === "zh" ? `${p.forms.length} 项申请` : `${p.forms.length} filings`, l === "zh" ? "来源：各机构官网" : "Sources: the agencies' own sites"])}
<div class="cols wrap">
<div class="main"><ol class="steps">
${steps}
</ol>
${qs.length ? `<section class="more"><h2>${l === "zh" ? "常见问题" : "Questions people ask"}</h2><ul class="qlist">${qs.map(a => `<li><a href="${answerPath(a.slug, l)}">${esc(a.q[l])}</a></li>`).join("")}</ul></section>` : ""}
${others.length ? `<section class="more"><h2>${l === "zh" ? `${city}的其他业务` : `Other businesses in ${city}`}</h2><ul class="links">${others.map(x => `<li><a href="${planPath(x, l)}">${esc(BUSINESS[x.seg].short[l])}</a></li>`).join("")}</ul></section>` : ""}
<p class="fine">${l === "zh" ? "各机构要求可能变化，提交前请以机构官网为准。" : "Agency requirements change. Check each agency's page before you file."}</p>
</div>
${rail}
</div>
${cta(l, { en: `Open your ${BUSINESS[p.seg].name.en} in ${p.place.name.en} with every license in order.`, zh: `在${p.place.name.zh}开${BUSINESS[p.seg].name.zh}，每项许可按序办妥。` }, { en: "Placetta maps each filing for your exact address, fills the official forms from your details and puts them up for your approval.", zh: "快哉按您的具体地址梳理每项申请，用您的资料填好官方表格，交给您批准。" })}`;
    const ld = { "@context": "https://schema.org", "@type": "HowTo", name: title, description: desc, inLanguage: l === "zh" ? "zh-CN" : "en", dateModified: TODAY,
      step: p.forms.map((f, i) => ({ "@type": "HowToStep", position: i + 1, name: t(f.title, l), text: t(f.how, l), url: ORIGIN + planPath(p, l) + `#s${i + 1}` })) };
    write(planPath(p, l), page({ l, path: planPath(p, l), alt: planPath(p, o), title, desc, body, ld: [ldScript(ld)], kind: "guide",
      crumbs: [[UI.guides[l], base(l) + "/"], [city, `${base(l)}/#${p.place.slug}`], [BUSINESS[p.seg].short[l], planPath(p, l)]] }));
    urls.push({ path: planPath(p, l), alt: planPath(p, o) });
  }

  /* a page per official form */
  for (const f of FORMS) {
    const name = t(f.title, l);
    const title = l === "zh" ? `${f.form}：${name}办理指南` : `${f.form}: how to file the ${lower1(name)}`;
    const desc = l === "zh" ? `${t(f.agency, l)}的${name}：谁需要办、如何办理、费用、所需时间${f.fields.length ? "和表格逐行说明" : ""}。` : `${name} from ${t(f.agency, l)}: who files it, how, the fee and how long it takes${f.fields.length ? ", with each line of the form" : ""}.`;
    const users = usedBy.get(f.id) ?? [];
    const qs = ANSWERS.filter(a => a.forms.includes(f.id));
    const body = `${hero(l, title, t(f.how, l), [esc(t(f.agency, l)), esc(where(f, l)), `${UI.updated[l]} ${day(l)}`])}
<div class="cols wrap">
<div class="main">
<dl class="sheet">
<div><dt>${l === "zh" ? "机构" : "Agency"}</dt><dd>${esc(t(f.agency, l))}</dd></div>
<div><dt>${l === "zh" ? "适用地区" : "Where it applies"}</dt><dd>${esc(where(f, l))}</dd></div>
<div><dt>${l === "zh" ? "办理方式" : "How it's filed"}</dt><dd>${esc(t(METHOD[f.method], l))}</dd></div>
<div><dt>${l === "zh" ? "费用" : "Fee"}</dt><dd>${fee(f, l)}${f.feeNote ? `<small>${esc(t(f.feeNote, l))}</small>` : ""}</dd></div>
${f.takes ? `<div><dt>${l === "zh" ? "所需时间" : "How long it takes"}</dt><dd>${esc(t(f.takes, l))}</dd></div>` : ""}
${f.renews ? `<div><dt>${l === "zh" ? "续期" : "Renewal"}</dt><dd>${esc(t(f.renews, l))}</dd></div>` : ""}
</dl>
${f.foreign ? `<section class="note"><h2>${l === "zh" ? "股东在境外时" : "When the owner is abroad"}</h2><p>${esc(t(f.foreign, l))}</p></section>` : ""}
${f.fields.length ? `<section><h2>${l === "zh" ? "表格逐行说明" : "The form, line by line"}</h2><table class="lines"><thead><tr><th scope="col">${l === "zh" ? "行" : "Line"}</th><th scope="col">${l === "zh" ? "填写内容" : "What goes there"}</th></tr></thead><tbody>${f.fields.map(x => `<tr><th scope="row">${esc(x.line)}</th><td>${esc(t(x.label, l))}${x.options ? `<small>${esc(x.options.join(" / "))}</small>` : ""}${x.hint ? `<small>${esc(t(x.hint, l))}</small>` : ""}</td></tr>`).join("")}</tbody></table></section>` : ""}
${f.attach?.length ? `<section><h2>${l === "zh" ? "需要附上" : "What to attach"}</h2><ul class="plain">${f.attach.map(a => `<li>${esc(t(a, l))}</li>`).join("")}</ul></section>` : ""}
<section><h2>${l === "zh" ? "官方链接" : "Official links"}</h2><ul class="links">
<li><a href="${esc(f.url)}" rel="noopener">${l === "zh" ? "办理入口" : "Where it's filed"}</a></li>
${f.info !== f.url ? `<li><a href="${esc(f.info)}" rel="noopener">${l === "zh" ? "机构说明页" : "The agency's page about it"}</a></li>` : ""}
${f.pdf && f.pdf !== f.url ? `<li><a href="${esc(f.pdf)}" rel="noopener">${l === "zh" ? "官方 PDF" : "The official PDF"}</a></li>` : ""}
</ul><p class="fine">${sourceNote(f, l)}</p></section>
${qs.length ? `<section class="more"><h2>${l === "zh" ? "常见问题" : "Questions people ask"}</h2><ul class="qlist">${qs.map(a => `<li><a href="${answerPath(a.slug, l)}">${esc(a.q[l])}</a></li>`).join("")}</ul></section>` : ""}
</div>
${users.length ? `<aside class="rail"><div class="rail-in"><p class="rail-h">${l === "zh" ? "哪些企业需要" : "Who files it"}</p><ul>${users.slice(0, 16).map(u => `<li><a href="${planPath(u, l)}">${esc(planLabel(u, l))}</a></li>`).join("")}</ul></div></aside>` : ""}
</div>
${cta(l, f.fill ? { en: `Get ${f.form} filled from your details, line by line.`, zh: `用您的资料逐行填好 ${f.form}。` } : { en: "Get this filing prepared and tracked until it's issued.", zh: "让这项申请从准备到签发全程有人跟进。" }, f.fill ? { en: `Placetta fills the official ${f.form} PDF and puts it up for your approval.`, zh: `快哉填好官方 ${f.form} PDF，交给您批准。` } : { en: "Placetta prepares it from your details and follows it until the agency issues it.", zh: "快哉用您的资料准备申请，并跟进到机构签发为止。" })}`;
    const ld = { "@context": "https://schema.org", "@type": "HowTo", name: title, description: desc, inLanguage: l === "zh" ? "zh-CN" : "en", dateModified: TODAY,
      step: [{ "@type": "HowToStep", text: t(f.how, l) }, ...(f.fields.length ? [{ "@type": "HowToStep", text: (l === "zh" ? "填写：" : "Fill in: ") + f.fields.map(x => t(x.label, l)).join(l === "zh" ? "；" : "; ") }] : []), { "@type": "HowToStep", text: (l === "zh" ? "提交至：" : "File at: ") + f.url }] };
    write(formPath(f, l), page({ l, path: formPath(f, l), alt: formPath(f, o), title, desc, body, ld: [ld], kind: "form",
      crumbs: [[UI.guides[l], base(l) + "/"], [UI.forms[l], `${base(l)}/#forms`], [f.form, formPath(f, l)]] }));
    urls.push({ path: formPath(f, l), alt: formPath(f, o) });
  }

  /* a page per question */
  for (const a of ANSWERS) {
    let short = a.a[l], forms = a.forms.map(id => formById(id)!).filter(Boolean);
    const rel = (a.plan ?? []).map(x => findPlan(x.place, x.seg)).filter((x): x is NonNullable<typeof x> => !!x);
    if (a.cost) {
      const p = findPlan(a.cost.place, a.cost.seg)!; const c = costOf(p); forms = p.forms; rel.unshift(p);
      short = l === "zh"
        ? `${p.place.name.zh}开餐厅的 ${p.forms.length} 项申请中，固定政府规费合计约 ${money(c.total, c.cur)}（${c.fixed.map(f => `${t(f.title, l)} ${money(f.fee as number, c.cur)}`).join("，")}）。另有 ${c.varies.length} 项按场所或业务计算，${c.free.length} 项免费。装修、保险和顾问费用不在其内。`
        : `Across the ${p.forms.length} filings a restaurant in ${p.place.name.en} makes, the fixed government fees add up to about ${money(c.total, c.cur)} (${c.fixed.map(f => `${lower1(t(f.title, l))} ${money(f.fee as number, c.cur)}`).join(", ")}). ${c.varies.length} more are set by the space or the business, and ${c.free.length} are free. Build-out, insurance and adviser costs are on top.`;
    }
    const q = a.q[l];
    const items = forms.map(f => `<li><h3><a href="${formPath(f, l)}">${esc(t(f.title, l))}</a></h3><p class="by">${esc(t(f.agency, l))}<span>${esc(where(f, l))}</span></p><p>${esc(t(f.how, l))}</p>${facts(f, l)}<p class="src"><a href="${esc(f.url)}" rel="noopener">${l === "zh" ? "机构官网" : "The agency's site"}</a></p></li>`).join("");
    const body = `${hero(l, q, l === "zh" ? "简明答案，附官方表格和机构链接。" : "The short answer, with the official forms and the agencies' own links.", [`${UI.updated[l]} ${day(l)}`, l === "zh" ? "来源：各机构官网" : "Sources: the agencies' own sites"])}
<div class="cols wrap">
<div class="main">
<section class="answer"><h2>${l === "zh" ? "简明答案" : "The short answer"}</h2><p>${esc(clean(short))}</p></section>
<section><h2>${l === "zh" ? (a.cost ? "每项申请及费用" : "相关表格") : (a.cost ? "Every filing and its fee" : "The forms involved")}</h2><ol class="cards">${items}</ol></section>
${rel.length ? `<section class="more"><h2>${l === "zh" ? "完整指南" : "Full guides"}</h2><ul class="links">${rel.map(p => `<li><a href="${planPath(p, l)}">${esc(planLabel(p, l))}</a></li>`).join("")}</ul></section>` : ""}
<p class="fine">${l === "zh" ? "这是一般信息，不是法律或税务意见。各机构要求可能变化，提交前请以机构官网为准。" : "General information, not legal or tax advice. Agency requirements change; check the agency's page before you file."}</p>
</div>
<aside class="rail"><div class="rail-in"><p class="rail-h">${l === "zh" ? "更多问答" : "More answers"}</p><ul>${ANSWERS.filter(x => x !== a).slice(0, 8).map(x => `<li><a href="${answerPath(x.slug, l)}">${esc(x.q[l])}</a></li>`).join("")}</ul></div></aside>
</div>
${cta(l, { en: "Skip the research. Get the filings done.", zh: "不必自己研究，直接办妥。" }, { en: "Tell Placetta what you're opening and where. It lists every filing, fills the official forms and keeps everything current.", zh: "告诉快哉您要开什么、开在哪里。它会列出每项申请，填好官方表格，并保持证照有效。" })}`;
    const ld = { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: l === "zh" ? "zh-CN" : "en", mainEntity: [{ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: clean(short) } }] };
    write(answerPath(a.slug, l), page({ l, path: answerPath(a.slug, l), alt: answerPath(a.slug, o), title: q, desc: clean(short).slice(0, 155), body, ld: [ld], kind: "answer",
      crumbs: [[UI.guides[l], base(l) + "/"], [UI.answers[l], `${base(l)}/#answers`], [q, answerPath(a.slug, l)]] }));
    urls.push({ path: answerPath(a.slug, l), alt: answerPath(a.slug, o) });
  }

  /* the hub */
  const byCountry = new Map<string, Place[]>();
  for (const p of PLACES) if (plans.some(x => x.place === p)) byCountry.set(p.country, [...(byCountry.get(p.country) ?? []), p]);
  const hubTitle = l === "zh" ? "每座城市开店所需的执照，一目了然" : "Every license to open, city by city";
  const hubDek = l === "zh" ? `覆盖美国、中国、欧洲和中东 ${byCountry.size} 个国家的 ${[...byCountry.values()].flat().length} 座城市：餐厅、零售、进口电商和仓储需要办理的每项申请，以及每张官方表格的填写方法。` : `What a restaurant, store, importer or warehouse files to open in ${[...byCountry.values()].flat().length} cities across ${byCountry.size} countries, and how to fill each official form. Built from the agencies' own sites.`;
  const hub = `<header class="hero hub-hero wrap"><h1>${esc(hubTitle)}</h1><p class="dek">${esc(hubDek)}</p>
<form class="find" role="search" onsubmit="return false"><label class="sr" for="q">${l === "zh" ? "搜索城市、表格或问题" : "Search cities, forms or questions"}</label><input id="q" type="search" autocomplete="off" placeholder="${l === "zh" ? "搜索城市、表格或问题，例如 上海 或 SS-4" : "Search a city, form or question, e.g. Dubai or SS-4"}"><p class="count" id="count" aria-live="polite"></p></form></header>
<section class="wrap block" id="answers"><h2 class="sec">${UI.answers[l]}</h2><ul class="qgrid">${ANSWERS.map(a => `<li data-f="${esc((a.q.en + " " + a.q.zh).toLowerCase())}"><a href="${answerPath(a.slug, l)}">${esc(a.q[l])}</a></li>`).join("")}</ul></section>
<section class="wrap block" id="cities"><h2 class="sec">${l === "zh" ? "城市指南" : "City guides"}</h2>
${[...byCountry].map(([code, ps]) => `<div class="country"><h3>${esc(countryName(code)[l])}</h3><div class="cities">${ps.map(p => `<div class="city" id="${p.slug}" data-f="${esc((p.name.en + " " + p.name.zh + " " + countryName(code).en + " " + countryName(code).zh).toLowerCase())}"><h4>${esc(p.name[l])}</h4><ul>${plans.filter(x => x.place === p).map(x => `<li><a href="${planPath(x, l)}">${esc(BUSINESS[x.seg].short[l])}<span>${x.forms.length}</span></a></li>`).join("")}</ul></div>`).join("")}</div></div>`).join("\n")}</section>
<section class="wrap block" id="forms"><h2 class="sec">${UI.forms[l]}</h2><ul class="fgrid">${FORMS.map(f => `<li data-f="${esc((f.form + " " + f.title.en + " " + f.title.zh + " " + f.agency.en + " " + f.agency.zh).toLowerCase())}"><a href="${formPath(f, l)}"><b>${esc(f.form)}</b><span>${esc(t(f.title, l))}</span><em>${esc(where(f, l))}</em></a></li>`).join("")}</ul></section>
${cta(l, { en: "Tell us what you're opening and where.", zh: "告诉我们您要开什么、开在哪里。" }, { en: "Placetta lists every license from the city up, fills the official forms and keeps them current.", zh: "快哉列出从市级到国家的每一项许可，填好官方表格，并保持有效。" })}`;
  const ld = { "@context": "https://schema.org", "@type": "CollectionPage", name: hubTitle, description: hubDek, inLanguage: l === "zh" ? "zh-CN" : "en" };
  write(base(l) + "/", page({ l, path: base(l) + "/", alt: base(o) + "/", title: hubTitle, desc: hubDek, body: hub, ld: [ld], kind: "hub", crumbs: [[UI.home[l], "/"], [UI.guides[l], base(l) + "/"]] }));
  urls.push({ path: base(l) + "/", alt: base(o) + "/" });
}

/* ------------------------------------------------------------ styles and search */

writeFileSync("site/guides/guides.css", readFileSync("scripts/guides.css", "utf8"));
writeFileSync("site/guides/guides.js", `/* Filters the guides hub as you type. */
(() => {
  const q = document.getElementById("q"), count = document.getElementById("count");
  if (!q) return;
  const items = [...document.querySelectorAll("[data-f]")];
  const zh = document.documentElement.lang.startsWith("zh");
  const run = () => {
    const v = q.value.trim().toLowerCase(); let n = 0;
    for (const el of items) { const on = !v || el.dataset.f.includes(v); el.hidden = !on; if (on) n++; }
    document.querySelectorAll(".country").forEach(c => { c.hidden = !c.querySelector(".city:not([hidden])"); });
    count.textContent = v ? (zh ? "找到 " + n + " 项" : n + (n === 1 ? " match" : " matches")) : "";
  };
  q.addEventListener("input", run);
})();
`);

const site = ["/", "/help/", "/privacy.html", "/terms.html"].map(p => `<url><loc>${ORIGIN}${p}</loc></url>`);
const guides = urls.map(u => `<url><loc>${ORIGIN}${u.path}</loc><lastmod>${TODAY}</lastmod><xhtml:link rel="alternate" hreflang="${u.path.includes("/zh/") ? "zh-CN" : "en"}" href="${ORIGIN}${u.path}"/><xhtml:link rel="alternate" hreflang="${u.path.includes("/zh/") ? "en" : "zh-CN"}" href="${ORIGIN}${u.alt}"/></url>`);
writeFileSync("site/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[...site, ...guides].join("\n")}\n</urlset>\n`);
writeFileSync("site/robots.txt", `User-agent: *\nAllow: /\nDisallow: /app/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
console.log(`guides: ${urls.length} pages: ${plans.length} city guides, ${FORMS.length} form pages and ${ANSWERS.length} answers per language, plus hubs`);
