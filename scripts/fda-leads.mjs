#!/usr/bin/env node
// Today's FDA call list: firms whose shipments the FDA just refused at the US border, from FDA's own import refusal data.
// Every row is a firm with a reason to say yes this week: the FDA stopped their goods, and we can name why.
//
//   npm run leads:fda                                  last 14 days, CN,HK,TW,KR,JP,VN,TH,SG,MY
//   node scripts/fda-leads.mjs --days 30               last 30 days
//   node scripts/fda-leads.mjs --country CN,TW         only these countries (ISO codes, the firm's address)
//   node scripts/fda-leads.mjs --product noodle,tea    only products whose FDA product, industry or category name has one of these
//
// Writes leads/<date>-fda.csv: one row per firm (FEI), call-first rows on top, with the plain reason, an opener in
// English and Simplified Chinese, and a Google search link to find the firm's site and phone. The data has the foreign
// manufacturer or shipper and its address, never a phone number, so we never fill one in.
//
// Source: FDA Data Dashboard API, import refusals (refusals on or after 2016-10-01, updated weekly, final actions only).
//   Docs:    https://datadashboard.fda.gov/oii/api/index.htm
//   Fields:  https://datadashboard.fda.gov/oii/api/api-definitions-refusals.htm
//   Charges: https://datadashboard.fda.gov/oii/download/ACT_SECTION_CHARGES.CSV (RefusalCharges holds these charge ids)
//
// Setup (free, once):
//   1. Request an API key through FDA's OII Unified Logon (linked from the docs page above): email, first and last name,
//      organization ("Placetta"). FDA emails the key to that address.
//   2. export FDA_DD_USER=<that email>   (sent as the Authorization-User header)
//      export FDA_DD_KEY=<the key>        (sent as the Authorization-Key header)
//   Questions about the API: FDADataDashboard@fda.hhs.gov

