/* The first run (src/firstRun.ts, src/FirstRun.tsx, src/cloud/PlanBuild.tsx): every number a new owner sees comes from
   the plan, the same function the rest of the app uses for it, in English and Chinese; one primary action; never
   "You're all set" on a plan with nothing filed; no dots, no leading zeros. Run by npm run test:home. */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppCtx } from "../src/ctx";
import { CollabCtx } from "../src/Comments";
import { Overview } from "../src/pages";
import { PlanBuild } from "../src/cloud/PlanBuild";
import { S, fmt, type Lang } from "../src/i18n";
import { SAMPLE_WS } from "../src/sample";
import { firstWorkspace } from "../src/plan/start";
import { canFileLine, firstRunFacts, isFirstRun, needLine, nowLine, whoFiles, type FirstRun } from "../src/firstRun";
import { costToOpen } from "../src/cost";
import { estimateSay, hingeSay, workspaceEstimate, workspaceOpening } from "../src/smart";
import { readiness } from "../src/stores";
import { routeOf } from "../src/approvalRoute";
import { daysFromNow, fmtDay, money } from "../src/time";
import type { Workspace } from "../src/model";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
const noop = () => undefined;
const team = { me: { id: "me", name: "Me", role: "owner" }, people: [], hqShared: false, comments: [], assignments: [], notices: [], thread: () => [], openCount: () => 0,
  assigneeOf: () => undefined, post: async () => true, resolve: async () => undefined, assign: async () => undefined, mine: false, setMine: noop, isMine: () => false,
  forAgent: async () => [], updates: [], readAll: noop };
function render(ws: Workspace, lang: Lang, el: ReactElement = createElement(Overview)): string {
  const ctx = new Proxy({
    lang, ws, busy: false, live: null, mode: "demo", queued: [], updates: [], cloud: null, uploading: null,
    t: (k: keyof typeof S, v?: Record<string, string | number>) => (v ? fmt(S[k][lang], v) : S[k][lang]),
    b: (x: { en: string; zh: string }) => x[lang],
  } as Record<string, unknown>, { get: (o, k: string) => (k in o ? o[k] : noop) });
  return renderToStaticMarkup(createElement(AppCtx.Provider, { value: ctx as never }, createElement(CollabCtx.Provider, { value: team as never }, el)));
}
const PRIMARY = /class="pill ink dtn-go"/g;
const count = (h: string, re: RegExp) => (h.match(re) ?? []).length;
const words = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
/** The text as read, tags removed without adding spaces (a link inside a sentence stays inside it). */
const text = (h: string) => h.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

