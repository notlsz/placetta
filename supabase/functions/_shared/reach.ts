// How each person asked to be reached, from what they told Odelia once ("text me, don't email"). The app keeps it in
// their memory (src/recall.ts, workspace state memories[user id].items); the server reads it from the saved state when
// it tells an owner about finished work (agent-run) or the morning's updates (monitor). Only details the person saved
// count: a suggestion from a text or an email that nobody confirmed in the app never changes how anyone is reached.
// No imports, so the app, agent.js and every function can use it.

export type ReachBy = "text" | "email" | "call";
export type Reach = { prefer?: ReachBy; avoid: ReachBy[] };

const BY: ReachBy[] = ["text", "email", "call"];

/** The person's standing preference: the newest saved one wins for each channel. */
export function reachOf(state: unknown, uid: string | null | undefined): Reach {
  if (!uid) return { avoid: [] };
  const books = ((state ?? {}) as { memories?: Record<string, { items?: unknown[] }> }).memories ?? {};
  const items = (Array.isArray(books[uid]?.items) ? books[uid]!.items! : []) as { kind?: string; status?: string; reach?: string; avoid?: unknown; at?: string }[];
  const prefs = items.filter((i) => i && i.kind === "preference" && i.status === "saved").sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));
  let prefer: ReachBy | undefined;
  const avoid = new Set<ReachBy>();
  for (const p of prefs) {
    const r = BY.includes(p.reach as ReachBy) ? p.reach as ReachBy : undefined;
    if (r) { prefer = r; avoid.delete(r); }
    for (const a of Array.isArray(p.avoid) ? p.avoid : []) if (BY.includes(a as ReachBy) && a !== r) { avoid.add(a as ReachBy); if (prefer === a) prefer = undefined; }
  }
  return { ...(prefer ? { prefer } : {}), avoid: [...avoid] };
}

/** Whether to email this person about something: not when they said not to. */
export const mayEmail = (state: unknown, uid: string | null | undefined) => !reachOf(state, uid).avoid.includes("email");
/** Whether they asked for texts. */
export const wantsTexts = (state: unknown, uid: string | null | undefined) => reachOf(state, uid).prefer === "text";
