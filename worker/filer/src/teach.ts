// Teach Odelia once: a person files on a portal Placetta has no steps for, in the run's live browser, while Odelia
// watches; the run becomes a draft playbook the team reviews, and once approved it files for every customer on that
// portal. Copied from Grok Bot ("ask a Bot to follow along as you complete a workflow once... it saves it as a
// routine"), Skyvern's "Show don't tell" recordings ("not pixel replay"), Power Automate's recorder (UI elements by
// their accessibility name, UIA), Stagehand's cached actions with a fallback to the model when a selector stops
// resolving, UiPath Task Capture (each captured step titled and editable before export) and Mariner's teach and repeat.
// What they leave to the builder, this does in code: secrets never leave the page, a recording carries no customer's
// data, a person reviews the routine before it runs unattended, and anything filed or paid still needs approval.
// docs/COMPETITIVE.md ("Teach Odelia once") has the sources.
//
// This module is pure: record() turns the page's raw events into a recording with placeholders in place of every
// value, generalize() turns a recording into the existing playbook format (playbooks.ts) plus the steps to replay, and
// the checks say whether a draft is complete and carries nobody's data. The recorder that runs in the page is
// recorder.ts; the run that drives it is Worker.teach (run.ts).
//
// Placeholders, the only values a recording or a playbook ever holds:
//   {fact:<key>}     one of the workspace's approved values, by its registry field id (or its label's slug)
//   {vault:login}    the saved login for this portal: the username, or the password (login: "password")
//   {person:<kind>}  an SSN, ITIN, passport, card, bank or one-time code: the person types it, every time
//   {file}           one of the approved files, picked by the control's label when the run replays
//   {ask}            something the person typed that no approved value matches: the team maps it, or the person is asked
import { scoreText } from "../../../supabase/functions/_shared/injection.ts";
import { confirmPattern, isFinal } from "./guards.ts";
import type { FormSteps, Playbook, Step } from "./playbooks.ts";
import { safeConfirm } from "./sandbox.ts";
import type { Payload, TraceStep } from "./types.ts";

/** What the page script reports. Values come only from plain fields; a field that reads as a secret sends none. */
export type RawEvent = {
  kind: "fill" | "select" | "check" | "click" | "upload" | "page";
  at?: number; url: string; heading: string;
  role?: string; name?: string; type?: string; autocomplete?: string; id?: string; nameAttr?: string;
  value?: string; secret?: boolean; checked?: boolean; files?: number;
  /** page events: what the worker read from the page (visible text, and why it reads as instructions to an AI) */
  text?: string; injection?: string | null; card?: boolean;
};

export type RecStep = {
  at: number; url: string; heading: string;
  action: "fill" | "select" | "check" | "click" | "upload";
  role: string; name: string;                      // the accessibility-tree target: role and accessible name
  selector: string;                                // the worker's own grammar (page.ts): label:, button:, link:, #id
  value?: string;                                  // a placeholder, a literal option of a fixed list, or "on"/"off"
  login?: "username" | "password";
  submit?: boolean;
};
export type RecPage = { url: string; heading: string; injection?: string; pay?: boolean };
export type Recording = {
  host: string; official: string; start: string;
  steps: RecStep[]; pages: RecPage[];
  /** the confirmation's shape (confirmPattern) and the heading of the page that showed it; never the number itself */
  confirm?: { pattern: string | null; heading: string };
  flags: string[];
};
export type Fact = { key: string; label: string };

/* ------------------------------------------------------------------ reading values as placeholders */

const lower = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
/** The workspace fact a payload field is: its registry field id, or its English label's slug. */
export const factKey = (f: { id?: string; label: { en: string } }) => (f.id && /^[\w.-]{1,80}$/.test(f.id) ? f.id : slug(f.label.en));
export const factsOf = (p: Payload): Fact[] => (p.fields ?? []).map((f) => ({ key: factKey(f), label: f.label.en }));

