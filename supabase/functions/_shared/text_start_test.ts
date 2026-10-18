// deno test supabase/functions/_shared/text_start_test.ts
// Text to start: reading a first line (ten cities, English and Chinese, and lines that aren't one), each channel's
// reply and its length, the claim link's signature and expiry, single use, the rate limits, STOP, the one question,
// the one reminder, the countries, and where the website says to text.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
// @ts-types="./start.d.ts"
import { planForText, readPart, readStart } from "./start.js";
import {
  agencyShort, askReply, feeSay, newStartId, planReply, publicStart, reminderAt, reminderMayGo, reminderText, signStart, SMS_MAX, START_DAYS, START_LIMITS,
  type StartChannel, type StartDeps, startLink, stateTz, textStart, timeSay, verifyStart, wantsReminder,
} from "./text_start.ts";
import { WX_SAY, type WxDeps, wxEncrypt, wxHandle, wxSign } from "./wechat.ts";
import { NOT_TEAMMATE } from "./bots.ts";

const SECRET = "monitor-key-for-tests-0123456789abcdef";
const NOW = new Date("2026-10-18T17:00:00Z");   // 10am in California, 1pm in New York

/* ------------------------------ reading the line ------------------------------ */

Deno.test("parsing: ten cities in English", () => {
  const cases: [string, string, string][] = [
    ["Milk tea shop in Flushing, NY", "Milk tea shop", "Flushing, NY"],
    ["Hot pot restaurant in Irvine, CA", "Hot pot restaurant", "Irvine, CA"],
    ["Bakery in Houston TX", "Bakery", "Houston, TX"],
    ["Hi! We're opening a coffee shop in San Jose", "Coffee shop", "San Jose, CA"],
    ["dumpling house in Brooklyn", "Dumpling house", "Brooklyn, NY"],
    ["Opening a boba shop in Chicago, IL next month", "Boba shop", "Chicago, IL"],
    ["Nail salon in Seattle, Washington", "Nail salon", "Seattle, WA"],
    ["a grocery store in Boston", "Grocery store", "Boston, MA"],
    ["Ramen restaurant at 38 Main St, Las Vegas, NV", "Ramen restaurant", "Las Vegas, NV"],
    ["Bubble tea in Springfield, IL", "Bubble tea", "Springfield, IL"],
  ];
  for (const [line, what, where] of cases) {
    const r = readStart(line);
    assert(r, `reads: ${line}`);
    assertEquals([r!.what, r!.where, r!.lang], [what, where, "en"], line);
  }
});

Deno.test("parsing: ten cities in Chinese", () => {
  const cases: [string, string, string, string][] = [
    ["奶茶店，纽约法拉盛", "奶茶店", "Flushing, NY", "纽约法拉盛"],
    ["我想在加州尔湾开火锅店", "火锅店", "Irvine, CA", "加州尔湾"],
    ["休斯顿的面包店", "面包店", "Houston, TX", "休斯顿"],
    ["在圣何塞开一家咖啡店", "咖啡店", "San Jose, CA", "加州圣何塞"],
    ["布鲁克林 饺子馆", "饺子馆", "Brooklyn, NY", "纽约布鲁克林"],
    ["芝加哥的奶茶店", "奶茶店", "Chicago, IL", "芝加哥"],
    ["西雅图开美甲店", "美甲店", "Seattle, WA", "西雅图"],
    ["波士顿超市", "超市", "Boston, MA", "波士顿"],
    ["你好，拉斯维加斯开拉面馆", "拉面馆", "Las Vegas, NV", "拉斯维加斯"],
    ["亚特兰大 火锅店", "火锅店", "Atlanta, GA", "亚特兰大"],
  ];
  for (const [line, what, where, zh] of cases) {
    const r = readStart(line);
    assert(r, `reads: ${line}`);
    assertEquals([r!.what, r!.where, r!.whereZh, r!.lang], [what, where, zh, "zh"], line);
  }
});

