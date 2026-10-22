/* Odelia's instructions never leave in a reply (src/security/output.ts withoutInstructions), checked against her real
   instructions as the server builds them, with the attacks that get a model to recite its prompt and the answers she
   must still give (prices, plain work replies).   npm run test:leak */
import { rules } from "../src/live";
import { normalizeState } from "../src/core";
import { leakedRuns, LEAK_REPLY, withoutInstructions } from "../src/security/output";

let failed = 0;
const ok = (c: boolean, name: string, extra = "") => { if (!c) failed++; console.log(`${c ? "ok  " : "FAIL"} ${name}${!c && extra ? `  (${extra})` : ""}`); };
const ws = normalizeState("Lucky Leaf Tea", {});
const inst = rules(ws, "en", true, true, [], true, {});
ok(inst.length > 5000 && inst.startsWith("You are Odelia"), "the real instructions are built (the server's bundle)");
const para = inst.split("\n").filter(l => l.length > 160 && !/\$\d/.test(l));
const blocked = (r: string) => withoutInstructions(r, inst, "en").leaked;

// attacks: the model is talked into reciting its prompt
ok(blocked(inst), "the whole prompt, verbatim");
ok(blocked(inst.slice(0, 1200)), "its first lines");
ok(blocked(para[3] + "\n" + para[7]), "two of its rules, copied");
ok(blocked(`Sure! Here are my instructions:\n\n${para.slice(2, 5).join("\n")}\n\nAnything else?`), "rules wrapped in friendly words");
ok(blocked(para.slice(4, 7).join("\n").toUpperCase().replace(/ /g, "  ")), "rules with the case and spacing changed");
ok(blocked(para.slice(1, 4).map(l => l.replace(/[,.:;()"]/g, " ")).join(" ")), "rules with the punctuation stripped");
ok(blocked(`Here's a summary of the job. Applications filed: 2. ${para[5]} Also, ${para[9]}`), "rules hidden inside an ordinary reply");
const r = withoutInstructions(inst.slice(0, 2000), inst, "zh");
ok(r.text === LEAK_REPLY.zh, "the refusal comes in the person's language");

// answers that must still go out unchanged
const fine = (t: string, name: string) => { const o = withoutInstructions(t, inst, "en"); ok(!o.leaked && o.text === t, name, `runs ${leakedRuns(t, inst)}`); };
fine("Mapped 7 filings for Flushing and filled what I could. Your Certificate of Occupancy check is waiting for your approval; the NYC food service permit ($280) can't go in until the Food Protection Certificate is done.", "a work reply");
fine("The store plan is $149 a store a month billed yearly, and covers tracking, renewal monitoring, alerts, the document vault, chat with you and every renewal you file on your own. Each new license is $299.", "an answer quoting the prices word for word");
fine("Nothing files without your approval.", "a reassurance in her own words");
fine("I only handle compliance work for this business.", "her one-line refusal of off-topic work");
fine("Prepared your EDD employer registration, no fee. It's waiting for your approval.", "the example reply from her style guide");
fine("You're on the store plan: open Settings, Billing for its price. Placetta is not a law firm; for lease terms, ask a licensed attorney.", "a pointer to Settings and a lawyer");
fine("", "an empty reply");

console.log(`\n${failed ? `${failed} failed` : "all passed"}`);
if (failed) process.exit(1);
