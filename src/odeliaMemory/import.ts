// Bring memory over from another assistant, copied from Claude's memory import and ChatGPT's "Manage memories" list:
// the person pastes what ChatGPT or Claude remembers about them (the list as copied, a JSON export, or plain lines) and
// each line becomes a suggestion that only they see and approve, one by one. Nothing pasted is ever an instruction:
// every line goes through the same filter as anything else from outside the app (privacy.ts: no secrets, ID numbers,
// credentials, sensitive topics or instructions), lines about other things are kept as written, and duplicates go.
// Pure, used by Settings, Agent memory and its test (scripts/memory-test.ts); the database function agent_memory_import
// takes only the lines this kept, and checks them again (memory_text_ok, person scope, suggestions only).
import { B } from "../bi";
import { blocked, type Blocked } from "./privacy";
import { topicFor } from "./observe";
import { observation } from "./update";
import type { Observation } from "./types";

export const IMPORT_MAX = 50;
export type Dropped = { text: string; why: Blocked | "short" | "long" | "duplicate" | "over" };

/** The lines in what was pasted: JSON (an array of strings or of objects with content, memory, text or value), or text
 *  with one memory a line, bullets and numbering taken off. */
export function importLines(raw: string): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  if (/^[[{]/.test(s)) {
    try {
      const j = JSON.parse(s);
      const list: unknown[] = Array.isArray(j) ? j : Array.isArray(j?.memories) ? j.memories : Array.isArray(j?.items) ? j.items : [];
      const out = list.map(x => (typeof x === "string" ? x : x && typeof x === "object" ? ["content", "memory", "text", "value"].map(k => (x as Record<string, unknown>)[k]).find(v => typeof v === "string") : undefined))
        .filter((x): x is string => typeof x === "string");
      if (out.length) return out.map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    } catch { /* not JSON after all: read it as lines */ }
  }
  return s.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•·]|\d+[.)]|\[\d+\])\s*/, "").replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** What the paste becomes: suggestions scoped to the person importing (only they see them), and what was left out, why. */
export function importMemories(raw: string, o: { at: string; by: string; allowLast4?: boolean; existing?: Observation[] }): { items: Observation[]; dropped: Dropped[] } {
  const items: Observation[] = [], dropped: Dropped[] = [];
  const seen = new Set((o.existing ?? []).map(x => x.text.en.toLowerCase()));
  for (const line of importLines(raw)) {
    if (line.length < 8) { dropped.push({ text: line, why: "short" }); continue; }
    if (line.length > 300) { dropped.push({ text: line.slice(0, 80), why: "long" }); continue; }
    const why = blocked(line, { untrusted: true, allowLast4: o.allowLast4 });
    if (why) { dropped.push({ text: why === "secret" || why === "credential" || why === "id_number" ? "" : line, why }); continue; }
    if (seen.has(line.toLowerCase())) { dropped.push({ text: line, why: "duplicate" }); continue; }
    if (items.length >= IMPORT_MAX) { dropped.push({ text: line, why: "over" }); continue; }
    seen.add(line.toLowerCase());
    const it = observation({ scope: { kind: "person", id: o.by }, topic: topicFor(line), entity: line.split(/\s+/).slice(0, 4).join(" ").slice(0, 120), attr: "imported", value: line, text: B(line, line),
      source: { kind: "upload", ref: `import:${o.at.slice(0, 10)}`, title: "Imported from another assistant", quote: line }, trust: "untrusted" }, o.at);
    it.status = "suggested";
    items.push(it);
  }
  return { items, dropped };
}
