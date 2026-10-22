// The target markets: the 15 US cities where Chinese food and drink brands opened the most stores from 2023 to 2026,
// with San José and the unincorporated places whose permits go through the county (Paradise and Spring Valley on the
// Las Vegas Strip, Rowland Heights, Tysons), and the 15 states. Each has a sample storefront address the planner
// reads, and the jurisdictions whose forms may appear in its plan: the federal government, its state, and the city
// or county codes (src/forms registry `where`) that actually govern that address. scripts/market-coverage.ts fails
// when a required filing there points at any other jurisdiction's form, and writes docs/MARKET_COVERAGE.md.
import type { Where } from "./registry";

export type Market = { id: string; name: string; kind: "city" | "state"; rank?: number; state: string; address: string; allowed: Where[]; note?: string };

const city = (rank: number | undefined, id: string, name: string, state: string, address: string, local: Where[], note?: string): Market =>
  ({ id, name, kind: "city", rank, state, address, allowed: ["US", state, ...local], note });

export const MARKETS: Market[] = [
  city(1, "nyc-queens", "New York City: Queens", "NY", "136-20 Roosevelt Ave, Flushing, NY 11354", ["NYC"]),
  city(1, "nyc-manhattan", "New York City: Manhattan", "NY", "45 Mott St, New York, NY 10013", ["NYC"]),
  city(1, "nyc-brooklyn", "New York City: Brooklyn", "NY", "5502 8th Ave, Brooklyn, NY 11220", ["NYC"]),
  city(2, "los-angeles", "Los Angeles", "CA", "727 N Broadway, Los Angeles, CA 90012", ["LA", "LAC"]),
  city(3, "boston", "Boston", "MA", "60 Beach St, Boston, MA 02111", ["BOS"]),
  city(4, "seattle", "Seattle", "WA", "600 5th Ave S, Seattle, WA 98104", ["SEA", "KC"], "King County runs the food permits; the registry files them under King County (KC), so Bellevue and the county's other cities get them too."),
  city(5, "san-diego", "San Diego", "CA", "4646 Convoy St, San Diego, CA 92111", ["SDG", "SDC"], "San Diego County runs the food permits; the registry files them under the county (SDC)."),
  city(6, "philadelphia", "Philadelphia", "PA", "1001 Race St, Philadelphia, PA 19107", ["PHL"]),
  city(7, "san-francisco", "San Francisco", "CA", "845 Clay St, San Francisco, CA 94108", ["SF"]),
  city(8, "chicago", "Chicago", "IL", "2172 S Archer Ave, Chicago, IL 60616", ["CHI"]),
  city(9, "san-mateo", "San Mateo", "CA", "40 E 4th Ave, San Mateo, CA 94401", ["SMO", "SMC"], "San Mateo County Environmental Health runs the food permits."),
  city(10, "cupertino", "Cupertino", "CA", "10123 N Wolfe Rd, Cupertino, CA 95014", ["CUP", "SCC"], "Santa Clara County runs the food permits."),
  city(11, "irvine", "Irvine", "CA", "4250 Barranca Pkwy, Irvine, CA 92604", ["IRV", "ORC"], "Orange County runs the food permits; the registry files them under the county (ORC)."),
  city(12, "houston", "Houston", "TX", "9889 Bellaire Blvd, Houston, TX 77036", ["HOU"]),
  city(13, "glendale", "Glendale", "CA", "100 W Broadway, Glendale, CA 91210", ["GLN", "LAC"], "Los Angeles County runs the food permits (Glendale has no health department of its own)."),
  city(14, "san-gabriel", "San Gabriel", "CA", "140 W Valley Blvd, San Gabriel, CA 91776", ["SGB", "LAC"], "Los Angeles County runs the food permits."),
  city(15, "rockville", "Rockville", "MD", "1066 Rockville Pike, Rockville, MD 20852", ["ROC", "MOCO"], "Montgomery County runs the food permits; the City of Rockville issues its own building and occupancy permits."),
  city(undefined, "san-jose", "San José", "CA", "1688 Hostetter Rd, San Jose, CA 95131", ["SJ", "SCC"]),
  city(undefined, "paradise", "Paradise (unincorporated Clark County: the Las Vegas Strip)", "NV", "3570 S Las Vegas Blvd, Las Vegas, NV 89109", ["LV", "SNHD", "CLK"],
    "A Las Vegas mailing address, but outside the City of Las Vegas: Clark County licenses the business, and the Southern Nevada Health District (SNHD) the food."),
  city(undefined, "spring-valley", "Spring Valley (unincorporated Clark County)", "NV", "4255 Spring Mountain Rd, Spring Valley, NV 89102", ["LV", "SNHD", "CLK"],
    "Las Vegas's Chinatown: Clark County licenses the business, and the Southern Nevada Health District the food."),
  city(undefined, "rowland-heights", "Rowland Heights (unincorporated Los Angeles County)", "CA", "18414 Colima Rd, Rowland Heights, CA 91748", ["LAC", "LACU"]),
  city(undefined, "tysons", "Tysons (Fairfax County)", "VA", "8065 Leesburg Pike, Tysons, VA 22182", ["FFX"]),
  // added 2026-10-22 with the finishing pass: the guide cities whose every core step is now verified (docs/COVERAGE.md)
  city(undefined, "tampa", "Tampa", "FL", "1600 E 7th Ave, Tampa, FL 33605", ["TPA", "HILL"], "Hillsborough County (HILL) issues the county business tax receipt; the city issues its own."),
  city(undefined, "phoenix", "Phoenix", "AZ", "668 N 44th St, Phoenix, AZ 85008", ["PHX", "MARI"], "Maricopa County Environmental Services runs the food permits."),
  city(undefined, "sacramento", "Sacramento", "CA", "5591 Stockton Blvd, Sacramento, CA 95824", ["SAC", "SACC"], "Sacramento County's Environmental Management Department (SACC) runs the food permits."),
  city(undefined, "columbus", "Columbus", "OH", "3420 E Main St, Columbus, OH 43213", ["CMH"], "Franklin County's Auditor issues the vendor's license; the registry files it under Columbus (CMH)."),
];

