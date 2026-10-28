// deno test supabase/functions/monitor/law_watch_test.ts: the daily law watch with a stand-in network and database.
import "./test_env.ts";
import { deepStrictEqual as eq, ok } from "node:assert";
import { feedsFor, lawWatch, type LawIO } from "./law_watch.ts";
import { urgency } from "../_shared/odelia.ts";
import type { Alert, Candidate } from "../../../src/lawWatch.ts";

const FEED = await Deno.readTextFile(new URL("../../../scripts/fixtures/federal-register-cbp.xml", import.meta.url));
const approved: Alert = {
  id: "a1", workspace_id: null, jurisdiction: "US", forms: ["cbp-*"], source_url: "https://www.federalregister.gov/documents/2026/10/22/2026-21600/x", source_label: "federalregister.gov",
  headline: { en: "CBP extends the postal entry date", zh: "海关延长邮件入境申报日期" }, body: { en: "Mail imports keep the old process.", zh: "邮寄进口沿用原流程。" },
  effective: null, decided_at: "2026-10-27T15:00:00Z",
};
const workspaces = [
  { id: "importer", state: { apps: [{ id: "bond", official: "cbp-301" }] } },
  { id: "tea", state: { apps: [{ id: "hp", official: "ca-health" }] } },
];
function io(o: { failFeed?: string; approved?: Alert[] } = {}) {
  const reported: Candidate[][] = [], fetched: string[] = [];
  const x: LawIO = {
    fetchText: async (url) => { fetched.push(url); if (o.failFeed && url.includes(o.failFeed)) throw new Error("HTTP 503"); return url.includes("customs") ? FEED : "<rss><channel></channel></rss>"; },
    report: async (c) => { reported.push(c); return c.length; },
    approved: async () => o.approved ?? [],
  };
  return { x, reported, fetched };
}
const now = Date.parse("2026-10-28T12:00:00Z");

Deno.test("every feed is read; what's new goes to the team's queue, not to any owner", async () => {
  const t = io();
  const r = await lawWatch({ io: t.x, feeds: feedsFor(() => undefined), workspaces, today: "2026-10-28", now });
  eq(t.fetched.length, 3);
  ok(r.queued >= 1 && t.reported.length === 1 && t.reported[0].every((c) => c.origin === "register" && c.forms.includes("cbp-*")));
  eq(r.updates, [], "nothing approved yet, so no owner hears anything");
});

Deno.test("a feed that's down is counted and the others still run", async () => {
  const t = io({ failFeed: "food-and-drug", approved: [approved] });
  const r = await lawWatch({ io: t.x, feeds: feedsFor(() => undefined), workspaces, today: "2026-10-28", now });
  eq(r.errors, 1);
  eq(r.updates.map((u) => [u.workspace_id, u.dedupe, u.app_id]), [["importer", "law:a1", "bond"]]);
});

Deno.test("only what the team approved reaches owners, in its words, keyed to go once", async () => {
  const t = io({ approved: [approved] });
  const r = await lawWatch({ io: t.x, feeds: [], workspaces, today: "2026-10-28", now });
  eq(r.updates.length, 1);
  ok(r.updates[0].title.en === "Rule change: CBP extends the postal entry date" && r.updates[0].body.zh.includes("快哉团队已对照官方来源核实"));
});

Deno.test("RULE_FEEDS adds only official feeds", () => {
  const feeds = feedsFor((k) => k === "RULE_FEEDS" ? JSON.stringify([{ id: "tx", url: "https://www.sos.texas.gov/x.xml", jurisdiction: "US-TX" }, { id: "blog", url: "https://example.com/rss", jurisdiction: "US" }]) : undefined);
  eq(feeds.map((f) => f.id), ["fr-fda", "fr-ttb", "fr-cbp", "tx"]);
});

Deno.test("a rule change is important: a linked phone gets a text, held for quiet hours by odelia-sms", () => {
  eq(urgency({ dedupe: "law:a1", title: { en: "Rule change: x", zh: "法规变化：x" } } as Parameters<typeof urgency>[0], new Set()), "important");
});
