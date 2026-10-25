import { B, type Bi } from "./bi";
import type { Application, Approval } from "./model";
import { formById } from "./forms/registry";
import ROUTES from "./forms/filingRoutes.json";
import STEPS from "./forms/filingSteps.json";

/* Who files it and how long the agency takes, on every approval card: from data Placetta already keeps, never a guess.
   Who: the form's first-try route (src/forms/filingRoutes.json, written with docs/FILING_COVERAGE.md by
   scripts/filing-coverage.mjs from supabase/functions/file/destinations.ts). A form with no route of its own, or one the
   registry doesn't have, Odelia prepares with a packet and the business sends, and the card says so.
   How long: the agency's own published processing time from the registry (src/forms), else the application's estimate
   when it states one. With neither, the card says nothing about time. Pure: NeedRow and the approval sheet render it,
   scripts/review-fixes-test.ts tests it. */

/* notReady: the agency's site is known, but automatic filing isn't switched on for the form (its sign-off or on-behalf
   rule isn't confirmed, supabase/functions/file/destinations.ts notReady). The card says the person submits it, never
   that Odelia files it. A form with no entry, or an entry this file doesn't know, is "team": prepared, the business sends. */
export type RouteKind = "portal" | "email" | "fax" | "mail" | "owner" | "faxSigned" | "ownerSigns" | "notReady" | "team";
const KINDS = new Set<RouteKind>(["portal", "email", "fax", "mail", "owner", "faxSigned", "ownerSigns", "notReady", "team"]);
const BY_ID = ROUTES as Record<string, string>;
/** The steps that stay the person's on a route Placetta sends (scripts/filing-coverage.mjs): "pay", the agency's fee on
 *  its own site, which the portal worker always hands back. */
const STEPS_BY_ID = STEPS as Record<string, string[]>;

const WHO: Record<RouteKind, Bi> = {
  portal: B("Odelia files online", "Odelia 在线提交"),
  email: B("Odelia files online", "Odelia 在线提交"),
  fax: B("Odelia faxes it", "Odelia 传真提交"),
  mail: B("Odelia mails it", "Odelia 邮寄提交"),
  faxSigned: B("You sign it, then Odelia faxes it", "您签字后，Odelia 传真提交"),
  owner: B("Odelia prepares it and you send it", "Odelia 准备好，由您寄出"),
  ownerSigns: B("Odelia prepares it, you sign and send it", "Odelia 准备好，由您签字寄出"),
  notReady: B("Odelia prepares it and you submit it on the agency's site", "Odelia 准备好，由您在机构网站上提交"),
  team: B("Odelia prepares it and you send it", "Odelia 准备好，由您提交"),
};

/** What else the card says: the person's own step on a route Odelia sends, or why Odelia doesn't send it. */
const STEP: Record<string, Bi> = {
  pay: B("You pay the agency's fee on its site", "您在机构网站上自行支付规费"),
  notReady: B("Automatic filing isn't switched on for this form yet", "这份表格尚未开通自动提交"),
};

/** The route kind for an application's form: only a kind this file knows, else "team". */
export const routeOf = (app?: Pick<Application, "official">): RouteKind => {
  const k = app?.official && Object.prototype.hasOwnProperty.call(BY_ID, app.official) ? BY_ID[app.official] : undefined;
  return k && KINDS.has(k as RouteKind) ? (k as RouteKind) : "team";
};

/** The person's own steps on this form's route (only on a route Odelia sends; a known step only). */
export function personSteps(app?: Pick<Application, "official">): Bi[] {
  const k = routeOf(app);
  if (k === "notReady") return [STEP.notReady];
  if (k !== "portal" || !app?.official) return [];
  const steps = Object.prototype.hasOwnProperty.call(STEPS_BY_ID, app.official) ? STEPS_BY_ID[app.official] : [];
  return (Array.isArray(steps) ? steps : []).filter((s) => s === "pay").map((s) => STEP[s]);
}

/** An estimate that states no time is no estimate ("To be confirmed", "The agency doesn't publish a processing time"). */
const SAYS_NO_TIME = /^(to be confirmed|待确认)$|doesn'?t publish|未公布|no published/i;

/** The agency's time for an application: the registry's published one, else its own estimate; undefined when neither
 *  states a time. */
export function expectedTime(app?: Pick<Application, "official" | "est">): Bi | undefined {
  const f = app?.official ? formById(app.official) : undefined;
  if (f?.takes && !SAYS_NO_TIME.test(f.takes.en)) return f.takes;
  if (app?.est && app.est.en.trim() && !SAYS_NO_TIME.test(app.est.en)) return app.est;
  return undefined;
}

/** What an approval card says under its title about who acts and how long it takes. null: a card with no filing (an
 *  upload is the owner's own step). */
export function approvalRoute(a: Pick<Approval, "kind">, app?: Pick<Application, "official" | "est">): { who: Bi; time?: Bi; steps?: Bi[] } | null {
  if (a.kind === "file") {
    const steps = personSteps(app);
    return { who: WHO[routeOf(app)], time: expectedTime(app), ...(steps.length ? { steps } : {}) };
  }
  if (a.kind === "send") return { who: B("Odelia sends it once you approve", "您批准后由 Odelia 发送") };
  if (a.kind === "pay") return { who: B("You pay the agency on its own page", "您在机构官网直接付款") };
  return null;
}
