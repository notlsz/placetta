/* Builds site/guides/ and the files search and AI engines read (sitemap.xml, robots.txt, llms.txt, llms-full.txt,
   guides/data.json). Every fact comes from the official forms library (src/forms/registry.ts and world.ts) or the
   answers in guides-answers.mts, and links the agency's own page. English and Chinese.
   Per city: a city page, a guide per kind of business (12) and a page per topic (8). Plus a page per official form,
   a page per question and the hub. Each page ends in the same conversion: the plan for your exact address.
   Run: npm run guides (output is committed; Vite copies site/ into dist/). */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { CITIES, COUNTRIES } from "../src/forms/world.ts";
import { FORMS, METHOD, formById, formsFor, type Needs, type OfficialForm, type Segment } from "../src/forms/registry.ts";
import { ANSWERS } from "./guides-answers.mts";

const ORIGIN = "https://placetta.com";
const TODAY = new Date().toISOString().slice(0, 10);
type L = "en" | "zh";
type Bi = { en: string; zh: string };
const B = (en: string, zh: string): Bi => ({ en, zh });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// house style: no em dashes and no middle-dot separators in copy
const clean = (s: string) => s.replace(/\s*\u2014\s*/g, ", ").replace(/ \u00b7 /g, ", ");
const t = (b: Bi, l: L) => clean(b[l]);
const day = (l: L) => (l === "zh" ? TODAY.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, "$1 年 $2 月 $3 日") : new Date(TODAY + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
// "Seller's permit" reads "the seller's permit" mid-sentence; titles with other capitalized words keep their case
const lower1 = (s: string) => (/^[A-Z][a-z]/.test(s) && !s.split(/\s+/).slice(1).some(w => /^[A-Z][a-z]/.test(w)) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const an = (s: string) => (/^[aeiou]/i.test(s) ? "an" : "a");

/* ------------------------------------------------------------ businesses, topics and places */

type Biz = { slug: string; seg: Segment; name: Bi; plural: Bi; chip: string; needs: Needs; note: Bi };
const FOOD: Needs = { food: true, employees: true, newEntity: true, buildout: true, signage: true };
const BUSINESSES: Biz[] = [
  { slug: "milk-tea-shop", seg: "restaurant", name: B("milk tea shop", "奶茶店"), plural: B("Milk tea and bubble tea shops", "奶茶店"), chip: "Milk tea", needs: FOOD,
    note: B("A tea shop that makes drinks to order is a food service business, so the health permit and food safety training apply even with no kitchen.", "现制饮品的奶茶店属于餐饮服务，即使没有厨房，也需要卫生许可和食品安全培训。") },
  { slug: "coffee-shop", seg: "restaurant", name: B("coffee shop", "咖啡店"), plural: B("Coffee shops", "咖啡店"), chip: "Coffee", needs: FOOD,
    note: B("A coffee shop that prepares drinks or food on site is a food service business, licensed and inspected like a restaurant.", "现场制作饮品或食品的咖啡店属于餐饮服务，与餐厅一样需要许可和检查。") },
  { slug: "restaurant", seg: "restaurant", name: B("restaurant", "餐厅"), plural: B("Restaurants", "餐厅"), chip: "Restaurant", needs: FOOD,
    note: B("A restaurant files the most: company and tax registration, then the build-out, the health permit and the inspections that come with it.", "餐厅需要办理的最多：先是公司和税务登记，然后是装修、卫生许可以及随之而来的检查。") },
  { slug: "hot-pot-restaurant", seg: "restaurant", name: B("hot pot restaurant", "火锅店"), plural: B("Hot pot restaurants", "火锅店"), chip: "Restaurant", needs: FOOD,
    note: B("Tabletop cooking adds questions for the build-out and fire review, so the plan for the space matters more than usual.", "桌边加热会给装修和消防审查带来更多问题，因此场地方案比一般餐厅更关键。") },
  { slug: "bakery", seg: "restaurant", name: B("bakery", "烘焙店"), plural: B("Bakeries", "烘焙店"), chip: "Bakery and desserts", needs: FOOD,
    note: B("A bakery that bakes on site needs the kitchen approved before opening, the same as a restaurant.", "现场烘焙的店铺需要在开业前通过厨房审批，与餐厅相同。") },
  { slug: "dessert-shop", seg: "restaurant", name: B("dessert shop", "甜品店"), plural: B("Dessert shops", "甜品店"), chip: "Bakery and desserts", needs: FOOD,
    note: B("Desserts served on site make it a food service business, with the health permit and inspection that go with it.", "现场供应甜品即属于餐饮服务，需要相应的卫生许可和检查。") },
  { slug: "grocery-store", seg: "retail", name: B("grocery store", "超市"), plural: B("Grocery stores", "超市"), chip: "Grocery", needs: { food: true, employees: true, newEntity: true, signage: true },
    note: B("Selling packaged food adds food rules on top of a store's usual registrations.", "销售包装食品会在门店常规登记之外增加食品方面的要求。") },
  { slug: "retail-store", seg: "retail", name: B("retail store", "零售门店"), plural: B("Retail stores", "零售门店"), chip: "Retail", needs: { employees: true, newEntity: true, signage: true },
    note: B("A store's filings are mostly registration and tax, plus the sign and occupancy for the space.", "零售门店的申请主要是登记和税务，再加上招牌和场所使用许可。") },
  { slug: "cosmetics-store", seg: "retail", name: B("cosmetics store", "美妆店"), plural: B("Cosmetics stores", "美妆店"), chip: "Retail", needs: { employees: true, newEntity: true, signage: true, cosmetics: true, imports: true },
    note: B("Importing cosmetics brings product registration and import filings on top of the store's own.", "进口化妆品需要在门店本身的申请之外，办理产品注册和进口手续。") },
  { slug: "toy-store", seg: "retail", name: B("toy store", "玩具店"), plural: B("Toy stores", "玩具店"), chip: "Retail", needs: { employees: true, newEntity: true, signage: true, children: true, imports: true },
    note: B("Imported children's products need product safety certificates at entry, in addition to the store's registrations.", "进口儿童产品在入境时需要产品安全证书，此外还有门店本身的登记。") },
  { slug: "importer-ecommerce", seg: "seller", name: B("importer or e-commerce seller", "进口商或跨境电商卖家"), plural: B("Importers and online sellers", "进口与电商"), chip: "Importer or online seller", needs: { imports: true, newEntity: true },
    note: B("Selling imported goods online means customs registration and import paperwork before the first shipment lands.", "在线销售进口商品，需要在首批货物到港前完成海关登记和进口手续。") },
  { slug: "warehouse-3pl", seg: "warehouse", name: B("warehouse or 3PL", "仓库或第三方物流"), plural: B("Warehouses and 3PLs", "仓储物流"), chip: "Warehouse or 3PL", needs: { imports: true, employees: true, newEntity: true, hazmat: true },
    note: B("A warehouse adds occupancy and fire rules for storage, and customs filings when it handles imports.", "仓库需要满足仓储方面的场所使用和消防要求，处理进口货物时还要办理海关手续。") },
];

type Topic = { slug: string; title: (c: string, l: L) => string; dek: Bi; pick: (f: OfficialForm) => boolean };
const TOPICS: Topic[] = [
  { slug: "permit-costs", title: (c, l) => (l === "zh" ? `在${c}开店，许可要花多少钱` : `How much permits cost to open in ${c}`), dek: B("The government fees for each filing, what's free and what depends on your business.", "每项申请的政府规费：哪些免费，哪些视业务而定。"), pick: () => true },
  { slug: "how-long-permits-take", title: (c, l) => (l === "zh" ? `在${c}办许可需要多长时间` : `How long permits take in ${c}`), dek: B("How long each agency takes, so you can plan the opening date.", "各机构办理所需的时间，便于规划开业日期。"), pick: f => !!f.takes },
  { slug: "foreign-company", title: (c, l) => (l === "zh" ? `外国公司在${c}开店` : `Opening in ${c} as a foreign company`), dek: B("What changes when the owner or parent company is based abroad.", "股东或母公司在境外时，需要注意的不同之处。"), pick: f => !!f.foreign || !!f.needs?.foreignEntity },
  { slug: "hiring-employees", title: (c, l) => (l === "zh" ? `在${c}雇佣第一批员工` : `Hiring your first employees in ${c}`), dek: B("The employer registrations to make before the first payday.", "首次发薪前需要完成的雇主登记。"), pick: f => !!f.needs?.employees },
  { slug: "build-out-and-occupancy", title: (c, l) => (l === "zh" ? `在${c}装修与场所使用许可` : `Build-out and occupancy permits in ${c}`), dek: B("Plan review, building and occupancy approvals for the space.", "场所的图纸审查、施工和使用审批。"), pick: f => !!f.needs?.buildout || /occupancy|plan review|plan check|building|fire|消防|占用|图纸|装修/i.test(f.title.en + f.title.zh) },
  { slug: "sign-permits", title: (c, l) => (l === "zh" ? `在${c}办理招牌许可` : `Sign permits in ${c}`), dek: B("What it takes to put up a storefront sign.", "安装门店招牌需要办理的手续。"), pick: f => !!f.needs?.signage || /sign|招牌/i.test(f.title.en + f.title.zh) },
  { slug: "importing-goods", title: (c, l) => (l === "zh" ? `从${c}进口商品需要办什么` : `Importing goods into ${c}`), dek: B("Customs registration, bonds and product filings for imports.", "进口所需的海关登记、保证金和产品申报。"), pick: f => !!f.needs?.imports },
  { slug: "renewals", title: (c, l) => (l === "zh" ? `在${c}需要定期续期的证照` : `Renewals and annual filings in ${c}`), dek: B("What renews, and how often, once the business is open.", "开业后哪些证照需要续期、多久一次。"), pick: f => !!f.renews },
];

type Place = { slug: string; name: Bi; where: string; country: string };
const PLACES: Place[] = [
  { slug: "new-york-city", name: B("New York City", "纽约市"), where: "Flushing, New York City, NY", country: "US" },
  { slug: "los-angeles", name: B("Los Angeles", "洛杉矶"), where: "Los Angeles, CA", country: "US" },
  { slug: "houston", name: B("Houston", "休斯顿"), where: "Houston, TX", country: "US" },
  ...CITIES.filter(c => c.guide).map(c => ({ slug: slug(c.en), name: B(c.en, c.zh), where: c.aliases[0] + (c.state ? `, ${c.state}` : ""), country: c.country })),
];
const REGION = (country: string) => (country === "US" ? "us" : country === "CN" ? "cn" : ["AE", "SA", "QA", "KW", "BH", "OM", "TR", "EG", "JO", "IL"].includes(country) ? "me" : "eu");
const REGIONS: { id: string; name: Bi }[] = [{ id: "us", name: B("United States", "美国") }, { id: "cn", name: B("China", "中国") }, { id: "eu", name: B("Europe", "欧洲") }, { id: "me", name: B("Middle East", "中东") }];
const countryName = (code: string): Bi => { const c = COUNTRIES.find(x => x.code === code); return c ? B(c.en, c.zh) : B(code, code); };

/* ------------------------------------------------------------ the shell */

const priv = readFileSync("site/privacy.html", "utf8");
const BRAND = (priv.match(/<span class="wm">[\s\S]*?<\/svg><\/span>/) ?? [""])[0];
const FAVICON = (priv.match(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>/g) ?? []).join("\n");
const FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Sans+SC:wght@400;500&display=swap";
const UI = {
  home: B("Home", "首页"), guides: B("Guides", "指南"), cities: B("Cities", "城市"), answers: B("Answers", "问答"), forms: B("Official forms", "官方表格"),
  plan: B("Get my plan", "获取我的方案"), privacy: B("Privacy Policy", "隐私政策"), terms: B("Terms and Conditions", "服务条款"),
  other: B("中文", "English"), onPage: B("In this guide", "本页内容"), updated: B("Updated", "更新于"),
};
const base = (l: L) => (l === "zh" ? "/guides/zh" : "/guides");
const ORG = { "@context": "https://schema.org", "@type": "Organization", name: "Placetta", alternateName: "快哉", url: ORIGIN, logo: ORIGIN + "/apple-touch-icon.png", description: "Placetta gets the business licenses, permits and registrations a company needs to open in a new market, fills the official forms and keeps them current." };

/* Sponsors: shown on every guide. A logo in scripts/sponsors/<name>.svg or .png replaces the name when it's added. Paid links
   carry rel="sponsored", as search engines require. */
const SPONSORS: { name: string; url: string | null; logo?: string }[] = [
  { name: "Faramir", url: "https://faramir.xyz" },
  { name: "Belluh", url: "https://belluh.com" },
  { name: "DeepSeek", url: "https://www.deepseek.com" },
];
const LOGOS = SPONSORS.flatMap(sp => ["svg", "png"].flatMap(ext => { try { return [{ name: sp.name, file: `${slug(sp.name)}.${ext}`, bytes: readFileSync(`scripts/sponsors/${slug(sp.name)}.${ext}`) }]; } catch { return []; } }));
const sponsorLogo = (s: (typeof SPONSORS)[number]) => { const x = LOGOS.find(y => y.name === s.name); return x ? `/guides/sponsors/${x.file}` : undefined; };
const sponsors = (l: L) => `<aside class="sponsors" aria-label="${l === "zh" ? "赞助方" : "Sponsors"}"><span>${l === "zh" ? "赞助方" : "Sponsored by"}</span>${SPONSORS.map(sp => {
  const logo = sp.logo ?? sponsorLogo(sp), inner = logo ? `<img src="${logo}" alt="${esc(sp.name)}" height="20">` : `<b>${esc(sp.name)}</b>`;
  return sp.url ? `<a href="${sp.url}" rel="sponsored noopener" target="_blank" data-track="sponsor_${slug(sp.name)}">${inner}</a>` : `<span class="sp">${inner}</span>`;
}).join("")}</aside>`;

type Ctx = { place?: Place; biz?: Biz };
function page(o: { l: L; path: string; alt: string; title: string; desc: string; crumbs: [string, string][]; body: string; ld: unknown[]; kind: string; ctx?: Ctx }) {
  const url = ORIGIN + o.path, altUrl = ORIGIN + o.alt, l = o.l;
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: o.crumbs.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: ORIGIN + path })) };
  const cityName = o.ctx?.place?.name[l];
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
<meta property="og:image" content="${ORIGIN}/guides/og.png">
<meta property="og:site_name" content="Placetta">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ORIGIN}/guides/og.png">
${FAVICON}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/guides/guides.css">
${[crumbs, ...o.ld].map(x => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("\n")}
<script src="/guides/guides.js" defer></script>
</head>
<body class="pg-${o.kind}">
<a class="skip" href="#main">${l === "zh" ? "跳到正文" : "Skip to content"}</a>
<header class="top"><div class="wrap">
  <a class="brand" href="/" aria-label="Placetta">${BRAND}</a>
  <nav class="topnav" aria-label="${l === "zh" ? "指南" : "Guides"}">
    <a href="${base(l)}/#cities">${UI.cities[l]}</a>
    <a href="${base(l)}/#answers">${UI.answers[l]}</a>
    <a href="${base(l)}/#forms">${UI.forms[l]}</a>
  </nav>
  <a class="lang" href="${o.alt}" hreflang="${l === "zh" ? "en" : "zh-CN"}">${UI.other[l]}</a>
  <a class="btn" href="#get-plan" data-track="nav_cta">${UI.plan[l]}</a>
</div></header>
<main id="main">
<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${o.crumbs.map(([n, p], i) => (i < o.crumbs.length - 1 ? `<li><a href="${p}">${esc(n)}</a></li>` : `<li aria-current="page">${esc(n)}</li>`)).join("")}</ol></nav>
${o.body}
<section class="wrap helpful" data-helpful hidden><p>${l === "zh" ? "这一页对您有帮助吗？" : "Was this page helpful?"}</p><button type="button" class="hbtn">${l === "zh" ? "有帮助" : "Yes, it helped"}</button><span class="hcount" aria-live="polite"></span></section>
${convert(l, o.ctx ?? {})}
</main>
<a class="dock" href="#get-plan" data-track="dock_cta">${esc(cityName ? (l === "zh" ? `获取${cityName}的开店方案` : `Get my plan for ${cityName}`) : UI.plan[l])}</a>
<footer class="foot"><div class="wrap">
  ${sponsors(l)}
  <a class="brand" href="/" aria-label="Placetta">${BRAND}</a>
  <p>${l === "zh" ? "快哉为进入新市场的企业办理执照、许可和登记，并保持有效。" : "Placetta gets the licenses, permits and registrations a business needs to open in a new market, and keeps them current."}</p>
  <nav><a href="/">${UI.home[l]}</a><a href="${base(l)}/">${UI.guides[l]}</a><a href="/help/">${l === "zh" ? "帮助中心" : "Help Center"}</a><a href="/privacy.html">${UI.privacy[l]}</a><a href="/terms.html">${UI.terms[l]}</a></nav>
  <small>© 2026 Placetta</small>
</div></footer>
</body>
</html>
`;
}

/** The one conversion on every page: the plan for your exact address, prefilled from the page. */
function convert(l: L, c: Ctx) {
  const city = c.place?.name[l] ?? "", biz = c.biz;
  const head = city ? (l === "zh" ? `获取您在${city}的门店专属方案` : `Get the plan for your ${biz ? biz.name.en : "business"} in ${city}`) : (l === "zh" ? "获取您的门店专属方案" : "Get the plan for your exact address");
  return `<section class="convert" id="get-plan"><div class="wrap">
<div class="cv-copy">
<h2>${esc(head)}</h2>
<p>${l === "zh" ? "这份指南适用于整座城市。您的具体地址决定了所属的县、卫生辖区和分区规定。快哉按地址梳理每一项申请，用您的资料填好官方表格，添加截止日期，并交给您批准。" : "This guide covers the city. Your exact address decides the county, the health district and the zoning. Placetta maps every filing for it, fills the official forms from your details, adds the deadlines and puts them up for your approval."}</p>
<ul class="cv-points"><li>${l === "zh" ? "按地址列出的完整申请清单" : "The full list for your address, in filing order"}</li><li>${l === "zh" ? "逐行填好的官方表格" : "The official forms, filled line by line"}</li><li>${l === "zh" ? "续期和检查提醒" : "Renewal and inspection reminders"}</li></ul>
</div>
<form class="cv-form" data-lead novalidate>
<input type="hidden" name="sell" value="${esc(biz?.chip ?? "")}"><input type="hidden" name="business" value="${esc(biz?.slug ?? "")}"><input type="hidden" name="city" value="${esc(c.place?.name.en ?? "")}">
<label><span>${l === "zh" ? "品牌或公司名称" : "Brand or company name"}</span><input name="company" autocomplete="organization" required maxlength="120"></label>
<label><span>${l === "zh" ? "门店地址或街区" : "Store address or neighborhood"}</span><input name="address" autocomplete="street-address" maxlength="200" value="${esc(city)}"></label>
<label><span>${l === "zh" ? "工作邮箱" : "Work email"}</span><input name="email" type="email" autocomplete="email" required maxlength="254"></label>
<button class="btn big" type="submit">${UI.plan[l]}</button>
<p class="cv-fine">${l === "zh" ? "免费开始，无需绑卡。我们只用邮箱联系您。" : "Free to start, no card needed. We only use your email to reach you."}</p>
<p class="cv-err" role="alert" hidden></p>
</form>
</div></section>`;
}

const money = (n: number, cur = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const fee = (f: OfficialForm, l: L) => (f.fee === null ? (l === "zh" ? "视情况而定" : "Varies") : f.fee === 0 ? (l === "zh" ? "免费" : "Free") : money(f.fee, f.currency ?? "USD"));
const formPath = (f: OfficialForm, l: L) => `${base(l)}/forms/${f.id}.html`;
const answerPath = (s: string, l: L) => `${base(l)}/answers/${s}.html`;
const cityPath = (p: Place, l: L) => `${base(l)}/${p.slug}/`;
const where = (f: OfficialForm, l: L) => {
  if (f.where === "US") return l === "zh" ? "美国联邦" : "US federal";
  const city = CITIES.find(c => c.code === f.where), country = COUNTRIES.find(c => c.code === f.where);
  if (city) return l === "zh" ? city.zh : city.en;
  if (country) return l === "zh" ? `${country.zh}全国` : `${country.en}, national`;
  const us: Record<string, Bi> = { NY: B("New York State", "纽约州"), NYC: B("New York City", "纽约市"), CA: B("California", "加州"), LA: B("City of Los Angeles", "洛杉矶市"), LAC: B("Los Angeles County", "洛杉矶县"), TX: B("Texas", "德州"), HOU: B("Houston", "休斯顿") };
  return us[f.where]?.[l] ?? f.where;
};
const sourceNote = (f: OfficialForm, l: L) => f.checked === "known"
  ? (l === "zh" ? "出自快哉的官方网站资料库。提交前请以机构官网为准，快哉会在每次提交前重新核对。" : "From Placetta's library of official sites. Check the agency's page before you file; Placetta re-checks it before every filing.")
  : (l === "zh" ? "依据机构官网核对。" : "Checked against the agency's own page.");
const facts = (f: OfficialForm, l: L) => `<dl class="facts"><div><dt>${l === "zh" ? "费用" : "Fee"}</dt><dd>${fee(f, l)}</dd></div><div><dt>${l === "zh" ? "办理" : "Filed"}</dt><dd>${esc(t(METHOD[f.method], l))}</dd></div>${f.takes ? `<div><dt>${l === "zh" ? "时长" : "Takes"}</dt><dd>${esc(t(f.takes, l))}</dd></div>` : ""}${f.renews ? `<div><dt>${l === "zh" ? "续期" : "Renews"}</dt><dd>${esc(t(f.renews, l))}</dd></div>` : ""}</dl>`;
const hero = (title: string, dek: string, bits: string[]) => `<header class="hero wrap"><h1>${esc(title)}</h1><p class="dek">${esc(dek)}</p><p class="meta">${bits.map(b => `<span>${b}</span>`).join("")}</p></header>`;
const bitsFor = (l: L, n: number) => [`${UI.updated[l]} ${day(l)}`, l === "zh" ? `${n} 项申请` : `${n} filing${n === 1 ? "" : "s"}`, l === "zh" ? "来源：各机构官网" : "Sources: the agencies' own sites"];
function costOf(forms: OfficialForm[]) {
  const fixed = forms.filter(f => typeof f.fee === "number" && f.fee > 0), free = forms.filter(f => f.fee === 0), varies = forms.filter(f => f.fee === null);
  return { total: fixed.reduce((s, f) => s + (f.fee as number), 0), fixed, free, varies, cur: forms.find(f => f.currency)?.currency ?? "USD" };
}
const steps = (forms: OfficialForm[], l: L) => `<ol class="steps">${forms.map((f, i) => `<li id="s${i + 1}"><span class="n" aria-hidden="true">${i + 1}</span><div class="step">
<h2><a href="${formPath(f, l)}">${esc(t(f.title, l))}</a></h2>
<p class="by">${esc(t(f.agency, l))}<span>${esc(where(f, l))}</span></p>
<p>${esc(t(f.how, l))}</p>
${facts(f, l)}
<p class="src"><a href="${esc(f.url)}" rel="noopener">${l === "zh" ? "机构官网办理入口" : "File on the agency's site"}</a><a href="${formPath(f, l)}">${l === "zh" ? "这项申请详解" : "How to fill it"}</a></p>
</div></li>`).join("\n")}</ol>`;
const rail = (forms: OfficialForm[], l: L, extra = "") => {
  const c = costOf(forms);
  return `<aside class="rail"><div class="rail-in">
<p class="rail-h">${UI.onPage[l]}</p>
<ol>${forms.map((f, i) => `<li><a href="#s${i + 1}">${esc(t(f.title, l))}</a></li>`).join("")}</ol>
<div class="sum"><p>${l === "zh" ? "固定政府规费" : "Fixed government fees"}</p><b>${money(c.total, c.cur)}</b><small>${l === "zh" ? `另有 ${c.varies.length} 项视业务而定，${c.free.length} 项免费` : `${c.varies.length} more depend on the business; ${c.free.length} are free`}</small><a class="btn" href="#get-plan" data-track="rail_cta">${UI.plan[l]}</a></div>
${extra}
</div></aside>`;
};
const embed = (title: string, forms: OfficialForm[], url: string, l: L) => {
  const html = `<div class="placetta-checklist"><p><strong>${esc(title)}</strong></p><ol>${forms.map(f => `<li>${esc(t(f.title, l))} (${esc(t(f.agency, l))})</li>`).join("")}</ol><p>${l === "zh" ? "来源" : "Source"}: <a href="${url}">${l === "zh" ? "快哉开店许可指南" : "Placetta license guide"}</a></p></div>`;
  return `<details class="embed"><summary>${l === "zh" ? "在您的网站上使用这份清单" : "Use this checklist on your site"}</summary><p>${l === "zh" ? "复制下面的代码贴到您的网站或文章中，内容会注明来源。" : "Copy this into your site or article. It credits the source."}</p><textarea readonly rows="5" aria-label="HTML">${esc(html)}</textarea><button type="button" class="btn ghost" data-copy>${l === "zh" ? "复制代码" : "Copy the code"}</button></details>`;
};

/* ------------------------------------------------------------ build */

const urls: { path: string; alt: string; pri: number }[] = [];
const write = (path: string, html: string) => { const file = "site" + path.replace(/\/$/, "/index.html"); mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true }); writeFileSync(file, html); };
const keepOg = (() => { try { return readFileSync("site/guides/og.png"); } catch { return null; } })();
rmSync("site/guides", { recursive: true, force: true });

type Guide = { place: Place; biz: Biz; forms: OfficialForm[] };
const guides: Guide[] = [];
const topicPages: { place: Place; topic: Topic; forms: OfficialForm[] }[] = [];
const usedBy = new Map<string, Guide[]>();
for (const place of PLACES) {
  for (const biz of BUSINESSES) {
    const forms = formsFor({ segment: biz.seg, where: place.where, needs: { ...biz.needs, ...(place.country !== "US" ? { foreignEntity: true } : {}) } });
    if (forms.length < 3) continue;
    const g = { place, biz, forms }; guides.push(g);
    for (const f of forms) usedBy.set(f.id, [...(usedBy.get(f.id) ?? []), g]);
  }
  const all = [...new Map(guides.filter(g => g.place === place).flatMap(g => g.forms).map(f => [f.id, f])).values()].sort((a, b) => a.order - b.order);
  for (const topic of TOPICS) { const forms = all.filter(topic.pick); if (forms.length >= 2) topicPages.push({ place, topic, forms }); }
}
const guidePath = (g: { place: Place; biz: Biz }, l: L) => `${base(l)}/${g.place.slug}/${g.biz.slug}.html`;
const topicPath = (p: Place, tp: Topic, l: L) => `${base(l)}/${p.slug}/${tp.slug}.html`;
const findGuide = (place: string, seg: string) => guides.find(g => g.place.slug === place && (g.biz.slug === seg || (seg === "seller" && g.biz.slug === "importer-ecommerce") || (seg === "warehouse" && g.biz.slug === "warehouse-3pl") || (seg === "retail" && g.biz.slug === "retail-store")));
const guideLabel = (g: Guide, l: L) => (l === "zh" ? `${g.place.name.zh}：${g.biz.name.zh}` : `${g.biz.plural.en} in ${g.place.name.en}`);
const placesUsed = PLACES.filter(p => guides.some(g => g.place === p));

for (const l of ["en", "zh"] as L[]) {
  const o: L = l === "en" ? "zh" : "en";

  /* guides: a business in a city */
  for (const g of guides) {
    const biz = g.biz.name[l], city = g.place.name[l];
    const title = l === "zh" ? `在${city}开${biz}需要哪些执照和许可` : `Licenses and permits to open ${an(biz)} ${biz} in ${city}`;
    const desc = l === "zh" ? `在${city}开${biz}需要办理的 ${g.forms.length} 项执照、许可和登记，按顺序列出机构、办理方式、费用和官方链接。` : `The ${g.forms.length} licenses, permits and registrations ${an(biz)} ${biz} in ${city} files, in order, with the agency, how each is filed, the fee and the official link.`;
    const dek = `${t(g.biz.note, l)} ${l === "zh" ? `以下是按办理顺序排列的 ${g.forms.length} 项申请。` : `Here are the ${g.forms.length} filings, in the order they're made.`}`;
    const siblings = guides.filter(x => x.place === g.place && x !== g);
    const qs = ANSWERS.filter(a => a.forms.some(id => g.forms.some(f => f.id === id))).slice(0, 6);
    const tps = topicPages.filter(x => x.place === g.place);
    const body = `${hero(title, dek, bitsFor(l, g.forms.length))}
<div class="cols wrap"><div class="main">
${steps(g.forms, l)}
${embed(title, g.forms, ORIGIN + guidePath(g, l), l)}
${tps.length ? `<section class="more"><h2>${l === "zh" ? `${city}专题` : `More on opening in ${city}`}</h2><ul class="links">${tps.map(x => `<li><a href="${topicPath(x.place, x.topic, l)}">${esc(x.topic.title(city, l))}</a></li>`).join("")}</ul></section>` : ""}
${qs.length ? `<section class="more"><h2>${l === "zh" ? "常见问题" : "Questions people ask"}</h2><ul class="qlist">${qs.map(a => `<li><a href="${answerPath(a.slug, l)}">${esc(a.q[l])}</a></li>`).join("")}</ul></section>` : ""}
<section class="more"><h2>${l === "zh" ? `${city}的其他业务` : `Other businesses in ${city}`}</h2><ul class="links">${siblings.map(x => `<li><a href="${guidePath(x, l)}">${esc(x.biz.plural[l])}</a></li>`).join("")}</ul></section>
<p class="fine">${l === "zh" ? "各机构要求可能变化，提交前请以机构官网为准。" : "Agency requirements change. Check each agency's page before you file."}</p>
</div>${rail(g.forms, l)}</div>`;
    const ld = { "@context": "https://schema.org", "@type": "HowTo", name: title, description: desc, inLanguage: l === "zh" ? "zh-CN" : "en", dateModified: TODAY, publisher: { "@type": "Organization", name: "Placetta", url: ORIGIN },
      step: g.forms.map((f, i) => ({ "@type": "HowToStep", position: i + 1, name: t(f.title, l), text: t(f.how, l), url: ORIGIN + guidePath(g, l) + `#s${i + 1}` })) };
    write(guidePath(g, l), page({ l, path: guidePath(g, l), alt: guidePath(g, o), title, desc, body, ld: [ld], kind: "guide", ctx: { place: g.place, biz: g.biz },
      crumbs: [[UI.guides[l], base(l) + "/"], [city, cityPath(g.place, l)], [g.biz.plural[l], guidePath(g, l)]] }));
    urls.push({ path: guidePath(g, l), alt: guidePath(g, o), pri: 0.8 });
  }

  /* topics in a city */
  for (const tp of topicPages) {
    const city = tp.place.name[l], title = tp.topic.title(city, l), c = costOf(tp.forms);
    let lead = t(tp.topic.dek, l);
    if (tp.topic.slug === "permit-costs") lead = l === "zh" ? `在${city}，有固定金额的政府规费合计约 ${money(c.total, c.cur)}。另有 ${c.varies.length} 项按场所或业务计算，${c.free.length} 项免费。装修、保险和顾问费用不在其内。` : `In ${city}, the filings with a fixed government fee add up to about ${money(c.total, c.cur)}. ${c.varies.length} more are set by the space or the business, and ${c.free.length} are free. Build-out, insurance and adviser costs are on top.`;
    const desc = `${lead} ${l === "zh" ? `共 ${tp.forms.length} 项申请，附官方链接。` : `${tp.forms.length} filings with official links.`}`.slice(0, 300);
    const body = `${hero(title, lead, bitsFor(l, tp.forms.length))}
<div class="cols wrap"><div class="main">
${steps(tp.forms, l)}
<section class="more"><h2>${l === "zh" ? `按业务查看${city}指南` : `Guides for each business in ${city}`}</h2><ul class="links">${guides.filter(x => x.place === tp.place).map(x => `<li><a href="${guidePath(x, l)}">${esc(x.biz.plural[l])}</a></li>`).join("")}</ul></section>
<p class="fine">${l === "zh" ? "各机构要求可能变化，提交前请以机构官网为准。" : "Agency requirements change. Check each agency's page before you file."}</p>
</div>${rail(tp.forms, l)}</div>`;
    const ld = { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: l === "zh" ? "zh-CN" : "en", mainEntity: [{ "@type": "Question", name: title, acceptedAnswer: { "@type": "Answer", text: `${lead} ${tp.forms.map((f, i) => `${i + 1}. ${t(f.title, l)} (${t(f.agency, l)}${f.takes ? `; ${t(f.takes, l)}` : ""})`).join(" ")}` } }] };
    write(topicPath(tp.place, tp.topic, l), page({ l, path: topicPath(tp.place, tp.topic, l), alt: topicPath(tp.place, tp.topic, o), title, desc, body, ld: [ld], kind: "topic", ctx: { place: tp.place },
      crumbs: [[UI.guides[l], base(l) + "/"], [city, cityPath(tp.place, l)], [title, topicPath(tp.place, tp.topic, l)]] }));
    urls.push({ path: topicPath(tp.place, tp.topic, l), alt: topicPath(tp.place, tp.topic, o), pri: 0.7 });
  }

  /* a city page */
  for (const p of placesUsed) {
    const city = p.name[l], gs = guides.filter(x => x.place === p), tps = topicPages.filter(x => x.place === p);
    const title = l === "zh" ? `在${city}开店：执照与许可指南` : `Opening a business in ${city}: licenses and permits`;
    const dek = l === "zh" ? `${gs.length} 类业务的完整申请清单，以及费用、时长、外资、雇佣和续期等 ${tps.length} 个专题。` : `Filing lists for ${gs.length} kinds of business, and ${tps.length} topics on costs, timing, foreign owners, hiring and renewals.`;
    const body = `${hero(title, dek, [`${UI.updated[l]} ${day(l)}`, esc(countryName(p.country)[l])])}
<div class="wrap city-page">
<section><h2 class="sec">${l === "zh" ? "按业务" : "By business"}</h2><ul class="tiles">${gs.map(x => `<li><a href="${guidePath(x, l)}"><b>${esc(x.biz.plural[l])}</b><span>${l === "zh" ? `${x.forms.length} 项申请` : `${x.forms.length} filings`}</span></a></li>`).join("")}</ul></section>
<section><h2 class="sec">${l === "zh" ? "按专题" : "By topic"}</h2><ul class="qgrid">${tps.map(x => `<li><a href="${topicPath(p, x.topic, l)}">${esc(x.topic.title(city, l))}</a></li>`).join("")}</ul></section>
</div>`;
    const ld = { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description: dek, inLanguage: l === "zh" ? "zh-CN" : "en",
      hasPart: gs.map(x => ({ "@type": "HowTo", name: x.biz.plural[l], url: ORIGIN + guidePath(x, l) })) };
    write(cityPath(p, l), page({ l, path: cityPath(p, l), alt: cityPath(p, o), title, desc: dek, body, ld: [ld], kind: "city", ctx: { place: p },
      crumbs: [[UI.guides[l], base(l) + "/"], [city, cityPath(p, l)]] }));
    urls.push({ path: cityPath(p, l), alt: cityPath(p, o), pri: 0.9 });
  }

  /* a page per official form */
  for (const f of FORMS) {
    const name = t(f.title, l);
    const title = l === "zh" ? `${f.form}：${name}办理指南` : `${f.form}: how to file the ${lower1(name)}`;
    const desc = l === "zh" ? `${t(f.agency, l)}的${name}：谁需要办、如何办理、费用、所需时间${f.fields.length ? "和表格逐行说明" : ""}。` : `${name} from ${t(f.agency, l)}: who files it, how, the fee and how long it takes${f.fields.length ? ", with each line of the form" : ""}.`;
    const users = usedBy.get(f.id) ?? [];
    const qs = ANSWERS.filter(a => a.forms.includes(f.id));
    const body = `${hero(title, t(f.how, l), [esc(t(f.agency, l)), esc(where(f, l)), `${UI.updated[l]} ${day(l)}`])}
<div class="cols wrap"><div class="main">
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
<section><h2>${l === "zh" ? "官方链接" : "Official links"}</h2><ul class="links"><li><a href="${esc(f.url)}" rel="noopener">${l === "zh" ? "办理入口" : "Where it's filed"}</a></li>${f.info !== f.url ? `<li><a href="${esc(f.info)}" rel="noopener">${l === "zh" ? "机构说明页" : "The agency's page about it"}</a></li>` : ""}${f.pdf && f.pdf !== f.url ? `<li><a href="${esc(f.pdf)}" rel="noopener">${l === "zh" ? "官方 PDF" : "The official PDF"}</a></li>` : ""}</ul><p class="fine">${sourceNote(f, l)}</p></section>
${qs.length ? `<section class="more"><h2>${l === "zh" ? "常见问题" : "Questions people ask"}</h2><ul class="qlist">${qs.map(a => `<li><a href="${answerPath(a.slug, l)}">${esc(a.q[l])}</a></li>`).join("")}</ul></section>` : ""}
</div>
${users.length ? `<aside class="rail"><div class="rail-in"><p class="rail-h">${l === "zh" ? "哪些企业需要" : "Who files it"}</p><ul>${users.slice(0, 14).map(u => `<li><a href="${guidePath(u, l)}">${esc(guideLabel(u, l))}</a></li>`).join("")}</ul><div class="sum"><p>${f.fill ? (l === "zh" ? `快哉会逐行填好 ${f.form}` : `Placetta fills ${f.form} line by line`) : (l === "zh" ? "快哉帮您准备并跟进" : "Placetta prepares and tracks it")}</p><a class="btn" href="#get-plan" data-track="rail_cta">${UI.plan[l]}</a></div></div></aside>` : ""}
</div>`;
    const ld = { "@context": "https://schema.org", "@type": "HowTo", name: title, description: desc, inLanguage: l === "zh" ? "zh-CN" : "en", dateModified: TODAY,
      step: [{ "@type": "HowToStep", text: t(f.how, l) }, ...(f.fields.length ? [{ "@type": "HowToStep", text: (l === "zh" ? "填写：" : "Fill in: ") + f.fields.map(x => t(x.label, l)).join(l === "zh" ? "；" : "; ") }] : []), { "@type": "HowToStep", text: (l === "zh" ? "提交至：" : "File at: ") + f.url }] };
    write(formPath(f, l), page({ l, path: formPath(f, l), alt: formPath(f, o), title, desc, body, ld: [ld], kind: "form",
      crumbs: [[UI.guides[l], base(l) + "/"], [UI.forms[l], `${base(l)}/#forms`], [f.form, formPath(f, l)]] }));
    urls.push({ path: formPath(f, l), alt: formPath(f, o), pri: 0.6 });
  }

  /* a page per question */
  for (const a of ANSWERS) {
    let short = a.a[l], forms = a.forms.map(id => formById(id)!).filter(Boolean);
    const rel = (a.plan ?? []).map(x => findGuide(x.place, x.seg)).filter((x): x is Guide => !!x);
    let place: Place | undefined = rel[0]?.place;
    if (a.cost) {
      const g = findGuide(a.cost.place, "restaurant")!; const c = costOf(g.forms); forms = g.forms; rel.unshift(g); place = g.place;
      short = l === "zh"
        ? `${g.place.name.zh}开餐厅的 ${g.forms.length} 项申请中，固定政府规费合计约 ${money(c.total, c.cur)}（${c.fixed.map(f => `${t(f.title, l)} ${money(f.fee as number, c.cur)}`).join("，")}）。另有 ${c.varies.length} 项按场所或业务计算，${c.free.length} 项免费。装修、保险和顾问费用不在其内。`
        : `Across the ${g.forms.length} filings a restaurant in ${g.place.name.en} makes, the fixed government fees add up to about ${money(c.total, c.cur)} (${c.fixed.map(f => `${lower1(t(f.title, l))} ${money(f.fee as number, c.cur)}`).join(", ")}). ${c.varies.length} more are set by the space or the business, and ${c.free.length} are free. Build-out, insurance and adviser costs are on top.`;
    }
    const q = a.q[l];
    const items = forms.map(f => `<li><h3><a href="${formPath(f, l)}">${esc(t(f.title, l))}</a></h3><p class="by">${esc(t(f.agency, l))}<span>${esc(where(f, l))}</span></p><p>${esc(t(f.how, l))}</p>${facts(f, l)}<p class="src"><a href="${esc(f.url)}" rel="noopener">${l === "zh" ? "机构官网" : "The agency's site"}</a></p></li>`).join("");
    const body = `${hero(q, l === "zh" ? "简明答案，附官方表格和机构链接。" : "The short answer, with the official forms and the agencies' own links.", [`${UI.updated[l]} ${day(l)}`, l === "zh" ? "来源：各机构官网" : "Sources: the agencies' own sites"])}
<div class="cols wrap"><div class="main">
<section class="answer"><h2>${l === "zh" ? "简明答案" : "The short answer"}</h2><p>${esc(clean(short))}</p></section>
<section><h2>${l === "zh" ? (a.cost ? "每项申请及费用" : "相关表格") : (a.cost ? "Every filing and its fee" : "The forms involved")}</h2><ol class="cards">${items}</ol></section>
${rel.length ? `<section class="more"><h2>${l === "zh" ? "完整指南" : "Full guides"}</h2><ul class="links">${rel.map(g => `<li><a href="${guidePath(g, l)}">${esc(guideLabel(g, l))}</a></li>`).join("")}</ul></section>` : ""}
<p class="fine">${l === "zh" ? "这是一般信息，不是法律或税务意见。各机构要求可能变化，提交前请以机构官网为准。" : "General information, not legal or tax advice. Agency requirements change; check the agency's page before you file."}</p>
</div>
<aside class="rail"><div class="rail-in"><p class="rail-h">${l === "zh" ? "更多问答" : "More answers"}</p><ul>${ANSWERS.filter(x => x !== a).slice(0, 8).map(x => `<li><a href="${answerPath(x.slug, l)}">${esc(x.q[l])}</a></li>`).join("")}</ul></div></aside>
</div>`;
    const ld = { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: l === "zh" ? "zh-CN" : "en", mainEntity: [{ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: clean(short) } }] };
    write(answerPath(a.slug, l), page({ l, path: answerPath(a.slug, l), alt: answerPath(a.slug, o), title: q, desc: clean(short).slice(0, 155), body, ld: [ld], kind: "answer", ctx: { place },
      crumbs: [[UI.guides[l], base(l) + "/"], [UI.answers[l], `${base(l)}/#answers`], [q, answerPath(a.slug, l)]] }));
    urls.push({ path: answerPath(a.slug, l), alt: answerPath(a.slug, o), pri: 0.8 });
  }

  /* the hub */
  const nGuides = guides.length + topicPages.length;
  const hubTitle = l === "zh" ? "每座城市开店所需的执照，一目了然" : "Every license to open, city by city";
  const hubDek = l === "zh" ? `品牌扩张最快的 ${placesUsed.length} 座城市，${BUSINESSES.length} 类业务，${FORMS.length} 张官方表格：每项申请的机构、顺序、费用和官方链接。` : `The ${placesUsed.length} cities brands are expanding into fastest, ${BUSINESSES.length} kinds of business and ${FORMS.length} official forms: every filing with its agency, order, fee and official link.`;
  const regionPanels = REGIONS.map(r => {
    const ps = placesUsed.filter(p => REGION(p.country) === r.id);
    return `<div class="panel" id="r-${r.id}" role="tabpanel" aria-labelledby="t-${r.id}"><ul class="citygrid">${ps.map(p => {
      const gs = guides.filter(g => g.place === p);
      return `<li class="city" data-f="${esc((p.name.en + " " + p.name.zh + " " + countryName(p.country).en + " " + countryName(p.country).zh).toLowerCase())}"><a class="city-h" href="${cityPath(p, l)}"><b>${esc(p.name[l])}</b><span>${esc(countryName(p.country)[l])}</span></a><p class="city-biz">${gs.slice(0, 5).map(g => `<a href="${guidePath(g, l)}">${esc(g.biz.plural[l])}</a>`).join("")}</p><a class="city-all" href="${cityPath(p, l)}">${l === "zh" ? `全部 ${gs.length + topicPages.filter(x => x.place === p).length} 份指南` : `All ${gs.length + topicPages.filter(x => x.place === p).length} guides`}</a></li>`;
    }).join("")}</ul></div>`;
  }).join("");
  const agencies = [...new Set(FORMS.map(f => where(f, l)))];
  const hub = `<header class="hero hub-hero wrap"><h1>${esc(hubTitle)}</h1><p class="dek">${esc(hubDek)}</p>
<form class="find" role="search" onsubmit="return false"><label class="sr" for="q">${l === "zh" ? "搜索城市、表格或问题" : "Search cities, forms or questions"}</label><input id="q" type="search" autocomplete="off" placeholder="${l === "zh" ? "搜索城市、表格或问题，例如 上海 或 SS-4" : "Search a city, form or question, e.g. Dubai or SS-4"}"><p class="count" id="count" aria-live="polite"></p></form>
<dl class="stats"><div><dt>${l === "zh" ? "城市" : "Cities"}</dt><dd>${placesUsed.length}</dd></div><div><dt>${l === "zh" ? "指南" : "Guides"}</dt><dd>${nGuides}</dd></div><div><dt>${l === "zh" ? "官方表格" : "Official forms"}</dt><dd>${FORMS.length}</dd></div><div><dt>${l === "zh" ? "语言" : "Languages"}</dt><dd>2</dd></div></dl>${sponsors(l)}</header>
<section class="wrap block" id="cities"><h2 class="sec">${l === "zh" ? "品牌正在扩张的城市" : "Where brands are expanding"}</h2>
<div class="tabs" role="tablist" aria-label="${l === "zh" ? "地区" : "Region"}">${REGIONS.map((r, i) => `<button type="button" role="tab" id="t-${r.id}" aria-controls="r-${r.id}" aria-selected="${i === 0}">${esc(r.name[l])}<span>${placesUsed.filter(p => REGION(p.country) === r.id).length}</span></button>`).join("")}</div>
${regionPanels}</section>
<section class="wrap block" id="answers"><h2 class="sec">${UI.answers[l]}</h2><ul class="qgrid">${ANSWERS.map(a => `<li data-f="${esc((a.q.en + " " + a.q.zh).toLowerCase())}"><a href="${answerPath(a.slug, l)}">${esc(a.q[l])}</a></li>`).join("")}</ul></section>
<section class="wrap block" id="forms"><h2 class="sec">${UI.forms[l]}</h2>
${agencies.map(w => { const fs = FORMS.filter(f => where(f, l) === w); return `<details class="fgroup"${w === (l === "zh" ? "美国联邦" : "US federal") ? " open" : ""}><summary><b>${esc(w)}</b><span>${fs.length}</span></summary><ul class="fgrid">${fs.map(f => `<li data-f="${esc((f.form + " " + f.title.en + " " + f.title.zh + " " + f.agency.en + " " + f.agency.zh).toLowerCase())}"><a href="${formPath(f, l)}"><b>${esc(f.form)}</b><span>${esc(t(f.title, l))}</span></a></li>`).join("")}</ul></details>`; }).join("")}
</section>`;
  const ld = [{ "@context": "https://schema.org", "@type": "CollectionPage", name: hubTitle, description: hubDek, inLanguage: l === "zh" ? "zh-CN" : "en" }, ORG,
    { "@context": "https://schema.org", "@type": "WebSite", name: "Placetta", url: ORIGIN, inLanguage: l === "zh" ? "zh-CN" : "en" }];
  write(base(l) + "/", page({ l, path: base(l) + "/", alt: base(o) + "/", title: hubTitle, desc: hubDek, body: hub, ld, kind: "hub", crumbs: [[UI.home[l], "/"], [UI.guides[l], base(l) + "/"]] }));
  urls.push({ path: base(l) + "/", alt: base(o) + "/", pri: 1 });
}

