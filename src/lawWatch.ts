/* ------------------------------------------------------------------ *
 * Law watch: rule changes from official sources, checked by a person
 * before any owner hears about them.
 *
 * Copied from Grok's real-time awareness and Dots's proactive briefings
 * (docs/COMPETITORS.md), with their weakness filled: Grok answers from a
 * search index and X posts, Dots acts on what it reads. Here only
 * official sources count, and nothing reaches an owner until the
 * Placetta team has read the source and written the owner's words.
 *
 * Where a change can come from (each lands in rule_alerts as pending,
 * migration 20261105091000_rule_alerts):
 *   register  the Federal Register's own feed for the agencies behind
 *             Placetta's federal forms (FDA, TTB, CBP), and any state
 *             register feed the team adds in RULE_FEEDS, on a .gov host
 *   sweep     the nightly quality sweep found the words Placetta quotes
 *             for a form gone from the agency's page (qa_findings drift)
 *   odelia    Odelia's weekly check found something for one business
 *
 * The team approves it with a headline and a body in English and
 * Chinese and an official source, or dismisses it. The monitor then
 * gives each affected business one Update (dedupe law:<id>, so never
 * twice), which goes out the way the owner asked: email unless they
 * said not to, a text on a linked phone outside their quiet hours, the
 * team chat on its own schedule.
 *
 * Pure and dependency free: the monitor (Deno) imports it as it is, the
 * team's queue in the app uses the same checks.
 * ------------------------------------------------------------------ */

export type Bi = { en: string; zh: string };

/** A feed Placetta reads. forms: the registry forms it can affect ("fda-*" is every FDA form). */
export type Feed = { id: string; agency: string; agencyZh?: string; url: string; jurisdiction: string; forms: string[]; keywords?: RegExp };

const FR = (slug: string) =>
  `https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=${slug}&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE`;

/** The Federal Register's feeds of rules and proposed rules for the agencies behind Placetta's federal forms, read
 *  2026-10-28: each answers RSS 2.0 with one item per document, its federalregister.gov page as the link. FDA publishes
 *  drug and device rules too, so only food and facility words count there. */
export const FEEDS: Feed[] = [
  { id: "fr-fda", agency: "Food and Drug Administration", agencyZh: "美国食品药品监督管理局", url: FR("food-and-drug-administration"), jurisdiction: "US", forms: ["fda-*"],
    keywords: /\b(food|beverage|facility|registration|label|allergen|dietary|import|supplier|juice|bottled water|tea|prior notice)/i },
  { id: "fr-ttb", agency: "Alcohol and Tobacco Tax and Trade Bureau", agencyZh: "美国酒类与烟草税务贸易局", url: FR("alcohol-and-tobacco-tax-and-trade-bureau"), jurisdiction: "US", forms: ["ttb-*"] },
  { id: "fr-cbp", agency: "U.S. Customs and Border Protection", agencyZh: "美国海关与边境保护局", url: FR("u-s-customs-and-border-protection"), jurisdiction: "US", forms: ["cbp-*"],
    keywords: /\b(entry|import|bond|de minimis|informal|ace\b|importer|tariff|duty|duties|merchandise)/i },
];

/** An official source: https on a government host (.gov, which includes federalregister.gov). */
export function official(url: string | null | undefined): boolean {
  try { const u = new URL(String(url ?? "")); return u.protocol === "https:" && /(^|\.)[a-z0-9-]+\.gov$/i.test(u.hostname); } catch { return false; }
}

/** Feeds the team adds (a state register's RSS once one is verified), as JSON in RULE_FEEDS:
 *  [{"id":"tx-register","agency":"Texas Register","url":"https://...gov/...","jurisdiction":"US-TX","forms":[]}].
 *  Anything not on an official host, or malformed, is left out. */
