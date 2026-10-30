/* The licenses the production probe files (scripts/probe/run.ts): 30 real forms across 15 states and the federal
   government, each with the business and the facts a customer would give, so Odelia can prepare it without asking.
   `form` is the registry id the plan must land on; `alt` are ids that also satisfy it (another edition of the same
   filing). Rotated: the nightly run takes a slice (--slice), the weekly run takes all of them. */

export type Case = {
  id: string; form: string; alt?: string[]; lang?: "en" | "zh";
  business: string; what: string; address: string; facts: string[];
};

const OWNER = "Owner: Mei Chen, managing member, phone (917) 555-0142";
const llc = (name: string, state = "Delaware") => `Legal name: ${name} LLC, a ${state} limited liability company formed 2026-03-02`;

export const CASES: Case[] = [
  { id: "nyc-sales-tax", form: "ny-dtf-17", business: "Leaf & Pearl Tea", what: "a bubble tea shop", address: "136-20 Roosevelt Ave, Flushing, NY 11354", facts: [llc("Leaf & Pearl Tea", "New York"), "EIN 88-1234567", OWNER, "Opening 2026-12-01, sells drinks and packaged snacks"] },
  { id: "nyc-dcwp", form: "nyc-dcwp-license", business: "Fix It Fast", what: "an electronics repair store", address: "41-60 Main St, Flushing, NY 11355", facts: [llc("Fix It Fast", "New York"), "EIN 88-2345678", OWNER, "Repairs phones and laptops, opening 2026-12-15"] },
  { id: "ein", form: "irs-ss4", business: "Golden Hour Bakery", what: "a bakery", address: "2210 Mission St, San Francisco, CA 94110", facts: [llc("Golden Hour Bakery", "California"), "Single member: Mei Chen", "No EIN yet", "First employees in January 2027, 4 people", "Starts business 2026-11-20"] },
  { id: "ca-llc", form: "ca-llc-1", business: "Sunset Noodle", what: "a noodle restaurant", address: "1800 Sunset Blvd, Los Angeles, CA 90026", facts: ["Legal name to form: Sunset Noodle LLC (not formed yet)", "Managed by one manager: Mei Chen", "Agent for service: Mei Chen, 1800 Sunset Blvd, Los Angeles, CA 90026", OWNER] },
  { id: "la-btrc", form: "la-btrc", business: "Echo Park Coffee", what: "a coffee shop", address: "1559 Echo Park Ave, Los Angeles, CA 90026", facts: [llc("Echo Park Coffee", "California"), "EIN 88-3456789", OWNER, "Business starts 2026-12-01, expected gross receipts $400,000 a year"] },
  { id: "lac-health", form: "lac-health-permit", business: "Pho Saigon Express", what: "a 40-seat restaurant", address: "9255 Valley Blvd, Rosemead, CA 91770", facts: [llc("Pho Saigon Express", "California"), "EIN 88-4567890", OWNER, "Full kitchen, 40 seats, open 10am to 10pm"] },
  { id: "sf-plan-check", form: "sf-dph-plan-check", business: "Mission Dumpling", what: "a dumpling restaurant with a full kitchen", address: "2400 Mission St, San Francisco, CA 94110", facts: [llc("Mission Dumpling", "California"), "EIN 88-5678901", OWNER, "1,800 sq ft, new hood and grease trap, 30 seats"] },
  { id: "sf-fire", form: "sf-fire-assembly", business: "Bay Hall Eatery", what: "a 60-seat food hall restaurant", address: "1 Ferry Building, San Francisco, CA 94111", facts: [llc("Bay Hall Eatery", "California"), OWNER, "Occupant load 75, open until midnight"] },
  { id: "tx-sales-tax", form: "tx-ap201", business: "Bayou Boba", what: "a tea shop", address: "9889 Bellaire Blvd, Houston, TX 77036", facts: [llc("Bayou Boba", "Texas"), "Texas SOS file number 805123456", "EIN 88-6789012", OWNER, "First sale 2026-12-05"] },
  { id: "hou-food", form: "hou-food-dealer", business: "Bellaire Hot Pot", what: "a hot pot restaurant", address: "9750 Bellaire Blvd, Houston, TX 77036", facts: [llc("Bellaire Hot Pot", "Texas"), "EIN 88-7890123", OWNER, "120 seats, full kitchen"] },
  { id: "dal-food", form: "dal-food-permit", business: "Deep Ellum Bao", what: "a bao shop", address: "2700 Main St, Dallas, TX 75226", facts: [llc("Deep Ellum Bao", "Texas"), "EIN 88-8901234", OWNER, "Counter service, 20 seats"] },
  { id: "aus-food", form: "aus-food-permit", business: "Eastside Ramen", what: "a ramen restaurant", address: "1100 E 6th St, Austin, TX 78702", facts: [llc("Eastside Ramen", "Texas"), "EIN 88-9012345", OWNER, "Full kitchen, 45 seats"] },
  { id: "tx-foreign-llc", form: "tx-304", business: "Pearl River Tea", what: "a tea shop (our company is a Delaware LLC)", address: "5000 Westheimer Rd, Houston, TX 77056", facts: [llc("Pearl River Tea", "Delaware"), "Delaware file number 7123456", "EIN 88-1112223", OWNER, "Registered agent in Texas: Mei Chen, 5000 Westheimer Rd, Houston, TX 77056"] },
  { id: "az-tpt", form: "az-tpt", business: "Desert Bloom Tea", what: "a tea shop", address: "1 E Washington St, Phoenix, AZ 85004", facts: [llc("Desert Bloom Tea", "Arizona"), "Arizona entity number 23456789", "EIN 88-2223334", OWNER, "Retail sales starting 2026-12-10"] },
  { id: "bos-cv", form: "bos-cv", business: "Harbor Dim Sum", what: "a dim sum restaurant", address: "88 Beach St, Boston, MA 02111", facts: [llc("Harbor Dim Sum", "Massachusetts"), "EIN 88-3334445", OWNER, "80 seats, open 9am to 11pm"] },
  { id: "bos-food", form: "bos-food-permit", business: "Back Bay Poke", what: "a poke shop", address: "500 Boylston St, Boston, MA 02116", facts: [llc("Back Bay Poke", "Massachusetts"), "EIN 88-4445556", OWNER, "Counter service, 15 seats"] },
  { id: "atl-plan", form: "fulton-plan-review", business: "Peachtree Pho", what: "a pho restaurant", address: "3330 Piedmont Rd NE, Atlanta, GA 30305", facts: [llc("Peachtree Pho", "Georgia"), "EIN 88-5556667", OWNER, "Full kitchen, 50 seats, 2,200 sq ft"] },
  { id: "sea-license", form: "sea-business-license", alt: ["wa-bls"], business: "Pike Street Tea", what: "a tea shop", address: "1505 Pike Pl, Seattle, WA 98101", facts: [llc("Pike Street Tea", "Washington"), "Washington UBI 604123456", "EIN 88-6667778", OWNER] },
  { id: "wa-bls", form: "wa-bls", business: "Rainier Dumpling", what: "a dumpling shop", address: "4101 Rainier Ave S, Seattle, WA 98118", facts: [llc("Rainier Dumpling", "Washington"), "EIN 88-7778889", OWNER, "First employee 2026-12-01"] },
  { id: "nv-tax", form: "nv-tax", business: "Spring Mountain Tea", what: "a tea shop", address: "4300 Spring Mountain Rd, Las Vegas, NV 89102", facts: [llc("Spring Mountain Tea", "Nevada"), "Nevada business ID NV20263456789", "EIN 88-8889990", OWNER] },
  { id: "lv-food", form: "lv-food", alt: ["snhd-plan-review"], business: "Chinatown Noodle House", what: "a noodle restaurant", address: "4215 Spring Mountain Rd, Las Vegas, NV 89102", facts: [llc("Chinatown Noodle House", "Nevada"), "EIN 88-9990001", OWNER, "Full kitchen, 60 seats"] },
  { id: "il-tax", form: "il-tax", business: "Wentworth Bakery", what: "a bakery", address: "2200 S Wentworth Ave, Chicago, IL 60616", facts: [llc("Wentworth Bakery", "Illinois"), "EIN 88-1212121", OWNER, "Retail sales starting 2026-12-01"] },
  { id: "fl-dbpr", form: "fl-dbpr", alt: ["fl-dbpr-plan"], business: "Brickell Bao", what: "a restaurant", address: "1001 Brickell Bay Dr, Miami, FL 33131", facts: [llc("Brickell Bao", "Florida"), "Sunbiz document number L26000123456", "EIN 88-2323232", OWNER, "70 seats, full kitchen"] },
  { id: "fl-dor", form: "fl-dor", business: "Coral Gables Tea", what: "a tea shop", address: "2300 Ponce de Leon Blvd, Coral Gables, FL 33134", facts: [llc("Coral Gables Tea", "Florida"), "EIN 88-3434343", OWNER, "Sales and two employees starting 2026-12-01"] },
  { id: "den-plan", form: "den-plan-review", business: "Federal Blvd Pho", what: "a pho restaurant", address: "333 S Federal Blvd, Denver, CO 80219", facts: [llc("Federal Blvd Pho", "Colorado"), "EIN 88-4545454", OWNER, "Full kitchen, 55 seats"] },
  { id: "mpls-food", form: "mpls-food-license", alt: ["mpls-plan-review"], business: "Nicollet Hot Pot", what: "a hot pot restaurant", address: "2600 Nicollet Ave, Minneapolis, MN 55408", facts: [llc("Nicollet Hot Pot", "Minnesota"), "EIN 88-5656565", OWNER, "90 seats"] },
  { id: "pdx-food", form: "mult-food-license", alt: ["mult-plan-review"], business: "Division St Dumplings", what: "a dumpling restaurant", address: "3300 SE Division St, Portland, OR 97202", facts: [llc("Division St Dumplings", "Oregon"), "EIN 88-6767676", OWNER, "35 seats"] },
  { id: "md-cra", form: "md-cra", business: "Rockville Tea House", what: "a tea house", address: "1488 Rockville Pike, Rockville, MD 20852", facts: [llc("Rockville Tea House", "Maryland"), "Maryland SDAT ID W26123456", "EIN 88-7878787", OWNER, "Sales and 3 employees from 2026-12-01"] },
  { id: "moco-food", form: "moco-food-license", business: "Wheaton Noodle Bar", what: "a noodle restaurant", address: "11160 Veirs Mill Rd, Wheaton, MD 20902", facts: [llc("Wheaton Noodle Bar", "Maryland"), "EIN 88-8989898", OWNER, "Full kitchen, 40 seats"] },
  { id: "hi-get", form: "hi-bb1", business: "Kapahulu Shave Ice", what: "a shave ice and tea shop", address: "820 Kapahulu Ave, Honolulu, HI 96816", facts: [llc("Kapahulu Shave Ice", "Hawaii"), "EIN 88-9191919", OWNER, "Retail sales from 2026-12-01"] },
];

