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
import { workspaceOpening, type Evidence } from "./smart";
import { readiness } from "./stores";
import { checksFor, type Check } from "./controls";

/** Who files an application: Odelia herself (Placetta submits it once you approve), you (a certificate staff earn,
 *  insurance, a filing made in person, one only a local professional may make), or not claimed yet (Odelia confirms
 *  with the agency first, or the registry doesn't know how the agency takes it). */
export type Who = "odelia" | "you" | "confirm";
export function whoFiles(a: Pick<Application, "abstain" | "yours" | "specialist" | "official">): Who {
  if (a.abstain) return "confirm";
  if (a.yours || a.specialist) return "you";
  const f = a.official ? formById(a.official) : undefined;
  if (!f) return "confirm";
  if (f.method === "in_person" || f.method === "insurer" || f.method === "none") return "you";
  return "odelia";
}

export type FirstRun = {
  permits: number;           // every application in the plan
  odelia: number;            // Odelia files them herself
  you: number;               // the owner's own steps
  confirm: number;           // Odelia confirms with the agency before claiming them
  agencyUSD: number;         // published agency fees in dollars (the Cost to open's agency total)
  published: number;         // applications with a published fee
  unpublished: number;       // fees the agency sets or the registry doesn't have: never counted
  opening: string | null;    // the opening date the permits put it at
  ready: { score: number; issued: number; total: number; failing: Check[] } | null;   // the store's "% ready to open"
  filled: number;            // form lines filled from the signup's answers
  first: { approval: Approval; app: Application } | null;   // the first filing, ready to approve
  ms: number | null;         // how long the plan took, measured at sign-up
};

/** The first-run facts for this workspace today. */
export function firstRunFacts(ws: Workspace, today: string, ev: Evidence = {}): FirstRun {
  const who = ws.apps.map(whoFiles);
  const cost = costToOpen(ws, { today, ev });
  const open = workspaceOpening(ws, today, ev);
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
    permits: ws.apps.length, odelia: who.filter(w => w === "odelia").length, you: who.filter(w => w === "you").length, confirm: who.filter(w => w === "confirm").length,
    agencyUSD: cost.agencyUSD, published: cost.published, unpublished: cost.unpublished, opening: open?.date ?? null, ready,
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

/** "Odelia can file 8 of them herself." with the rest said plainly; empty when she files none yet. */
export function canFileLine(f: FirstRun): Bi | null {
  if (!f.odelia) return f.confirm ? B(`Odelia confirms ${f.confirm === 1 ? "it" : `all ${f.confirm}`} with the agencies first.`, `Odelia 会先向机构逐项确认。`) : null;
  const all = f.odelia === f.permits;
  return B(all ? (f.permits === 1 ? "Odelia can file it herself." : `Odelia can file all ${f.permits} herself.`) : `Odelia can file ${f.odelia} of them herself.`,
    all ? (f.permits === 1 ? "Odelia 可以自己提交。" : `${f.permits} 项 Odelia 都能自己提交。`) : `其中 ${f.odelia} 项 Odelia 可以自己提交。`);
}

/** What the rest are: "2 are yours to do (a certificate, insurance or in person). 3 she confirms with the agency first." */
export function restLine(f: FirstRun): Bi | null {
  const en: string[] = [], zh: string[] = [];
  if (f.odelia && f.you) { en.push(`${f.you} ${f.you === 1 ? "is" : "are"} yours to do, like a staff certificate or a visit in person.`); zh.push(`${f.you} 项需要您本人办理，例如员工证书或现场办理。`); }
  if (f.odelia && f.confirm) { en.push(`${f.confirm} she confirms with the agency before counting ${f.confirm === 1 ? "it" : "them"}.`); zh.push(`${f.confirm} 项她会先向机构确认再计入。`); }
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