export function extraFeeds(raw: string | null | undefined): Feed[] {
  let list: unknown;
  try { list = JSON.parse(String(raw ?? "") || "[]"); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const out: Feed[] = [];
  for (const f of list as Record<string, unknown>[]) {
    const id = String(f?.id ?? ""), url = String(f?.url ?? ""), jurisdiction = String(f?.jurisdiction ?? "");
    if (!/^[a-z0-9-]{2,40}$/.test(id) || !official(url) || !/^US(-[A-Z]{2})?$/.test(jurisdiction)) continue;
    const forms = Array.isArray(f.forms) ? (f.forms as unknown[]).map(String).filter((x) => /^[a-z0-9-]+\*?$/.test(x)).slice(0, 20) : [];
    out.push({ id, agency: String(f.agency ?? id).slice(0, 120), url, jurisdiction, forms });
  }
  return out;
}

/* ------------------------------------------------------------------ reading a feed */

export type Item = { title: string; link: string; description: string; published: string | null; guid: string };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" || e[1] === "X" ? 2 : 1), e[1] === "x" || e[1] === "X" ? 16 : 10) || 32) : ENT[e.toLowerCase()] ?? m)
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (block: string, name: string) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")); return m ? decode(m[1]) : ""; };
const isoDay = (s: string) => { const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };

/** The items of an RSS 2.0 or Atom feed. Anything that isn't a feed gives none. */
export function parseFeed(xml: string): Item[] {
  const src = String(xml ?? "").slice(0, 2_000_000), out: Item[] = [];
  for (const m of src.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const b = m[1], link = tag(b, "link");
    out.push({ title: tag(b, "title"), link, description: tag(b, "description"), published: isoDay(tag(b, "pubDate") || tag(b, "dc:date")), guid: tag(b, "guid") || link });
  }
  for (const m of src.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)) {
    const b = m[1], link = (b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "").replace(/&amp;/g, "&");
    out.push({ title: tag(b, "title"), link, description: tag(b, "summary") || tag(b, "content"), published: isoDay(tag(b, "updated") || tag(b, "published")), guid: tag(b, "id") || link });
  }
  return out.filter((i) => i.title && i.link);
}

/** What goes to the team's queue (rule_alert_report). */
export type Candidate = {
  origin: "register" | "sweep" | "odelia"; workspace_id?: string | null; jurisdiction: string; forms: string[];
  source_url: string | null; source_label: string | null; title: string; excerpt: string | null; published: string | null; dedupe: string;
};

/** How far back a feed item still counts: older items were the news before Placetta read the feed. */
export const MAX_ITEM_DAYS = 21;
const ageDays = (from: string, to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5);
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** One feed's items as candidates: recent, linked to an official page, and about this business's kind of work. */
export function candidatesFrom(feed: Feed, items: Item[], today: string): Candidate[] {
  const out: Candidate[] = [];
  for (const i of items) {
    if (!official(i.link)) continue;
    if (i.published && (ageDays(i.published, today) > MAX_ITEM_DAYS || ageDays(i.published, today) < -1)) continue;
    if (feed.keywords && !feed.keywords.test(`${i.title} ${i.description}`)) continue;
    out.push({ origin: "register", workspace_id: null, jurisdiction: feed.jurisdiction, forms: feed.forms, source_url: i.link, source_label: hostOf(i.link),
      title: i.title.slice(0, 300), excerpt: i.description.slice(0, 1200) || null, published: i.published, dedupe: `register:${feed.id}:${i.guid}`.slice(0, 300) });
  }
  return out;
}

/** Odelia's weekly check found something for one business: a candidate for the team, with the first official page she
 *  cited as its source (none: the team must find one before it can be approved). */