/* ------------------------------------------------------------ assets, data and the files engines read */

writeFileSync("site/guides/guides.css", readFileSync("scripts/guides.css", "utf8"));
writeFileSync("site/guides/guides.js", readFileSync("scripts/guides.js", "utf8"));
if (keepOg) writeFileSync("site/guides/og.png", keepOg);
if (LOGOS.length) { mkdirSync("site/guides/sponsors", { recursive: true }); for (const x of LOGOS) writeFileSync(`site/guides/sponsors/${x.file}`, x.bytes); }

const data = {
  updated: TODAY, publisher: "Placetta", url: ORIGIN + "/guides/",
  cities: placesUsed.map(p => ({ city: p.name.en, country: countryName(p.country).en, url: ORIGIN + cityPath(p, "en"),
    guides: guides.filter(g => g.place === p).map(g => ({ business: g.biz.plural.en, url: ORIGIN + guidePath(g, "en"), filings: g.forms.map(f => ({ name: f.title.en, agency: f.agency.en, fee: f.fee, currency: f.currency ?? "USD", official_link: f.url })) })) })),
  answers: ANSWERS.map(a => ({ question: a.q.en, url: ORIGIN + answerPath(a.slug, "en") })),
};
writeFileSync("site/guides/data.json", JSON.stringify(data));

