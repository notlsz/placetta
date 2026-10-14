import type { Bi } from "../bi.ts";

/* Which address an address question on an official form must hold, each rule confirmed by at least three official
   sources (the form or its instructions, the agency's own page or FAQ, and the statute or regulation behind it).
   Placetta fills these with the company's own address in the country it is applying in, and when the company has none,
   explains what the agency accepts and how to get one. Data: ./address-rules/<form id>.json. */

export type AddressRule =
  | "in_state_street"   // a physical street address in the state (registered agent / registered office, statutory agent)
  | "local_premises"    // the store's own street address (the premises being permitted)
  | "us_street"         // a physical US street address (not a P.O. box), any state
  | "us_any"            // any US address, P.O. box allowed
  | "foreign_ok"        // a non-US address is accepted
  | "unconfirmed";      // fewer than three sources agreed: Placetta treats it as a US address and asks the agency

export type Confirmation = { url: string; quote: string; kind: "form" | "instructions" | "agency_page" | "statute" | "regulation" | "faq" };

export type FieldRule = {
  rule: AddressRule;
  poBox: "allowed" | "not_allowed" | "unknown";
  what: Bi;           // what the agency accepts, in one or two plain sentences
  ifNone: Bi;         // what to do when the company has no such address yet (e.g. hire a registered agent in the state)
  confirmations: Confirmation[];
};

export type FormAddressRules = { form: string; read: string; fields: Record<string, FieldRule>; notes?: string };
