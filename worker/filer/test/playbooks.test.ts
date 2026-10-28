// npm test (no browser needed for these): the playbooks match the destinations they drive, cite their guides, and
// stay unverified until staff watch a first run.
import { test } from "node:test";
import assert from "node:assert";
import { DEST } from "../../../supabase/functions/file/destinations.ts";
import type { PageState } from "../src/guards.ts";
import { routeOf } from "../src/main.ts";
import { finalOn, guideLines, navOn, navProblems, pageOutline, payOn, playbookFor, PLAYBOOKS } from "../src/playbooks.ts";

const onHost = (url: string, host: string) => { const h = new URL(url).hostname; return h === host || h.endsWith("." + host); };
const state = (heading: string): PageState => ({ url: "https://x.gov/", title: heading, headings: [heading], controls: [], buttons: [], links: [], text: "", frames: [], markers: [] });

// Portals with three or more forms whose only published guides are videos, so there's nothing written to follow.
const VIDEO_ONLY = new Set(["plus.fairfaxcounty.gov"]);
// A host shared by separate government services, each on its own path, all behind the person's own sign-in, where
// every form there is marked notReady (M5, 2026-10-25): there's no one portal to write a playbook for, and nothing past
// sign-in was seen. The exemption ends the moment any form on the host loses notReady (checked below).
const SHARED_SIGN_IN = new Set(["www.tax.service.gov.uk"]);
// Portals with no step-by-step written guide to write a playbook from, whose forms are filed in teach mode first ("Show
// Odelia how", src/teach.ts) and then from the steps the team reviewed (run.ts, store.taught). New Jersey's Business
// Formation and Registration services on njportal.com (commit 550ac4e19, 2026-10-27). Remove a host once it has a playbook.
// California ABC's online application (services.abc.ca.gov, 2026-10-28): the original license and the four pages its
// instructions have uploaded inside it, filed once as the business's consultant; no recorded steps yet.
const TEACH_FIRST = new Set(["www.njportal.com", "services.abc.ca.gov"]);

test("every portal three or more forms use has a playbook, and the state formation portals with written guides too", () => {
  assert.equal(PLAYBOOKS.length, 15);
  assert.equal(new Set(PLAYBOOKS.map((p) => p.host)).size, PLAYBOOKS.length, "one playbook per portal");
  const count = new Map<string, number>();
  for (const d of Object.values(DEST)) if (d.portal) count.set(d.portal, (count.get(d.portal) ?? 0) + 1);
  for (const [host, n] of count) {
    if (n >= 3 && !VIDEO_ONLY.has(host) && !SHARED_SIGN_IN.has(host) && !TEACH_FIRST.has(host)) assert.ok(PLAYBOOKS.some((p) => p.host === host), `${host} has ${n} forms and no playbook`);
  }
  // the shared sign-in exemption holds only while every form on that host is notReady, each on its own path
  for (const host of SHARED_SIGN_IN) {
    const forms = Object.entries(DEST).filter(([, d]) => d.portal === host);
    assert.ok(forms.length > 0 && forms.every(([, d]) => !!d.notReady && !d.noLogin && !!d.tenant), `${host}: every form not ready, signed in, on its own path`);
    assert.equal(new Set(forms.map(([, d]) => d.tenant)).size, forms.length, `${host}: one path per service`);
  }
  // the teach-first exemption is only for a portal that still has no playbook
  for (const host of TEACH_FIRST) assert.ok(count.has(host) && !PLAYBOOKS.some((p) => p.host === host), `${host}: has a playbook now, so drop it from TEACH_FIRST`);
  for (const p of PLAYBOOKS) assert.ok(Object.keys(p.forms).length >= 1 && (count.get(p.host) ?? 0) >= Object.keys(p.forms).length, p.host);
});

test("a guide's open-the-form button isn't a send, and a send button can never be listed as one", () => {
  const abc = PLAYBOOKS.find((p) => p.host === "abc.austintexas.gov")!;
  assert.equal(navOn(abc, state("My Inspections"), "Schedule Inspection"), true);
  assert.equal(navOn(abc, state("Schedule Inspection"), "Request Inspection"), false, "the guide's send button");
  assert.equal(navOn(abc, state("Schedule Inspection"), "Schedule Inspection"), false, "only on the page the guide names");
  // A nav button may share its words with a send button only on a different, named page; every overlap is refused.
  for (const p of PLAYBOOKS) assert.deepEqual(navProblems(p), [], p.host);
  const base = { ...abc, final: [{ page: "File Document", button: "File Online" }], pay: ["Shopping Cart"] };
  assert.ok(navProblems({ ...base, nav: [{ page: "File Document", button: "File Online" }] }).some((x) => /overlap/.test(x)), "the same page");
  assert.ok(navProblems({ ...base, nav: [{ page: "Document", button: "File Online" }] }).some((x) => /overlap/.test(x)), "a page whose name is inside the send page's");
  assert.ok(navProblems({ ...base, final: [{ page: "", button: "File Online" }], nav: [{ page: "Forms", button: "File Online" }] }).some((x) => /every page/.test(x)), "a send with no page");
  assert.ok(navProblems({ ...base, nav: [{ page: "Shopping Cart", button: "File Online" }] }).some((x) => /fee page/.test(x)), "a fee page");
  assert.ok(navProblems({ ...base, nav: [{ page: "", button: "File Online" }] }).length > 0, "no page");
  assert.deepEqual(navProblems({ ...base, nav: [{ page: "Forms", button: "File Online" }] }), [], "disjoint, named pages");
});

