#!/usr/bin/env node
/* Fit check: opens every page of the app at phone, tablet and desktop widths and reports anything that doesn't fit
   on screen.

   Build and serve the app first (its base is /app/, so serve the folder above it):
     VITE_PREVIEW=1 npx vite build --outDir /tmp/fit/app && (cd /tmp/fit && python3 -m http.server 4920)
       the signed-in app on its in-browser stand-in backend (sign in with any email, code 123456)
     npx vite build --mode sample --outDir /tmp/fit-sample/app && (cd /tmp/fit-sample && python3 -m http.server 4921)
       the sample workspace, Moonleaf Tea, with stores, applications, budgets and drawers full of data
   Then:
     node scripts/fit-check.mjs --url http://localhost:4921/app/ --out /tmp/fit-out
     node scripts/fit-check.mjs --url http://localhost:4920/app/ --signin --out /tmp/fit-out-cloud

   Options: --widths 375,414,768,1024,1280  --height 800  --only <name substring>  --shots-all (screenshot every state)
   Playwright: set PLAYWRIGHT to its index.mjs if `import("playwright")` can't find it.

   On each page it flags:
     doc       the page scrolls sideways (documentElement.scrollWidth > innerWidth)
     offscreen a visible element whose right edge is past innerWidth+1 or left edge below -1, unless an ancestor
               with overflow-x auto, scroll, hidden or clip holds it (that ancestor is checked by "scroller")
     scroller  a box that scrolls or clips sideways because its content is too wide, unless it's meant to scroll
               sideways (a chip row, a tab strip, a table wrapper: see SIDEWAYS_OK)
     text      text that runs out of its own box without an ellipsis
   Findings go to <out>/findings.json, with a screenshot of each page that has any, the offenders outlined.
   Exits 1 when anything is found. */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const flag = k => args.includes("--" + k);
const URL_ = opt("url", "http://localhost:4920/app/").replace(/\/?$/, "/");
const OUT = opt("out", "fit-out");
const WIDTHS = opt("widths", "375,414,768,1024,1280").split(",").map(Number);
const HEIGHT = Number(opt("height", "800"));
const ONLY = opt("only", "");
const SIGNIN = flag("signin");
const SHOTS_ALL = flag("shots-all");

const { chromium } = await import(process.env.PLAYWRIGHT || "playwright").catch(() =>
  import("/home/claude/.npm-global/lib/node_modules/playwright/index.mjs"));

/* Boxes that are meant to scroll sideways: they stay inside the screen and their content scrolls within them. */
const SIDEWAYS_OK = [".set-nav", ".gt-scroll", ".sugg", ".tscroll", "[data-hscroll]", "input", "textarea", "select", "pre"].join(",");

