// node --experimental-strip-types --test test/guards.test.ts: the hard guards on pages, without a browser.
import { test } from "node:test";
import assert from "node:assert";
import { einFillOk, isFinal, makesAccount, mustStop, type Control, type PageState } from "../src/guards.ts";

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