test("bizfile's shared-word opener: only on the Forms page, read from the page itself; everywhere else it is a send", () => {
  const biz = PLAYBOOKS.find((p) => p.host === "bizfileonline.sos.ca.gov")!;
  // the browser's page state (pageState in page.ts): the only input besides the button's words; the model names no page
  const at = (o: Partial<PageState>): PageState => ({ ...state(""), url: "https://bizfileonline.sos.ca.gov/forms", buttons: [{ selector: "button:File Online", text: "File Online" }], ...o });
  // the Forms opener navigates, and isn't a send
  assert.equal(navOn(biz, at({ title: "Forms", headings: ["Forms"] }), "File Online"), true);
  assert.equal(finalOn(biz, at({ title: "Forms", headings: ["Forms"] }), "File Online"), false);
  // the real send on File Document is never navigation, and the guard runs there
  assert.equal(navOn(biz, at({ title: "File Document", headings: ["File Document"] }), "File Online"), false);
  assert.equal(finalOn(biz, at({ title: "File Document", headings: ["File Document"] }), "File Online"), true);
  // a page naming both Forms and the send page, or a fee page: ambiguous, no exception
  assert.equal(navOn(biz, at({ title: "Forms", headings: ["Forms", "File Document"] }), "File Online"), false);
  assert.equal(navOn(biz, at({ title: "File Document", headings: ["Forms"] }), "File Online"), false);
  assert.equal(navOn(biz, at({ title: "Forms", headings: ["Forms", "Shopping Cart"] }), "File Online"), false);
  // a heading that only contains the word, or another page entirely: no exception
  assert.equal(navOn(biz, at({ title: "Forms", headings: ["Forms and Fees"] }), "File Online"), false);
  assert.equal(navOn(biz, at({ title: "Review", headings: ["Review"] }), "File Online"), false);
  // missing page identity: no heading (the <title> alone doesn't count), no address
  assert.equal(navOn(biz, at({ title: "Forms", headings: [] }), "File Online"), false);
  assert.equal(navOn(biz, at({ title: "", headings: [] }), "File Online"), false);
  assert.equal(navOn(biz, at({ url: "", title: "Forms", headings: ["Forms"] }), "File Online"), false, "no address");
  assert.equal(navOn(biz, at({ url: "not a url", title: "Forms", headings: ["Forms"] }), "File Online"), false, "an address that doesn't parse");
  // duplicate controls with the words: ambiguous, no exception
  const btn = (t: string) => ({ selector: `button:${t}`, text: t });
  assert.equal(navOn(biz, at({ title: "Forms", headings: ["Forms"], buttons: [btn("File Online")] }), "File Online"), true, "one control");
  assert.equal(navOn(biz, at({ title: "Forms", headings: ["Forms"], buttons: [btn("File Online"), btn("File Online")] }), "File Online"), false, "two controls");
  assert.equal(navOn(biz, at({ title: "Forms", headings: ["Forms"], buttons: [btn("File Online")], links: [{ selector: "link:File Online", text: "File Online", href: "#" }] }), "File Online"), false, "a button and a link");
  assert.equal(navOn(biz, at({ title: "Forms", headings: ["Forms"], buttons: [] }), "File Online"), false, "no such control on the page");
  // a Forms heading never outweighs the rest of the page naming the send page or a fee page
  assert.equal(navOn(biz, at({ title: "Forms", headings: ["Forms"], text: "File Document: choose File Online to send it" }), "File Online"), false, "the send page in the text");
  assert.equal(navOn(biz, at({ title: "Forms", headings: ["Forms"], text: "Your Shopping Cart has 1 item" }), "File Online"), false, "a fee page in the text");
  // a different button on the Forms page gets nothing
  assert.equal(navOn(biz, at({ title: "Forms", headings: ["Forms"] }), "Submit"), false);
  // a nav entry with a path holds only on that path
  const pathed = { ...biz, nav: [{ page: "Forms", button: "File Online", path: "/forms" }] };
  assert.equal(navOn(pathed, at({ title: "Forms", headings: ["Forms"] }), "File Online"), true);
  assert.equal(navOn(pathed, at({ url: "https://bizfileonline.sos.ca.gov/filing/doc", title: "Forms", headings: ["Forms"] }), "File Online"), false);
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
