/* Placetta's own MCP server, the tools (supabase/functions/mcp/ serves them; scripts/build-agent.mjs bundles this file
   into supabase/functions/mcp/tools.js). Read only: each tool reads one workspace, the one the caller's token belongs
   to, which the server looks up from the token and never from the arguments. Nothing here writes, files, pays or sends.
   Pure: the workspace, its filings and today's date come in; plain JSON goes out. */

import type { Workspace, Status, Store } from "./model";
import { readiness } from "./stores.ts";
import { previewPlan, stateOf } from "./plan/preview";
import { normalizeState } from "./core";

export type Scope = "status" | "deadlines" | "readiness" | "plan" | "filings";
export const SCOPES: Scope[] = ["status", "deadlines", "readiness", "plan", "filings"];
export type Lang = "en" | "zh";
export type FilingRow = { app_id: string; title: { en?: string; zh?: string } | null; agency: { en?: string; zh?: string } | null; status: string; confirmation_number: string | null; submitted_at: string | null; decided_at: string | null; updated_at: string };

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const lang = { type: "string", enum: ["en", "zh"], description: "Language of names and notes: en (default) or zh" };
const store = { type: "string", description: "A store's id from compliance_status. Leave out for every store." };
const cursor = { type: "string", maxLength: 40, description: "next_cursor from the previous page, for the next 50" };
/* What each tool returns (outputSchema): loose on purpose, so the shape is documented and checkable without a client
   rejecting a field added later. An error result carries { error: { code, message } } instead. */
const obj = (props: Record<string, unknown>) => ({ type: "object", properties: props });
const arr = { type: "array", items: { type: "object" } };
const OUT: Record<string, unknown> = {
  compliance_status: obj({ business: { type: "string" }, as_of: { type: "string" }, stores: arr }),
  upcoming_deadlines: obj({ as_of: { type: "string" }, days: { type: "integer" }, total: { type: "integer" }, deadlines: arr, next_cursor: { type: "string" } }),
  store_readiness: obj({ as_of: { type: "string" }, stores: arr }),
  plan_preview: obj({ business: { type: "string" }, place: { type: "string" }, total_known_fees_usd: { type: "number" }, fees_that_vary: { type: "boolean" }, permits: arr, note: { type: "string" } }),
  filing_status: obj({ as_of: { type: "string" }, which: { type: "string" }, total: { type: "integer" }, filings: arr, next_cursor: { type: "string" } }),
};

export const TOOLS = [
  { name: "compliance_status", scope: "status" as Scope, title: "Compliance status by store",
    description: "Where every license and permit stands for each store (or one store): how many are approved, with the agency, being filed, or waiting on the business, and the open items with their next step.",
    inputSchema: { type: "object", properties: { store_id: store, lang }, additionalProperties: false } },
  { name: "upcoming_deadlines", scope: "deadlines" as Scope, title: "Upcoming deadlines",
    description: "Filing dates, renewals and other compliance deadlines in the next N days (default 60), soonest first, with the store each belongs to.",
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 365, description: "How many days ahead (1 to 365, default 60)" }, store_id: store, cursor, lang }, additionalProperties: false } },
  { name: "store_readiness", scope: "readiness" as Scope, title: "Store readiness",
    description: "A 0 to 100 readiness score per store: ready to open for stores still opening (permits approved), inspection ready for open stores (permits current, daily logs, staff certificates, schedules, mock inspection), with each part.",
    inputSchema: { type: "object", properties: { store_id: store, lang }, additionalProperties: false } },
  { name: "plan_preview", scope: "plan" as Scope, title: "Permit plan preview",
    description: "The licenses and permits a kind of business usually needs in a US city, from Placetta's registry of official sources: agency, level, fees and typical time, each with its source. A preview to check against the agency, not legal advice.",
    inputSchema: { type: "object", properties: { business: { type: "string", maxLength: 120, description: "What the business is, e.g. 'bubble tea shop'" }, place: { type: "string", maxLength: 120, description: "City and state, e.g. 'Flushing, NY'" }, opening: { type: "string", description: "Planned opening date, YYYY-MM-DD (optional)" }, lang }, required: ["business", "place"], additionalProperties: false } },
  { name: "filing_status", scope: "filings" as Scope, title: "Filing status",
    description: "The filings Placetta's team submits for the business: status (requested, in progress, submitted, accepted, needs info, rejected), confirmation numbers and dates. open: only filings not yet decided (default); all: every filing.",
    inputSchema: { type: "object", properties: { which: { type: "string", enum: ["open", "all"] }, store_id: store, cursor, lang }, additionalProperties: false } },
