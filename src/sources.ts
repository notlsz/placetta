import type { Lang } from "./i18n";
import type { Workspace } from "./model";
import { formById, type OfficialForm } from "./forms/registry";
import { proofCurrent } from "./plan/ask";

/* ------------------------------------------------------------------ *
 * Where an answer came from. Perplexity, Grok and the legal tools cite
 * inconsistently or invent sources; Odelia's replies name only what her
 * tools actually read in that run: the registry forms she looked up,
 * the agency pages fetched or cited by the search service, and the
 * documents and emails she opened. Nothing here is taken from the
 * model's own words. A reply that states a rule, fee, deadline or
 * requirement ends with a "Sources:" line; when it states one and no
 * tool read anything, it says plainly that it wasn't checked.
 * ------------------------------------------------------------------ */

/** One thing a tool read in this run. keys: words a reply would use to talk about it (a form's number, title, agency). */
export type Used = { kind: "form" | "page" | "doc"; label: string; url?: string; keys?: string[]; form?: string };

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const official = (url: string) => /\.(gov|mil)$/.test(host(url)) || /\.[a-z]{2}\.us$/.test(host(url)) || /^(sccgov\.org|acgov\.org|sfgov\.org|nyc\.gov|santaclaracounty\.gov|ochealthinfo\.com|houstonpermittingcenter\.org|houstonhealth\.org|cityofirvine\.gov|sanjoseca\.gov)$/.test(host(url));
const isUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\/[^\s]+$/i.test(v) && !!host(v);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown, n = 160) => (typeof v === "string" ? v.trim().slice(0, n) : "");

const fromForm = (f: OfficialForm): Used => ({ kind: "form", label: f.form.split(" (")[0], url: f.info || f.url, keys: [f.form.split(" (")[0], f.title.en, f.title.zh, f.agency.en, f.agency.zh, f.id], form: f.id });
const page = (url: string, title?: string): Used => ({ kind: "page", label: host(url), url, keys: title ? [title] : [] });

/** What one tool call read, from its name, its input and what it returned (the same object the model saw). Tools that
 *  only change the workspace (fill, deadlines, drafts) read nothing and add nothing. */
export function usedBy(tool: string, input: Record<string, unknown>, out: unknown, w?: Workspace): Used[] {
  const o = obj(typeof out === "string" ? safeJson(out) : out);
  const formOf = (id: unknown) => { const f = typeof id === "string" ? formById(id) : undefined; return f ? [fromForm(f)] : []; };
  const appForm = (id: unknown) => formOf(w?.apps.find(a => a.id === s(id, 80))?.official);
  switch (tool) {
    case "find_official_forms":
      return list(o.forms).flatMap(x => formOf(obj(x).official_form_id));
    case "plan_markets": {
      // each step is a line that starts with its registry id
      const lines = [...list(o.shared_once), ...list(o.markets).flatMap(m => [...list(obj(m).steps), obj(m).register_as_foreign_company])];
      return lines.filter((l): l is string => typeof l === "string").flatMap(l => formOf(l.split(" | ")[0]));
    }
    case "prepare_application":
      return [...formOf(input.official_form_id), ...appForm(o.application_id)];
    case "fill_fields": case "update_application": case "request_filing_approval":
      return appForm(input.application_id);
    case "address_rules":
      return [...formOf(input.official_form_id), ...list(o.lines).flatMap(l => list(obj(l).sources).map(x => obj(x).url).filter(isUrl).map(u => page(u)))];
    case "appeal_options":
      return list(o.sources).map(x => obj(x).url).filter(isUrl).map(u => page(u));
    case "inspection_guide":
      return list(o.inspections).map(x => obj(x).source).filter(isUrl).map(u => page(u));
    case "city_records":
      return list(o.records).map(x => obj(x).see).filter(isUrl).slice(0, 3).map(u => page(u));
    case "review_documents":
      return list(o.reviewed).filter(x => !obj(x).unreadable).map(x => ({ kind: "doc" as const, label: s(obj(x).name, 80) })).filter(d => d.label);
    case "import_file": {
      const name = s(o.document, 80) || s(o.name, 80) || s(input.name, 80);
      return name ? [{ kind: "doc", label: name }] : [];
    }
    case "read_email": {
      const subject = s(o.subject, 80);
      return subject ? [{ kind: "doc", label: subject }] : [];
    }
    default:
      return [];
  }
}
function safeJson(t: string): unknown { try { return JSON.parse(t); } catch { return {}; } }

