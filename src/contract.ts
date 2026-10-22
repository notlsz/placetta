/* Contract mechanics: yearly and multi-year terms that renew automatically, told plainly, with a reminder before every
   renewal and cancellation online in one step, as California's Automatic Renewal Law asks (Bus. & Prof. Code
   § 17600 and following). Read on the California Senate Judiciary Committee's analysis of AB 2863 (2023-2024), the
   official legislative record, on 2026-10-22:
     § 17602(a)(1)  the offer terms "in a clear and conspicuous manner before the subscription or purchasing agreement is
                    fulfilled", in visual proximity to the request for consent
     § 17602(b)     for an initial term of one year or longer, "the notice shall be provided at least 15 days and not more
                    than 45 days" before it renews
     § 17602(d)(1)  a person who signed up online can cancel "exclusively online, at will, and without engaging any
                    further steps" that obstruct or delay cancelling
     AB 2863        adds a yearly reminder: what the service is, how often and how much it charges, and how to cancel
   The law protects consumers; Placetta's customers are businesses, and Placetta follows it for every customer anyway.
   FOUNDER STEP: have counsel confirm against the chaptered text of AB 2863 (leginfo.legislature.ca.gov blocks automated
   reads, so the committee analysis is the source quoted here).

   Expansion prompts: when a customer adds a market or a module, say what it adds before anything is bought. Nothing in
   this file charges anything. No imports but the price list, so the monitor (Deno) sends the same notice. */
import { PROPOSED, PUBLISHED } from "./pricing.ts";

type Bi = { en: string; zh: string };
const B = (en: string, zh: string): Bi => ({ en, zh });

export const ARL_SOURCE = { url: "https://sjud.senate.ca.gov/media/1470", read: "2026-10-22", cite: "Cal. Bus. & Prof. Code § 17602(a)(1), (b), (d)(1); AB 2863 (2024)" };
/** The renewal notice window for a term of a year or longer, in days before the renewal (§ 17602(b)). */
export const NOTICE_MIN = 15, NOTICE_MAX = 45;
/** The day the monitor sends it: inside the window, early enough to act. */
export const NOTICE_AT = 30;

export type Term = { years: number; tier: "essentials" | "pro"; locations: number };
export const validTerm = (y: unknown): number | null => (typeof y === "number" && (PROPOSED.terms as readonly number[]).includes(y) ? y : null);

const money = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** What a year costs at the published per-location price. */
export function yearUsd(t: Term): number {
  const month = t.tier === "pro" ? PUBLISHED.proMonth : PUBLISHED.essentialsMonth;
  return month * 12 * Math.max(1, Math.floor(t.locations)) * (1 - PROPOSED.multiYearDiscountPct / 100);
}

/** The terms, said before checkout, next to the button that agrees to them (§ 17602(a)(1)). With no tier chosen yet,
 *  both published prices are said. */
export function disclosure(t: Omit<Term, "tier"> & { tier?: Term["tier"] }): Bi {
  const n = Math.max(1, Math.floor(t.locations));
  const ess = money(yearUsd({ ...t, tier: "essentials" })), pro = money(yearUsd({ ...t, tier: "pro" }));
  const price = t.tier ? B(`${money(yearUsd({ ...t, tier: t.tier }))} a year`, `每年 ${money(yearUsd({ ...t, tier: t.tier }))}`)
    : B(`${ess} a year for Essentials or ${pro} for Pro`, `基础版每年 ${ess}，专业版每年 ${pro}`);
  const term = t.years === 1 ? B("one year", "一年") : B(`${t.years} years, billed once a year`, `${t.years} 年，每年计费一次`);
  return B(
    `Renews automatically. Your plan is for ${term.en} at ${price.en} (${n} location${n === 1 ? "" : "s"}), then renews every year at the same price until you cancel. We email you ${NOTICE_MIN} to ${NOTICE_MAX} days before each renewal with what it will charge. Cancel online any time in Settings, Billing: one click, no call. Government fees are separate and paid to each agency.`,
    `自动续费。您的方案期限为${term.zh}，${price.zh}（${n} 家门店），到期后按相同价格每年自动续费，直到您取消。每次续费前 ${NOTICE_MIN} 至 ${NOTICE_MAX} 天，我们会发邮件告知续费金额。可随时在“设置 > 账单”中在线取消：点一下即可，无需致电。政府规费另计，直接支付给各机构。`);
}

/** The consent line the owner ticks before paying. */
export const consentLine = B("I agree that the plan renews automatically as described above until I cancel.", "我同意方案按上述条款自动续费，直到我取消。");

/** Whether the renewal notice is due today: inside the window, at NOTICE_AT days or fewer, and not yet sent for this
 *  renewal. `sentFor` is the renewal day the last notice was sent for. */
export function noticeDue(renewsOn: string | null | undefined, today: string, sentFor: string | null | undefined, autoRenew = true): boolean {
  if (!autoRenew || !renewsOn || !/^\d{4}-\d{2}-\d{2}/.test(renewsOn)) return false;
  const d = renewsOn.slice(0, 10);
  if (sentFor && sentFor.slice(0, 10) === d) return false;
  const left = Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);
  return left >= NOTICE_MIN && left <= NOTICE_AT;
}

