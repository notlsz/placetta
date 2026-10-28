// The one line a new business starts with: "Milk tea shop in Flushing, NY" or "奶茶店，纽约法拉盛". What it sells, the
// city and state, and whether it's already open are read from the words alone, with no model, the same way in both
// places a business can start: the app's first screen (src/cloud/Root.tsx) and a first text to Odelia by SMS,
// iMessage, WhatsApp or WeChat (supabase/functions/_shared/start.js, bundled from src/server/start-entry.ts).
// Pure functions and lists, no imports, so the server bundle stays small and the tests call them directly.

/** Every US state (and DC) by its two letters and its name. */
export const STATES: [string, string][] = [["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"]];
/** New York City's boroughs and neighborhoods, whose stores get the city's letter grades and food waste rules. */
export const NYC = /^(new york|nyc|manhattan|brooklyn|queens|bronx|the bronx|staten island|flushing|astoria|long island city)$/i;

/** What a business sells, as the first screen's chips show it. */
export const SELLS: { en: string; zh: string }[] = [
  { en: "Milk tea", zh: "奶茶" }, { en: "Coffee", zh: "咖啡" }, { en: "Bakery and desserts", zh: "烘焙甜品" },
  { en: "Restaurant", zh: "餐厅" }, { en: "Grocery", zh: "超市" }, { en: "Retail", zh: "零售" },
  { en: "Importer or online seller", zh: "进口商或电商卖家" }, { en: "Warehouse or 3PL", zh: "仓库或第三方物流" },
  // the product brands whose filings Placetta covers state by state (src/forms/furniture.ts, src/forms/states/products.ts)
  { en: "Furniture", zh: "家具" }, { en: "Mattresses and bedding", zh: "床垫和床上用品" },
  { en: "Laundry detergent and cleaning products", zh: "洗衣液和清洁用品" }, { en: "Packaged food importer", zh: "预包装食品进口商" },
];

/** The cities the city box suggests, and the ones a line names without its state. */
export const CITIES = ["San Antonio, TX", "Fort Worth, TX", "New York, NY", "Flushing, NY", "Brooklyn, NY", "Manhattan, NY", "Queens, NY", "Jersey City, NJ", "Edison, NJ", "Boston, MA", "Philadelphia, PA",
  "Washington, DC", "Chicago, IL", "Houston, TX", "Dallas, TX", "Austin, TX", "Atlanta, GA", "Miami, FL", "Orlando, FL", "Seattle, WA", "Bellevue, WA", "Portland, OR",
  "San Francisco, CA", "San Jose, CA", "Oakland, CA", "Cupertino, CA", "Fremont, CA", "Los Angeles, CA", "Arcadia, CA", "Irvine, CA", "San Gabriel, CA", "San Diego, CA",
  "Las Vegas, NV", "Phoenix, AZ", "Denver, CO", "Minneapolis, MN", "Detroit, MI", "Columbus, OH", "Honolulu, HI"];

/** Cities as Chinese speakers write them: the words, the city and state, and how the plan names it in Chinese. */
export const ZH_CITIES: [RegExp, string, string][] = [[/法拉盛/, "Flushing, NY", "纽约法拉盛"], [/布鲁克林/, "Brooklyn, NY", "纽约布鲁克林"], [/曼哈顿/, "Manhattan, NY", "纽约曼哈顿"], [/皇后区/, "Queens, NY", "纽约皇后区"], [/纽约/, "New York, NY", "纽约"],
  [/圣何塞|圣荷西/, "San Jose, CA", "加州圣何塞"], [/旧金山|三藩市/, "San Francisco, CA", "旧金山"], [/洛杉矶/, "Los Angeles, CA", "洛杉矶"], [/尔湾/, "Irvine, CA", "加州尔湾"], [/圣地亚哥/, "San Diego, CA", "圣地亚哥"], [/阿卡迪亚/, "Arcadia, CA", "加州阿卡迪亚"],
  [/圣盖博/, "San Gabriel, CA", "加州圣盖博"], [/库比蒂诺/, "Cupertino, CA", "加州库比蒂诺"], [/弗里蒙特|佛利蒙/, "Fremont, CA", "加州弗里蒙特"], [/奥克兰/, "Oakland, CA", "加州奥克兰"], [/休斯顿/, "Houston, TX", "休斯顿"], [/达拉斯/, "Dallas, TX", "达拉斯"], [/奥斯汀/, "Austin, TX", "奥斯汀"],
  [/圣安东尼奥/, "San Antonio, TX", "圣安东尼奥"], [/沃斯堡/, "Fort Worth, TX", "沃斯堡"], [/西雅图/, "Seattle, WA", "西雅图"], [/波士顿/, "Boston, MA", "波士顿"], [/芝加哥/, "Chicago, IL", "芝加哥"], [/凤凰城/, "Phoenix, AZ", "凤凰城"], [/拉斯维加斯/, "Las Vegas, NV", "拉斯维加斯"],
  [/费城/, "Philadelphia, PA", "费城"], [/亚特兰大/, "Atlanta, GA", "亚特兰大"], [/迈阿密/, "Miami, FL", "迈阿密"], [/波特兰/, "Portland, OR", "波特兰"], [/丹佛/, "Denver, CO", "丹佛"]];