/** Pages read by the search service in one model response: each web_fetch it ran (its own blocks, not the model's text). */
export function usedInBlocks(content: { type: string; name?: string; input?: Record<string, unknown>; content?: unknown }[]): Used[] {
  const out: Used[] = [];
  for (const c of content) {
    if (c.type === "server_tool_use" && c.name === "web_fetch" && isUrl(c.input?.url)) out.push(page(c.input!.url as string));
    if (c.type === "web_fetch_tool_result") { const r = obj(c.content); if (isUrl(r.url)) out.push(page(r.url as string, s(obj(r.content).title))); }
  }
  return out;
}

/** Pages the search service cited in the reply (citations come with the API's own blocks, never from the model's text). */
export const citedPages = (cited: { url: string; title?: string }[]): Used[] => cited.filter(c => isUrl(c.url)).map(c => page(c.url, c.title));

/** Keep each thing once (a form looked up twice, a page fetched and cited). */
export function addUsed(into: Used[], more: Used[]): Used[] {
  for (const u of more) if (!into.some(x => x.kind === u.kind && (u.url ? x.url === u.url : x.label === u.label))) into.push(u);
  return into;
}

/** A reply that states a rule, a fee, a deadline or a requirement (what an agency asks, by when, for how much). */
export function statesRule(text: string): boolean {
  const t = text.replace(/\s+/g, " ");
  if (!t.trim() || /^no changes\.?$/i.test(t.trim())) return false;
  return /[$¥£€]\s?\d|\b\d[\d,.]* ?(usd|dollars?)\b|\bfees?\b|\bfree\b|\bdue\b|\bdeadline|\bexpir|\bwithin \d+ (business )?(days|weeks|months)|\b(takes|usually|processing) (about |around )?\d+|\b(must|required|requires|require)\b|\bneeds? to (be|file|have|get|register|apply|renew|pass)\b|\bhas to\b|\bby (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b20\d\d-\d\d-\d\d\b/i.test(t)
    || /费用|规费|收费|免费|截止|到期|续期|必须|要求|规定|办理时间|工作日|天内|周内|美元/.test(t);
}

/** The things to name for this reply: agency pages first, then the registry forms the reply talks about (or the ones it
 *  prepared), then documents; at most four. */
export function pick(used: Used[], reply: string): Used[] {
  const said = reply.toLowerCase();
  const mentions = (u: Used) => (u.keys ?? []).some(k => k && k.length > 2 && said.includes(k.toLowerCase()));
  const pages = used.filter(u => u.kind === "page").sort((a, b) => Number(official(b.url!)) - Number(official(a.url!)));
  const forms = used.filter(u => u.kind === "form");
  const named = forms.filter(mentions);
  const docs = used.filter(u => u.kind === "doc");
  const out = [...named, ...pages.filter(mentions), ...pages.filter(p => !mentions(p)), ...(named.length ? [] : forms.slice(0, 2)), ...docs];
  return out.filter((u, i) => out.indexOf(u) === i).slice(0, 4);
}

export const NOT_CHECKED = { en: "Not checked against the agency yet.", zh: "尚未与机构核对。" };

/** The Sources line for a reply, or the plain note when it states a rule and nothing was read; "" when the reply states
 *  none. short: for a text message, where every character counts (sites and file names only). */
export function sourcesLine(reply: string, used: Used[], lang: Lang, short = false): string {
  if (!statesRule(reply)) return "";
  const chosen = pick(used, reply);
  if (!chosen.length) return NOT_CHECKED[lang];
  const name = (u: Used) => u.kind === "form" && u.url && !short ? (lang === "zh" ? `${u.label}（${host(u.url)}）` : `${u.label} (${host(u.url)})`) : u.kind === "form" && u.url ? host(u.url) : u.label;
  const names = [...new Set(chosen.map(name))];
  return lang === "zh" ? `来源：${names.join("、")}` : `Sources: ${names.join(", ")}`;
}

/** A source as the app shows it, numbered in the order given: Harvey's, Legora's and Perplexity's inline citations.
 *  quote and read: the sentence Placetta read on the agency's page and the day it was last seen there, only while that
 *  is current (src/plan/ask.ts proofCurrent), so hovering a number never shows a stale quote. from: the page the quote
 *  was read on, when it isn't the linked page. keys: words a sentence uses when it talks about this source. */
export type Cite = { title: string; url: string; quote?: string; read?: string; from?: string; keys?: string[] };

const today = () => new Date().toISOString().slice(0, 10);
/** The proof behind a registry form, when it is current. */
export function formQuote(f: OfficialForm | undefined, url: string, on = today()): Pick<Cite, "quote" | "read" | "from"> {
  if (!f?.proof) return {};
  const seen = proofCurrent(f.proof, on);
  if (!seen) return {};
  return { quote: f.proof.en ?? f.proof.quote, read: seen, ...(f.proof.read !== url ? { from: f.proof.read } : {}) };
}

/** The links behind a Sources line, for the app to show as numbered links (the text line stays for every other
 *  channel), each with its quote and read date when the registry has them. */
export const sourceLinks = (reply: string, used: Used[], on = today()): Cite[] =>
  statesRule(reply) ? pick(used, reply).filter(u => u.url).map(u => ({
    title: u.kind === "form" ? u.label : host(u.url!), url: u.url!,
    ...(u.kind === "form" ? formQuote(u.form ? formById(u.form) : undefined, u.url!, on) : {}),
    keys: [...new Set([...(u.keys ?? []), ...(u.kind === "page" ? [host(u.url!)] : [])].filter(k => k && k.length > 2))],
  })) : [];

/* ---------------------------- inline numbers ---------------------------- */

/** A line's sentences, each with the numbers (from 1) of the sources it names. */
export type Marked = { text: string; marks: number[] }[];

/** A paragraph cut into sentences, each keeping its trailing space. A period ends one only before a space or the end
 *  ("$1.50" and "sjpermits.org" stay whole); a Chinese full stop always ends one. */
export function sentences(p: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if ("。！？".includes(c) || (".!?".includes(c) && (i + 1 === p.length || /\s/.test(p[i + 1])))) {
      let j = i + 1;
      while (j < p.length && /\s/.test(p[j])) j++;
      out.push(p.slice(start, j)); start = j; i = j - 1;
    }
  }
  if (start < p.length) out.push(p.slice(start));
  return out;
}

