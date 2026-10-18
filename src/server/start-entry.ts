// Text to start, for the server: reading a first text from someone new and building the plan they get back, with the
// same code the app's first screen uses. Built by `npm run build:agent` into supabase/functions/_shared/start.js (its
// types are kept by hand in start.d.ts). No model is called anywhere in it.
import { stripState } from "../core";
import { readPart, readStart, type StartLine } from "../plan/line";
import { firstWorkspace, startFacts, type StartFacts } from "../plan/start";

export { readPart, readStart };

/** The plan for a first text: the workspace to keep until it's claimed (name and saved state), and what the reply says
 *  about it. null when the line doesn't say what and where. */
export function planForText(text: string, now = new Date()): { line: StartLine; name: string; state: Record<string, unknown>; facts: StartFacts } | null {
  const line = readStart(text);
  if (!line) return null;
  const f = firstWorkspace({ what: line.what, city: line.city, state: line.state, lang: line.lang, months: line.open ? 0 : null, now });
  return { line, name: f.name, state: stripState(f.state) as Record<string, unknown>, facts: startFacts(f, now) };
}