// securitySchemes: ChatGPT apps read it per tool to show the sign-in and the scope asked for
// (https://developers.openai.com/apps-sdk/build/auth); every tool needs the OAuth scope of its own name
].map(t => ({ ...t, outputSchema: OUT[t.name], annotations: { ...READ, title: t.title }, securitySchemes: [{ type: "oauth2" as const, scopes: [t.scope] }] }));

/** A tool or resource error the caller can fix. code is stable for clients (Stripe and Linear style): not_found,
 *  invalid_arguments, invalid_cursor. */
export class ToolError extends Error {
  code: string;
  constructor(message: string, code = "invalid_arguments") { super(message); this.code = code; }
}

/* ------------------------------ pagination ------------------------------ */
// Opaque cursors (MCP pagination: clients never parse them; an invalid one is -32602). An offset, base64url-encoded.
export const PAGE = 50;
export const cursorOf = (offset: number) => btoa(`o:${offset}`).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
export function offsetOf(cursor: unknown): number {
  if (cursor === undefined || cursor === null) return 0;
  if (typeof cursor !== "string" || cursor.length > 40) throw new ToolError("That cursor isn't one this server gave out. Start again without a cursor.", "invalid_cursor");
  let raw = "";
  try { raw = atob(cursor.replace(/-/g, "+").replace(/_/g, "/")); } catch { raw = ""; }
  const m = /^o:(\d{1,6})$/.exec(raw);
  if (!m) throw new ToolError("That cursor isn't one this server gave out. Start again without a cursor.", "invalid_cursor");
  return Number(m[1]);
}
/** One page of a list, and the cursor for the next page when there is one. */
export function page<T>(list: T[], cursor: unknown, size = PAGE): { items: T[]; next?: string } {
  const at = offsetOf(cursor);
  const items = list.slice(at, at + size);
  return at + size < list.length ? { items, next: cursorOf(at + size) } : { items };
}

const day = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");
const daysBetween = (from: string, to: string) => Math.round((day(to) - day(from)) / 864e5);
const WAITING_ON: Record<Status, string> = { approved: "done", review: "agency", filing: "placetta_team", ready: "business_approval", needs: "business", draft: "placetta", waiting: "someone_else", todo: "placetta" };
const OPEN = new Set(["requested", "in_progress", "submitted", "needs_info"]);

function pickStore(w: Workspace, id: unknown): Store[] {
  const stores = w.stores ?? [];
  if (id === undefined || id === null || id === "") return stores;
  const s = stores.find(x => x.id === id);
  if (!s) throw new ToolError(`No store with id "${String(id).slice(0, 60)}" in this workspace. compliance_status lists the store ids.`, "not_found");
  return [s];
}
const storeFor = (w: Workspace, appId?: string) => (appId ? (w.stores ?? []).find(s => (s.apps ?? []).includes(appId)) : undefined);

/** Runs one tool on the caller's workspace. Unknown arguments are refused (a workspace id among them: the token
 *  decides the workspace). */
