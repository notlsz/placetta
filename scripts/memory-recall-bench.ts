/* Memory recall on the journeys' businesses: what memory_recall (and the prompt's "Memory that fits this request")
   finds when an owner asks about something they told Odelia weeks ago, in other words, in the other language, or by the
   agency's short name. 48 facts saved the way "remember this" saves them (the owner's own words, one language), then 40
   questions, each with the fact it should find. Measured: recall at 5 (the fact is in the first five) and mean
   reciprocal rank. Run by npm run test:agent (journeys) and on its own:
     esbuild scripts/memory-recall-bench.ts --bundle --platform=node --format=esm --outfile=.mrb.mjs && node .mrb.mjs
   Only public memory functions are used, so the same file measured origin/main before this pass and the pass after. */
import { remembered } from "../src/odeliaMemory/observe";
import { recall } from "../src/odeliaMemory/retrieve";
import { emptyAgentMemory, type AgentMemory, type Observation } from "../src/odeliaMemory/types";

type Fact = { id: string; text: string; store?: string; at: string };
type Q = { q: string; want: string; store?: string; kind: "same words" | "paraphrase" | "short name" | "other language" | "store" };

export const FACTS: Fact[] = [
  { id: "coi", text: "Our Houston landlord, Bayou Realty, requires a certificate of insurance naming them", at: "2026-08-02" },
  { id: "hood", text: "The Flushing hood cleaning is done by Apex Hood every quarter", store: "flushing", at: "2026-07-11" },
  { id: "inspector", text: "Inspector Maria Chen from DOHMH visited Flushing in June and asked for the pest log", store: "flushing", at: "2026-06-20" },
  { id: "entity", text: "Moonleaf Tea LLC is registered in Delaware and files in New York as a foreign LLC", at: "2026-05-02" },
  { id: "wechat", text: "Send the owner updates on WeChat, not email", at: "2026-09-01" },
  { id: "accountant", text: "Our accountant is Lily Zhou at Zhou CPA, she files the sales tax returns", at: "2026-04-15" },
  { id: "sjlease", text: "The San Jose lease starts March 1 and the landlord gives 90 days free rent for buildout", store: "sanjose", at: "2026-09-12" },
  { id: "liquor", text: "We decided not to apply for a liquor license at the Austin store this year", store: "austin", at: "2026-08-20" },
  { id: "co", text: "The certificate of occupancy for Irvine is waiting on the fire marshal's final", store: "irvine", at: "2026-10-01" },
  { id: "signage", text: "The mall in Irvine needs to approve every sign before we apply to the city", store: "irvine", at: "2026-07-30" },
  { id: "contractor", text: "Our general contractor in Texas is Lone Star Build, contact Ray Ortiz", at: "2026-06-05" },
  { id: "foodhandler", text: "Every new hire must get the food handler card within 30 days", at: "2026-03-10" },
  { id: "grease", text: "The Houston grease trap is pumped by Gulf Coast Pumping every 90 days", store: "houston", at: "2026-08-30" },
  { id: "eu", text: "For the EU furniture launch we use a German distributor, Haus Moebel GmbH, as importer of record", at: "2026-09-18" },
  { id: "mexico", text: "Our Mexico City showroom needs a uso de suelo letter before the aviso de funcionamiento", at: "2026-09-20" },
  { id: "hours", text: "The Flushing store is open 10am to 10pm every day", store: "flushing", at: "2026-02-01" },
  { id: "approvals", text: "Any filing fee over 500 dollars needs Wei's approval first", at: "2026-05-25" },
  { id: "tabc", text: "TABC asked for the lease and the floor plan with the Austin application", store: "austin", at: "2026-08-10" },
  { id: "nyc_grade", text: "Flushing got an A grade at the last health inspection", store: "flushing", at: "2026-06-21" },
  { id: "water", text: "Irvine needs a backflow test certificate every year from the water district", store: "irvine", at: "2026-06-30" },
  { id: "music", text: "We pay BMI and ASCAP for music at every store", at: "2026-01-20" },
  { id: "franchise", text: "Franchisees in Texas must use our approved boba supplier, Formosa Tapioca", at: "2026-04-01" },
  { id: "insurer", text: "Our insurance broker is Pacific Shield, policy renews every September", at: "2026-02-15" },
  { id: "ein", text: "Wei is the responsible party on the company's tax registrations", at: "2026-01-05" },
  { id: "chinese", text: "Write applications for the Houston store in English but explain them to the manager in Chinese", store: "houston", at: "2026-07-01" },
  { id: "sf_permit", text: "San Francisco planning said our Clement Street change of use needs a Section 311 notice", at: "2026-08-25" },
  { id: "sj_health", text: "Santa Clara County health wants plan check before construction at San Jose", store: "sanjose", at: "2026-09-14" },
  { id: "warehouse", text: "The New Jersey warehouse holds the furniture stock for the East Coast", at: "2026-03-15" },
  { id: "parking", text: "The Irvine landlord says the patio seating needs a separate outdoor dining permit", store: "irvine", at: "2026-08-15" },
  { id: "deliveries", text: "Deliveries at Flushing can only come before 9am because of the street rules", store: "flushing", at: "2026-05-20" },
  // in Chinese, the way an owner says it
  { id: "zh_landlord", text: "法拉盛的房东要求装修前提交施工图", store: "flushing", at: "2026-07-05" },
  { id: "zh_manager", text: "休斯顿店长是陈静，负责每天的温度记录", store: "houston", at: "2026-08-05" },
  { id: "zh_fee", text: "加州的销售许可证不收费，但要交押金", at: "2026-06-12" },
  { id: "zh_bank", text: "公司的营业执照由王伟保管", at: "2026-05-30" },
  { id: "zh_pref", text: "所有文件先发中文版给老板看", at: "2026-04-22" },
  // noise: nearby words, other stores
  { id: "n1", text: "The Austin store's music license is under the franchise agreement", store: "austin", at: "2026-02-10" },
  { id: "n2", text: "Houston health permit renews every year in January", store: "houston", at: "2026-01-12" },
  { id: "n3", text: "The San Jose store will use the same menu boards as Flushing", store: "sanjose", at: "2026-09-02" },
  { id: "n4", text: "Irvine opening is planned for spring 2027", store: "irvine", at: "2026-09-25" },
  { id: "n5", text: "Wei prefers short answers with the next step first", at: "2026-03-01" },
  { id: "n6", text: "The Flushing landlord's agent is Kim Property Management", store: "flushing", at: "2026-04-18" },
  { id: "n7", text: "The Texas comptroller sales tax permit is filed for every Texas store", at: "2026-05-11" },
  { id: "n8", text: "Our pest control vendor is Orkin at every store", at: "2026-02-20" },
  { id: "n9", text: "The EU launch starts with Germany and the Netherlands", at: "2026-09-19" },
  { id: "n10", text: "Annual fire extinguisher inspection is booked with SafeFire in March", at: "2026-03-05" },
  { id: "n11", text: "Austin building permit was approved in August", store: "austin", at: "2026-08-28" },
  { id: "n12", text: "The Houston store's sign permit was filed by the sign company", store: "houston", at: "2026-07-20" },
  { id: "n13", text: "Lily sends the monthly sales numbers by the 5th", at: "2026-04-16" },
];

