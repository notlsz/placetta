// The Mid-Atlantic states' own filings the library didn't have yet (New York, New Jersey, Pennsylvania, Maryland, the
// District of Columbia, Virginia, Delaware and West Virginia): the state food licenses for a maker, processor or food
// warehouse and the state retail food licenses where the state (not the county) issues them, and, for Delaware and
// West Virginia, the business license or tax registration and the unemployment registration. Read 2026-10-28 from each
// agency's own page with curl; each proof is under 25 words, copied as fetched. Data in midatlantic.json (gzipped in the
// server bundles); routes in supabase/functions/file/dest/midatlantic.ts.
//
// Left out, with the reason: Maryland, New Jersey and West Virginia retail food (county or local health departments
// issue it); the District of Columbia's food manufacturer license (not confirmed on DC Health's own page in this pass);
// Delaware's and West Virginia's workers' compensation (a policy bought from an insurer, not a state filing); Delaware
// food processors (no separate state license found on the Division of Public Health's pages).
import type { OfficialForm } from "../registry";
import DATA from "./midatlantic.json";

export const MIDATLANTIC_FORMS = DATA as unknown as OfficialForm[];
