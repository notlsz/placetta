/* Where a US address is, the way the agencies divide it: the city (not the street: "2140 Dallas Pkwy, Plano" is in
   Plano), the state, the county whose health department or business tax applies, and whether the place is
   unincorporated (then the county, not a city, licenses and permits). Pure functions: the registry, the instant plan
   and the agent all read places through here. */

/** A county (or a health district that covers one) whose steps the library has, as the code its forms are filed under. */
export type County = { code: string; en: string; zh: string; state: string; health?: { en: string; zh: string } };

export const COUNTIES: Record<string, County> = {
  LAC: { code: "LAC", en: "Los Angeles County", zh: "洛杉矶县", state: "CA", health: { en: "Los Angeles County Department of Public Health, Environmental Health", zh: "洛杉矶县公共卫生局环境卫生处" } },
  SCC: { code: "SCC", en: "Santa Clara County", zh: "圣克拉拉县", state: "CA", health: { en: "County of Santa Clara Department of Environmental Health", zh: "圣克拉拉县环境卫生局" } },
  ALA: { code: "ALA", en: "Alameda County", zh: "阿拉米达县", state: "CA", health: { en: "Alameda County Environmental Health Department", zh: "阿拉米达县环境卫生局" } },
  SMC: { code: "SMC", en: "San Mateo County", zh: "圣马特奥县", state: "CA", health: { en: "San Mateo County Environmental Health Services", zh: "圣马特奥县环境卫生服务处" } },
  ORC: { code: "ORC", en: "Orange County", zh: "橙县", state: "CA", health: { en: "Orange County Health Care Agency, Environmental Health", zh: "橙县卫生保健局环境卫生处" } },
  SDC: { code: "SDC", en: "San Diego County", zh: "圣地亚哥县", state: "CA", health: { en: "San Diego County Department of Environmental Health and Quality", zh: "圣地亚哥县环境卫生与质量局" } },
  SACC: { code: "SACC", en: "Sacramento County", zh: "萨克拉门托县", state: "CA", health: { en: "Sacramento County Environmental Management Department", zh: "萨克拉门托县环境管理局" } },
  KC: { code: "KC", en: "King County", zh: "金县", state: "WA", health: { en: "Public Health, Seattle and King County", zh: "西雅图与金县公共卫生局" } },
  SNHD: { code: "SNHD", en: "Clark County", zh: "克拉克县", state: "NV", health: { en: "Southern Nevada Health District", zh: "南内华达卫生区" } },
  DEKALB: { code: "DEKALB", en: "DeKalb County", zh: "迪卡尔布县", state: "GA", health: { en: "DeKalb County Board of Health, Environmental Health", zh: "迪卡尔布县卫生委员会环境卫生处" } },
  COBB: { code: "COBB", en: "Cobb County", zh: "科布县", state: "GA" },
  WASHOR: { code: "WASHOR", en: "Washington County", zh: "华盛顿县", state: "OR" },
  CLACK: { code: "CLACK", en: "Clackamas County", zh: "克拉克默斯县", state: "OR" },
  FULC: { code: "FULC", en: "Fulton County", zh: "富尔顿县", state: "GA", health: { en: "Fulton County Board of Health, Environmental Health Services", zh: "富尔顿县卫生委员会环境卫生服务处" } },
  GWIN: { code: "GWIN", en: "Gwinnett County", zh: "格威内特县", state: "GA", health: { en: "Gwinnett County Environmental Health (GNR Public Health)", zh: "格威内特县环境卫生处（GNR 公共卫生）" } },
  MOCO: { code: "MOCO", en: "Montgomery County", zh: "蒙哥马利县", state: "MD", health: { en: "Montgomery County Department of Health and Human Services, Licensure and Regulatory Services", zh: "蒙哥马利县卫生与公众服务局许可与监管服务处" } },
  MARI: { code: "MARI", en: "Maricopa County", zh: "马里科帕县", state: "AZ", health: { en: "Maricopa County Environmental Services", zh: "马里科帕县环境服务局" } },
  MULT: { code: "MULT", en: "Multnomah County", zh: "摩特诺玛县", state: "OR", health: { en: "Multnomah County Environmental Health", zh: "摩特诺玛县环境卫生处" } },
  HILL: { code: "HILL", en: "Hillsborough County", zh: "希尔斯伯勒县", state: "FL" },
  ORFL: { code: "ORFL", en: "Orange County", zh: "奥兰治县", state: "FL" },
  MDC: { code: "MDC", en: "Miami-Dade County", zh: "迈阿密戴德县", state: "FL" },
  // counties the library has no steps for yet: named, so the plan can say whose page Odelia reads
  HARRIS: { code: "HARRIS", en: "Harris County", zh: "哈里斯县", state: "TX" },
  FORTBEND: { code: "FORTBEND", en: "Fort Bend County", zh: "本德堡县", state: "TX" },
  COLLIN: { code: "COLLIN", en: "Collin County", zh: "科林县", state: "TX" },
  DALLASC: { code: "DALLASC", en: "Dallas County", zh: "达拉斯县", state: "TX" },
  BERGEN: { code: "BERGEN", en: "Bergen County", zh: "卑尔根县", state: "NJ" },
  MIDDLESEX: { code: "MIDDLESEX", en: "Middlesex County", zh: "米德尔塞克斯县", state: "NJ" },
  HUDSON: { code: "HUDSON", en: "Hudson County", zh: "哈德逊县", state: "NJ" },
  NORFOLK: { code: "NORFOLK", en: "Norfolk County", zh: "诺福克县", state: "MA" },
  MIDDLESEXMA: { code: "MIDDLESEXMA", en: "Middlesex County", zh: "米德尔塞克斯县", state: "MA" },
  SUFFOLK: { code: "SUFFOLK", en: "Suffolk County", zh: "萨福克县", state: "MA" },
  COOK: { code: "COOK", en: "Cook County", zh: "库克县", state: "IL" },
  PHILA: { code: "PHILA", en: "Philadelphia County", zh: "费城县", state: "PA" },
  SLCO: { code: "SLCO", en: "Salt Lake County", zh: "盐湖县", state: "UT", health: { en: "Salt Lake County Health Department", zh: "盐湖县卫生局" } },
  DENVERC: { code: "DENVERC", en: "Denver County", zh: "丹佛县", state: "CO" },
  RIVERSIDE: { code: "RIVERSIDE", en: "Riverside County", zh: "河滨县", state: "CA", health: { en: "Riverside County Department of Environmental Health", zh: "河滨县环境卫生局" } },
  SBDC: { code: "SBDC", en: "San Bernardino County", zh: "圣贝纳迪诺县", state: "CA", health: { en: "San Bernardino County Environmental Health Services", zh: "圣贝纳迪诺县环境卫生服务处" } },
  CONTRACOSTA: { code: "CONTRACOSTA", en: "Contra Costa County", zh: "康特拉科斯塔县", state: "CA", health: { en: "Contra Costa Environmental Health", zh: "康特拉科斯塔县环境卫生处" } },
};