export const QUERIES: Q[] = [
  { q: "What does the Houston landlord need from us?", want: "coi", kind: "paraphrase" },
  { q: "Bayou Realty insurance certificate", want: "coi", kind: "same words" },
  { q: "Who needs to be named on our COI in Houston?", want: "coi", kind: "short name" },
  { q: "休斯顿房东要什么保险证明？", want: "coi", kind: "other language" },
  { q: "Who cleans the exhaust hood in Flushing?", want: "hood", kind: "paraphrase", store: "flushing" },
  { q: "What did the health department inspector ask for?", want: "inspector", kind: "short name" },
  { q: "卫生局检查员上次要了什么？", want: "inspector", kind: "other language" },
  { q: "Where is the company incorporated?", want: "entity", kind: "paraphrase" },
  { q: "How does the owner want to get updates?", want: "wechat", kind: "paraphrase" },
  { q: "老板想用什么方式收到通知？", want: "wechat", kind: "other language" },
  { q: "Who is our CPA?", want: "accountant", kind: "short name" },
  { q: "Who files our sales tax?", want: "accountant", kind: "paraphrase" },
  { q: "When does the San Jose lease start?", want: "sjlease", kind: "same words", store: "sanjose" },
  { q: "Did we decide anything about alcohol in Austin?", want: "liquor", kind: "paraphrase", store: "austin" },
  { q: "What's holding up the CO in Irvine?", want: "co", kind: "short name", store: "irvine" },
  { q: "Who has to sign off on signs in Irvine?", want: "signage", kind: "paraphrase", store: "irvine" },
  { q: "Who is our GC in Texas?", want: "contractor", kind: "short name" },
  { q: "How long do new employees have to get a food handler certificate?", want: "foodhandler", kind: "paraphrase" },
  { q: "新员工多久内要拿到食品从业证？", want: "foodhandler", kind: "other language" },
  { q: "Who pumps the grease interceptor in Houston?", want: "grease", kind: "paraphrase", store: "houston" },
  { q: "Who is the importer of record for the furniture in Europe?", want: "eu", kind: "same words" },
  { q: "What do we need before the aviso de funcionamiento in CDMX?", want: "mexico", kind: "short name" },
  { q: "What are the Flushing opening hours?", want: "hours", kind: "paraphrase", store: "flushing" },
  { q: "Which filings need Wei to approve the fee?", want: "approvals", kind: "paraphrase" },
  { q: "What did the alcohol commission want for Austin?", want: "tabc", kind: "short name", store: "austin" },
  { q: "What letter grade does Flushing have?", want: "nyc_grade", kind: "paraphrase", store: "flushing" },
  { q: "Irvine backflow certificate", want: "water", kind: "same words", store: "irvine" },
  { q: "Which boba supplier must Texas franchisees use?", want: "franchise", kind: "same words" },
  { q: "When does our insurance policy renew?", want: "insurer", kind: "paraphrase" },
  { q: "SF Clement Street change of use notice", want: "sf_permit", kind: "same words" },
  { q: "Does San Jose need a health plan review first?", want: "sj_health", kind: "paraphrase", store: "sanjose" },
  { q: "Can the Irvine patio have seats?", want: "parking", kind: "paraphrase", store: "irvine" },
  { q: "When can trucks deliver to Flushing?", want: "deliveries", kind: "paraphrase", store: "flushing" },
  { q: "What does the Flushing landlord need before renovation?", want: "zh_landlord", kind: "other language", store: "flushing" },
  { q: "法拉盛房东要求什么？", want: "zh_landlord", kind: "same words", store: "flushing" },
  { q: "Who is the Houston store manager?", want: "zh_manager", kind: "other language", store: "houston" },
  { q: "Who keeps the temperature log in Houston?", want: "zh_manager", kind: "other language", store: "houston" },
  { q: "Is there a fee for the California seller's permit?", want: "zh_fee", kind: "other language" },
  { q: "Who holds the business license?", want: "zh_bank", kind: "other language" },
  { q: "What language should documents go to the owner in first?", want: "zh_pref", kind: "other language" },
];

