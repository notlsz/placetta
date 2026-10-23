import { B, type Bi } from "./bi";
import type { Application, Approval } from "./model";
import { formById } from "./forms/registry";
import ROUTES from "./forms/filingRoutes.json";

/* Who files it and how long the agency takes, on every approval card: from data Placetta already keeps, never a guess.
   Who: the form's first-try route (src/forms/filingRoutes.json, written with docs/FILING_COVERAGE.md by
   scripts/filing-coverage.mjs from supabase/functions/file/destinations.ts). A form with no route of its own, or one the
   registry doesn't have, goes to the Placetta team, and the card says so.
   How long: the agency's own published processing time from the registry (src/forms), else the application's estimate
   when it states one. With neither, the card says nothing about time. Pure: NeedRow and the approval sheet render it,
   scripts/review-fixes-test.ts tests it. */

export type RouteKind = "portal" | "email" | "fax" | "mail" | "owner" | "faxSigned" | "ownerSigns" | "team";
const BY_ID = ROUTES as Record<string, RouteKind>;

const WHO: Record<RouteKind, Bi> = {
  portal: B("Odelia files online", "Odelia 在线提交"),
  email: B("Odelia files online", "Odelia 在线提交"),
  fax: B("Odelia faxes it", "Odelia 传真提交"),
  mail: B("Odelia mails it", "Odelia 邮寄提交"),
  faxSigned: B("You sign it, then Odelia faxes it", "您签字后，Odelia 传真提交"),
  owner: B("Odelia prepares it and you send it", "Odelia 准备好，由您寄出"),
  ownerSigns: B("Odelia prepares it, you sign and send it", "Odelia 准备好，由您签字寄出"),
  team: B("The Placetta team files it", "快哉团队代为提交"),
};

/** The route kind for an application's form. */
export const routeOf = (app?: Pick<Application, "official">): RouteKind => (app?.official && BY_ID[app.official]) || "team";

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
export function approvalRoute(a: Pick<Approval, "kind">, app?: Pick<Application, "official" | "est">): { who: Bi; time?: Bi } | null {
  if (a.kind === "file") return { who: WHO[routeOf(app)], time: expectedTime(app) };
  if (a.kind === "send") return { who: B("Odelia sends it once you approve", "您批准后由 Odelia 发送") };
  if (a.kind === "pay") return { who: B("You pay the agency on its own page", "您在机构官网直接付款") };
  return null;
}
