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