Deno.test("parsing: lines that don't say what and where", () => {
  for (const junk of ["hello??", "hi is this the permit place", "What's the weather in Flushing, NY?", "Flushing, NY", "I love New York", "STOP", "123456",
    "milk tea shop", "a bakery somewhere nice", "你好", "法拉盛", "help me", "", "   ", "x".repeat(300), "Is the DMV open in Houston?", "who is this"]) {
    assertEquals(readStart(junk), null, JSON.stringify(junk.slice(0, 40)));
  }
  // a question about a kind of business it knows reads as that kind, in the chips' words
  assertEquals(readStart("Can you help with my restaurant in Houston?")?.what, "Restaurant");
  assertEquals(readStart("Milk tea shop in Flushing, NY. We're already open")?.open, true);
});

Deno.test("parsing: the same line always reads the same way, and builds the same plan", () => {
  const a = planForText("Milk tea shop in Flushing, NY", NOW)!, b = planForText("Milk tea shop in Flushing, NY", NOW)!;
  assertEquals(a.facts, b.facts);
  assertEquals(a.name, "Milk tea shop in Flushing");
  assert(a.facts.permits >= 5 && a.facts.first.length === 3, "a real plan from the registry");
  const st = a.state as { apps: { id: string; preview?: boolean }[]; stores: { id: string; apps: string[] }[]; firstPlan: { apps: number; where: string } };
  assertEquals(st.apps.length, a.facts.permits);
  assert(st.apps.every((x) => x.preview === true), "every row is a preview row, as on the first screen");
  assertEquals(st.stores[0].apps, st.apps.map((x) => x.id));
  assertEquals(st.firstPlan.where, "Flushing, NY");
  assertEquals(planForText("hello", NOW), null);
});

/* ------------------------------ the replies ------------------------------ */

const LINK = startLink("https://placetta.com", "AbCdEfGhJk.1761400000.AbCdEfGhIjKlMnOp");
const reply = (line: string, channel: StartChannel) => {
  const p = planForText(line, NOW)!;
  return planReply({ channel, lang: p.line.lang, what: p.line.what, where: p.line.where, whereZh: p.line.whereZh, link: LINK, facts: p.facts });
};

Deno.test("reply: SMS stays under 320 characters, with the count, three steps, agencies, fees, time and link", () => {
  const lines = ["Milk tea shop in Flushing, NY", "Hot pot restaurant in Irvine, CA", "Bakery in Houston TX", "Coffee shop in Seattle", "Nail salon in Springfield, IL",
    "Dumpling house in Brooklyn", "Grocery store in Boston", "Ramen restaurant in Las Vegas, NV", "Boba shop in Chicago, IL", "Pet grooming shop in Austin, TX",
    "奶茶店，纽约法拉盛", "我想在加州尔湾开火锅店", "休斯顿的面包店", "芝加哥的咖啡店", "西雅图开美甲店", "Authentic hand pulled noodle and dumpling restaurant in San Francisco, CA"];
  for (const l of lines) {
    const t = reply(l, "sms");
    assert(t.length <= SMS_MAX, `${t.length} characters: ${t}`);
    assert(t.includes(LINK), "the link, whole");
    assert(/STOP/.test(t), "how to stop");
    assert(!/[•·—]/.test(t), "no bullets, dots or em dashes");
    assert(!/\b0\d/.test(t.replace(LINK, "")), "no leading zeros");
  }
  const en = reply("Milk tea shop in Flushing, NY", "sms");
  const p = planForText("Milk tea shop in Flushing, NY", NOW)!;
  assert(en.startsWith(`Placetta: Milk tea shop in Flushing, NY needs ${p.facts.permits} permits.`), en);
  assert(/1\) Articles of Organization, NY Dept of State, \$200; 2\) EIN, IRS, free; 3\) /.test(en), en);
  assert(/About \d+ months to open\./.test(en), en);
  const zh = reply("奶茶店，纽约法拉盛", "sms");
  assert(zh.startsWith(`快哉：在纽约法拉盛开奶茶店需要 ${p.facts.permits} 项许可。`), zh);
  assert(/1）组织章程，纽约州务院公司处，\$200；2）/.test(zh) && /预计约 \d+ 个月可开业/.test(zh) && /回复 STOP 退订/.test(zh), zh);
});