/* -------------------------------- what's checked, in the page -------------------------------- */
function check(SIDEWAYS_OK) {
  const W = window.innerWidth;
  const out = [], notes = [];
  const doc = document.documentElement.scrollWidth;
  if (doc > W) out.push({ kind: "doc", sel: "html", detail: `scrollWidth ${doc} > ${W}` });

  const sel = el => {
    const part = e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + [...e.classList].slice(0, 3).map(c => "." + c).join("");
    const p = []; for (let e = el; e && e !== document.body && p.length < 5; e = e.parentElement) p.unshift(part(e));
    return p.join(" > ");
  };
  const label = el => (el.getAttribute("aria-label") || el.textContent || el.value || "").replace(/\s+/g, " ").trim().slice(0, 70);
  const css = el => getComputedStyle(el);
  const visible = (el, cs) => {
    if (cs.visibility === "hidden" || cs.visibility === "collapse" || +cs.opacity === 0) return false;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = a === el ? cs : css(a);
      if (s.clip && s.clip !== "auto") return false;               // screen-reader-only text
      if (s.display === "contents") continue;
      if (+s.opacity === 0) return false;
    }
    return true;
  };
  const holder = (el, cs) => {   // the nearest ancestor that scrolls or clips sideways
    if (cs.position === "fixed") return null;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (a === document.body) return null;
      const s = css(a);
      if (/^(auto|scroll|hidden|clip)$/.test(s.overflowX)) return a;
      if (s.position === "fixed") return null;       // nothing above a fixed box clips it
    }
    return null;
  };
  const marked = new Set();
  const mark = (el, rec) => { el.setAttribute("data-fit", out.length); marked.add(el); out.push(rec); };
  const underMarked = el => { for (let a = el.parentElement; a; a = a.parentElement) if (marked.has(a)) return true; return false; };

  const all = document.body.querySelectorAll("*");
  for (const el of all) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    const cs = css(el);
    if (cs.display === "none" || cs.display === "contents") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (!visible(el, cs)) continue;
    // offscreen
    const h = holder(el, cs);
    if ((r.right > W + 1 || r.left < -1) && !h && !underMarked(el)) {
      mark(el, { kind: "offscreen", sel: sel(el), text: label(el), detail: `left ${Math.round(r.left)} right ${Math.round(r.right)} of ${W}` });
      continue;
    }
    // past the left edge of the box that holds it: no scrolling reaches that (scrollWidth doesn't count it either)
    if (h && !underMarked(el) && !marked.has(h)) {
      const hr = h.getBoundingClientRect();
      if (r.left + h.scrollLeft < hr.left - 1 && r.right > hr.left + 1 && !(h.matches(SIDEWAYS_OK) && h.scrollLeft > 0)) {
        mark(el, { kind: "offscreen", sel: sel(el), text: label(el), detail: `left ${Math.round(r.left)} is past the left edge ${Math.round(hr.left)} of ${sel(h).split(" > ").pop()}` });
        continue;
      }
    }
    // a strip that's meant to scroll sideways and does: not a failure, but listed so it can be looked at
    if (/^(auto|scroll)$/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.matches(SIDEWAYS_OK) && !el.matches("input, textarea, select, pre"))
      notes.push({ kind: "scrolls", sel: sel(el), text: label(el), detail: `scrollWidth ${el.scrollWidth} in ${el.clientWidth}` });
    // scroller
    if (/^(auto|scroll|hidden|clip)$/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && !el.matches(SIDEWAYS_OK)
        && !(cs.textOverflow === "ellipsis" && cs.whiteSpace.startsWith("nowrap")) && !underMarked(el)) {
      // ignore boxes whose only overflow is invisible (e.g. a transparent input stretched over a swatch to widen its hit area)
      const kids = [...el.querySelectorAll("*")].filter(k => {
        const kr = k.getBoundingClientRect(), ks = css(k);
        return kr.width >= 1 && kr.height >= 1 && ks.position !== "fixed" && visible(k, ks) && (kr.right > el.getBoundingClientRect().right + 1);
      });
      if (kids.length) {
        const k = kids[0];
        mark(el, { kind: "scroller", sel: sel(el), text: label(el), detail: `${cs.overflowX}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}; widest ${sel(k)} "${label(k).slice(0, 40)}"` });
        continue;
      }
    }
  }

  // A line's box can poke out by its trailing spaces (they hang past the edge in pre-wrap text, unseen): only a
  // visible character outside the box counts.
  const inkOutside = (n, br) => {
    const r = document.createRange();
    for (let i = 0; i < n.data.length; i++) {
      if (/\s/.test(n.data[i])) continue;
      r.setStart(n, i); r.setEnd(n, i + 1);
      const c = r.getBoundingClientRect();
      if (c.width > 0 && (c.right > br.right + 1.5 || c.left < br.left - 1.5)) return true;
    }
    return false;
  };
  // text: every run of text stays inside the block that holds it, unless that block ends it with an ellipsis
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.data.trim() ? 1 : 2 });
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    let box = n.parentElement;
    if (!box || box.closest("svg, script, style, textarea, select, option")) continue;
    const ps = css(box);
    if (!visible(box, ps)) continue;
    while (box && css(box).display.startsWith("inline") && !/^inline-(block|flex|grid)$/.test(css(box).display)) box = box.parentElement;
    if (!box || seen.has(box)) continue;
    const bs = css(box);
    if (bs.textOverflow === "ellipsis" && bs.overflowX !== "visible") continue;
    if (/^(auto|scroll)$/.test(bs.overflowX)) continue;
    const br = box.getBoundingClientRect();
    if (br.width < 1) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const tr of range.getClientRects()) {
      if (tr.width < 1) continue;
      if ((tr.right > br.right + 1.5 || tr.left < br.left - 1.5) && inkOutside(n, br)) {
        seen.add(box);
        if (!marked.has(box) && !underMarked(box)) mark(box, { kind: "text", sel: sel(box), text: n.data.trim().slice(0, 70), detail: `text ${Math.round(tr.left)}..${Math.round(tr.right)} in box ${Math.round(br.left)}..${Math.round(br.right)}` });
        break;
      }
    }
  }
  return { out, notes };
}

