// node --experimental-strip-types --test test/guards.test.ts: the hard guards on pages, without a browser.
import { test } from "node:test";
import assert from "node:assert";
import { isFinal, makesAccount, mustStop, type Control, type PageState } from "../src/guards.ts";

const control = (o: Partial<Control>): Control => ({ selector: "", tag: "input", type: "text", label: "", name: "", id: "", autocomplete: "", value: "", ...o });
const page = (o: Partial<PageState>): PageState => ({ url: "https://inspect.lafd.org/x", title: "", headings: [], controls: [], buttons: [], links: [], text: "", frames: [], markers: [], ...o });

test("a page that makes a new account goes to the owner; a sign-in page doesn't", () => {
  const register = page({ title: "Create an Account", controls: [control({ type: "email", label: "Email" }), control({ type: "password", label: "Password" })] });
  assert.equal(mustStop(register)?.reason, "account");
  assert.match(mustStop(register)!.en, /never creates one/);
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
