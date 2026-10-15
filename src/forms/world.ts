import { B, type Bi } from "../bi";
import type { Level } from "../model";
import type { FormField, Method, Needs, OfficialForm, Segment } from "./registry";

/* Beyond the US forms library: the major cities in China, Europe, the Middle East and the US tier 1, with each
   country's core registrations and each city's own portal. Links are the agencies' official sites. These entries are
   "known": the agent re-reads the agency's page before filing, and for any city not listed it researches the city's
   own requirements live and saves what it learns as a skill. */

export type Country = { code: string; en: string; zh: string; currency: string; names: RegExp };
export type City = { code: string; country: string; state?: string; en: string; zh: string; aliases: string[]; guide?: boolean };

export const COUNTRIES: Country[] = [
  { code: "US", en: "United States", zh: "美国", currency: "USD", names: /united states|\busa\b|\bu\.s\.|美国/i },
  { code: "CN", en: "China", zh: "中国", currency: "CNY", names: /\bchina\b|\bprc\b|中国|大陆|内地/i },
  { code: "GB", en: "United Kingdom", zh: "英国", currency: "GBP", names: /united kingdom|\buk\b|britain|england|scotland|wales|英国|英格兰/i },
  { code: "FR", en: "France", zh: "法国", currency: "EUR", names: /\bfrance\b|法国/i },
  { code: "DE", en: "Germany", zh: "德国", currency: "EUR", names: /germany|deutschland|德国/i },
  { code: "ES", en: "Spain", zh: "西班牙", currency: "EUR", names: /\bspain\b|españa|西班牙/i },
  { code: "IT", en: "Italy", zh: "意大利", currency: "EUR", names: /\bitaly\b|italia|意大利/i },
  { code: "NL", en: "Netherlands", zh: "荷兰", currency: "EUR", names: /netherlands|holland|荷兰/i },
  { code: "IE", en: "Ireland", zh: "爱尔兰", currency: "EUR", names: /ireland|爱尔兰/i },
  { code: "BE", en: "Belgium", zh: "比利时", currency: "EUR", names: /belgium|比利时/i },
  { code: "PT", en: "Portugal", zh: "葡萄牙", currency: "EUR", names: /portugal|葡萄牙/i },
  { code: "CH", en: "Switzerland", zh: "瑞士", currency: "CHF", names: /switzerland|schweiz|suisse|瑞士/i },
  { code: "AT", en: "Austria", zh: "奥地利", currency: "EUR", names: /austria|österreich|奥地利/i },
  { code: "SE", en: "Sweden", zh: "瑞典", currency: "SEK", names: /sweden|sverige|瑞典/i },
  { code: "DK", en: "Denmark", zh: "丹麦", currency: "DKK", names: /denmark|danmark|丹麦/i },
  { code: "NO", en: "Norway", zh: "挪威", currency: "NOK", names: /norway|norge|挪威/i },
  { code: "FI", en: "Finland", zh: "芬兰", currency: "EUR", names: /finland|suomi|芬兰/i },
  { code: "PL", en: "Poland", zh: "波兰", currency: "PLN", names: /poland|polska|波兰/i },
  { code: "CZ", en: "Czechia", zh: "捷克", currency: "CZK", names: /czech|捷克/i },
  { code: "HU", en: "Hungary", zh: "匈牙利", currency: "HUF", names: /hungary|匈牙利/i },
  { code: "GR", en: "Greece", zh: "希腊", currency: "EUR", names: /greece|希腊/i },
  { code: "AE", en: "United Arab Emirates", zh: "阿联酋", currency: "AED", names: /united arab emirates|\buae\b|emirates|阿联酋/i },
  { code: "SA", en: "Saudi Arabia", zh: "沙特阿拉伯", currency: "SAR", names: /saudi|ksa|沙特/i },
  { code: "QA", en: "Qatar", zh: "卡塔尔", currency: "QAR", names: /qatar|卡塔尔/i },
  { code: "KW", en: "Kuwait", zh: "科威特", currency: "KWD", names: /kuwait|科威特/i },
  { code: "BH", en: "Bahrain", zh: "巴林", currency: "BHD", names: /bahrain|巴林/i },
  { code: "OM", en: "Oman", zh: "阿曼", currency: "OMR", names: /\boman\b|阿曼/i },
  { code: "TR", en: "Türkiye", zh: "土耳其", currency: "TRY", names: /turkey|türkiye|turkiye|土耳其/i },
  { code: "EG", en: "Egypt", zh: "埃及", currency: "EGP", names: /egypt|埃及/i },
  { code: "JO", en: "Jordan", zh: "约旦", currency: "JOD", names: /jordan|约旦/i },
  { code: "IL", en: "Israel", zh: "以色列", currency: "ILS", names: /israel|以色列/i },
];

const c = (code: string, country: string, en: string, zh: string, aliases: string[], guide = true, state?: string): City => ({ code, country, en, zh, aliases, guide, ...(state ? { state } : {}) });

