// npm run test:fda: checks scripts/fda-leads.mjs against a fixture shaped like the FDA Data Dashboard API's documented
// import_refusals response (https://datadashboard.fda.gov/oii/api/index.htm). The firms in the fixture are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchRows, build, csv, charges, COLS, SETUP } from "./fda-leads.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/fda-import-refusals.json", import.meta.url), "utf8"));
const NOW = Date.parse("2026-10-12T12:00:00Z");
const COUNTRIES = ["CN", "HK", "TW", "KR", "JP", "VN", "TH", "SG", "MY"];
const run = (o = {}) => build(fixture.result, { products: [], countries: COUNTRIES, now: NOW, ...o });
const firm = (rows, s) => rows.find(r => r.firm.includes(s));

test("fetchRows sends the documented request and pages until a short page", async () => {
  const calls = [];
  const page1 = { statuscode: 400, message: "Success.", resultcount: 5000, result: Array(5000).fill(fixture.result[0]) };
  const fake = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => (calls.length === 1 ? page1 : fixture) };
  };
  const rows = await fetchRows({ days: 14, countries: ["CN", "TW"], user: "ops@placetta.com", key: "k3y", now: NOW, fetch: fake });
  assert.equal(rows.length, 5000 + fixture.result.length);
  assert.equal(calls.length, 2);
  const { url, init, body } = calls[0];
  assert.equal(url, "https://api-datadashboard.fda.gov/v1/import_refusals");
  assert.equal(init.method, "POST");
  assert.deepEqual(init.headers, { "Content-Type": "application/json", "Authorization-User": "ops@placetta.com", "Authorization-Key": "k3y" });
  assert.deepEqual(body.filters, { RefusalDateFrom: ["2026-09-28"], CountryCode: ["CN", "TW"] });
  assert.equal(body.sort, "RefusalDate");
  assert.equal(body.sortorder, "desc");
  assert.equal(body.rows, 5000);
  assert.equal(body.start, 1);
  assert.equal(calls[1].body.start, 5001);
  for (const c of ["FEINumber", "FirmName", "CountryCode", "ProductCodeDescription", "RefusalDate", "RefusalCharges", "FirmProfile"]) assert.ok(body.columns.includes(c), c);
});

test("fetchRows: no results (412) is an empty list, missing or bad credentials explain setup", async () => {
  const say = j => async () => ({ ok: true, status: 200, json: async () => j });
  assert.deepEqual(await fetchRows({ user: "a", key: "b", fetch: say({ statuscode: 412, message: "No results found." }) }), []);
  await assert.rejects(fetchRows({ user: "", key: "", fetch: say(fixture) }), e => e.message === SETUP && /FDA_DD_USER/.test(e.message) && /FDA_DD_KEY/.test(e.message));
  await assert.rejects(fetchRows({ user: "a", key: "b", fetch: say({ statuscode: 401, message: "Not Authorized." }) }), /Not Authorized.*FDA_DD_KEY/s);
  await assert.rejects(fetchRows({ user: "a", key: "b", fetch: say({ statuscode: 413, message: "Invalid fieldname in filters." }) }), /413: Invalid fieldname/);
});

test("charges translate FDA charge ids, names and NAME-id, and never guess unknown codes", () => {
  assert.deepEqual(charges("218, 482").map(c => c.name), ["LIST INGRE", "NUTRIT LBL"]);
  assert.equal(charges("62")[0].en, "no canned food plant registration (FCE) with FDA");
  assert.equal(charges("NO PROCESS")[0].code, "83");
  assert.equal(charges("FSVP VIO-3886")[0].kind, "file");
  assert.equal(charges("9")[0].fix, false);
  const u = charges("9999")[0];
  assert.equal(u.unknown, true);
  assert.equal(u.en, "FDA charge 9999");
  assert.deepEqual(charges(null), []);
});

