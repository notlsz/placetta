// npm test (no browser needed): the worker's deploy pieces. Missing keys mean no filing, the live view serves only its
// own page to its own token, the nightly re-check reports only missing words, invisible reCAPTCHA isn't a stop while a
// real one is, a person's SSN or code is never read back, and a bot-protection refusal is recognised.
import { test } from "node:test";
import assert from "node:assert";
import { blockedPage, checkEnv, wantsHostedBrowser } from "../src/env.ts";
import { challengeFrame, challengeMark, mustStop, stopLinesFilled, type PageState } from "../src/guards.ts";
import { LiveViews, type LivePage } from "../src/live.ts";
import { findingsOf, missingWords, probeDue, probesOf } from "../src/probe.ts";
import { PLAYBOOKS } from "../src/playbooks.ts";
import { healthBody } from "../src/server.ts";

const KEYS = { SUPABASE_URL: "https://esquxzcfsylffuijvzec.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x", ANTHROPIC_API_KEY: "sk-ant-x", RENDER_EXTERNAL_URL: "https://placetta-filer.onrender.com" };
const state = (o: Partial<PageState> = {}): PageState => ({ url: "https://x.gov/a", title: "", headings: [], controls: [], buttons: [], links: [], text: "", frames: [], markers: [], ...o });

test("missing keys: not ok, each named with where to find it; Browserbase optional, local Chromium the default", () => {
  const none = checkEnv({});
  assert.equal(none.ok, false);
  assert.deepEqual(none.missing.map((m) => m.key), ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]);
  assert.ok(none.missing.every((m) => m.where.length > 10));
  const ok = checkEnv(KEYS);
  assert.equal(ok.ok, true);
  assert.equal(ok.browser, "local");
  assert.equal(ok.publicUrl, "https://placetta-filer.onrender.com");
  assert.equal(checkEnv({ ...KEYS, BROWSERBASE_API_KEY: "k", BROWSERBASE_PROJECT_ID: "p" }).browser, "browserbase");
  assert.ok(checkEnv({ ...KEYS, RENDER_EXTERNAL_URL: "" }).warnings.some((w) => /live browser/.test(w)));
});

test("/healthz says what's missing and never a key", () => {
  const env = checkEnv({ ...KEYS, ANTHROPIC_API_KEY: "" });
  const body = JSON.stringify(healthBody({ env, started: "t", version: "v", playbooks: 15, probes: 9, lastHeartbeat: null, lastHeartbeatError: null, lastClaim: null, lastProbe: null, probeDrift: null, running: 0 }, new LiveViews(null)));
  assert.match(body, /"ok": ?false/);
  assert.match(body, /ANTHROPIC_API_KEY/);
  assert.ok(!body.includes("sk-ant") && !body.includes('"x"'));
});

test("Browserbase only for the hosts that refuse a cloud server, or every host when asked", () => {
  const bb = { BROWSERBASE_API_KEY: "k", BROWSERBASE_PROJECT_ID: "p" };
  assert.equal(wantsHostedBrowser("eddservices.edd.ca.gov", bb), true);
  assert.equal(wantsHostedBrowser("boiefiling.fincen.gov", bb), false);
  assert.equal(wantsHostedBrowser("boiefiling.fincen.gov", { ...bb, FILER_BROWSERBASE_HOSTS: "*" }), true);
  assert.equal(wantsHostedBrowser("eddservices.edd.ca.gov", {}), false, "no keys: local Chromium");
});

test("a bot-protection refusal is recognised; a form page isn't", () => {
  assert.ok(blockedPage(state({ title: "Access Denied", headings: ["Access Denied"], text: "You don't have permission to access \"http://x\" on this server." })));
  assert.ok(blockedPage(state({ text: '{ "description" : "This request was blocked by our security service" }' })));
  assert.ok(blockedPage(state({ title: "403 Forbidden" })));
  assert.ok(!blockedPage(state({ title: "New Business Registration Form", headings: ["Organization Type"], text: "Is this business a non-profit?" })));
});

