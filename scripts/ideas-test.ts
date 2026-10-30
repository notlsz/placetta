// Odelia's Ideas (src/ideas.ts): offers from the business's own records, never an invented number.
import { ideas } from "../src/ideas.ts";
import { SAMPLE } from "../src/model.ts";
import { runway } from "../src/runway.ts";
import { connectAsk } from "../src/connectAsk.ts";
import type { Workspace } from "../src/model.ts";

let bad = 0;
const ok = (c: unknown, what: string, got?: unknown) => { if (c) console.log("ok  ", what); else { bad++; console.log("FAIL", what, got === undefined ? "" : JSON.stringify(got).slice(0, 400)); } };
const today = new Date().toISOString().slice(0, 10);

const list = ideas(SAMPLE, today);
ok(list.length >= 3, "the sample business gets offers", list.map(x => x.title.en));
ok(list.every(x => /^I can /.test(x.title.en) && /^我可以/.test(x.title.zh)), "each is an offer in her voice, in English and Chinese", list.map(x => [x.title.en, x.title.zh]));
ok(list.every(x => x.why.en.length > 20 && x.why.zh.length > 6 && x.ask.en.length > 10), "each says why and what to ask");
const text = list.flatMap(x => [x.title.en, x.title.zh, x.why.en, x.why.zh, x.ask.en, x.ask.zh]).join("\n");
ok(!/[—–·•]/.test(text), "no dashes or dot separators", text.match(/[—–·•]/));
ok(!/\b0\d\b/.test(text.replace(/\d{4}-\d{2}-\d{2}/g, "")), "no leading zeros outside dates");
ok(new Set(list.map(x => x.id)).size === list.length, "no idea twice");
ok(list.every((x, i) => i === 0 || list[i - 1].rank <= x.rank), "ranked by what it protects: lapses first, growth last");

// every number in a reason is one the records hold: a renewal's days match its date
const renews = list.filter(x => x.icon === "renew");
ok(renews.length > 0, "the sample has a renewal to offer");
for (const x of renews) {
  const r = runway(SAMPLE, today).find(r => x.id === "renew:" + r.id);
  ok(!!r && x.why.en.includes(`${r.days} days from now`) && r.days === Math.round((Date.parse(r.date) - Date.parse(today)) / 864e5), "a renewal's days are counted from its own date", x.why.en);
}
ok(ideas(SAMPLE, today, { unpublished: 7 }).some(x => x.icon === "fee" && /7 agency fees/.test(x.title.en)), "the fee offer counts what the cost line counts");
ok(!ideas(SAMPLE, today, { unpublished: 0 }).some(x => x.icon === "fee"), "no fee offer when every fee is known");

// a business with no records gets no offers, not made-up ones
const empty: Workspace = { ...SAMPLE, apps: [], deadlines: [], stores: [] };
ok(ideas(empty, today, { unpublished: 0 }).length === 0, "nothing in the records, nothing offered");

// "Connect my Gmail" opens the connection page; work that only sounds like it ("set up the food handler cards") goes to her
ok(connectAsk("Connect my Gmail") === "Gmail" && connectAsk("Please connect our QuickBooks account") === "QuickBooks" && connectAsk("连接我的微信") === "微信", "asking to connect an app finds it", [connectAsk("Connect my Gmail"), connectAsk("连接我的微信")]);
ok([ "set up the food handler cards", "Connect the sign permit to the store", "Connect my Gmail and file the permit"].every(t => connectAsk(t) === null), "work that isn't a connection still goes to Odelia");

console.log(bad ? `\n${bad} failed` : "\nall passed");
process.exit(bad ? 1 : 0);
