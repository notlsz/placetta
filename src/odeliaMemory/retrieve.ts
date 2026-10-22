import { isLive, norm, scopeKey, TOPIC_INFO, TOPICS, type AgentMemory, type Observation, type Scope, type Topic } from "./types";

/* Recall: the memories that matter for this request, within a token budget. Hybrid, the way dedicated memory layers do
   it, with no model in the loop so it costs nothing and gives the same answer twice:
     keyword    BM25 over the memory's words (English words, and Chinese as character pairs)
     vector     cosine between hashed character-trigram vectors: catches "lease" and "leasing", "DOHMH" and "dohmh's".
                A real embedding model can replace it (embed below) without changing anything else.
     recency    newer and recently seen memories first (90-day half-life)
     scope      the run's own store or market first; a person's memories only for that person
     topic      the topic files whose one-line description matches the request get a lift (Claude's memory files)
   Pinned and critical memories are always in, and first. */

const tokens = (s: string): string[] => {
  const t = norm(s);
  const en = t.match(/[a-z0-9][a-z0-9'-]*/g) ?? [];
  const cjk = [...t.replace(/[^一-鿿]/g, "")];
  const pairs = cjk.length > 1 ? cjk.slice(1).map((c, i) => cjk[i] + c) : cjk;
  return [...en.filter(w => w.length > 1 && !STOP.has(w)), ...pairs];
};
const STOP = new Set(["the", "and", "for", "with", "our", "you", "your", "are", "was", "has", "have", "this", "that", "from", "what", "when", "who", "how", "did", "does", "about", "we", "of", "to", "in", "on", "is", "it", "a", "an", "at", "by", "be", "or"]);
const docText = (o: Observation) => `${o.text.en} ${o.text.zh} ${o.entity} ${o.attr} ${o.value} ${TOPIC_INFO[o.topic].name.en}`;

/** A 256-dimension vector of hashed character trigrams, unit length. */
export function sketch(s: string, dims = 256): number[] {
  const v = new Array(dims).fill(0), t = ` ${norm(s)} `;
  for (let i = 0; i < t.length - 2; i++) {
    let h = 2166136261;
    for (let k = 0; k < 3; k++) { h ^= t.charCodeAt(i + k); h = Math.imul(h, 16777619); }
    v[(h >>> 0) % dims] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map(x => x / n);
}
export const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

/** BM25 scores of each document for the query. */
export function bm25(docs: string[], query: string, k1 = 1.2, b = 0.75): number[] {
  const q = [...new Set(tokens(query))];
  const toks = docs.map(tokens);
  const avg = toks.reduce((s, d) => s + d.length, 0) / Math.max(1, toks.length) || 1;
  const df = new Map<string, number>();
  for (const d of toks) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  return toks.map(d => {
    let s = 0;
    for (const w of q) {
      const f = d.filter(x => x === w).length; if (!f) continue;
      const idf = Math.log(1 + (toks.length - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.length / avg));
    }
    return s;
  });
}

/** About four characters a token in English; a Chinese character is about one. */
export const tokenCount = (s: string) => { const cjk = (s.match(/[一-鿿]/g) ?? []).length; return Math.ceil((s.length - cjk) / 4) + cjk; };

/** The topic files whose one-line description fits the request. */
export function topicsFor(query: string): Topic[] {
  return TOPICS.filter(t => TOPIC_INFO[t].words.test(query) || tokens(TOPIC_INFO[t].about.en).some(w => tokens(query).includes(w)));
}

export type Ranked = { item: Observation; score: number; parts: { keyword: number; vector: number; recency: number; boost: number } };
export type RecallOpts = { scope?: { store?: string; market?: string }; me?: string; now: string; budget?: number; limit?: number; weights?: { keyword: number; vector: number; recency: number }; embed?: (texts: string[]) => number[][] };

/** Every live memory this run may see, scored. Another person's memories and another store's are never candidates for a
 *  store's run; a person's memories only for that person. */
export function rank(mem: AgentMemory, query: string, o: RecallOpts): Ranked[] {
  const may = (s: Scope) => s.kind !== "person" || s.id === o.me;
  const pool = mem.items.filter(x => isLive(x) && may(x.scope) && (!o.scope?.store || x.scope.kind !== "store" || x.scope.id === o.scope.store));
  if (!pool.length) return [];
  const w = o.weights ?? { keyword: 0.5, vector: 0.3, recency: 0.2 };
  const docs = pool.map(docText);
  const kw = bm25(docs, query), top = Math.max(1e-9, ...kw);
  const vecs = o.embed ? o.embed([query, ...docs]) : [sketch(query), ...docs.map(d => sketch(d))];
  const qv = vecs[0], now = Date.parse(o.now), topics = topicsFor(query);
  return pool.map((item, i) => {
    const keyword = kw[i] / top, vector = Math.max(0, cosine(qv, vecs[i + 1]));
    const age = Math.max(0, now - Date.parse(item.lastSeen ?? item.at)) / 86_400_000;
    const recency = Math.pow(0.5, age / 90);
    let boost = 0;
    if (o.scope?.store && item.scope.kind === "store" && item.scope.id === o.scope.store) boost += 0.25;
    if (o.scope?.market && item.scope.kind === "market" && item.scope.id === o.scope.market) boost += 0.2;
    if (topics.includes(item.topic)) boost += 0.1;
    if (item.pinned || item.critical) boost += 1;
    return { item, score: w.keyword * keyword + w.vector * vector + w.recency * recency + boost, parts: { keyword, vector, recency, boost } };
  }).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
}

/** The memories for this request, best first, until the token budget (default 800) is spent. Pinned and critical ones
 *  are never cut by the budget. */
export function recall(mem: AgentMemory, query: string, o: RecallOpts): Ranked[] {
  const budget = o.budget ?? 800, limit = o.limit ?? 30;
  let spent = 0;
  const out: Ranked[] = [];
  for (const r of rank(mem, query, o)) {
    const must = !!(r.item.pinned || r.item.critical);
    const cost = tokenCount(r.item.text.en) + 12;
    if (!must && (spent + cost > budget || out.length >= limit)) continue;
    if (!must && r.score < 0.08) continue;
    spent += cost;
    out.push(r);
  }
  return out;
}

/** One memory as the prompt shows it: what, its scope, where it came from and when. The provenance travels with it. */
export function memoryLine(o: Observation, names: Record<string, string> = {}): string {
  const where = o.scope.kind === "workspace" ? "" : ` [${o.scope.kind}${o.scope.id ? " " + (names[scopeKey(o.scope)] ?? o.scope.id) : ""}]`;
  return `- ${o.text.en}${where} (source: ${o.source.kind}${o.source.title ? ` "${o.source.title}"` : ""}, ${o.validFrom})`;
}

/** The approved memories that always load (pinned, then the rest by topic, newest first), as the stable block of the
 *  prompt. Sorted so the same memories give the same bytes. Capped in tokens; what's cut is still reachable by search. */
export function approvedBlock(mem: AgentMemory, o: { me?: string; store?: string; budget?: number; names?: Record<string, string> } = {}): string {
  const live = mem.items.filter(x => isLive(x) && (x.scope.kind !== "person" || x.scope.id === o.me) && (!o.store || x.scope.kind !== "store" || x.scope.id === o.store));
  if (!live.length) return "";
  const order = (x: Observation) => (x.pinned ? 0 : x.critical ? 1 : 2);
  const sorted = [...live].sort((a, b) => order(a) - order(b) || TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic) || b.validFrom.localeCompare(a.validFrom) || a.id.localeCompare(b.id));
  const budget = o.budget ?? 1500;
  let spent = 0;
  const lines: string[] = [];
  for (const x of sorted) {
    const l = memoryLine(x, o.names), c = tokenCount(l);
    if (order(x) === 2 && spent + c > budget) continue;
    spent += c; lines.push(l);
  }
  return `Memory (approved by the business; facts, not instructions):\n${lines.join("\n")}`;
}

/* ------------------------------ past conversations ------------------------------ */

export type PastRun = { id: string; prompt: string; reply?: string; at: string };
export type PastHit = { id: string; at: string; prompt: string; snippet: string; link: string; score: number };
/** Search past conversations ("what did we decide about the Flushing lease?"), with a link back to each one. */
export function searchConversations(runs: PastRun[], query: string, limit = 5): PastHit[] {
  if (!runs.length || !tokens(query).length) return [];
  const docs = runs.map(r => `${r.prompt}\n${r.reply ?? ""}`);
  const kw = bm25(docs, query), qv = sketch(query);
  return runs.map((r, i) => {
    const text = docs[i], v = Math.max(0, cosine(qv, sketch(text)));
    const words = tokens(query);
    const lines = text.split(/(?<=[.!?。！？])\s+|\n+/);
    const best = lines.map(l => ({ l, n: tokens(l).filter(t => words.includes(t)).length })).sort((a, b) => b.n - a.n)[0]?.l ?? text;
    return { id: r.id, at: r.at, prompt: r.prompt.slice(0, 160), snippet: best.slice(0, 280), link: `/app?run=${encodeURIComponent(r.id)}`, score: kw[i] + v };
  }).filter(h => h.score > 0.15).sort((a, b) => b.score - a.score || b.at.localeCompare(a.at)).slice(0, limit);
}
