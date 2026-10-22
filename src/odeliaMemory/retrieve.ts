import { isLive, norm, scopeKey, TOPIC_INFO, TOPICS, type AgentMemory, type Observation, type Scope, type Topic } from "./types";
import { B, type Bi } from "../bi";

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

/* ------------------------------ importance ------------------------------ */
// How much a memory matters on its own, 1 to 5, whatever the request: the "importance" of Generative Agents' memory
// stream (recency + importance + relevance), scored here from what the memory is instead of by a model, so it is free,
// the same every time and explainable. A license's expiry outranks a preference; the owner's word outranks a guess.

export type Importance = { score: number; why: Bi[] };
const CRITICAL_WHY: Record<NonNullable<Observation["critical"]>, Bi> = {
  entity: B("it's about the legal entity", "关于法律实体"), license: B("it's about a license", "关于执照"), expiry: B("it's an expiry date", "是到期日"),
  renewal: B("it's a renewal", "是续期事项"), approval: B("it's an approval", "是批准事项"), case: B("it's an open case", "是未结案件"), deadline: B("it's a deadline", "是截止日期"),
};
export function importance(o: Observation): Importance {
  const why: Bi[] = [];
  let s = o.topic === "rules" || o.topic === "decisions" ? 3 : o.topic === "preferences" || o.topic === "people" ? 2.5 : 2;
  if (o.topic === "rules") why.push(B("it's a house rule", "是公司规定"));
  if (o.topic === "decisions") why.push(B("it's a decision you made", "是您做出的决定"));
  if (o.critical) { s = Math.max(s, o.critical === "entity" ? 4 : 5); why.push(CRITICAL_WHY[o.critical]); }
  if (o.pinned) { s = 5; why.push(B("you pinned it", "您置顶了它")); }
  if (o.trust === "owner" || o.trust === "record") { s += 0.5; why.push(o.trust === "owner" ? B("your team said it", "由您的团队提供") : B("it's in your records", "来自您的记录")); }
  if (o.trust === "untrusted") s -= 0.5;
  if ((o.seen ?? 1) >= 3) { s += 0.5; why.push(B(`it came up ${o.seen} times`, `出现过 ${o.seen} 次`)); }
  return { score: Math.max(1, Math.min(5, Math.round(s))), why };
}

export type Ranked = { item: Observation; score: number; parts: { keyword: number; vector: number; recency: number; boost: number; importance?: number } };
export type RecallOpts = { scope?: { store?: string; market?: string }; me?: string; now: string; budget?: number; limit?: number; weights?: { keyword: number; vector: number; recency: number; importance?: number }; embed?: (texts: string[]) => number[][] };

/** Every live memory this run may see, scored. Another person's memories and another store's are never candidates for a
 *  store's run; a person's memories only for that person. */
export function rank(mem: AgentMemory, query: string, o: RecallOpts): Ranked[] {
  const may = (s: Scope) => s.kind !== "person" || s.id === o.me;
  const pool = mem.items.filter(x => isLive(x) && may(x.scope) && (!o.scope?.store || x.scope.kind !== "store" || x.scope.id === o.scope.store));
  if (!pool.length) return [];
  const w = o.weights ?? { keyword: 0.45, vector: 0.25, recency: 0.15, importance: 0.15 };
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
    const imp = (importance(item).score - 1) / 4;
    return { item, score: w.keyword * keyword + w.vector * vector + w.recency * recency + (w.importance ?? 0) * imp + boost, parts: { keyword, vector, recency, boost, importance: imp } };
  }).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
}

/* ------------------------------ why ------------------------------ */
// "Why Odelia remembered this", in plain words: ChatGPT shows the memories behind a reply as Sources under it; this
// says, for each one, what in the request it matched, where it applies, why it matters and where it came from.

/** The words of the request a memory shares (the BM25 tokens, at most three). */
export function sharedWords(query: string, o: Observation): string[] {
  const q = new Set(tokens(query)), d = new Set(tokens(docText(o)));
  return [...q].filter(w => d.has(w)).slice(0, 3);
}

/** Why this memory came up for this request, as one line in each language. */
export function explain(r: Ranked, query: string, o: { store?: string; names?: Record<string, string> } = {}): Bi {
  const it = r.item, en: string[] = [], zh: string[] = [];
  const words = sharedWords(query, it);
  if (words.length) { en.push(`Matches "${words.join('", "')}" in what you asked`); zh.push(`与您问的“${words.join("”“")}”相符`); }
  else if (r.parts.vector >= 0.35) { en.push("Close to what you asked"); zh.push("与您问的内容相近"); }
  if (o.store && it.scope.kind === "store" && it.scope.id === o.store) { const n = o.names?.[scopeKey(it.scope)] ?? it.scope.id; en.push(`About ${n}`); zh.push(`关于${n}`); }
  const imp = importance(it);
  if (imp.why.length) { en.push(`Matters because ${imp.why.map(x => x.en).join(" and ")}`); zh.push(`重要：${imp.why.map(x => x.zh).join("，")}`); }
  const src = SOURCE_WORDS[it.source.kind] ?? SOURCE_WORDS.chat;
  en.push(`From ${src.en}, ${it.validFrom.slice(0, 10)}`);
  zh.push(`${it.validFrom.slice(0, 10)}，来自${src.zh}`);
  return { en: `${en.join(". ")}.`, zh: `${zh.join("。")}。` };
}
const SOURCE_WORDS: Record<string, Bi> = {
  chat: B("a chat", "对话"), remote: B("a message outside the app", "应用外的消息"), filing: B("a filing", "申请"), document: B("a document", "文件"),
  email: B("an email", "邮件"), portal: B("an agency page", "机构网页"), upload: B("an upload", "上传的文件"), owner: B("your team", "您的团队"), record: B("your records", "您的记录"),
};

/** Why a memory is kept at all, for Settings: its importance and the reasons, in each language. */
export function whyKept(o: Observation): { score: number; text: Bi } {
  const imp = importance(o);
  const en = imp.why.length ? imp.why.map(x => x.en).join(", ") : "it came up in your work";
  const zh = imp.why.length ? imp.why.map(x => x.zh).join("，") : "在工作中提到过";
  return { score: imp.score, text: { en: `Kept because ${en}.`, zh: `保留原因：${zh}。` } };
}

/** The memories behind a reply, the ones that fit the request itself (not every always-loaded line), each with why:
 *  what a reply shows under it as "Memory used". At most five. */
export function usedFor(mem: AgentMemory, query: string, o: RecallOpts & { names?: Record<string, string> }): { id: string; text: Bi; why: Bi }[] {
  if (!query.trim()) return [];
  return recall(mem, query, { ...o, budget: 500 })
    .filter(r => sharedWords(query, r.item).length > 0 || r.parts.vector >= 0.35)
    .slice(0, 5)
    .map(r => ({ id: r.item.id, text: r.item.text, why: explain(r, query, { store: o.scope?.store, names: o.names }) }));
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
    const best = lines.map(l => ({ l, n: tokens(l).filter(t => words.includes(t)).length + cosine(qv, sketch(l)) })).sort((a, b) => b.n - a.n || b.l.length - a.l.length)[0]?.l ?? text;
    return { id: r.id, at: r.at, prompt: r.prompt.slice(0, 160), snippet: best.slice(0, 280), link: `/app/?run=${encodeURIComponent(r.id)}`, score: kw[i] + v };
  }).filter(h => h.score > 0.15).sort((a, b) => b.score - a.score || b.at.localeCompare(a.at)).slice(0, limit);
}
