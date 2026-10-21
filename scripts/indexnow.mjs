/* Tells Bing, Yandex, Seznam, Naver and the other IndexNow engines which pages changed, right after a deploy, so they are
   recrawled in hours instead of weeks. Run by .github/workflows/indexnow.yml when Vercel reports a production deploy,
   or by hand: node scripts/indexnow.mjs [--days 3] [--all] [--dry]

   It reads every sitemap under site/sitemaps/ and sends the URLs whose lastmod is within --days (default 3; --all sends
   everything, for the first run). The key is the 32-character file at site/<key>.txt (or INDEXNOW_KEY), served at
   ORIGIN/<key>.txt. It never fails a deploy: no key, a key file that isn't live on the host, or an engine error each log
   a line and exit 0. */
import { readFileSync, readdirSync } from "node:fs";
import { HOST, ORIGIN } from "./seo/config.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const ALL = process.argv.includes("--all"), DRY = process.argv.includes("--dry"), DAYS = Number(arg("--days", 3));
const KEY = process.env.INDEXNOW_KEY || (readdirSync("site").find(f => /^[0-9a-f]{32}\.txt$/.test(f) && readFileSync("site/" + f, "utf8").trim() === f.slice(0, 32)) ?? "").slice(0, 32);
if (!KEY) { console.log("indexnow: no key file in site/, nothing sent"); process.exit(0); }

const since = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
const urls = [];
for (const f of readdirSync("site/sitemaps").filter(f => f.endsWith(".xml")))
  for (const m of readFileSync("site/sitemaps/" + f, "utf8").matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g))
    if (ALL || !m[2] || m[2] >= since) urls.push(m[1]);
const mine = urls.filter(u => new URL(u).host === HOST);
console.log(`indexnow: ${mine.length} URL(s) on ${HOST} ${ALL ? "in the sitemaps" : `changed since ${since}`}`);
if (!mine.length || DRY) process.exit(0);

// the engines fetch the key from the host itself; if it isn't served there (or only through a redirect), don't send
const keyLocation = `${ORIGIN}/${KEY}.txt`;
try {
  const r = await fetch(keyLocation, { redirect: "manual" });
  const body = r.ok ? (await r.text()).trim() : "";
  if (body !== KEY) { console.log(`indexnow: ${keyLocation} answered ${r.status}${r.headers.get("location") ? ` -> ${r.headers.get("location")}` : ""}, not the key; nothing sent`); process.exit(0); }
} catch (e) { console.log(`indexnow: couldn't read ${keyLocation} (${e.message}); nothing sent`); process.exit(0); }

for (let i = 0; i < mine.length; i += 10000) {
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation, urlList: mine.slice(i, i + 10000) }) });
    console.log(`indexnow: ${Math.min(i + 10000, mine.length)}/${mine.length} sent, ${res.status}`);
  } catch (e) { console.log(`indexnow: send failed (${e.message})`); }
}