/* -------------------------------- getting around -------------------------------- */
const settle = p => p.waitForTimeout(450);
const tourOff = async p => { const s = p.locator(".tour-skip"); if (await s.count() && await s.first().isVisible()) { await s.first().click(); await settle(p); } };
const open = async (p, path) => { await p.goto(URL_ + path); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(700); await tourOff(p); };
const onScreen = async l => { const b = await l.boundingBox().catch(() => null); return !!b && b.x + b.width > 0 && b.x < p0w(l); };
const p0w = l => l.page().viewportSize().width;
const click = async (p, loc) => {
  const l = p.locator(loc).filter({ visible: true }).first();
  if (!(await l.count()) || !(await onScreen(l))) return false;   // a closed phone menu is "visible" but off to the side
  await l.click(); await settle(p); return true;
};
const clickText = async (p, text) => { const l = p.getByRole("button", { name: text }).filter({ visible: true }).first(); if (!(await l.count())) return false; await l.click(); await settle(p); return true; };

/** Clicks a sidebar control, opening the phone menu first when the sidebar is tucked away. */
const viaMenu = async (p, loc) => (await click(p, loc)) || ((await click(p, ".mbar button[aria-label=Menu]")) && click(p, loc));

async function signIn(p) {
  await p.goto(URL_); await p.waitForTimeout(1200);
  if (await p.locator("#gate-email").count()) {
    await p.fill("#gate-email", "fit@example.com"); await p.click("button[type=submit]"); await p.waitForTimeout(700);
    await p.getByText("Email me a code instead").click(); await p.waitForTimeout(700);
    await p.fill("#gate-code", "123456"); await p.click("button[type=submit]"); await p.waitForTimeout(2500);
  }
  if (await p.locator("#onb-line").count()) {
    await p.fill("#onb-line", "Milk tea shop in San Jose, CA"); await p.locator("#onb-agree").check();
    await p.click("button[type=submit]"); await p.waitForTimeout(3500);
  }
}

const SETTINGS = ["general", "team", "odelia", "connections", "billing", "security", "privacy", "help"];
const PAGES = [["overview", ""], ["work", "work"], ["playbooks", "playbooks"], ["updates", "updates"], ["stores", "stores"], ["applications", "applications"],
  ["documents", "documents"], ["deadlines", "deadlines"], ["audit", "activity"], ["context", "context"], ["find", "find"], ["headquarters", "headquarters"]];

