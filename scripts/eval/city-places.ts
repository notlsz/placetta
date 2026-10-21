// Every US city and unincorporated place the library names (src/forms/usplace.ts and src/forms/world.ts), with its state
// and county, as JSON, for scripts/eval/city-sites.py:
//   npx esbuild scripts/eval/city-places.ts --bundle --platform=node --format=esm --outfile=.city-places.mjs && node .city-places.mjs > places.json
import { readFileSync } from "node:fs";
import { CITIES } from "../../src/forms/world";
import { COUNTIES, usPlace } from "../../src/forms/usplace";

const src = readFileSync("src/forms/usplace.ts", "utf8");
const out: Record<string, { city: string; state: string; county?: string; uninc: boolean }> = {};
for (const m of src.matchAll(/^add\("([A-Z]{2})", "([A-Z]+)", "([^"]+)"(, \{ uninc: true \})?/gm))
  for (const n of m[3].split(",")) { const name = n.trim(); out[`${name}|${m[1]}`] = { city: name, state: m[1], county: COUNTIES[m[2]]?.en, uninc: !!m[4] }; }
for (const c of CITIES.filter(c => c.country === "US" && c.state)) {
  const k = `${c.en.toLowerCase()}|${c.state}`;
  if (!out[k]) out[k] = { city: c.en.toLowerCase(), state: c.state!, uninc: false, county: usPlace(`${c.en}, ${c.state}`).county?.en };
}
console.log(JSON.stringify(out));