/** What a customer answers when Odelia asks for the rest: the details every license form asks somewhere. */
export function answersOf(c: Case): string {
  return [
    "Here's everything else you might need:",
    `Mailing address: the same as the store, ${c.address}.`,
    "Owner's home address: 2150 Lemoine Ave, Apt 4B, Fort Lee, NJ 07024. Owner's date of birth: 1988-04-12. Title: managing member, 100% owner.",
    "Business email: owner@probe-test.example. Business phone: (917) 555-0142.",
    "Bank: JPMorgan Chase, business checking. Card processor: Square.",
    // what a real owner answers next: no new seat count or size (each case's own facts carry those; a second number
    // only made Odelia ask which was right), and the dates and coverage most forms ask for
    "Seats, size and hours are as I said before. We open on 2026-12-15. Expected sales about $35,000 a month. 4 employees from 2026-12-01, first payroll 2026-12-15, about $28,000 in wages in the first quarter.",
    "Workers' comp: Travelers, policy WC-PROBE-0001, 2026-12-01 to 2027-12-01. Public water and public sewer. A certified food protection manager: Mei Chen. File returns monthly. Taxed as a single-member LLC, disregarded. Yes to email from the agency.",
    "Fiscal year ends December 31, cash basis. No alcohol, tobacco, vapor products, motor fuel or amusement machines. Not run from a home. No other locations in this state. No previous permits, no merger, not buying an existing business. No representatives or agents.",
    "For any other yes/no line that doesn't apply to us, the answer is No. Fill it all in and put it up for my approval.",
  ].join("\n");
}

/** What Odelia is asked, as a customer would put it. */
export function promptOf(c: Case, title: string): string {
  return [
    `I'm opening ${c.what}, ${c.business}, at ${c.address}.`,
    ...c.facts,
    `Please prepare the ${title} for this location with these details and put it up for my approval. Don't ask me anything you can fill from what I've told you.`,
  ].join("\n");
}
