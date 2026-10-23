// npm run test:speech: what talking to Odelia leaves in the message box, and what it costs.
//   1. cleanSpeech takes out um, uh, 嗯 and 呃 and a word said twice, and leaves every other word as said
//   2. the voice-note path (Whisper on Groq) stays far under the founder's $1 a store a month for voice, at heavy use
import { cleanSpeech, sttCost, STT_USD_PER_HOUR } from "../src/speech";

let failed = 0, passed = 0;
const eq = (got: string, want: string, what: string) => { if (got === want) passed++; else { failed++; console.error(`  FAIL ${what}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (c: boolean, what: string) => { if (c) passed++; else { failed++; console.error("  FAIL " + what); } };

console.log("1. cleanup");
eq(cleanSpeech("um so I need the uh health permit for my shop", "en"), "So I need the health permit for my shop", "um and uh go, the rest stays");
eq(cleanSpeech("file the the sign permit", "en"), "File the sign permit", "a word said twice");
eq(cleanSpeech("I had had enough of that that is true", "en"), "I had had enough of that that is true", "had had and that that are real English");
eq(cleanSpeech("Uh, what's due this week?", "en"), "What's due this week?", "a leading uh and its comma");
eq(cleanSpeech("  hmm   i think   we open in march ", "en"), "I think we open in march", "spaces, a capital, I");
eq(cleanSpeech("I like the plan", "en"), "I like the plan", "\"like\" as a word stays");
eq(cleanSpeech("嗯，我要在法拉盛开一家奶茶店", "zh"), "我要在法拉盛开一家奶茶店", "a leading 嗯");
eq(cleanSpeech("呃 帮我查一下卫生许可。嗯，什么时候到期", "zh"), "帮我查一下卫生许可。什么时候到期", "呃 and 嗯 between sentences");
eq(cleanSpeech("那个营业执照就是下个月到期", "zh"), "那个营业执照就是下个月到期", "那个 and 就是 carry meaning and stay");
eq(cleanSpeech("", "en"), "", "nothing said");
eq(cleanSpeech("um uh", "en"), "", "only filler");

console.log("2. cost");
const perMinute = sttCost(60);
ok(Math.abs(perMinute - STT_USD_PER_HOUR / 60) < 1e-9, `a minute costs $${perMinute.toFixed(5)}`);
// heavy use, all on the paid path (no browser speech recognition at all): 10 voice notes a day of 30 seconds, every
// day of the month, each billed at least 10 seconds
const heavy = 30 * 10 * sttCost(30);
ok(heavy < 1, `heavy voice notes, a store a month: $${heavy.toFixed(3)} (under $1)`);
// absurd use: two hours of talking every single day
const absurd = 30 * sttCost(7200);
ok(absurd < 50 * 0.05, `two hours a day, a store a month: $${absurd.toFixed(2)} (under 5% of the $50 ceiling)`);
console.log(`   a minute $${perMinute.toFixed(5)}, heavy month $${heavy.toFixed(3)}, two hours a day $${absurd.toFixed(2)}`);

console.log(failed ? `\ntest:speech FAILED: ${failed} of ${passed + failed}` : `\ntest:speech: all ${passed} checks passed`);
process.exit(failed ? 1 : 0);