Deno.test("reply: iMessage, WhatsApp and WeChat are fuller, on several lines", () => {
  const im = reply("Milk tea shop in Flushing, NY", "imessage"), wa = reply("Milk tea shop in Flushing, NY", "whatsapp"), wx = reply("奶茶店，纽约法拉盛", "wechat");
  for (const t of [im, wa, wx]) {
    assert(t.split("\n").length >= 8, "steps on their own lines");
    assert(t.includes(LINK) && !/[•·—]/.test(t), t);
    assert(t.length < 1200, "one message");
  }
  assert(/^1\. Articles of Organization\nNew York Department of State, Division of Corporations, \$200$/m.test(im), im);
  assert(!/\*/.test(im), "no markdown on iMessage");
  assert(/needs \*\d+ permits\*/.test(wa) && /^1\. \*Articles of Organization\*$/m.test(wa), "WhatsApp bold");
  assert(/Reply REMIND ME for one reminder tomorrow, or STOP to opt out\./.test(im), im);
  assert(!/STOP/.test(wx) && /回复“提醒我”/.test(wx) && /链接 7 天内有效/.test(wx), "WeChat has no STOP keyword");
  assert(new TextEncoder().encode(wx).length < 2048, "inside WeChat's passive reply limit");
  const imZh = reply("奶茶店，纽约法拉盛", "imessage");
  assert(/回复 STOP 退订。$/.test(imZh), imZh);
});

Deno.test("reply: the one question, fees, agencies and time, in both languages", () => {
  assertEquals(askReply("sms", "en"), "Placetta: Hi, this is Odelia. What are you opening, and where? e.g. Milk tea shop in Flushing, NY. I'll text back the permits you need. Reply STOP to opt out.");
  assert(askReply("sms", "zh").includes("您要开什么店？开在哪里？例如：奶茶店，纽约法拉盛") && askReply("sms", "zh").includes("STOP"));
  assert(!askReply("wechat", "en").includes("STOP"));
  assertEquals([feeSay(200, "USD", "en"), feeSay(0, "USD", "en"), feeSay(null, "USD", "en"), feeSay(12.5, "USD", "en"), feeSay(0, "USD", "zh"), feeSay(null, "USD", "zh")],
    ["$200", "free", "fee set by the agency", "$12.50", "免费", "费用由机构核定"]);
  assertEquals(agencyShort("New York Department of State, Division of Corporations", "en"), "NY Dept of State");
  assertEquals(agencyShort("Internal Revenue Service", "en"), "IRS");
  assertEquals(agencyShort("California Department of Tax and Fee Administration", "en"), "CA Dept of Tax and Fee Administration");
  assertEquals(agencyShort("美国国税局（IRS）", "zh"), "美国国税局");
  assertEquals([timeSay({ days: 20, open: false }, "en"), timeSay({ days: 116, open: false }, "en"), timeSay({ days: 7, open: false }, "zh"), timeSay({ days: 200, open: false }, "zh"), timeSay({ days: 100, open: true }, "en"), timeSay({ days: null, open: false }, "en")],
    ["About 3 weeks to open", "About 4 months to open", "预计约 1 周可开业", "预计约 7 个月可开业", null, null]);
});

/* ------------------------------ the claim link ------------------------------ */

