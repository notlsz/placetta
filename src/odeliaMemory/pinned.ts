import { B, type Bi } from "../bi";
import type { Workspace } from "../model";
import { lastFour } from "./privacy";
import { isLive, memId, norm, type AgentMemory, type Conflict, type Critical } from "./types";

/* What Odelia must never forget: legal entity names, case and confirmation numbers, renewal and expiry dates, deadlines,
   owners' approvals, and license numbers (their last 4, only when an owner allowed it). These don't depend on the model
   remembering anything: they are read from the records every run (the workspace's applications, filings, deadlines,
   entities and audit trail), go at the front of every prompt, and no context processor may drop them. A memory an owner
   pinned joins them. */

export type Pinned = { key: string; critical: Critical; text: Bi; value: string; ref: string };

const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "");
const MAX = { deadlines: 24, approvals: 12, permits: 24 };

/** The pinned set, from the records. Sorted by key, so the same records always give the same bytes (the prompt cache). */
export function pinnedFacts(w: Workspace, o: { allowLast4?: boolean; mem?: AgentMemory; today?: string } = {}): Pinned[] {
  const out: Pinned[] = [];
  const today = o.today ?? "";
  for (const e of w.entities ?? []) {
    const where = e.registrations.map(r => `${r.state}${r.foreign ? " (foreign)" : ""} ${r.date}`).join(", ");
    out.push({ key: `entity:${e.id}|name`, critical: "entity", value: e.name, ref: `entity:${e.id}`, text: B(`Legal entity: ${e.name} (${e.kind.toUpperCase()})${where ? `, registered ${where}` : ""}`, `法律实体：${e.name}（${e.kind.toUpperCase()}）${where ? `，注册于 ${where}` : ""}`) });
  }
  if (!w.entities?.length && w.meta?.entity) out.push({ key: "entity:main|name", critical: "entity", value: w.meta.entity, ref: "entity:main", text: B(`Legal entity: ${w.meta.entity}`, `法律实体：${w.meta.entity}`) });
  for (const f of w.facts) if (f.group === "business" && /legal (business )?name|entity|法定名称|实体/i.test(f.label.en + f.label.zh) && f.value.en.trim())
    out.push({ key: `fact:${f.id}|value`, critical: "entity", value: f.value.en, ref: `fact:${f.id}`, text: B(`${f.label.en}: ${f.value.en}`, `${f.label.zh}：${f.value.zh}`) });
  for (const a of w.apps) {
    const conf = a.filed?.confirmation;
    if (conf) out.push({ key: `app:${a.id}|confirmation`, critical: "case", value: conf, ref: `app:${a.id}`, text: B(`${a.name.en}, ${a.agency.en}: case or confirmation ${conf}${a.filed?.submitted ? `, filed ${a.filed.submitted}` : ""}`, `${a.name.zh}，${a.agency.zh}：案件或确认号 ${conf}${a.filed?.submitted ? `，提交于 ${a.filed.submitted}` : ""}`) });
    const lic = a.fields.find(f => /\b(license|permit) (no|number|#)\b|执照号|许可证号/i.test(f.label.en + f.label.zh) && f.value.trim());
    if (lic && a.status === "approved" && o.allowLast4) { const l4 = lastFour(lic.value); if (l4) out.push({ key: `app:${a.id}|license`, critical: "license", value: l4, ref: `app:${a.id}`, text: B(`${a.name.en}: license ${l4}`, `${a.name.zh}：执照尾号 ${l4.replace("ending ", "")}`) }); }
  }
  const dls = [...w.deadlines].filter(d => !today || d.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).slice(0, MAX.deadlines);
  for (const d of dls) {
    const crit: Critical = d.kind === "renewal" ? "renewal" : "deadline";
    out.push({ key: `deadline:${d.id}|date`, critical: crit, value: d.date, ref: `deadline:${d.id}`, text: B(`${d.kind === "renewal" ? "Renewal" : d.kind === "estimate" ? "Expected" : "Due"} ${d.date}: ${d.title.en}${d.agency ? ` (${d.agency.en})` : ""}`, `${d.kind === "renewal" ? "续期" : d.kind === "estimate" ? "预计" : "截止"} ${d.date}：${d.title.zh}${d.agency ? `（${d.agency.zh}）` : ""}`) });
  }
  let permits = 0;
  for (const s of [...(w.stores ?? [])].sort((a, b) => a.id.localeCompare(b.id))) for (const p of s.permits ?? []) {
    if (permits++ >= MAX.permits) break;
    out.push({ key: `permit:${s.id}:${norm(p.name.en).replace(/ /g, "-")}|expires`, critical: "expiry", value: p.expires, ref: `store:${s.id}`, text: B(`${s.name.en}: ${p.name.en} expires ${p.expires}`, `${s.name.zh}：${p.name.zh} ${p.expires} 到期`) });
  }
  // owners' approvals, newest first, from the audit trail
  const approved = w.audit.filter(a => a.actor === "you" && /^approved/i.test(a.action.en)).sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)).slice(0, MAX.approvals);
  for (const a of approved) out.push({ key: `approval:${a.id}|at`, critical: "approval", value: day(a.at), ref: `audit:${a.id}`, text: B(`Owner ${a.action.en.toLowerCase()} on ${day(a.at)}: ${a.object.en}${a.detail ? ` (${a.detail.en})` : ""}`, `所有者于 ${day(a.at)} ${a.action.zh}：${a.object.zh}${a.detail ? `（${a.detail.zh}）` : ""}`) });
  // memories an owner pinned
  for (const m of (o.mem?.items ?? []).filter(x => x.pinned && isLive(x))) out.push({ key: `memory:${m.id}|pinned`, critical: m.critical ?? "deadline", value: m.value, ref: `memory:${m.id}`, text: m.text });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** The pinned set as the prompt carries it. */
export function pinnedBlock(p: Pinned[], lang: "en" | "zh" = "en"): string {
  if (!p.length) return "";
  return `Never forget (from the records; always current, never drop these):\n${p.map(x => `- ${lang === "zh" ? x.text.zh : x.text.en}`).join("\n")}`;
}

/** The record a memory is about: a memory whose entity is a record key and whose attribute says what of it. */
const RECORD_ATTR: Record<string, string> = { confirmation: "confirmation", "case number": "confirmation", case: "confirmation", "confirmation number": "confirmation",
  date: "date", "due on": "date", due: "date", "renews on": "date", renews: "date", "expires on": "expires", expires: "expires", name: "name", "legal name": "name", "files under": "name" };
/** A date written any common way, as YYYY-MM-DD (or the text, normalized, when it isn't one). */
function canon(v: string): string {
  const s = String(v ?? "").trim();
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s); if (iso) return iso[0];
  const t = Date.parse(s); if (!isNaN(t) && /\d{4}/.test(s)) return new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return norm(s);
}

