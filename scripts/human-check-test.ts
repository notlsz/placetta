/* The human check on sign-in (src/cloud/human.ts, src/cloud/api.ts): off without a site key, a fresh single-use token
   on every Supabase Auth call that sends a code, makes an account or signs in with a password, and a clear refusal
   when Supabase says the check failed. Supabase verifies the token itself (CAPTCHA protection, Turnstile), so these
   tests check what reaches Supabase's auth server: the token in gotrue_meta_security.captcha_token.
   npm run test:human */
import { configureHuman, humanCheckOn, humanFailures, humanToken, isCaptchaError, prepareHuman, TURNSTILE_SRC } from "../src/cloud/human";
import * as api from "../src/cloud/api";

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, info?: unknown) => { if (c) { pass++; console.log("ok  ", name); } else { fail++; console.log("FAIL", name, info === undefined ? "" : JSON.stringify(info)); } };
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

/* ---------------- a stand-in browser and Turnstile ---------------- */
type Opts = Record<string, unknown> & { callback?: (t: string) => void; "error-callback"?: () => void };
function fakeBrowser(o: { load?: "ok" | "error" | "never"; answer?: "token" | "error" | "never"; lang?: string } = {}) {
  const scripts: { src: string }[] = [], renders: Opts[] = [], calls = { execute: 0, reset: 0 };
  let n = 0;
  const box: Record<string, unknown> = {};
  const turnstile = {
    render(_el: unknown, opts: Opts) { renders.push(opts); return "w1"; },
    execute() {
      calls.execute++;
      const r = renders[renders.length - 1];
      if (o.answer === "never") return;
      setTimeout(() => (o.answer === "error" ? r["error-callback"]?.() : r.callback?.(`tok-${++n}`)), 1);
    },
    reset() { calls.reset++; },
  };
  const win = {} as Window & { turnstile?: typeof turnstile };
  const doc = {
    documentElement: { lang: o.lang ?? "en" },
    head: { appendChild(s: { src: string; onload?: () => void; onerror?: () => void }) {
      scripts.push(s);
      if (o.load === "never") return;
      setTimeout(() => { if (o.load === "error") s.onerror?.(); else { win.turnstile = turnstile; s.onload?.(); } }, 1);
    } },
    body: { appendChild() { /* the widget's box */ } },
    createElement: () => ({ setAttribute() { /* style */ } }),
    getElementById: (id: string) => (box[id] as HTMLElement | undefined) ?? null,
  } as unknown as Document;
  return { doc, win, scripts, renders, calls };
}

/* ---------------- off without a key ---------------- */
{
  const b = fakeBrowser();
  configureHuman({ siteKey: "", doc: b.doc, win: b.win });
  prepareHuman();
  const t = await humanToken("signin");
  ok(!humanCheckOn() && t === undefined && b.scripts.length === 0, "no site key: no script loads and no token is asked for (today's behavior)", { t, scripts: b.scripts.length });
}

/* ---------------- on: one script, one widget, a fresh token each call ---------------- */
{
  const b = fakeBrowser({ lang: "zh-CN" });
  configureHuman({ siteKey: "1x00000000000000000000BB", doc: b.doc, win: b.win, wait: 2000 });
  prepareHuman();
  await tick(10);
  ok(b.scripts.length === 1 && b.scripts[0].src === TURNSTILE_SRC, "the script comes from Cloudflare's exact address, once", b.scripts.map(s => s.src));
  const r = b.renders[0] ?? {};
  ok(r.sitekey === "1x00000000000000000000BB" && r.appearance === "interaction-only" && r.execution === "execute", "invisible unless Cloudflare wants a click; run on demand", r);
  ok(r.language === "zh-cn", "the widget speaks the page's language (Chinese here)", r.language);
  const t1 = await humanToken("signin"), t2 = await humanToken("code");
  ok(t1 === "tok-1", "the token prepared while typing is used for the first call", t1);
  ok(!!t2 && t2 !== t1, "the next call gets a new token: each one is used once", { t1, t2 });
  ok(b.scripts.length === 1 && b.renders.length === 1, "the script and the widget are made once for the page", { s: b.scripts.length, r: b.renders.length });
  ok(b.calls.reset >= 2, "the widget is reset after each token is taken", b.calls);
}

/* ---------------- a token older than its 300 seconds is replaced ---------------- */
{
  const b = fakeBrowser();
  let t = 1_000_000;
  configureHuman({ siteKey: "k", doc: b.doc, win: b.win, now: () => t, wait: 2000 });
  prepareHuman(); await tick(10);
  t += 280_000;
  const tok = await humanToken("signin");
  ok(tok === "tok-2" && b.calls.execute === 2, "a token prepared more than 270 seconds ago is not sent; a fresh one is", { tok, calls: b.calls });
}