Deno.test("claim link: signed, checked, and refused when changed, forged or expired", async () => {
  const id = newStartId(), exp = Math.floor(NOW.getTime() / 1000) + START_DAYS * 86400;
  assert(/^[A-Za-z0-9]{10}$/.test(id) && newStartId() !== id);
  const tok = await signStart(SECRET, id, exp);
  assert(/^[A-Za-z0-9]{10}\.\d{10}\.[A-Za-z0-9_-]{16}$/.test(tok), tok);
  assertEquals(await verifyStart(SECRET, tok, NOW.getTime() / 1000), { id, exp });
  assertEquals(await verifyStart(SECRET, tok, exp + 1), null, "a day past 7 days");
  assertEquals(await verifyStart("another-secret-entirely-0123456789", tok, NOW.getTime() / 1000), null, "another secret");
  const [a, b, c] = tok.split(".");
  assertEquals(await verifyStart(SECRET, `${a}.${Number(b) + 86400}.${c}`, NOW.getTime() / 1000), null, "a later expiry written in");
  assertEquals(await verifyStart(SECRET, `${a.slice(0, 9)}${a[9] === "x" ? "y" : "x"}.${b}.${c}`, NOW.getTime() / 1000), null, "another start's id");
  assertEquals(await verifyStart(SECRET, `${a}.${b}.${c.slice(0, 15)}${c[15] === "A" ? "B" : "A"}`, NOW.getTime() / 1000), null, "a changed signature");
  for (const bad of ["", "nonsense", `${a}.${b}`, `${a}..${c}`, tok + "x", ` ${tok} x`]) assertEquals(await verifyStart(SECRET, bad, NOW.getTime() / 1000), null, bad);
  // the database signs the same way (supabase/tests/text_start.sql checks this exact token)
  assertEquals(await signStart("test-monitor-key", "AbCdEfGhJk", 1893456000), "AbCdEfGhJk.1893456000.EwczhPtP0QQwO2J3");
  assertEquals(startLink("https://placetta.com/", tok), `https://placetta.com/app/?s=${tok}`);
});

/* ------------------------------ one text, start to answer ------------------------------ */

/** Stand-ins for the database: rate_hit's sliding windows, the pending starts, the consent log, a claim. */
function stand(o: { save?: boolean } = {}) {
  let clock = NOW.getTime();
  const hits = new Map<string, number[]>();
  const starts = new Map<string, { handle: string; exp: number; what: string; where: string; lang: "en" | "zh"; remindAt: Date | null; claimed: boolean; tz: string }>();
  const consents: string[] = [];
  const halves = new Map<string, { what?: string; where?: string }>();
  const deps: StartDeps = {
    hit: async (k, limit, win) => {
      const arr = (hits.get(k) ?? []).filter((t) => t > clock - win * 1000);
      if (arr.length >= limit) { hits.set(k, arr); return false; }
      hits.set(k, [...arr, clock]);
      return true;
    },
    open: async (handle) => {
      const s = [...starts.entries()].reverse().find(([, v]) => v.handle === handle && !v.claimed && v.exp * 1000 > clock);
      return s ? { id: s[0], exp: s[1].exp, what: s[1].what, where: s[1].where, lang: s[1].lang, remindAsked: !!s[1].remindAt, tz: s[1].tz } : null;
    },
    save: async (s) => { if (o.save === false) return false; starts.set(s.id, { handle: "", exp: s.exp, what: s.plan.line.what, where: s.plan.line.where, lang: s.plan.line.lang, remindAt: null, claimed: false, tz: s.tz }); return true; },
    remind: async (id, at) => { const s = starts.get(id); if (s && !s.remindAt) s.remindAt = at; },
    consent: async (e) => { consents.push(e); },
    secret: async () => SECRET,
    origin: "https://placetta.com",
    plan: (text, at) => planForText(text, at),
    part: (text) => readPart(text),
    parts: { get: async (h) => halves.get(h) ?? null, set: async (h, p) => { if (p) halves.set(h, p); else halves.delete(h); } },
  };
  const send = async (handle: string, text: string, channel: StartChannel = "sms", extra: Partial<Parameters<typeof textStart>[0]> = {}) => {
    const r = await textStart({ channel, handle, text, now: new Date(clock), ...extra }, deps);
    if (r.id && starts.get(r.id)?.handle === "") starts.get(r.id)!.handle = handle;
    return r;
  };
  /** what the database's claim does: the token's signature and expiry, then once only */
  const claim = async (link: string) => {
    const v = await verifyStart(SECRET, link.split("?s=")[1] ?? "", clock / 1000);
    const s = v ? starts.get(v.id) : undefined;
    if (!s) return "start_invalid";
    if (s.claimed) return "start_used";
    s.claimed = true;
    return "ok";
  };
  return { deps, send, claim, starts, consents, hits, halves, later: (ms: number) => { clock += ms; } };
}
const PHONE = "+16465550199", PHONE2 = "+17185550111";

