// Types for start.js (bundled from src/server/start-entry.ts by scripts/build-agent.mjs). Kept by hand: what odelia-sms,
// chat-events and the tests use.
type Bi = { en: string; zh: string };
export type StartLine = { what: string; where: string; city: string; state: string; whereZh?: string; sell: string; open: boolean; lang: "en" | "zh" };
export type StartStep = { name: Bi; short: Bi; agency: Bi; fee: number | null; currency: string };
export type StartFacts = { permits: number; first: StartStep[]; days: number | null; open: boolean };
export type PlanForText = { line: StartLine; name: string; state: Record<string, unknown>; facts: StartFacts };
export declare function readStart(text: string): StartLine | null;
export declare function readPart(text: string): { what?: string; where?: string };
export declare function planForText(text: string, now?: Date): PlanForText | null;