// Calling rules (TCPA, FCC rules, NY and CA telemarketing law). Every call from this list is dialed by a person, by
// hand: no autodialer, no prerecorded message, no AI voice. Call 8 AM to 9 PM in the business's own time zone. Check
// numbers that may be cell phones or homes against the National Do Not Call Registry before calling, and put anyone
// who asks not to be called on Placetta's own do-not-call list for good. Emails need Placetta's postal address and an
// opt-out line (CAN-SPAM).
import { mkdirSync, writeFileSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const list = s => (s || "").split(",").map(x => x.trim()).filter(Boolean);
const DAYS = +arg("--days", 14);
const COUNTRIES = list(arg("--country", "CN,HK,TW,KR,JP,VN,TH,SG,MY")).map(c => c.toUpperCase());
const PRODUCTS = list(arg("--product", "")).map(s => s.toLowerCase());
const API = "https://api-datadashboard.fda.gov/v1/import_refusals";
const PAGE = 5000;   // the API's maximum rows per request
const COLUMNS = ["FEINumber", "FirmName", "AddressLine1", "AddressLine2", "City", "State", "ZipCode", "CountryCode", "CountryName",
  "IndustryCode", "IndustryCodeDescription", "ProductCategory", "ProductCode", "ProductCodeDescription", "RefusalDate",
  "ShipmentID", "FDASampleAnalysis", "PrivateLabAnalysis", "RefusalCharges", "FirmProfile"];

export const SETUP = `FDA Data Dashboard credentials missing.
  1. Request a free API key: https://datadashboard.fda.gov/oii/api/index.htm (OII Unified Logon; organization "Placetta").
  2. export FDA_DD_USER=<the email you registered>   # Authorization-User header
     export FDA_DD_KEY=<the key FDA emailed you>     # Authorization-Key header
  3. npm run leads:fda`;

const iso = t => new Date(t).toISOString().slice(0, 10);

// Every refusal in the window for these countries, newest first, paged 5,000 at a time.
export async function fetchRows({ days = DAYS, countries = COUNTRIES, user = process.env.FDA_DD_USER, key = process.env.FDA_DD_KEY, now = Date.now(), fetch: f = fetch } = {}) {
  if (!user || !key) throw new Error(SETUP);
  const filters = { RefusalDateFrom: [iso(now - days * 864e5)] };
  if (countries.length) filters.CountryCode = countries;
  const rows = [];
  for (let start = 1; ; ) {
    const r = await f(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization-User": user, "Authorization-Key": key },
      body: JSON.stringify({ start, rows: PAGE, sort: "RefusalDate", sortorder: "desc", filters, columns: COLUMNS }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.statuscode === 412) break;   // "No results found."
    if (j.statuscode !== 400) {        // 400 is this API's "Success."
      if (j.statuscode === 401 || r.status === 401) throw new Error(`FDA Data Dashboard says Not Authorized: check FDA_DD_USER and FDA_DD_KEY.\n\n${SETUP}`);
      throw new Error(`FDA Data Dashboard answered ${j.statuscode ?? r.status}: ${j.message || r.statusText || "no message"}`);
    }
    rows.push(...(j.result || []));
    if (!(j.resultcount >= PAGE)) break;
    start += j.resultcount;
  }
  return rows;
}

// FDA charge ids (ACT_SECTION_CHARGES), with the plain reason after "refused ... for", in English and Chinese.
// kind "file" or "label" when the cure is a filing, registration or label, which is Placetta's work. Codes not listed here print as
// "FDA charge <code>" so we never guess at a meaning. FDA's charge list has no food facility registration or prior
// notice charge: food missing those is held under sections 801(l) and 801(m), so it does not show up in this data.
const C = (name, kind, en, zh) => ({ name, kind, fix: !!kind, en, zh });
export const CHARGES = {
  // Filings and registrations
  62: C("NEEDS FCE", "file", "no canned food plant registration (FCE) with FDA", "工厂未在FDA办理罐头食品工厂登记（FCE）"),
  83: C("NO PROCESS", "file", "no scheduled process filed with FDA", "未向FDA备案罐头食品的杀菌工艺（SID）"),
  3886: C("FSVP VIO", "file", "the US importer's Foreign Supplier Verification Program (FSVP) not being in order", "美国进口商的外国供应商验证计划（FSVP）不合规"),
  2000: C("IMPTRHACCP", "file", "the importer missing its seafood HACCP verification records", "进口商缺少水产品HACCP验证记录"),
  2160: C("LACK NOTIF", "file", "missing the required infant formula notification", "缺少婴儿配方食品的上市前通知文件"),
  3280: C("FRNMFGREG", "file", "the factory not being registered with FDA", "生产工厂未在FDA注册"),
  3741: C("FRNMFGREG", "file", "no statement of the factory's FDA registration", "未提交工厂的FDA注册声明"),
  3873: C("708NOREG", "file", "the factory not being registered with FDA", "生产工厂未在FDA注册"),
  118: C("NOT LISTED", "file", "the product not being listed with FDA", "产品未在FDA登记列名"),
  3872: C("708LISTING", "file", "the drug not being listed with FDA", "药品未在FDA登记列名"),
  341: C("REGISTERED", "file", "the distributor not being registered with FDA", "经销商未在FDA注册"),
  // Labels
  218: C("LIST INGRE", "label", "a label missing the ingredient list", "标签缺少配料表"),
  482: C("NUTRIT LBL", "label", "a label missing the Nutrition Facts panel", "标签缺少营养成分表"),
  3320: C("TRANSFAT", "label", "a Nutrition Facts panel missing trans fat", "营养成分表未标注反式脂肪"),
  262: C("DIETARY", "label", "a special dietary label missing nutrition information", "特殊膳食产品标签缺少营养信息"),
  324: C("NO ENGLISH", "label", "required label information that is not in English or not readable", "标签必需信息未用英文标注或不够醒目"),
  472: C("NO ENGLISH", "label", "a label that is not in English", "标签未使用英文"),
  3260: C("NO ENGLISH", "label", "a label that is not in English", "标签未使用英文"),
  328: C("USUAL NAME", "label", "a label missing the product's common name", "标签缺少产品通用名称"),
  325: C("STD NAME", "label", "a label not using the name FDA's standard requires", "标签未使用FDA标准规定的名称"),
  327: C("OPTION ING", "label", "a label missing optional ingredients", "标签未标注可选配料"),
  320: C("LACKS FIRM", "label", "a label missing the maker's or distributor's name and address", "标签缺少生产商或经销商名称和地址"),
  333: C("LACKS FIRM", "label", "a label missing the maker's or distributor's name and address", "标签缺少生产商或经销商名称和地址"),
  321: C("LACKS N/C", "label", "a label missing an accurate net weight", "标签缺少准确的净含量"),
  335: C("LACKS N/C", "label", "a label missing an accurate net weight", "标签缺少准确的净含量"),
  256: C("INCONSPICU", "label", "required label information that is not prominent enough", "标签必需信息不够醒目"),
  336: C("INCONSPICU", "label", "required label information that is not prominent enough", "标签必需信息不够醒目"),
  3865: C("COLORLABEL", "label", "required label information that is not prominent enough", "标签必需信息不够醒目"),
  473: C("LABELING", "label", "a label that breaks packaging and labeling rules", "标签内容或位置不符合包装标签法规"),
  3300: C("ALLERGEN", "label", "a label not declaring a major allergen", "标签未声明主要过敏原"),
  274: C("COLOR LBLG", "label", "a label not declaring artificial color", "标签未声明人工色素"),
  64: C("YELLOW #5", "label", "a label not declaring FD&C Yellow No. 5", "标签未声明柠檬黄（FD&C黄色5号）"),
  258: C("FLAVR LBLG", "label", "a label not declaring artificial flavor", "标签未声明人工香料"),
  276: C("PRESRV LBL", "label", "a label not declaring a preservative", "标签未声明防腐剂"),
  2040: C("SULFITELBL", "label", "a label not declaring sulfites", "标签未声明亚硫酸盐"),
  329: C("JUICE %", "label", "a label missing the juice percentage", "标签未标注果汁含量百分比"),
  488: C("HEALTH C", "label", "an unauthorized health or nutrient claim on the label", "标签含有未经批准的健康或营养声称"),
  260: C("FALSE", "label", "a label FDA found false or misleading", "标签被FDA认定为虚假或误导"),
  318: C("VITAMN LBL", "label", "vitamin labeling that breaks FDA rules", "维生素标签不符合FDA规定"),
  2300: C("DIETARYLBL", "label", "a label not saying it is a dietary supplement", "标签未注明为膳食补充剂"),
  3862: C("DIETARYING", "label", "a supplement label missing ingredient amounts", "膳食补充剂标签缺少成分及含量"),
  3863: C("PLANT PART", "label", "a supplement label not naming the plant part used", "膳食补充剂标签未注明所用植物部位"),
  3681: C("NCONTACTS", "label", "a supplement label missing a US contact for adverse events", "膳食补充剂标签缺少美国不良反应联系方式"),
  3864: C("NCONTACT", "label", "a supplement label missing a US contact for adverse events", "膳食补充剂标签缺少美国不良反应联系方式"),
  3896: C("NOCONTACT", "label", "a drug label missing a US contact for adverse events", "非处方药标签缺少美国不良反应联系方式"),
  471: C("CSTIC LBLG", "label", "cosmetic labeling that breaks FDA rules", "化妆品标签不符合FDA规定"),
  474: C("COSMETLBLG", "label", "a cosmetic label missing the product's common name", "化妆品标签缺少产品通用名称"),
  475: C("COSMETLBLG", "label", "a cosmetic label missing the ingredient list", "化妆品标签缺少成分表"),
  3881: C("COSMETFPLA", "label", "a cosmetic label not declaring a color additive", "化妆品标签未声明色素"),
  2940: C("COSM MISB", "label", "cosmetic labeling FDA found false or misleading", "化妆品标签被FDA认定为虚假或误导"),
  3200: C("COSM MISB2", "label", "cosmetic labeling FDA found false or misleading", "化妆品标签被FDA认定为虚假或误导"),
  // The product itself (a lab result, a plant condition, an approval): we can't file these away
  9: C("SALMONELLA", null, "salmonella", "检出沙门氏菌"),
  295: C("LISTERIA", null, "listeria", "检出李斯特菌"),
  281: C("BACTERIA", null, "harmful bacteria", "检出有害细菌"),
  249: C("FILTHY", null, "filth or decomposition", "含有污物或腐败变质"),
  3422: C("UNFIT4FOOD", null, "being unfit for food", "不适合食用"),
  241: C("PESTICIDE", null, "pesticide residue", "农药残留超标"),
  2920: C("PESTICIDES", null, "pesticide residue", "农药残留超标"),
  3721: C("PESTICIDE2", null, "pesticide residue", "农药残留超标"),
  2860: C("VETDRUGRES", null, "veterinary drug residue", "兽药残留"),
  251: C("POISONOUS", null, "a harmful substance", "含有有毒有害物质"),
  310: C("POISONOUS", null, "a harmful substance", "含有有毒有害物质"),
  297: C("AFLATOXIN", null, "aflatoxin", "黄曲霉毒素超标"),
  3897: C("MYCOTOXIN", null, "mycotoxins", "霉菌毒素超标"),
  238: C("UNSAFE ADD", null, "an unapproved food additive", "含有未经批准的食品添加剂"),
  11: C("UNSAFE COL", null, "an unapproved color additive", "含有未经批准的色素"),
  245: C("EXCESS SUL", null, "too much sulfite", "亚硫酸盐超标"),
  2360: C("HISTAMINE", null, "histamine", "组胺超标"),
  186: C("INSANITARY", null, "insanitary production or storage", "生产或储存条件不卫生"),
  306: C("INSANITARY", null, "insanitary production or storage", "生产或储存条件不卫生"),
  313: C("HELD INSAN", null, "insanitary storage", "储存条件不卫生"),
  308: C("MFR INSAN", null, "an insanitary factory", "工厂生产条件不卫生"),
  3898: C("INADPRCCTL", null, "inadequate process controls", "生产过程控制不足"),
  48: C("NEEDS ACID", null, "inadequate acidification", "酸化处理不足"),
  3701: C("ALRGN402A4", null, "allergen cross-contact", "存在过敏原交叉污染"),
  75: C("UNAPPROVED", null, "being an unapproved drug", "属于未经批准的新药"),
};
const BY_NAME = Object.fromEntries(Object.entries(CHARGES).reverse().map(([id, c]) => [c.name, id]));

// RefusalCharges holds charge ids separated by commas ("324, 482"). Names ("NO PROCESS") and "NAME-83" also parse.
export function charges(s) {
  const out = new Map();
  for (const t of String(s ?? "").split(/[,;|]/).map(t => t.trim()).filter(Boolean)) {
    const id = /^\d+$/.test(t) ? t : /-(\d+)$/.exec(t)?.[1] ?? BY_NAME[t.toUpperCase()];
    const c = id && CHARGES[id] ? { code: id, ...CHARGES[id] } : { code: id || t, name: "", kind: null, fix: false, en: `FDA charge ${t}`, zh: `FDA指控代码${t}`, unknown: true };
    out.set(c.code, c);
  }
  return [...out.values()];
}

const title = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim().replace(/(?<=^|[\s(&/.,"-])\S/g, c => c.toUpperCase());
const day = s => String(s || "").slice(0, 10);

// What the caller calls the product: the FDA product name up to its first comma ("NOODLES, RICE" -> "noodles").
const product = r => (r.ProductCodeDescription || r.IndustryCodeDescription || "product").split(",")[0].trim().toLowerCase();
// FDA industry code (first two characters of the product code) in Chinese, for the Chinese opener.
const INDUSTRY_ZH = {
  "02": "谷物及淀粉制品", "03": "烘焙食品", "04": "面条制品", "05": "谷物早餐", "07": "休闲零食", "09": "乳制品", "12": "奶酪制品",
  "13": "冰淇淋", "15": "蛋制品", "16": "水产品", "17": "肉制品", "18": "植物蛋白制品", "20": "水果制品", "21": "水果制品",
  "22": "水果制品", "23": "坚果籽类", "24": "蔬菜制品", "25": "蔬菜制品", "26": "食用植物油", "27": "调味酱料", "28": "香辛料及调味品",
  "29": "饮料及饮用水", "30": "饮料浓浆", "31": "茶和咖啡", "32": "酒类", "33": "糖果", "34": "巧克力及可可制品", "35": "果冻布丁类",
  "36": "食糖及甜味剂", "37": "调理食品及酱汁", "38": "汤料", "39": "沙拉类食品", "40": "婴幼儿食品", "41": "代餐食品",
  "45": "食品添加剂", "46": "食品添加剂", "53": "化妆品", "54": "膳食补充剂",
};
const productZh = r => INDUSTRY_ZH[String(r.IndustryCode || r.ProductCode || "").padStart(2, "0").slice(0, 2)] || product(r);
const dayZh = d => { const [y, m, dd] = d.split("-"); return `${y}年${+m}月${+dd}日`; };

// The first sentence the caller says. One line, about their shipment, no jargon, no em dashes.
function opener(name, w) {
  const hi = { en: `Hi, is this the person who handles US shipments at ${name}? FDA refused your ${w.product} shipment on ${w.date} for ${w.en}.`,
    zh: `您好，请问是${name}负责美国出货的同事吗？FDA在${dayZh(w.date)}拒绝了贵司的${w.productZh}货物，原因是${w.zh}。` };
  if (w.kind === "file") return {
    en: `${hi.en} We fix that filing and keep every FDA registration current so the next one clears. Can I send you what to fix?`,
    zh: `${hi.zh}我们帮您改好这项申报，并让贵司所有FDA注册保持有效，下一批就能顺利通关。我把需要修改的内容发给您可以吗？`,
  };
  if (w.kind === "label") return {
    en: `${hi.en} We fix that label and keep every FDA registration current so the next one clears. Can I send you what to fix?`,
    zh: `${hi.zh}我们帮您改好标签，并让贵司所有FDA注册保持有效，下一批就能顺利通关。我把需要修改的内容发给您可以吗？`,
  };
  return {
    en: `${hi.en} That one is about the product itself, but we keep every FDA registration, filing and label right so nothing else holds up the next one. Can I send you the checklist?`,
    zh: `${hi.zh}这一项涉及产品本身，但我们会把贵司所有FDA注册、申报和标签都做对，下一批不会再因为这些被卡。我把清单发给您可以吗？`,
  };
}

// Why this firm should talk to us this week. Lower rank = call first.
function reason(rs, now) {
  const week = iso(now - 7 * 864e5);
  const recent = rs.filter(r => day(r.RefusalDate) >= week);
  const fixRecent = recent.find(r => charges(r.RefusalCharges).some(c => c.fix));
  const lead = fixRecent || recent[0] || rs[0];   // rs is newest first
  // The opener names what we fix when there is something to fix, else the first two charges as FDA gave them.
  const all = charges(lead.RefusalCharges);
  const fixes = all.filter(c => c.fix);
  const known = all.filter(c => !c.unknown);
  const shown = fixes.length ? fixes : known.length ? known : all;
  const two = shown.length ? [...new Map(shown.map(c => [c.en, c])).values()].slice(0, 2) : [{ en: "a reason FDA did not list", zh: "FDA未列明的原因", kind: null }];
  const w = {
    date: day(lead.RefusalDate), kind: two.some(c => c.kind === "file") ? "file" : two[0].kind, product: product(lead), productZh: productZh(lead), lead,
    en: two.map(c => c.en).join(" and "), zh: two.map(c => c.zh).join("，以及"),
  };
  if (fixRecent) return { rank: 1, trigger: "Refused this week, a filing or label we fix", ...w };
  if (recent.length) return { rank: 2, trigger: "Refused this week", ...w };
  return { rank: 3, trigger: w.kind ? "Refused recently, a filing or label we fix" : "Refused recently", ...w };
}

export function build(rows, { products = PRODUCTS, countries = COUNTRIES, now = Date.now() } = {}) {
  const by = new Map();
  for (const r of rows) {
    if (countries.length && !countries.includes(String(r.CountryCode || "").toUpperCase())) continue;
    if (products.length && !products.some(p => [r.ProductCodeDescription, r.IndustryCodeDescription, r.ProductCategory].some(v => (v || "").toLowerCase().includes(p)))) continue;
    const k = r.FEINumber != null && r.FEINumber !== "" ? `fei:${r.FEINumber}` : `name:${(r.FirmName || "").toLowerCase()}|${r.CountryCode}`;
    (by.get(k) || by.set(k, []).get(k)).push(r);
  }
  const out = [];
  for (const [, rs] of by) {
    rs.sort((a, b) => day(b.RefusalDate).localeCompare(day(a.RefusalDate)));   // newest first, ties keep FDA's order
    const r0 = rs[0];
    const w = reason(rs, now);
    const name = title(r0.FirmName);
    const all = [...new Map(rs.flatMap(r => charges(r.RefusalCharges)).map(c => [c.code, c])).values()];
    const city = title(r0.City);
    const o = opener(name, w);
    out.push({
      rank: w.rank, trigger: w.trigger, firm: name, fei: r0.FEINumber ?? "",
      country: r0.CountryName ? title(r0.CountryName) : r0.CountryCode || "",
      address: [title(r0.AddressLine1), title(r0.AddressLine2), city, r0.State || "", r0.ZipCode || ""].filter(Boolean).join(", "),
      product: title(w.lead.ProductCodeDescription || w.lead.IndustryCodeDescription), product_code: w.lead.ProductCode || "",
      refused: w.date, shipments: rs.length, fixable: all.some(c => c.fix) ? "yes" : "no",
      reason: [...new Set(all.map(c => c.en))].join("; "), charges: all.map(c => (c.name ? `${c.name} (${c.code})` : c.code)).join("; "),
      opener_en: o.en, opener_zh: o.zh,
      search: `https://www.google.com/search?q=${encodeURIComponent(`"${name}" ${city} ${r0.CountryName || r0.CountryCode || ""} website phone`.replace(/\s+/g, " ").trim())}`,
      fda_profile: r0.FirmProfile || "",
      shipment_ids: [...new Set(rs.map(r => r.ShipmentID).filter(Boolean))].join("; "),
    });
  }
  return out.sort((a, b) => a.rank - b.rank || (a.refused < b.refused ? 1 : a.refused > b.refused ? -1 : 0) || b.shipments - a.shipments);
}

export const COLS = ["rank", "trigger", "firm", "fei", "country", "address", "product", "product_code", "refused", "shipments", "fixable",
  "reason", "charges", "opener_en", "opener_zh", "search", "fda_profile", "shipment_ids"];
export const csv = rows => {
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [COLS.join(","), ...rows.map(r => COLS.map(c => esc(r[c])).join(","))].join("\n");
};

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw;
  try { raw = await fetchRows(); } catch (e) { console.error(e.message); process.exit(2); }
  const rows = build(raw);
  mkdirSync("leads", { recursive: true });
  const f = `leads/${new Date().toISOString().slice(0, 10)}-fda.csv`;
  writeFileSync(f, "\ufeff" + csv(rows));   // BOM so Excel opens the Chinese column as UTF-8
  const n = k => rows.filter(r => r.rank === k).length;
  console.log(`${rows.length} firms to call from ${raw.length} refused lines: ${n(1)} refused this week for a filing or label we fix, ${n(2)} other refusals this week, ${n(3)} earlier. Saved ${f}`);
}