Deno.test("a line that reads gets the plan and a link that works once", async () => {
  const s = stand();
  const r = await s.send(PHONE, "Milk tea shop in Flushing, NY");
  assertEquals([r.kind, r.lang], ["plan", "en"]);
  assert(r.reply!.includes(r.link!) && r.reply!.length <= SMS_MAX, r.reply!);
  assertEquals(s.consents, ["texted_to_start"]);
  assertEquals(await s.claim(r.link!), "ok");
  assertEquals(await s.claim(r.link!), "start_used", "single use");
  s.later(8 * 86400e3);
  const r2 = await s.send(PHONE, "Bakery in Houston TX");
  assertEquals(await s.claim(r2.link!.replace(/\.(\d+)\./, (_m, e) => `.${Number(e) - 86400 * 9}.`)), "start_invalid", "an old expiry written in");
  s.later(START_DAYS * 86400e3 + 1000);
  assertEquals(await s.claim(r2.link!), "start_invalid", "expired after 7 days");
  // Chinese in, Chinese out
  const z = await s.send(PHONE2, "奶茶店，纽约法拉盛", "whatsapp");
  assertEquals([z.kind, z.lang], ["plan", "zh"]);
  assert(z.reply!.startsWith("快哉：在纽约法拉盛开奶茶店需要"), z.reply!);
});

Deno.test("a line that doesn't read gets one question, once; then nothing", async () => {
  const s = stand();
  const a = await s.send(PHONE, "hi is this the permit place");
  assertEquals(a.kind, "ask");
  assert(a.reply!.includes("What are you opening, and where? e.g. Milk tea shop in Flushing, NY"));
  assertEquals((await s.send(PHONE, "hello??")).reply, null, "asked once");
  assertEquals((await s.send(PHONE, "你好")).reply, null);
  // then the line itself
  const p = await s.send(PHONE, "Bakery in Houston TX");
  assertEquals(p.kind, "plan");
  // with a plan out, small talk gets nothing (no follow-ups)
  assertEquals((await s.send(PHONE, "thanks!")).kind, "quiet");
  s.later(91 * 86400e3);
  assertEquals((await s.send(PHONE, "what?")).kind, "ask", "asked again after 90 days");
  assertEquals((await s.send(PHONE2, "你好")).reply, askReply("sms", "zh"), "in their language");
});

Deno.test("half a line, then the other half after the question, makes the whole line", async () => {
  assertEquals(readPart("I want to open a milk tea shop"), { what: "Milk tea shop" });
  assertEquals(readPart("Flushing"), { where: "Flushing, NY" });
  assertEquals(readPart("Springfield, IL"), { where: "Springfield, IL" });
  assertEquals(readPart("法拉盛"), { where: "Flushing, NY" });
  assertEquals(readPart("我想开奶茶店"), { what: "奶茶店" });
  assertEquals(readPart("hello"), {});
  const s = stand();
  const a = await s.send(PHONE, "I want to open a milk tea shop");
  assertEquals(a.kind, "ask");
  assertEquals(s.halves.get(PHONE), { what: "Milk tea shop" }, "only what was read is kept");
  const b = await s.send(PHONE, "Flushing");
  assertEquals(b.kind, "plan");
  assert(b.reply!.startsWith("Placetta: Milk tea shop in Flushing, NY needs"), b.reply!);
  assertEquals(s.halves.has(PHONE), false, "let go once the plan is out");
  // the place first, in Chinese, then the business
  const z = stand();
  assertEquals((await z.send(PHONE2, "法拉盛")).kind, "ask");
  const zz = await z.send(PHONE2, "奶茶店");
  assertEquals([zz.kind, zz.lang], ["plan", "zh"]);
  assert(zz.reply!.startsWith("快哉：在纽约法拉盛开奶茶店需要"), zz.reply!);
});

