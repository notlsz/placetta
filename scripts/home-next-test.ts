/* Home (src/pages.tsx Overview) around one next step: whenever anything waits on the owner, Home shows exactly one
   primary "Do this next" button; when nothing does, the calm state with the next renewal. Rendered as people see it, in
   English and Chinese, and the order Odelia picks in (src/doNext.ts): a date, then blocking the opening, then waiting
   on the owner. npm run test:home: built with Vite (the app's own resolver: src/stores.ts and src/Stores.tsx sit side by
   side, which esbuild's lookup mixes up) for Node, then run. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppCtx } from "../src/ctx";
import { CollabCtx } from "../src/Comments";
import { Overview } from "../src/pages";
import { S, fmt, type Lang } from "../src/i18n";
import { SAMPLE_WS } from "../src/sample";
import { doNext, nextRenewal, todos } from "../src/doNext";
import { daysFromNow } from "../src/time";
import type { Workspace } from "../src/model";
import { intakeParseTests } from "./intake-parse-test";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
const noop = () => undefined;

const team = { me: { id: "me", name: "Me", role: "owner" }, people: [], hqShared: false, comments: [], assignments: [], notices: [], thread: () => [], openCount: () => 0,
  assigneeOf: () => undefined, post: async () => true, resolve: async () => undefined, assign: async () => undefined, mine: false, setMine: noop, isMine: () => false,
  forAgent: async () => [], updates: [], readAll: noop };

function render(ws: Workspace, lang: Lang): string {
  const ctx = new Proxy({
    lang, ws, busy: false, live: null, mode: "demo", queued: [], updates: [], cloud: null, uploading: null,
    t: (k: keyof typeof S, v?: Record<string, string | number>) => (v ? fmt(S[k][lang], v) : S[k][lang]),
    b: (x: { en: string; zh: string }) => x[lang],
  } as Record<string, unknown>, { get: (o, k: string) => (k in o ? o[k] : noop) });
  return renderToStaticMarkup(createElement(AppCtx.Provider, { value: ctx as never }, createElement(CollabCtx.Provider, { value: team as never }, createElement(Overview))));
}
const count = (h: string, re: RegExp) => (h.match(re) ?? []).length;
const PRIMARY = /class="pill ink dtn-go"/g;
const words = (h: string) => h.replace(/<[^>]+>/g, " ");

function homeNextTests(ok: Ok) {
  console.log("\n# Home: one next step, or the calm state");
  const today = daysFromNow(0);

  // the sample has plenty waiting: exactly one primary action, in English and Chinese
  for (const lang of ["en", "zh"] as Lang[]) {
    const h = render(SAMPLE_WS, lang);
    ok(count(h, PRIMARY) === 1, `${lang}: the sample shows exactly one primary "Do this next" button`, count(h, PRIMARY));
    ok(count(h, /data-do-next=/g) === 1 && !h.includes("hm-calm"), `${lang}: one "Do this next" card, no calm state`);
    ok(h.includes(lang === "en" ? "Do this next" : "下一步") && h.includes(lang === "en" ? "Waiting on you" : "等您处理"), `${lang}: the card and Waiting on you are labeled`);
    ok(!/[·•]/.test(words(h)), `${lang}: no bullet or dot separators`);
    ok(!/(^|[^\d.,:$])0\d/.test(words(h)), `${lang}: no leading zeros`);
  }
  // the sample's first: the text to staff, whose food handler cards are due in 5 days
  const first = doNext(SAMPLE_WS, today);
  ok(first?.kind === "approval" && first.a.id === "a-staff" && first.days === 5, "a date comes first: the staff text, due in 5 days", first?.key);
  const list = todos(SAMPLE_WS, today);
  ok(list[1]?.key === "a:a-docs" && list.slice(1).findIndex(x => !x.blocks) > list.slice(1).findIndex(x => x.blocks), "then what blocks the opening (the plan check's floor plan)", list.map(x => x.key));
  ok(list.at(-1)?.key === "a:a-sign", "then what only waits on the owner (the sign permit)", list.map(x => x.key));
  ok(render(SAMPLE_WS, "en").match(/Waiting on you.*?<em>(\d+)<\/em>/)?.[1] === String(list.length - 1), "Waiting on you counts the rest");

  // only a missing document: still exactly one primary button, the upload
  const docOnly: Workspace = { ...SAMPLE_WS, approvals: [], jobs: [], deadlines: [] };
  const hd = render(docOnly, "en");
  ok(count(hd, PRIMARY) === 1 && /dtn-go"[^>]*><span>Photo or file/.test(hd) && hd.includes("Find it for me"), "a missing document alone: one primary button, Photo or file, with Find it for me", count(hd, PRIMARY));

  // nothing pending: the calm state, the next renewal, and no primary button
  const calm: Workspace = { ...SAMPLE_WS, approvals: [], jobs: [], apps: SAMPLE_WS.apps.map(a => ({ ...a, checklist: a.checklist.map(c => ({ ...c, state: c.state === "missing" ? "have" : c.state })) })) as Workspace["apps"] };
  ok(doNext(calm, today) === null, "nothing pending: nothing to do next");
  for (const lang of ["en", "zh"] as Lang[]) {
    const h = render(calm, lang);
    ok(count(h, PRIMARY) === 0 && h.includes("hm-calm") && h.includes(lang === "en" ? "You&#x27;re all set." : "都办好了。") && h.includes(lang === "en" ? "Odelia will tell you when something needs you." : "Odelia 会告诉您"), `${lang}: the calm state, with no primary button`);
    ok(h.includes(lang === "en" ? "Next renewal:" : "下次续期"), `${lang}: the calm state names the next renewal`);
  }
  ok(nextRenewal(calm, today)?.id === "dl-marco", "the next renewal is the soonest one from today", nextRenewal(calm, today)?.id);
}

let fails = 0;
const ok: Ok = (cond, m, extra) => { if (cond) console.log("ok  ", m); else { console.error("FAIL", m, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); fails++; } };
homeNextTests(ok);
intakeParseTests(ok);
if (fails) { console.error(`\n${fails} failed`); process.exit(1); } else console.log("\nall passed");