class FakePage implements LivePage {
  clicks: [number, number][] = []; typed: string[] = []; keys: string[] = [];
  async screenshot() { return new Uint8Array([0xff, 0xd8]); }
  mouse = { click: async (x: number, y: number) => { this.clicks.push([x, y]); }, wheel: async () => undefined };
  keyboard = { type: async (t: string) => { this.typed.push(t); }, press: async (k: string) => { this.keys.push(k); } };
  viewportSize() { return { width: 1280, height: 900 }; }
  url() { return "https://boiefiling.fincen.gov/boir/html"; }
}

test("the live view: one page per token, clicks scaled to the page, a short list of keys, Done, and gone when closed or expired", async () => {
  let now = 1000;
  const views = new LiveViews("https://placetta-filer.onrender.com", () => now);
  const page = new FakePage();
  const v = views.open(page, 60_000)!;
  assert.match(v.url, /^https:\/\/placetta-filer\.onrender\.com\/live\/[A-Za-z0-9_-]{32}$/);
  const path = new URL(v.url).pathname;
  const html = await views.handle("GET", path, "");
  assert.equal(html.status, 200);
  assert.match(String(html.headers?.["Content-Security-Policy"]), /frame-ancestors 'none'/);
  assert.match(String(html.body), /boiefiling\.fincen\.gov/);
  assert.equal((await views.handle("GET", path + "/frame.jpg", "")).type, "image/jpeg");
  await views.handle("POST", path + "/act", JSON.stringify({ kind: "click", x: 50, y: 25, w: 100, h: 100 }));
  assert.deepEqual(page.clicks, [[640, 225]]);
  await views.handle("POST", path + "/act", JSON.stringify({ kind: "type", text: "123456" }));
  assert.deepEqual(page.typed, ["123456"]);
  assert.equal((await views.handle("POST", path + "/act", JSON.stringify({ kind: "key", key: "F12" }))).status, 400);
  assert.equal((await views.handle("POST", path + "/act", JSON.stringify({ kind: "click", x: 500, y: 1, w: 100, h: 100 }))).status, 400, "off the picture");
  assert.ok(views.touched(v.token) > 0);
  assert.equal(views.done(v.token), false);
  await views.handle("POST", path + "/done", "");
  assert.equal(views.done(v.token), true);
  assert.equal((await views.handle("GET", "/live/" + "A".repeat(32), "")).status, 404, "a guessed token");
  now += 61_000;
  assert.equal((await views.handle("GET", path, "")).status, 404, "expired");
  const w = views.open(page, 60_000)!;
  views.close(w.token);
  assert.equal((await views.handle("GET", new URL(w.url).pathname, "")).status, 404, "closed with its hand-back");
  assert.equal(new LiveViews(null).open(page, 1000), null, "no public address, no view");
});

test("an invisible reCAPTCHA isn't a stop; a visible one, a challenge frame or hCaptcha is", () => {
  const invisible = "https://www.google.com/recaptcha/enterprise/anchor?ar=1&k=6Lf&size=invisible&cb=x";
  assert.equal(challengeFrame(invisible), false);
  assert.equal(challengeMark("recaptcha-enterprise-script grecaptcha-badge "), false);
  assert.equal(challengeMark("g-recaptcha-response g-recaptcha-response-100000"), false);
  assert.equal(mustStop(state({ frames: [invisible], markers: ["grecaptcha-badge ", "g-recaptcha-response "] })), null);
  assert.equal(mustStop(state({ frames: ["https://www.google.com/recaptcha/enterprise/anchor?ar=1&size=normal"] }))?.reason, "captcha");
  assert.equal(mustStop(state({ frames: [invisible, "https://www.google.com/recaptcha/enterprise/bframe?hl=en"] }))?.reason, "captcha");
  assert.equal(mustStop(state({ markers: ["g-recaptcha "] }))?.reason, "captcha");
  assert.equal(mustStop(state({ frames: ["https://newassets.hcaptcha.com/captcha/v1/x"] }))?.reason, "captcha");
});

