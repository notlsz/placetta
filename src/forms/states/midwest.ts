// State-level filings for the Midwest (Illinois, Indiana, Ohio, Michigan, Wisconsin, Minnesota, Iowa, Missouri) that the
// library didn't have yet: sales tax, employer withholding, unemployment insurance, and the state food license for a food
// plant or food warehouse (and for a food store where the state, not the county, issues it). Data in midwest.json, read
// from each agency's own page on 2026-10-28; each proof is the page's sentence as fetched.
//
// Left out, with the reason: Illinois withholding (one REG-1 registers every IDOR tax, il-tax, "before you make any
// purchases, sales, or hire an employee"); workers' compensation outside Ohio (insurance bought from a carrier, not a state filing;
// Ohio's state fund is already oh-workers-comp); Missouri's food license (DHSS: "The State of Missouri does not
// license/permit food processors"); retail food licenses in Illinois, Indiana, Ohio, Wisconsin and Missouri (a county,
// city or local health department issues them, or in Wisconsin an agent county).
import type { OfficialForm } from "../registry";
import DATA from "./midwest.json";

export const MIDWEST_FORMS = DATA as unknown as OfficialForm[];
