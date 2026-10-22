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