test("build groups by FEI, drops other countries, and ranks", () => {
  const rows = run();
  assert.deepEqual(rows.map(r => [r.rank, r.firm]), [
    [1, "Chiang Mai Fruit Co., Ltd."],                // allergen label, 10-10
    [1, "Fujian Xinghe Food Co., Ltd."],              // ingredient + nutrition label, 10-08
    [1, "Kaohsiung Cannery Corp."],                   // FCE + scheduled process, 10-07
    [2, "Nam Viet Seafood Joint Stock Company"],      // salmonella this week
    [3, "Uji Matcha En Co., Ltd."],                   // FSVP, 10-01 (older than 7 days)
    [3, "Seoul \"Good\" Snacks, Inc."],               // no FEI, grouped by name
  ]);
  assert.ok(!rows.some(r => r.country === "Mexico"));
  const fj = firm(rows, "Fujian");
  assert.equal(fj.shipments, 3);
  assert.equal(fj.fei, "3012345678");
  assert.equal(fj.refused, "2026-10-08");
  assert.equal(fj.product, "Rice Noodles, Dry");
  assert.equal(fj.fixable, "yes");
  assert.equal(fj.charges, "LIST INGRE (218); NUTRIT LBL (482); NO ENGLISH (324); SALMONELLA (9)");
  assert.match(fj.reason, /ingredient list.*Nutrition Facts.*salmonella/);
  assert.equal(fj.address, "No. 8 Jinshan Road, Huli District, Xiamen, 361000");
  assert.equal(fj.shipment_ids, "BWE-5521134-7/2/1; BWE-5521134-7/2/2; BWE-5519002-1/1/1");
  assert.equal(fj.fda_profile, "https://datadashboard.fda.gov/oii/fd/fdprofile.htm?FEIs=3012345678");
  assert.equal(fj.search, "https://www.google.com/search?q=" + encodeURIComponent('"Fujian Xinghe Food Co., Ltd." Xiamen China website phone'));
  assert.equal(firm(rows, "Uji").trigger, "Refused recently, a filing or label we fix");
  assert.equal(firm(rows, "Nam Viet").trigger, "Refused this week");
  const kr = firm(rows, "Seoul");
  assert.equal(kr.fei, "");
  assert.equal(kr.reason, "FDA charge 9999; filth or decomposition");
});

test("product and country filters", () => {
  assert.deepEqual(run({ products: ["mango"] }).map(r => r.firm), ["Chiang Mai Fruit Co., Ltd."]);
  const noodles = run({ products: ["noodle"] });
  assert.equal(noodles.length, 1);
  assert.equal(noodles[0].shipments, 2);   // the rice cracker line is not a noodle
  assert.deepEqual(run({ countries: ["TW"] }).map(r => r.firm), ["Kaohsiung Cannery Corp."]);
  assert.equal(run({ countries: [] }).length, 7);   // no filter keeps Mexico too
});

test("openers in English and Chinese, per kind of fix, no em dashes", () => {
  const rows = run();
  const tw = firm(rows, "Kaohsiung");
  assert.equal(tw.opener_en, "Hi, is this the person who handles US shipments at Kaohsiung Cannery Corp.? FDA refused your bamboo shoots shipment on 2026-10-07 for no canned food plant registration (FCE) with FDA and no scheduled process filed with FDA. We fix that filing and keep every FDA registration current so the next one clears. Can I send you what to fix?");
  assert.equal(tw.opener_zh, "您好，请问是Kaohsiung Cannery Corp.负责美国出货的同事吗？FDA在2026年10月7日拒绝了贵司的蔬菜制品货物，原因是工厂未在FDA办理罐头食品工厂登记（FCE），以及未向FDA备案罐头食品的杀菌工艺（SID）。我们帮您改好这项申报，并让贵司所有FDA注册保持有效，下一批就能顺利通关。我把需要修改的内容发给您可以吗？");
  const fj = firm(rows, "Fujian");
  assert.match(fj.opener_en, /your rice noodles shipment on 2026-10-08 for a label missing the ingredient list and a label missing the Nutrition Facts panel\. We fix that label/);
  assert.match(fj.opener_zh, /2026年10月8日拒绝了贵司的面条制品货物，原因是标签缺少配料表，以及标签缺少营养成分表。我们帮您改好标签/);
  const vn = firm(rows, "Nam Viet");
  assert.match(vn.opener_en, /for salmonella\. That one is about the product itself/);
  assert.match(vn.opener_zh, /水产品货物，原因是检出沙门氏菌。这一项涉及产品本身/);
  assert.match(firm(rows, "Seoul").opener_en, /for filth or decomposition\./);   // the unknown code stays out of the opener
  for (const r of rows) for (const s of [r.opener_en, r.opener_zh, r.reason, r.trigger]) assert.ok(!/[\u2014\u2013]/.test(s), s);
});

test("CSV escapes quotes, commas and newlines and keeps the column order", () => {
  const rows = run();
  const out = csv(rows);
  const lines = out.split("\n");
  assert.equal(lines[0], COLS.join(","));
  assert.ok(COLS.includes("opener_en") && COLS.includes("opener_zh") && COLS.includes("search"));
  assert.equal(lines.length, rows.length + 1);
  assert.ok(out.includes('"Seoul ""Good"" Snacks, Inc."'));
  assert.ok(lines[1].startsWith('"1","Refused this week, a filing or label we fix","Chiang Mai Fruit Co., Ltd.","3001110002","Thailand"'));
  const one = COLS.map(c => (c === "rank" ? '"1"' : c === "firm" ? '"a ""b""\nc, d"' : '""')).join(",");
  assert.equal(csv([{ rank: 1, firm: 'a "b"\nc, d' }]), `${COLS.join(",")}\n${one}`);
});