/** The facts as "remember this" keeps them. A fact memory refuses to keep can't be recalled: its questions count as
 *  misses. */
/** Held out: written after the glossary (glossary.ts) was tuned on QUERIES, and never tuned on. The number to trust. */
export const HELD_OUT: Q[] = [
  { q: "Which insurance paper does Bayou want?", want: "coi", kind: "paraphrase" },
  { q: "房东那边对保险有什么要求", want: "coi", kind: "other language" },
  { q: "Who did the DOHMH send to Flushing?", want: "inspector", kind: "short name", store: "flushing" },
  { q: "Which state is our LLC formed in?", want: "entity", kind: "paraphrase" },
  { q: "怎么给老板发更新", want: "wechat", kind: "other language" },
  { q: "会计是谁", want: "accountant", kind: "other language" },
  { q: "San Jose free rent period", want: "sjlease", kind: "same words", store: "sanjose" },
  { q: "Are we selling beer in Austin?", want: "liquor", kind: "paraphrase", store: "austin" },
  { q: "尔湾的使用证卡在哪里", want: "co", kind: "other language", store: "irvine" },
  { q: "德州的承包商联系人", want: "contractor", kind: "other language" },
  { q: "Grease pumping schedule Houston", want: "grease", kind: "same words", store: "houston" },
  { q: "Mexico showroom zoning letter", want: "mexico", kind: "paraphrase" },
  { q: "费用超过多少需要审批", want: "approvals", kind: "other language" },
  { q: "What paperwork did the liquor regulator ask for in Austin?", want: "tabc", kind: "short name", store: "austin" },
  { q: "Flushing health grade", want: "nyc_grade", kind: "same words", store: "flushing" },
  { q: "water district yearly test in Irvine", want: "water", kind: "paraphrase", store: "irvine" },
  { q: "Who renews our insurance and when?", want: "insurer", kind: "paraphrase" },
  { q: "圣何塞开工前卫生部门要什么", want: "sj_health", kind: "other language", store: "sanjose" },
  { q: "Who writes the Houston temperature logs?", want: "zh_manager", kind: "other language", store: "houston" },
  { q: "Do we pay a deposit for the California sales tax permit?", want: "zh_fee", kind: "other language" },
];

