// The state filings a company selling goods needs in the South, where the library had none: sales tax (and withholding,
// where the same application opens it), unemployment insurance, and the state's own food license for a food processor
// or warehouse and for a food store (and, where the state itself permits them, restaurants). Florida and Georgia: gaps
// only (FDACS's and GDA's food licenses). Alabama, Mississippi, Louisiana (filed under "LOU"), Arkansas, Tennessee,
// Kentucky, South Carolina and North Carolina. Read 2026-10-28 on each agency's own page; the proof on each row is the
// page's sentence, under 25 words. Workers' compensation in these states is insurance bought from an insurer (none runs
// a state fund the employer files with), so it adds no row. Left out, with the reason: restaurant permits that a county
// or district health department issues (Alabama, Georgia, Kentucky, North Carolina, and Tennessee's contract counties),
// Arkansas's wholesale food permit (no official page read states the filing) and any North Carolina food license (the
// NCDA&CS page: packaged foods other than meat, "No license required").
import type { OfficialForm } from "../registry";
import DATA from "./south.json";

export const SOUTH_FORMS = DATA as unknown as OfficialForm[];
