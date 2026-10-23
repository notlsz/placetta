// npm test: self-healing selectors, the receipt checklist, backoff when a portal is down, and one run per workspace
// and portal at a time (no browser needed).
import { test } from "node:test";
import assert from "node:assert";
import { backoffMinutes, heal, KeyLock, portalDown, receiptCheck, receiptLine } from "../src/heal.ts";
import { slots } from "../src/main.ts";
import type { PageState } from "../src/guards.ts";

const ctl = (label: string, o: Partial<PageState["controls"][number]> = {}): PageState["controls"][number] =>
  ({ selector: o.selector ?? `label:${label}`, tag: "input", type: "text", label, name: "", id: "", value: "", autocomplete: "", ...o });
const page = (controls: PageState["controls"], buttons: string[] = [], links: string[] = []): PageState => ({
  url: "https://x.gov/", title: "", headings: ["Business Information"], controls, buttons: buttons.map((t) => ({ selector: `button:${t}`, text: t })),
  links: links.map((t) => ({ selector: `link:${t}`, text: t, href: "https://x.gov/a" })), text: "", frames: [], markers: [] });

test("a relabelled field is found again by its words, ignoring case, spaces, a colon and the required star", () => {
  const st = page([ctl("Legal Name: *"), ctl("Mailing address")]);
  assert.equal(heal("label:Legal name", st, "fill"), "label:Legal Name: *");
  assert.equal(heal("label:Legal name", page([ctl("Legal name of the business")]), "fill"), "label:Legal name of the business", "a label that grew around the same words");
  assert.equal(heal("#LegalName", page([ctl("", { selector: "#legalname", id: "legalname" })]), "fill"), "#legalname", "the same id in another case");
});

test("never a guess: two candidates or none means no heal, and a field is matched only among its own kind", () => {
  assert.equal(heal("label:Name", page([ctl("Name *"), ctl("name")]), "fill"), null, "two fields both say Name");
  assert.equal(heal("label:Phone", page([ctl("Email")]), "fill"), null);
  assert.equal(heal("label:Entity type", page([ctl("Entity type:", { tag: "select", type: "select" })]), "fill"), null, "a dropdown is not a text field");
  assert.equal(heal("label:Entity type", page([ctl("Entity type:", { tag: "select", type: "select" })]), "select"), "label:Entity type:");
  assert.equal(heal("label:Articles", page([ctl("Articles", { type: "file", selector: "#up" })]), "upload"), "#up");
});

test("a button is matched exactly by its words, never by a near match (a near Submit could be the wrong one)", () => {
  assert.equal(heal("button:Continue", page([], ["CONTINUE "]), "click"), "button:CONTINUE ");
  assert.equal(heal("button:Continue", page([], ["Continue to payment"]), "click"), null);
  assert.equal(heal("button:Next", page([], ["Next"], ["Next"]), "click"), null, "a Next button and a Next link: ambiguous");
  assert.equal(heal("link:Building", page([], [], ["Building "]), "click"), "link:Building ");
});

test("the receipt checklist ticks what was kept and names what's missing, in English and Chinese", () => {
  const c = receiptCheck({ text: "Thank you. Confirmation number: CA-1", heading: "Receipt", confirmation: "CA-1", screenshot: "w/receipts/a.png", pdf: null, receiptWords: ["Receipt"], at: "2026-10-22T00:00:00Z" });
  assert.deepEqual([c.confirmation_on_page, c.screenshot, c.pdf, c.receipt_page], [true, true, false, true]);
  const l = receiptLine(c);
  assert.match(l.en, /PDF of the confirmation page missing/); assert.match(l.zh, /确认页 PDF缺失/);
  assert.equal(receiptCheck({ text: "", heading: "", confirmation: "X", screenshot: null, pdf: null }).receipt_page, null, "no guide, no receipt-page line");
});

test("a portal that's down waits 2, 10 then 30 minutes; other errors aren't treated as an outage", () => {
  for (const m of ["page.goto: net::ERR_CONNECTION_REFUSED at https://x.gov/", "Timeout 30000ms exceeded.", "503 Service Unavailable", "The site is down for scheduled maintenance"]) assert.ok(portalDown(m), m);
  for (const m of ["No element for button:Submit", "Refused: that value isn't one of the approved values."]) assert.ok(!portalDown(m), m);
  assert.deepEqual([1, 2, 3, 7].map(backoffMinutes), [2, 10, 30, 30]);
});

test("one run per workspace and portal at a time; others go side by side", async () => {
  const lock = new KeyLock(), order: string[] = [];
  const job = (k: string, name: string, ms: number) => lock.run(k, async () => { order.push(`start ${name}`); await new Promise((r) => setTimeout(r, ms)); order.push(`end ${name}`); });
  await Promise.all([job("w1|sjpermits", "a", 40), job("w1|sjpermits", "b", 5), job("w2|sjpermits", "c", 5)]);
  assert.ok(order.indexOf("end a") < order.indexOf("start b"), "the same workspace and portal waits");
  assert.ok(order.indexOf("start c") < order.indexOf("end a"), "another workspace doesn't");
  assert.equal(lock.busy("w1|sjpermits"), false, "nothing left held");
  assert.deepEqual([slots({}), slots({ FILER_CONCURRENCY: "3" }), slots({ FILER_CONCURRENCY: "99" }), slots({ FILER_CONCURRENCY: "x" })], [1, 3, 4, 1]);
});
