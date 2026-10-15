import { placesOf } from "../forms/registry";
import { INSPECTIONS } from "./index";
import type { Inspection, LocalInspections } from "./types";

/** Every inspection a store's address faces: the city's (building, fire) and the county's (health) together, named
    after the most local place the guides cover. A San José store gets the City of San José's and Santa Clara County's. */
export function inspectionsFor(address: string): LocalInspections | undefined {
  const codes = placesOf(address).filter(c => INSPECTIONS[c]);
  if (!codes.length) return undefined;
  if (codes.length === 1) return INSPECTIONS[codes[0]];
  const city = INSPECTIONS[codes.find(c => c !== "SCC" && c !== "LAC") ?? codes[codes.length - 1]];
  const seen = new Set<string>(), inspections: Inspection[] = [];
  for (const c of codes) for (const ins of INSPECTIONS[c].inspections) {
    const id = seen.has(ins.id) ? `${c.toLowerCase()}-${ins.id}` : ins.id;
    seen.add(id); inspections.push({ ...ins, id });
  }
  // before opening first, in the order an opening runs (building, fire, health), then the routine ones
  const order = { building: 0, planning: 1, fire: 2, health: 3, other: 4 } as const;
  inspections.sort((a, b) => (a.stage === b.stage ? order[a.kind] - order[b.kind] : a.stage === "opening" ? -1 : 1));
  return { ...city, inspections, read: codes.map(c => INSPECTIONS[c].read).sort()[0] };
}