export const CITIES: City[] = [
  /* China: the guide cities, then the cities where the national steps apply and the agent researches the local ones */
  c("CN-BJ", "CN", "Beijing", "北京", ["beijing", "北京", "chaoyang", "朝阳区", "haidian", "海淀", "dongcheng", "东城", "xicheng", "西城", "sanlitun", "三里屯", "wangfujing", "王府井"]),
  c("CN-SH", "CN", "Shanghai", "上海", ["shanghai", "上海", "pudong", "浦东", "jing'an", "jingan", "静安", "huangpu", "黄浦", "xuhui", "徐汇", "minhang", "闵行", "changning", "长宁"]),
  c("CN-SZ", "CN", "Shenzhen", "深圳", ["shenzhen", "深圳", "nanshan", "南山", "futian", "福田", "luohu", "罗湖", "bao'an", "baoan", "宝安", "longgang", "龙岗", "qianhai", "前海"]),
  c("CN-GZ", "CN", "Guangzhou", "广州", ["guangzhou", "广州", "tianhe", "天河", "yuexiu", "越秀", "haizhu", "海珠", "panyu", "番禺", "baiyun", "白云"]),
  c("CN-HZ", "CN", "Hangzhou", "杭州", ["hangzhou", "杭州", "xihu", "西湖区", "binjiang", "滨江", "yuhang", "余杭", "shangcheng", "上城"]),
  c("CN-CD", "CN", "Chengdu", "成都", ["chengdu", "成都", "jinjiang", "锦江", "wuhou", "武侯", "gaoxin", "高新区", "chunxi", "春熙路"]),
  c("CN-CQ", "CN", "Chongqing", "重庆", ["chongqing", "重庆", "yuzhong", "渝中", "jiangbei", "江北", "jiefangbei", "解放碑"]),
  c("CN-WH", "CN", "Wuhan", "武汉", ["wuhan", "武汉", "wuchang", "武昌", "hankou", "汉口", "jianghan", "江汉"]),
  c("CN-NJ", "CN", "Nanjing", "南京", ["nanjing", "南京", "xinjiekou", "新街口", "gulou", "鼓楼区", "jianye", "建邺"]),
  c("CN-SU", "CN", "Suzhou", "苏州", ["suzhou", "苏州", "gusu", "姑苏", "sip", "工业园区", "kunshan", "昆山"]),
  c("CN-TJ", "CN", "Tianjin", "天津", ["tianjin", "天津", "heping", "和平区", "binhai", "滨海"]),
  c("CN-XA", "CN", "Xi'an", "西安", ["xi'an", "xian", "西安", "yanta", "雁塔", "beilin", "碑林"]),
  ...([["Xiamen", "厦门"], ["Qingdao", "青岛"], ["Dalian", "大连"], ["Changsha", "长沙"], ["Zhengzhou", "郑州"], ["Shenyang", "沈阳"], ["Hefei", "合肥"], ["Fuzhou", "福州"],
    ["Kunming", "昆明"], ["Ningbo", "宁波"], ["Dongguan", "东莞"], ["Foshan", "佛山"], ["Jinan", "济南"], ["Harbin", "哈尔滨"], ["Changchun", "长春"], ["Nanning", "南宁"],
    ["Guiyang", "贵阳"], ["Nanchang", "南昌"], ["Shijiazhuang", "石家庄"], ["Taiyuan", "太原"], ["Wuxi", "无锡"], ["Zhuhai", "珠海"], ["Sanya", "三亚"], ["Haikou", "海口"],
    ["Urumqi", "乌鲁木齐"], ["Lanzhou", "兰州"], ["Hohhot", "呼和浩特"], ["Wenzhou", "温州"], ["Yiwu", "义乌"], ["Quanzhou", "泉州"]] as const)
    .map(([en, zh]) => c("CN-" + en.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6), "CN", en, zh, [en.toLowerCase(), zh], false)),

  /* Europe */
  c("GB-LON", "GB", "London", "伦敦", ["london", "伦敦", "westminster", "camden", "soho", "chinatown london", "kensington", "shoreditch", "canary wharf", "southwark", "hackney"]),
  c("GB-MAN", "GB", "Manchester", "曼彻斯特", ["manchester", "曼彻斯特"]),
  c("FR-PAR", "FR", "Paris", "巴黎", ["paris", "巴黎", "le marais", "belleville", "la défense", "la defense"]),
  c("DE-BER", "DE", "Berlin", "柏林", ["berlin", "柏林", "mitte", "kreuzberg", "charlottenburg", "prenzlauer berg"]),
  c("DE-MUC", "DE", "Munich", "慕尼黑", ["munich", "münchen", "muenchen", "慕尼黑"]),
  c("DE-HAM", "DE", "Hamburg", "汉堡", ["hamburg", "汉堡市"]),
  c("DE-FRA", "DE", "Frankfurt", "法兰克福", ["frankfurt", "法兰克福"]),
  c("ES-MAD", "ES", "Madrid", "马德里", ["madrid", "马德里"]),
  c("ES-BCN", "ES", "Barcelona", "巴塞罗那", ["barcelona", "巴塞罗那"]),
  c("IT-MIL", "IT", "Milan", "米兰", ["milan", "milano", "米兰"]),
  c("IT-ROM", "IT", "Rome", "罗马", ["rome", "roma", "罗马"]),
  c("NL-AMS", "NL", "Amsterdam", "阿姆斯特丹", ["amsterdam", "阿姆斯特丹"]),
  c("NL-RTM", "NL", "Rotterdam", "鹿特丹", ["rotterdam", "鹿特丹"]),
  c("IE-DUB", "IE", "Dublin", "都柏林", ["dublin", "都柏林"]),
  c("BE-BRU", "BE", "Brussels", "布鲁塞尔", ["brussels", "bruxelles", "brussel", "布鲁塞尔"]),
  c("PT-LIS", "PT", "Lisbon", "里斯本", ["lisbon", "lisboa", "里斯本"]),
  c("CH-ZRH", "CH", "Zurich", "苏黎世", ["zurich", "zürich", "苏黎世"]),
  c("AT-VIE", "AT", "Vienna", "维也纳", ["vienna", "wien", "维也纳"]),
  c("SE-STO", "SE", "Stockholm", "斯德哥尔摩", ["stockholm", "斯德哥尔摩"]),
  c("DK-CPH", "DK", "Copenhagen", "哥本哈根", ["copenhagen", "københavn", "哥本哈根"]),
  c("PL-WAW", "PL", "Warsaw", "华沙", ["warsaw", "warszawa", "华沙"]),
  c("NO-OSL", "NO", "Oslo", "奥斯陆", ["oslo", "奥斯陆"]),
  c("FI-HEL", "FI", "Helsinki", "赫尔辛基", ["helsinki", "赫尔辛基"]),
  ...([["GB", "Birmingham", "伯明翰"], ["GB", "Edinburgh", "爱丁堡"], ["GB", "Glasgow", "格拉斯哥"], ["GB", "Liverpool", "利物浦"], ["FR", "Lyon", "里昂"], ["FR", "Marseille", "马赛"],
    ["FR", "Nice, France", "尼斯"], ["DE", "Cologne", "科隆"], ["DE", "Stuttgart", "斯图加特"], ["DE", "Düsseldorf", "杜塞尔多夫"], ["ES", "Valencia", "瓦伦西亚"], ["ES", "Seville", "塞维利亚"],
    ["IT", "Naples", "那不勒斯"], ["IT", "Turin", "都灵"], ["IT", "Florence", "佛罗伦萨"], ["IT", "Venice, Italy", "威尼斯"], ["NL", "The Hague", "海牙"], ["NL", "Utrecht", "乌得勒支"],
    ["BE", "Antwerp", "安特卫普"], ["PT", "Porto", "波尔图"], ["CH", "Geneva", "日内瓦"], ["CZ", "Prague", "布拉格"], ["HU", "Budapest", "布达佩斯"], ["GR", "Athens", "雅典"],
    ["PL", "Kraków", "克拉科夫"]] as const)
    .map(([k, en, zh]) => c(k + "-" + en.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6), k, en.replace(/, .*/, ""), zh, [en.toLowerCase(), zh], false)),

  /* Middle East */
  c("AE-DXB", "AE", "Dubai", "迪拜", ["dubai", "迪拜", "deira", "jumeirah", "business bay", "dubai marina", "downtown dubai", "al barsha", "jebel ali", "dragon mart"]),
  c("AE-AUH", "AE", "Abu Dhabi", "阿布扎比", ["abu dhabi", "阿布扎比", "al reem", "khalifa city", "mussafah"]),
  c("AE-SHJ", "AE", "Sharjah", "沙迦", ["sharjah", "沙迦"]),
  c("SA-RUH", "SA", "Riyadh", "利雅得", ["riyadh", "利雅得", "olaya", "al malqa"]),
  c("SA-JED", "SA", "Jeddah", "吉达", ["jeddah", "jidda", "吉达"]),
  c("SA-DMM", "SA", "Dammam", "达曼", ["dammam", "达曼", "khobar", "al khobar", "胡拜尔"]),
  c("QA-DOH", "QA", "Doha", "多哈", ["doha", "多哈", "lusail", "west bay"]),
  c("KW-KWI", "KW", "Kuwait City", "科威特城", ["kuwait city", "科威特城"]),
  c("BH-MAN", "BH", "Manama", "麦纳麦", ["manama", "麦纳麦"]),
  c("OM-MCT", "OM", "Muscat", "马斯喀特", ["muscat", "马斯喀特"]),
  c("TR-IST", "TR", "Istanbul", "伊斯坦布尔", ["istanbul", "伊斯坦布尔", "beyoğlu", "kadıköy", "şişli"]),
  c("TR-ANK", "TR", "Ankara", "安卡拉", ["ankara", "安卡拉"]),
  c("EG-CAI", "EG", "Cairo", "开罗", ["cairo", "开罗", "new cairo", "giza"]),
  c("JO-AMM", "JO", "Amman", "安曼", ["amman", "安曼"]),
  c("IL-TLV", "IL", "Tel Aviv", "特拉维夫", ["tel aviv", "特拉维夫"]),
  ...([["AE", "Ajman", "阿治曼"], ["AE", "Ras Al Khaimah", "哈伊马角"], ["AE", "Al Ain", "艾因"], ["SA", "Medina", "麦地那"], ["SA", "Mecca", "麦加"],
    ["TR", "Izmir", "伊兹密尔"], ["TR", "Antalya", "安塔利亚"], ["EG", "Alexandria", "亚历山大"], ["IL", "Haifa", "海法"], ["IL", "Jerusalem", "耶路撒冷"]] as const)
    .map(([k, en, zh]) => c(k + "-" + en.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6), k, en, zh, [en.toLowerCase(), zh], false)),

  /* US tier 1 beyond New York, Los Angeles and Houston (their forms are in the main library) */
  c("SF", "US", "San Francisco", "旧金山", ["san francisco", "旧金山", "三藩市", "sf", "soma", "mission district"], true, "CA"),
  c("SJ", "US", "San Jose", "圣何塞", ["san jose", "圣何塞", "圣荷西"], true, "CA"),
  c("CHI", "US", "Chicago", "芝加哥", ["chicago", "芝加哥", "chinatown chicago", "the loop", "wicker park"], true, "IL"),
  c("SEA", "US", "Seattle", "西雅图", ["seattle", "西雅图", "capitol hill", "international district"], true, "WA"),
  c("BOS", "US", "Boston", "波士顿", ["boston", "波士顿", "back bay", "cambridge, ma"], true, "MA"),
  c("MIA", "US", "Miami", "迈阿密", ["miami", "迈阿密", "brickell", "wynwood", "miami beach"], true, "FL"),
  c("DAL", "US", "Dallas", "达拉斯", ["dallas", "达拉斯"], true, "TX"),
  c("AUS", "US", "Austin", "奥斯汀", ["austin", "奥斯汀"], true, "TX"),
  c("DC", "US", "Washington, DC", "华盛顿特区", ["washington, dc", "washington dc", "d.c.", "华盛顿特区"], true, "DC"),
  c("ATL", "US", "Atlanta", "亚特兰大", ["atlanta", "亚特兰大", "duluth, ga"], true, "GA"),
  c("PHL", "US", "Philadelphia", "费城", ["philadelphia", "philly", "费城"], true, "PA"),
  c("LV", "US", "Las Vegas", "拉斯维加斯", ["las vegas", "拉斯维加斯", "henderson, nv"], true, "NV"),
  c("SAT", "US", "San Antonio", "圣安东尼奥", ["san antonio", "圣安东尼奥"], true, "TX"),
  c("TPA", "US", "Tampa", "坦帕", ["tampa", "坦帕", "ybor city"], true, "FL"),
  c("SDG", "US", "San Diego", "圣地亚哥", ["san diego", "圣地亚哥", "圣迭戈", "convoy street", "kearny mesa"], true, "CA"),
  c("IRV", "US", "Irvine", "尔湾", ["irvine", "尔湾"], true, "CA"),
  c("ORL", "US", "Orlando", "奥兰多", ["orlando", "奥兰多"], true, "FL"),
  c("FTW", "US", "Fort Worth", "沃斯堡", ["fort worth", "沃斯堡", "沃思堡"], true, "TX"),
  c("PHX", "US", "Phoenix", "凤凰城", ["phoenix", "凤凰城", "菲尼克斯"], true, "AZ"),
  ...([["Denver", "丹佛", "CO"], ["Portland", "波特兰", "OR"], ["Minneapolis", "明尼阿波利斯", "MN"],
    ["Detroit", "底特律", "MI"], ["Charlotte", "夏洛特", "NC"], ["Nashville", "纳什维尔", "TN"], ["Salt Lake City", "盐湖城", "UT"]] as const)
    .map(([en, zh, st]) => c("US-" + en.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6), "US", en, zh, [en.toLowerCase(), zh], false, st)),
];