export function benchMemory(): { mem: AgentMemory; refused: string[] } {
  const m = emptyAgentMemory(), refused: string[] = [];
  m.settings.enabled = true;
  for (const f of FACTS) {
    const it = remembered(f.text, { ref: `run-${f.id}`, at: `${f.at}T12:00:00.000Z`, by: "u-owner", scope: f.store ? { kind: "store", id: f.store } : undefined });
    if (!it) { refused.push(f.id); continue; }
    m.items.push({ ...it, id: f.id } as Observation);
  }
  return { mem: m, refused };
}

export type BenchResult = { recallAt5: number; mrr: number; byKind: Record<string, { n: number; hit: number }>; misses: string[]; refused: string[] };
export function runBench(now = "2026-10-22T12:00:00.000Z", set: Q[] = QUERIES): BenchResult {
  const QS = set;
  const { mem, refused } = benchMemory();
  let hit = 0, rr = 0;
  const byKind: BenchResult["byKind"] = {}, misses: string[] = [];
  for (const q of QS) {
    const ranked = recall(mem, q.q, { me: "u-owner", scope: { store: q.store }, now, budget: 900 });
    const at = ranked.findIndex(r => r.item.id === q.want);
    const k = (byKind[q.kind] ??= { n: 0, hit: 0 });
    k.n++;
    if (at >= 0 && at < 5) { hit++; k.hit++; } else misses.push(`${q.kind}: "${q.q}" wanted ${q.want}, got ${ranked.slice(0, 3).map(r => r.item.id).join(", ") || "nothing"}`);
    if (at >= 0) rr += 1 / (at + 1);
  }
  return { recallAt5: hit / QS.length, mrr: rr / QS.length, byKind, misses, refused };
}

// run on its own (node .mrb.mjs): print the numbers
if (typeof process !== "undefined" && /memory-recall-bench|\.mrb\./.test(process.argv[1] ?? "")) {
  for (const [name, set] of [["tuned set", QUERIES], ["held out", HELD_OUT]] as const) {
    const r = runBench(undefined, set);
    console.log(`${name}: recall@5 ${(r.recallAt5 * 100).toFixed(1)}%  MRR ${r.mrr.toFixed(3)}`);
    for (const [k, v] of Object.entries(r.byKind)) console.log(`  ${k}: ${v.hit}/${v.n}`);
    if (r.refused.length) console.log(`  refused to keep: ${r.refused.join(", ")}`);
    for (const m of r.misses) console.log("  miss " + m);
  }
}