Deno.test("remind me: one reminder, the next day at 10am where the business is", async () => {
  const s = stand();
  assertEquals((await s.send(PHONE, "remind me")).kind, "ask", "no plan yet: the question");
  const p = await s.send(PHONE, "Hot pot restaurant in Irvine, CA");
  const r = await s.send(PHONE, "Remind me tomorrow");
  assertEquals([r.kind, r.id], ["remind", p.id]);
  assert(/once more tomorrow at 10am/.test(r.reply!));
  assertEquals(s.starts.get(p.id!)!.remindAt!.toISOString(), "2026-10-19T17:00:00.000Z", "10am in California");
  const again = await s.send(PHONE, "remind me");
  assert(/already set/.test(again.reply!) && s.starts.get(p.id!)!.remindAt!.toISOString() === "2026-10-19T17:00:00.000Z", "never a second one");
  assertEquals(s.consents, ["texted_to_start", "texted_to_start", "asked_reminder"], "the question, the plan, the reminder");
  for (const yes of ["remind me", "Remind me later", "reminder", "please remind me", "提醒我", "明天提醒我"]) assert(wantsReminder(yes), yes);
  for (const no of ["remind me about the EIN form", "don't remind me", "提醒我开店的事情"]) assert(!wantsReminder(no), no);
  // when, and quiet hours
  assertEquals(reminderAt(new Date("2026-10-18T03:00:00Z"), "America/New_York").toISOString(), "2026-10-18T14:00:00.000Z", "11pm in New York: 10am the next local day");
  assertEquals(reminderAt(new Date("2026-11-01T02:00:00Z"), "America/Chicago").toISOString(), "2026-11-01T16:00:00.000Z", "across the end of daylight time");
  assertEquals(stateTz("CA"), "America/Los_Angeles");
  assertEquals(stateTz("NY"), "America/New_York");
  assert(reminderMayGo(new Date("2026-10-19T17:00:00Z"), new Date("2026-10-19T17:05:00Z"), "America/Los_Angeles"));
  assert(!reminderMayGo(new Date("2026-10-19T17:00:00Z"), new Date("2026-10-19T16:55:00Z"), "America/Los_Angeles"), "not before it's due");
  assert(!reminderMayGo(new Date("2026-10-19T17:00:00Z"), new Date("2026-10-20T06:00:00Z"), "America/Los_Angeles"), "11pm there: quiet hours");
  const t = reminderText({ channel: "sms", lang: "en", what: "Hot pot restaurant", where: "Irvine, CA", link: LINK, exp: 1761400000, tz: "America/Los_Angeles" });
  assert(t.includes(LINK) && /works until Oct 25/.test(t) && /STOP/.test(t), t);
  assert(/链接在 10\/25 前有效|链接在 10月25日 前有效/.test(reminderText({ channel: "wechat", lang: "zh", what: "火锅店", where: "加州尔湾", link: LINK, exp: 1761400000, tz: "America/Los_Angeles" })));
});

