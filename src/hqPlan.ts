/* The brand plan: a headquarters rolls Placetta out to every franchise location, the Toast and Gusto pattern where the
   price grows with locations and people. Each new location joins with one invite (hq_invite_create, then
   hq_invite_redeem by the franchisee's owner), and headquarters chooses who pays:
     franchisee  each franchisee pays for its own stores at the published per-location price; headquarters pays
                 nothing extra to see them all (as the landing page says)
     hq          headquarters pays for every location that joined: the per-location price, plus each person on the
                 franchisees' teams past the included number (FOUNDER TO CONFIRM), with the published "from $25,000 a
                 year" as the floor
   Headquarters' own people who only look at the dashboard are never counted. No imports but the price list, so the
   billing function (Deno) prices it with the same code. */
import { PROPOSED, PUBLISHED } from "./pricing.ts";

type Bi = { en: string; zh: string };
const B = (en: string, zh: string): Bi => ({ en, zh });

export type BillTo = "hq" | "franchisee";
export type HqPlanIn = { billTo: BillTo; tier: "essentials" | "pro"; locations: number; people: number };
export type HqQuote = {
  billTo: BillTo; locations: number; people: number; includedPeople: number; extraPeople: number;
  locationsUsd: number; peopleUsd: number; floorUsd: number; topUpUsd: number; yearUsd: number; lines: Bi[];
};

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** What the brand plan costs headquarters a year, line by line. Billed to franchisees, headquarters owes nothing. */
export function hqQuote(x: HqPlanIn): HqQuote {
  const locations = Math.max(0, Math.floor(x.locations)), people = Math.max(0, Math.floor(x.people));
  const includedPeople = locations * PROPOSED.includedPeoplePerLocation, extraPeople = Math.max(0, people - includedPeople);
  const per = (x.tier === "pro" ? PUBLISHED.proMonth : PUBLISHED.essentialsMonth) * 12;
  if (x.billTo === "franchisee") {
    return { billTo: x.billTo, locations, people, includedPeople, extraPeople, locationsUsd: 0, peopleUsd: 0, floorUsd: 0, topUpUsd: 0, yearUsd: 0,
      lines: [B(`Each franchisee pays for its own stores at ${money(per / 12)} a location a month, billed yearly. Headquarters pays nothing to see them all.`, `每位加盟商按每店每月 ${money(per / 12)}（按年计费）为自己的门店付费。总部查看所有门店无需付费。`)] };
  }
  const locationsUsd = locations * per, peopleUsd = extraPeople * PROPOSED.personYearUsd;
  const floorUsd = PUBLISHED.hqFromYear, sum = locationsUsd + peopleUsd, topUpUsd = locations > 0 ? Math.max(0, floorUsd - sum) : 0;
  const lines = [
    B(`${locations} location${locations === 1 ? "" : "s"} × ${money(per)} a year = ${money(locationsUsd)}`, `${locations} 家门店 × 每年 ${money(per)} = ${money(locationsUsd)}`),
    B(`${people} ${people === 1 ? "person" : "people"} on franchisee teams, ${includedPeople} included (${PROPOSED.includedPeoplePerLocation} a location)${extraPeople ? `, ${extraPeople} more × ${money(PROPOSED.personYearUsd)} a year = ${money(peopleUsd)}` : ""}`,
      `加盟商团队共 ${people} 人，含 ${includedPeople} 人（每店 ${PROPOSED.includedPeoplePerLocation} 人）${extraPeople ? `，另外 ${extraPeople} 人 × 每年 ${money(PROPOSED.personYearUsd)} = ${money(peopleUsd)}` : ""}`),
    ...(topUpUsd ? [B(`Headquarters plans start at ${money(floorUsd)} a year: ${money(topUpUsd)} brings it to that`, `总部方案每年 ${money(floorUsd)} 起：补足 ${money(topUpUsd)}`)] : []),
  ];
  return { billTo: x.billTo, locations, people, includedPeople, extraPeople, locationsUsd, peopleUsd, floorUsd, topUpUsd, yearUsd: sum + topUpUsd, lines };
}

/** An invite code as the franchisee types or pastes it: letters and digits only, 16 to 64 of them. */
export function cleanCode(s: unknown): string | null {
  const c = String(s ?? "").trim().replace(/^.*[?&#]hq=/, "").replace(/[^A-Za-z0-9]/g, "");
  return c.length >= 16 && c.length <= 64 ? c : null;
}

/** The link a new location opens to join. */
export const inviteLink = (origin: string, code: string) => `${origin.replace(/\/+$/, "")}/app/?hq=${encodeURIComponent(code)}`;
