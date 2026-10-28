// The plains states' state-level filings (Texas's gaps, New Mexico, Colorado's gap, Oklahoma, Kansas, Nebraska, South
// Dakota, North Dakota): sales or gross receipts tax, withholding, unemployment insurance, North Dakota's state-fund
// workers' comp, and the state food licenses. Read 2026-10-28 from each agency's own page, the proof quoted on each
// entry. The data is JSON (gzipped in the server bundles); this file only types it.
//
// Left out, with the reason: South Dakota and Texas have no state income tax (no withholding registration);
// workers' comp outside North Dakota is insurance bought from an insurer, not a state filing (Texas's and Colorado's
// rows were already in the library); Colorado's and Texas's retail food permits come from the local health agency;
// North Dakota's retail food license is issued by the state or, under agreements, by eight local health units whose
// areas weren't read; South Dakota has no state license for a general food manufacturer on the pages read.
import type { OfficialForm } from "../registry";
import DATA from "./plains.json";

export const PLAINS_FORMS = DATA as unknown as OfficialForm[];