test("after the person types an SSN or a code, that page passes; an empty line or another stop doesn't", () => {
  const ssn = (value: string) => state({ controls: [{ selector: "#s", tag: "input", type: "text", label: "Social Security Number", name: "", id: "s", autocomplete: "", value }] });
  assert.equal(mustStop(ssn(""))?.reason, "secret_number");
  assert.equal(stopLinesFilled("secret_number", ssn("")), false);
  assert.equal(stopLinesFilled("secret_number", ssn("(filled)")), true);
  assert.equal(stopLinesFilled("payment", ssn("(filled)")), false, "a fee is never waved through by what's in a box");
});

test("the nightly re-check: each public page once, missing words only, findings for the Quality tab, once a day", () => {
  const probes = probesOf();
  assert.equal(new Set(probes.map((p) => p.probe.url)).size, probes.length);
  assert.ok(probes.length >= 8);
  for (const { probe } of probes) { assert.ok(probe.url.startsWith("https://")); assert.match(probe.seen, /^\d{4}-\d{2}-\d{2}$/); assert.ok(probe.expect.length); }
  const p = { url: "https://boiefiling.fincen.gov/fileboir", expect: ["Prepare & Submit BOIR", "File Online BOIR"], seen: "2026-10-24" };
  assert.deepEqual(missingWords(p, state({ links: [{ selector: "link:Prepare & Submit BOIR", text: "Prepare  &  Submit BOIR", href: "" }], text: "File Online BOIR" })), []);
  assert.deepEqual(missingWords(p, state({ text: "File Online BOIR" })), ["Prepare & Submit BOIR"]);
  const f = findingsOf([{ host: "h", name: "BOI E-Filing (FinCEN)", url: p.url, missing: ["Prepare & Submit BOIR"] }]);
  assert.equal(f[0].kind, "drift");
  assert.equal(f[0].source, p.url);
  assert.equal(probeDue(new Date("2026-10-24T11:00:00Z"), null, 10), true);
  assert.equal(probeDue(new Date("2026-10-24T11:00:00Z"), "2026-10-24", 10), false);
  assert.equal(probeDue(new Date("2026-10-24T09:00:00Z"), "2026-10-23", 10), false);
});

test("every step a playbook says was seen names the day, and every playbook added for the beachhead has public pages to re-check", () => {
  for (const pb of PLAYBOOKS) for (const f of Object.values(pb.forms)) for (const s of f.steps) if (s.seen) assert.match(s.seen, /^\d{4}-\d{2}-\d{2}$/);
  for (const host of ["boiefiling.fincen.gov", "etaxstatement.sfgov.org", "mytax.illinois.gov", "gtc.dor.ga.gov", "onlineservices.cdtfa.ca.gov"]) {
    assert.ok(PLAYBOOKS.find((p) => p.host === host)?.probes?.length, host);
  }
});

test("an identity check: the owner's one tap opens the live page on a phone, and says plainly what to do and why it's theirs", async () => {
  const { IDENTITY_MSG } = await import("../src/guards.ts");
  const stop = mustStop({ url: "https://api.id.me/en/session/new", title: "Sign in", headings: [], controls: [], buttons: [], links: [], text: "", frames: [], markers: [] });
  assert.equal(stop?.reason, "identity");
  assert.match(stop!.en, /only you can do/); assert.match(stop!.en, /ID\.me or Login\.gov/); assert.match(stop!.en, /never signs in as you/);
  assert.match(stop!.en, /Tap Open: the agency's page opens on your phone where Odelia stopped/);
  assert.match(stop!.zh, /只有您本人能完成/);
  assert.ok(!/[–—]/.test(IDENTITY_MSG.en + IDENTITY_MSG.zh), "no em or en dashes");
  const views = new LiveViews("https://placetta-filer.onrender.com");
  const v = views.open(new FakePage(), 60_000, undefined, IDENTITY_MSG.en)!;
  const html = String((await views.handle("GET", new URL(v.url).pathname, "")).body);
  assert.match(html, /width=device-width,initial-scale=1/, "made for a phone");
  assert.ok(html.indexOf("only you can do") > 0 && html.indexOf("only you can do") < html.indexOf('id="shot"'), "what to do comes first, above the page");
});
