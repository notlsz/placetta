#!/usr/bin/env node
/* npm run test:crash: the built app in a real browser, talking to Odelia, must never throw or go blank.

   Why: once a turn of the plush bot's head made a negative ellipse radius, the canvas threw, and the page went white
   right after someone talked to Odelia. Unit tests never draw a real canvas, so only a browser catches that kind of
   thing (docs/LESSONS.md). Any change to the chat or the bot must pass this.

   What it does: builds the app in sample mode (the demo workspace at /app, no backend) into a temporary folder, serves
   it with python3 -m http.server, and for each screen (1440 wide, 390 wide with a mouse so the live canvas draws, and
   390 on a touch phone) it opens /app, sends Odelia several messages, and watches for about 20 seconds while she works,
   finishes and goes idle. Every 1.5 seconds it also pokes each bot (a hop with a full turn of the head), which drives
   the animation through its extremes. It fails on any uncaught error in the page, on a console error from a canvas
   (IndexSizeError and the like), on the app's own "Something on this page broke" message, or on a blank #root.

   Options: --dir <folder>   serve an existing sample build (the folder that holds app/) instead of building one
            --seconds <n>    how long to watch after the messages (default 20)
            --runs <n>       repeat the whole check n times (default 1)
   Playwright: set PLAYWRIGHT to its index.mjs if import("playwright") can't find it. */

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const SECONDS = Number(opt("seconds", "20"));
const RUNS = Number(opt("runs", "1"));

// Playwright: $PLAYWRIGHT, then the project's, then the filer's playwright-core (what CI installs), then a global copy
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright")
  .catch(() => import(join(ROOT, "worker/filer/node_modules/playwright-core/index.mjs")))
  .catch(() => import("/home/claude/.npm-global/lib/node_modules/playwright/index.mjs"));

let dir = opt("dir", ""), made = "";
if (!dir) {
  made = dir = mkdtempSync(join(tmpdir(), "placetta-crash-"));
  console.log("Building the sample app ...");
  const b = spawnSync("npx", ["vite", "build", "--mode", "sample", "--outDir", join(dir, "app"), "--emptyOutDir", "--logLevel", "error"], { stdio: "inherit", cwd: ROOT });
  if (b.status !== 0) { console.error("test:crash: the sample build failed"); process.exit(1); }
}
dir = resolve(dir);
if (!existsSync(join(dir, "app", "index.html"))) { console.error(`test:crash: no app/index.html in ${dir}`); process.exit(2); }

const port = await new Promise(ok => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", dir], { stdio: "ignore" });
const cleanup = () => { server.kill(); if (made) rmSync(made, { recursive: true, force: true }); };
process.on("exit", cleanup);
const BASE = `http://127.0.0.1:${port}/app/`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }

// Several kinds of request, so she searches, writes, files and answers: each step dresses the bot differently
const MESSAGES = [
  "What licenses do I need for a bubble tea shop at 150 N First St, San Jose?",
  "Check the status of my Business Tax Certificate",
  "Draft the LLC Statement of Information",
  "File the sign permit",
  "What is due this month?",
];
const SCREENS = [
  { name: "desktop 1440", viewport: { width: 1440, height: 900 } },
  { name: "mobile 390 (mouse, live canvas)", viewport: { width: 390, height: 844 } },
  { name: "mobile 390 (touch)", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

async function check(browser, screen) {
  const problems = [];
  const ctx = await browser.newContext({ viewport: screen.viewport, isMobile: !!screen.isMobile, hasTouch: !!screen.hasTouch, locale: "en-US" });
  const page = await ctx.newPage();
  page.on("pageerror", e => problems.push(`uncaught: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && /IndexSizeError|CanvasRenderingContext2D|Path2D|a part of the page failed/i.test(m.text())) problems.push(`console: ${m.text().slice(0, 300)}`); });
  const blank = async (when) => {
    const r = await page.evaluate(() => {
      const root = document.getElementById("root");
      return { kids: root ? root.childElementCount : -1, text: root ? root.innerText.trim().length : 0, broke: !!document.querySelector('[role="alert"]') && /Something on this page broke|页面出了点问题/.test(document.body.innerText) };
    }).catch(e => ({ kids: -1, text: 0, broke: false, err: String(e) }));
    if (r.kids < 1 || r.text < 20) problems.push(`#root is blank ${when}`);
    if (r.broke) problems.push(`the app showed "Something on this page broke" ${when}`);
  };
  // poke every bot on the page: a hop with a full turn of the head, the motion that once made a negative radius
  const poke = () => page.evaluate(() => { let n = 0; for (const c of document.querySelectorAll("canvas")) { const a = c.__pcAnim; if (a && a.poke) { a.poke(); n++; } } return n; }).catch(() => 0);

  await page.goto(BASE);
  await page.waitForSelector("#root > *", { timeout: 15000 });
  await page.waitForTimeout(1500);
  await blank("on load");
  // the first-run walkthrough, if it shows, is set aside
  for (let i = 0; i < 3; i++) { const s = page.getByRole("button", { name: /^(Skip|Skip tour|跳过)$/ }).first(); if (await s.isVisible().catch(() => false)) { await s.click(); await page.waitForTimeout(300); } else break; }
  const box = page.getByPlaceholder(/Ask Odelia/).first();
  await box.waitFor({ state: "visible", timeout: 10000 });
  let poked = 0, canvases = 0;
  for (const msg of MESSAGES) {
    await box.click();
    await box.fill(msg);
    await box.press("Enter");
    for (let t = 0; t < 4; t++) { await page.waitForTimeout(500); poked += await poke(); }
    await blank(`after sending "${msg}"`);
  }
  const until = Date.now() + SECONDS * 1000;
  while (Date.now() < until) {
    await page.waitForTimeout(1500);
    poked += await poke();
    canvases = Math.max(canvases, await page.evaluate(() => document.querySelectorAll("canvas").length).catch(() => 0));
    await blank("while she worked");
    if (problems.length) break;
  }
  await blank("at the end");
  const sent = await page.evaluate(m => document.body.innerText.includes(m), MESSAGES[0]);
  if (!sent) problems.push("the first message never showed in the chat (the test didn't reach Odelia)");
  await ctx.close();
  return { problems, poked, canvases };
}

const browser = await chromium.launch();
let failed = 0;
for (let run = 1; run <= RUNS; run++) {
  const results = await Promise.all(SCREENS.map(s => check(browser, s).then(r => ({ s, r }), e => ({ s, r: { problems: [`the check itself failed: ${e.message.split("\n")[0]}`], poked: 0, canvases: 0 } }))));
  for (const { s, r } of results) {
    const ok = r.problems.length === 0;
    if (!ok) failed++;
    console.log(`${RUNS > 1 ? `run ${run}  ` : ""}${ok ? "ok  " : "FAIL"}  ${s.name}: ${r.canvases} canvas, ${r.poked} pokes${ok ? "" : "\n      " + [...new Set(r.problems)].slice(0, 8).join("\n      ")}`);
  }
}
await browser.close();
console.log(failed ? `\ntest:crash FAILED (${failed})` : "\ntest:crash: no error and no blank page");
process.exit(failed ? 1 : 0);
