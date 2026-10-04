// Prints every reply the demo agent can give (and the panel's opening messages), so each can be recorded
// with a natural voice by scripts/make-voices.py. Walks the workspace through each state a reply depends on.
import { demoAgent, type Request } from "../src/agent";
import { INITIAL_FEED } from "../src/feed";
import { SAMPLE, type Workspace } from "../src/model";

(globalThis as unknown as { setTimeout: (f: () => void) => number }).setTimeout = (f: () => void) => { f(); return 0; };
const texts = new Set<string>();
const add = (t: { en: string; zh: string }[]) => { for (const lang of ["en", "zh"] as const) texts.add(JSON.stringify([lang, t.map(p => p[lang]).join(" ")])); };

async function on(ws: Workspace, req: Request): Promise<Workspace> {
  let next = ws;
  await demoAgent.run(req, { lang: "en", current: ws }, e => {
    if (e.type === "update") next = e.patch(next);
    else if (e.type === "reply") add(e.reply.text);
  }, new AbortController().signal);
  return next;
}

(async () => {
  for (const f of INITIAL_FEED) if (f.kind === "turn" && f.reply) add(f.reply.text);
  let w = SAMPLE;
  for (const q of ["hello", "What's blocking our opening date?", "What changed in the county plan check?", "Remind staff about food handler cards"]) await on(w, { text: q });
  await on(w, { match: { what: "Milk tea shop", where: "San Jose, CA" } });
  await on(w, { match: { what: "Milk tea shop", where: "Fremont, CA" } });
  await on(w, { match: { what: "Hair salon", where: "Oakland, CA" } });
  await on(w, { text: "Add a second shop in Fremont" });
  await on(await on(w, { approve: "a-sign" }), { text: "File everything that's ready" });
  // file what's ready: first with the EDD still being prepared, then with filings waiting, then with nothing left
  w = await on(w, { text: "File everything that's ready" });
  await on(w, { text: "File everything that's ready" });
  w = await on(w, { approve: "a-edd" });
  w = await on(w, { approve: "a-sign" });
  await on(w, { text: "File everything that's ready" });
  // statement of information: draft, ask again, file, ask again
  w = await on(w, { text: "Prepare the Statement of Information" });
  await on(w, { text: "Prepare the Statement of Information" });
  w = await on(w, { approve: "a-soi" });
  await on(w, { text: "Prepare the Statement of Information" });
  // staff texts, then asking again
  w = await on(w, { approve: "a-staff" });
  await on(w, { text: "Remind staff about food handler cards" });
  // uploads: one plan check document, then the rest; building insurance; a drawing; food handler cards
  w = await on(w, { upload: { app: "plancheck", item: "fp", files: [] } });
  w = await on(w, { upload: { app: "plancheck", item: "*", files: [] } });
  w = await on(w, { approve: "a-plan" });
  await on(w, { upload: { app: "building", item: "coi", files: [] } });
  await on(w, { upload: { app: "building", item: "dwg", files: [] } });
  await on(w, { upload: { app: "handler", item: "s3", files: [] } });
  await on(w, { upload: { app: "handler", item: "*", files: [] } });
  console.log(JSON.stringify([...texts].map(s => JSON.parse(s))));
})();