/** US states beyond NY, CA and TX, by name and postal code. */
export const STATES: { code: string; en: string; zh: string; names: RegExp }[] = [
  { code: "IL", en: "Illinois", zh: "伊利诺伊州", names: /illinois|,\s*il\b|伊利诺伊/i },
  { code: "WA", en: "Washington", zh: "华盛顿州", names: /washington state|,\s*wa\b|华盛顿州/i },
  { code: "MA", en: "Massachusetts", zh: "马萨诸塞州", names: /massachusetts|,\s*ma\b|麻省|马萨诸塞/i },
  { code: "FL", en: "Florida", zh: "佛罗里达州", names: /florida|,\s*fl\b|佛罗里达|佛州/i },
  { code: "DC", en: "District of Columbia", zh: "华盛顿特区", names: /district of columbia|,\s*dc\b|华盛顿特区/i },
  { code: "GA", en: "Georgia", zh: "佐治亚州", names: /georgia(?!n)|,\s*ga\b|佐治亚/i },
  { code: "PA", en: "Pennsylvania", zh: "宾夕法尼亚州", names: /pennsylvania|,\s*pa\b|宾州|宾夕法尼亚/i },
  { code: "NV", en: "Nevada", zh: "内华达州", names: /nevada|,\s*nv\b|内华达/i },
  { code: "AZ", en: "Arizona", zh: "亚利桑那州", names: /arizona|,\s*az\b|亚利桑那/i },
  { code: "NJ", en: "New Jersey", zh: "新泽西州", names: /new jersey|,\s*nj\b|新泽西/i },
];

/* ------------------------------------------------------------------ the steps */

type T = readonly [string, string];
const b = (t: T): Bi => B(t[0], t[1]);
const ALL: Segment[] = ["restaurant", "retail", "seller", "warehouse"];
const STORES: Segment[] = ["restaurant", "retail"];
const F = (id: string, line: string, en: string, zh: string): FormField => ({ id, line, label: B(en, zh) });

function W(o: {
  id: string; where: string; level: Level; segs?: Segment[]; needs?: Needs; method: Method; order: number; form: string;
  title: T; agency: T; how: T; url: string; info?: string; fee?: number | null; cur: string; feeNote?: T; takes?: T; renews?: T;
  fields?: FormField[]; foreign?: T;
}): OfficialForm {
  return {
    id: o.id, form: o.form, title: b(o.title), agency: b(o.agency), level: o.level, where: o.where, segments: o.segs ?? ALL, ...(o.needs ? { needs: o.needs } : {}),
    method: o.method, how: b(o.how), url: o.url, info: o.info ?? o.url, fee: o.fee === undefined ? null : o.fee, currency: o.cur,
    ...(o.feeNote ? { feeNote: b(o.feeNote) } : {}), ...(o.takes ? { takes: b(o.takes) } : {}), ...(o.renews ? { renews: b(o.renews) } : {}),
    fields: o.fields ?? [], ...(o.foreign ? { foreign: b(o.foreign) } : {}), checked: "known", order: o.order,
  };
}

const CN_REG_FIELDS = [
  F("name", "名称", "Company name (with the city and industry)", "企业名称（含行政区划与行业）"),
  F("addr", "住所", "Registered address (lease or property certificate)", "住所（租赁合同或产权证明）"),
  F("scope", "经营范围", "Business scope", "经营范围"),
  F("capital", "注册资本", "Registered capital and how it is paid in", "注册资本及出资方式"),
  F("legal_rep", "法定代表人", "Legal representative", "法定代表人"),
  F("holders", "股东", "Shareholders and their contributions", "股东及出资情况"),
  F("officers", "董监高", "Directors, supervisor and manager", "董事、监事、经理"),
  F("contact", "联络员", "Company liaison and finance contact", "联络员与财务负责人"),
];

