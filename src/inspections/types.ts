import type { Bi } from "../bi";

/* What each local agency inspects before (and after) a store opens, how to book it, and what the inspector checks,
   taken from the agency's own pages and checklists. One JSON file per jurisdiction in ./data/<where>.json, keyed by
   the same "where" codes as the forms library (SJ, SF, NYC, ...). Every inspection names its source. */

export type CheckItem = {
  id: string;
  item: Bi;          // what has to be true, in the inspector's terms
  why?: Bi;          // the rule or code section the agency cites, when it gives one
};

export type Inspection = {
  id: string;                                   // "health-preopening", "building-final", "fire-final", "health-routine"
  kind: "health" | "building" | "fire" | "planning" | "other";
  stage: "opening" | "routine";                 // before opening, or after (routine/unannounced)
  name: Bi;
  agency: Bi;
  when: Bi;                                     // where it falls in an opening (e.g. "After the building final, before you serve food")
  book: Bi;                                     // how to schedule it, as the agency says
  bookUrl?: string;                             // the agency's own scheduling page or portal
  phone?: string;
  lead?: Bi;                                    // how far ahead to book, if the agency says
  fee?: number | null;                          // USD; null when the agency sets it by size/type; absent when not published
  feeNote?: Bi;
  scoring?: Bi;                                 // how results are posted (letter grade, color placard, score)
  failNext?: Bi;                                // what happens on a fail (re-inspection, fee)
  checklist: CheckItem[];                       // how to pass: the agency's own items
  source: string;                               // the official page or checklist this came from
  sources?: string[];
};

export type LocalInspections = {
  where: string;
  name: Bi;                                     // "San José (Santa Clara County)"
  read: string;                                 // date the sources were read
  inspections: Inspection[];
  notes?: string;
};
