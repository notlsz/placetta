// Law watch (src/lawWatch.ts): official sources only, the team's words only, each business once. Run from
// scripts/agent-test.ts.
import { readFileSync } from "node:fs";
import { affects, candidatesFrom, extraFeeds, FEEDS, formMatch, fromWatch, lawUpdate, lawUpdates, official, parseFeed, reviewProblems, SEND_DAYS, statesOf, watchList, type Alert } from "../src/lawWatch";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;

const DASH = /[–—]/;
const alert = (over: Partial<Alert> = {}): Alert => ({
  id: "a1", workspace_id: null, jurisdiction: "US", forms: ["cbp-*"], source_url: "https://www.federalregister.gov/documents/2026/10/22/2026-21600/x", source_label: "federalregister.gov",
  headline: { en: "CBP extends the postal entry date", zh: "海关延长邮件入境申报日期" }, body: { en: "Imports by mail keep the old process until the new date.", zh: "邮寄进口在新日期前沿用原流程。" },
  effective: "2027-02-01", decided_at: "2026-10-27T15:00:00Z", ...over,
});
const ws = (apps: { id: string; official?: string; status?: string }[], o: { region?: string; address?: string } = {}) =>
  ({ apps, meta: o.region ? { region: o.region } : {}, stores: o.address ? [{ address: o.address }] : [] });

