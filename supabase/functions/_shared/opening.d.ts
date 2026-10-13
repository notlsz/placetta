// Types for opening.js (bundled from src/smart.ts by scripts/build-agent.mjs). Kept by hand: what the monitor uses.
type Bi = { en: string; zh: string };
export type OpeningPath = {
  verdict: "on_track" | "tight" | "late" | "no_date" | "not_mapped" | "open";
  landing: string | null; slack: number | null;
  blocker?: { app: string; name: Bi; status: string; on: "you" | "odelia" | "team" | "agency" | "someone_else"; why: Bi };
  guessed: number;
  basis: { measured: number; published: number; guessed: number };
};
export declare function openingPath(s: Record<string, unknown>, w: Record<string, unknown>, today: string, ev?: { submitted?: Record<string, string>; stats?: { form: string; n: number; median_days: number; p90_days: number; rejected_pct: number }[] }): OpeningPath;
export declare function openingLine(p: OpeningPath): Bi | null;
export declare function normalizeState(name: string, s: Record<string, unknown>): Record<string, unknown> & { stores?: Record<string, unknown>[] };
