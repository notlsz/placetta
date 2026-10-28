#!/usr/bin/env node
/* Draws the two social cards (1200x630) in a headless browser: site/media/og-home.png (the landing page's own headline)
   and site/guides/og.png (the guides' title and their real counts from site/guides/data.json, so the card never shows
   a stale number). Run after npm run guides when the counts change: node scripts/seo/og.mjs
   Needs Playwright: set PLAYWRIGHT to its index.mjs if `import("playwright")` can't find it.
   The fonts are the site's own (site/fonts, npm run fonts), served to the page on a local origin; nothing is fetched
   from Google Fonts or anywhere else, and the card waits for the fonts before it is drawn. */
import { readFileSync } from "node:fs";
const pw = await import(process.env.PLAYWRIGHT || "playwright");
const cov = JSON.parse(readFileSync("site/guides/data.json", "utf8")).coverage;
const mark = readFileSync("site/favicon.svg", "utf8");
const card = (title, sub) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/fonts/fonts.css">
<style>html,body{margin:0}body{width:1200px;height:630px;background:#0F1B33;color:#fff;font-family:Inter,"Noto Sans SC",sans-serif;position:relative}
.b{position:absolute;left:84px;top:76px;display:flex;align-items:center;gap:12px;font:500 30px/1 Inter,sans-serif;letter-spacing:-.5px}.b svg{width:30px;height:30px}
h1{position:absolute;left:84px;top:210px;right:84px;margin:0;font:400 92px/1.04 Newsreader,Georgia,serif;letter-spacing:-2.5px}
p{position:absolute;left:84px;bottom:76px;margin:0;font:400 26px/1.3 Inter,"Noto Sans SC",sans-serif;color:#C9D3E3}</style></head>
<body><div class="b">${mark.replace(/<\?xml[^>]*>/, "").replace(/<style>[\s\S]*?<\/style>/, "<style>path{fill:#fff}</style>")}placetta</div><h1>${title}</h1><p>${sub}</p></body></html>`;
const ORIGIN = "http://og.local";
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
let html = "";
await page.route("**/*", route => {
  const u = new URL(route.request().url());
  if (u.origin !== ORIGIN) return route.abort();
  if (u.pathname === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
  if (/^\/fonts\/[\w./-]+$/.test(u.pathname) && !u.pathname.includes("..")) return route.fulfill({ path: "site" + u.pathname, contentType: u.pathname.endsWith(".css") ? "text/css" : "font/woff2" });
  return route.fulfill({ status: 404, body: "" });
});
for (const [file, title, sub] of [
  ["site/media/og-home.png", "Your store is built.<br><i>Your permits aren't.</i>", "Licenses, permits and registrations to open in a new market. In English and 中文."],
  ["site/guides/og.png", "Every license to open,<br>city by city", `${cov.cities} cities. ${cov.official_forms} official forms. In English and 中文.`],
]) {
  html = card(title, sub);
  await page.goto(ORIGIN + "/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(async () => {
    const want = [["500 30px Inter", "placetta"], ["400 92px Newsreader", "Aa"], ["italic 400 92px Newsreader", "Aa"], ["400 26px 'Noto Sans SC'", "中文"]];
    const got = await Promise.all(want.map(([f, s]) => document.fonts.load(f, s)));
    return want.filter((_w, i) => !got[i].length).map(([f]) => f);
  });
  if (missing.length) throw new Error(`og: fonts didn't load: ${missing.join(", ")}`);
  await page.screenshot({ path: file, type: "png" });
  console.log("og:", file);
}
await browser.close();
