import type { ChatLine, MemoryBook, MemoryFile, MemoryKind, MemorySettings } from "./model";

/* Memory, the way Claude does it: a few small files about you (Profile, Preferences), the topics you care about and
   the areas you're working on, one fact per line. The agent reads them when a reply needs them, adds what you tell it
   when "Generate memory" is on, and can search past chats when "Search past chats" is on. You can see, edit, delete
   and import all of it in Settings, Memory. */

export const DEFAULT_SETTINGS: MemorySettings = { searchChats: true, generate: true, sensitive: false };
export const emptyBook = (): MemoryBook => ({ settings: { ...DEFAULT_SETTINGS }, files: [] });
const now = () => new Date().toISOString();
export const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "note";

/** Health, beliefs, politics, money and the like: kept only when "Include sensitive topics" is on. */
export const SENSITIVE = /\b(health|diagnos|illness|disease|medication|therapy|pregnan|religio|church|mosque|temple|faith|politic|vote|party member|union|salary|income|debt|credit score|sexual|orientation|gender identity|disab|immigration|visa status|criminal|arrest)\w*/i;

const base = (kind: MemoryKind, name: string, summary: string): MemoryFile => ({ id: kind === "you" ? slugOf(name) : `${kind}-${slugOf(name)}`, kind, name, summary, lines: [], updated: now() });
export const PROFILE = () => base("you", "Profile", "Who you are: name, role, company and where you work");
export const PREFS = () => base("you", "Preferences", "How you want Placetta to work: language, tone, format, approvals");

/** Add a fact to a file (made if it doesn't exist). Returns the new book, or null when the setting keeps it out. */
export function remember(book: MemoryBook, o: { kind: MemoryKind; file: string; summary?: string; fact: string; sensitive?: boolean }): MemoryBook | null {
  const fact = o.fact.trim().slice(0, 400);
  if (!fact) return book;
  const sensitive = !!o.sensitive || SENSITIVE.test(fact);
  if (sensitive && !book.settings.sensitive) return null;
  const id = o.kind === "you" ? slugOf(o.file) : `${o.kind}-${slugOf(o.file)}`;
  const files = [...book.files];
  let f = files.find(x => x.id === id);
  if (!f) { f = o.kind === "you" && /pref/i.test(o.file) ? PREFS() : o.kind === "you" ? PROFILE() : base(o.kind, o.file.trim().slice(0, 60), (o.summary ?? o.file).slice(0, 160)); f = { ...f, id }; files.push(f); }
  const i = files.indexOf(f);
  if (f.lines.some(l => l.toLowerCase() === fact.toLowerCase())) return book;
  files[i] = { ...f, lines: [...f.lines, fact].slice(-60), updated: now(), summary: o.summary && !f.lines.length ? o.summary.slice(0, 160) : f.summary, sensitive: f.sensitive || sensitive };
  return { ...book, files };
}

/** Words that match, best first. */
export function searchMemory(book: MemoryBook, q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  return book.files.flatMap(f => f.lines.map(l => ({ file: f.name, kind: f.kind, line: l, score: words.filter(w => (f.name + " " + l).toLowerCase().includes(w)).length })))
    .filter(x => !words.length || x.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);
}
export function searchChats(lines: ChatLine[], q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return lines.map((l, i) => ({ ...l, i, score: words.filter(w => l.text.toLowerCase().includes(w)).length }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score || b.i - a.i).slice(0, 8)
    .map(x => ({ at: x.at.slice(0, 10), role: x.role, text: x.text.slice(0, 500) }));
}

/** What the agent sees each turn: the files' names and lines, short. */
export function memoryBrief(book: MemoryBook | undefined) {
  if (!book || !book.files.length) return undefined;
  return book.files.map(f => `${f.kind === "you" ? "" : f.kind === "topic" ? "Topic: " : "Area: "}${f.name}\n${f.lines.slice(-12).map(l => "- " + l).join("\n")}`).join("\n\n").slice(0, 4000);
}

/** The prompt to paste into another AI assistant, in Placetta's own words. */
export const IMPORT_PROMPT = `I'm moving to a new assistant and want to bring what you know about me. Please list everything you've saved or learned about me from our past conversations. Keep my own wording wherever you can, especially for rules I gave you.

Group it under these headings, in this order:

1. Rules: how I've told you to work with me (tone, format, language, things to always or never do).
2. About me: name, location, languages, background and interests.
3. Work: my roles, companies, and what I'm good at.
4. Projects: each project I've built or committed to, one line each, starting with its name, with what it does and where it stands.
5. Likes: tastes and working preferences that apply across topics.

Write one item per line as:
[YYYY-MM-DD] - the item
Use [unknown] when you don't know the date.

Put the whole list in one code block so I can copy it, then tell me whether that's everything or there's more.`;

/** Turn a pasted export into memory: headings pick the file, each "[date] - item" line is a fact. */
export function importMemory(book: MemoryBook, text: string): { book: MemoryBook; added: number; skipped: number } {
  let b = book, added = 0, skipped = 0;
  let target: { kind: MemoryKind; file: string } = { kind: "you", file: "Profile" };
  for (const raw of text.replace(/```[a-z]*\n?/gi, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const head = line.replace(/^#+\s*|\*\*/g, "").replace(/^\d+\.\s*/, "").replace(/:$/, "").trim();
    if (/^(rules|instructions)\b/i.test(head) && line.length < 60) { target = { kind: "you", file: "Preferences" }; continue; }
    if (/^(about me|identity)\b/i.test(head) && line.length < 60) { target = { kind: "you", file: "Profile" }; continue; }
    if (/^(work|career)\b/i.test(head) && line.length < 60) { target = { kind: "you", file: "Profile" }; continue; }
    if (/^(projects?)\b/i.test(head) && line.length < 60) { target = { kind: "area", file: "Projects" }; continue; }
    if (/^(likes|preferences)\b/i.test(head) && line.length < 60) { target = { kind: "you", file: "Preferences" }; continue; }
    const m = line.match(/^[-*•]?\s*\[([^\]]+)\]\s*[-–:]\s*(.+)$/) ?? line.match(/^[-*•]\s+(.+)$/)?.slice(0).concat() as RegExpMatchArray | null;
    const fact = m ? (m.length > 2 ? m[2] : m[1]) : null;
    if (!fact) continue;
    let t = target;
    if (target.kind === "area") { const name = fact.split(/[:,–-]/)[0].trim().slice(0, 40); t = name.length > 1 ? { kind: "area", file: name } : target; }
    const next = remember(b, { kind: t.kind, file: t.file, fact, summary: t.kind === "area" ? fact.slice(0, 140) : undefined });
    if (next) { if (next !== b) added++; b = next; } else skipped++;
  }
  return { book: b, added, skipped };
}