type CityRow = { county: string; zh?: string; uninc?: boolean; ownHealth?: { en: string; zh: string } };
/** Cities and unincorporated places in the beachhead states, by "city|ST", with their county. */
const CITY: Record<string, CityRow> = {};
const add = (st: string, county: string, names: string, extra: Omit<CityRow, "county"> = {}) => { for (const n of names.split(",")) CITY[`${n.trim()}|${st}`] = { county, ...extra }; };
// California. Long Beach, Pasadena and Vernon run their own health departments; Berkeley too, inside Alameda County.
add("CA", "LAC", "los angeles,arcadia,alhambra,san gabriel,monterey park,torrance,temple city,el monte,south el monte,rosemead,san marino,diamond bar,walnut,west covina,covina,glendale,burbank,santa monica,culver city,beverly hills,west hollywood,inglewood,gardena,carson,redondo beach,manhattan beach,hermosa beach,cerritos,downey,norwalk,whittier,la puente,industry,city of industry,pomona,claremont,la verne,san dimas,glendora,azusa,duarte,monrovia,sierra madre,south pasadena,lakewood,bellflower,compton,lawndale,hawthorne,el segundo,palos verdes estates,rancho palos verdes,lomita,santa clarita,lancaster,palmdale,calabasas,agoura hills,malibu,montebello,pico rivera,commerce,bell,bell gardens,huntington park,maywood,cudahy,south gate,lynwood,paramount,artesia,hawaiian gardens,la mirada,santa fe springs,baldwin park,irwindale,bradbury");
add("CA", "LAC", "long beach", { ownHealth: { en: "City of Long Beach Health Department", zh: "长滩市卫生局" } });
add("CA", "LAC", "pasadena", { ownHealth: { en: "City of Pasadena Public Health Department", zh: "帕萨迪纳市公共卫生局" } });
add("CA", "LAC", "vernon", { ownHealth: { en: "City of Vernon Health and Environmental Control", zh: "弗农市卫生与环境管理局" } });
add("CA", "LAC", "rowland heights,hacienda heights,east los angeles,altadena,valinda,west puente valley,avocado heights,south san jose hills,walnut park,florence-firestone,marina del rey,ladera heights,view park,east pasadena,san pasqual,north whittier,south whittier,west whittier-los nietos,charter oak,citrus,stevenson ranch,valencia,castaic,topanga", { uninc: true });
add("CA", "SCC", "san jose,santa clara,sunnyvale,cupertino,milpitas,palo alto,mountain view,campbell,los gatos,saratoga,gilroy,morgan hill,los altos,los altos hills,monte sereno");
add("CA", "ALA", "oakland,fremont,hayward,san leandro,union city,newark,pleasanton,livermore,dublin,alameda,emeryville,albany,piedmont");
add("CA", "ALA", "castro valley,san lorenzo,ashland,cherryland,fairview,sunol", { uninc: true });
add("CA", "ALA", "berkeley", { ownHealth: { en: "City of Berkeley Environmental Health", zh: "伯克利市环境卫生处" } });
add("CA", "SMC", "daly city,south san francisco,san mateo,redwood city,burlingame,millbrae,san bruno,foster city,belmont,san carlos,menlo park,east palo alto,pacifica,half moon bay,brisbane,colma,hillsborough,atherton,portola valley,woodside");
add("CA", "ORC", "irvine,anaheim,santa ana,costa mesa,fullerton,garden grove,westminster,huntington beach,tustin,orange,newport beach,lake forest,mission viejo,buena park,cypress,fountain valley,la habra,yorba linda,placentia,brea,laguna niguel,aliso viejo,rancho santa margarita,laguna hills,laguna beach,dana point,san clemente,seal beach,los alamitos,stanton,la palma");
add("CA", "SDC", "san diego,chula vista,oceanside,escondido,carlsbad,el cajon,vista,san marcos,encinitas,national city,la mesa,santee,poway");
add("CA", "SACC", "sacramento,elk grove,citrus heights,folsom,rancho cordova,galt,isleton");
add("CA", "RIVERSIDE", "riverside,eastvale,corona,jurupa valley,moreno valley,temecula,murrieta");
add("CA", "SBDC", "chino,chino hills,ontario,rancho cucamonga,upland,montclair,fontana,san bernardino");
add("CA", "CONTRACOSTA", "walnut creek,concord,richmond,san ramon,danville,pleasant hill,el cerrito,antioch");
// Washington, Nevada, Georgia, Maryland, Arizona, Oregon, Florida, Virginia
add("WA", "KC", "seattle,bellevue,redmond,kirkland,renton,kent,federal way,issaquah,shoreline,sammamish,auburn,burien,tukwila,seatac,bothell,mercer island,newcastle,des moines,lake forest park,kenmore,woodinville,covington,maple valley");
add("NV", "SNHD", "las vegas,henderson,north las vegas,boulder city,mesquite");
add("NV", "SNHD", "paradise,spring valley,enterprise,winchester,sunrise manor,whitney,summerlin south", { uninc: true });
add("GA", "FULC", "atlanta,sandy springs,roswell,alpharetta,johns creek,milton,college park,east point,union city,fairburn,palmetto,south fulton,chattahoochee hills,mountain park");
add("GA", "DEKALB", "decatur,chamblee,doraville,dunwoody,brookhaven,tucker,stonecrest,lithonia,stone mountain,clarkston,avondale estates,pine lake");
add("GA", "DEKALB", "north druid hills,north decatur,candler-mcafee,belvedere park,scottdale,redan,panthersville", { uninc: true });
add("GA", "COBB", "marietta,smyrna,kennesaw,acworth,austell,powder springs");
add("GA", "COBB", "vinings,mableton", { uninc: true });
add("GA", "GWIN", "duluth,lawrenceville,suwanee,norcross,lilburn,snellville,buford,peachtree corners,berkeley lake,sugar hill,dacula,grayson,loganville,auburn,braselton,rest haven");
add("MD", "MOCO", "rockville,gaithersburg,takoma park");
add("MD", "MOCO", "bethesda,silver spring,germantown,potomac,wheaton,olney,north bethesda,clarksburg,montgomery village,aspen hill,colesville,burtonsville", { uninc: true });
add("AZ", "MARI", "phoenix,mesa,chandler,tempe,scottsdale,gilbert,glendale,peoria,surprise,goodyear,avondale");
add("OR", "MULT", "portland,gresham,troutdale,fairview,wood village");
add("OR", "WASHOR", "beaverton,hillsboro,tigard,tualatin,sherwood,forest grove");
add("OR", "WASHOR", "cedar mill,bethany,aloha,raleigh hills", { uninc: true });
add("OR", "CLACK", "lake oswego,milwaukie,happy valley,oregon city,west linn,wilsonville");
add("OR", "CLACK", "oak grove,clackamas", { uninc: true });
add("FL", "HILL", "tampa,plant city,temple terrace");
add("FL", "ORFL", "orlando,winter park,apopka,ocoee,winter garden,maitland");
add("FL", "MDC", "miami,miami beach,hialeah,doral,coral gables,north miami,homestead,aventura,sweetwater");
// the counties whose cities run most of their own permits: named for the plan's wording
add("TX", "HARRIS", "houston,pasadena,baytown,bellaire,katy,humble");
add("TX", "FORTBEND", "sugar land,missouri city,stafford,richmond,rosenberg,fulshear");
add("TX", "COLLIN", "plano,frisco,mckinney,allen");
add("TX", "DALLASC", "dallas,richardson,garland,irving,carrollton,mesquite");
add("NJ", "BERGEN", "fort lee,palisades park,hackensack,englewood,teaneck,ridgefield,leonia,edgewater,cliffside park,paramus");
add("NJ", "MIDDLESEX", "edison,new brunswick,piscataway,woodbridge,east brunswick,metuchen,south plainfield");
add("NJ", "HUDSON", "jersey city,hoboken,union city,north bergen,bayonne,secaucus,west new york");
add("MA", "NORFOLK", "quincy,brookline,braintree,weymouth,milton,dedham,needham,wellesley");
add("MA", "MIDDLESEXMA", "cambridge,somerville,newton,malden,medford,waltham,lexington,arlington,burlington,woburn");
add("MA", "SUFFOLK", "boston,chelsea,revere,winthrop");
add("IL", "COOK", "chicago,evanston,skokie,oak park,schaumburg,naperville");
add("PA", "PHILA", "philadelphia");
add("CO", "DENVERC", "denver");
add("UT", "SLCO", "salt lake city,west valley city,sandy,west jordan,south jordan,murray,midvale,draper,taylorsville,millcreek,holladay,cottonwood heights,riverton,herriman");