export function fromWatch(workspaceId: string, runId: string, said: string, where: string): Candidate | null {
  const text = String(said ?? "").trim();
  if (!text || /^no changes\.?$/i.test(text)) return null;
  const url = (text.match(/https:\/\/[^\s)"'<>\]]+/g) ?? []).map((u) => u.replace(/[.,;:]+$/, "")).find(official) ?? null;
  return { origin: "odelia", workspace_id: workspaceId, jurisdiction: "US", forms: [], source_url: url, source_label: url ? hostOf(url) : null,
    title: `Weekly check${where ? ` for ${where}` : ""}: Odelia found a possible change`.slice(0, 300), excerpt: text.slice(0, 4000), published: null, dedupe: `odelia:${runId}` };
}

/* ------------------------------------------------------------------ the team's review */

export type Draft = { headline: Bi; body: Bi; source_url: string | null; effective?: string | null };
/** What stops an approval, in both languages: empty. Both languages written, short enough for a text, no dashes (the
 *  owner reads it), an official source, and an effective date that is a date. */
export function reviewProblems(d: Draft): Bi[] {
  const p: Bi[] = [];
  const h = d.headline ?? { en: "", zh: "" }, b = d.body ?? { en: "", zh: "" };
  if (!h.en?.trim() || !h.zh?.trim()) p.push({ en: "Write the headline in English and Chinese.", zh: "请用英文和中文写标题。" });
  if (!b.en?.trim() || !b.zh?.trim()) p.push({ en: "Write what changes for the owner in English and Chinese.", zh: "请用英文和中文写明对业主的影响。" });
  if ((h.en ?? "").length > 120 || (h.zh ?? "").length > 120) p.push({ en: "Keep the headline under 120 characters.", zh: "标题请少于 120 个字符。" });
  if ((b.en ?? "").length > 600 || (b.zh ?? "").length > 600) p.push({ en: "Keep what changes under 600 characters.", zh: "影响说明请少于 600 个字符。" });
  if (/[–—]/.test(`${h.en}${h.zh}${b.en}${b.zh}`)) p.push({ en: "Use a comma or a period instead of a dash.", zh: "请用逗号或句号代替破折号。" });
  if (!official(d.source_url)) p.push({ en: "Add the official source: an https page on a .gov site.", zh: "请添加官方来源：.gov 网站上的 https 页面。" });
  if (d.effective && !/^\d{4}-\d{2}-\d{2}$/.test(d.effective)) p.push({ en: "Write the effective date as YYYY-MM-DD.", zh: "生效日期请写成 YYYY-MM-DD。" });
  return p;
}

/* ------------------------------------------------------------------ who hears about it */

export type Alert = {
  id: string; workspace_id: string | null; jurisdiction: string; forms: string[]; headline: Bi; body: Bi;
  source_url: string; source_label: string | null; effective: string | null; decided_at: string;
};
type AppLite = { id?: unknown; official?: unknown; status?: unknown };
type StoreLite = { address?: unknown };
export type WsLite = { apps?: unknown; stores?: unknown; meta?: { region?: unknown } } | null | undefined;

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME",
  maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const CODES = new Set(Object.values(STATES));
/** The two-letter states a business operates in: its region and each store's address ("…, San Jose, CA 95112"). */
export function statesOf(ws: WsLite): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => { const t = s.trim(); const c = t.length === 2 ? t.toUpperCase() : STATES[t.toLowerCase()]; if (c && CODES.has(c)) out.add(c); };
  if (typeof ws?.meta?.region === "string") add(ws.meta.region);
  for (const s of (Array.isArray(ws?.stores) ? ws!.stores : []) as StoreLite[]) {
    const m = String(s?.address ?? "").match(/,\s*([A-Z]{2})\s+\d{5}(-\d{4})?\s*$/);
    if (m) add(m[1]);
  }
  return out;
}
export const formMatch = (pattern: string, official: string) => pattern.endsWith("*") ? official.startsWith(pattern.slice(0, -1)) : official === pattern;

/** Whether an approved change concerns this business, and the application it's about. A change for one business goes
 *  to that business only; one tied to forms, to businesses with one of those forms in their plan; a state's change with
 *  no forms, to businesses in that state. A federal change tied to no form is too broad to send anyone. */
export function affects(a: Pick<Alert, "workspace_id" | "forms" | "jurisdiction">, wsId: string, ws: WsLite): { hit: boolean; app: string | null } {
  if (a.workspace_id) return { hit: a.workspace_id === wsId, app: null };
  const apps = ((Array.isArray(ws?.apps) ? ws!.apps : []) as AppLite[]).filter((x) => typeof x?.id === "string" && x.status !== "canceled");
  if (a.forms.length) {
    const hit = apps.find((x) => typeof x.official === "string" && a.forms.some((f) => formMatch(f, x.official as string)));
    return hit ? { hit: true, app: String(hit.id) } : { hit: false, app: null };
  }
  const st = a.jurisdiction.match(/^US-([A-Z]{2})$/)?.[1];
  return { hit: !!st && statesOf(ws).has(st), app: null };
}

export type LawUpdate = { workspace_id: string; kind: "agent"; title: Bi; body: Bi; app_id: string | null; dedupe: string };
/** The owner's Update: the team's words, when it takes effect, and the official source. Nothing from the feed itself. */
export function lawUpdate(a: Alert, wsId: string, app: string | null): LawUpdate {
  const label = a.source_label || hostOf(a.source_url);
  const eff = a.effective ? { en: ` Takes effect ${a.effective}.`, zh: `${a.effective} 生效。` } : { en: "", zh: "" };
  return {
    workspace_id: wsId, kind: "agent", app_id: app, dedupe: `law:${a.id}`,
    title: { en: `Rule change: ${a.headline.en}`.slice(0, 160), zh: `法规变化：${a.headline.zh}`.slice(0, 160) },
    body: {
      en: `${a.body.en.trim()}${eff.en} Source: ${label}, ${a.source_url}. The Placetta team checked it against the official source before telling you.`,
      zh: `${a.body.zh.trim()}${eff.zh}来源：${label}，${a.source_url}。快哉团队已对照官方来源核实后才通知您。`,
    },
  };
}

/** How long after the team approves it a change still reaches a business that newly matches it. */
export const SEND_DAYS = 30;
/** Every approved change's Updates for every business it affects. The (workspace, dedupe) key keeps each one to once. */
export function lawUpdates(alerts: Alert[], workspaces: { id: string; state: WsLite }[], now: number): LawUpdate[] {
  const out: LawUpdate[] = [];
  for (const a of alerts) {
    if (!official(a.source_url) || !a.headline?.en || !a.headline?.zh || !a.body?.en || !a.body?.zh) continue;
    if (now - Date.parse(a.decided_at) > SEND_DAYS * 864e5) continue;
    for (const w of workspaces) { const m = affects(a, w.id, w.state); if (m.hit) out.push(lawUpdate(a, w.id, m.app)); }
  }
  return out;
}

/* ------------------------------------------------------------------ what Odelia watches, for the owner */

export type Watched = { id: string; name: Bi; url: string; label: string; kind: "page" | "register" };
/** What Odelia watches for this business: each application's official page (the one Placetta quotes), and the Federal
 *  Register feed for each federal agency in its plan. One line each, so the owner can see the evidence behind "watching". */
export function watchList(ws: { apps?: { id: string; name: Bi; official?: string; source?: { label?: string; url?: string } }[] }): Watched[] {
  const out: Watched[] = [], seen = new Set<string>();
  for (const a of ws.apps ?? []) {
    const url = a.source?.url ?? "";
    if (!official(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ id: a.id, name: a.name, url, label: a.source?.label || hostOf(url), kind: "page" });
  }
  for (const f of FEEDS) {
    if (!(ws.apps ?? []).some((a) => a.official && f.forms.some((p) => formMatch(p, a.official!)))) continue;
    out.push({ id: f.id, name: { en: `${f.agency}: rules and proposed rules`, zh: `${f.agencyZh ?? f.agency}：规则与拟议规则` }, url: f.url, label: "federalregister.gov", kind: "register" });
  }
  return out;
}