/* ---------------- blocked or slow (mainland China, an ad blocker): the call goes out without a token ---------------- */
{
  const b = fakeBrowser({ load: "error" });
  configureHuman({ siteKey: "k", doc: b.doc, win: b.win, wait: 50 });
  const t = await humanToken("signin");
  ok(t === undefined && humanFailures() >= 1, "the script can't load: no token, counted as a failure, nothing thrown", { t, f: humanFailures() });
  const t2 = await humanToken("signin");
  ok(b.scripts.length === 2 && t2 === undefined, "a later try loads the script again rather than giving up for good", b.scripts.length);
}
{
  const b = fakeBrowser({ answer: "never" });
  configureHuman({ siteKey: "k", doc: b.doc, win: b.win, wait: 40 });
  const started = Date.now(), t = await humanToken("phone");
  ok(t === undefined && Date.now() - started < 1000 && humanFailures() === 1, "Cloudflare never answers: the wait ends on time and the call goes out without a token", { t, ms: Date.now() - started });
}
{
  const b = fakeBrowser({ answer: "error" });
  configureHuman({ siteKey: "k", doc: b.doc, win: b.win, wait: 500 });
  const t = await humanToken("signup");
  ok(t === undefined && humanFailures() >= 1, "the widget reports an error: no token, no throw", { t });
}

/* ---------------- Supabase's refusal is recognised ---------------- */
ok(isCaptchaError({ code: "captcha_failed", message: "captcha protection: request disallowed (no-captcha)" }), "Supabase's captcha_failed is the human check");
ok(isCaptchaError({ message: "captcha verification process failed" }), "the older wording is too");
ok(!isCaptchaError({ code: "invalid_credentials", message: "Invalid login credentials" }) && !isCaptchaError(null), "a wrong password is not");

/* ---------------- what reaches Supabase's auth server ---------------- */
type Seen = { url: string; body: Record<string, unknown> };
const seen: Seen[] = [];
let answer: (url: string) => { status: number; body: unknown } = () => ({ status: 200, body: {} });
(globalThis as { location?: unknown }).location = { origin: "https://www.placetta.com", pathname: "/app/", search: "", hash: "" };
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  seen.push({ url, body });
  const a = answer(url);
  return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const meta = (s: Seen | undefined) => (s?.body.gotrue_meta_security as { captcha_token?: string } | undefined)?.captcha_token;
const last = (path: RegExp) => [...seen].reverse().find(s => path.test(s.url));

{
  const b = fakeBrowser();
  configureHuman({ siteKey: "k", doc: b.doc, win: b.win, wait: 2000 });
  answer = url => /token\?grant_type=password/.test(url) ? { status: 400, body: { code: "invalid_credentials", msg: "Invalid login credentials" } } : { status: 200, body: {} };
  await api.sendSignIn("owner@example.com").catch(() => undefined);
  const otp = last(/\/auth\/v1\/otp/);
  ok(!!meta(otp), "a code by email carries the token", otp?.body);
  await api.sendPhoneCode("+14155550100").catch(() => undefined);
  const sms = last(/\/auth\/v1\/otp/);
  ok(!!meta(sms) && meta(sms) !== meta(otp), "a code by text carries its own token (text codes cost money: the main thing to protect)", sms?.body);
  await api.signInPassword("owner@example.com", "pw-123456").catch(() => undefined);
  ok(!!meta(last(/token\?grant_type=password/)), "a password sign-in carries the token", last(/token/)?.body);
  await api.signUpPassword("new@example.com", "pw-123456").catch(() => undefined);
  ok(!!meta(last(/\/auth\/v1\/signup/)), "a new account carries the token", last(/signup/)?.body);
  await api.sendPasswordReset("owner@example.com").catch(() => undefined);
  ok(!!meta(last(/\/auth\/v1\/recover/)), "a reset link carries the token", last(/recover/)?.body);
  const tokens = seen.map(meta).filter(Boolean);
  ok(new Set(tokens).size === tokens.length, "no token is sent twice", tokens);
}
{
  const b = fakeBrowser();
  configureHuman({ siteKey: "", doc: b.doc, win: b.win });
  seen.length = 0; answer = () => ({ status: 200, body: {} });
  await api.sendSignIn("owner@example.com").catch(() => undefined);
  const otp = last(/\/auth\/v1\/otp/);
  ok(!!otp && meta(otp) === undefined && b.scripts.length === 0, "check off: the call goes out exactly as before, with no token field", otp?.body);
}
{
  const b = fakeBrowser();
  configureHuman({ siteKey: "k", doc: b.doc, win: b.win, wait: 2000 });
  answer = () => ({ status: 400, body: { code: "captcha_failed", msg: "captcha protection: request disallowed (timeout-or-duplicate)" } });
  const e1 = await api.sendSignIn("owner@example.com").then(() => null, e => e as api.ApiError);
  const e2 = await api.signInPassword("owner@example.com", "pw-123456").then(() => null, e => e as api.ApiError);
  const e3 = await api.sendPhoneCode("+14155550100").then(() => null, e => e as api.ApiError);
  ok(e1?.code === "captcha" && e2?.code === "captcha" && e3?.code === "captcha", "Supabase refusing the check comes back as 'captcha', so the screen says what happened", [e1, e2, e3]);
  ok(e2?.code !== "bad_login", "a failed check is never shown as a wrong password");
}

console.log(fail ? `\n${fail} failed, ${pass} passed` : `\nall ${pass} passed`);
process.exit(fail ? 1 : 0);