/* ZIP codes whose mailing name is a big city the place isn't in. USPS names a ZIP after its post office, not the city
   or county that licenses the address: "5145 Buford Hwy NE, Atlanta, GA 30341" is in Chamblee, DeKalb County, so the
   City of Atlanta's license and Fulton County's health permits don't apply there. Only ZIPs that lie wholly (or all
   but a sliver) outside the named city are listed; a ZIP split by the city line keeps the city it's mailed as, and the
   form's own instructions name the other county. */
type ZipRow = { postal: string; city?: string; county: string; uninc?: boolean };
const ZIP: Record<string, ZipRow> = {
  // Atlanta's mailing ZIPs outside the City of Atlanta
  "30319": { postal: "atlanta", city: "brookhaven", county: "DEKALB" },
  "30338": { postal: "atlanta", city: "dunwoody", county: "DEKALB" },
  "30340": { postal: "atlanta", city: "doraville", county: "DEKALB" },
  "30341": { postal: "atlanta", city: "chamblee", county: "DEKALB" },
  "30345": { postal: "atlanta", county: "DEKALB", uninc: true },
  "30360": { postal: "atlanta", city: "doraville", county: "DEKALB" },
  "30328": { postal: "atlanta", city: "sandy springs", county: "FULC" },
  "30350": { postal: "atlanta", city: "sandy springs", county: "FULC" },
  "30339": { postal: "atlanta", county: "COBB", uninc: true },
  // Portland's mailing ZIPs in Washington and Clackamas counties
  "97229": { postal: "portland", county: "WASHOR", uninc: true },
  "97223": { postal: "portland", city: "tigard", county: "WASHOR" },
  "97222": { postal: "portland", city: "milwaukie", county: "CLACK" },
  "97267": { postal: "portland", county: "CLACK", uninc: true },
  "97086": { postal: "portland", city: "happy valley", county: "CLACK" },
};
const ZIP_STATE: Record<string, string> = { "30": "GA", "31": "GA", "97": "OR" };

