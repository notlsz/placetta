// The western states' mandatory state filings the library was missing (Oregon, Washington, Utah, Idaho, Montana,
// Wyoming, Alaska and Hawaii; California, Nevada and Arizona had theirs): sales tax permits, employer withholding and
// unemployment insurance registrations, Wyoming's state workers' compensation registration, Alaska's business license,
// and the state food licenses (processors and warehouses, and the stores a state licenses itself). Read 2026-10-28 from
// each agency's own page, each proof a sentence under 25 words copied as fetched (scripts/eval/proof-read.py). A fee is
// stated only where the agency prints it; otherwise null. The entries are data (west.json, built from the research
// notes) so the server bundles carry them gzipped. Their filing routes are in supabase/functions/file/dest/west.ts.
//
// Left out, with the reason: the food permits Nevada, Arizona and Idaho leave to county health districts (no state
// license), California's retail food permits (county), Washington's employer accounts (the state business license
// application opens them: wa-bls), and workers' compensation in the states where it's a private policy, not a filing.
import DATA from "./west.json";
import type { OfficialForm } from "../registry";

export const WEST_FORMS = DATA as unknown as OfficialForm[];
