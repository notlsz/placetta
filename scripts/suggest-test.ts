/* npm run test:suggest: the text fields' suggestions (src/suggestions.ts) come from the app's own lists, match what people
   type, never invent a value, and keep working when the browser refuses storage. */
import { agencySource, entitySource, factSource, fieldSource, kindSource, matchIn, placeSource, recents, remember, stateSource } from "../src/suggestions";
import { SAMPLE } from "../src/model";

let fails = 0;
const ok = (c: boolean, what: string) => { if (!c) { fails++; console.error("FAIL " + what); } else console.log("ok   " + what); };

// places: a city as it's typed, with how many licenses the registry maps there
const sj = placeSource("en")("san j");
ok(sj[0]?.value === "San Jose, CA", "\"san j\" suggests San Jose, CA first");
ok(/^\d+ licenses? mapped$/.test(sj[0]?.sub ?? ""), "its second line counts the licenses mapped: " + sj[0]?.sub);
ok(placeSource("zh")("圣何塞")[0]?.value === "San Jose, CA", "圣何塞 finds San Jose, CA");
ok(placeSource("en")("").length === 0, "an empty box suggests no place");
ok(placeSource("en", { only: ["city"] })("calif").every(s => s.value !== "California"), "a city box leaves the states out");

// kinds of business by their words, with the NAICS code
const tea = kindSource("en")("milk tea");
ok(tea[0]?.label === "Milk tea shop" && tea[0]?.sub?.startsWith("722515"), "\"milk tea\" is the milk tea shop, 722515");
ok(kindSource("en")("boba")[0]?.label === "Milk tea shop", "\"boba\" reads as a milk tea shop");
ok(kindSource("en", { naics: true })("coffee")[0]?.value === "722515 Snack and Nonalcoholic Beverage Bars", "a NAICS line takes the code and its title");
ok(kindSource("zh")("奶茶")[0]?.label === "奶茶店", "奶茶 finds 奶茶店");

// agencies by name or initials
ok(agencySource("en")("cdtfa").some(s => /Tax and Fee Administration/.test(s.label)), "CDTFA finds the Department of Tax and Fee Administration");

// fixed lists
ok(stateSource("en", { code: true })("cal")[0]?.value === "CA", "a state picker gives CA for \"cal\"");
ok(stateSource("en")("").length === 51, "the state picker lists 50 states and DC");
ok(entitySource("en")("llc")[0]?.value === "Limited liability company", "\"llc\" picks the limited liability company");
ok(fieldSource(SAMPLE, "Taxpayer type", "en", ["Sole Proprietor", "Limited Liability Company (LLC)"]).fixed === true, "a line with printed boxes is a fixed list of them");

// the workspace's own facts: never a masked or malformed value, never a made-up name
const legal = factSource(SAMPLE, "Legal name", "en")("");
ok(legal.some(s => /Moonleaf/.test(s.value)), "the legal name comes from the business facts");
ok(factSource(SAMPLE, "EIN", "en")("").every(s => /^\d{2}-\d{7}$/.test(s.value)), "an EIN fill is NN-NNNNNNN or nothing (the masked fact is left out)");
ok(factSource(SAMPLE, "Owner", "en", { kind: "person" })("").every(s => !/^You\b/.test(s.value)), "\"You, sole member\" is not offered as a person's name");
ok(factSource(SAMPLE, "Storefront", "en")("").some(s => /First St/.test(s.value)), "an address line offers the stores' addresses");

// match highlighting
const m = matchIn("San Jose, CA", "jo");
ok(!!m && m[0] === 4 && m[1] === 6, "the typed part is found mid-label at a word start");
ok(matchIn("Cancún, Mexico", "cancun")?.[0] === 0, "accents fold for the bold part");

// recent entries: kept per viewer, and still kept for the visit when storage throws
const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } } as Storage;
remember("t", "Fremont, CA"); remember("t", "San Jose, CA"); remember("t", "fremont, ca");
ok(recents("t").join("|") === "fremont, ca|San Jose, CA", "newest first, no repeats");
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } as unknown as Storage;
remember("u", "Austin, TX");
ok(recents("u")[0] === "Austin, TX", "storage that throws falls back to the tab's memory");

if (fails) { console.error(`\n${fails} failed`); process.exit(1); }
console.log("\nall suggestion checks pass");
