#!/usr/bin/env node
/* QA walk: clicks through every user-facing flow of the app, the signed-in preview and the website, in English and
   Chinese, at a desktop and a phone width, and reports anything that looks broken.

   Build and serve first (the app's base is /app/, so serve the folder above it; the website is site/ as it is):
     npx vite build --mode sample --outDir /tmp/qa/sample/app && (cd /tmp/qa/sample && python3 -m http.server 5203)
     VITE_PREVIEW=1 npx vite build --outDir /tmp/qa/preview/app && (cd /tmp/qa/preview && python3 -m http.server 5204)
     (cd site && python3 -m http.server 5205)
   Then:
     npm run test:qa -- --sample http://localhost:5203/app/ --preview http://localhost:5204/app/ --site http://localhost:5205/
   Leave out any of the three to skip it. Not in CI: it needs the servers above.

   Options: --out <dir> (screenshots and findings.json; default qa-out)  --widths 1280,390  --langs en,zh
            --only <flow name substring>  --jobs 4 (browsers at once)  --no-crawl (skip the click-everything pass)
            --shots (a screenshot at every checkpoint, not only where something is wrong)
   Playwright: set PLAYWRIGHT to its index.mjs if `import("playwright")` can't find it.

   On every screen it stops at, it records:
     console   a console error              page      an uncaught error in the page
     network   a request to our own origin that failed or answered 400 or more
     live      a request from the sample or the preview to the live backend (they must never reach it)
     text      "undefined", "NaN", "[object Object]", a {placeholder} or an interface key showing as text
     english   in Chinese, a whole English sentence or an English button label that should have been translated
     dot       a · or • used to separate text (the design rules use none)
     empty     a button or link with no text and no label
     image     an image that didn't load
     step      a step of a flow that couldn't be done (the control wasn't there, or did nothing)
   Exits 1 when anything is found. */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const flag = k => args.includes("--" + k);
const slash = u => (u ? u.replace(/\/?$/, "/") : u);
const SAMPLE = slash(opt("sample", "")), PREVIEW = slash(opt("preview", "")), SITE = slash(opt("site", ""));
const OUT = resolve(opt("out", "qa-out"));
const WIDTHS = opt("widths", "1280,390").split(",").map(Number);
const LANGS = opt("langs", "en,zh").split(",");
const ONLY = opt("only", "");
const JOBS = Number(opt("jobs", "4"));
const CRAWL = !flag("no-crawl");
const SHOTS = flag("shots");
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (!SAMPLE && !PREVIEW && !SITE) { console.error("Give at least one of --sample, --preview, --site (see the top of this file)."); process.exit(2); }

const { chromium } = await import(process.env.PLAYWRIGHT || "playwright").catch(() =>
  import("/home/claude/.npm-global/lib/node_modules/playwright/index.mjs"));

mkdirSync(OUT, { recursive: true });
const FILES = join(OUT, "files");
mkdirSync(FILES, { recursive: true });
// what an upload picks: a small real PDF and a photo
const PDF = join(FILES, "floor-plan.pdf");
writeFileSync(PDF, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const PNG = join(FILES, "storefront.png");
writeFileSync(PNG, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

/* -------------------------------- what's checked on every screen, in the page -------------------------------- */
function scan(o) {
  const zh = o.lang === "zh";
  const out = [];
  const seen = new Set();
  const add = (kind, detail, el) => { const k = kind + "|" + detail; if (seen.has(k)) return; seen.add(k); out.push({ kind, detail: detail.slice(0, 220), where: el ? where(el) : "" }); };
  const where = el => { const p = []; for (let e = el; e && e !== document.body && p.length < 4; e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "")); return p.join(" > "); };
  const cs = el => getComputedStyle(el);
  const shown = el => {
    if (!el || !el.isConnected) return false;
    // inside a closed <details>, or otherwise not rendered (content-visibility), it isn't on screen
    if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = cs(a);
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
      if (s.clip && s.clip !== "auto" && s.position === "absolute") return false;   // screen-reader-only text
    }
    return true;
  };
  const skipText = el => el.closest("script,style,noscript,textarea,input,select,code,pre,svg,[data-qa-skip],.wb-io,.gtable,.prose code");
  // the text on screen
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const CJK = /[㐀-鿿＀-￯　-〿]/;
  const okEnglish = new RegExp(o.okEnglish || "^$", "i");
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue.replace(/\s+/g, " ").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || skipText(el) || !shown(el)) continue;
    if (/\bundefined\b/.test(t)) add("text", `"undefined" in: ${t}`, el);
    if (/\bNaN\b/.test(t)) add("text", `"NaN" in: ${t}`, el);
    if (/\[object Object\]/.test(t)) add("text", `"[object Object]" in: ${t}`, el);
    if (/\bnull\b/.test(t) && !/null and void|\bnull\b.*\bvoid\b/i.test(t)) add("text", `"null" in: ${t}`, el);
    if (/\{[a-zA-Z_]\w*\}/.test(t)) add("text", `unfilled placeholder in: ${t}`, el);
    if (/^[a-z]+(?:_[a-zA-Z0-9]+)+$/.test(t) && !/^(sk|pk|rk|whsec|plk)_/.test(t)) add("text", `interface key shown as text: ${t}`, el);
    if (/[·•]/.test(t.replace(/•{2,}/g, ""))) add("dot", `separator dot in: ${t}`, el);
    if (zh && !CJK.test(t)) {
      // a whole English sentence (four or more words) where Chinese was expected; names, addresses, agencies, form
      // titles, file names and the like are allowed by okEnglish
      const words = t.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
      if (words.length >= 4 && /[a-z]{3}/.test(t) && !/@|https?:|\.(pdf|png|jpe?g|zip|xlsx|docx|csv|txt|ics)\b/i.test(t) && !okEnglish.test(t)) add("english", t, el);
    }
  }
  // English labels on controls in Chinese (a button the person reads)
  if (zh) for (const el of document.querySelectorAll("button,[role=tab],[role=option],[role=menuitem],a.pill,a.sbtn,label")) {
    if (!shown(el) || el.closest("[data-qa-skip]")) continue;
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (!t || CJK.test(t) || t.length < 3) continue;
    const words = t.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
    if (words.length >= 2 && /[a-z]{3}/.test(t) && !okEnglish.test(t)) add("english", `control: ${t}`, el);
  }
  // aria labels and placeholders: undefined and friends, and English in Chinese
  for (const el of document.querySelectorAll("[aria-label],[placeholder],[title]")) {
    if (!shown(el)) continue;
    for (const a of ["aria-label", "placeholder", "title"]) {
      const v = el.getAttribute(a);
      if (!v) continue;
      if (/\bundefined\b|\bNaN\b|\[object Object\]|\{[a-zA-Z_]\w*\}/.test(v)) add("text", `${a}="${v}"`, el);
      if (zh && a === "aria-label" && !CJK.test(v) && /^[A-Za-z][a-z]+(?: [a-z]+)*$/.test(v) && !okEnglish.test(v)) add("english", `aria-label="${v}"`, el);
    }
  }
  // buttons and links with nothing to read
  for (const el of document.querySelectorAll("button,a[href],[role=button],[role=tab],[role=option],[role=menuitem],[role=switch],[role=checkbox],[role=radio]")) {
    if (!shown(el)) continue;
    const name = (el.innerText || "").trim() || el.getAttribute("aria-label") || el.getAttribute("title") || [...el.querySelectorAll("img[alt]")].map(i => i.alt).join("") ||
      (el.getAttribute("aria-labelledby") || "").split(/\s+/).map(id => document.getElementById(id)?.textContent ?? "").join("").trim();
    if (!name.trim()) add("empty", `${el.tagName.toLowerCase()} with no text or label`, el);
  }
  // images that didn't load
  for (const img of document.querySelectorAll("img")) {
    if (!shown(img)) continue;
    if (img.complete && img.naturalWidth === 0) add("image", `didn't load: ${img.currentSrc || img.src}`.slice(0, 200), img);
  }
  return out;
}

/* -------------------------------- results -------------------------------- */
const findings = [];
const seenFinding = new Set();
const walked = new Map();   // flow -> combos walked
let checkpoints = 0;
const tag = c => `${c.build}/${c.lang}/${c.width}`;

