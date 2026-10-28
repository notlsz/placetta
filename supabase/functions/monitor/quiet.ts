// What reaches the owner personally (the morning email, a text) and what stays quietly in the app's timeline.
//
// Odelia does everything she can herself, so most Updates are her own progress: started, submitted, mailed, a page she
// read, a weekly overview, a receipt. The owner can't act on those, so they stay in Updates (the timeline) and never
// become an email or a text. What does reach them: something only they can do (approve, sign, pay an agency fee, a step
// on the agency's page, a business decision), a clock running on them (a deadline or renewal within a week, an agency
// asking for something, a denial, a lapse, an inspection), and the result they're paying for (an approval, a license).
// A kind this file doesn't know reaches them: missing a new kind of ask is worse than one extra line.
import { urgency, type UpdateLike } from "../_shared/odelia.ts";

/** Odelia's own progress and receipts: the owner has nothing to do about them. Keyed by the dedupe's first part. */
export const QUIET_HEADS = new Set([
  "mailed",          // a letter went out (the filing's timeline says so)
  "done", "run",     // a job of Odelia's finished
  "weekdone",        // the week's list of what she did
  "week",            // Monday's overview (every item in it that needs them is its own Update)
  "payment_ok",      // a payment went through
  "refund",          // money came back
  "agency-status",   // an agency page changed; Odelia reads it and tells them only if it asks something
  "page",            // the same, by its hash
  "call",            // a call Odelia made or an interpreted conversation, on the record
  "notice",          // a mention already sent to its person by notices.ts
  "stage",           // a stage already sent by stage.ts
]);
/** Filing stages that are Odelia's own progress. */
const QUIET_STAGES = new Set(["in_progress", "submitted", "requested", "queued", "running", "sent"]);

const parts = (u: Pick<UpdateLike, "dedupe">) => String(u.dedupe ?? "").split(":");

/** The result they're paying for: the agency approved it, or a license is in hand. Reaches them, after what needs them. */
export function goodNews(u: Pick<UpdateLike, "dedupe">): boolean {
  const [head, , stage] = parts(u);
  return (head === "filing" && stage === "accepted") || head === "license" || (head === "record" && parts(u)[1] === "news");
}

/** Whether an Update reaches the owner by email or text, or stays in the app's timeline. */
export function ownerWorthy(u: UpdateLike, critical: Set<string> = new Set()): boolean {
  if (urgency(u, critical)) return true;
  if (goodNews(u)) return true;
  const [head, second, stage] = parts(u);
  if (QUIET_HEADS.has(head)) return false;
  if (head === "filing" && QUIET_STAGES.has(stage)) return false;
  if (head === "purchase" && stage === "paid") return false;                             // a receipt
  if (head === "record" && second === "info") return false;                             // the city's posting, for the record
  // a deadline, renewal or permit more than a week out: Odelia starts it herself ahead of time (renewals 60 days out)
  if ((head === "deadline" || head === "renewal" || head === "permit") && !urgency(u, critical)) return false;
  return true;
}