/** Every state checked: a name and how to get there. A state whose opener finds nothing to click is skipped. */
const STATES = [
  ...PAGES.map(([n, path]) => ({ name: n, go: p => open(p, path) })),
  ...SETTINGS.map(c => ({ name: "settings-" + c, go: p => open(p, "settings/" + c) })),
  { name: "settings-billing-budgets", go: async p => {
    await open(p, "settings/billing");
    await clickText(p, "Let Odelia suggest from the opening plan"); await clickText(p, "Add a budget");
    await p.locator(".spend-b").first().scrollIntoViewIfNeeded().catch(() => {});
    return true;
  } },
  { name: "find-results", go: async p => { await open(p, "find"); if (!(await clickText(p, "Milk tea shop, San Jose, CA"))) return false; await p.locator(".hit").first().waitFor({ timeout: 20000 }).catch(() => {}); await p.waitForTimeout(800); return true; } },
  { name: "nav-menu", go: async p => { await open(p, ""); return click(p, ".mbar button[aria-label=Menu]"); } },
  { name: "odelia-chat", go: async p => { await open(p, ""); return viaMenu(p, ".askb"); } },
  { name: "odelia-chat-typed", go: async p => {
    await open(p, ""); if (!(await viaMenu(p, ".askb"))) return false;
    const box = p.locator(".panel textarea").filter({ visible: true }).first();
    if (await box.count()) { await box.fill("What do I need for https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/permit-center-applications-and-forms"); await box.press("Enter"); await p.waitForTimeout(2500); }
    return true;
  } },
  { name: "cmdk", go: async p => { await open(p, ""); if (await viaMenu(p, ".cmdk-open")) return true; await p.keyboard.press("Control+k"); await settle(p); return true; } },
  { name: "cmdk-typed", go: async p => { await open(p, ""); if (!(await viaMenu(p, ".cmdk-open"))) { await p.keyboard.press("Control+k"); await settle(p); } await p.keyboard.type("food facility plan check permit"); await settle(p); return true; } },
  { name: "approval-drawer", go: async p => { await open(p, ""); return clickText(p, "Review"); } },
  { name: "plans", go: async p => {
    await open(p, "");
    for (const t of [/^Get your entry plan/, /^See plans/, /^Change plan/, /^Compare plans/]) if (await clickText(p, t)) return true;
    await open(p, "settings/billing");
    for (const t of [/^(See|View|Compare|Change|Choose a) plans?$/i, /^Upgrade/]) if (await clickText(p, t)) return true;
    return false;
  } },
  { name: "playbooks-open", go: async p => { await open(p, "playbooks"); return click(p, ".pb-tog"); } },
  { name: "work-open", go: async p => { await open(p, "work"); const a = await click(p, ".hz-tog"); const b = await click(p, ".sec-h.tog"); return a || b; } },
  { name: "store-detail", go: async p => { await open(p, "stores"); return click(p, "button.store"); } },
  { name: "store-detail-2", go: async p => { await open(p, "stores"); const l = p.locator("button.store").filter({ visible: true }); if (await l.count() < 2) return false; await l.nth(1).click(); await settle(p); return true; } },
  { name: "stores-plan-many", go: async p => { await open(p, "stores"); return clickText(p, "Plan many stores"); } },
  { name: "app-drawer", tabs: true, go: async p => { await open(p, "applications"); return click(p, ".apps-t .tr.row, button.row.arow"); } },
  { name: "app-drawer-crit", tabs: true, go: async p => { await open(p, "applications"); return click(p, ".apps-t .tr.row.crit, button.row.arow.crit"); } },
  ...[0, 1, 2].map(step => ({ name: "tour" + (step ? "-step" + (step + 1) : ""), go: async p => {
    await p.evaluate(() => { try { for (const k of Object.keys(localStorage)) if (/tour/i.test(k)) localStorage.removeItem(k); } catch { /* blocked */ } });
    await p.goto(URL_); await p.waitForTimeout(1200);
    if (!(await p.locator(".tour-skip").count())) return false;
    for (let i = 0; i < step; i++) if (!(await click(p, ".tour .sbtn.ink"))) return false;
    await p.waitForTimeout(1200);
    return true;
  } })),
];

/* -------------------------------- run -------------------------------- */
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
// A plain static server (python3 -m http.server) has no fallback to index.html for /app/stores and the like: give
// every page address under /app/ the app's index.html, as the real host does.
const spa = ctx => ctx.route(u => u.href.startsWith(URL_), async route => {
  if (route.request().resourceType() !== "document") return route.continue();
  try { return await route.fulfill({ response: await route.fetch({ url: URL_ }) }); }
  catch (e) { console.error(`  can't load ${URL_}: ${e.message.split("\n")[0]}`); return route.abort().catch(() => {}); }
});
let storage;
if (SIGNIN) {
  const c = await browser.newContext({ viewport: { width: 1280, height: HEIGHT } });
  await spa(c);
  const p = await c.newPage(); await signIn(p);
  storage = await c.storageState(); await c.close();
}

const findings = [], scrolls = [];
const summary = {};
async function record(p, W, name) {
  await p.evaluate(() => document.querySelectorAll("[data-fit]").forEach(e => e.removeAttribute("data-fit")));
  const { out: found, notes } = await p.evaluate(check, SIDEWAYS_OK);
  for (const n of notes) scrolls.push({ page: name, width: W, ...n });
  summary[`${name}@${W}`] = found.length;
  for (const f of found) findings.push({ page: name, width: W, ...f });
  console.log(`${found.length ? "FAIL" : " ok "} ${String(W).padStart(4)} ${name}${found.length ? `: ${found.length}` : ""}`);
  for (const f of found) console.log(`       ${f.kind.padEnd(9)} ${f.sel}  "${f.text ?? ""}"  ${f.detail}`);
  if (found.length || SHOTS_ALL) {
    await p.addStyleTag({ content: "[data-fit]{outline:2px solid #e0245e !important;outline-offset:-1px}" });
    await p.evaluate(() => { const e = document.querySelector("[data-fit]"); if (e && e.tagName !== "HTML") e.scrollIntoView({ block: "center", inline: "nearest" }); });
    await p.screenshot({ path: join(OUT, `${W}-${name}.png`) });
  }
}