/* -------------------------------- one flow in one browser -------------------------------- */
function makeWalker(page, combo, flowName) {
  const base = combo.base;
  const origin = new URL(base).origin;
  const zh = combo.lang === "zh";
  const phone = combo.width < 700;
  let stepName = "start";
  const w = {
    p: page, combo, zh, phone, base, origin, lang: combo.lang,
    /** English or Chinese, by the walk's language. */
    L: (en, zhs) => (zh ? zhs : en),
    set step(s) { stepName = s; }, get step() { return stepName; },
    async record(kind, detail, opts = {}) {
      const key = `${flowName}|${combo.build}|${combo.lang}|${kind}|${detail}`;
      // the same thing at two widths is one finding with two widths
      const near = `${flowName}|${combo.build}|${combo.lang}|${kind}|${detail}|`;
      const dup = findings.find(f => f.key === near);
      if (dup) { if (!dup.widths.includes(combo.width)) dup.widths.push(combo.width); return; }
      if (seenFinding.has(key)) return;
      seenFinding.add(key);
      const f = { key: near, flow: flowName, step: stepName, build: combo.build, lang: combo.lang, widths: [combo.width], kind, detail, where: opts.where ?? "", url: page.url().replace(origin, "") };
      if (opts.shot !== false && !page.isClosed()) {
        const name = `${findings.length + 1}-${flowName}-${combo.build}-${combo.lang}-${combo.width}.png`.replace(/[^\w.-]+/g, "_");
        f.shot = name;
        await page.screenshot({ path: join(OUT, name) }).catch(() => { delete f.shot; });
      }
      findings.push(f);
      console.log(`  FIND ${tag(combo)} ${flowName} [${stepName}] ${kind}: ${detail}${f.where ? `  (${f.where})` : ""}`);
    },
    /** Checks the screen as it is now. */
    async look(label) {
      if (label) stepName = label;
      checkpoints++;
      await page.waitForTimeout(120);
      const found = await page.evaluate(scan, { lang: combo.lang, okEnglish: combo.okEnglish }).catch(e => [{ kind: "step", detail: `couldn't check the page: ${e.message.split("\n")[0]}` }]);
      for (const x of found) await w.record(x.kind, x.detail, { where: x.where });
      if (SHOTS) await page.screenshot({ path: join(OUT, `shot-${flowName}-${tag(combo).replace(/\//g, "-")}-${stepName}.png`.replace(/[^\w.-]+/g, "_")) }).catch(() => {});
    },
    async go(path, { tourOff = true } = {}) {
      await page.goto(base + path.replace(/^\//, ""));
      // the app (the preview opens the workspace first), or a sign-in card
      await page.locator("main.content, #gate-email, #onb-line").first().waitFor({ timeout: 30000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
      if (tourOff) await w.skipTour();
    },
    async skipTour() { const s = page.locator(".tour-skip").filter({ visible: true }); if (await s.count()) { await s.first().click().catch(() => {}); await page.waitForTimeout(250); } },
    /** The first visible match: a locator, a CSS selector, or a button's name (text or RegExp). */
    find(target, within) {
      const root = within ? page.locator(within) : page;
      if (typeof target !== "string" && !(target instanceof RegExp)) return target.filter({ visible: true }).first();
      if (typeof target === "string" && /^[.#[]|^[a-z]+[.#[:\s>]|^[a-z]+$/.test(target) && !/\s[A-Z]/.test(target)) return root.locator(target).filter({ visible: true }).first();
      return root.getByRole("button", { name: target }).or(root.getByRole("link", { name: target })).or(root.getByRole("tab", { name: target })).filter({ visible: true }).first();
    },
    async has(target, within) { return (await w.find(target, within).count()) > 0; },
    /** Clicks it; a step finding when it isn't there (unless optional). */
    async tap(target, { optional = false, within, wait = 350, what } = {}) {
      const l = w.find(target, within);
      if (!(await l.count())) {
        if (!optional) await w.record("step", `couldn't find ${what ?? String(target)}`);
        return false;
      }
      await l.scrollIntoViewIfNeeded().catch(() => {});
      try { await l.click({ timeout: 10000 }); }
      catch (e) { if (!optional) await w.record("step", `couldn't click ${what ?? String(target)}: ${e.message.split("\n")[0]}`); return false; }
      await page.waitForTimeout(wait);
      return true;
    },
    async expect(ok, detail) { if (!ok) await w.record("step", detail); return !!ok; },
    async see(target, detail, { timeout = 4000, within } = {}) {
      const l = typeof target === "string" && !/^[.#[]/.test(target) ? (within ? page.locator(within) : page).getByText(target).filter({ visible: true }).first() : (target instanceof RegExp ? (within ? page.locator(within) : page).getByText(target).filter({ visible: true }).first() : w.find(target, within));
      const ok = await l.waitFor({ state: "visible", timeout }).then(() => true, () => false);
      if (!ok && detail !== false) await w.record("step", detail ?? `didn't see ${String(target)}`);
      return ok;
    },
    /** Closes whatever sheet, modal or menu is open. */
    async close() {
      for (let i = 0; i < 3; i++) {
        const open = page.locator("[role=dialog], .sheet.open, .scrim, .cmdk-back, [role=menu], [role=listbox]:not(.cmdk-list)").filter({ visible: true });
        if (!(await open.count())) return;
        const x = page.locator("[role=dialog] .icbtn.close, [role=dialog] button.close, .sheet .icbtn.close").filter({ visible: true });
        if (await x.count()) await x.last().click().catch(() => {}); else await page.keyboard.press("Escape");
        await page.waitForTimeout(250);
      }
    },
    async dialogOpen() { return (await page.locator("[role=dialog]").filter({ visible: true }).count()) > 0; },
    /** Waits until Odelia isn't working (the stop button is gone). */
    async idle(ms = 20000) { await page.locator(".sendb.stop").first().waitFor({ state: "detached", timeout: ms }).catch(() => {}); await page.waitForTimeout(300); },
    /** The phone menu, opened if the sidebar is tucked away. */
    async menu() { if (!phone) return true; const m = page.locator(".mbar .icbtn").first(); if (!(await m.count())) return false; await m.click(); await page.waitForTimeout(350); return true; },
  };
  return w;
}

/* -------------------------------- browsers -------------------------------- */
const browser = await chromium.launch();
const LIVE = /supabase\.co|placetta\.com\/(functions|rest|auth)/;

/** A fresh browser for one flow: the language set, the tour seen (unless the flow is the tour), every page address
 *  under /app/ answered with the app (as the real host does), and the live backend never reached. */
async function contextFor(combo, { tour = false, storage } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: combo.width, height: combo.width < 700 ? 844 : 800 }, reducedMotion: "reduce", acceptDownloads: true,
    locale: combo.lang === "zh" ? "zh-CN" : "en-US", ...(storage ? { storageState: storage } : {}),
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(combo.base).origin }).catch(() => {});
  await ctx.addInitScript(({ lang, tour }) => {
    try { localStorage.setItem("placetta-lang", lang); localStorage.setItem("placetta-agent-lang", lang); if (!tour) localStorage.setItem("placetta-tour-1", "1"); } catch { /* blocked */ }
  }, { lang: combo.lang, tour });
  const appBase = combo.build === "site" ? null : combo.base;
  if (appBase) await ctx.route(u => u.href.startsWith(appBase), async route => {
    if (route.request().resourceType() !== "document") return route.continue();
    try { return await route.fulfill({ response: await route.fetch({ url: appBase }) }); } catch { return route.abort().catch(() => {}); }
  });
  return ctx;
}

/** Errors the page raises, as findings of the flow. */
function listen(page, w, combo) {
  const own = u => { try { return new URL(u).origin === w.origin; } catch { return false; } };
  page.on("console", m => { if (m.type() === "error") void w.record("console", m.text().slice(0, 300), { shot: false }); });
  page.on("pageerror", e => void w.record("page", (e.message || String(e)).split("\n")[0].slice(0, 300), { where: (e.stack || "").split("\n").slice(1, 4).map(s => s.trim().replace(/https?:\/\/[^/]+/, "")).join(" ") }));
  page.on("requestfailed", r => {
    const err = r.failure()?.errorText ?? "";
    if (own(r.url()) && !/ERR_ABORTED/.test(err)) void w.record("network", `${r.method()} ${r.url().replace(w.origin, "")} failed: ${err}`, { shot: false });
  });
  page.on("response", r => { if (own(r.url()) && r.status() >= 400) void w.record("network", `${r.request().method()} ${r.url().replace(w.origin, "")} answered ${r.status()}`, { shot: false }); });
  page.on("dialog", d => { void d.dismiss().catch(() => {}); });
  page.on("popup", pop => { void pop.close().catch(() => {}); });
  if (combo.build !== "site") page.context().route(LIVE, route => { void w.record("live", `${route.request().method()} ${route.request().url().slice(0, 140)}`, { shot: false }); return route.abort(); }).catch(() => {});
}

/* -------------------------------- the preview's account -------------------------------- */
async function signUp(p, w, { email = "qa@example.com", line, answers = true, notFormed = false, skip = false } = {}) {
  await p.goto(w.base);
  const appear = (sel, ms = 15000) => p.locator(sel).first().waitFor({ timeout: ms }).then(() => true, () => false);
  await appear("#gate-email, #onb-line, main.content");
  if (await p.locator("#gate-email").count()) {
    await p.fill("#gate-email", email); await p.click("button[type=submit]");
    const code = p.getByText(/Email me a code instead|验证码/).first();
    await code.waitFor({ timeout: 15000 }).catch(() => {});
    await code.click().catch(() => {});
    if (!(await appear("#gate-code"))) return null;
    await p.fill("#gate-code", "123456"); await p.click("button[type=submit]");
  }
  if (!(await appear("#onb-line"))) return null;
  await p.fill("#onb-line", line ?? w.L("Milk tea shop in San Jose, CA", "奶茶店，加州圣何塞"));
  await p.locator("#onb-agree").check();
  await p.waitForTimeout(250);
  await p.click("form.onb button[type=submit]");
  if (!(await appear("#onb-legal"))) return null;
  if (notFormed) await p.locator(".onb-pair .chip").click();
  else if (answers) await p.fill("#onb-legal", "Lucky Leaf Tea LLC");
  if (answers) { await p.fill("#onb-owner", "Mei Chen"); await p.fill("#onb-address", "1 N First St, San Jose, CA 95113"); }
  const t0 = Date.now();
  if (skip) await p.locator(".onb-act3 .sbtn.line").click(); else await p.click("form.onb button[type=submit]");
  // Home, with the plan on it
  await p.locator("main.content h1").first().waitFor({ timeout: 15000 }).catch(() => {});
  return Date.now() - t0;
}

const storages = new Map();   // combo tag -> a signed-in preview account with its first plan, for the flows to start from
async function previewAccount(combo) {
  const k = tag(combo);
  if (storages.has(k)) return storages.get(k);
  const pr = (async () => {
    const ctx = await contextFor(combo);
    const p = await ctx.newPage();
    const w = makeWalker(p, combo, "preview-account");
    // tries again on a slow machine; a flow that starts signed out would report everything as missing
    for (let i = 0; i < 3; i++) if ((await signUp(p, w, { email: `qa-${combo.lang}-${combo.width}-${i}@example.com` })) != null && (await p.locator("main.content h1").count())) break;
    await p.waitForTimeout(1500);
    // a plan, so Odelia works for it (without one, asking her opens the plans sheet; signup-one-line walks that)
    await p.goto(combo.base + "settings/billing");
    const choose = p.getByRole("button", { name: /^(Choose a plan|选择方案)/ }).first();
    await choose.waitFor({ timeout: 20000 }).catch(() => {});
    await choose.click().catch(() => {});
    await p.getByRole("button", { name: /^(Choose Essentials|选择基础版|选择 Essentials)/ }).first().click({ timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const s = await ctx.storageState();
    await ctx.close();
    return s;
  })();
  storages.set(k, pr);
  return pr;
}

/* -------------------------------- the click-everything pass -------------------------------- */
const NEVER = /sign out|log out|退出登录|delete|删除|erase|清除|close (my|the) account|注销|leave (this )?workspace|离开工作区|revoke|撤销密钥|cancel (the )?subscription|取消订阅|turn off two-step|关闭两步|remove (key|member)|^remove$|^移除$|reset|重置|mailto:|tel:/i;

/** Every control on a page, clicked one at a time, checking the screen after each, putting the page back when a click
 *  takes it somewhere else or leaves something open. */
async function crawl(w, path, { scope = "main", max = 90, skip } = {}) {
  const p = w.p;
  await w.go(path);
  const listControls = async () => p.evaluate(({ scope }) => {
    const root = document.querySelector(scope) || document.body;
    const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && r.right > 0 && r.left < innerWidth && !e.disabled && (!e.checkVisibility || e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })); };
    const name = e => ((e.getAttribute("aria-label") || "") + " " + (e.innerText || e.value || "")).replace(/\s+/g, " ").trim().slice(0, 60);
    const all = [...root.querySelectorAll("button, a[href], [role=tab], [role=switch], input[type=checkbox], input[type=radio], select")].filter(vis);
    const count = new Map();
    return all.map(e => {
      const href = e.tagName === "A" ? e.getAttribute("href") || "" : "";
      const k = e.tagName.toLowerCase() + "|" + name(e) + "|" + href;
      const n = count.get(k) ?? 0; count.set(k, n + 1);
      return { key: k, n, name: name(e), href, tag: e.tagName.toLowerCase(), ext: !!href && /^(https?:)?\/\//.test(href) && !href.startsWith(location.origin), target: e.getAttribute("target") || "" };
    });
  }, { scope });
  const first = await listControls();
  const todo = first.filter(c => !(c.ext || /^(mailto|tel):/.test(c.href) || NEVER.test(c.name) || (skip && skip.test(c.name)))).slice(0, max);
  let clicked = 0;
  for (const c of todo) {
    w.step = `crawl ${path || "home"}: ${c.name || c.tag}`;
    if (new URL(p.url()).pathname !== new URL(w.base + path, w.base).pathname || (await w.dialogOpen())) { await w.close(); if (new URL(p.url()).pathname !== new URL(w.base + path, w.base).pathname || (await w.dialogOpen())) await w.go(path); }
    const ok = await p.evaluate(({ scope, key, n }) => {
      const root = document.querySelector(scope) || document.body;
      const name = e => ((e.getAttribute("aria-label") || "") + " " + (e.innerText || e.value || "")).replace(/\s+/g, " ").trim().slice(0, 60);
      document.querySelectorAll("[data-qa-target]").forEach(e => e.removeAttribute("data-qa-target"));
      const hits = [...root.querySelectorAll("button, a[href], [role=tab], [role=switch], input[type=checkbox], input[type=radio], select")].filter(e => e.tagName.toLowerCase() + "|" + name(e) + "|" + (e.tagName === "A" ? e.getAttribute("href") || "" : "") === key);
      const e = hits[n] ?? hits[0];
      if (!e || e.disabled) return false;
      e.setAttribute("data-qa-target", "1");
      return true;
    }, { scope, key: c.key, n: c.n });
    if (!ok) continue;
    const l = p.locator("[data-qa-target]");
    try {
      if (c.tag === "select") {
        const opts = await l.locator("option").evaluateAll(os => os.map(o => o.value));
        if (opts.length > 1) await l.selectOption(opts[opts.length - 1]);
      } else {
        await l.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        const dl = p.waitForEvent("download", { timeout: 1500 }).catch(() => null);
        const chooser = p.waitForEvent("filechooser", { timeout: 1500 }).catch(() => null);
        await l.click({ timeout: 2500 });
        const [d, fc] = await Promise.all([dl, chooser]);
        if (fc) await fc.setFiles(PDF).catch(() => {});
        if (d) await checkDownload(w, d);
      }
      clicked++;
    } catch (e) { continue; }   // covered or moved by the click before it: not a finding by itself
    await p.waitForTimeout(400);
    await w.look();
  }
  return clicked;
}

async function checkDownload(w, d, { pdf } = {}) {
  const name = d.suggestedFilename();
  const fail = await d.failure();
  if (fail) { await w.record("step", `download ${name} failed: ${fail}`); return null; }
  const path = join(FILES, `${Date.now()}-${name}`);
  await d.saveAs(path).catch(() => {});
  const { readFileSync, statSync } = await import("node:fs");
  let size = 0; try { size = statSync(path).size; } catch { /* not saved */ }
  if (!size) { await w.record("step", `download ${name} is empty`); return null; }
  if ((pdf || /\.pdf$/i.test(name)) && !readFileSync(path).subarray(0, 5).toString().startsWith("%PDF")) await w.record("step", `download ${name} isn't a PDF`);
  if (/undefined|NaN/.test(name)) await w.record("text", `download named ${name}`);
  return path;
}

/* -------------------------------- the flows -------------------------------- */
const F = [];
const flow = (name, builds, run, o = {}) => F.push({ name, builds, run, ...o });

/* ---------- sign-up, in the signed-in preview ---------- */
flow("signup-one-line", ["preview"], async w => {
  const p = w.p;
  await p.goto(w.base); await p.waitForTimeout(900);
  await w.look("sign in");
  await p.fill("#gate-email", `one-${Date.now()}@example.com`); await p.click("button[type=submit]"); await p.waitForTimeout(600);
  await w.look("password");
  if (!(await w.tap(new RegExp(w.L("Email me a code instead", "验证码"))))) return;
  await w.look("code");
  await p.fill("#gate-code", "123456"); await p.click("button[type=submit]"); await p.waitForTimeout(1800);
  await w.look("one line");
  if (!(await w.expect(await p.locator("#onb-line").count(), "no one-line onboarding after the code"))) return;
  await w.tap(".chips.ex .chip", { what: "an example line" });
  await w.look("example line picked");
  await p.fill("#onb-line", "Milk tea shop in San Jose, CA");
  await w.tap(new RegExp(w.L("Add a name, opening date", "添加店名")), { what: "the optional details link" });
  await w.look("details open");
  await p.locator("#onb-agree").check();
  await w.tap("form.onb button[type=submit]", { what: "Start" });
  await w.look("second screen");
  if (!(await w.expect(await p.locator("#onb-legal").count(), "no second screen (the three answers) after Start"))) return;
  await w.tap(new RegExp("^" + w.L("Back", "返回") + "$"), { what: "Back on the second screen" });
  await w.expect(await p.locator("#onb-line").count(), "Back didn't return to the one line");
  await w.tap("form.onb button[type=submit]", { what: "Start again" });
  await p.fill("#onb-legal", "Lucky Leaf Tea LLC"); await p.fill("#onb-owner", "Mei Chen"); await p.fill("#onb-address", "1 N First St, San Jose, CA 95113");
  const t0 = Date.now();
  await p.click("form.onb button[type=submit]");
  const ein = p.locator(".appr", { hasText: /EIN|Employer Identification|雇主识别/ }).first();
  const ok = await ein.waitFor({ timeout: 8000 }).then(() => true, () => false);
  const ms = Date.now() - t0;
  await w.look("home after sign-up");
  if (!ok) { await w.record("step", "Home didn't show the EIN application waiting for approval"); return; }
  if (ms > 2000) await w.record("step", `Home with the first win took ${ms} ms (over 2 seconds)`);
  // its approval sheet, then the plans sheet on Approve
  await ein.getByRole("button").first().click(); await p.waitForTimeout(600);
  await w.look("EIN approval sheet");
  await w.expect(await p.locator("[role=dialog]", { hasText: /EIN|Employer Identification|雇主识别/ }).count(), "the EIN approval sheet didn't open");
  const approve = p.locator("[role=dialog] .m-f .pill.ink, [role=dialog] footer .pill.ink").filter({ visible: true }).first();
  if (!(await w.expect(await approve.count(), "no Approve button in the EIN approval sheet"))) return;
  await approve.click(); await p.waitForTimeout(900);
  await w.look("plans sheet");
  await w.expect(await p.locator("[role=dialog].plans, .plans [role=dialog], [role=dialog]", { hasText: /plan|方案/i }).count(), "Approve didn't open the plans sheet");
});

flow("signup-skip", ["preview"], async w => {
  const ms = await signUp(w.p, w, { email: `skip-${Date.now()}@example.com`, skip: true });
  if (ms == null) return w.record("step", "couldn't reach the second screen to skip it");
  await w.look("home after skip");
  await w.expect(await w.p.locator("main.content h1").count(), "no Home after Skip");
  if (ms > 2000) await w.record("step", `Home after Skip took ${ms} ms`);
});

flow("signup-not-formed", ["preview"], async w => {
  const p = w.p;
  const ms = await signUp(p, w, { email: `nf-${Date.now()}@example.com`, notFormed: true });
  if (ms == null) return w.record("step", "couldn't reach the second screen");
  await w.look("home, not formed yet");
  await w.go("settings/facts");
  await w.look("facts, not formed yet");
  await w.see(w.L("Not yet", "尚未成立"), "Business facts don't say the company isn't formed yet");
});

flow("signup-chinese-line", ["preview"], async w => {
  if (!w.zh) return;
  const p = w.p;
  const ms = await signUp(p, w, { email: `zh-${Date.now()}@example.com`, line: "奶茶店，纽约法拉盛" });
  if (ms == null) return w.record("step", "the Chinese line didn't reach the second screen");
  await w.look("home from a Chinese line");
  await w.expect(await p.locator("main.content h1").count(), "no Home after a Chinese line");
});

flow("signup-existing-stores", ["preview"], async w => {
  const p = w.p;
  await p.goto(w.base); await p.waitForTimeout(900);
  await p.fill("#gate-email", `ex-${Date.now()}@example.com`); await p.click("button[type=submit]"); await p.waitForTimeout(600);
  await w.tap(new RegExp(w.L("Email me a code instead", "验证码")));
  await p.fill("#gate-code", "123456"); await p.click("button[type=submit]"); await p.waitForTimeout(1800);
  if (!(await w.tap(new RegExp(w.L("I already have stores", "我已有门店")), { what: "I already have stores" }))) return;
  await w.look("existing stores check");
  await storeCheck(w);
  await p.locator("#onb-agree").check().catch(() => {});
  await w.tap(new RegExp(w.L("Turn these into my plan", "把这些变成我的计划")), { what: "Turn these into my plan" });
  await p.waitForTimeout(2000);
  await w.look("home from existing stores");
  await w.expect(await p.locator("main.content h1").count(), "no Home after turning the store check into a plan");
});

/** The free store check (in sign-up, on Stores and on the website): two stores, what each holds, then the gaps.
 *  Leaves it on the results, where the caller applies them (or not). */
async function storeCheck(w, within = "") {
  const p = w.p;
  const scope = within ? p.locator(within).filter({ visible: true }).first() : p.locator("body");
  const btn = re => scope.getByRole("button", { name: re }).filter({ visible: true }).first();
  const city = () => scope.locator(".sc-f input[list], .sc-f input").filter({ visible: true });
  if (!(await city().count())) return w.record("step", "the store check has no fields");
  await city().first().fill("Flushing, NY");
  const add = btn(new RegExp(w.L("Add another store", "再添加一家")));
  if (await add.count()) {
    await add.click(); await p.waitForTimeout(200);
    const cities = scope.locator(".sc-stores li").last().locator("input").first();
    await cities.fill("Irvine, CA").catch(() => {});
    const sel = scope.locator(".sc-stores li").last().locator("select");
    if (await sel.count()) { const o = await sel.locator("option").evaluateAll(os => os.map(x => x.value).filter(Boolean)); if (o.length > 1) await sel.selectOption(o[1]).catch(() => {}); }
  } else await w.record("step", "the store check has no Add another store");
  await w.look("store check: stores");
  if (!(await w.tap(btn(new RegExp(w.L("Check my stores", "检查我的门店"))), { what: "Check my stores" }))) return;
  await w.look("store check: what each holds");
  // a few answers: have it, not sure, a renewal date
  const radios = scope.locator(".sc-have [role=radio]").filter({ visible: true });
  const n = await radios.count();
  if (!(await w.expect(n, "the store check lists nothing a store has to hold"))) return;
  for (let i = 0; i < Math.min(n, 9); i += 4) await radios.nth(i).click().catch(() => {});
  const date = scope.locator(".sc-date input").filter({ visible: true }).first();
  if (await date.count()) await date.fill("2027-03-01").catch(() => {});
  await w.look("store check: answered");
  if (!(await w.tap(btn(new RegExp(w.L("Show my gaps", "查看缺口"))), { what: "Show my gaps" }))) return;
  await w.look("store check: gaps");
  await w.expect(await scope.locator(".sc-find, .sc-tot").filter({ visible: true }).count(), "the store check shows no gaps or totals");
}

/* ---------- Home ---------- */
flow("home-needs-you", ["sample"], async w => {
  const p = w.p;
  const t0 = Date.now();
  await w.go("");
  await w.look("home");
  // Approve: two taps (the card, then the sheet)
  const card = p.locator(".appr").filter({ hasText: w.L("sign permit", "招牌许可") }).first();
  if (!(await w.expect(await card.count(), "no sign permit card in Needs you"))) return;
  await card.getByRole("button", { name: w.L("Approve", "批准") }).click(); await p.waitForTimeout(500);
  await w.look("approval sheet");
  const go = p.locator("[role=dialog] footer .pill.ink, [role=dialog] .m-f .pill.ink").filter({ visible: true }).first();
  if (!(await w.expect(await go.count(), "the approval sheet has no Approve button"))) return;
  await go.click(); await p.waitForTimeout(700);
  await w.look("approved: the send hold");
  // the hold: a countdown with Undo and Send now
  const hold = p.locator(".hold").filter({ visible: true }).first();
  if (await w.expect(await hold.count(), "no send-hold countdown after approving")) {
    const t1 = await hold.innerText();
    await w.expect(/Sending in \d+:\d\d|\d+:\d\d后发送|\d+ ?s|\d+ 秒/.test(t1), `the countdown reads "${t1}"`);
    await w.tap(hold.getByRole("button", { name: w.L("Undo", "撤销") }), { what: "Undo on the countdown" });
    await p.waitForTimeout(600);
    await w.look("undone");
    await w.expect(await card.getByRole("button", { name: w.L("Approve", "批准") }).count(), "after Undo the card isn't back to Approve");
    // approve again, then Send now
    await card.getByRole("button", { name: w.L("Approve", "批准") }).click(); await p.waitForTimeout(500);
    await p.locator("[role=dialog] footer .pill.ink, [role=dialog] .m-f .pill.ink").filter({ visible: true }).first().click(); await p.waitForTimeout(700);
    await w.tap(p.locator(".hold .hold-now").filter({ visible: true }), { what: "Send now" });
    await p.waitForTimeout(800);
    await w.look("sent now");
    await w.idle();
    await w.look("filed");
  }
  // Upload: two taps (the card, then the file)
  await w.go("");
  const up = p.locator(".appr").filter({ has: p.getByRole("button", { name: w.L("Upload", "上传") }) }).first();
  if (await w.expect(await up.count(), "no Upload card in Needs you")) {
    const fc = p.waitForEvent("filechooser", { timeout: 10000 }).catch(() => null);
    await up.getByRole("button", { name: w.L("Upload", "上传") }).click();
    const chooser = await fc;
    if (await w.expect(chooser, "Upload didn't open a file picker")) {
      await chooser.setFiles([PDF]);
      await p.waitForTimeout(800);
      await w.look("uploading");
      await w.idle();
      await w.look("uploaded");
    }
  }
  void t0;
});

flow("home-sections", ["sample", "preview"], async w => {
  const p = w.p;
  await w.go("");
  await w.look("home");
  // the starter chips by the message box: a new workspace (the preview's, just signed up) gets them; the sample's busy
  // one doesn't
  const chips = p.locator(".dock-chips button").filter({ visible: true });
  const nc = await chips.count();
  if (w.combo.build === "preview") await w.expect(nc > 0, "no starter chips by the message box on a new workspace's Home");
  else await w.expect(nc === 0, "starter chips on the sample's Home, which isn't new");
  for (let i = 0; i < nc; i++) {
    await w.go("");
    const fc = p.waitForEvent("filechooser", { timeout: 1500 }).catch(() => null);
    const c = p.locator(".dock-chips button").filter({ visible: true }).nth(i);
    if (!(await c.count())) break;
    const label = (await c.innerText()).trim();
    await c.click(); const ch = await fc; if (ch) await ch.setFiles(PDF);
    await p.waitForTimeout(700); await w.look(`starter chip: ${label}`); await w.idle(); await w.look(`starter chip answered: ${label}`);
    await w.close();
  }
  await w.go("");
  if (w.combo.build === "sample") {
    // Odelia working: Watch how she did it (the replay)
    if (await w.tap(p.locator("main .lnk.watch"), { what: "Watch how she did it on Home" })) { await replay(w); }
    await w.tap(new RegExp(w.L("routines", "例行")), { optional: true, what: "the routines link" });
    await w.look("routines"); await w.go("");
  }
  // the opening plan and the cost to open
  if (await w.tap(new RegExp("^" + w.L("Breakdown", "明细") + "$"), { what: "Breakdown (cost to open)" })) {
    await w.look("cost to open sheet");
    await w.expect(await w.dialogOpen(), "Breakdown didn't open the cost to open sheet");
    await w.close();
  }
  // the opening plan's rows open their drawers
  const rows = p.locator("main button.row.arow");
  for (let i = 0; i < Math.min(await rows.count(), 3); i++) {
    await rows.nth(i).scrollIntoViewIfNeeded().catch(() => {});
    await rows.nth(i).click(); await p.waitForTimeout(500); await w.look(`plan row ${i + 1}`); await w.close();
  }
  // the monthly numbers card
  const tiles = p.locator("main .met-tile");
  const nt = await tiles.count();
  if (w.combo.build === "sample") await w.expect(nt >= 4, `the monthly numbers card has ${nt} tiles`);
  for (let i = 0; i < nt; i++) {
    await w.go("");
    const t = p.locator("main .met-tile").nth(i);
    const label = (await t.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 40);
    await t.scrollIntoViewIfNeeded().catch(() => {}); await t.click().catch(() => {}); await p.waitForTimeout(500);
    await w.look(`numbers tile: ${label}`);
    await w.close();
  }
  // Coming up and Recent updates
  await w.go("");
  for (const name of [w.L("Draft it", "起草"), w.L("See what changed", "查看变化")]) {
    if (await w.tap(new RegExp("^" + name), { optional: true, wait: 600 })) { await w.look(name); await w.idle(); await w.look(name + " done"); await w.close(); await w.go(""); }
  }
  for (const name of [w.L("Open", "打开"), w.L("Handle it", "处理")]) {
    if (await w.tap(p.locator("main .sbtn").filter({ hasText: new RegExp("^" + name + "$") }), { optional: true, wait: 600 })) { await w.look(name); await w.idle(); await w.look(name + " done"); await w.close(); await w.go(""); }
  }
  // View all and See all links
  await w.go("");
  for (const t of await p.locator("main button.more").allInnerTexts()) {
    await w.go("");
    await w.tap(p.locator("main button.more").filter({ hasText: t }), { optional: true });
    await w.look(`more: ${t}`);
  }
});

async function replay(w) {
  const p = w.p;
  await p.waitForTimeout(500);
  await w.look("replay");
  const sh = p.locator(".wb-player").filter({ visible: true });
  if (!(await w.expect(await sh.count(), "the replay has no player (play, scrubber)"))) { await w.close(); return; }
  const scrub = p.locator(".wb-scrub").first();
  const max = Number(await scrub.getAttribute("max"));
  await w.expect(max >= 1, `the replay scrubber has ${max + 1} moments`);
  await scrub.fill(String(Math.floor(max / 2))).catch(() => {});
  await p.waitForTimeout(300);
  const pos = await p.locator(".wb-pos").first().innerText().catch(() => "");
  await w.expect(pos.startsWith(String(Math.floor(max / 2) + 1)), `the scrubber moved to the middle but the position reads "${pos}"`);
  await w.look("replay scrubbed");
  await w.tap(p.locator(".wb-player .icbtn").last(), { what: "Forward one moment" });
  await w.tap(p.locator(".wb-play"), { what: "Play" });
  await p.waitForTimeout(1200);
  await w.tap(p.locator(".wb-play"), { what: "Pause" });
  await w.look("replay played");
  await w.close();
}

/* ---------- Permits ---------- */
flow("permits", ["sample", "preview"], async w => {
  const p = w.p;
  for (const tab of ["", "filed", "documents", "deadlines"]) {
    await w.go("permits" + (tab ? "/" + tab : ""));
    await w.look(`permits ${tab || "to do"}`);
    // an application drawer on every tab
    const row = p.locator("main .apps-t .tr.row, main button.row.arow, main .dl-row button, main .pill.quiet.sm").filter({ visible: true }).first();
    if (tab !== "documents") {
      // a new account (the preview's) has nothing filed yet, and maybe no deadlines
      if (await w.expect(await row.count() || (w.combo.build === "preview" && tab !== ""), `no application rows on Permits ${tab || "to do"}`) && await row.count()) {
        await row.click(); await p.waitForTimeout(600);
        await drawer(w, `permits ${tab || "to do"}`);
      }
    } else {
      // Documents: the filters, a download, an upload
      for (const f of await p.locator("main .seg button, main [role=tablist] button").filter({ visible: true }).all()) { await f.click().catch(() => {}); await p.waitForTimeout(200); }
      await w.look("documents filtered");
      const dl = p.locator("main button.fdl").filter({ visible: true });
      if (await dl.count()) { const d = p.waitForEvent("download", { timeout: 4000 }).catch(() => null); await dl.first().click(); const got = await d; if (await w.expect(got, "a document's download button gave no file")) await checkDownload(w, got); }
      const fc = p.waitForEvent("filechooser", { timeout: 2000 }).catch(() => null);
      if (await w.tap(new RegExp("^" + w.L("Upload", "上传") + "$"), { optional: true })) { const ch = await fc; if (ch) { await ch.setFiles(PNG); await p.waitForTimeout(800); } await w.look("document uploaded"); await w.close(); }
    }
  }
  // Deadlines: each action
  await w.go("permits/deadlines");
  for (const name of [w.L("Remind them", "提醒"), w.L("Prepare it", "准备"), w.L("File what's ready", "提交")]) {
    if (await w.tap(new RegExp("^" + name), { optional: true, wait: 500 })) { await w.look(name); await w.idle(); await w.close(); await w.go("permits/deadlines"); }
  }
  // Find licenses
  await w.go("permits");
  await w.tap(new RegExp(w.L("^Find licenses", "^查找")), { what: "Find licenses" });
  await w.look("find licenses");
  const ex = p.locator("main button").filter({ hasText: /San Jose|圣何塞/ }).first();
  if (await ex.count()) { await ex.click(); await p.locator(".hit").first().waitFor({ timeout: 20000 }).catch(() => {}); await p.waitForTimeout(600); await w.look("find results"); await w.expect(await p.locator(".hit").count(), "Find licenses showed no results"); }
  else {
    const inputs = p.locator("main input").filter({ visible: true });
    if (await inputs.count() >= 2) { await inputs.nth(0).fill("Milk tea shop"); await inputs.nth(1).fill("San Jose, CA"); await w.tap(".m-go", { what: "the Find button" }); await p.locator(".hit").first().waitFor({ timeout: 20000 }).catch(() => {}); await w.look("find results"); }
  }
  const hit = p.locator(".hit button, button.hit").filter({ visible: true }).first();
  if (await hit.count()) { await hit.click(); await p.waitForTimeout(500); await w.look("find result opened"); await w.close(); }
});

/** An application's drawer: every tab, the filled official form where offered. */
async function drawer(w, where) {
  const p = w.p;
  await w.look(`${where}: drawer`);
  if (!(await w.expect(await w.dialogOpen(), `${where}: the row didn't open its drawer`))) return;
  const tabs = p.locator("[role=dialog] [role=tab]").filter({ visible: true });
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click().catch(() => {}); await p.waitForTimeout(350);
    const name = (await tabs.nth(i).innerText().catch(() => String(i))).trim();
    await w.look(`${where}: drawer tab ${name}`);
    const off = p.locator("[role=dialog]").getByRole("button", { name: new RegExp(w.L("filled official form|official form", "官方表格")) }).filter({ visible: true });
    if (await off.count()) {
      const d = p.waitForEvent("download", { timeout: 25000 }).catch(() => null);
      await off.first().click();
      const got = await d;
      if (await w.expect(got, `${where}: "Download the filled official form" gave no file`)) await checkDownload(w, got, { pdf: true });
      await w.look(`${where}: filled form downloaded`);
    }
  }
  await w.close();
}

flow("permits-every-drawer", ["sample"], async w => {
  const p = w.p;
  for (const tab of ["", "filed"]) {
    await w.go("permits" + (tab ? "/" + tab : ""));
    const rows = p.locator("main .apps-t .tr.row, main button.row.arow").filter({ visible: true });
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      await w.go("permits" + (tab ? "/" + tab : ""));
      const r = p.locator("main .apps-t .tr.row, main button.row.arow").filter({ visible: true }).nth(i);
      const name = (await r.innerText().catch(() => "")).split("\n")[0].slice(0, 40);
      await r.scrollIntoViewIfNeeded().catch(() => {}); await r.click(); await p.waitForTimeout(500);
      await drawer(w, `${tab || "to do"}: ${name}`);
    }
  }
});

/* ---------- Stores ---------- */
flow("stores", ["sample", "preview"], async w => {
  const p = w.p;
  await w.go("stores");
  await w.look("stores");
  const n = await p.locator("main button.store").filter({ visible: true }).count();
  if (w.combo.build === "sample") await w.expect(n >= 2, `Stores lists ${n} stores`);
  const openStore = async i => {
    await w.go("stores");
    const s = p.locator("main button.store").filter({ visible: true }).nth(i);
    await s.click(); await p.waitForTimeout(600);
  };
  for (let i = 0; i < n; i++) {
    await openStore(i);
    await w.look(`store ${i + 1}`);
    if (!(await w.expect(await p.locator("main .back").filter({ visible: true }).count(), `store ${i + 1} didn't open its page`))) continue;
    // the store's bot: its jobs, and the replay of one
    if (w.combo.build === "sample") await w.expect(await p.getByText(new RegExp(w.L("This store's bot", "这家门店的助手|门店助手"))).filter({ visible: true }).count(), `store ${i + 1} has no store bot section`);
    if (await w.tap(p.locator("main .lnk.watch").first(), { optional: true })) await replay(w);
    // every control on the store's page: logs, inspections (open each one), mock inspection, How
    await openStore(i);
    for (const d of await p.locator("main details:not([open]) > summary").all()) { await d.click().catch(() => {}); await p.waitForTimeout(150); }
    await w.look(`store ${i + 1}: inspections open`);
    const labels = [...new Set((await p.locator("main .page button, main button").filter({ visible: true }).allInnerTexts()).map(x => x.replace(/\s+/g, " ").trim()).filter(x => x && !NEVER.test(x)))].slice(0, 14);
    for (const label of labels) {
      if (!(await p.locator("main .back").filter({ visible: true }).count())) await openStore(i);
      const b = p.locator("main button").filter({ hasText: label }).filter({ visible: true }).first();
      if (!(await b.count())) continue;
      const fc = p.waitForEvent("filechooser", { timeout: 800 }).catch(() => null);
      await b.scrollIntoViewIfNeeded().catch(() => {});
      await b.click().catch(() => {}); const ch = await fc; if (ch) await ch.setFiles(PDF);
      await p.waitForTimeout(450); await w.look(`store ${i + 1}: ${label.slice(0, 30)}`);
      await w.close(); await w.idle();
    }
    const box = p.locator("main .insp-list input[type=checkbox]").filter({ visible: true }).first();
    if (await box.count()) { await box.check().catch(() => {}); await p.waitForTimeout(200); await w.look(`store ${i + 1}: inspection item ticked`); }
  }
  // the check for stores already open
  await w.go("stores");
  if (await w.tap(new RegExp(w.L("Check stores already open", "检查已开业")), { what: "Check stores already open" })) {
    await w.look("existing-stores check");
    await storeCheck(w, ".sc-panel");
    if (await w.tap(new RegExp(w.L("Add these stores and gaps to my plan", "把这些门店和缺口加入计划")), { what: "Add these stores and gaps to my plan", wait: 900 })) {
      await w.look("stores added from the check");
      await w.expect((await p.locator("main button.store").filter({ visible: true }).count()) > n, "the store check added no stores");
    }
  }
  await w.go("stores");
  if (await w.tap(new RegExp(w.L("Plan many stores", "规划多家")), { optional: true })) { await w.look("plan many stores"); await w.close(); }
});

/* ---------- Odelia ---------- */
async function box(w) {
  const p = w.p;
  const b = p.locator(".panel textarea, #ask-panel, .dockbar textarea").filter({ visible: true }).first();
  await b.waitFor({ timeout: 4000 }).catch(() => {});
  return b;
}
async function send(w, text, { wait = true } = {}) {
  const b = await box(w);
  if (!(await b.count())) { await w.record("step", "no message box"); return false; }
  await b.fill(text); await b.press("Enter");
  if (wait) await w.idle();
  return true;
}

flow("odelia-chat", ["sample", "preview"], async w => {
  const p = w.p;
  await w.go("odelia");
  await w.look("chat");
  // send, and her answer streams in step by step
  const before = await p.locator(".answer").count();
  await send(w, w.L("What's blocking our opening date?", "什么在拖延我们的开业日期？"), { wait: false });
  await w.expect(await p.locator(".sendb.stop").first().waitFor({ timeout: 3000 }).then(() => true, () => false), "no Stop button while she works");
  await w.expect(await p.locator(".steps.live li").first().waitFor({ timeout: 4000 }).then(() => true, () => false), "no steps streaming while she works");
  await w.look("streaming");
  // a message sent while she works waits its turn
  await send(w, w.L("And what's due this week?", "这周有什么到期？"), { wait: false });
  await p.waitForTimeout(400);
  await w.look("queued");
  await w.expect(await p.getByText(new RegExp(w.L("Up next|queued|waits|Waiting", "排队|稍后|下一个|等待"), "i")).filter({ visible: true }).count(), "a message sent while she works shows no sign it's queued");
  await w.idle(30000); await w.idle(30000);
  await w.look("answered");
  await w.expect((await p.locator(".answer").count()) > before, "no answer after sending");
  // stop
  await w.idle(30000);
  await send(w, w.L("What's blocking our opening date?", "什么在拖延我们的开业日期？"), { wait: false });
  const stopB = p.locator(".sendb.stop").first();
  if (await w.expect(await stopB.waitFor({ timeout: 4000 }).then(() => true, () => false), "no Stop button right after sending")) {
    const steps0 = await p.locator(".steps li").count();
    await stopB.click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(2500);
    // stopped: no more steps arrive
    await w.expect((await p.locator(".steps li").count()) <= steps0 + 1, "steps kept coming after Stop");
  }
  await w.look("stopped");
  await w.expect(!(await p.locator(".sendb.stop").count()), "Stop didn't stop her");
  // the / menu and every command
  const b = await box(w);
  await b.fill("/"); await p.waitForTimeout(300);
  await w.look("/ menu");
  const opts = p.locator(".slash [role=option]");
  const n = await opts.count();
  if (!(await w.expect(n >= 7, `the / menu lists ${n} commands`))) return;
  const cmds = await p.evaluate(() => [...document.querySelectorAll(".slash [role=option] code")].map(e => (e.firstChild?.textContent ?? "").trim()));
  for (const cmd of cmds) {
    w.step = `command ${cmd}`;
    await w.go("odelia");
    const bx = await box(w);
    await bx.fill(cmd.slice(0, 3)); await p.waitForTimeout(250);
    const idx = await p.evaluate(c => [...document.querySelectorAll(".slash [role=option] code")].findIndex(e => (e.firstChild?.textContent ?? "").trim() === c), cmd);
    if (idx < 0) { await w.record("step", `typing ${cmd.slice(0, 3)} doesn't find ${cmd}`); continue; }
    await p.locator(".slash [role=option]").nth(idx).click(); await p.waitForTimeout(300);
    const v = await bx.inputValue().catch(() => "");
    if (v.trim()) { await bx.press("Enter"); }
    await p.waitForTimeout(500);
    await w.look(`command ${cmd} sent`);
    await w.idle(20000);
    await w.look(`command ${cmd} answered`);
  }
});

flow("odelia-plan-first", ["sample", "preview"], async w => {
  const p = w.p;
  await w.go("odelia");
  if (!(await w.tap(".composer .pf", { what: "the Plan first toggle" }))) return;
  await w.expect(await p.locator(".composer .pf[aria-pressed=true], .composer .pf.on").count(), "Plan first doesn't show as on after a tap");
  await send(w, w.L("Get the Fremont store its permits", "为弗里蒙特门店办好许可"));
  await w.look("plan written");
  if (!(await w.expect(await p.locator(".plan-gate").filter({ visible: true }).count(), "no plan waiting for approval after Plan first"))) return;
  await w.tap(p.locator(".plan-gate").getByRole("button", { name: w.L("Change it", "修改") }), { what: "Change it" });
  await w.look("change the plan");
  await w.tap(p.locator(".plan-gate").getByRole("button", { name: w.L("Cancel", "取消") }), { optional: true });
  await w.tap(p.locator(".plan-gate").getByRole("button", { name: w.L("Approve plan", "批准计划") }), { what: "Approve plan" });
  await p.waitForTimeout(600);
  await w.look("plan approved");
  await w.idle(30000);
  await w.look("plan running");
  // the slash form of it
  await w.go("odelia");
  await send(w, "/plan " + w.L("renew the seller's permit", "续办销售许可证"));
  await w.look("/plan answered");
  await w.expect(await p.locator(".plan-gate").filter({ visible: true }).count(), "/plan didn't put a plan up for approval");
});

flow("odelia-memory-person-undo", ["sample", "preview"], async w => {
  const p = w.p;
  await w.go("odelia");
  // Remembered chips and Forget
  await send(w, w.L("Kevin Wu is our contractor, kevin@kbuild.com. Text me for anything due this week.", "Kevin 是我们的承包商，邮箱 kevin@kbuild.com。本周到期的事请发短信给我。"));
  await p.waitForTimeout(1500);
  await w.look("remembered");
  const chip = p.locator(".rmb-chip").filter({ visible: true });
  if (await w.expect(await chip.count(), "no Remembered chip after saying who the contractor is")) {
    await w.tap(p.locator(".rmb-chip .rmb-b").filter({ hasText: w.L("Forget", "忘记") }).first(), { what: "Forget" });
    await w.look("forgotten");
    await w.tap(p.locator(".rmb-chip .rmb-b").filter({ hasText: w.L("Undo", "撤销") }).first(), { what: "Undo forget" });
    await w.look("forget undone");
  }
  // an answer that states a requirement and changes the workspace: its Sources line, and Undo what she did
  await send(w, w.L("What changed in the county plan check?", "县政府的图纸审查有什么变化？"));
  await w.look("rule change answered");
  const srcs = p.locator(".answer .sources").filter({ visible: true }).last();
  // (the scripted demo answers about the sample's own permits; a new account's permits are others)
  if (w.combo.build === "sample" && await w.expect(await srcs.count(), "no Sources line under an answer that states a requirement")) {
    const links = await srcs.locator("a").evaluateAll(as => as.map(a => a.getAttribute("href") ?? ""));
    await w.expect(links.length && links.every(h => /^https:\/\//.test(h)), `the Sources line's links aren't agency pages: ${links.join(", ")}`);
  }
  // Ask a person
  if (await w.tap(p.locator(".ask-person").filter({ visible: true }).first(), { what: "Ask a person" })) {
    await w.look("ask a person");
    const ta = p.locator("[role=dialog] textarea").filter({ visible: true }).first();
    if (await w.expect(await ta.count(), "Ask a person has no message box")) {
      await ta.fill(w.L("Can someone check the plan check fee?", "能请人核对一下图纸审查费用吗？"));
      await w.tap(p.locator("[role=dialog] .m-f .pill.ink, [role=dialog] button[type=submit]").filter({ visible: true }).first(), { what: "Send to a person" });
      await p.waitForTimeout(800);
      await w.look("asked a person");
    }
    await w.close();
  }
  // Undo what she did, where a reply offers it
  const undo = p.locator(".undo-b").filter({ visible: true });
  if (await undo.count()) {
    await undo.first().click(); await p.waitForTimeout(300);
    await w.look("undo asked");
    await w.tap(p.locator(".undo-ask .pill.ink").first(), { what: "Undo (confirm)" });
    await p.waitForTimeout(600);
    await w.look("undone");
  } else if (w.combo.build === "sample") await w.record("step", "no reply in the chat offers Undo what she did");
  // replay from the chat
  if (await w.tap(p.locator("main .lnk.watch, .panel .lnk.watch").filter({ visible: true }).first(), { optional: true })) await replay(w);
});

flow("odelia-work", ["sample", "preview"], async w => {
  const p = w.p;
  await w.go("odelia/work");
  await w.look("work");
  if (w.combo.build === "sample") {
    await w.expect(await p.getByText(new RegExp(w.L("Across your stores", "所有门店"))).count(), "no chief-of-staff row (Across your stores) on Work");
    await w.expect(await p.getByText(new RegExp(w.L("This store's bot", "门店助手|这家门店"))).count(), "no store group with its bot on Work");
  }
  for (const t of await p.locator("main .hz-tog, main .sec-h.tog").all()) { await t.click().catch(() => {}); await p.waitForTimeout(200); }
  await w.look("work opened up");
  if (await w.tap(p.locator("main .lnk.watch").first(), { optional: true })) await replay(w);
  for (const name of [w.L("Run now", "立即运行"), w.L("Pause", "暂停"), w.L("Use a sample file", "使用示例文件"), w.L("Review and approve", "审核并批准"), w.L("Stop this job", "停止这项工作"), w.L("Stop it at every store", "在所有门店停止")]) {
    await w.go("odelia/work");
    for (const t of await p.locator("main .hz-tog, main .sec-h.tog").all()) await t.click().catch(() => {});
    if (await w.tap(new RegExp("^" + name), { optional: true, wait: 600 })) { await w.look(`work: ${name}`); await w.close(); await w.idle(); await w.look(`work: ${name} done`); }
  }
});

flow("odelia-playbooks-updates", ["sample", "preview"], async w => {
  const p = w.p;
  await w.go("odelia/playbooks");
  await w.look("playbooks");
  const q = p.locator("main input[type=search], main input[aria-label]").filter({ visible: true }).first();
  if (await q.count()) { await q.fill(w.L("renew", "续")); await p.waitForTimeout(300); await w.look("playbooks searched"); await q.fill(""); }
  await w.tap(p.locator("main .pb-tog").first(), { optional: true }); await w.look("playbook steps");
  if (await w.tap(p.locator("main .sbtn.line").filter({ hasText: new RegExp("^" + w.L("Run", "运行") + "$") }).first(), { optional: true, wait: 600 })) { await w.look("playbook run"); await w.idle(); await w.look("playbook ran"); }
  await w.go("odelia/updates");
  await w.look("updates");
  for (const name of [w.L("Handle it", "处理"), w.L("Open", "打开")]) {
    await w.go("odelia/updates");
    if (await w.tap(p.locator("main .sbtn").filter({ hasText: new RegExp("^" + name + "$") }).first(), { optional: true, wait: 600 })) { await w.look(`update: ${name}`); await w.close(); await w.idle(); }
  }
});

/* ---------- Settings ---------- */
const SETTINGS = ["general", "facts", "team", "odelia", "connections", "billing", "security", "privacy", "activity", "help"];
flow("settings", ["sample", "preview"], async w => {
  const p = w.p;
  for (const c of SETTINGS) {
    await w.go("settings/" + c);
    await w.look(`settings ${c}`);
  }
  // the language switch
  await w.go("settings/general");
  const grp = p.locator("main section, main .sg").filter({ has: p.locator("h2", { hasText: new RegExp("^" + w.L("Language", "语言") + "$") }) }).last();
  if (await w.tap(grp.getByRole("button", { name: new RegExp("^" + w.L("Change", "更改") + "$") }), { what: "Change (language)" })) {
    await w.look("language picker");
    const search = p.locator("[role=dialog] input[type=search]").first();
    await search.fill(w.zh ? "English" : "中文").catch(() => {});
    await p.waitForTimeout(250);
    await w.look("language searched");
    const opt = p.locator("[role=dialog] [role=option]").filter({ visible: true }).first();
    if (await w.expect(await opt.count(), "searching the language picker finds nothing")) {
      await opt.click(); await p.waitForTimeout(500);
      const h = await p.locator("main h1").first().innerText();
      await w.expect(w.zh ? !/[一-鿿]/.test(h) : /[一-鿿]/.test(h), `picking ${w.zh ? "English" : "中文"} didn't change the page (h1 "${h}")`);
      await w.look("language switched");
    }
  }
});

flow("settings-odelia-controls", ["sample", "preview"], async w => {
  const p = w.p;
  await w.go("settings/odelia");
  // permission modes
  for (const m of [w.L("Ask me first", "先问我"), w.L("Plan first", "先做计划"), w.L("Usual", "常规")]) {
    const r = p.locator("main").getByLabel(m, { exact: false }).filter({ visible: true }).first();
    if (await r.count()) { await r.check({ force: true }).catch(() => r.click().catch(() => {})); await p.waitForTimeout(300); await w.look(`mode ${m}`); }
    else await w.record("step", `no "${m}" permission mode in Settings, Odelia`);
  }
  // an allow / never rule
  const what = p.locator("main select[aria-label]").filter({ visible: true }).first();
  if (await what.count()) {
    const opts = await what.locator("option").evaluateAll(os => os.map(o => o.value));
    if (opts.length) await what.selectOption(opts[0]);
    const inp = p.locator("main input[placeholder*='landlord'], main input[placeholder*='房东']").filter({ visible: true }).first();
    if (await inp.count()) await inp.fill(w.L("landlord", "房东"));
    await w.tap(p.locator("main .sbtn.ink").filter({ hasText: new RegExp("^" + w.L("Add", "添加") + "$") }).first(), { what: "Add (rule)" });
    await w.look("rule added");
  }
  // a business rule
  const ruleTo = p.locator("main input[placeholder*='@']").filter({ visible: true }).first();
  if (await ruleTo.count()) {
    await ruleTo.fill("kevin@contractor.com");
    await w.tap(new RegExp("^" + w.L("Add rule", "添加规则")), { what: "Add rule (business rule)" });
    await w.look("business rule added");
  }
  // memory and skills
  for (const name of [w.L("View", "查看"), w.L("Start import", "开始导入"), w.L("Create skill", "创建技能")]) {
    await w.go("settings/odelia");
    if (await w.tap(new RegExp("^" + name), { optional: true })) { await w.look(`odelia settings: ${name}`); await w.close(); }
  }
  // house rules
  await w.go("settings/facts");
  await w.tap(new RegExp(w.L("Start from the example", "从示例开始")), { optional: true });
  const house = p.locator("#house-text");
  if (await w.expect(await house.count(), "no house rules box in Business facts")) {
    await house.fill(w.L("We close on Mondays. Mei approves every filing.", "我们周一休息。Mei 批准每一项申报。"));
    await w.tap(p.locator("main .sbtn.ink").filter({ hasText: new RegExp("^" + w.L("Save", "保存") + "$") }).first(), { what: "Save house rules" });
    await w.look("house rules saved");
  }
  // edit a business fact
  if (await w.tap(p.locator("main .icbtn[aria-label]").first(), { optional: true })) { await w.look("fact editing"); await p.keyboard.press("Escape"); }
});

flow("settings-integrations", ["sample", "preview"], async w => {
  const p = w.p;
  await w.go("settings/connections");
  await w.look("connections");
  // the bot set-up forms (WeChat, Slack, Lark)
  for (const bot of ["WeChat", "Slack", "Lark"]) {
    await w.go("settings/connections");
    const row = p.locator(".sg-row").filter({ hasText: new RegExp(`Odelia in ${bot}|${bot}.*Odelia|在${bot === "WeChat" ? "微信" : bot === "Lark" ? "飞书" : "Slack"}`) }).first();
    if (!(await row.count())) { await w.record("step", `no Odelia in ${bot} row in Connections`); continue; }
    await row.getByRole("button").first().click().catch(() => {}); await p.waitForTimeout(600);
    await w.look(`${bot} bot form`);
    await w.close();
  }
  // Square and Toast: "Opens soon"
  for (const app of ["Square", "Toast"]) {
    const row = p.locator(".sg-row").filter({ hasText: app }).first();
    if (!(await row.count())) { await w.record("step", `no ${app} row in Connections`); continue; }
    const t = await row.innerText();
    if (w.combo.build === "sample" || !/Connect|连接/.test(t)) await w.expect(/Opens soon|即将开放/.test(t) || /Connect|连接/.test(t), `${app}'s row says neither Opens soon nor Connect: ${t.replace(/\s+/g, " ").slice(0, 120)}`);
  }
  // connect any app (MCP): the form and the catalog
  await w.go("settings/connections");
  const add = p.locator("main").getByRole("button", { name: new RegExp("^" + w.L("Add", "添加") + "$") }).filter({ visible: true });
  if (await add.count()) { await add.last().click(); await p.waitForTimeout(500); await w.look("connect any app form"); await w.close(); }
  else await w.record("step", "no Add (connect any app) button");
  const tok = p.locator("main").getByRole("button", { name: new RegExp(w.L("Use a token", "使用令牌")) }).filter({ visible: true });
  if (await tok.count()) { await tok.first().click(); await p.waitForTimeout(400); await w.look("catalog: use a token"); await w.close(); }
});

/* ---------- Navigation: More, ⌘K, the phone's tab bar and menu, the tour ---------- */
flow("navigation", ["sample", "preview"], async w => {
  const p = w.p;
  await w.go("");
  if (!w.phone) {
    if (await w.tap(".moreb", { what: "More" })) {
      await w.look("more open");
      const rows = await p.locator(".nav .moreb ~ li a, .nav li.more-row a, .nav a.more-a").count();
      void rows;
    }
  } else {
    // the tab bar: every tab
    for (const t of await p.locator(".tabbar a").all()) { await t.click().catch(() => {}); await p.waitForTimeout(400); await w.look("tab: " + (await t.innerText().catch(() => "")).trim()); }
    // the menu (drawer)
    if (await w.menu()) {
      await w.look("phone menu");
      const links = p.locator("nav.side a, .side a").filter({ visible: true });
      await w.expect(await links.count(), "the phone menu shows no links");
      await p.keyboard.press("Escape"); await p.locator(".navscrim").click({ force: true }).catch(() => {});
    } else await w.record("step", "no menu button on the phone");
  }
  // ⌘K: old page names find their new homes
  for (const q of [w.L("Documents", "文件"), w.L("Deadlines", "截止"), w.L("Activity", "动态"), w.L("Work", "工作"), w.L("Business facts", "企业资料"), w.L("Applications", "申请")]) {
    await w.go("");
    if (!w.phone || !(await p.locator(".cmdk-open").filter({ visible: true }).count())) await w.menu();
    const opener = p.locator(".cmdk-open").filter({ visible: true });
    if (await opener.count()) await opener.first().click(); else await p.keyboard.press("Control+k");
    await p.waitForTimeout(300);
    if (!(await p.locator(".cmdk").filter({ visible: true }).count())) { await w.record("step", "⌘K didn't open"); break; }
    await p.keyboard.type(q); await p.waitForTimeout(300);
    await w.look(`⌘K: ${q}`);
    const first = p.locator(".cmdk-list [role=option]").first();
    if (!(await w.expect(await first.count(), `⌘K finds nothing for "${q}"`))) continue;
    const before = p.url();
    await p.keyboard.press("Enter"); await p.waitForTimeout(500);
    await w.look(`⌘K went: ${q}`);
    await w.expect(p.url() !== before || (await w.dialogOpen()), `⌘K Enter on "${q}" went nowhere`);
  }
  // old addresses open their new homes
  for (const old of ["work", "applications", "documents", "deadlines", "activity", "context", "find"]) { await w.go(old); await w.look(`old address /${old}`); }
});

flow("tour", ["sample", "preview"], async w => {
  const p = w.p;
  await p.evaluate(() => { try { localStorage.removeItem("placetta-tour-1"); } catch { /* blocked */ } }).catch(() => {});
  await w.go("", { tourOff: false });
  // a new account's tour waits while the application filled at sign-up waits, so the first tap is Approve
  if (w.combo.build === "preview" && await p.locator(".appr", { hasText: /EIN|Employer Identification|雇主识别/ }).count()) {
    await p.waitForTimeout(1500);
    await w.expect(!(await p.locator(".tour").filter({ visible: true }).count()), "the tour opened over the first win waiting for approval");
    await w.go("settings/help", { tourOff: false });
    await w.tap(new RegExp("^" + w.L("Start", "开始") + "$"), { what: "Take the tour (Start)" });
  }
  if (!(await w.see(".tour", "the tour didn't start on a first visit", { timeout: 10000 }))) return;
  for (let i = 0; i < 6; i++) {
    await w.look(`tour step ${i + 1}`);
    const next = p.locator(".tour .sbtn.ink").filter({ visible: true });
    if (!(await next.count())) break;
    await next.click(); await p.waitForTimeout(500);
  }
  await w.expect(!(await p.locator(".tour").filter({ visible: true }).count()), "the tour is still open after its last step");
  await w.go("", { tourOff: false });
  await w.expect(!(await p.locator(".tour").filter({ visible: true }).count()), "the tour came back after it was finished");
}, { tour: true });

flow("partner", ["sample"], async w => {
  const p = w.p;
  await w.go("partner");
  await w.look("partner dashboard");
  for (const b of await p.locator("main").getByRole("button", { name: new RegExp("^" + w.L("Copy", "复制")) }).all()) { await b.click().catch(() => {}); await p.waitForTimeout(250); }
  await w.look("partner copied");
  const key = p.locator("main input").filter({ visible: true }).last();
  if (await key.count()) { await key.fill(w.L("Our CRM", "我们的 CRM")); await w.tap(new RegExp(w.L("^Make a key", "生成|创建")), { what: "Make a key" }); await w.look("partner key made"); }
});

/* ---------- the Placetta team's pages, in the preview ---------- */
flow("staff-ops", ["preview"], async w => {
  const p = w.p;
  // a fresh @placetta.com account with two-step on
  await signUp(p, w, { email: `ops-${Date.now()}@placetta.com` });
  await p.waitForTimeout(1200);
  await w.go("queue");
  await w.look("ops locked");
  if (!(await w.tap(new RegExp(w.L("Set up two-step", "设置两步")), { what: "Set up two-step sign-in" }))) return;
  await w.look("security");
  const start = p.locator("main").getByRole("button", { name: new RegExp(w.L("Set up|Turn on|Start", "设置|开启")) }).filter({ visible: true }).first();
  if (await start.count()) { await start.click(); await p.waitForTimeout(800); }
  await w.look("two-step setup");
  const code = p.locator("input[inputmode=numeric], input[autocomplete=one-time-code], input[name*=code], input[id*=code]").filter({ visible: true }).first();
  if (!(await w.expect(await code.count(), "two-step setup has no code box"))) return;
  await code.fill("123456");
  // the button beside the code (the Settings PIN below has a Turn on of its own)
  await w.tap(code.locator("xpath=following-sibling::button[1]"), { what: "Turn on (two-step code)" });
  await p.waitForTimeout(1200);
  await w.look("two-step on");
  for (const tab of ["", "reviews", "health", "partners", "incidents"]) {
    await w.go("queue" + (tab ? "/" + tab : ""));
    await w.look(`ops ${tab || "filings"}`);
    await w.expect(!(await p.getByText(new RegExp(w.L("Set up two-step sign-in", "设置两步登录"))).filter({ visible: true }).count()), `ops ${tab || "filings"} is still locked after two-step`);
    if (tab === "health") await w.expect(await p.getByText(new RegExp(w.L("Agent health", "Agent 健康"))).count(), "no Agent health page");
  }
  await w.go("queue");
  await w.expect(await p.getByText(/AI cost|AI 成本|AI spend|AI 用量|cost this month|本月/i).count(), "no AI cost card on the Ops queue");
});

/* ---------- the click-everything pass ---------- */
const CRAWL_PAGES = ["", "permits", "permits/filed", "permits/documents", "permits/deadlines", "permits/find", "stores", "odelia", "odelia/work", "odelia/playbooks", "odelia/updates", ...SETTINGS.map(s => "settings/" + s), "partner"];
if (CRAWL) for (const path of CRAWL_PAGES) flow("crawl " + (path || "home"), path === "partner" ? ["sample"] : ["sample", "preview"], async w => {
  if (w.phone) return;   // the pass runs at desktop width; the phone gets the flows above
  await w.look("page");
  await crawl(w, path, { skip: /^(Send|发送)$/ });
}, { crawl: true });

/* ---------- the website ---------- */
flow("site-home", ["site"], async w => {
  const p = w.p;
  await p.goto(w.base); await p.waitForTimeout(1200);
  await w.look("landing");
  // the language toggle
  const other = w.zh ? "EN" : "中文";
  const tog = p.locator(".lgt [data-lang], #lBtn").filter({ hasText: new RegExp("^" + other + "$") }).filter({ visible: true }).first();
  if (await tog.count()) { await tog.click(); await p.waitForTimeout(500); await w.look("landing switched"); await p.locator(".lgt [data-lang]").filter({ hasText: w.zh ? "中文" : "EN" }).first().click().catch(() => {}); await p.waitForTimeout(300); }
  else await w.record("step", "no language toggle on the landing page");
  // the lead form: the hero box, then the sheet, to the end
  await p.fill("#st-hero", "Los Angeles");
  await p.locator("form.starter[data-src=hero] button[type=submit]").click();
  await p.waitForTimeout(800);
  await w.look("lead sheet");
  if (!(await w.expect(await p.locator("#sheet").isVisible().catch(() => false), "Get my plan didn't open the sheet"))) return;
  const body = p.locator("#qBody");
  const step = async n => { await p.waitForTimeout(450); await w.look(`lead sheet step ${n}`); };
  // the market (skipped when the box already said it), industry and headquarters, opening and how many, then contact
  for (let i = 1; i <= 5 && !(await body.locator("#q-contact").count()); i++) {
    await step(i);
    if (await body.locator("#q-market").count()) await w.tap(body.locator("[data-next]"), { what: "Next on the market step" });
    else if (await body.locator("[data-k=industry]").count()) { await body.locator("[data-k=industry]").first().click(); await body.locator("[data-k=hq]").first().click(); }
    else if (await body.locator("[data-k=opening]").count()) { await body.locator("[data-k=opening]").first().click(); await body.locator("[data-k=locations]").first().click(); }
    await p.waitForTimeout(300);
  }
  await step("contact");
  if (!(await w.expect(await body.locator("#q-contact").count(), "the lead sheet never reached its contact step"))) return;
  await body.locator("[data-contact=email]").click().catch(() => {});
  await body.locator("#q-contact").fill("not-an-email");
  await body.locator("[data-send]").click(); await p.waitForTimeout(300);
  await w.expect(await body.locator("#qErr").isVisible().catch(() => false), "a bad email isn't flagged on the lead sheet");
  await w.look("lead sheet bad email");
  await body.locator("#q-contact").fill("qa@example.com");
  await body.locator("details.qopt summary").click().catch(() => {});
  await body.locator("#q-company").fill("Moonleaf Tea").catch(() => {});
  await body.locator("[data-send]").click(); await p.waitForTimeout(900);
  await w.look("lead sent");
  await w.expect(await body.locator(".qdone").count(), "the lead sheet didn't say it was sent");
  await w.expect(w.leads.length > 0, "the lead form never sent a plan request");
  await p.keyboard.press("Escape"); await p.locator("#mClose").click().catch(() => {}); await p.waitForTimeout(400);
  // "I already have stores": the free check, then its plan request
  await p.goto(w.base); await p.waitForTimeout(800);
  if (!(await w.tap(p.locator("a[href='#check']").filter({ visible: true }).first(), { what: "Already open? Check your stores free" }))) return;
  await p.locator(".pc-sheet").waitFor({ timeout: 6000 }).catch(() => {});
  await w.look("store check");
  const sh = p.locator(".pc-sheet");
  if (!(await w.expect(await sh.count(), "the store check didn't open"))) return;
  await sh.locator("[data-city]").first().fill("Flushing, NY");
  await sh.locator("[data-add]").click().catch(() => {});
  await sh.locator("[data-city]").last().fill("Irvine, CA").catch(() => {});
  await w.look("store check: stores");
  await sh.locator("[data-next]").click(); await p.waitForTimeout(400);
  await w.look("store check: what each holds");
  const segs = sh.locator(".pc-seg button");
  await w.expect(await segs.count(), "the store check lists nothing a store has to hold");
  for (let i = 0; i < Math.min(await segs.count(), 9); i += 4) await segs.nth(i).click().catch(() => {});
  await sh.locator("[data-results]").click().catch(() => {}); await p.waitForTimeout(400);
  await w.look("store check: gaps");
  await w.expect(await sh.locator(".pc-tot").count(), "the store check shows no totals");
  const before = w.leads.length;
  await sh.locator("[data-lead]").click().catch(() => {}); await p.waitForTimeout(600);
  await w.look("store check: plan request");
  if (await body.locator("#q-contact").count()) {
    await body.locator("[data-contact=email]").click().catch(() => {});
    await body.locator("#q-contact").fill("qa-stores@example.com");
    await body.locator("[data-send]").click(); await p.waitForTimeout(800);
    await w.look("store check: plan requested");
    await w.expect(w.leads.length > before, "the store check's plan request was never sent");
  } else await w.record("step", "Get my plan for these didn't open the lead form at its contact step");
});

flow("site-pages", ["site"], async w => {
  const p = w.p;
  for (const page of ["trust", "privacy", "terms", "trust.html", "privacy.html", "terms.html", "how-it-works", "pricing", "faq", "404.html"]) {
    await p.goto(w.base + page + (page.includes(".") ? "" : "") + (w.zh ? (page.includes("?") ? "&" : "?") + "lang=zh" : "")); await p.waitForTimeout(700);
    await w.look(`/${page}`);
  }
  // /trust links to the security report section
  await p.goto(w.base + "trust" + (w.zh ? "?lang=zh" : "") + "#report"); await p.waitForTimeout(600);
  await w.expect(await p.locator("#report").count(), "/trust has no #report section (security.txt points there)");
  // security.txt
  const r = await p.request.get(w.base + ".well-known/security.txt");
  const t = await r.text();
  await w.expect(r.ok() && /^Contact: mailto:/m.test(t) && /^Expires: /m.test(t), "security.txt is missing or has no Contact and Expires");
  const exp = /^Expires: (.+)$/m.exec(t)?.[1];
  await w.expect(exp && Date.parse(exp) > Date.now(), `security.txt has expired (${exp})`);
  const app = await p.request.get(w.base + "app/");
  void app;
});

flow("site-embed", ["site"], async w => {
  const p = w.p;
  await p.goto(w.base + "__qa-embed.html"); await p.waitForTimeout(1500);
  await w.look("embed");
  const host = p.locator("[data-placetta-plan]");
  if (!(await w.expect(await host.count(), "the embed test page has no box"))) return;
  const sh = await host.evaluate(e => !!e.shadowRoot);
  if (!(await w.expect(sh, "embed.js didn't draw its box"))) return;
  // the box lives in its own shadow root: read its text there (the page's own check can't see in)
  const text = () => host.evaluate(e => [...e.shadowRoot.children].filter(c => c.tagName !== "STYLE").map(c => c.innerText).join("\n"));
  const empty = async () => { await host.locator("input").first().fill(""); await host.getByRole("button", { name: /See my plan|查看计划/ }).click(); await p.waitForTimeout(300); return text(); };
  const err = await empty();
  await w.expect(/city and state|城市和州/.test(err), `an empty city isn't flagged in the embed: ${err.replace(/\s+/g, " ").slice(0, 120)}`);
  await host.locator("input").first().fill("Flushing, NY");
  const kinds = await host.locator("select option").count();
  await w.expect(kinds >= 4, `the embed offers ${kinds} kinds of business`);
  await host.getByRole("button", { name: /See my plan|查看计划/ }).click();
  await p.waitForTimeout(1500);
  const txt = await text();
  await w.expect(/permits|许可/.test(txt), `the embed's plan reads: ${txt.replace(/\s+/g, " ").slice(0, 160)}`);
  for (const bad of ["undefined", "NaN", "[object Object]", "null"]) if (txt.includes(bad)) await w.record("text", `"${bad}" in the embed's plan: ${txt.replace(/\s+/g, " ").slice(0, 160)}`);
  if (/[·•]/.test(txt)) await w.record("dot", `separator dot in the embed: ${txt.replace(/\s+/g, " ").slice(0, 160)}`);
  if (w.zh && /\b[A-Za-z]+ [a-z]+ [a-z]+ [a-z]+\b/.test(txt.replace(/Placetta|Odelia|Bay Bridge Realty|[A-Z][a-z]+, [A-Z]{2}/g, ""))) await w.record("english", `English left in the Chinese embed: ${txt.replace(/\s+/g, " ").slice(0, 200)}`);
  const start = host.getByRole("link", { name: /Start with Placetta|开始使用快哉/ });
  if (await w.expect(await start.count(), "the embed's plan has no Start with Placetta")) {
    const href = await start.getAttribute("href");
    await w.expect(/\/app\/\?/.test(href ?? "") && /ref=QATEST23/.test(href ?? "") && /line=/.test(href ?? ""), `Start with Placetta goes to ${href}, not the app with the partner's code and the line`);
  }
  await w.expect(/Bay Bridge Realty/.test(txt), "the embed doesn't say which partner shared it");
  await w.look("embed plan");
  // its own language switch
  const sw = host.getByRole("button", { name: w.zh ? /^EN$/ : /^中文$/ });
  if (await w.expect(await sw.count(), "the embed has no language switch")) { await sw.click(); await p.waitForTimeout(500); const t2 = await text(); await w.expect(w.zh ? /permits|Start with/.test(t2) : /许可/.test(t2), "the embed's language switch didn't change its text"); }
});

/* -------------------------------- run -------------------------------- */
const combos = [];
for (const [build, base] of [["sample", SAMPLE], ["preview", PREVIEW], ["site", SITE]]) {
  if (!base) continue;
  for (const lang of LANGS) for (const width of WIDTHS) combos.push({ build, base, lang, width });
}
// names, places, agencies, forms and the like may stay in English in Chinese
const OK_ENGLISH = [
  "^[A-Z][\\w.'’&-]*(?: (?:[A-Z][\\w.'’&-]*|of|and|for|the|de|in|on|&|-|–|\\d[\\w-]*))*$",   // a Title Case name
  "\\b(St|Ave|Rd|Blvd|Dr|Way|Street|Avenue|Road|Suite|CA|NY|TX)\\b\\.?,? ", "\\d{5}", "LLC|Inc\\.|Corp|Ltd",
  "Form |Application|Permit|Certificate|License|Registration|Statement|SS-4|DE 1|BTC|Plan Review|Sign Permit|Tenant Improvement",
  "Department|County|City of|State of|Agency|Board|Division|Office|Bureau|Commission|Service|IRS|CDTFA|EDD",
  "Moonleaf|Lucky Leaf|Mei |Kevin|Bay Bridge|Odelia|Placetta|Claude|Anthropic|Gemini|OpenAI|Stripe|Slack|Lark|WeChat|Square|Toast|QuickBooks|Google|Microsoft|Dropbox|Gusto|ADP|Notion|Zapier|Shopify|HubSpot|Airtable|Asana|Trello|Linear|GitHub|MCP",
  "^Milk tea|^Hot pot|^Bakery|example|e\\.g\\.", "kevin@|@", "^[\\d\\s$.,:%/()+×x-]+[A-Za-z]{0,3}$",
].join("|");
for (const c of combos) c.okEnglish = OK_ENGLISH;
const work = [];
for (const c of combos) for (const f of F) {
  if (!f.builds.includes(c.build)) continue;
  if (ONLY && !f.name.includes(ONLY)) continue;
  if (f.crawl && c.width < 700) continue;
  work.push({ c, f });
}
// the website's embed test page and the stand-in partner API (the real handler from supabase/functions/partner-api, with
// no database), so the walk never reaches the live backend
let embedApi = null;
if (SITE) {
  const logic = await import(join(ROOT, "supabase/functions/partner-api/logic.ts")).catch(() => null);
  const plan = await import(join(ROOT, "supabase/functions/partner-api/plan.js")).catch(() => null);
  if (logic && plan) embedApi = req => logic.handle(req, { limit: async () => true, plan: (what, where) => (plan.stateOf(where) ? plan.previewPlan(what, where) : null), partner: async c => (c === "QATEST23" ? "Bay Bridge Realty" : null), auth: async () => null, referrals: async () => [], appOrigin: new URL(SITE).origin });
}
const EMBED_PAGE = lang => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Partner test page</title>
<style>body{font:16px system-ui;margin:24px;background:#f6f3ee}h1{font:700 22px Georgia}</style></head>
<body><h1>Bay Bridge Realty</h1><p>A partner's page with Placetta's plan box on it.</p><div data-placetta-plan></div>
<script src="/embed.js" data-ref="QATEST23" data-lang="${lang}" data-api="https://partner-api.qa.test/functions/v1/partner-api" async></script></body></html>`;

console.log(`QA walk: ${work.length} flow runs over ${combos.length} builds, languages and widths, ${JOBS} at a time${ONLY ? `, only "${ONLY}"` : ""}.`);
let next = 0, done = 0;
async function worker() {
  for (;;) {
    const i = next++;
    if (i >= work.length) return;
    const { c, f } = work[i];
    const t0 = Date.now();
    let ctx;
    try {
      const storage = c.build === "preview" && !f.name.startsWith("signup") && f.name !== "staff-ops" ? await previewAccount(c) : undefined;
      ctx = await contextFor(c, { tour: !!f.tour, storage });
      const page = await ctx.newPage();
      page.setDefaultTimeout(12000);
      page.setDefaultNavigationTimeout(30000);
      // the website's page carries its videos and images: it's ready to use well before all of them load
      if (c.build === "site") { const g = page.goto.bind(page); page.goto = (u, o = {}) => g(u, { waitUntil: "domcontentloaded", ...o }); }
      const w = makeWalker(page, c, f.name);
      w.leads = [];
      listen(page, w, c);
      if (c.build === "site") {
        // the live backend is never reached: anything else there gets an empty answer (routes added later win, so the
        // plan requests and the partner API below are caught first)
        await ctx.route(/supabase\.co/, r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
        await ctx.route(/supabase\.co\/rest\/v1\/plan_requests/, r => { w.leads.push(r.request().postData()); return r.fulfill({ status: 201, body: "" }); });
        await ctx.route(/partner-api\.qa\.test|supabase\.co\/functions\/v1\/partner-api/, async r => {
          if (!embedApi) return r.fulfill({ status: 503, body: "{}" });
          const res = await embedApi(new Request(r.request().url(), { method: r.request().method() }));
          return r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
        });
        await ctx.route(u => u.pathname === "/__qa-embed.html", r => r.fulfill({ status: 200, contentType: "text/html", body: EMBED_PAGE(c.lang) }));
        // the host's rewrites (vercel.json): /trust and the section pages
        await ctx.route(u => u.origin === new URL(c.base).origin && /^\/(trust|privacy|terms)$/.test(u.pathname), async r => r.fulfill({ response: await r.fetch({ url: r.request().url().replace(/\/(trust|privacy|terms)(\?|#|$)/, "/$1.html$2") }) }));
        await ctx.route(u => u.origin === new URL(c.base).origin && /^\/(how-it-works|customers|pricing|faq|backers|sample-plan)$/.test(u.pathname), async r => r.fulfill({ response: await r.fetch({ url: new URL(c.base).origin + "/index.html" }) }));
      }
      await f.run(w);
    } catch (e) {
      findings.push({ key: `${f.name}|${tag(c)}|crash`, flow: f.name, step: "-", build: c.build, lang: c.lang, widths: [c.width], kind: "step", detail: `the flow stopped: ${(e.message || String(e)).split("\n")[0]}` });
      console.log(`  FIND ${tag(c)} ${f.name} stopped: ${(e.message || String(e)).split("\n")[0]}`);
    } finally {
      await ctx?.close().catch(() => {});
    }
    const list = walked.get(f.name) ?? []; list.push(tag(c)); walked.set(f.name, list);
    done++;
    console.log(`${String(done).padStart(4)}/${work.length} ${tag(c).padEnd(18)} ${f.name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, work.length) }, worker));
await browser.close();

const byKind = {};
for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
writeFileSync(join(OUT, "findings.json"), JSON.stringify({ sample: SAMPLE, preview: PREVIEW, site: SITE, widths: WIDTHS, langs: LANGS, checkpoints, flows: Object.fromEntries(walked), byKind, findings }, null, 2));
console.log(`\n${findings.length} finding${findings.length === 1 ? "" : "s"} over ${walked.size} flows and ${checkpoints} checked screens${findings.length ? ": " + Object.entries(byKind).map(([k, v]) => `${v} ${k}`).join(", ") : ""}. Findings: ${join(OUT, "findings.json")}`);
process.exit(findings.length ? 1 : 0);
