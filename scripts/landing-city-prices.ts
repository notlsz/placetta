/* npm run landing:cities: the per-city restaurant opening the landing page's pricing table shows when a visitor has
   typed a city in the hero. Each count comes from Placetta's own registry plan for a restaurant in that city
   (src/plan/preview.ts, the same plan the app starts with), priced by src/pricing.ts the way the billing function
   prices it: licenses at $149, complex ones at $999 (outcome pricing, 2026-10-28), the free ones (inspections, staff certificates) not counted.
   Only US cities whose city or county steps are in the registry are written, so the number is never a generic guess.
   Writes CITY_PRICES into site/landing.js, the landing page's script (between its city-prices markers). Run it after the forms registry changes;
   --check exits 1 when the page is out of date, --print shows the counts and --list every filing. */
import { readFileSync, writeFileSync } from "node:fs";
import { previewPlan } from "../src/plan/preview";
import { licenseTierOf, SIMPLE } from "../src/pricing";

const TODAY = "2026-10-22";
const data = JSON.parse(readFileSync("site/guides/data.json", "utf8")) as { cities: { city: string; country: string }[] };
const out: Record<string, { n: number; c: number; usd: number }> = {};
const only = process.argv.slice(2).filter(a => !a.startsWith("--"));
const cities = only.length ? only : data.cities.filter(c => c.country === "United States").map(c => c.city);
for (const city of cities) {
  const p = previewPlan("restaurant", city, "2027-03-01", { today: TODAY });
  if (p.country !== "US" || !p.local || p.generic > 0) continue;
  let n = 0, c = 0;
  for (const a of p.apps) {
    // insurance is bought from an insurer, not filed: TYPICAL_OPENING (src/pricing.ts) leaves it out the same way
    const t = /\binsurance\b/i.test(a.name.en) ? "free" : licenseTierOf(a.name.en);
    if (t === "license") n++; else if (t === "complex") c++;
    if (process.argv.includes("--list")) console.log(city, "|", t, "|", a.name.en);
  }
  out[city] = { n, c, usd: n * SIMPLE.licenseOnApprovalUsd + c * SIMPLE.complexOnApprovalUsd };
}
if (process.argv.includes("--print")) console.log(JSON.stringify(out, null, 1));
else {
  // written into the landing page between its markers, so the table needs no request and no other file
  const P = "site/landing.js", html = readFileSync(P, "utf8");
  const a = "/* city-prices */\n", b = "\n/* /city-prices */", i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < i) throw new Error("city-prices markers not found in site/landing.js");
  const next = html.slice(0, i + a.length) + `const CITY_PRICES = ${JSON.stringify(out)};` + html.slice(j);
  if (process.argv.includes("--check")) { if (next !== html) { console.error("site/landing.js: CITY_PRICES is out of date, run npm run landing:cities"); process.exit(1); } }
  else writeFileSync(P, next);
  console.log(`CITY_PRICES: ${Object.keys(out).length} cities`);
}
