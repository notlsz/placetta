import type { OrbState } from "thinking-orbs";
import {
  addApp, addApproval, addDeadline, addDoc, audit, demoAgent, setApp, setCheck, setFact,
  type AgentBackend, type AgentEvent, type Reply, type Request, type Step,
} from "./agent";
import { B, same, type Application, type Approval, type Bi, type Doc, type Field, type FactGroup, type Level, type LicenseHit, type Status, type Workspace } from "./model";
import { inDays, nowIso } from "./time";
import type { Lang } from "./i18n";

/* ------------------------------------------------------------------ *
 * The live agent: a real model reads the workspace and acts on it
 * through page tools. Two ways to reach Claude:
 *   - inside a Claude viewer, the `sample` capability (the viewer's own
 *     Claude account; the first call asks them to allow it);
 *   - anywhere else, the Anthropic API with a key the person enters.
 * Whatever the model decides, the rule holds: it can prepare, fill, add
 * deadlines, remember and draft, but filing, paying and sending only
 * happen when the person approves in the app.
 * ------------------------------------------------------------------ */

export type Turn = { role: "user" | "assistant"; content: string };
export type Source = { title: string; url: string };
export type Tool = { name: string; description: string; inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] }; execute: (input: Record<string, unknown>) => unknown };
export type Model = {
  kind: "claude" | "api" | "server";
  tools: boolean;
  images: boolean;
  /** Reads PDFs (the Messages API's document blocks). */
  pdfs: boolean;
  /** Takes instructions as a system prompt (the API and the server); the viewer's Claude gets them as the first turn. */
  system: boolean;
  chat(turns: Turn[], o: { tools?: Tool[]; onText?: (text: string) => void; signal: AbortSignal; deep?: boolean; system?: string; onSources?: (s: Source[]) => void }): Promise<string>;
  json<T>(prompt: string, o: { signal: AbortSignal; deep?: boolean; images?: Blob[]; pdfs?: Blob[] }): Promise<T>;
};
export type LiveError = { code: string; message: string };
/** Codes after which this view can't use Claude at all: fall back to the demo. */
export const PERMANENT = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed", "tools_unavailable", "unauthorized"];

/* ------------------------------ via the viewer ------------------------------ */

type SampleFn = ((input: string | Turn[], o?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: <T>(input: string | Turn[], o?: Record<string, unknown>) => Promise<T>;
  limits: () => Promise<{ images?: unknown; tools?: { maxCount: number } }>;
};

export async function claudeModel(): Promise<Model | null> {
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!c?.use) return null;
  const sample = (await c.use("sample").catch(() => null)) as SampleFn | null;
  if (!sample) return null;
  const lim = await sample.limits().catch(() => null);
  const max = lim?.tools?.maxCount ?? 0;
  return {
    kind: "claude", tools: max > 0, images: !!lim?.images, pdfs: false, system: false,
    async chat(turns, o) {
      const { text } = await sample(turns, {
        signal: o.signal, cache: false, modelTier: o.deep ? "default" : "quick",
        onText: o.onText ? ({ text }: { text: string }) => o.onText!(text) : undefined,
        ...(max > 0 && o.tools?.length ? { tools: o.tools.slice(0, max) } : {}),
      });
      return text;
    },
    json: (prompt, o) => sample.json(prompt, { signal: o.signal, modelTier: o.deep ? "default" : "quick", ...(o.images?.length && lim?.images ? { images: o.images } : {}) }),
  };
}

/* -------------------------------- via the API ------------------------------- */

