/* Sign-up's paste and drop reading (src/intakeParse.ts): what an owner pastes or drops fills the last screen of
   onboarding. Run from scripts/home-next-test.ts (npm run test:home). */
import { readPasted } from "../src/intakeParse";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;

export function intakeParseTests(ok: Ok) {
  console.log("\n# Sign-up: reading a paste or a dropped document");
  const sig = readPasted("Mei Chen | Owner\nLucky Leaf Tea LLC\n1 N First St, San Jose, CA 95113\n(408) 555-0142\nluckyleaftea.com");
  ok(sig.owner?.value === "Mei Chen" && sig.legal?.value === "Lucky Leaf Tea LLC" && sig.address?.value === "1 N First St, San Jose, CA 95113" && sig.website?.value === "luckyleaftea.com" && sig.phone?.value === "(408) 555-0142",
    "an email signature: the owner, the company, the address, the website and the phone", sig);
  const cp575 = readPasted("Department of the Treasury\nInternal Revenue Service\nWe assigned you an Employer Identification Number (EIN) 88-1234471\nMOONLEAF TEA LLC\nMEI LIN SOLE MBR\n100 N FIRST ST\nSAN JOSE, CA 95113");
  ok(cp575.ein?.value === "88-1234471" && /MOONLEAF TEA LLC/.test(cp575.legal?.value ?? "") && /assigned you/.test(cp575.ein?.quote ?? ""), "an IRS EIN letter: the EIN with its words, and the company", cp575);
  const arts = readPasted("ARTICLES OF ORGANIZATION\n1. Name of the limited liability company: Golden Pot Hot Pot LLC\n2. Street address: 4521 Campus Dr, Irvine, CA 92612\nOrganizer: Jason Wu");
  ok(arts.legal?.value === "Golden Pot Hot Pot LLC" && arts.address?.value === "4521 Campus Dr, Irvine, CA 92612" && arts.owner?.value === "Jason Wu", "articles of organization: name, address and organizer", arts);
  const url = readPasted("https://www.goldenpot.com/menu");
  ok(url.website?.value === "goldenpot.com" && !url.legal && !url.owner, "a website address: the website only", url);
  ok(!readPasted("hello there").legal && !readPasted("Thanks, see you soon").owner, "plain words read as nothing");
}