/** The kinds of business the chips stand for, from the words people use for them. */
export const KINDS: [RegExp, string][] = [
  // products first: a "coffee table" is furniture, and a food importer isn't a restaurant
  [/mattress|bedding|\bpillows?\b|\bcomforters?\b|床垫|床上用品|枕头|被子/i, "Mattresses and bedding"], [/furniture|\bsofas?\b|\bcouch|upholster|\bdressers?\b|家具|沙发|衣柜/i, "Furniture"],
  [/detergent|laundry (liquid|pods?|powder|products?)|cleaning (products?|supplies)|household cleaners?|disinfectant|dish ?soap|洗衣液|洗衣粉|洗涤|清洁用品|清洁剂|消毒液|日化/i, "Laundry detergent and cleaning products"],
  [/packaged food|food (import|brand|distribut)|snack (import|brand)|import(s|ing|er|ers)? (food|snacks)|预包装|食品进口|进口食品|零食进口/i, "Packaged food importer"],
  [/milk ?tea|bubble tea|boba|tea shop|奶茶|茶饮|珍珠/i, "Milk tea"], [/coffee|caf[eé]|咖啡/i, "Coffee"], [/bakery|bake|dessert|cake|烘焙|甜品|面包|蛋糕/i, "Bakery and desserts"],
  [/restaurant|hot ?pot|noodle|dumpling|bbq|kitchen|餐厅|火锅|面馆|饭店|饺子|烧烤|餐馆/i, "Restaurant"], [/grocery|supermarket|market|超市|生鲜/i, "Grocery"], [/import|e-?commerce|online|amazon|进口|电商|跨境/i, "Importer or online seller"],
  [/warehouse|3pl|fulfil|仓库|物流/i, "Warehouse or 3PL"], [/retail|boutique|store|shop|零售|门店|商店/i, "Retail"]];

/** "Flushing, NY" or "Flushing, New York": the city and its two-letter state. */
export function parsePlace(v: string): { city: string; state: string } | null {
  const m = /^\s*([^,]+?)\s*,\s*([A-Za-z .]+?)\s*$/.exec(v);
  if (!m) return null;
  const st = m[2].trim().toLowerCase().replace(/\./g, "");
  const hit = STATES.find(([c, n]) => c.toLowerCase() === st || n.toLowerCase() === st);
  return hit ? { city: m[1].trim(), state: hit[0] } : null;
}

/** The street a line names, if it names one ("150 N First St" from "Milk tea shop at 150 N First St, San Jose, CA"),
 *  with its ZIP code when the line has one, so the address is never typed twice. "" when there is none. */