/** The commitment's last day: the start plus the term's years, less a day. */
export function commitmentEnd(start: string, years: number): string {
  const [y, m, d] = start.slice(0, 10).split("-").map(Number);
  const end = new Date(Date.UTC(y + years, m - 1, d) - 864e5);
  return end.toISOString().slice(0, 10);
}

/** The renewal notice (and the yearly reminder AB 2863 adds): what it is, how often and how much, how to cancel, and
 *  what the year delivered, from the value report's own lines. */
export function renewalNotice(o: { business: string; renewsOn: string; yearUsd: number; locations: number; tier: "essentials" | "pro"; delivered: Bi[]; cancelUrl: string; lang?: "en" | "zh" }): { subject: string; text: string; html: string } {
  const zh = o.lang === "zh";
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const plan = o.tier === "pro" ? (zh ? "专业版" : "Pro") : (zh ? "基础版" : "Essentials");
  const subject = zh ? `${o.business}：快哉方案将于 ${o.renewsOn} 自动续费` : `${o.business}: your Placetta plan renews on ${o.renewsOn}`;
  const lines = [
    zh ? `您的快哉${plan}方案（${o.locations} 家门店）将于 ${o.renewsOn} 自动续费，费用 ${money(o.yearUsd)}，每年一次。` : `Your Placetta ${plan} plan (${o.locations} location${o.locations === 1 ? "" : "s"}) renews automatically on ${o.renewsOn} for ${money(o.yearUsd)}, once a year.`,
    zh ? "不想续费？可在线取消，点一下即可，无需致电：" : "Don't want it to renew? Cancel online in one click, no call needed:",
    o.cancelUrl,
  ];
  const got = o.delivered.map(l => (zh ? l.zh : l.en));
  const text = `${lines.join("\n")}\n\n${zh ? "过去一年快哉为您完成的工作（均来自存档记录）：" : "What Placetta delivered this past year (from records on file):"}\n${got.map(g => "- " + g).join("\n")}\n`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px"><p>${esc(lines[0])}</p><p>${esc(lines[1])} <a href="${esc(o.cancelUrl)}">${zh ? "取消自动续费" : "Cancel auto-renew"}</a></p><p><b>${zh ? "过去一年快哉为您完成的工作（均来自存档记录）" : "What Placetta delivered this past year (from records on file)"}</b></p><ul>${got.map(g => `<li>${esc(g)}</li>`).join("")}</ul></div>`;
  return { subject, text, html };
}

/* ------------------------------------------------------------------ expansion prompts */

export type Expansion = { id: string; title: Bi; body: Bi; action: "module" | "entity" | "hq" | "plan"; module?: string };
type ExpandIn = {
  storeStates: string[];                 // two-letter states (or country codes) of every store
  entityStates: string[];                // states the entities are registered in
  modules: string[];                     // modules on the plan
  sellsAlcohol: boolean; imports: boolean;
  locations: number; hq: boolean;
};
const US = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));

/** What adding a market or a module would add, from the workspace's own facts. Says, never buys. */
export function expansions(x: ExpandIn): Expansion[] {
  const out: Expansion[] = [];
  const newStates = [...new Set(x.storeStates.map(s => s.toUpperCase()))].filter(s => US.has(s) && !x.entityStates.map(e => e.toUpperCase()).includes(s));
  if (newStates.length) out.push({ id: `entity:${newStates.join(",")}`, action: "entity", module: "entity",
    title: B(`A store in ${newStates.join(", ")}: is the entity registered there?`, `${newStates.join("、")} 有门店：实体是否已在当地登记？`),
    body: B("A company doing business in another state usually registers there and then owes that state's annual report. Add the registration to Entities and its due dates go on the calendar.", "在其他州经营的公司通常需在当地登记，之后须提交该州年报。在“实体”中添加登记，其到期日会加入日历。") });
  const abroad = [...new Set(x.storeStates.map(s => s.toUpperCase()))].filter(s => s.length === 2 && !US.has(s));
  if (abroad.length && !x.modules.includes("abroad")) out.push({ id: "module:abroad", action: "module", module: "abroad",
    title: B(`Stores outside the US (${abroad.join(", ")})`, `美国以外的门店（${abroad.join("、")}）`), body: B("Add Europe and Mexico for their licenses, filings and renewals.", "添加“欧洲与墨西哥”模块，处理当地执照、申报和续期。") });
  if (x.sellsAlcohol && !x.modules.includes("alcohol")) out.push({ id: "module:alcohol", action: "module", module: "alcohol",
    title: B("You sell alcohol", "您销售酒类"), body: B("Add Alcohol for the state and local liquor licenses, the federal registration and their renewals.", "添加“酒类”模块，处理州和地方酒牌、联邦登记及续期。") });
  if (x.imports && !x.modules.includes("imports")) out.push({ id: "module:imports", action: "module", module: "imports",
    title: B("You import goods", "您进口商品"), body: B("Add Imports and customs for the bond, the importer filings and FDA prior notice.", "添加“进口与海关”模块，处理担保、进口申报和 FDA 预先通知。") });
  if (x.locations >= 10 && !x.hq) out.push({ id: "hq", action: "hq",
    title: B(`${x.locations} locations`, `${x.locations} 家门店`), body: B("A brand plan puts every location on one dashboard, and each new location joins with one invite.", "品牌方案把所有门店放在一个看板上，新门店凭一个邀请即可加入。") });
  return out;
}