const enGuide = (g: Guide) => `- [${g.biz.plural.en} in ${g.place.name.en}](${ORIGIN}${guidePath(g, "en")}): ${g.forms.length} filings`;
writeFileSync("site/llms.txt", `# Placetta

> Placetta gets the business licenses, permits and registrations a company needs to open in a new market (restaurants, cafes, milk tea shops, retail stores, importers and warehouses), fills the official government forms and keeps them current. It covers ${placesUsed.length} cities across the US, China, Europe and the Middle East, in English and Chinese.

Every guide lists the filings in the order they are made, with the agency, how each is filed, the government fee and a link to the agency's own page. Facts come from Placetta's library of official forms; agencies change requirements, so check the agency's page before filing.

## Start here
- [License guides, city by city](${ORIGIN}/guides/): every city, business and official form
- [Get a plan for your exact address](${ORIGIN}/app/): Placetta maps every filing for an address, fills the official forms and asks for approval before anything is filed
- [Full text of the answers and city guides](${ORIGIN}/llms-full.txt)
- [Structured data for all guides](${ORIGIN}/guides/data.json)

## Answers
${ANSWERS.map(a => `- [${a.q.en}](${ORIGIN}${answerPath(a.slug, "en")})`).join("\n")}

## Cities
${placesUsed.map(p => `- [${p.name.en}, ${countryName(p.country).en}](${ORIGIN}${cityPath(p, "en")})`).join("\n")}

## Optional
${guides.filter(g => ["restaurant", "retail-store", "importer-ecommerce"].includes(g.biz.slug)).map(enGuide).join("\n")}
`);
writeFileSync("site/llms-full.txt", `# Placetta license guides (full text)

Updated ${TODAY}. Source: ${ORIGIN}/guides/. General information, not legal advice; check each agency's page before filing.

## Answers
${ANSWERS.map(a => {
  if (a.cost) { const g = findGuide(a.cost.place, "restaurant")!; const c = costOf(g.forms); return `### ${a.q.en}\nAcross the ${g.forms.length} filings a restaurant in ${g.place.name.en} makes, the fixed government fees add up to about ${money(c.total, c.cur)}; ${c.varies.length} more depend on the space or business and ${c.free.length} are free. ${ORIGIN}${answerPath(a.slug, "en")}`; }
  return `### ${a.q.en}\n${clean(a.a.en)} ${ORIGIN}${answerPath(a.slug, "en")}`;
}).join("\n\n")}