export function streetIn(t: string): string {
  const m = /\b(\d{1,6}[A-Za-z]?(?:\s+[A-Za-z0-9.'-]+){1,5}?\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Way|Ln|Lane|Pl|Place|Ct|Court|Pkwy|Parkway|Hwy|Highway|Ter|Terrace|Sq|Square|Cir|Circle|Broadway)\.?)(?=[\s,]|$)/i.exec(t);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}
export const zipIn = (t: string) => /\b(\d{5})(?:-\d{4})?\s*$/.exec(t.trim())?.[1] ?? "";

/** What a line says: the city and state ("Flushing, NY", or the words as typed after "in"), what it sells (one of the
 *  chips' English names, or "" when it names none) and whether it's already open. */
export function readLine(t: string): { place: string; sell: string; open: boolean } {
  const low = t.toLowerCase();
  let place = ZH_CITIES.find(([re]) => re.test(t))?.[1] ?? "";
  if (!place) place = CITIES.find(c => low.includes(c.toLowerCase())) ?? CITIES.find(c => new RegExp(`\\b${c.split(",")[0].toLowerCase()}\\b`).test(low)) ?? "";
  if (!place) { const m = /\b(?:in|at)\s+([A-Za-z .'-]+,\s*[A-Za-z .]+)\s*$/i.exec(t); if (m && parsePlace(m[1])) place = m[1].trim(); }
  // a full address: "at 12 Elm St, Dayton, OH 45402" names the city and state in its last two parts
  if (!place) { const m = /,\s*([A-Za-z .'-]+,\s*[A-Za-z .]+?)(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec(t); if (m && parsePlace(m[1])) place = m[1].trim(); }
  const sell = KINDS.find(([re]) => re.test(t))?.[1] ?? "";
  return { place, sell, open: /already open|we'?re open|已开业|已经开业|已营业/i.test(t) };
}

/** The first screen's reading of what the business is, in the person's own words: the line up to "in" or the first
 *  comma, without "a", "an", "my" or "our" ("Hot pot restaurant", "奶茶店"). */
export const ownWords = (line: string) => line.replace(/\s+(in|at)\s+.*$/i, "").replace(/[，,].*$/, "").replace(/^(a|an|my|our)\s+/i, "").trim();

/* ------------------------------------------------------------------ a first text from someone new */

export type StartLine = {
  what: string;        // what it is, in their words when those read as a business ("Milk tea shop", "奶茶店")
  where: string;       // "Flushing, NY"
  city: string;        // "Flushing"
  state: string;       // "NY"
  whereZh?: string;    // "纽约法拉盛", when the city has a Chinese name here
  sell: string;        // the chip it matches ("Milk tea"), or "" for another kind of business
  open: boolean;       // they said it's already open
  lang: "en" | "zh";   // the language they wrote in
};

const CJK = /[㐀-鿿]/;
/** Words that name a place of business, for kinds the chips don't cover ("nail salon", "pet grooming", "药店"). */
const BUSINESS = /\b(shop|store|salon|spa|studio|restaurant|bar|pub|lounge|caf[eé]|bistro|diner|deli|eatery|kitchen|bakery|market|mart|grocery|pharmacy|clinic|gym|fitness|daycare|laundromat|laundry|car ?wash|barber(shop)?|grooming|boutique|outlet|truck|stand|kiosk|cart|warehouse|franchise|tea house|teahouse|massage|nails?|beauty|tattoo|hotel|motel|dispensary|liquor|winery|brewery|distillery|factory|showroom|gallery|school|academy|tutoring|office|agency|business|company|brand|location|branch)s?\b|[店馆铺厅坊院所室吧摊行厂园屋]$/i;
/** Words that start a question or a request rather than name a business. */
const ASKING = /^(can|could|would|will|how|what|when|where|why|who|is|are|do|does|did|should|please|help|need|tell|i need|we need|帮|请|能|可以|怎么|如何|什么|需要)\b/i;
/** Greetings and lead-ins before the business: "Hi! We're opening a …", "我想在…开…". */
const LEAD = /^(hi|hello|hey|yo|good (morning|afternoon|evening)|你好|您好|嗨|哈喽)[\s,!.，！。~]*/i;
const OPENING = /^((i'?m|i am|we'?re|we are|i'?ll be|we'?ll be|i want to|we want to|i'?d like to|we'?d like to|planning to|going to|about to|looking to|trying to)\s+)*(open(ing)?|start(ing)?|launch(ing)?|run(ning)?|own(ing)?|have|got)\s+(up\s+)?/i;
const ZH_LEAD = /^(我们?|本人)?(想要?|要|准备|打算|计划|正在|将要?|会)?(在)?/;
/** Chinese region words that sit next to a city: 纽约, 加州, 德州, 美国. */
const ZH_REGION = /美国|纽约州?|加利福尼亚州?|加州|得克萨斯州?|德州|华盛顿州|伊利诺伊州|马萨诸塞州|麻省|宾夕法尼亚州|宾州|佐治亚州|佛罗里达州|佛州|内华达州|亚利桑那州|科罗拉多州|俄勒冈州|新泽西州?|明尼苏达州|密歇根州|俄亥俄州|夏威夷州?/g;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A text's words, tidied: no greeting, no closing punctuation; null when empty or too long to be one line. */
function tidy(text: string): string | null {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 160) return null;
  return t.replace(/[\s?!.。！？~]+$/u, "").replace(LEAD, "").trim() || null;
}

/** The business in a line, in their words when those read as one: everything but the place, the lead-in ("I'm
 *  opening a") and the article. null when what's left doesn't name a business. */
function businessOf(t: string, lang: "en" | "zh", place: { city: string; state: string } | null, sell: string): string | null {
  let what = lang === "en" && place ? t.replace(/\s+(in|at|near|around)\s+.*$/i, "") : t;
  if (place) {
    // the city and state wherever they are ("Flushing NY milk tea shop"); a state's two letters only in capitals, so
    // "in", "or" and "me" stay words
    const st = STATES.find(([c]) => c === place.state);
    what = what.replace(new RegExp(`\\b${esc(place.city)}\\b`, "ig"), " ").replace(new RegExp(`\\b${esc(place.state)}\\b`, "g"), " ");
    if (st) what = what.replace(new RegExp(`\\b${esc(st[1])}\\b`, "ig"), " ");
  }
  if (lang === "zh") {
    const zh = ZH_CITIES.find(([re]) => re.test(what));
    if (zh) what = what.replace(new RegExp(zh[0].source, "g"), " ");
    what = what.replace(ZH_REGION, " ").replace(/^[\s,，、]+/, "").replace(ZH_LEAD, "").replace(/^(开一家|开一个|开个|开家|开)/, "").replace(/^的/, "")
      .replace(/(开一家|开一个|开个|开家|开)(?=\S)/g, "").replace(/的(?=\S)/, "");
  }
  what = what.replace(/[,，、:：;；()（）]+/g, " ").replace(/\s+/g, " ").trim();
  if (lang === "en") what = what.replace(OPENING, "").replace(/^(a|an|my|our|the|new|a new|our new|my new)\s+/i, "").replace(/^(a|an|new)\s+/i, "").trim();
  if (!what) return null;
  // it must read as a business: a kind the chips know, or a word for a place of business, and not a question
  if (!sell && !BUSINESS.test(what)) return null;
  if (ASKING.test(what) || what.split(" ").length > 6 || what.length > 60) {
    // "Can you help with my restaurant in Houston": the kind, in the chips' words
    if (!sell) return null;
    what = SELLS.find(x => x.en === sell)?.[lang] ?? sell;
  }
  return lang === "en" ? what.charAt(0).toUpperCase() + what.slice(1) : what;
}

/**
 * A first text from someone new, read strictly: what they're opening and where, or null when the line doesn't say
 * both. "Milk tea shop in Flushing, NY", "Hi, opening a bakery in Houston TX", "奶茶店，纽约法拉盛" and "我想在加州尔湾开
 * 火锅店" all read; "hello", "is this the permit place" and "What's the weather in Flushing, NY?" don't. Deterministic.
 */
export function readStart(text: string): StartLine | null {
  const t = tidy(text);
  if (!t) return null;
  const lang: "en" | "zh" = CJK.test(t) ? "zh" : "en";
  const r = readLine(t);
  const place = parsePlace(r.place);
  if (!place) return null;
  const what = businessOf(t, lang, place, r.sell);
  if (!what) return null;
  return { what, where: `${place.city}, ${place.state}`, city: place.city, state: place.state, whereZh: ZH_CITIES.find(([, en]) => en === r.place)?.[2],
    sell: r.sell, open: r.open, lang };
}

/** Half a line: the business ("I want to open a milk tea shop") or the place ("Flushing", "Springfield, IL"), for an
 *  answer to Odelia's one question that names only what was missing. Empty when it names neither. */
export function readPart(text: string): { what?: string; where?: string } {
  const t = tidy(text);
  if (!t) return {};
  const lang: "en" | "zh" = CJK.test(t) ? "zh" : "en";
  const r = readLine(t);
  const place = parsePlace(r.place) ?? parsePlace(t);
  const what = businessOf(t, lang, place, r.sell);
  return { ...(what ? { what } : {}), ...(place ? { where: `${place.city}, ${place.state}` } : {}) };
}