export const API_MODELS = [{ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" }, { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }];

async function blobToBase64(b: Blob) {
  const buf = new Uint8Array(await b.arrayBuffer()); let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
const parseJson = (t: string) => {
  try { return JSON.parse(t); } catch { /* not bare JSON */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) { try { return JSON.parse(fence[1]); } catch { /* keep looking */ } }
  const i = t.search(/[[{]/), j = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}"));
  if (i >= 0 && j > i) return JSON.parse(t.slice(i, j + 1));
  throw { code: "invalid_json", message: "No JSON in the reply" };
};

type Transport = (body: Record<string, unknown>, signal: AbortSignal, deep: boolean) => Promise<{ content: Block[]; stop_reason: string }>;
type Block = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; citations?: { url?: string; title?: string }[] };

/** The Messages API tool loop, over any transport: the browser straight to Anthropic, or Placetta's server. */
function messagesModel(kind: "api" | "server", send: Transport): Model {
  // the API wants alternating roles: fold consecutive turns of the same role together
  const fold = (turns: Turn[]) => turns.reduce<{ role: string; content: unknown }[]>((acc, t) => {
    const last = acc[acc.length - 1];
    if (last && last.role === t.role && typeof last.content === "string") last.content += "\n\n" + t.content; else acc.push({ role: t.role, content: t.content });
    return acc;
  }, []);
  return {
    kind, tools: true, images: true, pdfs: true, system: true,
    async chat(turns, o) {
      const messages = fold(turns);
      const tools = (o.tools ?? []).map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
      const sources = new Map<string, Source>();
      let all = "";
      for (let round = 0; round < 8; round++) {
        const data = await send({ messages, max_tokens: 2000, ...(o.system ? { system: o.system } : {}), ...(tools.length ? { tools } : {}) }, o.signal, !!o.deep);
        for (const c of data.content) for (const ci of c.citations ?? []) if (ci.url && !sources.has(ci.url)) sources.set(ci.url, { url: ci.url, title: ci.title || ci.url });
        if (sources.size) o.onSources?.([...sources.values()]);
        const text = data.content.filter(c => c.type === "text").map(c => c.text).join("");
        if (text) { all += (all ? "\n\n" : "") + text; o.onText?.(all); }
        if (data.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: data.content }); continue; }   // a long research step: let it carry on
        const uses = data.content.filter(c => c.type === "tool_use");
        if (!uses.length || data.stop_reason !== "tool_use") return all;
        messages.push({ role: "assistant", content: data.content });
        const results = await Promise.all(uses.map(async u => {
          const tool = o.tools!.find(t => t.name === u.name);
          try {
            if (!tool) throw new Error(`No tool named ${u.name}`);
            const out = await tool.execute(u.input ?? {});
            return { type: "tool_result", tool_use_id: u.id, content: typeof out === "string" ? out : JSON.stringify(out ?? "ok") };
          } catch (e) { return { type: "tool_result", tool_use_id: u.id, content: "Error: " + ((e as Error)?.message ?? String(e)), is_error: true }; }
        }));
        messages.push({ role: "user", content: results });
      }
      return all;
    },
    async json(prompt, o) {
      const content: unknown[] = [];
      for (const pdf of o.pdfs ?? []) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: await blobToBase64(pdf) } });
      for (const img of o.images ?? []) content.push({ type: "image", source: { type: "base64", media_type: img.type || "image/png", data: await blobToBase64(img) } });
      content.push({ type: "text", text: prompt });
      const messages: { role: string; content: unknown }[] = [{ role: "user", content }];
      let text = "";
      for (let round = 0; round < 4; round++) {
        const data = await send({ messages, max_tokens: 3000 }, o.signal, !!o.deep);
        text += data.content.filter(c => c.type === "text").map(c => c.text).join("");
        if (data.stop_reason !== "pause_turn") break;   // a long research step: let it carry on
        messages.push({ role: "assistant", content: data.content });
      }
      return parseJson(text);
    },
  };
}

export function apiModel(key: string, model: string): Model {
  return messagesModel("api", async (body, signal) => {
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model, max_tokens: 1500, ...body }),
      });
    } catch (e) { throw (e as Error)?.name === "AbortError" ? { code: "cancelled", message: "Stopped" } : { code: "upstream_error", message: String(e) }; }
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw { code: res.status === 401 || res.status === 403 ? "unauthorized" : res.status === 429 ? "rate_limited" : "upstream_error", message: msg.slice(0, 300) };
    }
    return res.json();
  });
}

/** Claude through Placetta's server: the company key, research on official sites with citations, plan and usage checks. */
export function serverModel(call: (body: Record<string, unknown>, deep: boolean) => Promise<{ content: Block[]; stop_reason: string }>): Model {
  return messagesModel("server", (body, signal, deep) => new Promise((resolve, reject) => {
    if (signal.aborted) return reject({ code: "cancelled", message: "Stopped" });
    const off = () => reject({ code: "cancelled", message: "Stopped" });
    signal.addEventListener("abort", off, { once: true });
    call(body, deep).then(resolve, reject).finally(() => signal.removeEventListener("abort", off));
  }));
}

/* ------------------------------- the prompt -------------------------------- */

const LANG = { en: "English", zh: "Simplified Chinese" };

function snapshot(w: Workspace, lang: Lang) {
  const b = (x: Bi) => x[lang];
  return {
    business: b(w.business), goal: b(w.goal), today: inDays(0),
    locations: w.locations.map(l => `${b(l.name)} (${b(l.county)})`),
    applications: w.apps.map(a => ({
      id: a.id, name: b(a.name), agency: b(a.agency), level: a.level, status: a.status, next: a.next ? b(a.next) : undefined,
      fee_usd: a.fees.reduce((s, f) => s + f.amount, 0), takes: b(a.est), sets_opening_date: a.critical || undefined,
      empty_fields: a.fields.filter(f => !f.value).map(f => b(f.label)),
      missing_documents: a.checklist.filter(c => c.state === "missing").map(c => b(c.label)),
    })),
    waiting_for_approval: w.approvals.map(a => ({ id: a.id, title: b(a.title), application: a.app })),
    deadlines: [...w.deadlines].sort((x, y) => x.date.localeCompare(y.date)).slice(0, 8).map(d => `${d.date}: ${b(d.title)}`),
    facts: w.facts.map(f => `${b(f.label)}: ${b(f.value)}`),
    documents: w.docs.slice(0, 20).map(d => d.name),
    running: w.running.map(r => b(r.label)),
  };
}