/** Memory against the records: every current memory about a record that says something else than the record. The
 *  record wins; the conflict goes to the owner to settle (update the memory to the record, or delete it). Already-known
 *  conflicts aren't raised twice. */
export function consistency(mem: AgentMemory, pinned: Pinned[], now: string): Conflict[] {
  const byKey = new Map(pinned.map(p => [p.key, p]));
  const out: Conflict[] = [];
  for (const m of mem.items.filter(isLive)) {
    const attr = RECORD_ATTR[norm(m.attr)];
    if (!attr || !/^(app|deadline|entity|fact|permit):/.test(m.entity)) continue;
    const key = `${m.entity}|${m.entity.startsWith("fact:") ? "value" : attr}`;
    const rec = byKey.get(key);
    if (!rec) continue;
    const a = canon(m.value), b = canon(rec.value);
    if (!a || a === b || (attr === "name" && norm(a) === norm(b))) continue;
    if (mem.conflicts.some(c => c.memory === m.id && c.recordValue === rec.value && !c.resolved)) continue;
    out.push({ id: memId("mc"), memory: m.id, record: rec.ref, memoryValue: m.value, recordValue: rec.value, found: now });
  }
  return out;
}

/** Settle a conflict: "record" updates the memory to what the record says (the old value goes into its history), "delete"
 *  removes the memory, "dismiss" keeps both and closes the conflict. */
export function settle(mem: AgentMemory, id: string, how: "record" | "delete" | "dismiss", now: string, by?: string): AgentMemory {
  const c = mem.conflicts.find(x => x.id === id);
  if (!c) return mem;
  const conflicts = mem.conflicts.map(x => (x.id === id ? { ...x, resolved: now } : x));
  if (how === "dismiss") return { ...mem, conflicts };
  const m = mem.items.find(x => x.id === c.memory);
  if (!m) return { ...mem, conflicts };
  if (how === "delete") return { ...mem, conflicts, items: mem.items.filter(x => x.id !== m.id) };
  const next = { ...m, id: memId(), value: c.recordValue, text: B(m.text.en.split(c.memoryValue).join(c.recordValue), m.text.zh.split(c.memoryValue).join(c.recordValue)), source: { kind: "record" as const, ref: c.record }, trust: "record" as const, at: now, validFrom: now.slice(0, 10), status: "approved" as const, supersedes: undefined, supersededBy: undefined, ...(by ? { by } : {}) };
  return { ...mem, conflicts, items: [...mem.items.map(x => (x.id === m.id ? { ...x, status: "superseded" as const, validTo: now.slice(0, 10), supersededBy: next.id } : x)), next] };
}
