import type { AgentMemory, Observation } from "./types";

/* Everything Odelia remembers, as one file the owner keeps (Settings, Agent memory, Download). Grok's memory can't be
   seen or taken out; this is every fact, suggestion, past version and brief, with where it came from and when, and which
   fact replaced which, so the file reads the same way the screen does. Nothing is left out by status: a rejected
   suggestion and a superseded fact are part of what was remembered. Pure. */

export type MemoryExport = {
  exported: string;
  workspace: string;
  settings: AgentMemory["settings"];
  counts: { current: number; suggested: number; past: number; rejected: number };
  memories: (Pick<Observation, "id" | "status" | "text" | "topic" | "scope" | "source" | "validFrom"> & { validTo?: string; replaces?: string; replacedBy?: string; record?: Observation["record"] })[];
  briefs: AgentMemory["briefs"];
  conflicts: AgentMemory["conflicts"];
};

export function memoryExport(m: AgentMemory, workspace: string, now: string): MemoryExport {
  const items = m.items ?? [];
  const n = (f: (o: Observation) => boolean) => items.filter(f).length;
  return {
    exported: now, workspace, settings: m.settings,
    counts: { current: n(o => o.status === "approved" && !o.validTo), suggested: n(o => o.status === "suggested"), past: n(o => o.status === "superseded" || o.status === "expired" || (o.status === "approved" && !!o.validTo)), rejected: n(o => o.status === "rejected") },
    memories: items.map(o => ({ id: o.id, status: o.status, text: o.text, topic: o.topic, scope: o.scope, source: o.source, validFrom: o.validFrom,
      ...(o.validTo ? { validTo: o.validTo } : {}), ...(o.supersedes ? { replaces: o.supersedes } : {}), ...(o.supersededBy ? { replacedBy: o.supersededBy } : {}), ...(o.record ? { record: o.record } : {}) })),
    briefs: m.briefs ?? [], conflicts: m.conflicts ?? [],
  };
}

export const memoryFileName = (now: string) => `odelia-memory-${now.slice(0, 10)}.json`;