export function lawWatchTests(ok: Ok, eq: Eq) {
  console.log("\n# Law watch: official feeds, the team's review, each business once");

  // official sources only
  ok(official("https://www.federalregister.gov/documents/x") && official("https://www.cdtfa.ca.gov/formspubs/pub73.pdf") && official("https://sanjoseca.gov/"), "a .gov page over https is official");
  ok(!official("http://www.fda.gov/x") && !official("https://fda.gov.example.com/x") && !official("https://x.com/fda.gov") && !official("") && !official(null), "plain http, a look-alike host or a .gov in the path is not");
  ok(FEEDS.length >= 3 && FEEDS.every(f => official(f.url) && /RULE/.test(f.url) && /PRORULE/.test(f.url)), "every built-in feed is the Federal Register's own, rules and proposed rules", FEEDS.map(f => f.url));
  eq(extraFeeds(JSON.stringify([
    { id: "tx-register", agency: "Texas Register", url: "https://www.sos.texas.gov/texreg/feed.xml", jurisdiction: "US-TX", forms: [] },
    { id: "blog", url: "https://lawblog.example.com/rss", jurisdiction: "US" },
    { id: "BAD ID", url: "https://a.gov/rss", jurisdiction: "US" },
    { id: "ca", url: "https://oal.ca.gov/feed/", jurisdiction: "California" },
  ])).map(f => f.id), ["tx-register"], "a team-added feed counts only on an official host, with a clean id and a state code");
  eq(extraFeeds("not json"), [], "a malformed RULE_FEEDS is ignored, not fatal");

  // reading the Federal Register's own feed (fixture: CBP's, fetched 2026-10-28)
  const xml = readFileSync("scripts/fixtures/federal-register-cbp.xml", "utf8");
  const items = parseFeed(xml);
  eq(items.length, 3, "three items read from the feed");
  ok(items[0].title.startsWith("Indefinite Suspension of the De Minimis Exemption") && items[0].published === "2026-10-22" && items[0].link.startsWith("https://www.federalregister.gov/documents/2026/10/22/"), "title, day and the document's own page", items[0]);
  eq(parseFeed("<html><body>Access denied</body></html>"), [], "a page that isn't a feed gives nothing");
  const atom = parseFeed(`<feed><entry><title>Rule &amp; notice</title><link href="https://a.gov/r?x=1&amp;y=2"/><updated>2026-10-20T00:00:00Z</updated><id>t1</id><summary><![CDATA[<p>About food</p>]]></summary></entry></feed>`);
  ok(atom.length === 1 && atom[0].title === "Rule & notice" && atom[0].link === "https://a.gov/r?x=1&y=2" && atom[0].description === "About food", "Atom feeds read too, entities and CDATA decoded", atom);

  const cbp = FEEDS.find(f => f.id === "fr-cbp")!;
  const c = candidatesFrom(cbp, items, "2026-10-28");
  ok(c.length >= 1 && c.every(x => x.origin === "register" && x.forms.includes("cbp-*") && official(x.source_url) && x.dedupe.startsWith("register:fr-cbp:")), "CBP items become pending candidates tied to CBP's forms", c);
  ok(!c.some(x => /Traveler Information for Rail/.test(x.title)), "a rule about rail travelers isn't about a business's imports", c.map(x => x.title));
  eq(candidatesFrom(cbp, items, "2026-12-30").length, 0, "items older than three weeks were the news before Placetta read them");
  eq(candidatesFrom(cbp, [{ ...items[0], link: "https://news.example.com/cbp" }], "2026-10-28").length, 0, "an item that links off a government site is dropped");
  eq(new Set(c.map(x => x.dedupe)).size, c.length, "one candidate per document");

  // Odelia's weekly finding goes to the team, with her official source if she gave one
  eq(fromWatch("ws1", "run1", "No changes.", "San Jose, CA"), null, "nothing found, nothing queued");
  const w = fromWatch("ws1", "run1", "Santa Clara County raised the plan check fee (https://deh.santaclaracounty.gov/fees). See also https://blog.example.com/x.", "San Jose, CA")!;
  ok(w.origin === "odelia" && w.workspace_id === "ws1" && w.source_url === "https://deh.santaclaracounty.gov/fees" && w.dedupe === "odelia:run1", "her finding is queued for one business with the official page she cited", w);
  ok(fromWatch("ws1", "run2", "A blog says fees went up: https://blog.example.com/x", "")!.source_url === null, "a finding with no official page has no source until the team adds one");

  // the team's review
  const good = { headline: alert().headline, body: alert().body, source_url: alert().source_url, effective: "2027-02-01" };
  eq(reviewProblems(good), [], "both languages, short, an official source: nothing stops it");
  ok(reviewProblems({ ...good, headline: { en: "Only English", zh: "" } }).length === 1, "a missing language stops it");
  ok(reviewProblems({ ...good, body: { en: "New rule — read it", zh: good.body.zh } }).some(p => /dash/.test(p.en)), "a dash stops it");
  ok(reviewProblems({ ...good, source_url: "https://lawblog.example.com/x" }).some(p => /official source/.test(p.en)), "an unofficial source stops it");
  ok(reviewProblems({ ...good, effective: "Feb 1" }).some(p => /YYYY-MM-DD/.test(p.en)), "an effective date must be a date");
  ok(reviewProblems({ headline: { en: "", zh: "" }, body: { en: "", zh: "" }, source_url: null }).every(p => p.en && p.zh && !DASH.test(p.en + p.zh)), "every problem is said in both languages, without dashes");

  // who hears
  ok(formMatch("cbp-*", "cbp-5106") && formMatch("fda-ffr", "fda-ffr") && !formMatch("fda-*", "ttb-dealer") && !formMatch("fda-ffr", "fda-ffr-2"), "a form pattern matches its agency's forms, an id only itself");
  const importer = ws([{ id: "a-entry", official: "cbp-5106" }, { id: "a-hp", official: "ca-health" }]);
  const teaShop = ws([{ id: "a-hp", official: "ca-health" }], { address: "123 Main St, San Jose, CA 95112" });
  eq(affects(alert(), "w1", importer), { hit: true, app: "a-entry" }, "an importer with a CBP form hears, on that application");
  eq(affects(alert(), "w2", teaShop), { hit: false, app: null }, "a tea shop with no CBP form doesn't");
  eq(affects(alert({ forms: [], jurisdiction: "US" }), "w2", teaShop).hit, false, "a federal change tied to no form goes to nobody (too broad)");
  eq(affects(alert({ forms: [], jurisdiction: "US-CA" }), "w2", teaShop).hit, true, "a California change with no form reaches a California store");
  eq(affects(alert({ forms: [], jurisdiction: "US-TX" }), "w2", teaShop).hit, false, "and not a Texas change");
  eq(affects(alert({ workspace_id: "w2" }), "w1", importer).hit, false, "a finding for one business reaches only that business");
  eq(affects(alert(), "w1", ws([{ id: "x", official: "cbp-5106", status: "canceled" }])).hit, false, "a canceled application doesn't count");
  eq([...statesOf(ws([], { region: "California" }))], ["CA"], "a region written out is a state");
  eq([...statesOf(ws([], { address: "1 Elm St, Austin, TX 78701-1234" }))], ["TX"], "a store's address gives its state");

  const u = lawUpdate(alert(), "w1", "a-entry");
  ok(u.dedupe === "law:a1" && u.kind === "agent" && u.app_id === "a-entry", "one Update per change and business, keyed law:<id>", u);
  ok(u.title.en.startsWith("Rule change: CBP extends") && u.title.zh.startsWith("法规变化：海关延长"), "the team's headline in both languages");
  ok(/Takes effect 2027-02-01\./.test(u.body.en) && /2027-02-01 生效/.test(u.body.zh) && u.body.en.includes(alert().source_url) && u.body.zh.includes(alert().source_url), "when it takes effect and the official source, in both languages", u.body);
  ok(!DASH.test(u.title.en + u.title.zh + u.body.en + u.body.zh), "no dashes in what the owner reads");
  ok(!u.body.en.includes("De Minimis") && !u.body.en.includes("This document announces"), "nothing from the feed itself reaches the owner, only the team's words");

  const now = Date.parse("2026-10-28T12:00:00Z");
  const list = [{ id: "w1", state: importer }, { id: "w2", state: teaShop }];
  const out = lawUpdates([alert()], list, now);
  eq(out.map(x => x.workspace_id), ["w1"], "the approved change reaches the affected business only");
  eq(lawUpdates([alert(), alert()], list, now).map(x => x.dedupe), ["law:a1", "law:a1"], "the same change twice keeps one key: the updates table stores it once");
  eq(lawUpdates([alert({ decided_at: new Date(now - (SEND_DAYS + 1) * 864e5).toISOString() })], list, now).length, 0, "a change approved over a month ago isn't sent to newcomers");
  eq(lawUpdates([alert({ source_url: "https://blog.example.com/x" })], list, now).length, 0, "an approved row without an official source is never sent");
  eq(lawUpdates([alert({ headline: { en: "x", zh: "" } })], list, now).length, 0, "nor one missing a language");

  // what the owner sees Odelia watching
  const shown = watchList({ apps: [
    { id: "a1", name: { en: "Seller's permit", zh: "销售许可证" }, official: "ca-cdtfa-seller", source: { label: "cdtfa.ca.gov", url: "https://www.cdtfa.ca.gov/formspubs/pub73.pdf" } },
    { id: "a2", name: { en: "Customs bond", zh: "海关保证金" }, official: "cbp-301", source: { label: "govinfo.gov", url: "https://www.govinfo.gov/content/pkg/x.pdf" } },
    { id: "a3", name: { en: "Same page", zh: "同一页面" }, source: { label: "cdtfa.ca.gov", url: "https://www.cdtfa.ca.gov/formspubs/pub73.pdf" } },
    { id: "a4", name: { en: "A blog", zh: "博客" }, source: { label: "x", url: "https://example.com/x" } },
  ] });
  eq(shown.map(x => x.kind + ":" + x.id), ["page:a1", "page:a2", "register:fr-cbp"], "each official page once, then the Federal Register for the federal agency in the plan; never an unofficial page");
  ok(shown.every(x => x.name.en && x.name.zh && !DASH.test(x.name.en + x.name.zh)), "every line in both languages");
}
