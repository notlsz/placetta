import { B, type Bi } from "../bi";

/* ------------------------------------------------------------------ *
 * Agent memory: what Odelia keeps between conversations about the
 * business she works for, one short observation at a time.
 *
 * The principles, taken from the products that do this well and fixed
 * where they fall short:
 *   ChatGPT      every memory can be seen, edited and deleted; one
 *                switch turns memory off; a chat can be kept out of it;
 *                "remember this" and "forget this" work in chat; a
 *                warning shows before memory is full (nothing is
 *                dropped silently).
 *   Devin        the agent only suggests; an owner or admin approves;
 *                each item is scoped (workspace, brand, store, market,
 *                person).
 *   Grok, Muse   personalization is opt-in and disclosed. Memory is
 *                off until an owner or admin turns it on.
 *   Claude Code  a human-readable brief per brand and per store,
 *                always loaded first; Odelia proposes edits; facts are
 *                flushed into proposals before old turns are folded.
 *   Claude       topic files with one-line descriptions, search across
 *                past conversations with links, project scoping.
 *   Mem0 / Zep   extract, then add, merge, supersede or delete; every
 *                fact has valid-from and valid-to dates, so a changed
 *                fact is superseded, not lost; hybrid retrieval.
 * And what they lack: every item names its source and date, nothing
 * from an email, upload or web page is ever applied without a person,
 * memory never crosses workspaces (row-level security), and the facts
 * that must never be forgotten come from the records, not the model.
 * ------------------------------------------------------------------ */

export type ScopeKind = "workspace" | "brand" | "store" | "market" | "person";
/** Where a memory applies. workspace has no id; a store or a person has its id; a market is a place code ("ny-nyc"). */
export type Scope = { kind: ScopeKind; id?: string };
export const scopeKey = (s: Scope) => `${s.kind}:${s.id ?? ""}`;
export const WORKSPACE: Scope = { kind: "workspace" };

/** The topic files memory is organized in, each with a one-line description so the right one is pulled in. */
export type Topic = "company" | "stores" | "markets" | "people" | "preferences" | "rules" | "decisions";
export const TOPICS: Topic[] = ["company", "stores", "markets", "people", "preferences", "rules", "decisions"];
export const TOPIC_INFO: Record<Topic, { name: Bi; about: Bi; words: RegExp }> = {
  company: { name: B("Company", "公司"), about: B("Legal entities, brand names, ownership and where the company is registered", "法律实体、品牌名称、所有权和注册地"), words: /\b(llc|inc|corp|entity|brand|registered|delaware|owner|ein|company)\b|公司|实体|品牌|注册/i },
  stores: { name: B("Stores", "门店"), about: B("Each store: its lease, landlord, inspections, permits and opening", "每家门店：租约、房东、检查、许可证和开业"), words: /\b(store|shop|location|lease|landlord|inspect\w*|hood|permit|opening|build-?out)\b|门店|租约|房东|检查|开业/i },
  markets: { name: B("Markets", "市场"), about: B("Cities, counties and states: their agencies, rules and quirks", "城市、县和州：机构、规定和特殊要求"), words: /\b(city|county|state|market|agency|dohmh|department|nyc|california|texas)\b|城市|县|州|市场|机构/i },
  people: { name: B("People", "人员"), about: B("Who the business works with: landlords, contractors, inspectors, advisers", "合作的人：房东、承包商、检查员、顾问"), words: /\b(contractor|landlord|inspector|architect|accountant|lawyer|broker|manager|who)\b|承包商|检查员|律师|会计|经理/i },
  preferences: { name: B("Preferences", "偏好"), about: B("How the owners want Odelia to work: language, channel, tone, approvals", "所有者希望 Odelia 如何工作：语言、渠道、语气、审批"), words: /\b(prefer\w*|language|chinese|english|wechat|whatsapp|email|text|tone|reach)\b|偏好|中文|微信|语言/i },
  rules: { name: B("Rules", "规则"), about: B("Requirements others put on the business: a landlord's, an insurer's, a franchisor's", "他人对企业的要求：房东、保险公司、特许方"), words: /\b(requires?|must|coi|insurance|certificate|naming|rule)\b|要求|必须|保险/i },
  decisions: { name: B("Decisions", "决定"), about: B("What was decided, by whom and when", "做过的决定、由谁决定、何时决定"), words: /\b(decid\w*|agreed|chose|approved|plan(ned)?|will)\b|决定|同意|批准|计划/i },
};