Deno.test("rate limits: per number an hour and a day, and across everyone", async () => {
  const s = stand();
  const lines = ["Milk tea shop in Flushing, NY", "Bakery in Houston TX", "Coffee shop in Seattle", "Hot pot restaurant in Irvine, CA", "Boba shop in Chicago, IL"];
  const out = [];
  for (const l of lines) out.push((await s.send(PHONE, l)).kind);
  assertEquals(out, ["plan", "plan", "plan", "plan", "limited"], `${START_LIMITS.perHour} an hour`);
  s.later(3600e3 + 1000);
  for (const l of lines) out.push((await s.send(PHONE, l)).kind);
  assertEquals(out.slice(5), ["plan", "plan", "plan", "plan", "limited"], `${START_LIMITS.perDay} a day`);
  s.later(3600e3 + 1000);
  assertEquals((await s.send(PHONE, lines[0])).kind, "limited", "the day's 8 are used");
  // everyone together: a low global limit for the test
  const g = stand();
  const kinds = [];
  for (let i = 0; i < 4; i++) kinds.push((await g.send(`+1646555${String(1000 + i)}`, lines[i], "sms", { globalPerHour: 3 })).kind);
  assertEquals(kinds, ["plan", "plan", "plan", "limited"]);
  // the question doesn't spend the limit when it's been asked already
  const q = stand();
  await q.send(PHONE, "hello");
  for (let i = 0; i < 10; i++) await q.send(PHONE, "hello?");
  assertEquals((await q.send(PHONE, lines[0])).kind, "plan");
});

Deno.test("STOP, START and HELP are never read as a business; other countries get nothing", async () => {
  const s = stand();
  for (const k of ["STOP", "stop", "Stop.", "UNSUBSCRIBE", "退订", "please stop texting me", "START", "HELP", "帮助"]) {
    const r = await s.send(PHONE, k);
    assertEquals([r.kind, r.reply], ["keyword", null], k);
  }
  assertEquals(s.consents.length, 0);
  for (const n of ["+447700900123", "+18765550123", "+5511999990000"]) assertEquals((await s.send(n, "Milk tea shop in Flushing, NY")).kind, "country", n);
  assertEquals((await s.send("+8613800138000", "奶茶店，纽约法拉盛")).kind, "plan", "mainland China mobiles are in");
  assertEquals((await s.send("+447700900123", "Milk tea shop in Flushing, NY", "sms", { countries: ["1", "44"] })).kind, "plan", "a country the founder added");
  // WeChat has no number and costs nothing: no country rule
  assertEquals((await s.send("wx:oUpF8uMuAJO_M2pxb1Q9zNjWeS6o", "奶茶店，纽约法拉盛", "wechat")).kind, "plan");
  // a start that couldn't be saved sends nothing rather than a link that won't work
  assertEquals((await stand({ save: false }).send(PHONE, "Milk tea shop in Flushing, NY")).kind, "failed");
});

/* ------------------------------ the website's line ------------------------------ */

Deno.test("the website shows where to text only once the founder sets the public number", () => {
  const base: Record<string, string> = { TELNYX_API_KEY: "k", TELNYX_PUBLIC_KEY: "p", ODELIA_NUMBER: "+12125550100", TELNYX_MESSAGING_PROFILE_ID: "mp" };
  const env = (o: Record<string, string>) => (k: string) => ({ ...base, ...o })[k];
  assertEquals(publicStart(env({})), null, "off by default");
  assertEquals(publicStart(env({ ODELIA_PUBLIC_NUMBER: "+12125550100" })), { number: "+12125550100", display: "+1 (212) 555-0100", whatsapp: null, whatsapp_display: null, wechat: null });
  assertEquals(publicStart(env({ ODELIA_PUBLIC_NUMBER: "+13105550199" })), null, "a number that doesn't reach Odelia is never shown");
  assertEquals(publicStart(env({ ODELIA_PUBLIC_NUMBER: "+12125550100", ODELIA_TEXT_START: "off" })), null);
  const wa = { WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_APP_SECRET: "s", WHATSAPP_VERIFY_TOKEN: "v", WHATSAPP_NUMBER: "+14155550111" };
  assertEquals(publicStart(env({ ...wa, ODELIA_PUBLIC_WHATSAPP: "+14155550111" }))?.whatsapp, "+14155550111");
  assertEquals(publicStart(env({ ...wa, ODELIA_PUBLIC_WHATSAPP: "+14155550999" })), null, "not Odelia's WhatsApp");
  assertEquals(publicStart(env({ ODELIA_PUBLIC_NUMBER: "+12125550100", ODELIA_PUBLIC_WECHAT: "placetta", ODELIA_PUBLIC_WECHAT_WS: "11111111-2222-3333-4444-555555555555" }))?.wechat, "placetta");
  assertEquals(publicStart(env({ ODELIA_PUBLIC_WECHAT: "placetta", ODELIA_PUBLIC_WECHAT_WS: "11111111-2222-3333-4444-555555555555" })), null, "WeChat alone doesn't turn it on");
});

