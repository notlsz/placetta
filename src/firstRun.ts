/* The first run: what a new owner sees in the first minute, as facts computed from the plan, never typed.

   Copied from what shows value fastest, in substance:
     Devin      give it the task and watch it plan: the plan builds in front of you, step by step (src/cloud/PlanBuild.tsx)
     Vanta      a "% ready" with the failing tests under it, each with one fix; tests pass only on evidence
     Drata      a short Quick Start checklist next to the work, never in front of it
     Alven      (alven.ai) the agent is a worker you hand the job to; what it is doing now is always one line away
   Their weaknesses, filled: no integration or long setup before the first number (Vanta and Drata ask for connections
   first; Drata's own guide says policies take "a few days to a few weeks"), Chinese first-class, and no fake progress
   (Delve, 2026: reports and "100%" compliance alleged to be written before any evidence existed). Every number here
   comes from the workspace: the count of applications, who files each (the registry's filing method), the agency fees
   the registry publishes (src/cost.ts, the same total as Cost to open), the opening date (src/smart.ts, the same date as
   the store card and Deadlines), the store's "% ready" (src/stores.ts readiness, the same score as Stores) and the checks
   behind it (src/controls.ts). A figure that isn't known is left out, never estimated.
   Pure: Home (src/FirstRun.tsx) and onboarding (src/cloud/PlanBuild.tsx) render it; scripts/home-next-test.ts tests it. */
import { B, type Bi } from "./bi";
import type { Application, Approval, Workspace } from "./model";
import { formById } from "./forms/registry";
import { costToOpen } from "./cost";
import { workspaceEstimate, type Evidence, type Hinge } from "./smart";
import { readiness } from "./stores";
import { checksFor, type Check } from "./controls";
import { routeOf } from "./approvalRoute";

/** Who files an application, by the same route the approval card states (src/approvalRoute.ts routeOf, from
 *  src/forms/filingRoutes.json):
 *    odelia    Odelia sends it herself today: by email, fax or certified mail (a hand signature first, for some)
 *    online    the agency's portal: Odelia files it once online filing is on; until then it isn't counted as hers
 *    prepares  Odelia prepares it and you (or the Placetta team) send it
 *    you       a certificate staff earn, insurance, a filing in person, one only a local professional may make
 *    confirm   not claimed yet: Odelia confirms with the agency first */
export type Who = "odelia" | "online" | "prepares" | "you" | "confirm";
export function whoFiles(a: Pick<Application, "abstain" | "yours" | "specialist" | "official">): Who {
  if (a.abstain) return "confirm";
  if (a.yours || a.specialist) return "you";
  const f = a.official ? formById(a.official) : undefined;
  if (!f) return "confirm";
  if (f.method === "in_person" || f.method === "insurer" || f.method === "none") return "you";
  const r = routeOf(a);
  return r === "email" || r === "fax" || r === "mail" || r === "faxSigned" ? "odelia" : r === "portal" ? "online" : "prepares";
}

export type FirstRun = {
  permits: number;           // every application in the plan
  odelia: number;            // Odelia files them herself, today
  online: number;            // on the agency's portal: hers once online filing is on
  prepares: number;          // Odelia prepares them, you send them
  you: number;               // the owner's own steps
  confirm: number;           // Odelia confirms with the agency before claiming them
  agencyUSD: number;         // published agency fees in dollars (the Cost to open's agency total)
  published: number;         // applications with a published fee
  unpublished: number;       // fees the agency sets or the registry doesn't have: never counted
  opening: string | null;    // the opening date the permits put it at
  range: { fast: string; slow: string } | null;   // the same chain at the steps' quickest and longest published times
  hinge: Hinge[];            // the one or two steps the date hinges on, each with its time and source
  ready: { score: number; issued: number; total: number; failing: Check[] } | null;   // the store's "% ready to open"
  filled: number;            // form lines filled from the signup's answers
  first: { approval: Approval; app: Application } | null;   // the first filing, ready to approve
  ms: number | null;         // how long the plan took, measured at sign-up
};