/** The states, read at a storefront in each: only their federal and state filings count for the state row. */
const state = (code: string, name: string, address: string): Market => ({ id: code.toLowerCase(), name, kind: "state", state: code, address, allowed: ["US", code] });
export const STATE_MARKETS: Market[] = [
  state("CA", "California", "727 N Broadway, Los Angeles, CA 90012"),
  state("NY", "New York", "136-20 Roosevelt Ave, Flushing, NY 11354"),
  state("MA", "Massachusetts", "60 Beach St, Boston, MA 02111"),
  state("TX", "Texas", "9889 Bellaire Blvd, Houston, TX 77036"),
  state("WA", "Washington", "600 5th Ave S, Seattle, WA 98104"),
  state("IL", "Illinois", "2172 S Archer Ave, Chicago, IL 60616"),
  state("PA", "Pennsylvania", "1001 Race St, Philadelphia, PA 19107"),
  state("NJ", "New Jersey", "1655 Oak Tree Rd, Edison, NJ 08820"),
  state("MD", "Maryland", "1066 Rockville Pike, Rockville, MD 20852"),
  state("NV", "Nevada", "3570 S Las Vegas Blvd, Las Vegas, NV 89109"),
  state("VA", "Virginia", "8065 Leesburg Pike, Tysons, VA 22182"),
  state("AZ", "Arizona", "668 N 44th St, Phoenix, AZ 85008"),
  state("HI", "Hawaii", "1120 Maunakea St, Honolulu, HI 96817"),
  state("FL", "Florida", "1101 Brickell Ave, Miami, FL 33131"),
  state("UT", "Utah", "3390 S State St, Salt Lake City, UT 84115"),
];