export function runMcpTool(name: string, args: Record<string, unknown>, ctx: { workspace: { name: string; state: unknown }; filings: FilingRow[]; today: string }): unknown {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) throw new ToolError(`No tool named ${name}.`, "unknown_tool");
  const allowed = Object.keys(tool.inputSchema.properties);
  const extra = Object.keys(args).filter(k => !allowed.includes(k));
  if (extra.length) throw new ToolError(`${name} doesn't take ${extra.join(", ")}.${extra.some(k => /workspace|tenant|org/i.test(k)) ? " The workspace is the one your token belongs to." : ""}`);
  const L: Lang = args.lang === "zh" ? "zh" : "en";
  const t = (b: { en?: string; zh?: string } | null | undefined) => (b ? b[L] || b.en || "" : "");
  const w = normalizeState(ctx.workspace.name, (ctx.workspace.state ?? {}) as Partial<Workspace>);
  const today = ctx.today.slice(0, 10);

  if (name === "plan_preview") {
    const business = String(args.business ?? "").trim().slice(0, 120), place = String(args.place ?? "").trim().slice(0, 120);
    if (!business || !place) throw new ToolError("business and place are required.");
    if (!stateOf(place)) throw new ToolError(`Couldn't tell the US state from "${place}". Give a city and state, e.g. "Flushing, NY".`);
    const opening = typeof args.opening === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.opening) ? args.opening : undefined;
    const p = previewPlan(business, place, opening, { today });
    return {
      business, place, total_known_fees_usd: p.fees, fees_that_vary: p.varies,
      permits: p.apps.map(a => ({ name: t(a.name), agency: t(a.agency), level: a.level, fees: a.fees.map(f => ({ label: t(f.label), usd: f.tbd ? null : f.amount })), typical_time: t(a.est), source: a.source })),
      note: L === "zh" ? "这是根据官方来源整理的预览，请以机构的要求为准，并非法律意见。" : "A preview from official sources; check it against the agency. Not legal advice.",
    };
  }

  if (name === "compliance_status") {
    const stores = pickStore(w, args.store_id);
    const view = (apps: typeof w.apps) => {
      const count = (s: Status[]) => apps.filter(a => s.includes(a.status)).length;
      return {
        permits: apps.length, approved: count(["approved"]), with_agency: count(["review"]), being_filed: count(["filing"]), ready_for_approval: count(["ready"]),
        waiting_on_business: count(["needs"]), in_preparation: count(["draft", "todo", "waiting"]),
        open_items: apps.filter(a => a.status !== "approved").slice(0, 25).map(a => ({ application_id: a.id, name: t(a.name), agency: t(a.agency), status: a.status, waiting_on: WAITING_ON[a.status], next_step: t(a.next) || undefined })),
      };
    };
    const out: Record<string, unknown>[] = stores.map(s => ({ store_id: s.id, name: t(s.name), address: s.address, stage: s.stage, ...view(w.apps.filter(a => (s.apps ?? []).includes(a.id))) }));
    if (args.store_id === undefined) {
      const loose = w.apps.filter(a => !storeFor(w, a.id));
      if (loose.length || !stores.length) out.push({ store_id: null, name: L === "zh" ? "整个企业" : "Whole business", ...view(loose) });
    }
    return { business: t(w.business) || ctx.workspace.name, as_of: today, stores: out };
  }

  if (name === "upcoming_deadlines") {
    const days = args.days === undefined ? 60 : Number(args.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new ToolError("days must be a whole number from 1 to 365.");
    const only = args.store_id === undefined ? null : pickStore(w, args.store_id)[0];
    const list = (w.deadlines ?? [])
      .map(d => ({ d, left: daysBetween(today, d.date), s: storeFor(w, d.app) }))
      .filter(x => x.left >= 0 && x.left <= days && (!only || x.s?.id === only.id))
      .sort((a, b) => a.left - b.left)
      .map(({ d, left, s }) => ({ date: d.date.slice(0, 10), days_left: left, kind: d.kind, title: t(d.title), agency: t(d.agency) || undefined, application_id: d.app, store_id: s?.id ?? null, store: s ? t(s.name) : undefined }));
    const p = page(list, args.cursor);
    return { as_of: today, days, total: list.length, deadlines: p.items, ...(p.next ? { next_cursor: p.next } : {}) };
  }

  if (name === "store_readiness") {
    const stores = pickStore(w, args.store_id);
    return { as_of: today, stores: stores.map(s => { const r = readiness(s, w); return { store_id: s.id, name: t(s.name), stage: s.stage, score: r.score, band: r.band, measures: t(r.label), parts: r.parts.map(p => ({ part: t(p.label), got: Math.round(p.got * 10) / 10, of: p.max, note: t(p.note) })) }; }) };
  }

  // filing_status
  const which = args.which === "all" ? "all" : "open";
  const only = args.store_id === undefined ? null : pickStore(w, args.store_id)[0];
  const rows = ctx.filings
    .filter(f => f.status !== "canceled" && (which === "all" || OPEN.has(f.status)) && (!only || (only.apps ?? []).includes(f.app_id)))
    .map(f => { const s = storeFor(w, f.app_id); return { application_id: f.app_id, title: t(f.title), agency: t(f.agency) || undefined, status: f.status, confirmation_number: f.confirmation_number, submitted_at: f.submitted_at, decided_at: f.decided_at, updated_at: f.updated_at, store_id: s?.id ?? null }; });
  const p = page(rows, args.cursor);
  return { as_of: today, which, total: rows.length, filings: p.items, ...(p.next ? { next_cursor: p.next } : {}) };
}