/** Where a memory came from. ref names the record: a run id, a filing id, a document id, a message id. */
export type SourceKind = "chat" | "remote" | "filing" | "document" | "email" | "portal" | "upload" | "owner" | "record";
export type Source = { kind: SourceKind; ref: string; title?: string; url?: string; quote?: string };
/** Who stands behind it: an owner said it in the app, Odelia worked it out, it came from outside (email, upload, web
 *  page, a chat outside the app), or it is a record (a filing, a deadline, an entity). */
export type Trust = "owner" | "agent" | "untrusted" | "record";
export type MemStatus = "suggested" | "approved" | "rejected" | "superseded" | "expired";
/** The facts that must never be forgotten. */
export type Critical = "entity" | "license" | "expiry" | "renewal" | "approval" | "case" | "deadline";

export type Observation = {
  id: string;
  scope: Scope;
  topic: Topic;
  /** What it is about: a record key ("app:sign", "deadline:dl-soi", "entity:e1", "store:flushing") or a name. With attr
   *  it is the node and edge of the temporal graph: one current value per entity and attr. */
  entity: string;
  attr: string;
  /** The value, normalized for comparison ("2027-03-01", "wechat"). */
  value: string;
  text: Bi;
  source: Source;
  /** When it was observed. */
  at: string;
  /** When the fact became true, and when it stopped being true (superseded). */
  validFrom: string;
  validTo?: string;
  status: MemStatus;
  trust: Trust;
  pinned?: boolean;
  critical?: Critical;
  /** A suggestion that would replace this approved item once approved. */
  supersedes?: string;
  supersededBy?: string;
  /** How many times it was seen again (merged), and when last. */
  seen?: number;
  lastSeen?: string;
  /** Ages out after this many days unless seen again. */
  ttlDays?: number;
  /** Who approved or last edited it (a user id), and when. */
  by?: string;
  edited?: string;
};

export type MemSettings = {
  /** Memory is used and kept. Off by default: opt-in, as the privacy policy discloses it. */
  enabled: boolean;
  /** Odelia suggests memories as she works (all wait for approval). */
  suggest: boolean;
  /** License numbers may be kept as their last 4 digits. */
  allowLast4: boolean;
  /** How many approved memories fit. A warning shows at 90%; at the cap nothing new is approved until some are removed. */
  cap: number;
};
export const DEFAULT_MEM_SETTINGS: MemSettings = { enabled: false, suggest: true, allowLast4: false, cap: 300 };

/** A brief, the way CLAUDE.md works: plain lines an owner can edit, always loaded first for its scope. */
export type BriefProposal = { id: string; line: string; why: string; source: Source; at: string };
export type Brief = { scope: Scope; body: string; updated: string; by?: string; proposals: BriefProposal[] };

/** Memory that disagrees with the records (a filing's confirmation number, a deadline's date, an entity's name). */
export type Conflict = { id: string; memory: string; record: string; memoryValue: string; recordValue: string; found: string; resolved?: string };

export type AgentMemory = { settings: MemSettings; items: Observation[]; briefs: Brief[]; conflicts: Conflict[] };
export const emptyAgentMemory = (): AgentMemory => ({ settings: { ...DEFAULT_MEM_SETTINGS }, items: [], briefs: [], conflicts: [] });

/** Live: approved and still true. */
export const isLive = (o: Observation) => o.status === "approved" && !o.validTo;
let seq = 0;
export const memId = (p = "om") => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Normalize a value for comparison: case, spaces, punctuation, quotes. */
export const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[\s,.;:!?。，；：！？]+/g, " ").trim();