/** Chinese names for the places in the table (and the states they're in), so "加州罗兰岗" reads as Rowland Heights, CA. */
const ZH_CITY: Record<string, string> = {
  罗兰岗: "Rowland Heights, CA", 哈仙达岗: "Hacienda Heights, CA", 钻石吧: "Diamond Bar, CA", 核桃市: "Walnut, CA", 圣盖博: "San Gabriel, CA", 阿凯迪亚: "Arcadia, CA", 阿卡迪亚: "Arcadia, CA",
  阿罕布拉: "Alhambra, CA", 蒙特利公园: "Monterey Park, CA", 蒙市: "Monterey Park, CA", 柔斯密: "Rosemead, CA", 天普市: "Temple City, CA", 托伦斯: "Torrance, CA", 托伦斯市: "Torrance, CA",
  洛杉矶: "Los Angeles, CA", 尔湾: "Irvine, CA", 圣何塞: "San Jose, CA", 圣荷西: "San Jose, CA", 库比蒂诺: "Cupertino, CA", 苹果城: "Cupertino, CA", 米尔皮塔斯: "Milpitas, CA", 苗必达: "Milpitas, CA",
  弗里蒙特: "Fremont, CA", 费利蒙: "Fremont, CA", 菲利蒙: "Fremont, CA", 奥克兰: "Oakland, CA", 戴利城: "Daly City, CA", 旧金山: "San Francisco, CA", 三藩市: "San Francisco, CA",
  森尼韦尔: "Sunnyvale, CA", 圣克拉拉: "Santa Clara, CA", 帕罗奥图: "Palo Alto, CA", 奇诺岗: "Chino Hills, CA", 东谷: "Eastvale, CA",
  李堡: "Fort Lee, NJ", 爱迪生: "Edison, NJ", 泽西市: "Jersey City, NJ", 普莱诺: "Plano, TX", 糖城: "Sugar Land, TX", 休斯顿: "Houston, TX", 达拉斯: "Dallas, TX",
  德卢斯: "Duluth, GA", 亨德森: "Henderson, NV", 拉斯维加斯: "Las Vegas, NV", 贝尔维尤: "Bellevue, WA", 西雅图: "Seattle, WA", 昆西: "Quincy, MA", 波士顿: "Boston, MA",
  罗克维尔: "Rockville, MD", 洛克维尔: "Rockville, MD", 费尔法克斯: "Fairfax, VA", 安嫩代尔: "Annandale, VA",
};
const ZH_STATE: Record<string, string> = { 加州: "CA", 加利福尼亚: "CA", 德州: "TX", 德克萨斯: "TX", 纽约州: "NY", 新泽西: "NJ", 华盛顿州: "WA", 内华达: "NV", 马萨诸塞: "MA", 麻省: "MA", 佐治亚: "GA", 乔治亚: "GA", 伊利诺伊: "IL", 宾夕法尼亚: "PA", 宾州: "PA", 佛罗里达: "FL", 佛州: "FL", 马里兰: "MD", 弗吉尼亚: "VA", 夏威夷: "HI", 犹他: "UT", 亚利桑那: "AZ" };
const STATE_RX = /,\s*([A-Za-z]{2})\.?(\s+\d{5}(-\d{4})?)?\s*$/;
const STREET = /^\s*(\d[\dA-Za-z-]*\s|one |po box|p\.o\.)|\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|pkwy|parkway|hwy|highway|ln|lane|way|ct|court|pl|place|tpke|turnpike|pike|sq|square|center|centre|plaza|suite|ste|unit|#)\b\.?\s*\d*\s*$/i;

