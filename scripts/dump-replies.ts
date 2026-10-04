// Prints every scripted reply the demo agent can give, so each can be recorded with a natural voice.
import { demoAgent } from "../src/agent";
import { SAMPLE_CASE, type Case } from "../src/model";
(globalThis as any).setTimeout = (f: () => void) => { f(); return 0; };
const texts = new Set<string>();
const go = async (req: any, autonomy: any, current: Case) => {
  for (const lang of ["en", "zh"] as const)
    await demoAgent.run(req, { lang, autonomy, current }, e => { if (e.type === "reply") texts.add(JSON.stringify([lang, e.reply.text.map(p => p[lang]).join(" ")])); }, new AbortController().signal);
};
const filed: Case = { ...SAMPLE_CASE, filings: SAMPLE_CASE.filings.map(f => f.id === "edd" ? { ...f, status: "filed" } : f) };
(async () => {
  for (const a of ["submit", "ask", "prepare"]) await go({ text: "File everything that's ready" }, a, SAMPLE_CASE);
  await go({ text: "File everything that's ready" }, "submit", filed);
  for (const q of ["What's blocking our opening date?", "Add a second shop in Fremont", "hello"]) await go({ text: q }, "submit", SAMPLE_CASE);
  for (const id of ["a-sign", "a-docs", "a-plan", "a-staff", "a-edd"]) await go({ approve: id }, "submit", SAMPLE_CASE);
  console.log(JSON.stringify([...texts].map(s => JSON.parse(s))));
})();
