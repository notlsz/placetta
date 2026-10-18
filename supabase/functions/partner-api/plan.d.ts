// Types for plan.js (bundled from src/plan/preview.ts by scripts/build-agent.mjs). Kept by hand: what partner-api uses.
type Bi = { en: string; zh: string };
export type PreviewApp = { id: string; name: Bi; agency: Bi; level: "federal" | "state" | "county" | "city"; fees: { label: Bi; amount: number; tbd?: boolean }[]; est?: Bi; source: { label: string; url: string } };
export declare function previewPlan(what: string, where: string, opening?: string, o?: { entity?: string; buildout?: boolean; today?: string }): { apps: PreviewApp[]; fees: number; varies: number };
export declare function stateOf(where: string): string | undefined;