function rules(w: Workspace, lang: Lang, account: boolean, research: boolean) {
  return `You are Placetta (快哉), an agent that gets business licenses and permits in place for the person you are talking to. You work inside their Placetta workspace, shown below as JSON. Today is ${inDays(0)}.

What you can do: use the tools to add applications the business needs, fill their fields from the workspace facts, update statuses, ask for approval to file, draft messages for approval, add deadlines, remember facts the person tells you, and show a list of licenses. When the person asks for something a tool can do, do it rather than describe it.

Rules:
- You never file, pay or send anything yourself. Call request_filing_approval to put a filing in front of the person, and draft_message for anything sent on their behalf.${account ? `
- After the person approves, Placetta's filing team checks the application against the agency's current requirements and submits it. Government fees are paid by the business directly to the agency, through the payment link the team sends. Never say a filing is submitted until the workspace shows it.` : ""}
- Never invent the person's facts. If a field needs information you don't have, leave it empty and ask for it in one question.
- Never ask for a Social Security number, ITIN, or bank or card numbers in chat. The team collects those on the agency's own site.${research ? `
- Research requirements, fees and processing times on official government websites with web_search and web_fetch: the agency's own pages (.gov, state, county and city sites). Portals that point to agencies (america.gov, usa.gov, sba.gov) are fine for finding the right agency, but read and cite the agency's own page, never the portal. Use the agency's root domain as the application's agency_url. If you can't confirm something on an official page, call it an estimate.` : `
- Requirements, fees and processing times come from your general knowledge: call them estimates to confirm with the agency, and never present a guess as a confirmed rule. Use only agencies' official root domains as links.
- You cannot browse the web or reach agency portals from here.`}
- Reply in ${LANG[lang]}. Be sharp and concise: one to three short sentences of plain prose, no markdown, no lists, no headings, and never an em dash. Lead with what you did or found.

Workspace:
${JSON.stringify(snapshot(w, lang))}`;
}

/* -------------------------------- the tools -------------------------------- */