/** The address without its street line: "2140 Dallas Pkwy, Plano, TX 75093" → "Plano, TX 75093". A one-part place stays. */
export function usLocality(where: string): string {
  const parts = where.split(",").map(s => s.trim()).filter(Boolean);
  while (parts.length > 2 && STREET.test(parts[0])) parts.shift();
  return parts.join(", ");
}

/** The county row for a city the caller already knows ("San Jose", "CA"). */
export function countyFor(city: string, state: string): { county?: County; unincorporated: boolean; ownHealth?: { en: string; zh: string } } {
  const row = CITY[`${city.toLowerCase().replace(/\s+/g, " ").trim()}|${state.toUpperCase()}`];
  return { county: row ? COUNTIES[row.county] : undefined, unincorporated: !!row?.uninc, ownHealth: row?.ownHealth };
}

export type UsPlace = { city?: string; state?: string; county?: County; unincorporated: boolean; ownHealth?: { en: string; zh: string }; locality: string;
  /** The city the address is mailed as when its ZIP lies outside it ("atlanta" for 30341): that city's own steps don't apply. */
  postal?: string; zip?: string };

/** The city, state and county of a US place: "100 W Main St, Alhambra, CA 91801", "Alhambra, CA", "加州阿罕布拉". */
export function usPlace(where: string): UsPlace {
  let t = where.trim();
  for (const [zh, en] of Object.entries(ZH_CITY)) if (t.includes(zh)) { t = en; break; }
  const locality = usLocality(t);
  const parts = locality.split(",").map(s => s.trim()).filter(Boolean);
  let state: string | undefined, city: string | undefined;
  const m = STATE_RX.exec(locality);
  if (m) { state = m[1].toUpperCase(); city = parts.length >= 2 ? parts[parts.length - 2] : undefined; }
  else {
    for (const [zh, code] of Object.entries(ZH_STATE)) if (t.includes(zh)) state = code;
    const named = /,\s*(california|texas|new jersey|washington|nevada|massachusetts|georgia|maryland|virginia|new york|illinois|pennsylvania|florida|hawaii|utah|arizona)\s*(\d{5})?\s*$/i.exec(locality);
    if (named) { state = { california: "CA", texas: "TX", "new jersey": "NJ", washington: "WA", nevada: "NV", massachusetts: "MA", georgia: "GA", maryland: "MD", virginia: "VA", "new york": "NY", illinois: "IL", pennsylvania: "PA", florida: "FL", hawaii: "HI", utah: "UT", arizona: "AZ" }[named[1].toLowerCase()]; city = parts.length >= 2 ? parts[parts.length - 2] : undefined; }
  }
  const zip = /\b(\d{5})(-\d{4})?\s*$/.exec(locality)?.[1];
  if (city) city = city.replace(/\d{5}(-\d{4})?/g, "").trim();
  if (city && /^\d/.test(city)) city = undefined;
  // the ZIP decides where an address mailed as a big city really is (ZIP above)
  const z = zip ? ZIP[zip] : undefined;
  if (z && (!state || state === ZIP_STATE[zip!.slice(0, 2)]) && (!city || city.toLowerCase() === z.postal)) {
    const cityName = z.city ? z.city.replace(/\b\w/g, ch => ch.toUpperCase()) : undefined;
    return { city: cityName, state: state ?? ZIP_STATE[zip!.slice(0, 2)], county: COUNTIES[z.county], unincorporated: !!z.uninc, locality, postal: z.postal, zip };
  }
  const row = city && state ? CITY[`${city.toLowerCase().replace(/\s+/g, " ")}|${state}`] : undefined;
  // an address that names the county instead of a town ("..., Santa Clara County, CA") is in the county's unincorporated
  // area: the county's steps apply, and no city's
  if (!row && city && state && /\bcounty$/i.test(city)) {
    const county = Object.values(COUNTIES).find(c => c.state === state && c.en.toLowerCase() === city!.toLowerCase());
    if (county) return { city: undefined, state, county, unincorporated: true, locality };
  }
  return { city, state, county: row ? COUNTIES[row.county] : undefined, unincorporated: !!row?.uninc, ownHealth: row?.ownHealth, locality, ...(zip ? { zip } : {}) };
}
