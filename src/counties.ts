/* The county a US city's permits run through (health, plan check, county business tax). Used for a store's place line
   ("Travis County, TX") and so the agent knows which county agency to look for. Cities not listed show the state. */

const COUNTY: Record<string, [string, string]> = {
  "new york": ["New York County", "纽约县"], manhattan: ["New York County", "纽约县"], brooklyn: ["Kings County", "国王县"], queens: ["Queens County", "皇后县"],
  flushing: ["Queens County", "皇后县"], astoria: ["Queens County", "皇后县"], "long island city": ["Queens County", "皇后县"], elmhurst: ["Queens County", "皇后县"],
  bronx: ["Bronx County", "布朗克斯县"], "the bronx": ["Bronx County", "布朗克斯县"], "staten island": ["Richmond County", "里士满县"],
  "los angeles": ["Los Angeles County", "洛杉矶县"], arcadia: ["Los Angeles County", "洛杉矶县"], alhambra: ["Los Angeles County", "洛杉矶县"], "san gabriel": ["Los Angeles County", "洛杉矶县"],
  "monterey park": ["Los Angeles County", "洛杉矶县"], pasadena: ["Los Angeles County", "洛杉矶县"], torrance: ["Los Angeles County", "洛杉矶县"], "long beach": ["Los Angeles County", "洛杉矶县"], "rowland heights": ["Los Angeles County", "洛杉矶县"],
  "san francisco": ["San Francisco County", "旧金山县"], "san jose": ["Santa Clara County", "圣克拉拉县"], sunnyvale: ["Santa Clara County", "圣克拉拉县"], cupertino: ["Santa Clara County", "圣克拉拉县"],
  milpitas: ["Santa Clara County", "圣克拉拉县"], "palo alto": ["Santa Clara County", "圣克拉拉县"], "mountain view": ["Santa Clara County", "圣克拉拉县"], "santa clara": ["Santa Clara County", "圣克拉拉县"],
  fremont: ["Alameda County", "阿拉米达县"], oakland: ["Alameda County", "阿拉米达县"], berkeley: ["Alameda County", "阿拉米达县"],
  "san diego": ["San Diego County", "圣地亚哥县"], irvine: ["Orange County", "橙县"],
  houston: ["Harris County", "哈里斯县"], dallas: ["Dallas County", "达拉斯县"], austin: ["Travis County", "特拉维斯县"], "san antonio": ["Bexar County", "贝克萨尔县"],
  "fort worth": ["Tarrant County", "塔兰特县"], plano: ["Collin County", "科林县"],
  chicago: ["Cook County", "库克县"], seattle: ["King County", "金县"], bellevue: ["King County", "金县"], boston: ["Suffolk County", "萨福克县"],
  miami: ["Miami-Dade County", "迈阿密戴德县"], tampa: ["Hillsborough County", "希尔斯伯勒县"], orlando: ["Orange County", "奥兰治县"],
  atlanta: ["Fulton County", "富尔顿县"], philadelphia: ["Philadelphia County", "费城县"], "las vegas": ["Clark County", "克拉克县"], henderson: ["Clark County", "克拉克县"],
  phoenix: ["Maricopa County", "马里科帕县"], denver: ["Denver County", "丹佛县"], portland: ["Multnomah County", "摩特诺玛县"], minneapolis: ["Hennepin County", "亨内平县"],
  detroit: ["Wayne County", "韦恩县"], charlotte: ["Mecklenburg County", "梅克伦堡县"], nashville: ["Davidson County", "戴维森县"], "salt lake city": ["Salt Lake County", "盐湖县"],
  "jersey city": ["Hudson County", "哈德逊县"], edison: ["Middlesex County", "米德尔塞克斯县"],
};
/** "Travis County, TX" for Austin, TX; the state alone when the city isn't listed. */
export function countyOf(city: string, state: string): { en: string; zh: string } {
  const st = state.toUpperCase(), hit = COUNTY[city.trim().toLowerCase().replace(/\s+/g, " ")];
  if (st === "DC") return { en: "District of Columbia", zh: "哥伦比亚特区" };
  return hit ? { en: `${hit[0]}, ${st}`, zh: `${hit[1]}，${st}` } : { en: st, zh: st };
}

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC", "washington dc": "DC", "washington, dc": "DC", "d.c.": "DC", dc: "DC",
  加州: "CA", 加利福尼亚: "CA", 德州: "TX", 德克萨斯: "TX", 纽约州: "NY", 纽约: "NY", 佛罗里达: "FL", 华盛顿州: "WA", 伊利诺伊: "IL", 新泽西: "NJ", 马萨诸塞: "MA",
};
const CODES = new Set(Object.values(STATE_NAMES));
/** "Texas", "tx", " TX ", "德州" → "TX"; "" when it isn't a US state. */
export function stateCode(v: string): string {
  const t = v.trim().replace(/\.$/, "");
  if (/^[A-Za-z]{2}$/.test(t) && CODES.has(t.toUpperCase())) return t.toUpperCase();
  return STATE_NAMES[t.toLowerCase().replace(/\s+/g, " ")] ?? STATE_NAMES[t] ?? "";
}
/** "  austin " → "Austin"; names already capitalized ("McAllen", "LaGrange") and non-Latin names stay as written. */
export const cityName = (v: string) => { const t = v.trim().replace(/\s+/g, " "); return /[A-Z]/.test(t) || !/[a-z]/.test(t) ? t : t.replace(/(^|[\s-])([a-z])/g, (_, s: string, c: string) => s + c.toUpperCase()); };
