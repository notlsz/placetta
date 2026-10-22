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

export const TOOLS = [
  { name: "compliance_status", scope: "status" as Scope, title: "Compliance status by store",
    description: "Where every license and permit stands for each store (or one store): how many are approved, with the agency, being filed, or waiting on the business, and the open items with their next step.",
    inputSchema: { type: "object", properties: { store_id: store, lang }, additionalProperties: false } },
  { name: "upcoming_deadlines", scope: "deadlines" as Scope, title: "Upcoming deadlines",
    description: "Filing dates, renewals and other compliance deadlines in the next N days (default 60), soonest first, with the store each belongs to.",
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 365, description: "How many days ahead (1 to 365, default 60)" }, store_id: store, lang }, additionalProperties: false } },
  { name: "store_readiness", scope: "readiness" as Scope, title: "Store readiness",
    description: "A 0 to 100 readiness score per store: ready to open for stores still opening (permits approved), inspection ready for open stores (permits current, daily logs, staff certificates, schedules, mock inspection), with each part.",
    inputSchema: { type: "object", properties: { store_id: store, lang }, additionalProperties: false } },
  { name: "plan_preview", scope: "plan" as Scope, title: "Permit plan preview",
    description: "The licenses and permits a kind of business usually needs in a US city, from Placetta's registry of official sources: agency, level, fees and typical time, each with its source. A preview to check against the agency, not legal advice.",
    inputSchema: { type: "object", properties: { business: { type: "string", maxLength: 120, description: "What the business is, e.g. 'bubble tea shop'" }, place: { type: "string", maxLength: 120, description: "City and state, e.g. 'Flushing, NY'" }, opening: { type: "string", description: "Planned opening date, YYYY-MM-DD (optional)" }, lang }, required: ["business", "place"], additionalProperties: false } },
  { name: "filing_status", scope: "filings" as Scope, title: "Filing status",
    description: "The filings Placetta's team submits for the business: status (requested, in progress, submitted, accepted, needs info, rejected), confirmation numbers and dates. open: only filings not yet decided (default); all: every filing.",
    inputSchema: { type: "object", properties: { which: { type: "string", enum: ["open", "all"] }, store_id: store, lang }, additionalProperties: false } },
].map(t => ({ ...t, annotations: { ...READ, title: t.title } }));

export class ToolError extends Error {}

const day = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");
const daysBetween = (from: string, to: string) => Math.round((day(to) - day(from)) / 864e5);
const WAITING_ON: Record<Status, string> = { approved: "done", review: "agency", filing: "placetta_team", ready: "business_approval", needs: "business", draft: "placetta", waiting: "someone_else", todo: "placetta" };
const OPEN = new Set(["requested", "in_progress", "submitted", "needs_info"]);

function pickStore(w: Workspace, id: unknown): Store[] {
  const stores = w.stores ?? [];
  if (id === undefined || id === null || id === "") return stores;
  const s = stores.find(x => x.id === id);
  if (!s) throw new ToolError(`No store with id "${String(id).slice(0, 60)}" in this workspace. compliance_status lists the store ids.`);
  return [s];
}
const storeFor = (w: Workspace, appId?: string) => (appId ? (w.stores ?? []).find(s => (s.apps ?? []).includes(appId)) : undefined);

/** Runs one tool on the caller's workspace. Unknown arguments are refused (a workspace id among them: the token
 *  decides the workspace). */
export function runMcpTool(name: string, args: Record<string, unknown>, ctx: { workspace: { name: string; state: unknown }; filings: FilingRow[]; today: string }): unknown {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) throw new ToolError(`No tool named ${name}.`);
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
      .slice(0, 100)
      .map(({ d, left, s }) => ({ date: d.date.slice(0, 10), days_left: left, kind: d.kind, title: t(d.title), agency: t(d.agency) || undefined, application_id: d.app, store_id: s?.id ?? null, store: s ? t(s.name) : undefined }));
    return { as_of: today, days, deadlines: list };
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
    .slice(0, 100)
    .map(f => { const s = storeFor(w, f.app_id); return { application_id: f.app_id, title: t(f.title), agency: t(f.agency) || undefined, status: f.status, confirmation_number: f.confirmation_number, submitted_at: f.submitted_at, decided_at: f.decided_at, updated_at: f.updated_at, store_id: s?.id ?? null }; });
  return { as_of: today, which, filings: rows };
}