/* ------------------------------ resources ------------------------------ */
// Things an assistant can attach as context without a tool call (MCP resources; Claude lets a person @-mention them,
// the way GitHub's server offers repository files): the whole business's compliance status, each store's, the
// deadlines ahead and the open filings. Read only, built from the same tools, so a resource and its tool always agree.

export type McpResource = { uri: string; name: string; title: string; description: string; mimeType: "application/json"; scope: Scope };
type Ctx = { workspace: { name: string; state: unknown }; filings: FilingRow[]; today: string };
const STORE_URI = /^placetta:\/\/stores\/([^/]{1,80})\/(status|readiness)$/;

export const RESOURCE_TEMPLATES = [
  { uriTemplate: "placetta://stores/{store_id}/status", name: "store_status", title: "One store's compliance status", description: "Where each license and permit stands for one store, with its open items and next steps. Store ids come from placetta://status.", mimeType: "application/json", scope: "status" as Scope },
  { uriTemplate: "placetta://stores/{store_id}/readiness", name: "store_readiness", title: "One store's readiness", description: "A store's 0 to 100 ready-to-open or inspection-ready score, with each part.", mimeType: "application/json", scope: "readiness" as Scope },
];

/** The resources this workspace has: the fixed ones, then one per store. */
export function listResources(ctx: Ctx): McpResource[] {
  const w = normalizeState(ctx.workspace.name, (ctx.workspace.state ?? {}) as Partial<Workspace>);
  const fixed: McpResource[] = [
    { uri: "placetta://status", name: "status", title: "Compliance status, every store", description: "Every store's licenses and permits by status, with the open items.", mimeType: "application/json", scope: "status" },
    { uri: "placetta://deadlines", name: "deadlines", title: "Deadlines in the next 60 days", description: "Filing dates and renewals in the next 60 days, soonest first.", mimeType: "application/json", scope: "deadlines" },
    { uri: "placetta://filings/open", name: "open_filings", title: "Open filings", description: "Filings submitted or in progress and not yet decided.", mimeType: "application/json", scope: "filings" },
  ];
  return [...fixed, ...(w.stores ?? []).map(s => ({ uri: `placetta://stores/${encodeURIComponent(s.id)}/status`, name: `store_${s.id}`.slice(0, 90), title: `${s.name.en || s.id}: compliance status`, description: `${s.address || s.name.en || s.id}: licenses and permits by status, with the open items.`, mimeType: "application/json" as const, scope: "status" as Scope }))];
}

/** Which scope a resource address needs, or null when it isn't one of Placetta's. */
export function resourceScope(uri: string): Scope | null {
  const m = STORE_URI.exec(uri);
  if (m) return m[2] === "readiness" ? "readiness" : "status";
  if (uri === "placetta://status") return "status";
  if (uri === "placetta://deadlines") return "deadlines";
  if (uri === "placetta://filings/open") return "filings";
  return null;
}

/** A resource's contents: the matching tool's answer, as JSON. */
export function readResource(uri: string, ctx: Ctx): { uri: string; mimeType: "application/json"; text: string } {
  const m = STORE_URI.exec(uri);
  let out: unknown;
  if (uri === "placetta://status") out = runMcpTool("compliance_status", {}, ctx);
  else if (m) out = runMcpTool(m[2] === "readiness" ? "store_readiness" : "compliance_status", { store_id: decodeURIComponent(m[1]) }, ctx);
  else if (uri === "placetta://deadlines") out = runMcpTool("upcoming_deadlines", {}, ctx);
  else if (uri === "placetta://filings/open") out = runMcpTool("filing_status", { which: "open" }, ctx);
  else throw new ToolError(`No resource at ${uri.slice(0, 80)}. resources/list has the addresses.`, "not_found");
  return { uri, mimeType: "application/json", text: JSON.stringify(out) };
}

/* ------------------------------ prompts ------------------------------ */
// Ready-made requests a person picks from the assistant's menu (MCP prompts; Claude shows them as slash commands):
// the request in the person's words with the data it needs already attached, so it works in one turn.

