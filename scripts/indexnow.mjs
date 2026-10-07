/* Tells Bing, Yandex and the other IndexNow engines about every guide right after a deploy, so new pages are crawled
   in hours instead of weeks. Run: node scripts/indexnow.mjs (after the deploy is live). The key file is site/c354f93ce636a507cf25b5fada30d1a5.txt. */
import { readFileSync } from "node:fs";
const KEY = "c354f93ce636a507cf25b5fada30d1a5", HOST = "placetta.com";
const urls = readFileSync("site/guides/urls.txt", "utf8").split("\n").filter(Boolean);
for (let i = 0; i < urls.length; i += 10000) {
  const res = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls.slice(i, i + 10000) }) });
  console.log(`indexnow: ${Math.min(i + 10000, urls.length)}/${urls.length} sent, ${res.status}`);
}
