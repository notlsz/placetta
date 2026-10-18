// Passage-level proof for the library's forms: for each, a sentence of under 25 words from the official page that states
// the requirement, the day it was read and the URL that was fetched to read it (`read`; `link` when the page shown as the
// source should change to the page the sentence is on). Entries are written by reading the page, never from memory;
// scripts/eval/proof-log.json records each fetch and scripts/eval/proof.ts checks every plan row against it.
// Forms added in src/forms/beachhead.ts carry their proof inline.
export type Proof = { quote: string; checked: string; read: string; link?: string };

export const PROOF: Record<string, Proof> = {};