export const WORLD_FORMS: OfficialForm[] = [
  /* ------------------------------- China ------------------------------- */
  W({ id: "cn-business-license", where: "CN", level: "federal", method: "online", order: 10, cur: "CNY", fee: 0,
    form: "企业设立登记（营业执照）", title: ["Company registration and business license", "企业设立登记与营业执照"],
    agency: ["Local Administration for Market Regulation (under SAMR)", "当地市场监督管理局（国家市场监督管理总局主管）"],
    how: ["Filed online on the city's one-stop business portal, which also registers tax, social insurance and the company seal in the same application.", "在所在城市的企业开办一网通办平台在线申请，同一次申请同时完成税务、社保登记和公章刻制。"],
    url: "https://www.samr.gov.cn", takes: ["Usually 1 to 3 business days once the documents are complete.", "材料齐全后通常 1 至 3 个工作日。"],
    fields: CN_REG_FIELDS,
    foreign: ["A foreign-invested company registers with the same bureau. The foreign investment information report is sent through the same registration, and the foreign shareholder's documents need notarization and legalization or an apostille.", "外商投资企业同样在市场监管部门登记，外商投资信息报告随登记一并报送；境外股东的主体文件需公证认证或办理海牙认证。"] }),
  W({ id: "cn-tax", where: "CN", level: "federal", method: "online", order: 25, cur: "CNY", fee: 0,
    form: "新办纳税人涉税事项（电子税务局）", title: ["Tax setup and invoicing (new taxpayer)", "新办纳税人涉税事项与发票申领"],
    agency: ["State Taxation Administration", "国家税务总局"],
    how: ["After the license, confirm the tax details, choose the taxpayer type and apply for digital invoices on the province's electronic tax bureau.", "领取执照后，在所在省份电子税务局确认涉税信息、选择纳税人类型并申领数电发票。"],
    url: "https://www.chinatax.gov.cn", takes: ["Usually the same day online.", "网上办理通常当天完成。"] }),
  W({ id: "cn-social", where: "CN", level: "federal", needs: { employees: true }, method: "online", order: 28, cur: "CNY", fee: 0,
    form: "单位社会保险登记与员工参保", title: ["Employer social insurance and housing fund", "单位社保登记与住房公积金开户"],
    agency: ["Human Resources and Social Security Bureau; Housing Provident Fund Center", "人力资源和社会保障局；住房公积金管理中心"],
    how: ["Employer registration comes with the business license. Enroll each employee within 30 days of hiring and open the housing fund account.", "单位社保登记随营业执照一并办理。员工入职 30 日内办理参保，并开设公积金账户。"],
    url: "https://www.mohrss.gov.cn" }),
  W({ id: "cn-customs", where: "CN", level: "federal", segs: ["seller", "warehouse", "retail"], needs: { imports: true }, method: "online", order: 35, cur: "CNY", fee: 0,
    form: "进出口货物收发货人备案", title: ["Customs registration for importers and exporters", "海关进出口货物收发货人备案"],
    agency: ["General Administration of Customs", "海关总署"],
    how: ["Filed online through the China International Trade Single Window. The separate foreign trade operator filing was abolished in 2022.", "通过中国国际贸易单一窗口在线办理。对外贸易经营者备案已于 2022 年取消。"],
    url: "https://www.singlewindow.cn", info: "https://www.customs.gov.cn" }),
  W({ id: "cn-food-license", where: "CN", level: "city", segs: ["restaurant", "seller", "warehouse", "retail"], needs: { food: true }, method: "online", order: 60, cur: "CNY", fee: 0,
    form: "食品经营许可证", title: ["Food business license", "食品经营许可证"],
    agency: ["Local Administration for Market Regulation", "当地市场监督管理局"],
    how: ["Applied for online after the business license, with the floor plan, equipment list and food safety manager. Selling only prepackaged food needs a filing instead of a license.", "取得营业执照后在线申请，需提交平面布局图、设备设施清单和食品安全管理人员信息。仅销售预包装食品的办理备案即可。"],
    url: "https://www.samr.gov.cn", renews: ["Valid for 5 years.", "有效期 5 年。"],
    fields: [F("premises", "经营场所", "Business premises and floor plan", "经营场所及布局图"), F("items", "经营项目", "What is sold or made", "经营项目"), F("equipment", "设备", "Equipment and facilities", "设备设施"), F("safety_mgr", "管理人员", "Food safety manager", "食品安全管理人员")] }),
  W({ id: "cn-fire", where: "CN", level: "city", segs: STORES, method: "online", order: 70, cur: "CNY", fee: 0,
    form: "公众聚集场所投入使用、营业前消防安全检查", title: ["Fire safety check before opening", "公众聚集场所营业前消防安全检查"],
    agency: ["Fire and Rescue Department", "消防救援机构"],
    how: ["Shops and restaurants open to the public apply before opening, usually by signing a commitment online; the fire department may inspect afterwards.", "向公众开放的门店和餐厅在营业前申请，通常可在线以告知承诺方式办理，消防部门事后抽查。"],
    url: "https://www.119.gov.cn" }),
  ...([
    ["CN-BJ", "Beijing", "北京", "https://ect.scjgj.beijing.gov.cn", "Beijing e-Window (e窗通)", "北京市企业服务 e 窗通"],
    ["CN-SH", "Shanghai", "上海", "https://yct.sh.gov.cn", "Shanghai One-Window business portal (一窗通)", "上海市企业登记在线（一窗通）"],
    ["CN-SZ", "Shenzhen", "深圳", "https://amr.sz.gov.cn", "Shenzhen Administration for Market Regulation", "深圳市市场监督管理局"],
    ["CN-GZ", "Guangzhou", "广州", "https://www.gdzwfw.gov.cn", "Guangdong Government Services (广东政务服务网)", "广东政务服务网"],
    ["CN-HZ", "Hangzhou", "杭州", "https://www.zjzwfw.gov.cn", "Zhejiang Government Services (浙里办)", "浙江政务服务网（浙里办）"],
    ["CN-CD", "Chengdu", "成都", "https://www.sczwfw.gov.cn", "Sichuan Government Services (天府通办)", "四川政务服务网（天府通办）"],
    ["CN-CQ", "Chongqing", "重庆", "https://zwykb.cq.gov.cn", "Chongqing Government Services (渝快办)", "重庆市政务服务（渝快办）"],
    ["CN-WH", "Wuhan", "武汉", "https://zwfw.hubei.gov.cn", "Hubei Government Services", "湖北政务服务网"],
    ["CN-NJ", "Nanjing", "南京", "https://www.jszwfw.gov.cn", "Jiangsu Government Services", "江苏政务服务网"],
    ["CN-SU", "Suzhou", "苏州", "https://www.jszwfw.gov.cn", "Jiangsu Government Services", "江苏政务服务网"],
    ["CN-TJ", "Tianjin", "天津", "https://zwfw.tj.gov.cn", "Tianjin Government Services", "天津网上办事大厅"],
    ["CN-XA", "Xi'an", "西安", "https://zwfw.shaanxi.gov.cn", "Shaanxi Government Services", "陕西政务服务网"],
  ] as const).map(([where, en, zh, url, aen, azh]) => W({ id: "cn-open-" + where.slice(3).toLowerCase(), where, level: "city", method: "portal", order: 12, cur: "CNY", fee: 0,
    form: `${zh}企业开办一网通办`, title: [`Open the business on ${en}'s one-stop portal`, `在${zh}企业开办平台一网通办`], agency: [aen, azh],
    how: [`${en}'s portal takes the company registration, seal, tax, social insurance and invoices in one online application, and is where the food business license is applied for.`, `${zh}的平台一次在线申请即可办理企业登记、刻章、税务、社保和发票，食品经营许可证也在此申请。`], url })),

  /* ------------------------------- United Kingdom ------------------------------- */
  W({ id: "gb-incorporate", where: "GB", level: "federal", needs: { newEntity: true }, method: "online", order: 10, cur: "GBP",
    form: "Register a private limited company (IN01)", title: ["Company incorporation", "公司注册"], agency: ["Companies House", "英国公司注册处（Companies House）"],
    how: ["Filed online with Companies House. Every director and person with significant control must verify their identity first.", "在 Companies House 在线注册。所有董事和重要控制人须先完成身份验证。"],
    url: "https://www.gov.uk/limited-company-formation/register-your-company", info: "https://www.gov.uk/government/organisations/companies-house",
    feeNote: ["Set by Companies House; the filing team confirms the current fee.", "以 Companies House 公布为准，团队会确认当前费用。"], takes: ["Online applications are usually done within 24 hours.", "在线申请通常 24 小时内完成。"],
    fields: [F("name", "Name", "Company name", "公司名称"), F("office", "Registered office", "Registered office address in the UK", "英国注册办公地址"), F("sic", "SIC", "SIC code for the business activity", "业务 SIC 代码"),
      F("directors", "Officers", "Directors", "董事"), F("psc", "PSC", "People with significant control", "重要控制人"), F("shares", "Capital", "Share capital and shareholders", "股本与股东")],
    foreign: ["A company formed abroad can instead register a UK establishment (overseas company registration).", "境外公司也可改为注册英国分支机构（海外公司登记）。"] }),
  W({ id: "gb-vat", where: "GB", level: "federal", method: "online", order: 25, cur: "GBP", fee: 0,
    form: "VAT registration", title: ["VAT registration", "增值税（VAT）登记"], agency: ["HM Revenue & Customs", "英国税务海关总署（HMRC）"],
    how: ["Required once taxable turnover passes £90,000 in 12 months. A business not established in the UK registers from its first UK sale.", "12 个月应税营业额超过 9 万英镑时必须登记。未在英国设立的企业自首笔英国销售起即须登记。"],
    url: "https://www.gov.uk/register-for-vat" }),
  W({ id: "gb-paye", where: "GB", level: "federal", needs: { employees: true }, method: "online", order: 28, cur: "GBP", fee: 0,
    form: "Register as an employer (PAYE)", title: ["Employer registration (PAYE)", "雇主登记（PAYE）"], agency: ["HM Revenue & Customs", "英国税务海关总署（HMRC）"],
    how: ["Register before the first payday; it can take up to 5 working days to get the employer reference.", "须在首次发薪前登记，获得雇主编号最多需要 5 个工作日。"], url: "https://www.gov.uk/register-employer" }),
  W({ id: "gb-eori", where: "GB", level: "federal", segs: ["seller", "warehouse", "retail"], needs: { imports: true }, method: "online", order: 35, cur: "GBP", fee: 0,
    form: "EORI number", title: ["EORI number for importing", "进口用 EORI 号码"], agency: ["HM Revenue & Customs", "英国税务海关总署（HMRC）"],
    how: ["Needed before moving goods into the UK.", "向英国运入货物前必须取得。"], url: "https://www.gov.uk/eori" }),
  W({ id: "gb-food", where: "GB", level: "city", segs: ["restaurant", "retail", "warehouse", "seller"], needs: { food: true }, method: "online", order: 60, cur: "GBP", fee: 0,
    form: "Register a food business", title: ["Food business registration", "食品企业登记"], agency: ["Local council environmental health", "所在地市政厅环境卫生部门"],
    how: ["Register with the local council at least 28 days before opening. It's free, and the council inspects and gives a food hygiene rating.", "开业前至少 28 天向当地市政厅登记，免费，市政厅会检查并给出食品卫生评级。"],
    url: "https://www.gov.uk/food-business-registration" }),
  W({ id: "gb-premises", where: "GB", level: "city", segs: ["restaurant"], method: "online", order: 70, cur: "GBP",
    form: "Premises licence", title: ["Premises licence (alcohol or late-night hot food)", "场所许可证（售酒或深夜热食）"], agency: ["Local council licensing", "所在地市政厅许可部门"],
    how: ["Needed only to sell alcohol, or hot food and drink between 11pm and 5am.", "仅在售酒，或在晚 11 点至早 5 点供应热食热饮时需要。"], url: "https://www.gov.uk/premises-licence",
    feeNote: ["Set by the premises' rateable value.", "按场所应税估值确定。"] }),

  /* ------------------------------- France ------------------------------- */
  W({ id: "fr-guichet", where: "FR", level: "federal", method: "online", order: 10, cur: "EUR",
    form: "Guichet unique des formalités d'entreprises", title: ["Company creation (one-stop formalities portal)", "企业设立（统一手续窗口）"], agency: ["INPI, Guichet unique", "法国工业产权局统一窗口（INPI）"],
    how: ["All company creations are filed online here; the registration gives the SIREN and SIRET numbers and the intra-EU VAT number follows from the tax office.", "所有企业设立均在此在线办理，登记后取得 SIREN、SIRET 编号，欧盟增值税号随后由税务机关分配。"],
    url: "https://formalites.entreprises.gouv.fr", feeNote: ["Registry and legal notice fees depend on the company form.", "登记费和法定公告费视公司形式而定。"] }),
  W({ id: "fr-tax", where: "FR", level: "federal", method: "online", order: 25, cur: "EUR", fee: 0,
    form: "Espace professionnel impots.gouv.fr", title: ["Business tax account and VAT", "企业税务账户与增值税"], agency: ["Direction générale des Finances publiques", "法国公共财政总局（DGFiP）"],
    how: ["Open the professional space to file and pay VAT and business taxes online.", "开通企业专属空间，在线申报缴纳增值税和企业税。"], url: "https://www.impots.gouv.fr/professionnel" }),
  W({ id: "fr-food", where: "FR", level: "city", segs: ["restaurant", "warehouse", "seller"], needs: { food: true }, method: "online", order: 60, cur: "EUR", fee: 0,
    form: "Cerfa 13984", title: ["Food establishment declaration", "食品经营场所申报"], agency: ["Direction départementale de la protection des populations (DDPP)", "省级民众保护局（DDPP）"],
    how: ["Declared online before opening, for any business that prepares, handles or stores food of animal origin.", "加工、处理或储存动物源性食品的企业须在开业前在线申报。"], url: "https://mesdemarches.agriculture.gouv.fr" }),
  W({ id: "fr-eori", where: "FR", level: "federal", segs: ["seller", "warehouse", "retail"], needs: { imports: true }, method: "online", order: 35, cur: "EUR", fee: 0,
    form: "Numéro EORI", title: ["EORI number for importing", "进口用 EORI 号码"], agency: ["Direction générale des douanes", "法国海关总署"],
    how: ["Requested online from French customs before the first import.", "首次进口前向法国海关在线申请。"], url: "https://www.douane.gouv.fr" }),

  /* ------------------------------- Germany ------------------------------- */
  W({ id: "de-handelsregister", where: "DE", level: "federal", needs: { newEntity: true }, method: "in_person", order: 10, cur: "EUR",
    form: "Handelsregisteranmeldung", title: ["Commercial register entry (GmbH)", "商业登记（GmbH 有限责任公司）"], agency: ["Local court (Registergericht), through a notary", "地方法院登记庭（经公证人提交）"],
    how: ["The articles are notarized and the notary files the registration electronically.", "公司章程须经公证，由公证人以电子方式提交登记。"], url: "https://www.handelsregister.de",
    feeNote: ["Notary and court fees depend on the share capital.", "公证费和法院费用视注册资本而定。"] }),
  W({ id: "de-transparenz", where: "DE", level: "federal", needs: { newEntity: true }, method: "online", order: 15, cur: "EUR",
    form: "Transparenzregister", title: ["Transparency register (beneficial owners)", "透明登记（受益所有人）"], agency: ["Bundesanzeiger Verlag, Transparency Register", "联邦公报出版社透明登记处"],
    how: ["Companies record their beneficial owners online.", "公司在线登记受益所有人。"], url: "https://www.transparenzregister.de" }),
  W({ id: "de-elster", where: "DE", level: "federal", method: "online", order: 25, cur: "EUR", fee: 0,
    form: "Fragebogen zur steuerlichen Erfassung", title: ["Tax registration questionnaire", "税务登记问卷"], agency: ["Finanzamt (through ELSTER)", "税务局（通过 ELSTER）"],
    how: ["Filed online through ELSTER within a month of starting; the tax office then issues the tax number and VAT ID.", "开始经营后一个月内通过 ELSTER 在线提交，税务局随后发放税号和增值税号。"], url: "https://www.elster.de" }),
  W({ id: "de-eori", where: "DE", level: "federal", segs: ["seller", "warehouse", "retail"], needs: { imports: true }, method: "online", order: 35, cur: "EUR", fee: 0,
    form: "EORI-Nummer", title: ["EORI number for importing", "进口用 EORI 号码"], agency: ["German customs (Zoll)", "德国海关"], how: ["Requested from German customs before the first import.", "首次进口前向德国海关申请。"], url: "https://www.zoll.de" }),
  ...([["DE-BER", "Berlin", "柏林", "https://service.berlin.de/dienstleistung/121921/", "Bezirksamt Berlin, Ordnungsamt", "柏林区政府秩序局"],
    ["DE-MUC", "Munich", "慕尼黑", "https://stadt.muenchen.de", "Landeshauptstadt München, Kreisverwaltungsreferat", "慕尼黑市行政管理局"],
    ["DE-HAM", "Hamburg", "汉堡", "https://www.hamburg.de", "Freie und Hansestadt Hamburg, Bezirksamt", "汉堡市区政府"],
    ["DE-FRA", "Frankfurt", "法兰克福", "https://frankfurt.de", "Stadt Frankfurt am Main, Ordnungsamt", "法兰克福市秩序局"]] as const)
    .map(([where, en, zh, url, aen, azh]) => W({ id: "de-gewerbe-" + where.slice(3).toLowerCase(), where, level: "city", method: "online", order: 20, cur: "EUR",
      form: "Gewerbeanmeldung", title: ["Trade registration", "营业登记（Gewerbeanmeldung）"], agency: [aen, azh],
      how: [`Every shop, restaurant and trading business registers its trade with ${en} before starting. The city passes it on to the tax office and the food inspectors.`, `所有门店、餐厅和贸易企业开业前须在${zh}办理营业登记，市政府会转告税务局和食品监管部门。`], url,
      feeNote: ["A small fee set by the city.", "由市政府收取少量费用。"] })),

  /* ------------------------------- Spain, Italy, Netherlands ------------------------------- */
  W({ id: "es-circe", where: "ES", level: "federal", needs: { newEntity: true }, method: "online", order: 10, cur: "EUR",
    form: "Documento Único Electrónico (CIRCE)", title: ["Company creation (CIRCE)", "公司设立（CIRCE）"], agency: ["Ministerio de Economía, CIRCE / PAE", "西班牙经济部 CIRCE 企业服务点"],
    how: ["A limited company (SL) can be created online through CIRCE with the single electronic document.", "有限责任公司（SL）可通过 CIRCE 以统一电子文件在线设立。"], url: "https://paeelectronico.es",
    foreign: ["Foreign owners and directors need a Spanish tax ID (NIE or NIF) first.", "外国股东和董事须先取得西班牙税号（NIE 或 NIF）。"] }),
  W({ id: "es-036", where: "ES", level: "federal", method: "online", order: 25, cur: "EUR", fee: 0,
    form: "Modelo 036", title: ["Tax census declaration", "税务登记申报（036 表）"], agency: ["Agencia Tributaria", "西班牙税务局"],
    how: ["Registers the business for VAT and income tax before it starts trading.", "开始经营前登记增值税和所得税。"], url: "https://sede.agenciatributaria.gob.es" }),
  W({ id: "es-ss", where: "ES", level: "federal", needs: { employees: true }, method: "online", order: 28, cur: "EUR", fee: 0,
    form: "Inscripción de empresa", title: ["Employer registration with Social Security", "社会保障雇主登记"], agency: ["Tesorería General de la Seguridad Social", "西班牙社会保障总署"],
    how: ["Register as an employer and sign up each worker before they start.", "登记为雇主，并在员工上岗前为其参保。"], url: "https://sede.seg-social.gob.es" }),
  W({ id: "es-mad-licencia", where: "ES-MAD", level: "city", segs: STORES, method: "online", order: 55, cur: "EUR",
    form: "Declaración responsable / licencia de actividad", title: ["Opening licence or responsible declaration", "开业许可或责任声明"], agency: ["Ayuntamiento de Madrid", "马德里市政府"],
    how: ["Most shops and restaurants open with a responsible declaration filed online; larger works need a licence.", "多数门店和餐厅在线提交责任声明即可开业，较大装修工程需申请许可。"], url: "https://sede.madrid.es" }),
  W({ id: "es-bcn-licencia", where: "ES-BCN", level: "city", segs: STORES, method: "online", order: 55, cur: "EUR",
    form: "Comunicació d'activitat / llicència", title: ["Activity notice or licence", "经营活动申报或许可"], agency: ["Ajuntament de Barcelona", "巴塞罗那市政府"],
    how: ["Shops and restaurants notify the city of their activity online before opening; some need a licence.", "门店和餐厅开业前须在线向市政府申报经营活动，部分需申请许可。"], url: "https://ajuntament.barcelona.cat" }),
  W({ id: "it-comunica", where: "IT", level: "federal", method: "online", order: 10, cur: "EUR",
    form: "ComUnica", title: ["Business register and VAT number (ComUnica)", "企业登记与增值税号（ComUnica）"], agency: ["Registro delle Imprese, Camera di Commercio", "商会企业登记处"],
    how: ["One online filing registers the company with the Chamber of Commerce, opens the VAT number and notifies social security.", "一次在线申报即可在商会登记、开立增值税号并通知社保机构。"], url: "https://www.registroimprese.it", info: "https://www.impresainungiorno.gov.it" }),
  W({ id: "it-iva", where: "IT", level: "federal", method: "online", order: 25, cur: "EUR", fee: 0,
    form: "Partita IVA", title: ["VAT number", "增值税号（Partita IVA）"], agency: ["Agenzia delle Entrate", "意大利税务局"],
    how: ["Opened through ComUnica or directly with the tax agency before trading.", "经营前通过 ComUnica 或直接向税务局开立。"], url: "https://www.agenziaentrate.gov.it" }),
  ...([["IT-MIL", "Milan", "米兰", "https://www.comune.milano.it", "Comune di Milano, SUAP", "米兰市 SUAP 窗口"], ["IT-ROM", "Rome", "罗马", "https://www.comune.roma.it", "Roma Capitale, SUAP", "罗马市 SUAP 窗口"]] as const)
    .map(([where, en, zh, url, aen, azh]) => W({ id: "it-scia-" + where.slice(3).toLowerCase(), where, level: "city", segs: STORES, method: "online", order: 55, cur: "EUR",
      form: "SCIA", title: ["Notice to start the activity (SCIA)", "开业申报（SCIA）"], agency: [aen, azh],
      how: [`Shops and restaurants in ${en} file the SCIA with the city's business desk (SUAP) before opening; restaurants add the health notice.`, `${zh}的门店和餐厅开业前向市政府企业窗口（SUAP）提交 SCIA，餐厅另附卫生申报。`], url, info: "https://www.impresainungiorno.gov.it" })),
  W({ id: "nl-kvk", where: "NL", level: "federal", method: "in_person", order: 10, cur: "EUR",
    form: "Inschrijving Handelsregister", title: ["Business register (KVK)", "商业登记（KVK）"], agency: ["Kamer van Koophandel (KVK)", "荷兰商会（KVK）"],
    how: ["Register with KVK before starting; a BV is registered by a notary. Sole traders get their VAT number from the tax office automatically.", "开业前在 KVK 登记；BV 公司由公证人办理。个体经营者会自动获得税务局发放的增值税号。"], url: "https://www.kvk.nl" }),
  W({ id: "nl-tax", where: "NL", level: "federal", method: "online", order: 25, cur: "EUR", fee: 0,
    form: "Belastingdienst registratie", title: ["Tax and VAT registration", "税务与增值税登记"], agency: ["Belastingdienst", "荷兰税务局"],
    how: ["Companies and foreign businesses register with the tax office for VAT and payroll tax.", "公司和境外企业须向税务局登记增值税和工资税。"], url: "https://www.belastingdienst.nl" }),
  W({ id: "nl-ams-horeca", where: "NL-AMS", level: "city", segs: ["restaurant"], method: "online", order: 60, cur: "EUR",
    form: "Exploitatievergunning", title: ["Hospitality operating permit", "餐饮经营许可"], agency: ["Gemeente Amsterdam", "阿姆斯特丹市政府"],
    how: ["Restaurants and cafes need the city's operating permit; with alcohol, an alcohol licence too.", "餐厅和咖啡馆须取得市政府经营许可，售酒还需酒类许可证。"], url: "https://www.amsterdam.nl" }),

  /* ------------------------------- the rest of Europe: the core national steps ------------------------------- */
  ...([
    ["ie-cro", "IE", "Company registration (CORE)", "公司注册（CORE）", "Companies Registration Office", "爱尔兰公司注册处", "https://core.cro.ie", "Register the company online, then register for tax with Revenue.", "在线注册公司，之后向税务局登记税务。"],
    ["ie-revenue", "IE", "Tax and VAT registration", "税务与增值税登记", "Revenue", "爱尔兰税务局", "https://www.revenue.ie", "Register for corporation tax, VAT and employer PAYE through Revenue Online.", "通过税务局在线系统登记公司税、增值税和雇主预扣税。"],
    ["ie-food", "IE", "Food business registration", "食品企业登记", "Food Safety Authority of Ireland", "爱尔兰食品安全局", "https://www.fsai.ie", "Food businesses register with the inspecting authority before opening.", "食品企业开业前须向监管机构登记。"],
    ["be-kbo", "BE", "Enterprise number (Crossroads Bank)", "企业编号（企业交叉数据库）", "FPS Economy", "比利时联邦经济部", "https://economie.fgov.be", "Register through an approved enterprise counter, which issues the enterprise number.", "通过认可的企业窗口登记，取得企业编号。"],
    ["pt-empresa", "PT", "Company creation (Empresa na Hora / ePortugal)", "公司设立（ePortugal）", "Instituto dos Registos e do Notariado", "葡萄牙登记与公证局", "https://eportugal.gov.pt", "Create the company online or same day at a one-stop desk.", "可在线或在一站式窗口当天设立公司。"],
    ["ch-easygov", "CH", "Business registration (EasyGov)", "企业登记（EasyGov）", "State Secretariat for Economic Affairs", "瑞士联邦经济事务秘书处", "https://www.easygov.swiss", "Register in the commercial register, VAT and social insurance through EasyGov.", "通过 EasyGov 办理商业登记、增值税和社保。"],
    ["at-usp", "AT", "Business start (USP)", "企业开办（USP）", "Unternehmensserviceportal", "奥地利企业服务门户", "https://www.usp.gv.at", "Register the trade and the company online through the business service portal.", "通过企业服务门户在线办理营业登记和公司注册。"],
    ["se-verksamt", "SE", "Company registration (Verksamt)", "公司注册（Verksamt）", "Bolagsverket and Skatteverket", "瑞典公司注册局与税务局", "https://www.verksamt.se", "Register the company and for tax, VAT and as an employer in one place.", "在同一平台注册公司并登记税务、增值税和雇主身份。"],
    ["dk-virk", "DK", "Company registration (Virk)", "公司注册（Virk）", "Danish Business Authority", "丹麦商业管理局", "https://virk.dk", "Register the company and its CVR number, VAT and employer status online.", "在线注册公司、CVR 编号、增值税和雇主身份。"],
    ["no-brreg", "NO", "Business registration (Altinn)", "企业登记（Altinn）", "Brønnøysund Register Centre", "挪威布朗尼松登记中心", "https://www.brreg.no", "Register the business and VAT through the coordinated register notice.", "通过协调登记表在线登记企业和增值税。"],
    ["fi-ytj", "FI", "Business registration (YTJ)", "企业登记（YTJ）", "Finnish Patent and Registration Office and Tax Administration", "芬兰专利注册局与税务局", "https://www.ytj.fi", "One start-up notification registers the company, VAT and employer status.", "一份开业通知即可登记公司、增值税和雇主身份。"],
    ["pl-biznes", "PL", "Business registration (biznes.gov.pl)", "企业登记（biznes.gov.pl）", "Ministry of Development", "波兰发展部", "https://www.biznes.gov.pl", "Register the company in the court register and for tax and social insurance online.", "在线办理法院登记、税务和社保登记。"],
  ] as const).map(([id, where, ten, tzh, aen, azh, url, hen, hzh]) => W({ id, where, level: id === "ie-food" ? "city" : "federal", method: "online", order: id.endsWith("food") ? 60 : id === "ie-revenue" ? 25 : 10, cur: COUNTRIES.find(x => x.code === where)!.currency,
    ...(id === "ie-food" ? { needs: { food: true } } : {}), form: ten, title: [ten, tzh], agency: [aen, azh], how: [hen, hzh], url })),

  /* ------------------------------- Middle East ------------------------------- */
  W({ id: "ae-dxb-licence", where: "AE-DXB", level: "city", method: "online", order: 10, cur: "AED",
    form: "Mainland trade licence", title: ["Dubai trade licence", "迪拜营业执照"], agency: ["Dubai Department of Economy and Tourism", "迪拜经济与旅游局"],
    how: ["Reserve the trade name, get initial approval, then issue the licence online through Invest in Dubai. Free zones license through their own authority instead.", "通过 Invest in Dubai 在线预留商号、取得初步批准后签发执照。自贸区企业改由各自贸区管理局发照。"],
    url: "https://invest.dubai.ae", info: "https://www.dubaidet.gov.ae", feeNote: ["Depends on the activity and the premises.", "视经营范围和场所而定。"], renews: ["Every year.", "每年续期。"],
    fields: [F("trade_name", "Trade name", "Trade name", "商号"), F("activity", "Activity", "Business activities", "经营范围"), F("legal_form", "Legal form", "Legal form", "法律形式"), F("partners", "Partners", "Owners and shares", "股东及股份"), F("manager", "Manager", "Manager", "经理"), F("premises", "Premises", "Premises (Ejari tenancy contract)", "经营场所（Ejari 租约）")] }),
  W({ id: "ae-auh-licence", where: "AE-AUH", level: "city", method: "online", order: 10, cur: "AED",
    form: "Economic licence (TAMM)", title: ["Abu Dhabi economic licence", "阿布扎比经营执照"], agency: ["Abu Dhabi Department of Economic Development", "阿布扎比经济发展局"],
    how: ["Applied for online on TAMM, the Abu Dhabi government services platform.", "在阿布扎比政府服务平台 TAMM 在线申请。"], url: "https://www.tamm.abudhabi", info: "https://www.added.gov.ae", renews: ["Every year.", "每年续期。"] }),
  W({ id: "ae-shj-licence", where: "AE-SHJ", level: "city", method: "online", order: 10, cur: "AED",
    form: "Trade licence", title: ["Sharjah trade licence", "沙迦营业执照"], agency: ["Sharjah Economic Development Department", "沙迦经济发展局"],
    how: ["Applied for online with the Sharjah economic department.", "向沙迦经济发展局在线申请。"], url: "https://www.sedd.ae", renews: ["Every year.", "每年续期。"] }),
  W({ id: "ae-tax", where: "AE", level: "federal", method: "online", order: 25, cur: "AED", fee: 0,
    form: "Corporate tax and VAT registration (EmaraTax)", title: ["Corporate tax and VAT registration", "企业所得税与增值税登记"], agency: ["Federal Tax Authority", "阿联酋联邦税务局"],
    how: ["Every company registers for corporate tax on EmaraTax. VAT registration is required once taxable supplies pass AED 375,000 a year.", "所有公司须在 EmaraTax 登记企业所得税。年应税供应额超过 37.5 万迪拉姆时必须登记增值税。"],
    url: "https://eservices.tax.gov.ae", info: "https://tax.gov.ae" }),
  W({ id: "ae-dxb-food", where: "AE-DXB", level: "city", segs: ["restaurant", "retail", "warehouse"], needs: { food: true }, method: "online", order: 60, cur: "AED",
    form: "Food establishment approval", title: ["Food establishment approval", "食品场所审批"], agency: ["Dubai Municipality, Food Safety", "迪拜市政局食品安全部"],
    how: ["Food businesses get the municipality's layout approval and inspection before the licence is activated.", "食品企业须先取得市政局布局审批并通过检查，执照才能生效。"], url: "https://www.dm.gov.ae" }),
  W({ id: "ae-dxb-customs", where: "AE-DXB", level: "city", segs: ["seller", "warehouse", "retail"], needs: { imports: true }, method: "online", order: 35, cur: "AED",
    form: "Client registration (customs code)", title: ["Customs client registration", "海关客户登记"], agency: ["Dubai Customs", "迪拜海关"],
    how: ["Importers register with Dubai Customs to get a customs code before clearing goods.", "进口商清关前须在迪拜海关登记取得海关编码。"], url: "https://www.dubaicustoms.gov.ae" }),
  W({ id: "ae-mohre", where: "AE", level: "federal", needs: { employees: true }, method: "online", order: 28, cur: "AED",
    form: "Establishment registration", title: ["Employer registration and work permits", "雇主登记与工作许可"], agency: ["Ministry of Human Resources and Emiratisation", "阿联酋人力资源与本土化部"],
    how: ["Register the establishment, then apply for each employee's work permit.", "先登记企业，再为每位员工申请工作许可。"], url: "https://www.mohre.gov.ae" }),
  W({ id: "sa-misa", where: "SA", level: "federal", needs: { foreignEntity: true }, method: "online", order: 8, cur: "SAR",
    form: "Investment license", title: ["Foreign investment license", "外商投资许可证"], agency: ["Ministry of Investment (MISA)", "沙特投资部（MISA）"],
    how: ["A foreign-owned business gets the investment license before the commercial registration.", "外资企业须在商业登记前取得投资许可证。"], url: "https://misa.gov.sa", renews: ["Renewed with the commercial registration.", "随商业登记一并续期。"] }),
  W({ id: "sa-cr", where: "SA", level: "federal", method: "online", order: 10, cur: "SAR",
    form: "Commercial Registration", title: ["Commercial registration", "商业登记"], agency: ["Ministry of Commerce, Saudi Business Center", "沙特商务部，沙特商业中心"],
    how: ["Registered online through the Saudi Business Center.", "通过沙特商业中心在线办理。"], url: "https://business.sa", info: "https://mc.gov.sa" }),
  W({ id: "sa-balady", where: "SA", level: "city", segs: ["restaurant", "retail", "warehouse"], method: "online", order: 55, cur: "SAR",
    form: "Commercial activity license (Balady)", title: ["Municipal license", "市政营业许可"], agency: ["Ministry of Municipal and Rural Affairs and Housing (Balady)", "沙特市政与住房部（Balady）"],
    how: ["Every shop, restaurant and warehouse gets the municipal license for its premises online.", "所有门店、餐厅和仓库须为经营场所在线申请市政许可。"], url: "https://balady.gov.sa", renews: ["Every year.", "每年续期。"] }),
  W({ id: "sa-zatca", where: "SA", level: "federal", method: "online", order: 25, cur: "SAR", fee: 0,
    form: "Tax, VAT and Zakat registration", title: ["Tax, VAT and zakat registration", "税务、增值税与天课登记"], agency: ["Zakat, Tax and Customs Authority (ZATCA)", "沙特天课税务海关总局（ZATCA）"],
    how: ["Register for zakat or income tax, and for VAT once taxable supplies pass SAR 375,000 a year. E-invoicing applies.", "登记天课或所得税；年应税供应额超过 37.5 万里亚尔须登记增值税，并适用电子发票。"], url: "https://zatca.gov.sa" }),
  W({ id: "sa-gosi", where: "SA", level: "federal", needs: { employees: true }, method: "online", order: 28, cur: "SAR", fee: 0,
    form: "Employer registration", title: ["Social insurance employer registration", "社会保险雇主登记"], agency: ["General Organization for Social Insurance", "沙特社会保险总局"],
    how: ["Register as an employer and enroll each employee.", "登记为雇主并为每位员工参保。"], url: "https://www.gosi.gov.sa" }),
  W({ id: "sa-civil-defense", where: "SA", level: "city", segs: ["restaurant", "retail", "warehouse"], method: "online", order: 65, cur: "SAR",
    form: "Safety license (Salamah)", title: ["Civil Defense safety license", "民防安全许可"], agency: ["General Directorate of Civil Defense", "沙特民防总局"],
    how: ["Premises open to the public and warehouses get the safety license online.", "对公众开放的场所和仓库须在线申请安全许可。"], url: "https://998.gov.sa" }),
  W({ id: "sa-sfda", where: "SA", level: "federal", segs: ["seller", "warehouse"], needs: { food: true }, method: "online", order: 45, cur: "SAR",
    form: "Establishment and product registration", title: ["Food importer registration", "食品进口商登记"], agency: ["Saudi Food and Drug Authority", "沙特食品药品管理局"],
    how: ["Food importers and warehouses register the establishment and products with SFDA.", "食品进口商和仓库须向 SFDA 登记场所和产品。"], url: "https://www.sfda.gov.sa" }),
  ...([
    ["qa-moci", "QA", 10, "Commercial registration", "商业登记", "Ministry of Commerce and Industry", "卡塔尔工商部", "https://www.moci.gov.qa", "Register the company and get the commercial registration.", "注册公司并取得商业登记。"],
    ["qa-tax", "QA", 25, "Tax registration (Dhareeba)", "税务登记（Dhareeba）", "General Tax Authority", "卡塔尔税务总局", "https://dhareeba.gov.qa", "Register for tax on the Dhareeba portal.", "在 Dhareeba 平台登记税务。"],
    ["qa-trade-licence", "QA", 55, "Municipal trade licence", "市政营业执照", "Ministry of Municipality", "卡塔尔市政部", "https://www.mm.gov.qa", "The premises get a municipal trade licence.", "经营场所须取得市政营业执照。"],
    ["kw-moci", "KW", 10, "Commercial license", "商业执照", "Ministry of Commerce and Industry", "科威特工商部", "https://www.moci.gov.kw", "Register the company and get the commercial license.", "注册公司并取得商业执照。"],
    ["kw-kdipa", "KW", 8, "Foreign investment license", "外商投资许可", "Kuwait Direct Investment Promotion Authority", "科威特直接投资促进局", "https://kdipa.gov.kw", "A fully foreign-owned company applies for the investment license first.", "外商独资公司须先申请投资许可。"],
    ["bh-sijilat", "BH", 10, "Commercial registration (Sijilat)", "商业登记（Sijilat）", "Ministry of Industry and Commerce", "巴林工商部", "https://www.sijilat.bh", "Register the company and its activities online.", "在线注册公司及经营范围。"],
    ["om-business", "OM", 10, "Commercial registration (Oman Business Platform)", "商业登记（阿曼商业平台）", "Ministry of Commerce, Industry and Investment Promotion", "阿曼商工投资促进部", "https://www.business.gov.om", "Register the company and get municipal and other approvals online.", "在线注册公司并办理市政等审批。"],
    ["tr-mersis", "TR", 10, "Company registration (MERSIS)", "公司注册（MERSIS）", "Ministry of Trade, Central Registry", "土耳其贸易部中央登记系统", "https://mersis.gtb.gov.tr", "Prepare the articles in MERSIS, then register with the trade registry.", "在 MERSIS 拟定章程后向商业登记处注册。"],
    ["tr-gib", "TR", 25, "Tax registration", "税务登记", "Revenue Administration (GİB)", "土耳其税务局（GİB）", "https://www.gib.gov.tr", "The tax office records the company and issues the tax number.", "税务局登记公司并发放税号。"],
    ["eg-gafi", "EG", 10, "Company establishment", "公司设立", "General Authority for Investment and Free Zones (GAFI)", "埃及投资与自由区总局（GAFI）", "https://www.gafi.gov.eg", "Companies are established through GAFI's investor service centers.", "通过 GAFI 投资者服务中心设立公司。"],
    ["jo-ccd", "JO", 10, "Company registration", "公司注册", "Companies Control Department", "约旦公司管理局", "https://www.ccd.gov.jo", "Register the company with the Companies Control Department.", "向约旦公司管理局注册公司。"],
    ["tr-ist-ruhsat", "TR-IST", 55, "Business opening and operating license", "营业许可证", "Istanbul district municipality", "伊斯坦布尔区市政府", "https://www.turkiye.gov.tr", "Shops and restaurants get the opening license from their district municipality, many through e-Devlet.", "门店和餐厅须向所在区市政府申请营业许可，多数可通过 e-Devlet 办理。"],
  ] as const).map(([id, where, order, ten, tzh, aen, azh, url, hen, hzh]) => W({ id, where, level: where.includes("-") || id.endsWith("licence") ? "city" : "federal", method: "online", order,
    cur: COUNTRIES.find(x => x.code === where.slice(0, 2))!.currency, ...(id === "kw-kdipa" ? { needs: { foreignEntity: true } } : {}),
    ...(id.endsWith("licence") || id.endsWith("ruhsat") ? { segs: STORES } : {}), form: ten, title: [ten, tzh], agency: [aen, azh], how: [hen, hzh], url })),

  /* ------------------------------- US tier 1 states and cities ------------------------------- */
  ...([
    ["il-sos", "IL", "state", 20, 150, "Articles of Organization (Form LLC-5.5)", "LLC formation", "LLC 设立", "Illinois Secretary of State", "伊利诺伊州州务卿", "https://www.ilsos.gov", "Form the LLC online, or register a company formed in another state to do business in Illinois.", "在线设立 LLC，或为外州公司办理在伊利诺伊州经营的登记。", true],
    ["il-tax", "IL", "state", 30, 0, "MyTax Illinois registration (REG-1)", "Sales tax registration", "销售税登记", "Illinois Department of Revenue", "伊利诺伊州税务局", "https://mytax.illinois.gov", "Register for sales and withholding tax before the first sale.", "首次销售前登记销售税和预扣税。", false],
    ["chi-license", "CHI", "city", 58, null, "Business License", "Chicago business license", "芝加哥营业执照", "City of Chicago, Business Affairs and Consumer Protection", "芝加哥市商业事务与消费者保护局", "https://www.chicago.gov/city/en/depts/bacp.html", "Most shops and restaurants need a city business license; food businesses also pass a health inspection.", "多数门店和餐厅须取得市营业执照，食品企业还须通过卫生检查。", false],
    ["wa-bls", "WA", "state", 22, null, "Business License Application", "Washington business license (with city endorsement)", "华盛顿州营业执照（含城市背书）", "Washington Department of Revenue, Business Licensing Service", "华盛顿州税务局营业执照服务处", "https://dor.wa.gov", "One application covers the state license, tax registration and the Seattle city endorsement.", "一份申请即可办理州执照、税务登记和西雅图市背书。", false],
    ["wa-sos", "WA", "state", 20, null, "Certificate of Formation", "LLC formation", "LLC 设立", "Washington Secretary of State, Corporations", "华盛顿州州务卿公司处", "https://ccfs.sos.wa.gov", "Form the company or register a foreign company online.", "在线设立公司或办理外州公司登记。", true],
    ["sea-food", "SEA", "county", 70, null, "Food Business Permit", "Food business permit", "食品经营许可证", "Public Health, Seattle and King County", "西雅图与金县公共卫生局", "https://kingcounty.gov", "Plan review for new or remodeled kitchens, then the annual food business permit.", "新建或改建厨房先做图纸审查，再申请年度食品经营许可证。", false],
    ["ma-sos", "MA", "state", 20, 500, "Certificate of Organization", "LLC formation", "LLC 设立", "Secretary of the Commonwealth, Corporations Division", "马萨诸塞州州务卿公司处", "https://www.sec.state.ma.us", "Form the LLC or register a foreign company online.", "在线设立 LLC 或办理外州公司登记。", true],
    ["ma-tax", "MA", "state", 30, 0, "MassTaxConnect registration", "Sales tax registration", "销售税登记", "Massachusetts Department of Revenue", "马萨诸塞州税务局", "https://mtc.dor.state.ma.us", "Register for sales tax and withholding before trading.", "开业前登记销售税和预扣税。", false],
    ["bos-cert", "BOS", "city", 56, null, "Business Certificate", "Boston business certificate", "波士顿营业证明", "City of Boston, City Clerk", "波士顿市书记官办公室", "https://www.boston.gov", "Anyone doing business in Boston files a business certificate; food businesses also get a permit from Inspectional Services.", "在波士顿经营须登记营业证明，食品企业还须向检查服务局申请许可。", false],
    ["fl-sunbiz", "FL", "state", 20, 125, "Articles of Organization", "LLC formation", "LLC 设立", "Florida Division of Corporations (Sunbiz)", "佛罗里达州公司处（Sunbiz）", "https://dos.fl.gov/sunbiz/", "Form the LLC or register a foreign company online.", "在线设立 LLC 或办理外州公司登记。", true],
    ["fl-dor", "FL", "state", 30, 0, "Form DR-1", "Sales tax registration", "销售税登记", "Florida Department of Revenue", "佛罗里达州税务局", "https://floridarevenue.com", "Register for sales and use tax before the first sale.", "首次销售前登记销售与使用税。", false],
    ["fl-dbpr", "FL", "state", 70, null, "Food Service License", "Restaurant license", "餐饮许可证", "Florida DBPR, Division of Hotels and Restaurants", "佛罗里达州商业与职业管理部酒店餐饮处", "https://www2.myfloridalicense.com", "Restaurants get the state food service license after plan review and inspection.", "餐厅经图纸审查和检查后取得州餐饮许可证。", false],
    ["mia-btr", "MIA", "city", 58, null, "Business Tax Receipt", "Miami business tax receipt", "迈阿密营业税收据", "City of Miami and Miami-Dade County Tax Collector", "迈阿密市与迈阿密戴德县税务征收处", "https://www.miami.gov", "Get the certificate of use, then the city and county business tax receipts.", "先取得使用证，再办理市和县的营业税收据。", false],
    ["dc-dlcp", "DC", "city", 20, null, "Basic Business License", "Corporate registration and basic business license", "公司登记与基本营业执照", "DC Department of Licensing and Consumer Protection", "华盛顿特区许可与消费者保护局", "https://dlcp.dc.gov", "Register the company, then get the basic business license for the activity.", "先登记公司，再按经营范围申请基本营业执照。", false],
    ["dc-otr", "DC", "city", 30, 0, "Form FR-500", "Tax registration", "税务登记", "DC Office of Tax and Revenue", "华盛顿特区税务局", "https://mytax.dc.gov", "Register for sales and withholding tax on MyTax.DC.gov.", "在 MyTax.DC.gov 登记销售税和预扣税。", false],
    ["dc-food", "DC", "city", 70, null, "Food Establishment License", "Food establishment license", "食品场所执照", "DC Health", "华盛顿特区卫生局", "https://dchealth.dc.gov", "Food businesses pass plan review and a pre-opening inspection.", "食品企业须通过图纸审查和开业前检查。", false],
    ["ga-sos", "GA", "state", 20, null, "Articles of Organization (eCorp)", "LLC formation", "LLC 设立", "Georgia Secretary of State, Corporations", "佐治亚州州务卿公司处", "https://ecorp.sos.ga.gov", "Form the LLC or register a foreign company online.", "在线设立 LLC 或办理外州公司登记。", true],
    ["ga-tax", "GA", "state", 30, 0, "Georgia Tax Center registration", "Sales tax registration", "销售税登记", "Georgia Department of Revenue", "佐治亚州税务局", "https://gtc.dor.ga.gov", "Register for sales and withholding tax online.", "在线登记销售税和预扣税。", false],
    ["atl-license", "ATL", "city", 58, null, "Business License", "Atlanta business license", "亚特兰大营业执照", "City of Atlanta, Office of Revenue", "亚特兰大市税收办公室", "https://www.atlantaga.gov", "Businesses in city limits get the city business license after zoning approval.", "市内企业经分区审批后申请市营业执照。", false],
    ["pa-dos", "PA", "state", 20, 125, "Certificate of Organization", "LLC formation", "LLC 设立", "Pennsylvania Department of State", "宾夕法尼亚州州务厅", "https://file.dos.pa.gov", "Form the LLC or register a foreign company online.", "在线设立 LLC 或办理外州公司登记。", true],
    ["pa-tax", "PA", "state", 30, 0, "myPATH registration", "Sales tax license", "销售税许可证", "Pennsylvania Department of Revenue", "宾夕法尼亚州税务局", "https://mypath.pa.gov", "Register for the sales tax license and employer withholding.", "登记销售税许可证和雇主预扣税。", false],
    ["phl-cal", "PHL", "city", 58, 0, "Commercial Activity License", "Commercial activity license", "商业活动许可证", "City of Philadelphia, Department of Licenses and Inspections", "费城许可与检查局", "https://eclipse.phila.gov", "Every business in Philadelphia gets the free commercial activity license online; food businesses also get a health license.", "费城所有企业须在线申请免费的商业活动许可证，食品企业另需卫生许可。", false],
    ["nv-silverflume", "NV", "state", 20, null, "Articles of Organization and State Business License", "LLC formation and state business license", "LLC 设立与州营业执照", "Nevada Secretary of State (SilverFlume)", "内华达州州务卿（SilverFlume）", "https://www.nvsilverflume.gov", "Form the company and get the state business license together online.", "在线同时设立公司并取得州营业执照。", true],
    ["lv-license", "LV", "city", 58, null, "Business License", "Las Vegas business license", "拉斯维加斯营业执照", "City of Las Vegas, Business Licensing", "拉斯维加斯市营业执照处", "https://www.lasvegasnevada.gov", "Get the city or Clark County business license, depending on where the store is.", "视门店位置申请拉斯维加斯市或克拉克县营业执照。", false],
    ["lv-food", "LV", "county", 70, null, "Food Establishment Permit", "Food establishment permit", "食品场所许可证", "Southern Nevada Health District", "南内华达卫生区", "https://www.southernnevadahealthdistrict.org", "Plan review, then the health permit before opening.", "先做图纸审查，开业前取得卫生许可证。", false],
    ["nj-formation", "NJ", "state", 20, null, "Public Records Filing for New Business Entity", "Business formation and tax registration", "企业设立与税务登记", "NJ Division of Revenue and Enterprise Services", "新泽西州税收与企业服务处", "https://www.nj.gov/treasury/revenue/", "Form or register the company, then register for state taxes.", "设立或登记公司后登记州税务。", true],
  ] as const).map(([id, where, level, order, fee, form, ten, tzh, aen, azh, url, hen, hzh, formation]) => W({ id, where, level: level as Level, method: "online", order, fee, cur: "USD",
    ...(formation ? { needs: { newEntity: true } } : {}), ...(/food|dbpr/.test(id) ? { segs: ["restaurant"] as Segment[], needs: { food: true } } : {}),
    form, title: [ten, tzh], agency: [aen, azh], how: [hen, hzh], url,
    ...(formation ? { foreign: ["A company formed in another state or abroad registers as a foreign entity instead.", "在外州或境外成立的公司改为办理外地公司登记。"] as T } : {}) })),
];

/* ------------------------------------------------------------------ where it is */

export type Place = { codes: string[]; country?: Country; city?: City; known: boolean };
const has = (text: string, alias: string) => /[a-z]/.test(alias) ? new RegExp(`(^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(text) : text.includes(alias);

/** The countries, states and cities in a place, as the codes the steps use. known: a city with its own local steps. */
export function worldPlaces(where: string): Place {
  const w = where.toLowerCase();
  const city = CITIES.find(x => x.aliases.some(a => has(w, a.toLowerCase())));
  const country = COUNTRIES.find(x => x.code === city?.country) ?? COUNTRIES.find(x => x.code !== "US" && x.names.test(w));
  const codes: string[] = [];
  if (country) codes.push(country.code);
  if (city?.state) codes.push(city.state);
  for (const s of STATES) if (s.names.test(where) && !codes.includes(s.code)) codes.push(s.code);
  if (city) codes.push(city.code);
  return { codes, country, city, known: !!city?.guide };
}

export const currencyOf = (country?: string) => COUNTRIES.find(x => x.code === country)?.currency ?? "USD";
