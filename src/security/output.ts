import { agencyHostOk, hostOf, placettaHost } from "./registry";

/* ------------------------------------------------------------------ *
 * What a model writes, made safe to show and send. A reply can carry
 * data out without any tool: an image whose address holds the EIN loads
 * the moment it's shown, a link does the moment it's tapped. So before a
 * reply reaches the person (the app, a text, an email, a chat):
 *
 *   images     every markdown or HTML image is removed, whatever its host
 *              (the app shows none from a reply; the CSP blocks them too)
 *   links      a link to a host that isn't official (an agency's, the
 *              registry's) or Placetta's own loses its address and keeps
 *              its words; javascript:, data:, file: and vbscript: links go
 *   bare URLs  the same rule, so a pasted address can't carry data either
 *   html       tags go
 *
 * Deterministic: the same text always comes out the same.
 * ------------------------------------------------------------------ */

export type Sanitized = { text: string; removed: string[] };

/** Allowed in a reply: an agency's or the registry's host, or Placetta's. extra: more hosts (the app's own origin). */
export const replyHostOk = (h: string, extra: string[] = []) => !!h && (agencyHostOk(h) || placettaHost(h) || extra.some(e => h === e || h.endsWith("." + e)));
const BAD_SCHEME = /^\s*(javascript|data|vbscript|file|blob|about|chrome|ftp):/i;
/** An address that carries data in it: a long query, or one with a value that looks encoded. */
export const carriesData = (url: string) => { try { const u = new URL(url); const q = u.search + u.hash; return q.length > 120 || /[?&#][^=&]*=([A-Za-z0-9+/_-]{24,}|[^&]*%[0-9a-f]{2}[^&]*%[0-9a-f]{2})/i.test(q) || /[?&](data|q|payload|secret|token|key|ein|ssn|pw|pass|password|d|x|exfil|leak)=/i.test(q); } catch { return true; } };

export function sanitizeOutput(text: string, o: { hosts?: string[] } = {}): Sanitized {
  const removed: string[] = [];
  const ok = (url: string) => { if (BAD_SCHEME.test(url)) return false; const h = hostOf(url); return replyHostOk(h, o.hosts) && !(carriesData(url) && !agencyHostOk(h)); };
  let t = String(text ?? "");
  // HTML images and every other tag
  t = t.replace(/<img\b[^>]*>/gi, m => { removed.push(m.slice(0, 120)); return ""; });
  t = t.replace(/<a\b[^>]*href\s*=\s*["']?([^"' >]+)[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, words: string) => { if (ok(href)) return `[${words}](${href})`; removed.push(href); return words; });
  t = t.replace(/<\/?(script|iframe|object|embed|form|input|style|link|meta|svg|video|audio|source|base)\b[^>]*>/gi, m => { removed.push(m.slice(0, 80)); return ""; });
  // markdown images, inline and by reference: always out
  t = t.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/g, (_m, _alt: string, url: string) => { removed.push(url); return ""; });
  t = t.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, m => { removed.push(m); return ""; });
  // reference definitions: "[1]: https://..." keep only allowed ones
  t = t.replace(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(\s+"[^"]*")?\s*$/gm, (m, url: string) => { if (ok(url)) return m; removed.push(url); return ""; });
  // markdown links
  t = t.replace(/\[([^\]]+)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/g, (m, words: string, url: string) => { if (ok(url)) return m; removed.push(url); return words; });
  // autolinks and bare addresses
  t = t.replace(/<((?:https?|javascript|data|file|vbscript):[^>\s]+)>/gi, (_m, url: string) => { if (ok(url)) return url; removed.push(url); return "[link removed]"; });
  t = t.replace(/\b(?:javascript|vbscript|data|file):[^\s)\]]+/gi, m => { removed.push(m); return "[link removed]"; });
  t = t.replace(/(^|[\s(（"'])((?:https?:\/\/|www\.)[^\s<>"')\]）]+)/gi, (m, pre: string, url: string) => {
    const tail = /[.,;:!?]+$/.exec(url)?.[0] ?? "", u = tail ? url.slice(0, -tail.length) : url;
    if (ok(/^www\./i.test(u) ? "https://" + u : u)) return m;
    removed.push(u); return `${pre}[link removed]${tail}`;
  });
  return { text: removed.length ? t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim() : t, removed };
}

/* ------------------------------------------------------------------ *
 * Odelia's instructions never leave in a reply. Her prompt tells her not
 * to recite them, but a prompt injection can talk a model into it, so this
 * checks on the server, after the model, before anything is shown or sent:
 * a reply that reproduces runs of the actual instructions (8 words in a
 * row, at least LEAK_RUNS times) is replaced by a one-line refusal. Lines
 * she's meant to repeat (prices, the workspace's own data) don't count.
 * ------------------------------------------------------------------ */
const LEAK_WORDS = 8, LEAK_RUNS = 4;
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}$%]+/gu, " ").trim().split(/\s+/).filter(Boolean);
const shingles = (w: string[]) => { const out = new Set<string>(); for (let i = 0; i + LEAK_WORDS <= w.length; i++) out.add(w.slice(i, i + LEAK_WORDS).join(" ")); return out; };
/** The part of the instructions that is secret: everything before the workspace's own data, minus the price lines
 *  and the style guide's sample replies (she's meant to say those). */
export function secretPart(instructions: string): string {
  const cut = instructions.search(/\n(Workspace|工作区)\s*:/);
  return (cut >= 0 ? instructions.slice(0, cut) : instructions).split("\n").filter(l => !/\$\d/.test(l) && !/^\s*-?\s*Example\b/i.test(l)).join("\n");
}
const cache = new Map<string, Set<string>>();
/** How many 8-word runs of the instructions the reply reproduces. */
export function leakedRuns(reply: string, instructions: string): number {
  const key = instructions.length + ":" + instructions.slice(0, 200);
  let src = cache.get(key);
  if (!src) { src = shingles(words(secretPart(instructions))); if (cache.size > 20) cache.clear(); cache.set(key, src); }
  let n = 0;
  for (const s of shingles(words(reply))) if (src.has(s) && ++n >= LEAK_RUNS) break;
  return n;
}
export const LEAK_REPLY = {
  en: "I only handle compliance work for this business, so I can't share how I'm set up. What do you need filed or checked?",
  zh: "我只负责这家企业的合规事务，无法透露我的设置。需要我办理或核对什么？",
};
/** The reply, or the refusal when it reproduces the instructions. */
export function withoutInstructions(reply: string, instructions: string, lang: "en" | "zh" = "en"): { text: string; leaked: boolean } {
  if (!instructions || !reply) return { text: reply, leaked: false };
  return leakedRuns(reply, instructions) >= LEAK_RUNS ? { text: LEAK_REPLY[lang], leaked: true } : { text: reply, leaked: false };
}