/** The first-run facts for this workspace today. */
export function firstRunFacts(ws: Workspace, today: string, ev: Evidence = {}): FirstRun {
  const who = ws.apps.map(whoFiles);
  const cost = costToOpen(ws, { today, ev });
  const open = workspaceEstimate(ws, today, ev);
  const store = open?.store ?? (ws.stores ?? []).find(s => s.stage === "opening") ?? (ws.stores ?? [])[0];
  let ready: FirstRun["ready"] = null;
  if (store && store.stage === "opening" && (store.apps ?? []).length) {
    // the score and its count over the same applications (the store's), the failing checks behind them (Vanta's tests)
    const mine = ws.apps.filter(a => store.apps!.includes(a.id));
    const lic = checksFor(ws, today, { store: store.id }).filter(c => c.area === "license");
    ready = { score: readiness(store, ws).score, issued: mine.filter(a => a.status === "approved").length, total: mine.length, failing: lic.filter(c => c.state !== "pass") };
  }
  const fp = ws.firstPlan;
  const approval = fp?.win ? ws.approvals.find(a => a.app === fp.win) : undefined;
  const app = approval ? ws.apps.find(a => a.id === approval.app) : undefined;
  return {
    permits: ws.apps.length, odelia: who.filter(w => w === "odelia").length, online: who.filter(w => w === "online").length, prepares: who.filter(w => w === "prepares").length, you: who.filter(w => w === "you").length, confirm: who.filter(w => w === "confirm").length,
    agencyUSD: cost.agencyUSD, published: cost.published, unpublished: cost.unpublished, opening: open?.date ?? null, range: open?.path?.range ?? null, hinge: open?.path?.hinge ?? [], ready,
    filled: fp?.filled ?? 0, first: approval && app ? { approval, app } : null, ms: fp?.ms ?? null,
  };
}

const FILED = new Set(["review", "filing", "approved"]);
/** A workspace in its first run: a plan written at sign-up, and nothing sent to an agency yet. */
export const isFirstRun = (ws: Workspace) => !!ws.firstPlan && ws.apps.length > 0 && !ws.apps.some(a => FILED.has(a.status));

const s = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** "You need 11 licenses and permits to open." (or "to operate", for a store already open) */
export function needLine(f: FirstRun, open = false): Bi {
  return B(`You need ${s(f.permits, "license or permit", "licenses and permits")} to ${open ? "operate" : "open"}.`, `${open ? "经营" : "开业"}需要办 ${f.permits} 项执照和许可。`);
}

/** "Odelia can file 3 of them herself today. 7 more once online filing is on." Only routes she sends on today count as
 *  hers; the agency's portal waits for online filing. null when there's nothing to claim. */
export function canFileLine(f: FirstRun): Bi | null {
  const later = f.online ? B(` ${f.online} more once online filing is on.`, `另有 ${f.online} 项在线提交开通后也由她提交。`) : B("", "");
  if (!f.odelia) return f.online ? B(`Odelia can file ${f.online === f.permits ? (f.permits === 1 ? "it" : `all ${f.permits}`) : `${f.online} of them`} once online filing is on.`, `在线提交开通后，${f.online === f.permits ? "全部" : `其中 ${f.online} 项`}由 Odelia 提交。`) : null;
  const all = f.odelia === f.permits;
  return B((all ? (f.permits === 1 ? "Odelia can file it herself today." : `Odelia can file all ${f.permits} herself today.`) : `Odelia can file ${f.odelia} of them herself today.`) + later.en,
    (all ? (f.permits === 1 ? "Odelia 今天就能自己提交。" : `${f.permits} 项 Odelia 今天都能自己提交。`) : `其中 ${f.odelia} 项 Odelia 今天就能自己提交。`) + later.zh);
}

/** What the rest are: what she prepares for you to send, what's yours, what she confirms first. */
export function restLine(f: FirstRun): Bi | null {
  const en: string[] = [], zh: string[] = [];
  if (f.prepares) { en.push(`${f.prepares} she prepares for you to send.`); zh.push(`${f.prepares} 项由她准备好，您来寄出或提交。`); }
  if (f.you) { en.push(`${f.you} ${f.you === 1 ? "is" : "are"} yours to do, like a staff certificate or a visit in person.`); zh.push(`${f.you} 项需要您本人办理，例如员工证书或现场办理。`); }
  if (f.confirm) { en.push(`${f.confirm} she confirms with the agency before counting ${f.confirm === 1 ? "it" : "them"}.`); zh.push(`${f.confirm} 项她会先向机构确认再计入。`); }
  return en.length ? B(en.join(" "), zh.join("")) : null;
}

/** What Odelia is doing right now, said from the workspace: a running task, the filing she waits on, or what's next. */
export function nowLine(ws: Workspace, f: FirstRun, running?: Bi | null): Bi {
  if (running) return running;
  if (f.first) {
    const ag = f.first.app.agency;
    return B(`Waiting for your approval to file the ${f.first.app.name.en} with ${/^(the|your)\b/i.test(ag.en) ? ag.en : "the " + ag.en}. Nothing is sent until you approve.`,
      `等您批准后，向${ag.zh}提交${f.first.app.name.zh}。未经您批准，什么都不会发出。`);
  }
  const next = ws.approvals[0];
  if (next) return B(`Waiting for you on "${next.title.en}". Nothing is sent until you approve.`, `等您处理“${next.title.zh}”。未经您批准，什么都不会发出。`);
  return B("Ready to fill your first application when you say go. Nothing is filed until you approve.", "您一声令下，她就开始填写第一份申请。未经您批准，什么都不会提交。");
}