/** A field that is the person's alone: never read, never stored, typed by them on every run. */
const PERSON: [RegExp, string][] = [
  [/\b(ssn|social security)\b/i, "ssn"], [/\bitin\b|taxpayer identification/i, "itin"], [/\bpassport\b/i, "passport"],
  [/\b(card|cvv|cvc|csc|security code|expir)/i, "card"], [/\b(routing|account number|acct|iban|bank account)\b/i, "bank"],
  [/one-time|verification code|sms code|enter the code/i, "code"], [/\b(driver'?s? licen[cs]e|date of birth|dob)\b/i, "identity"],
];
/** A value that is a secret whatever its label says: an SSN's or a card's shape. */
const SECRET_SHAPE = /^\s*(\d{3}-\d{2}-\d{4}|\d{9}|(?:\d[ -]?){13,19})\s*$/;
const personKind = (e: Pick<RawEvent, "name" | "autocomplete" | "nameAttr" | "id">): string | null => {
  const d = `${e.name ?? ""} ${e.nameAttr ?? ""} ${e.id ?? ""}`;
  if (/^cc-/.test(e.autocomplete ?? "")) return "card";
  if (e.autocomplete === "one-time-code") return "code";
  for (const [re, kind] of PERSON) if (re.test(d)) return kind;
  return null;
};

/** The approved value this is, as a placeholder; null when none is. */
function asFact(value: string, p: Payload): string | null {
  const v = lower(value);
  if (!v) return null;
  const f = (p.fields ?? []).find((x) => x.value.trim() && lower(x.value) === v);
  return f ? `{fact:${factKey(f)}}` : null;
}

/** Text from the page (a heading, a button's words, a link's words, an address) with every approved value of this
 *  customer replaced by its placeholder, and anything shaped like an account, a record number or an email cut, so a
 *  playbook built from one customer's run names nothing of theirs. */
export function scrub(s: string, p: Payload): string {
  let out = String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const vals = (p.fields ?? []).filter((f) => f.value.trim().length >= 3).sort((a, b) => b.value.length - a.value.length);
  for (const f of vals) {
    const v = f.value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(v, "gi"), `{fact:${factKey(f)}}`);
  }
  for (const a of p.attachments ?? []) if (a.name.length >= 3) out = out.split(a.name).join("{file}");
  if (p.signature?.name && p.signature.name.trim().length >= 3) out = out.replace(new RegExp(p.signature.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "{signer}");
  return out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "{email}").replace(/\b[A-Z]{0,4}-?\d[\d-]{4,}\b/g, "{n}");
}
/** An address as a recording keeps it: the origin and path, with any path part that names a record cut. */
export function scrubUrl(u: string, p: Payload): string {
  try {
    const x = new URL(u);
    const path = x.pathname.split("/").map((seg) => (/\d{4,}|[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg) ? "*" : scrub(decodeURIComponent(seg), p) !== decodeURIComponent(seg) ? "*" : seg)).join("/");
    return `${x.origin}${path}`;
  } catch { return ""; }
}
/** A placeholder put back with this customer's value, for comparing a recorded heading or a link's words. */
export function fillFacts(s: string, p: Payload): string {
  return s.replace(/\{fact:([\w.-]+)\}/g, (m, k) => (p.fields ?? []).find((f) => factKey(f) === k)?.value ?? m);
}

/** The worker's selector for a target: its accessible name first (label:, button:, link:), its id only without one. */
export function selectorFor(role: string, name: string, id?: string, nameAttr?: string): string {
  const n = name.replace(/\s+/g, " ").trim();
  if (role === "button" && n) return `button:${n}`;
  if (role === "link" && n) return `link:${n}`;
  if (n && role !== "radio") return `label:${n}`;
  if (id && /^[\w-]{1,80}$/.test(id)) return `#${id}`;
  if (nameAttr && /^[\w.[\]-]{1,80}$/.test(nameAttr)) return `[name="${nameAttr}"]`;
  return `label:${n}`;
}

/* ------------------------------------------------------------------ record */

const CONF = /\b(confirmation|reference|record|tracking|application|receipt|filing|order|submission|case|permit)\s*(number|no\.?|#|id)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,30})\b/i;
/** The agency's confirmation number on this page, if it shows one. */
export function confirmationIn(text: string): string | null {
  for (const line of String(text ?? "").split("\n")) { const m = CONF.exec(line); if (m && /\d/.test(m[3])) return m[3]; }
  return null;
}

/** The page's raw events as a recording: every value a placeholder, every name scrubbed, the confirmation's shape
 *  kept and its number returned beside the recording (it belongs to this filing, not to the playbook). */
export function record(events: RawEvent[], o: { payload: Payload; host: string; official: string; start: string }): { recording: Recording; confirmation: string | null } {
  const p = o.payload, steps: RecStep[] = [], pages: RecPage[] = [], flags = new Set<string>();
  let confirmation: string | null = null, confirm: Recording["confirm"];
  const sorted = events.map((e, i) => ({ e, i })).sort((a, b) => (a.e.at ?? a.i) - (b.e.at ?? b.i) || a.i - b.i).map((x) => x.e);
  for (const e of sorted) {
    const url = scrubUrl(e.url, p), heading = scrub(e.heading ?? "", p), at = e.at ?? steps.length;
    if (e.kind === "page") {
      const last = pages.at(-1);
      if (!last || last.url !== url || last.heading !== heading) pages.push({ url, heading, ...(e.injection ? { injection: e.injection } : {}), ...(e.card ? { pay: true } : {}) });
      else if (e.injection) last.injection = e.injection;
      if (e.injection) flags.add("page_injection");
      const n = confirmationIn(e.text ?? "");
      if (n && steps.some((s) => s.action === "click")) {
        confirmation = n;
        confirm = { pattern: confirmPattern(e.text ?? "", n), heading };
        // the click that led here sent it, whatever its words were ("Continue" on a review page)
        const lastClick = [...steps].reverse().find((s) => s.action === "click");
        if (lastClick) lastClick.submit = true;
      }
      continue;
    }
    const role = e.role ?? (e.kind === "click" ? "button" : e.kind === "select" ? "combobox" : e.kind === "check" ? "checkbox" : e.kind === "upload" ? "file" : "textbox");
    const name = scrub(e.name ?? "", p);
    if (name !== (e.name ?? "").replace(/\s+/g, " ").trim().slice(0, 200)) flags.add("names_scrubbed");
    const selector = selectorFor(role, name, e.id, e.nameAttr);
    if (!name) flags.add("no_accessible_name");
    const base = { at, url, heading, role, name, selector };
    // the same field again on the same page: the last entry is what was sent
    const same = (s: RecStep) => s.selector === selector && s.heading === heading && s.url === url && s.action === e.kind;
    const put = (s: RecStep) => { const i = steps.findIndex(same); if (i >= 0 && s.action !== "click") steps.splice(i, 1); steps.push(s); };
    if (e.kind === "click") { put({ ...base, action: "click", ...(isFinal(name) ? { submit: true } : {}) }); continue; }
    if (e.kind === "check") { put({ ...base, action: "check", value: e.checked ? "on" : "off" }); continue; }
    if (e.kind === "upload") { put({ ...base, action: "upload", value: "{file}" }); continue; }
    if (e.kind === "select") {
      const kind = personKind(e);
      const v = kind ? `{person:${kind}}` : asFact(e.value ?? "", p) ?? (e.value ? scrub(e.value, p) : "{ask}");
      put({ ...base, action: "select", value: v });
      continue;
    }
    // fill. A password is the saved login's; the field just before it on the same page is the username. Neither
    // value is ever read here: the page script doesn't send a password, and the username's value is dropped.
    if (e.type === "password") {
      const user = [...steps].reverse().find((s) => s.action === "fill" && s.url === url && s.heading === heading && !s.login && s.value !== "{vault:login}");
      if (user && (user.value === "{ask}" || /user|e-?mail|login|account id|user id/i.test(user.name))) { user.value = "{vault:login}"; user.login = "username"; }
      put({ ...base, action: "fill", value: "{vault:login}", login: "password" });
      flags.add("signs_in");
      continue;
    }
    const kind = personKind(e) ?? (e.secret ? "secret" : null) ?? (SECRET_SHAPE.test(e.value ?? "") ? "number" : null);
    if (kind) { put({ ...base, action: "fill", value: `{person:${kind}}` }); continue; }
    put({ ...base, action: "fill", value: asFact(e.value ?? "", p) ?? "{ask}" });
  }
  if (steps.some((s) => s.value === "{ask}")) flags.add("unmapped_fields");
  if (!confirm) flags.add("no_confirmation");
  return { recording: { host: o.host, official: o.official, start: scrubUrl(o.start, p) || o.start, steps, pages, confirm, flags: [...flags] }, confirmation };
}

/* ------------------------------------------------------------------ generalize */

export type ValidatorId = "ein" | "premises" | "latin" | "date";
/** A fact's validator, by what the fact is (src/validate.ts has the same four). */
export function validatorFor(key: string, label: string): ValidatorId | null {
  const t = `${key} ${label}`;
  if (/\bein\b|employer identification|fein/i.test(t)) return "ein";
  if (/premises|physical|business location|street address|site address|store address|facility address/i.test(t)) return "premises";
  if (/date|opening|start/i.test(t)) return "date";
  if (/name|owner|officer|member|signer|title/i.test(t)) return "latin";
  return null;
}
/** The validators in code, the worker's copy of src/validate.ts's rules (the worker can't import the app). */
export function checkValue(id: ValidatorId, v: string): boolean {
  const s = v.trim();
  if (!s) return true;
  if (id === "ein") return /^\d{2}-?\d{7}$/.test(s);
  if (id === "premises") return !/\bp\.?\s*o\.?\s*box\b|\bpost office box\b/i.test(s);
  if (id === "latin") return !/[㐀-鿿豈-﫿]/.test(s);
  return !/\d/.test(s) || !Number.isNaN(Date.parse(s)) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s);
}

/** What the model may say about a recording: a name and a plain note for each page, and the fact an unmapped field
 *  is. It sees headings, control names and the workspace's fact names, never a value or a page's text. */
export type LabelIn = { host: string; official: string; pages: { heading: string; controls: string[] }[]; unmapped: { selector: string; name: string }[]; facts: Fact[] };
export type LabelOut = { pages?: { heading: string; page?: string; note?: string }[]; fields?: { selector: string; fact: string }[] };
export type Labeler = (i: LabelIn) => Promise<LabelOut>;

export type FieldMap = { selector: string; page: string; fact: string; label: string; validator?: ValidatorId };
export type Draft = {
  version: 1; host: string; official: string; name: string;
  playbook: Playbook;                                // the existing format: steps, final, pay, receipt, confirm
  fields: FieldMap[];                                // which control takes which workspace fact
  validators: Record<string, ValidatorId>;           // fact → the check its value must pass before it's typed
  trace: TraceStep[];                                // the steps the worker replays
  flags: string[];
};

const STEP_DO: Step["do"][] = ["sign_in", "open", "choose", "fill", "upload", "agree", "review", "submit", "pay", "receipt"];
/** A label the model wrote, used only if it is short plain text with nothing in it aimed at an AI. */
const usable = (s: unknown, max = 160): string | null => {
  if (typeof s !== "string") return null;
  const t = s.replace(/[\u0000-\u001f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.length > max || /[<>{}`]|https?:/i.test(t) || scoreText(t).verdict !== "clean") return null;
  return t;
};

/** A recording as a draft playbook. The model (when given) only names pages and maps unmapped fields; every mapping is
 *  checked against the workspace's facts and, where the registry lists the form's fields, against those. */
export async function generalize(rec: Recording, o: { facts: Fact[]; registry?: string[]; name?: string; today?: string; label?: Labeler }): Promise<Draft> {
  const flags = new Set(rec.flags);
  const facts = new Map(o.facts.map((f) => [f.key, f.label]));
  const registry = o.registry?.length ? new Set(o.registry) : null;
  const known = (k: string) => facts.has(k) && (!registry || registry.has(k));
  // pages in the order they were worked through, each with its steps
  type Pg = { heading: string; url: string; steps: RecStep[]; pay: boolean; injection?: string };
  const pgs: Pg[] = [];
  for (const s of rec.steps) {
    const last = pgs.at(-1);
    if (last && last.heading === s.heading && last.url === s.url) last.steps.push(s);
    else pgs.push({ heading: s.heading, url: s.url, steps: [s], pay: !!rec.pages.find((x) => x.heading === s.heading && x.url === s.url)?.pay, injection: rec.pages.find((x) => x.heading === s.heading && x.url === s.url)?.injection });
  }
  for (const pg of rec.pages) if (pg.pay && !pgs.some((x) => x.heading === pg.heading)) pgs.push({ heading: pg.heading, url: pg.url, steps: [], pay: true });

  // deterministic mapping: an unmapped field whose label is a fact's label
  const steps = rec.steps.map((s) => ({ ...s }));
  for (const s of steps) {
    if (s.value !== "{ask}") continue;
    const hit = o.facts.find((f) => lower(f.label) === lower(s.name.replace(/[*:：]|\(required\)/gi, "")));
    if (hit && known(hit.key)) s.value = `{fact:${hit.key}}`;
  }
  // the model: names and notes, and the unmapped fields; pages with text aimed at an AI aren't shown to it at all
  let said: LabelOut = {};
  if (o.label) {
    const shown = pgs.filter((p) => !p.injection);
    const unmapped = steps.filter((s) => s.value === "{ask}" && shown.some((p) => p.heading === s.heading)).map((s) => ({ selector: s.selector, name: s.name }));
    try {
      said = await o.label({ host: rec.host, official: rec.official, pages: shown.map((p) => ({ heading: p.heading, controls: p.steps.map((s) => `${s.role}: ${s.name}`).slice(0, 30) })), unmapped, facts: o.facts });
    } catch { flags.add("labels_unavailable"); }
  }
  for (const m of Array.isArray(said.fields) ? said.fields.slice(0, 200) : []) {
    const s = steps.find((x) => x.selector === m?.selector && x.value === "{ask}");
    if (!s) continue;
    if (typeof m.fact === "string" && known(m.fact)) s.value = `{fact:${m.fact}}`;
    else flags.add("model_mapping_refused");
  }
  if (steps.some((s) => s.value === "{ask}")) flags.add("unmapped_fields"); else flags.delete("unmapped_fields");
  // a fact the registry doesn't list for this form is never used: the field is asked instead
  for (const s of steps) {
    const k = /^\{fact:([\w.-]+)\}$/.exec(s.value ?? "")?.[1];
    if (k && !known(k)) { s.value = "{ask}"; flags.add("not_in_registry"); }
  }

  const named = new Map<string, { page?: string; note?: string }>();
  for (const x of Array.isArray(said.pages) ? said.pages.slice(0, 60) : []) if (typeof x?.heading === "string") named.set(x.heading, { page: usable(x.page, 80) ?? undefined, note: usable(x.note) ?? undefined });

  const doOf = (p: Pg): Step["do"] => {
    if (p.pay) return "pay";
    if (p.steps.some((s) => s.login)) return "sign_in";
    if (p.steps.some((s) => s.submit)) return p.steps.some((s) => s.action === "fill" || s.action === "select") ? "submit" : p.steps.some((s) => s.action === "check") ? "agree" : "submit";
    if (p.steps.some((s) => s.action === "upload")) return "upload";
    if (p.steps.some((s) => s.action === "fill")) return "fill";
    if (p.steps.some((s) => s.action === "select")) return "choose";
    if (p.steps.some((s) => s.action === "check")) return "agree";
    return "open";
  };
  const plain = (p: Pg, d: Step["do"]): string => {
    const f = p.steps.filter((s) => s.action === "fill" || s.action === "select").map((s) => s.name).filter(Boolean);
    const clicks = p.steps.filter((s) => s.action === "click").map((s) => s.name).filter(Boolean);
    return d === "sign_in" ? "Sign in with the saved login." : d === "pay" ? "The agency's fee: the person pays it." : d === "upload" ? "Attach the approved files." :
      [f.length ? `Fill ${f.slice(0, 6).join(", ")}${f.length > 6 ? ` and ${f.length - 6} more` : ""} from the approved values.` : "", clicks.length ? `Then ${clicks.at(-1)}.` : ""].filter(Boolean).join(" ") || "Continue.";
  };
  const book: Step[] = pgs.map((p) => {
    const d = doOf(p), n = named.get(p.heading);
    const click = p.steps.filter((s) => s.action === "click").at(-1);
    return { page: n?.page && lower(p.heading).includes(lower(n.page)) ? n.page : p.heading || "Page", do: STEP_DO.includes(d) ? d : "open", ...(click ? { selector: click.selector } : {}), note: n?.note ?? plain(p, d) };
  });
  if (rec.confirm?.heading) book.push({ page: rec.confirm.heading, do: "receipt", note: "The agency's confirmation: note its number." });

  const sendStep = steps.filter((s) => s.submit).at(-1);
  const final = sendStep ? [{ page: sendStep.heading, button: sendStep.name }] : [];
  if (!final.length) flags.add("no_submit");
  const pattern = rec.confirm?.pattern && safeConfirm(rec.confirm.pattern) ? rec.confirm.pattern : undefined;
  if (rec.confirm?.pattern && !pattern) flags.add("confirm_pattern_refused");
  const form: FormSteps = { start: rec.start, steps: book };
  const name = usable(o.name, 120) ?? `${rec.official} on ${rec.host}`;
  const playbook: Playbook = {
    host: rec.host, name, guides: [], read: o.today ?? new Date().toISOString().slice(0, 10), verified: null,
    forms: { [rec.official]: form }, final, pay: pgs.filter((p) => p.pay).map((p) => p.heading).filter(Boolean),
    receipt: rec.confirm?.heading ? [rec.confirm.heading] : [], ...(pattern ? { confirm: pattern } : {}),
  };

  const fields: FieldMap[] = [], validators: Record<string, ValidatorId> = {};
  const trace: TraceStep[] = [];
  for (const s of steps) {
    const k = /^\{fact:([\w.-]+)\}$/.exec(s.value ?? "")?.[1];
    const label = k ? facts.get(k) ?? k : undefined;
    if (k && (s.action === "fill" || s.action === "select")) {
      const v = validatorFor(k, label!);
      fields.push({ selector: s.selector, page: s.heading, fact: k, label: label!, ...(v ? { validator: v } : {}) });
      if (v) validators[k] = v;
    }
    const t = { url: s.url, heading: s.heading, at: s.at };
    if (s.action === "click") trace.push({ action: "click", selector: s.selector, ...(s.submit ? { submit: true } : {}), ...t });
    else if (s.action === "check") trace.push({ action: "check", selector: s.selector, on: s.value === "on", ...t });
    else if (s.action === "upload") trace.push({ action: "upload", selector: s.selector, attachment: "{file}", ...t });
    else if (s.action === "select") trace.push(k ? { action: "select", selector: s.selector, field: label, fact: k, ...t } : s.value === "{ask}" || /^\{person:/.test(s.value ?? "") ? { action: "select", selector: s.selector, ask: true, ...t } : { action: "select", selector: s.selector, option: s.value, ...t });
    else if (s.login) trace.push({ action: "fill", selector: s.selector, login: s.login, ...t });
    else if (k) trace.push({ action: "fill", selector: s.selector, field: label, fact: k, ...t });
    else if (/^\{person:/.test(s.value ?? "")) trace.push({ action: "fill", selector: s.selector, person: /^\{person:([\w]+)\}$/.exec(s.value!)?.[1] ?? "secret", ...t });
    else trace.push({ action: "fill", selector: s.selector, ask: true, ...t });
  }
  return { version: 1, host: rec.host, official: rec.official, name, playbook, fields, validators, trace, flags: [...flags].sort() };
}

/* ------------------------------------------------------------------ checks */

const GRAMMAR = /^(label:.{1,200}|button:.{1,200}|link:.{1,200}|#[\w-]{1,80}|\[name="[\w.[\]-]{1,80}"\])$/;
/** Why this draft can't be a playbook yet, or nothing. */
export function draftProblems(d: Draft): string[] {
  const out: string[] = [];
  const form = d.playbook?.forms?.[d.official];
  if (!d.host || d.playbook?.host !== d.host) out.push("host");
  if (!form?.steps?.length) out.push("no steps");
  if (!form?.start || !/^https?:\/\//.test(form.start)) out.push("no start page");
  if (!d.playbook?.final?.length) out.push("no submit step");
  if (!d.playbook?.receipt?.length) out.push("no confirmation page");
  if (d.playbook?.confirm && !safeConfirm(d.playbook.confirm)) out.push("confirmation pattern");
  if (!d.trace?.length) out.push("nothing to replay");
  for (const s of d.trace ?? []) {
    if (!GRAMMAR.test(s.selector)) { out.push(`selector ${s.selector.slice(0, 40)}`); break; }
    const extra = s as unknown as Record<string, unknown>;
    if ("value" in extra) { out.push("a recorded value"); break; }
  }
  for (const st of form?.steps ?? []) if (!STEP_DO.includes(st.do)) { out.push(`step ${st.do}`); break; }
  return out;
}
/** Any of this customer's own data in the draft: their approved values, file names or signer. Empty when none. */
export function customerData(d: unknown, p: Payload): string[] {
  const text = JSON.stringify(d).toLowerCase();
  const hits: string[] = [];
  for (const f of p.fields ?? []) if (f.value.trim().length >= 3 && text.includes(f.value.trim().toLowerCase())) hits.push(f.label.en);
  for (const a of p.attachments ?? []) if (a.name.length >= 3 && text.includes(a.name.toLowerCase())) hits.push(`file ${a.name.length} chars`);
  if (p.signature?.name && p.signature.name.trim().length >= 3 && text.includes(p.signature.name.trim().toLowerCase())) hits.push("signer");
  return hits;
}

/** The approved file a taught upload takes: the one whose name shares a word with the control's label, or the only
 *  approved file; null when that's ambiguous (the person attaches it). */
export function fileFor(label: string, p: Payload): string | null {
  const files = [...(p.attachments ?? []).map((a) => a.name), ...(p.pdf_path ? ["form.pdf"] : [])];
  const words = lower(label).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const hits = files.filter((f) => words.some((w) => lower(f).includes(w)));
  if (hits.length === 1) return hits[0];
  return files.length === 1 ? files[0] : null;
}