export function firstRunTests(ok: Ok) {
  console.log("\n# First run: the outcome first, every number from the plan");
  const today = daysFromNow(0);
  const base = { what: "Milk tea shop", city: "San Jose", state: "CA", lang: "en" as const, address: "100 N First St, San Jose, CA 95113" };
  const skipped = firstWorkspace(base).state;
  const answered = firstWorkspace({ ...base, legal: "Lucky Leaf Tea LLC", owner: "Mei Chen" }).state;

  for (const [name, ws] of [["skipped the answers", skipped], ["answered", answered]] as const) {
    const f = firstRunFacts(ws, today);
    const cost = costToOpen(ws, { today });
    const store = ws.stores![0];
    ok(isFirstRun(ws), `${name}: a new plan is a first run`);
    ok(f.permits === ws.apps.length && f.odelia + f.online + f.prepares + f.you + f.confirm === f.permits, `${name}: every application counted once, by who files it`, f);
    ok(f.agencyUSD === cost.agencyUSD && f.unpublished === cost.unpublished, `${name}: agency fees are Cost to open's own total`, [f.agencyUSD, cost.agencyUSD]);
    ok(f.opening === (workspaceOpening(ws, today)?.date ?? null), `${name}: the opening is the date the store card and Deadlines show`, f.opening);
    const est = workspaceEstimate(ws, today)!;
    ok(JSON.stringify(f.range) === JSON.stringify(est.path?.range) && f.hinge.map(x => x.app).join() === est.path!.hinge.map(x => x.app).join() && f.hinge.length > 0, `${name}: the range and the hinge are the estimate's own`, [f.range, f.hinge.map(x => x.app)]);
    ok(f.ready?.score === readiness(store, ws).score && f.ready.total === store.apps!.length && f.ready.issued === 0, `${name}: % ready is the store's readiness, nothing issued yet`, f.ready);
    ok(f.ready!.score === Math.round((100 * f.ready!.issued) / f.ready!.total), `${name}: % ready is exactly the issued count beside it`, f.ready!.score);
    // who files: the approval card's own route; the portal isn't counted as hers today
    for (const a of ws.apps) {
      const w = whoFiles(a), r = routeOf(a);
      if (w === "odelia") ok(["email", "fax", "mail", "faxSigned"].includes(r), `${name}: ${a.name.en} counts as Odelia's today only on a route she sends on`, r);
      if (r === "portal" && w !== "confirm" && w !== "you") ok(w === "online", `${name}: ${a.name.en} on the agency's portal waits for online filing`, w);
    }
    ok(f.ready!.failing.every(c => c.state !== "pass"), `${name}: only failing checks are listed as failing`);
    // a fee the agency sets is never added in
    const tbd = ws.apps.filter(a => whoFiles(a) !== "confirm" && a.fees.some(x => x.tbd)).length;
    ok(f.unpublished >= tbd, `${name}: fees the agency sets stay out of the total`, [f.unpublished, tbd]);
    for (const lang of ["en", "zh"] as Lang[]) {
      const h = render(ws, lang), w = words(h);
      ok(h.includes("data-first-run") && w.includes(needLine(f)[lang]) && w.includes(canFileLine(f)![lang]), `${name} ${lang}: Home leads with the need and what Odelia files`);
      ok(w.includes(money(f.agencyUSD)) && (!f.opening || w.includes(fmtDay(f.opening, lang, true))) && w.includes(`${f.ready!.score}%`), `${name} ${lang}: the fees, the opening and % ready, as computed`);
      ok(count(h, PRIMARY) === 1, `${name} ${lang}: exactly one primary button`, count(h, PRIMARY));
      {
        const est = workspaceEstimate(ws, today)!, tx = text(h), range = estimateSay(est.date, est.path!.range)[lang].slice(estimateSay(est.date)[lang].length).replace(/^[,，]\s*/, "");
        ok(!range || tx.includes(range), `${name} ${lang}: the opening's likely range is shown`, range);
        ok(tx.includes(hingeSay(est.path!)![lang]) && h.includes("data-hinge"), `${name} ${lang}: the step the date hinges on, with its time and source`, hingeSay(est.path!)![lang]);
      }
      ok(!h.includes("hm-calm"), `${name} ${lang}: never "You're all set" on a plan with nothing filed`);
      ok(w.includes(nowLine(ws, f)[lang]), `${name} ${lang}: what Odelia is doing right now`);
      ok(!/[·•]/.test(w) && !/(^|[^\d.,:$])0\d/.test(w), `${name} ${lang}: no dot separators, no leading zeros`);
      ok(!/saved|节省/i.test(w), `${name} ${lang}: no savings claimed`);
      ok(!h.includes("hs-open") && !/Opening around|前后开业|Opening, where the permits put it|开业日（按许可进度）/.test(w), `${name} ${lang}: one opening date on the first screen, not three`);
      ok(w.includes(lang === "en" ? `Total with Placetta ${money(costToOpen(ws, { today }).totalUSD)}` : `合计 ${money(costToOpen(ws, { today }).totalUSD)}`), `${name} ${lang}: the two money figures are labeled apart`);
    }
  }
  ok(render(skipped, "en").includes('data-do-next="first"'), "skipped the answers: the first action is to fill the first application");
  const fa = firstRunFacts(answered, today);
  ok(!!fa.first && render(answered, "en").includes(`data-do-next="a:${fa.first.approval.id}"`) && /Waiting for your approval/.test(nowLine(answered, fa).en), "answered: the first filing waits for approval, and Odelia says so");

  // the sentence builders, at one and at many
  const one = { ...fa, permits: 1, odelia: 1, online: 0, prepares: 0, you: 0, confirm: 0 } as FirstRun;
  ok(needLine(one).en === "You need 1 license or permit to open." && canFileLine(one)!.en === "Odelia can file it herself today.", "one permit reads as one", [needLine(one).en, canFileLine(one)!.en]);
  ok(canFileLine({ ...fa, permits: 10, odelia: 3, online: 5 })!.en === "Odelia can file 3 of them herself today. 5 more once online filing is on.", "today and once online filing is on, said apart");
  ok(canFileLine({ ...fa, odelia: 0, online: 0 }) === null, "nothing Odelia files: no claim that she does");

  // filed anything: no longer the first run; the sample isn't one
  const filed: Workspace = { ...answered, apps: answered.apps.map((a, i) => (i === 0 ? { ...a, status: "review" as const } : a)) };
  ok(!isFirstRun(filed) && !render(filed, "en").includes("data-first-run"), "once something is filed, Home is the usual Home");
  ok(!isFirstRun(SAMPLE_WS) && !render(SAMPLE_WS, "en").includes("data-first-run"), "the sample isn't a first run");

  // the live build: the same plan, every row, then the outcome and one primary button
  for (const lang of ["en", "zh"] as Lang[]) {
    const h = render(skipped, lang, createElement(PlanBuild, { lang, ws: skipped, place: "100 N First St, San Jose", instant: true, busy: false, err: "", onBack: noop, onNext: noop, onSkip: noop }));
    const f = firstRunFacts(skipped, today), w = words(h);
    ok(h.includes('data-plan-build="done"') && count(h, /<li>/g) === skipped.apps.length, `${lang}: the build lists every application in the plan`, count(h, /<li>/g));
    ok(w.includes(needLine(f)[lang]) && w.includes(money(f.agencyUSD)), `${lang}: the build ends with the same outcome Home shows`);
    ok(!f.opening || (text(h).includes(fmtDay(f.opening, lang, true)) && text(h).includes(hingeSay({ hinge: f.hinge })![lang])), `${lang}: the build shows the same opening and hinge`, f.opening);
    ok(count(h, /class="sbtn ink big"/g) === 1 && h.includes("data-plan-skip"), `${lang}: one primary button, and a way straight to the plan`);
    ok(!/[·•]/.test(w) && !/(^|[^\d.,:$])0\d/.test(w), `${lang}: the build has no dot separators or leading zeros`);
  }
}
