// node --experimental-strip-types --test test/guards.test.ts: the hard guards on pages, without a browser.
import { test } from "node:test";
import assert from "node:assert";
import { einFillOk, inertScriptLink, isFinal, makesAccount, mustStop, noChoice, onPage, OPT_OUT_LOG, optOutQuestion, type Control, type PageState } from "../src/guards.ts";
import { FilerModel, OPT_OUT_RULE, stepSystem, TOOLS } from "../src/model.ts";
import type { Router } from "../src/llm.ts";

const control = (o: Partial<Control>): Control => ({ selector: "", tag: "input", type: "text", label: "", name: "", id: "", autocomplete: "", value: "", ...o });
const page = (o: Partial<PageState>): PageState => ({ url: "https://inspect.lafd.org/x", title: "", headings: [], controls: [], buttons: [], links: [], text: "", frames: [], markers: [], ...o });

test("a page that makes a new account goes to the owner; a sign-in page doesn't", () => {
  const register = page({ title: "Create an Account", controls: [control({ type: "email", label: "Email" }), control({ type: "password", label: "Password" })] });
  assert.equal(mustStop(register)?.reason, "account");
  assert.match(mustStop(register)!.en, /Odelia can't make this one/);
  assert.ok(makesAccount(page({ controls: [control({ type: "password", label: "Password" }), control({ type: "password", label: "Confirm password" })] })), "a password typed twice");
  assert.ok(!makesAccount(page({ title: "Sign In", headings: ["Sign in", "New here? Sign up"], controls: [control({ type: "password", label: "Password" })] })), "sign in with a sign-up link is a sign-in page");
  assert.equal(mustStop(page({ title: "Login", controls: [control({ type: "text", label: "User name" }), control({ type: "password", label: "Password" })] })), null);
});

test("a CAPTCHA always goes to the owner, before anything else on the page", () => {
  assert.equal(mustStop(page({ title: "Create an Account", markers: ["g-recaptcha"], controls: [control({ type: "password" })] }))?.reason, "captcha");
});

test("booking an inspection is a sending button: the final-submit guard runs before it", () => {
  for (const b of ["Schedule", "Schedule Inspection", "Book", "Request Inspection", "Submit"]) assert.ok(isFinal(b), b);
  for (const b of ["Sign In", "Next", "Back", "Log out"]) assert.ok(!isFinal(b), b);
});

// San Francisco's New Business Registration (etaxstatement.sfgov.org) asks "Business Tax ID (SSN, FEIN, or TIN)".
const pay = (label: string, value: string) => ({ fields: [{ label: { en: label, zh: label }, value }] });
const taxLine = control({ label: "Business Tax ID (SSN, FEIN, or TIN)", id: "tin" });

test("a business tax ID line that takes a FEIN doesn't stop the run when the approved value is the business's EIN", () => {
  const st = page({ url: "https://etaxstatement.sfgov.org/x", controls: [taxLine] });
  assert.equal(mustStop(st, pay("FEIN", "12-3456789")), null);
  assert.equal(mustStop(st, pay("Business tax ID", "12-3456789")), null);
  assert.ok(einFillOk(taxLine, "12-3456789", pay("FEIN", "12-3456789")));
  assert.equal(mustStop(st)?.reason, "secret_number", "without the payload the guard stays strict");
});

test("an SSN, ITIN or passport still stops the run, even on a line that also takes a FEIN", () => {
  const st = page({ controls: [taxLine] });
  assert.equal(mustStop(st, pay("Owner SSN", "123-45-6789"))?.reason, "secret_number", "an SSN-shaped value");
  assert.equal(mustStop(st, pay("Tax ID", "912-70-1234"))?.reason, "secret_number", "an ITIN (starts with 9)");
  assert.equal(mustStop(st, pay("Owner SSN", "12-3456789"))?.reason, "secret_number", "EIN-shaped but from a person's SSN field");
  assert.equal(mustStop(st, pay("Legal name", "12-3456789"))?.reason, "secret_number", "not from a business tax ID field");
  assert.ok(!einFillOk(taxLine, "123-45-6789", pay("FEIN", "12-3456789")), "only the approved EIN goes in");
  for (const label of ["Social Security Number", "SSN", "Passport number", "ITIN", "Passport or TIN"]) {
    assert.equal(mustStop(page({ controls: [control({ label })] }), pay("FEIN", "12-3456789"))?.reason, "secret_number", label);
  }
});

// SF's live page after Organization Type (read 2026-10-28): the line and its approved field each name an SSN beside the
// FEIN, and the approved value is the test EIN 00-0000000.
const sfLine = control({ label: "Business Tax Identification Number * (Social Security Number, Tax Identification Number, Federal Employer Identification Number)", id: "businessTaxID" });
const sfPay = pay("Business Tax ID (SSN, FEIN, or TIN)", "00-0000000");

test("SF's Business Identification page: the approved EIN from \"Business Tax ID (SSN, FEIN, or TIN)\" goes in its tax ID line", () => {
  const st = page({ url: "https://etaxstatement.sfgov.org/NewBusinessRegistration/application", headings: ["Business Identification"],
    controls: [control({ label: "Business Name * (as shown on your income tax return)", id: "businessName" }), sfLine, control({ label: "Telephone number *", id: "phone" })] });
  assert.equal(mustStop(st, sfPay), null);
  assert.ok(einFillOk(sfLine, "00-0000000", sfPay));
  assert.ok(einFillOk(taxLine, "00-0000000", sfPay), "the approved field's own wording as the line");
});

test("SF's Business Identification page: an SSN-shaped value never goes in, and a person's number field never counts", () => {
  const st = page({ controls: [sfLine] });
  assert.equal(mustStop(st, pay("Business Tax ID (SSN, FEIN, or TIN)", "123-45-6789"))?.reason, "secret_number");
  assert.equal(mustStop(st, pay("Business Tax ID (SSN, FEIN, or TIN)", "123456789"))?.reason, "secret_number", "nine bare digits could be an SSN");
  assert.ok(!einFillOk(sfLine, "123-45-6789", sfPay));
  assert.ok(!einFillOk(sfLine, "12-3456789", sfPay), "only an approved EIN");
  for (const label of ["Owner SSN", "Social Security Number", "SSN or ITIN", "Passport or FEIN"]) {
    assert.equal(mustStop(st, pay(label, "00-0000000"))?.reason, "secret_number", label);
  }
  assert.equal(mustStop(page({ controls: [control({ label: "Social Security Number" })] }), sfPay)?.reason, "secret_number", "an SSN-only line");
  assert.equal(mustStop(page({ controls: [control({ label: "Taxpayer Identification Number (SSN or ITIN)" })] }), sfPay)?.reason, "secret_number", "a person's TIN line");
});

test("an empty script link (GenTax's javascript:;) may be clicked; any other script link may not", () => {
  for (const h of ["javascript:;", "javascript:", "javascript:void(0)", "javascript:void(0);", "JavaScript: void 0"]) assert.ok(inertScriptLink(h), h);
  for (const h of ["javascript:alert(1)", "javascript:location='/x'", "javascript:;alert(1)", "https://x.gov/", "#"]) assert.ok(!inertScriptLink(h), h);
});

// SF's New Business Registration (live rehearsal, Oct 2026) stopped on this required Yes/No question.
const SF_ASK = "Would you like to receive information about City-offered additional opportunities and programs?";
test("a question that only asks about receiving information may be answered No; one that changes the filing never", () => {
  assert.ok(optOutQuestion(SF_ASK), "SF's phrasing");
  for (const q of ["Would you like to receive our newsletter?", "Do you want to receive marketing emails?", "Would you like to be contacted about surveys?", "Subscribe to updates?"]) assert.ok(optOutQuestion(q), q);
  for (const q of [
    "Do you certify that the information provided is true and correct?",
    "Will you sell alcohol?",
    "Do you agree to the terms?",
    "Would you like to receive information about tax exemptions you may qualify for?",
    "Would you like to receive information and consent to share your data with partners?",
    "Do you sell tobacco products?",
    "Is the business located in a residential zone?",
    "Would you like to receive a permit for outdoor seating?",
    "Would you like to receive information about City programs? Do you certify the above?",
    "Would you like to receive information about City programs",
  ]) assert.ok(!optOutQuestion(q), q);
});

test("the No is a radio labelled No or a dropdown's No, and the question must be on the page", () => {
  assert.deepEqual(noChoice(control({ type: "radio", label: "No", value: "N" })), { kind: "radio" });
  assert.equal(noChoice(control({ type: "radio", label: "Yes", value: "Y" })), null);
  assert.deepEqual(noChoice(control({ tag: "select", type: "select-one", options: ["Select", "Yes", "No"] })), { kind: "select", option: "No" });
  assert.equal(noChoice(control({ type: "checkbox", label: "No" })), null, "a checkbox isn't a No answer");
  const st = page({ text: `Business Details\n* ${SF_ASK}\nYes No` });
  assert.ok(onPage(SF_ASK, st));
  assert.ok(!onPage("Would you like to receive our newsletter?", st), "a question the page didn't ask");
  assert.match(OPT_OUT_LOG.en, /Answered No to an optional-information question/);
  assert.ok(OPT_OUT_LOG.zh.length > 0);
});

test("the model's check: the strong tier must say true; a false, an error or another tool is a no", async () => {
  const fake = (r: unknown) => new FilerModel({ ask: async () => { if (r instanceof Error) throw r; return r; } } as unknown as Router);
  assert.equal(await fake({ name: "verdict", input: { only_receive_info: true } }).optOut(SF_ASK), true);
  assert.equal(await fake({ name: "verdict", input: { only_receive_info: false } }).optOut("Do you agree to the terms?"), false);
  assert.equal(await fake({ name: "verdict", input: { only_receive_info: "true" } }).optOut(SF_ASK), false);
  assert.equal(await fake({ name: "need_person", input: {} }).optOut(SF_ASK), false);
  assert.equal(await fake(new Error("down")).optOut(SF_ASK), false);
  assert.ok(TOOLS.some((t) => t.name === "answer_no"));
  const sys = stepSystem({ filing: { payload: { official: "sf-nbr", fields: [] } } as never, agency: "SF" });
  assert.ok(sys.includes(OPT_OUT_RULE));
});

test("a split address takes the parts of the approved line, exactly, and nothing else", async () => {
  const { addressParts, fieldFor, optionFor } = await import("../src/guards.ts");
  const p = { fields: [{ id: "mailing_address", label: { en: "Business Mailing Address, City, State, Zip", zh: "" }, value: "123 Test St, San Francisco, CA 94103" }] } as never;
  assert.deepEqual(addressParts("123 Test St, San Francisco, CA 94103"), { street: "123 Test St", city: "San Francisco", state: "CA", zip: "94103" });
  for (const v of ["123 Test St", "San Francisco", "CA", "94103"]) assert.ok(fieldFor(v, p), v);
  assert.ok(optionFor("California", p), "a state dropdown of names");
  assert.ok(optionFor("ca", p), "a state dropdown of codes");
  for (const v of ["124 Test St", "Oakland", "NY", "94104", "Test St"]) assert.equal(fieldFor(v, p), null, v);
  assert.equal(addressParts("somewhere in SF"), null);
});

test("the step prompt says what day it is, in the page part (the cached part stays put)", async () => {
  const { todayLine, stepPage, stepSystem: sys } = await import("../src/model.ts");
  assert.match(todayLine(new Date("2026-10-28T22:00:00Z")), /10\/28\/2026/);
  assert.match(todayLine(new Date("2026-10-29T05:30:00Z")), /10\/29\/2026 US Eastern, .*10\/28\/2026 US Pacific/);
  const f = { payload: { official: "x", fields: [] } } as never;
  assert.doesNotMatch(sys({ filing: f, agency: "SF" }), /Today's date/);
  assert.match(stepPage({ filing: f, agency: "SF", state: page({}), recent: [] }), /Today's date/);
});

test("SF's No radio: the question and the answer in one label", () => {
  assert.deepEqual(noChoice(control({ type: "radio", label: "Would you like to receive information about City-offered additional opportunities and programs? No", value: "on" })), { kind: "radio" });
  assert.equal(noChoice(control({ type: "radio", label: "Would you like to receive information about City-offered additional opportunities and programs? Yes", value: "on" })), null);
  assert.equal(noChoice(control({ type: "radio", label: "Know your rights", value: "on" })), null);
});

test("a business type may be chosen as the list's abbreviation of the same type, never a different one", async () => {
  const { optionFor } = await import("../src/guards.ts");
  const p = { fields: [{ id: "t", label: { en: "Business type", zh: "" }, value: "Limited Liability Company" }] } as never;
  assert.ok(optionFor("LLC", p));
  assert.equal(optionFor("LLC taxed as a partnership", p), null);
  assert.equal(optionFor("Corporation", p), null);
});
