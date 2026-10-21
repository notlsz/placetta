// Every (page, words) pair the strict set cites, for scripts/eval/proof-read.py: `npm run strict:read` fetches each page
// and writes scripts/eval/strict-log.json, which scripts/eval/strict.ts checks every expected answer against.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strictQuotes, type Gold } from "./strict";

const dir = join(process.cwd(), "scripts/eval/strict");
const cases = readdirSync(dir).filter(f => f.endsWith(".json") && f !== "README.json").map(f => JSON.parse(readFileSync(join(dir, f), "utf8")) as Gold);
console.log(JSON.stringify(strictQuotes(cases), null, 1));