/** Signed out (with --signin): the sign-in screens and onboarding, step by step, in a fresh browser. */
async function gate(W) {
  const ctx = await browser.newContext({ viewport: { width: W, height: HEIGHT }, reducedMotion: "reduce" });
  await spa(ctx);
  const p = await ctx.newPage(); p.setDefaultTimeout(6000);
  const steps = [
    ["gate-email", async () => { await p.goto(URL_); await p.waitForTimeout(1200); return (await p.locator("#gate-email").count()) > 0; }],
    ["gate-password", async () => { await p.fill("#gate-email", `fit-${W}@example.com`); await p.click("button[type=submit]"); await p.waitForTimeout(700); return (await p.locator("#gate-pw").count()) > 0; }],
    ["gate-code", async () => { await p.getByText("Email me a code instead").click(); await p.waitForTimeout(700); return (await p.locator("#gate-code").count()) > 0; }],
    ["onboarding", async () => { await p.fill("#gate-code", "123456"); await p.click("button[type=submit]"); await p.waitForTimeout(2500); return (await p.locator("#onb-line").count()) > 0; }],
    ["onboarding-filled", async () => { await p.fill("#onb-line", "Bubble tea and hot pot restaurant with a retail counter in Rowland Heights, Los Angeles County, CA"); await p.waitForTimeout(600); const more = p.getByRole("button", { name: /Add a name/ }); if (await more.count()) { await more.first().click(); await settle(p); } return true; }],
  ];
  for (const [name, go] of steps) {
    if (ONLY && !name.includes(ONLY)) { if (!(await go().catch(() => false))) break; continue; }
    if (!(await go().catch(e => { console.error(`  [${W}] ${name}: ${e.message.split("\n")[0]}`); return false; }))) { console.log(`  [${W}] ${name}: not reached, stopped`); break; }
    await record(p, W, name);
  }
  await ctx.close();
}

for (const W of WIDTHS) {
  if (SIGNIN) await gate(W);
  const ctx = await browser.newContext({ viewport: { width: W, height: HEIGHT }, reducedMotion: "reduce", ...(storage ? { storageState: storage } : {}) });
  await spa(ctx);
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  p.on("pageerror", e => console.error(`  [${W}] page error: ${e.message}`));
  for (const st of STATES) {
    if (ONLY && !st.name.includes(ONLY)) continue;
    const ok = await st.go(p).catch(e => { console.error(`  [${W}] ${st.name}: ${e.message.split("\n")[0]}`); return false; });
    if (ok === false) { console.log(`  [${W}] ${st.name}: nothing to open, skipped`); continue; }
    const variants = [{ name: st.name }];
    if (st.tabs) {
      const tabs = p.locator("[role=dialog] [role=tab], .sheet [role=tab]").filter({ visible: true });
      const n = await tabs.count();
      for (let i = 1; i < n; i++) variants.push({ name: `${st.name}-tab${i + 1}`, tab: i });
    }
    for (const v of variants) {
      if (v.tab !== undefined) { await p.locator("[role=dialog] [role=tab], .sheet [role=tab]").filter({ visible: true }).nth(v.tab).click().catch(() => {}); await settle(p); }
      await record(p, W, v.name);
    }
  }
  await ctx.close();
}
await browser.close();

const total = findings.length;
writeFileSync(join(OUT, "findings.json"), JSON.stringify({ url: URL_, widths: WIDTHS, total, summary, findings, sidewaysStrips: scrolls }, null, 2));
const strips = [...new Set(scrolls.map(n => `${n.width} ${n.page}: ${n.sel.split(" > ").pop()}`))];
if (strips.length) console.log(`\nStrips that scroll sideways on purpose (not counted):\n  ${strips.join("\n  ")}`);
console.log(`\n${total} offender${total === 1 ? "" : "s"} across ${Object.keys(summary).length} page states. Findings: ${join(OUT, "findings.json")}`);
process.exit(total ? 1 : 0);