## City guides
${guides.map(g => `### ${g.biz.plural.en} in ${g.place.name.en}\n${ORIGIN}${guidePath(g, "en")}\n${g.forms.map((f, i) => `${i + 1}. ${f.title.en}, ${f.agency.en}. ${clean(f.how.en)} Fee: ${fee(f, "en")}. ${f.url}`).join("\n")}`).join("\n\n")}
`);

const site = ["/", "/help/", "/privacy.html", "/terms.html"].map(p => `<url><loc>${ORIGIN}${p}</loc></url>`);
const sm = urls.map(u => `<url><loc>${ORIGIN}${u.path}</loc><lastmod>${TODAY}</lastmod><priority>${u.pri}</priority><xhtml:link rel="alternate" hreflang="${u.path.includes("/zh/") ? "zh-CN" : "en"}" href="${ORIGIN}${u.path}"/><xhtml:link rel="alternate" hreflang="${u.path.includes("/zh/") ? "en" : "zh-CN"}" href="${ORIGIN}${u.alt}"/></url>`);
writeFileSync("site/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[...site, ...sm].join("\n")}\n</urlset>\n`);
// search engines and AI answer engines are welcome on the website and the guides; the app stays private
const bots = ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot", "Applebot-Extended", "Baiduspider", "Bytespider", "DuckDuckBot"];
writeFileSync("site/robots.txt", `${bots.map(b => `User-agent: ${b}\nAllow: /\nDisallow: /app/\n`).join("\n")}\nUser-agent: *\nAllow: /\nDisallow: /app/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
writeFileSync("site/guides/urls.txt", urls.map(u => ORIGIN + u.path).join("\n") + "\n");
console.log(`guides: ${urls.length} pages: per language ${placesUsed.length} cities, ${guides.length} business guides, ${topicPages.length} topic pages, ${FORMS.length} form pages, ${ANSWERS.length} answers`);