/* ------------------------------ Placetta's WeChat account ------------------------------ */

Deno.test("WeChat: on Placetta's public account a follower who isn't on the team texts to start", async () => {
  const TOKEN = "AAAAA", APPID = "wxba5fad812f8e6fb9", KEY = "A".repeat(43), OPENID = "oUpF8uMuAJO_M2pxb1Q9zNjWeS6o";
  const bot = { app_id: APPID, token: TOKEN, aes_key: KEY };
  const now = 1_760_000_000_000;
  const push = async (o: { content?: string; event?: string; msgId: string }) => {
    const ts = String(Math.floor(now / 1000)), nonce = "1320562132";
    const inner = o.event ? `<xml><ToUserName><![CDATA[gh_placetta]]></ToUserName><FromUserName><![CDATA[${OPENID}]]></FromUserName><CreateTime>${ts}</CreateTime><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[${o.event}]]></Event></xml>`
      : `<xml><ToUserName><![CDATA[gh_placetta]]></ToUserName><FromUserName><![CDATA[${OPENID}]]></FromUserName><CreateTime>${ts}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${o.content}]]></Content><MsgId>${o.msgId}</MsgId></xml>`;
    const sealed = await wxEncrypt(KEY, inner, APPID);
    const q = new URLSearchParams({ timestamp: ts, nonce, msg_signature: await wxSign(TOKEN, ts, nonce, sealed), encrypt_type: "aes" });
    return { q, body: `<xml><ToUserName><![CDATA[gh_placetta]]></ToUserName><Encrypt><![CDATA[${sealed}]]></Encrypt></xml>` };
  };
  const seen = new Set<string>();
  const s = stand();
  const deps: WxDeps = {
    firstTime: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
    claim: async () => "wrong", sender: async () => null, start: () => { throw new Error("no run for a stranger"); }, notTeammate: NOT_TEAMMATE,
    welcome: WX_SAY.startWelcome,
    stranger: async (openid, text) => (await s.send(`wx:${openid}`, text, "wechat")).reply,
  };
  const open = async (r: { body: string }) => {
    const enc = /<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/.exec(r.body)?.[1] ?? "";
    const { wxDecrypt } = await import("./wechat.ts");
    return /<Content><!\[CDATA\[([\s\S]*?)\]\]><\/Content>/.exec((await wxDecrypt(KEY, enc, APPID)) ?? "")?.[1] ?? "";
  };
  let p = await push({ event: "subscribe", msgId: "" });
  assert((await open(await wxHandle(bot, p.q, p.body, deps, now))).includes("奶茶店，纽约法拉盛"), "the welcome invites the one line");
  p = await push({ content: "奶茶店，纽约法拉盛", msgId: "1" });
  const plan = await open(await wxHandle(bot, p.q, p.body, deps, now));
  assert(plan.startsWith("快哉：在纽约法拉盛开奶茶店需要") && plan.includes("https://placetta.com/app/?s="), plan);
  p = await push({ content: "谢谢", msgId: "2" });
  assertEquals((await wxHandle(bot, p.q, p.body, deps, now)).body, "success", "nothing more unless asked");
  // another business's account keeps its note for strangers
  const other = { ...deps, stranger: undefined, welcome: undefined };
  p = await push({ content: "奶茶店，纽约法拉盛", msgId: "3" });
  assertEquals(await open(await wxHandle(bot, p.q, p.body, other, now)), WX_SAY.unknown);
});