const LEVELS: Level[] = ["federal", "state", "county", "city"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
const str = (v: unknown, max = 400) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim().slice(0, max);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const domainOf = (url: string) => { try { const u = new URL(url.startsWith("http") ? url : "https://" + url); return u.protocol === "https:" || u.protocol === "http:" ? u.hostname.replace(/^www\./, "") : ""; } catch { return ""; } };
const okUrl = (url: string) => (domainOf(url) ? (url.startsWith("http") ? url : "https://" + url) : "");
let seq = 0;

type Made = { apps: Set<string>; approvals: string[]; memory: Bi[]; matches?: Reply["matches"]; lastToolAt: number };

function makeTools(get: () => Workspace, apply: (p: (w: Workspace) => Workspace) => void, step: (s: Step) => void, made: Made, lang: Lang, textLen: () => number, account: boolean): Tool[] {
  const L = (en: string, zh: string) => B(en, zh);
  const findApp = (id: unknown) => { const a = get().apps.find(x => x.id === str(id)); if (!a) throw new Error(`No application with id "${str(id)}". Use an id from the workspace.`); return a; };
  // "Business tax registration" reads "the business tax registration" mid-sentence; acronyms and proper names keep their capitals
  // "the business tax registration" mid-sentence; Title Case names ("Food Service Establishment Permit") and acronyms stay as they are
  const nm = (a: Application) => { const n = a.name[lang]; const titled = n.split(/\s+/).filter(w => /^[A-Z]/.test(w)).length > 1; return lang === "en" && /^[A-Z][a-z]/.test(n) && !titled ? n.charAt(0).toLowerCase() + n.slice(1) : n; };
  const mark = () => { made.lastToolAt = textLen(); };
  const fieldList = (v: unknown, fromDefault: string): Field[] => arr(v).map((f, i) => {
    const o = f as Record<string, unknown>; const label = str(o.label, 80);
    return { id: slug(label) || "f" + i, label: same(label), value: str(o.value, 200), from: str(o.source, 80) ? same(str(o.source, 80)) : same(fromDefault) };
  }).filter(f => f.label.en);
  const S = (state: OrbState, label: Bi, tool?: string) => step({ state, label, tool });

  return [
    {
      name: "prepare_application",
      description: "Add a license, permit or registration the business needs to the workspace, with what you can already fill in. Returns its id. Does not file anything.",
      inputSchema: { type: "object", properties: {
        name: { type: "string" }, agency: { type: "string" }, level: { type: "string", enum: LEVELS },
        fee_usd: { type: "number", description: "Typical total fee in USD, 0 if none" }, processing_time: { type: "string" },
        agency_url: { type: "string", description: "The agency's official home page" }, form: { type: "string", description: "The form or online service used" },
        fields: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" }, source: { type: "string" } }, required: ["label"] } },
        checklist: { type: "array", items: { type: "object", properties: { item: { type: "string" }, have: { type: "boolean" } }, required: ["item"] } },
        next_step: { type: "string" },
        store_id: { type: "string", description: "The store this is for, when the business has more than one" },
      }, required: ["name", "agency", "level"] },
      execute(i) {
        const name = str(i.name, 120), agency = str(i.agency, 160);
        if (!name || !agency) throw new Error("name and agency are required");
        const level = (LEVELS.includes(i.level as Level) ? i.level : "state") as Level;
        const url = okUrl(str(i.agency_url, 200)), fee = Math.max(0, Number(i.fee_usd) || 0);
        const fields = fieldList(i.fields, lang === "zh" ? "来自资料" : "From Context");
        const checklist = arr(i.checklist).map((c, k) => { const o = c as Record<string, unknown>; return { id: "c" + k, label: same(str(o.item, 120)), state: (o.have ? "done" : "missing") as "done" | "missing" }; }).filter(c => c.label.en);
        const status: Status = checklist.some(c => c.state === "missing") ? "needs" : fields.some(f => !f.value) ? "draft" : "ready";
        const id = "x-" + slug(name) + "-" + seq++;
        S("shaping", L(`Preparing the ${/^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name}`, `准备${name}`), domainOf(url) || undefined);
        const app: Application = {
          id, name: same(name), agency: same(agency), level, status, next: str(i.next_step) ? same(str(i.next_step, 200)) : undefined,
          fees: [{ label: L("Estimated fee", "预估费用"), amount: fee }], feeNote: L("Estimate from Placetta. Confirm with the agency before paying.", "快哉的估算，付款前请向机构确认。"),
          est: same(str(i.processing_time, 120) || (lang === "zh" ? "待确认" : "To be confirmed")),
          source: { label: domainOf(url), url }, form: str(i.form) ? same(str(i.form, 120)) : undefined, fields, checklist,
        };
        apply(w => audit("agent", L("Prepared application", "准备申请"), app.name, same(`${fields.filter(f => f.value).length}/${fields.length}`))(addApp(app)(w)));
        // file it under its store: the one named, or the only one
        apply(w => { const st = w.stores ?? []; const target = st.find(x => x.id === str(i.store_id)) ?? (st.length === 1 ? st[0] : undefined);
          return target ? { ...w, stores: st.map(x => (x.id === target.id ? { ...x, apps: [...new Set([...(x.apps ?? []), id])] } : x)) } : w; });
        made.apps.add(id); mark();
        return { application_id: id, status, empty_fields: fields.filter(f => !f.value).map(f => f.label.en) };
      },
    },
    {
      name: "fill_fields",
      description: "Fill or correct fields on an application, matching by label (new labels are added). Returns the fields still empty.",
      inputSchema: { type: "object", properties: { application_id: { type: "string" }, fields: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" }, source: { type: "string" } }, required: ["label", "value"] } } }, required: ["application_id", "fields"] },
      execute(i) {
        const a = findApp(i.application_id), incoming = fieldList(i.fields, lang === "zh" ? "快哉填写" : "Filled by Placetta");
        S("shaping", L(`Filling ${incoming.length} field${incoming.length === 1 ? "" : "s"} on the ${nm(a)}`, `填写${nm(a)}的 ${incoming.length} 项`), a.source.label || undefined);
        apply(w => ({ ...w, apps: w.apps.map(x => {
          if (x.id !== a.id) return x;
          const fields = [...x.fields];
          for (const f of incoming) {
            const k = fields.findIndex(y => y.label.en.toLowerCase() === f.label.en.toLowerCase() || y.label.zh === f.label.en);
            if (k >= 0) fields[k] = { ...fields[k], value: f.value, from: f.from }; else fields.push(f);
          }
          return { ...x, fields, status: x.status === "draft" && fields.every(f => f.value) && !x.checklist.some(c => c.state === "missing") ? "ready" : x.status };
        }) }));
        apply(audit("agent", L("Filled fields", "填写字段"), a.name, same(incoming.map(f => f.label.en).join(", "))));
        made.apps.add(a.id); mark();
        return { still_empty: get().apps.find(x => x.id === a.id)!.fields.filter(f => !f.value).map(f => f.label.en) };
      },
    },
    {
      name: "update_application",
      description: "Change an application's status and next step. Allowed statuses: draft, needs, ready, waiting, todo. It cannot mark anything filed or approved.",
      inputSchema: { type: "object", properties: { application_id: { type: "string" }, status: { type: "string", enum: ["draft", "needs", "ready", "waiting", "todo"] }, next_step: { type: "string" } }, required: ["application_id"] },
      execute(i) {
        const a = findApp(i.application_id);
        if (a.status === "approved" || a.status === "review") throw new Error("This one is already filed; only the agency can change it.");
        const status = ["draft", "needs", "ready", "waiting", "todo"].includes(String(i.status)) ? (i.status as Status) : a.status;
        S("working", L(`Updating the ${nm(a)}`, `更新${nm(a)}`));
        apply(setApp(a.id, { status, next: str(i.next_step) ? same(str(i.next_step, 200)) : a.next }));
        made.apps.add(a.id); mark();
        return { ok: true };
      },
    },
    {
      name: "request_filing_approval",
      description: "Put a filing in front of the person: they see the exact data, attachments and fee and approve in the app. You never file yourself. Call it once the application's fields are filled.",
      inputSchema: { type: "object", properties: { application_id: { type: "string" }, what_happens: { type: "array", items: { type: "string" }, description: "The exact steps you will take once approved, in order" } }, required: ["application_id"] },
      execute(i) {
        const a = findApp(i.application_id);
        if (a.status === "approved" || a.status === "review") throw new Error("Already filed.");
        const existing = get().approvals.find(x => x.app === a.id && x.kind === "file");
        if (existing) { made.approvals.push(existing.id); return { approval_id: existing.id, note: "Already waiting for approval" }; }
        const fee = a.fees.reduce((s, f) => s + f.amount, 0);
        const does = arr(i.what_happens).map(s => same(str(s, 200))).filter(s => s.en);
        const site = a.source.label || a.agency.en;
        const ap: Approval = {
          id: "ap-" + a.id, kind: "file", app: a.id, title: L(`File the ${nm(a)}`, `提交${nm(a)}`), agency: a.agency, action: B("Approve & file", "批准并提交"),
          does: account ? [
            L("Placetta's filing team checks it against the agency's current requirements", "快哉申报团队对照机构现行要求逐项核对"),
            L(`They submit the application below on ${site}, with its attachments`, `在 ${site} 上提交下方申请及附件`),
            ...(fee ? [L(`The agency's fee (about $${fee}) is paid by you directly to the agency, through the payment link we send`, `机构费用（约 $${fee}）由您通过我们发送的付款链接直接支付给机构`)] : []),
            L("The receipt and every status change appear here", "收据和每次状态变化都会显示在这里"),
          ] : does.length ? does : [L(`Submit the application below to ${a.agency.en}`, `向${a.agency.zh}提交下方申请`), ...(fee ? [L(`Pay $${fee} with the card ending 4821`, `使用尾号 4821 的银行卡支付 $${fee}`)] : []), L("Save the receipt to Documents", "将收据保存到文件")],
        };
        S("composing", L(`Asking for your approval to file the ${nm(a)}`, `请您批准提交${nm(a)}`));
        apply(w => audit("agent", L("Asked for approval", "请求批准"), a.name, fee ? same(`$${fee}`) : undefined)(setApp(a.id, { status: "ready", next: L("Ready to file. Waiting for your approval", "可以提交，等待您批准") })(addApproval(ap)(w))));
        made.approvals.push(ap.id); made.apps.add(a.id); mark();
        return { approval_id: ap.id };
      },
    },
    {
      name: "draft_message",
      description: "Draft a text or email to someone (staff, landlord, contractor) for the person to approve. You never send it yourself.",
      inputSchema: { type: "object", properties: { to: { type: "string" }, message: { type: "string" }, title: { type: "string", description: "Short summary, e.g. 'Ask the landlord for a consent letter'" } }, required: ["to", "message"] },
      execute(i) {
        const to = str(i.to, 160), message = str(i.message, 1200);
        if (!to || !message) throw new Error("to and message are required");
        const id = "ap-msg-" + seq++;
        S("composing", L(`Drafting a message to ${to}`, `起草发给 ${to} 的消息`));
        apply(w => audit("agent", L("Drafted message", "起草消息"), same(to))(addApproval({
          id, kind: "send", title: same(str(i.title, 120) || (lang === "zh" ? `发消息给 ${to}` : `Message to ${to}`)), action: B("Approve & send", "批准并发送"),
          does: [L("Send the message below once you approve", "您批准后发送下方消息")],
          data: [{ id: "to", label: L("To", "收件人"), value: to }, { id: "msg", label: L("Message", "内容"), value: message }],
        })(w)));
        made.approvals.push(id); mark();
        return { approval_id: id };
      },
    },
    {
      name: "add_deadline",
      description: "Add a due date, renewal or agency estimate to Deadlines so Placetta reminds the person.",
      inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" }, title: { type: "string" }, agency: { type: "string" }, kind: { type: "string", enum: ["due", "renewal", "estimate"] }, application_id: { type: "string" } }, required: ["date", "title"] },
      execute(i) {
        const date = str(i.date, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
        const title = str(i.title, 160);
        S("connecting", L(`Adding a deadline: ${title}`, `添加截止日期：${title}`));
        apply(w => audit("agent", L("Added deadline", "添加截止日期"), same(title), same(date))(addDeadline({ id: "dl-x-" + seq++, date, title: same(title), agency: str(i.agency) ? same(str(i.agency, 120)) : undefined, kind: (["due", "renewal", "estimate"].includes(String(i.kind)) ? i.kind : "due") as "due", app: str(i.application_id) || undefined })(w)));
        mark();
        return { ok: true };
      },
    },
    {
      name: "remember",
      description: "Commit a fact the person told you to the workspace Context, so later applications use it.",
      inputSchema: { type: "object", properties: { label: { type: "string" }, value: { type: "string" }, group: { type: "string", enum: ["business", "location", "operations"] } }, required: ["label", "value"] },
      execute(i) {
        const label = str(i.label, 80), value = str(i.value, 200);
        if (!label || !value) throw new Error("label and value are required");
        const group = (["business", "location", "operations"].includes(String(i.group)) ? i.group : "operations") as FactGroup;
        const existing = get().facts.find(f => f.label.en.toLowerCase() === label.toLowerCase() || f.label.zh === label);
        S("weaving", L(`Committing to memory: ${label}`, `存入记忆：${label}`));
        const text = same(`${label}: ${value}`);
        apply(w => audit("agent", L("Committed to memory", "存入记忆"), L("Context", "资料"), text)(setFact({ id: existing?.id ?? "f-x-" + seq++, group: existing?.group ?? group, label: existing?.label ?? same(label), value: same(value), source: L("You told me", "您告诉我的") })(w)));
        made.memory.push(text); mark();
        return { ok: true };
      },
    },
    {
      name: "add_store",
      description: "Add a store (location) to the workspace so Placetta tracks its licenses and, once open, its daily readiness.",
      inputSchema: { type: "object", properties: {
        name: { type: "string", description: "Short name, e.g. 'Flushing, Main St'" }, address: { type: "string" },
        city: { type: "string" }, state: { type: "string", description: "Two-letter state code" },
        stage: { type: "string", enum: ["opening", "open"] }, planned_open: { type: "string", description: "YYYY-MM-DD" },
      }, required: ["name", "city", "state"] },
      execute(i) {
        const name = str(i.name, 80), city = str(i.city, 60), st = str(i.state, 2).toUpperCase();
        if (!name || !city) throw new Error("name and city are required");
        const nyc = st === "NY" && /^(new york|nyc|manhattan|brooklyn|queens|bronx|the bronx|staten island|flushing|astoria|long island city)$/i.test(city);
        const id = slug(name) + "-" + seq++;
        S("connecting", L(`Adding ${name}`, `添加${name}`));
        const planned = /^\d{4}-\d{2}-\d{2}$/.test(str(i.planned_open)) ? str(i.planned_open) : undefined;
        apply(w => audit("agent", L("Added a store", "添加门店"), same(name), same([str(i.address, 120), city, st].filter(Boolean).join(", ")))({
          ...w, stores: [...(w.stores ?? []), { id, name: same(name), address: [str(i.address, 120), city, st].filter(Boolean).join(", "), stage: i.stage === "open" ? "open" : "opening", plannedOpen: planned,
            rules: nyc ? ["nyc_grades", "nyc_fww"] : [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: [] }],
          locations: w.locations.some(l => l.name.en.toLowerCase() === city.toLowerCase()) ? w.locations : [...w.locations, { id: slug(city), name: same(city), county: same(st), state: "active" }],
        }));
        mark();
        return { store_id: id, nyc_rules: nyc };
      },
    },
    {
      name: "show_licenses",
      description: "Show a list of the licenses a business needs in a place, in the Find licenses view. Use when the person asks what they need somewhere.",
      inputSchema: { type: "object", properties: {
        business: { type: "string" }, location: { type: "string" },
        licenses: { type: "array", items: { type: "object", properties: { name: { type: "string" }, agency: { type: "string" }, level: { type: "string", enum: LEVELS }, fee: { type: "string" }, timeline: { type: "string" }, url: { type: "string" } }, required: ["name", "agency", "level"] } },
      }, required: ["business", "location", "licenses"] },
      execute(i) {
        const business = str(i.business, 80), location = str(i.location, 80);
        S("searching", L(`Listing licenses for ${business} in ${location}`, `列出${location}${business}所需许可`));
        const hits = toHits(arr(i.licenses), get());
        made.matches = { what: business, where: location, hits }; mark();
        return { shown: hits.length };
      },
    },
  ];
}

/** Model output to license rows, matched against what's already in the workspace. */
export function toHits(list: unknown[], w: Workspace): LicenseHit[] {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿 ]/g, " ").split(/\s+/).filter(x => x.length > 3 || /[一-鿿]/.test(x));
  return list.slice(0, 20).map(x => {
    const o = x as Record<string, unknown>;
    const name = str(o.name, 120), url = okUrl(str(o.url, 200));
    const nw = words(name);
    const have = w.apps.find(a => { const aw = words(a.name.en + " " + a.name.zh); return nw.length > 0 && nw.filter(t => aw.includes(t)).length >= Math.min(2, nw.length); })?.id;
    return {
      name: same(name), agency: same(str(o.agency, 160)), level: (LEVELS.includes(o.level as Level) ? o.level : "state") as Level,
      fee: same(str(o.fee, 60) || "?"), est: same(str(o.timeline, 120) || "?"), source: { label: domainOf(url), url }, have,
    };
  }).filter(h => h.name.en);
}

/* ------------------------------- the runner -------------------------------- */

const READABLE_TEXT = /\.(txt|csv|md|json|tsv)$/i;
const READABLE_IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const READABLE_PDF = /\.pdf$/i;
/** Keeps the request well under the server's limit once base64-encoded. */
const PDF_MAX = 4_500_000;

/** Plain, sharp prose: no bold markers, and never an em dash. */
export const clean = (s: string) => s.replace(/\*\*/g, "").replace(/\s*\u2014\s*/g, ", ").replace(/,\s*,/g, ",").trim();
const official = (url: string) => { const h = domainOf(url); return /\.(gov|mil|us)$/.test(h) || /^(sccgov\.org|acgov\.org|sfgov\.org|nyc\.gov)$/.test(h); };

/** An AgentBackend driven by a real model. Approvals and sample uploads still run the deterministic flows.
 *  `account`: a signed-in workspace (real filings by the team). `paths`: stored files by name, for uploads. */
export function liveAgent(model: Model, history: Turn[], files: Map<string, File>, deep: boolean, o: { account?: boolean; paths?: Map<string, string> } = {}): AgentBackend {
  return {
    async run(req: Request, ctx, onEvent: (e: AgentEvent) => void, signal) {
      let ws = ctx.current;
      const apply = (p: (w: Workspace) => Workspace) => { ws = p(ws); onEvent({ type: "update", patch: p }); };
      let index = 0;
      const step = (s: Step) => onEvent({ type: "step", index: index++, step: s });
      const lang = ctx.lang;

      if ("text" in req) {
        let streamed = "";
        const made: Made = { apps: new Set(), approvals: [], memory: [], lastToolAt: 0 };
        step({ state: "searching", label: B("Reading your workspace", "读取您的工作区") });
        const tools = model.tools ? makeTools(() => ws, apply, step, made, lang, () => streamed.length, !!o.account) : undefined;
        const research = model.kind === "server";
        const brief = rules(ws, lang, !!o.account, research);
        const turns: Turn[] = [...(model.system ? [] : [{ role: "user" as const, content: brief }]), ...history.slice(-12), { role: "user", content: req.text }];
        let sources: Source[] = [];
        const text = await model.chat(turns, {
          tools, signal, deep, system: model.system ? brief : undefined,
          onText: t => { streamed = t; onEvent({ type: "draft", text: clean(t.slice(made.lastToolAt)) }); },
          onSources: s => { sources = s; },
        });
        const final = clean(text.slice(made.lastToolAt).trim() || text.trim());
        // cite agency pages first; keep at most four
        const cited = [...sources.filter(x => official(x.url)), ...sources.filter(x => !official(x.url))].slice(0, 4);
        onEvent({ type: "reply", reply: { text: [same(final)], apps: [...made.apps].slice(0, 3), approvals: made.approvals, memory: made.memory, matches: made.matches, sources: cited.length ? cited : undefined } });
        return;
      }

      if ("match" in req) {
        const { what, where } = req.match;
        step({ state: "weaving", label: B(`Working out what a ${what.toLowerCase()} needs`, `分析${what}需要哪些许可`) });
        step({ state: "searching", label: B(`Listing licenses in ${where}, from the city to the federal level`, `列出${where}从市级到联邦的许可`) });
        const list = await model.json<unknown[]>(`List the business licenses, permits and registrations a "${what}" needs to open and operate in "${where}", from the city up to the federal government.
Reply with only a JSON array. Each item: {"name": string, "agency": string, "level": "federal"|"state"|"county"|"city", "fee": string (typical fee in USD, or "Varies"), "timeline": string (typical processing time), "url": string (the agency's official home page, https, root domain; "" if unsure)}.
Write name, agency, fee and timeline in ${LANG[lang]}. Include only items that commonly apply, at most 14.`, { signal, deep: true });
        const hits = toHits(Array.isArray(list) ? list : [], ws);
        step({ state: "connecting", label: B("Comparing with your workspace", "与您的工作区比对") });
        const have = hits.filter(h => h.have).length;
        onEvent({ type: "reply", reply: {
          text: [B(`I found ${hits.length} licenses a ${what.toLowerCase()} usually needs in ${where}${have ? `; ${have} ${have === 1 ? "is" : "are"} already in your workspace` : ""}. Fees and timelines are estimates, so confirm each with its agency.`,
            `${where}的${what}通常需要 ${hits.length} 项许可${have ? `，其中 ${have} 项已在您的工作区` : ""}。费用和时间均为估算，请向各机构确认。`)],
          matches: { what, where, hits },
        } });
        return;
      }

      if ("upload" in req) {
        const app = ws.apps.find(a => a.id === req.upload.app);
        const real = req.upload.files.map(f => files.get(f.name)).filter((f): f is File => !!f);
        if (!app || !real.length) return demoAgent.run(req, ctx, onEvent, signal);
        const f = real[0], item = app.checklist.find(c => c.id === req.upload.item);
        const did = `d-up-${app.id}-${req.upload.item}-${Date.now().toString(36)}`;
        step({ state: "shaping", label: B(`Reading ${f.name}`, `读取 ${f.name}`) });
        apply(w => audit("you", B("Uploaded", "上传"), same(f.name), app.name)(addDoc({ id: did, name: f.name, kind: (f.name.split(".").pop()?.toLowerCase() ?? "pdf") as Doc["kind"], size: f.size, by: "you", at: nowIso(), app: app.id, tag: B("Uploaded", "已上传"), path: o.paths?.get(f.name) })(w)));
        const canImage = READABLE_IMAGE.test(f.name) && model.images, canText = READABLE_TEXT.test(f.name);
        const canPdf = READABLE_PDF.test(f.name) && model.pdfs && f.size <= PDF_MAX;
        if (!canImage && !canText && !canPdf) {
          apply(setCheck(app.id, req.upload.item, { state: "done", doc: did }));
          const big = READABLE_PDF.test(f.name) && model.pdfs;
          onEvent({ type: "reply", reply: { text: [big
            ? B(`Added ${f.name} to the checklist. It's over 4.5 MB, too large for me to read, so check the fields on the Application tab.`, `已将 ${f.name} 加入清单。文件超过 4.5 MB，无法读取，请在“申请表”中核对各项内容。`)
            : B(`Added ${f.name} to the checklist. I can't read this file type here, so check the fields on the Application tab.`, `已将 ${f.name} 加入清单。这里无法读取此类文件，请在“申请表”中核对各项内容。`)], apps: [app.id] } });
          return;
        }
        step({ state: "weaving", label: B("Pulling out what the application needs", "提取申请所需信息") });
        const labels = app.fields.map(x => x.label[lang]);
        const body = canText ? (await f.text()).slice(0, 12000) : "";
        const out = await model.json<{ fields?: { label: string; value: string }[]; facts?: { label: string; value: string }[] }>(
          `This document was uploaded for "${item?.label[lang] ?? ""}" on the application "${app.name[lang]}". The application's fields are: ${JSON.stringify(labels)}.
Read it and reply with only JSON: {"fields": [{"label": one of the field labels, "value": string}], "facts": [{"label": string, "value": string}]}: the fields it fills, and up to 5 other key facts (dates, numbers, names). Only what the document actually says; no guesses. Write values as they appear.${canText ? "\n\nDocument:\n" + body : ""}`,
          { signal, images: canImage ? [f] : undefined, pdfs: canPdf ? [f] : undefined });
        const fields = arr(out?.fields).map(x => x as { label: string; value: string }).filter(x => labels.includes(String(x.label)) && str(x.value));
        const facts = arr(out?.facts).map(x => x as { label: string; value: string }).filter(x => str(x.label) && str(x.value)).slice(0, 5);
        apply(w => ({ ...w, apps: w.apps.map(a => (a.id !== app.id ? a : { ...a, fields: a.fields.map(fl => { const hit = fields.find(x => x.label === fl.label[lang]); return hit ? { ...fl, value: str(hit.value, 200), from: same(lang === "zh" ? `来自 ${f.name}` : `From ${f.name}`) } : fl; }) })) }));
        apply(setCheck(app.id, req.upload.item, { state: "done", doc: did, extracted: [...fields, ...facts].slice(0, 6).map(x => [same(str(x.label, 60)), str(x.value, 120)] as [Bi, string]) }));
        apply(audit("agent", B("Extracted data", "提取信息"), same(f.name), same([...fields, ...facts].map(x => x.label).join(", ") || "-")));
        onEvent({ type: "reply", reply: { text: [fields.length
          ? B(`I read ${f.name} and filled ${fields.length} field${fields.length === 1 ? "" : "s"} on the ${app.name.en.toLowerCase()}.`, `我已读取 ${f.name}，并在${app.name.zh}中填入 ${fields.length} 项。`)
          : B(`I read ${f.name}. It didn't hold any of the application's fields, so I added what it says to the checklist.`, `我已读取 ${f.name}。其中没有申请表所需的字段，已把读取到的信息加入清单。`)], apps: [app.id] } });
        return;
      }

      return demoAgent.run(req, ctx, onEvent, signal);
    },
  };
}
