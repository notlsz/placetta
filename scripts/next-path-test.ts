// npm run test:next-path: a refusal always carries a next step, and the safety refusals stay refusals.
//   1. every kind of blocker maps to its path and its owner (CAPTCHA to the owner in the live view, mail-only to the team,
//      an unconfirmed fee to the team to confirm, a legal judgment to an attorney's packet)
//   2. no path ever offers to bypass a CAPTCHA, or to file, pay or send before the owner approves
//   3. every refusal string the server's tools and channel guards actually throw gets a next_path (src/live.ts and
//      src/serverRun.ts read for their thrown messages), and a result is never given two
import { readFileSync } from "node:fs";
import { nextPath, withNextPath } from "../src/nextPath";

let failed = 0, passed = 0;
const ok = (c: unknown, what: string) => { if (c) passed++; else { failed++; console.error("  FAIL " + what); } };

console.log("1. each blocker, its path");
const cases: [string, string, string][] = [
  ["This page shows a CAPTCHA. The owner has to solve it.", "owner", "live view"],
  ["Nothing is filed without the owner's approval.", "owner", "request_filing_approval"],
  ["This agency takes the form by mail only.", "Placetta team", "mail"],
  ["The fee is not published on the agency's page.", "Placetta team", "unconfirmed"],
  ["That's a question of legal judgment for an attorney.", "attorney", "attorney"],
  ["The form needs the owner's signature.", "owner", "signature"],
  ["The floor plan document is missing.", "Odelia", "find_files"],
  ["Sign in to the agency account first: no saved login.", "owner", "connect"],
  ["Filing isn't allowed over text. Do it in the app.", "owner", "app link"],
  ["The task's budget cap is reached.", "Odelia", "budget"],
  ["Something odd happened (500).", "Odelia", "hand_off"],
];
for (const [said, who, has] of cases) {
  const p = nextPath("some_tool", said);
  ok(p.who === who, `"${said}" goes to ${who} (got ${p.who})`);
  ok(p.step.toLowerCase().includes(has.toLowerCase()), `"${said}": the step mentions ${has}`);
}

console.log("2. the safety refusals stay refusals");
for (const [said] of cases) {
  const s = nextPath("t", said).step;
  ok(!/bypass|get around|skip the captcha|solve the captcha yourself|without (the owner'?s )?approval,? (file|pay|send)/i.test(s.replace(/never try to get past it/i, "")), `no bypass in: ${s.slice(0, 60)}`);
}
ok(/never try to get past it/i.test(nextPath("t", "CAPTCHA").step), "the CAPTCHA path says never to get past it");
ok(/nothing is filed, paid or sent before that/i.test(nextPath("t", "needs approval").step), "the approval path keeps nothing filed before approval");

console.log("3. every refusal the server throws gets a next_path");
const src = readFileSync("src/live.ts", "utf8") + readFileSync("src/serverRun.ts", "utf8");
const thrown = [...src.matchAll(/throw new Error\((["`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map(m => m[2]).filter(s => s.length > 12);
ok(thrown.length > 50, `found ${thrown.length} refusals in the server's tools`);
let generic = 0;
for (const t of thrown) {
  const out = withNextPath("tool", t);
  ok(/\nnext_path \((Odelia|owner|Placetta team|attorney|agency)\): \S/.test(out), `a next_path for: ${t.slice(0, 70)}`);
  if (nextPath("tool", t).step.startsWith("Read the error")) generic++;
}
ok(withNextPath("t", withNextPath("t", "Not approved.")).match(/next_path/g)?.length === 1, "never two next_paths on one result");
console.log(`   ${thrown.length} refusals, ${thrown.length - generic} with a specific path, ${generic} with the retry-then-hand-off path`);

console.log(failed ? `\ntest:next-path FAILED: ${failed} of ${passed + failed}` : `\ntest:next-path: all ${passed} checks passed`);
process.exit(failed ? 1 : 0);