export type McpPrompt = { name: string; title: string; description: string; arguments: { name: string; description: string; required?: boolean }[]; scopes: Scope[] };
export const PROMPTS: McpPrompt[] = [
  { name: "renewal_checklist", title: "Prepare my renewal checklist", description: "A checklist of every renewal and filing due soon, store by store, with what to gather for each.",
    arguments: [{ name: "days", description: "How many days ahead, 1 to 365 (default 90)" }, { name: "store_id", description: "One store's id, or leave out for every store" }, { name: "lang", description: "en or zh" }], scopes: ["deadlines", "status"] },
  { name: "weekly_brief", title: "What needs me this week", description: "The deadlines in the next 7 days and the items waiting on the business, most urgent first.",
    arguments: [{ name: "lang", description: "en or zh" }], scopes: ["deadlines", "status"] },
  { name: "opening_readiness", title: "Am I ready to open?", description: "A store's readiness score and what's left before opening or the next inspection.",
    arguments: [{ name: "store_id", description: "The store's id (placetta://status lists them)", required: true }, { name: "lang", description: "en or zh" }], scopes: ["readiness", "status"] },
];

const embed = (uri: string, data: unknown) => ({ role: "user" as const, content: { type: "resource" as const, resource: { uri, mimeType: "application/json", text: JSON.stringify(data) } } });
const ask = (text: string) => ({ role: "user" as const, content: { type: "text" as const, text } });

/** A prompt's messages, with the data attached. Arguments come as strings (MCP prompts); a bad one is a ToolError. */
export function getPrompt(name: string, raw: Record<string, unknown>, ctx: Ctx): { description: string; messages: unknown[] } {
  const p = PROMPTS.find(x => x.name === name);
  if (!p) throw new ToolError(`No prompt named ${name.slice(0, 60)}.`, "not_found");
  const extra = Object.keys(raw).filter(k => !p.arguments.some(a => a.name === k));
  if (extra.length) throw new ToolError(`${name} doesn't take ${extra.join(", ")}.`);
  const lang = raw.lang === "zh" ? "zh" : "en", zh = lang === "zh";
  const store = typeof raw.store_id === "string" && raw.store_id ? raw.store_id : undefined;
  const sc = store ? { store_id: store } : {};
  if (name === "renewal_checklist") {
    const days = raw.days === undefined || raw.days === "" ? 90 : Number(raw.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new ToolError("days must be a whole number from 1 to 365.");
    const dl = runMcpTool("upcoming_deadlines", { days, lang, ...sc }, ctx), st = runMcpTool("compliance_status", { lang, ...sc }, ctx);
    return { description: p.title, messages: [
      ask(zh ? `请根据下面附上的 Placetta 数据，为我准备未来 ${days} 天的续期清单：按门店分组，按日期排序，每项写明截止日期、机构、需要准备的材料和下一步。只用附上的数据，不要猜测。`
        : `Prepare my renewal checklist for the next ${days} days from the Placetta data attached: grouped by store, soonest first, each with its due date, the agency, what to gather and the next step. Use only the attached data; don't guess.`),
      embed("placetta://deadlines", dl), embed(store ? `placetta://stores/${encodeURIComponent(store)}/status` : "placetta://status", st)] };
  }
  if (name === "weekly_brief") {
    const dl = runMcpTool("upcoming_deadlines", { days: 7, lang }, ctx), st = runMcpTool("compliance_status", { lang }, ctx);
    return { description: p.title, messages: [
      ask(zh ? "根据附上的 Placetta 数据，告诉我这周需要我处理的事：未来 7 天的截止日期，以及等待我们处理的事项，最紧急的放前面。简短直接。"
        : "From the Placetta data attached, tell me what needs me this week: deadlines in the next 7 days and the items waiting on the business, most urgent first. Short and direct."),
      embed("placetta://deadlines", dl), embed("placetta://status", st)] };
  }
  // opening_readiness
  if (!store) throw new ToolError("store_id is required. placetta://status lists the store ids.");
  const rd = runMcpTool("store_readiness", { store_id: store, lang }, ctx), st = runMcpTool("compliance_status", { store_id: store, lang }, ctx);
  return { description: p.title, messages: [
    ask(zh ? "根据附上的 Placetta 数据，这家门店准备好开业（或迎接下次检查）了吗？给出分数，并列出还差什么、每项在等谁。"
      : "From the Placetta data attached, is this store ready to open (or for its next inspection)? Give the score and list what's left, with who it's waiting on."),
    embed(`placetta://stores/${encodeURIComponent(store)}/readiness`, rd), embed(`placetta://stores/${encodeURIComponent(store)}/status`, st)] };
}