const names = (s: string, c: Cite) => { const t = s.toLowerCase(); return (c.keys ?? []).some(k => k.length > 2 && t.includes(k.toLowerCase())); };

/** Where each source's number goes: after every sentence that names it (its form number, title, agency or site). A
 *  source no sentence names still supports the answer, so its number goes after the last sentence that states a rule
 *  (or the last sentence), never nowhere. Lines are the reply's paragraphs and list items, in order. Pure. */
export function citeLines(lines: string[], cites: Cite[]): Marked[] {
  const out: Marked[] = lines.map(l => sentences(l).map(text => ({ text, marks: cites.flatMap((c, i) => (names(text, c) ? [i + 1] : [])) })));
  const placed = new Set(out.flat().flatMap(s => s.marks));
  const rest = cites.map((_, i) => i + 1).filter(n => !placed.has(n));
  if (!rest.length) return out;
  let at: { text: string; marks: number[] } | undefined;
  for (const l of out) for (const s of l) if (statesRule(s.text)) at = s;
  at ??= out.flat().filter(s => s.text.trim()).pop();
  if (at) at.marks = [...at.marks, ...rest].sort((a, b) => a - b);
  return out;
}

/** True for the paragraph this module adds, so the app can show it as a row of links instead of a sentence. */
export const isSourcesLine = (p: string) => /^(Sources: |来源：)/.test(p) || p === NOT_CHECKED.en || p === NOT_CHECKED.zh;

/** A reply split into what was said and the Sources line at its end ("" when there is none). */
export function splitSources(text: string): [string, string] {
  const i = text.lastIndexOf("\n\n"), last = (i >= 0 ? text.slice(i + 2) : text).trim();
  return isSourcesLine(last) ? [i >= 0 ? text.slice(0, i) : "", last] : [text, ""];
}
