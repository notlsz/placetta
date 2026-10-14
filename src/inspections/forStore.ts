import { placesOf } from "../forms/registry";
import { INSPECTIONS } from "./index";
import type { LocalInspections } from "./types";

/** The inspection guide for a store's city: the most local place code the guides cover (a city before its state). */
export function inspectionsFor(address: string): LocalInspections | undefined {
  const codes = placesOf(address);
  for (const c of [...codes].reverse()) if (INSPECTIONS[c]) return INSPECTIONS[c];
  return undefined;
}
