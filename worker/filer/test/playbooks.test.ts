// npm test (no browser needed for these): the playbooks match the destinations they drive, cite their guides, and
// stay unverified until staff watch a first run.
import { test } from "node:test";
import assert from "node:assert";
import { DEST } from "../../../supabase/functions/file/destinations.ts";
import type { PageState } from "../src/guards.ts";
import { routeOf } from "../src/main.ts";
import { finalOn, guideLines, navOn, pageOutline, payOn, playbookFor, PLAYBOOKS } from "../src/playbooks.ts";

const onHost = (url: string, host: string) => { const h = new URL(url).hostname; return h === host || h.endsWith("." + host); };
const state = (heading: string): PageState => ({ url: "https://x.gov/", title: heading, headings: [heading], controls: [], buttons: [], links: [], text: "", frames: [], markers: [] });

// Portals with three or more forms whose only published guides are videos, so there's nothing written to follow.
const VIDEO_ONLY = new Set(["plus.fairfaxcounty.gov"]);

test("every portal three or more forms use has a playbook, and the state formation portals with written guides too", () => {
  assert.equal(PLAYBOOKS.length, 15);
  assert.equal(new Set(PLAYBOOKS.map((p) => p.host)).size, PLAYBOOKS.length, "one playbook per portal");
  const count = new Map<string, number>();
  for (const d of Object.values(DEST)) if (d.portal) count.set(d.portal, (count.get(d.portal) ?? 0) + 1);
  for (const [host, n] of count) {
    if (n >= 3 && !VIDEO_ONLY.has(host)) assert.ok(PLAYBOOKS.some((p) => p.host === host), `${host} has ${n} forms and no playbook`);
  }
  for (const p of PLAYBOOKS) assert.ok(Object.keys(p.forms).length >= 1 && (count.get(p.host) ?? 0) >= Object.keys(p.forms).length, p.host);
});

test("a guide's open-the-form button isn't a send, and a send button can never be listed as one", () => {
  const abc = PLAYBOOKS.find((p) => p.host === "abc.austintexas.gov")!;
  assert.equal(navOn(abc, state("My Inspections"), "Schedule Inspection"), true);
  assert.equal(navOn(abc, state("Schedule Inspection"), "Request Inspection"), false, "the guide's send button");
  assert.equal(navOn(abc, state("Schedule Inspection"), "Schedule Inspection"), false, "only on the page the guide names");
  for (const p of PLAYBOOKS) for (const n of p.nav ?? []) assert.ok(!p.final.some((f) => f.button && f.button.toLowerCase() === n.button.toLowerCase()), `${p.host}: ${n.button} is a send`);
});

test("every playbook is unverified until a supervised first run, and cites the guides it was written from", () => {
  for (const p of PLAYBOOKS) {
    assert.equal(p.verified, null, `${p.host}: verified only after staff watch its first run`);
    assert.ok(p.guides.length && p.guides.every((g) => g.startsWith("https://")), p.host);
    assert.match(p.read, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(p.final.length, `${p.host}: names the button that sends it`);
  }
});

test("each playbook form is a destination on that portal, and starts on the agency's own host", () => {
  for (const p of PLAYBOOKS) {
    for (const [id, f] of Object.entries(p.forms)) {
      const d = DEST[id];
      assert.ok(d, `${id} is a destination`);
      assert.equal(d.portal, p.host, `${id} is on ${p.host}`);
      assert.ok([d.portal!, ...(d.alsoOn ?? [])].some((h) => onHost(f.start, h)), `${id}: ${f.start}`);
      if (d.tenant) assert.ok(new URL(f.start).pathname.toLowerCase().startsWith(d.tenant.toLowerCase()), `${id}: starts at its agency's path`);
      assert.ok(f.steps.length >= 3 && f.steps.every((s) => s.note.trim().length > 10), id);
      assert.deepEqual(playbookFor(p.host, id)?.form, f);
    }
  }
  assert.equal(playbookFor("aca-prod.accela.com", "not-a-form"), null);
});

test("the guide's send button triggers the final-submit guard only on its page", () => {
  const aca = PLAYBOOKS.find((p) => p.host === "aca-prod.accela.com")!;
  assert.ok(finalOn(aca, state("Step 4: Review"), "Continue Application"));
  assert.ok(!finalOn(aca, state("Step 2: Work Location"), "Continue Application"));
  const sj = PLAYBOOKS.find((p) => p.host === "sjpermits.org")!;
  assert.ok(finalOn(sj, state("City of San Jose Fire Permit: Terms and Conditions"), "Next"));
  assert.ok(!finalOn(sj, state("Terms and Conditions"), "Back"));
  assert.ok(!finalOn(sj, state("Terms and Conditions"), "Save and Resume Later"));
  const bt = PLAYBOOKS.find((p) => p.host === "county-taxes.net")!;
  assert.ok(finalOn(bt, state("Affidavit"), "I Agree"));
  assert.ok(!finalOn(undefined, state("Review"), "Continue Application"));
});

test("the guide's fee pages go to the person", () => {
  const aca = PLAYBOOKS.find((p) => p.host === "aca-prod.accela.com")!;
  assert.ok(payOn(aca, state("Step 5: Pay Fees")));
  assert.ok(!payOn(aca, state("Step 4: Review")));
  assert.ok(!payOn(undefined, state("Pay Fees")));
});

test("the model reads the steps with the warning that they aren't verified yet", () => {
  const x = playbookFor("county-taxes.net", "hc-business-tax")!;
  const lines = guideLines(x);
  assert.match(lines[0], /not yet verified/);
  assert.ok(lines.some((l) => l.includes("I Agree")));
});

test("the worker gets each destination's tenant path, other hosts and start page", () => {
  assert.deepEqual(routeOf("dal-co"), { tenant: "/dallastx", alsoOn: undefined, start: "https://aca-prod.accela.com/dallastx" });
  assert.deepEqual(routeOf("hc-business-tax")?.alsoOn, ["hillsborough.county-taxes.com"]);
  assert.equal(routeOf("irs-ss4"), null, "no portal, no route");
});

test("each guide's pages, once each and in order, are the customer's progress list", () => {
  for (const p of PLAYBOOKS) for (const [id, form] of Object.entries(p.forms)) {
    const o = pageOutline(form);
    assert.ok(o.length >= 1 && o.length <= 20, `${p.host} ${id}`);
    assert.equal(new Set(o.map((x) => x.toLowerCase())).size, o.length, `${p.host} ${id}: a page once`);
    assert.deepEqual(o, form.steps.map((s) => s.page.trim()).filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).slice(0, 20), `${p.host} ${id}: in the guide's order`);
  }
});
