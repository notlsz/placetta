import { B, same, type Bi } from "../bi";
import { audit } from "../core";
import type { Workspace } from "../model";
import { type Detection, type Verdict } from "./detect";
import { ingest, ingestChecked, type Ingested } from "./ingest";
import { decideCall, newRunPolicy, spend, type Actor, type Decision, type Role, type RunPolicy, type Scope } from "./policy";
import type { Provenance } from "./untrusted";

/* ------------------------------------------------------------------ *
 * The shield one run carries: the policy state (who's asking, what the
 * run has done, which addresses came from where, whether it read
 * something poisoned), the way untrusted content comes in (take), and the
 * gate every tool call goes through (secureTools). The tools in
 * src/live.ts call take() on everything they read from outside; the
 * server's loop (src/serverRun.ts) and the browser's (liveAgent) wrap
 * their tools with secureTools().
 * ------------------------------------------------------------------ */

type Tool = { name: string; description: string; inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] }; execute: (input: Record<string, unknown>) => unknown };
type Patch = (w: Workspace) => Workspace;

/** One line of the tool-call log: who, with what role, which tool, a hash of what it was given, and what was decided. */
export type ToolLog = { at: string; run?: string; tool: string; scope: Scope | null; actor: string | null; role: Role; input_hash: string; decision: "allow" | "deny" | "error"; code?: string; reason?: string };

/** Keys sorted, so the same input always hashes the same. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v as object).sort().map(k => JSON.stringify(k) + ":" + stable((v as Record<string, unknown>)[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}
export async function sha256(text: string): Promise<string> {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const buf = await c!.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const RANK: Record<Verdict, number> = { clean: 0, flagged: 1, quarantined: 2 };

export class Shield {
  policy: RunPolicy;
  /** Where each untrusted address was seen, and whether that content held instructions: for the refusal's words. */
  seen = new Map<string, { label: string; bad: boolean }>();
  /** Every flagged or quarantined item this run read. */
  found: { label: string; verdict: Verdict; hits: string[]; quote: string | null }[] = [];
  private o: { apply?: (p: Patch) => void; check?: (text: string) => Promise<boolean>; log?: (e: ToolLog) => void; runId?: string };
  constructor(policy: RunPolicy, o: { apply?: (p: Patch) => void; check?: (text: string) => Promise<boolean>; log?: (e: ToolLog) => void; runId?: string } = {}) {
    this.policy = policy; this.o = o;
  }
  get actor(): Actor { return this.policy.actor; }
  set apply(f: ((p: Patch) => void) | undefined) { this.o.apply = f; }
  /** Record what an ingested item means for the run: its addresses, its taint, and an audit line when it held instructions. */
  private record(ing: Ingested, label: string) {
    const bad = ing.detection.verdict !== "clean";
    for (const e of ing.emails) {
      if (!this.policy.trusted.has(e)) this.policy.untrusted.add(e);
      const had = this.seen.get(e);
      if (!had || (bad && !had.bad)) this.seen.set(e, { label, bad });
    }
    if (!bad) return;
    if (RANK[ing.detection.verdict] > RANK[this.policy.taint === "none" ? "clean" : this.policy.taint]) this.policy.taint = ing.detection.verdict === "quarantined" ? "quarantined" : "flagged";
    if (this.found.some(f => f.label === label && f.verdict === ing.detection.verdict)) return;
    this.found.push({ label, verdict: ing.detection.verdict, hits: ing.detection.hits, quote: ing.detection.quote });
    this.o.apply?.(audit("agent", ing.quarantined ? B("Quarantined content with instructions aimed at an AI", "隔离了含有针对 AI 指令的内容") : B("Flagged content with instructions aimed at an AI", "标记了含有针对 AI 指令的内容"),
      same(label.slice(0, 160)), same(`${ing.detection.hits.slice(0, 3).join("; ")}${ing.detection.quote ? `: "${ing.detection.quote.slice(0, 160)}"` : ""}`)));
  }
  /** Untrusted content in: hidden text out, scored, wrapped with where it came from, withheld when quarantined. */
  take(raw: unknown, p: Provenance, label?: string, o: { html?: boolean; extraHidden?: { why: string; text: string }[] } = {}): Ingested {
    const ing = ingest(raw, p, o);
    this.record(ing, label ?? p.title ?? p.from ?? p.source);
    return ing;
  }
  /** The same, with the optional model check. */
  async takeChecked(raw: unknown, p: Provenance, label?: string, o: { html?: boolean } = {}): Promise<Ingested> {
    const ing = await ingestChecked(raw, p, this.o.check, o);
    this.record(ing, label ?? p.title ?? p.from ?? p.source);
    return ing;
  }
  /** A detection made elsewhere (a PDF's hidden text, a web page the model fetched), recorded the same way. */
  note(d: Detection, label: string, emails: string[] = []) {
    this.record({ text: "", plain: "", detection: d, hidden: [], quarantined: d.verdict === "quarantined", emails }, label);
  }
  /** Addresses the person themselves gave: these may be written to. */
  trust(emails: Iterable<string>) { for (const e of emails) { const x = e.toLowerCase(); this.policy.trusted.add(x); this.policy.untrusted.delete(x); } }
  log(e: Omit<ToolLog, "at" | "run" | "actor" | "role">) { this.o.log?.({ at: new Date().toISOString(), ...(this.o.runId ? { run: this.o.runId } : {}), actor: this.actor.id, role: this.actor.role, ...e }); }
}

/** A shield for a run that wasn't given one (the browser, the sample): the person is a member, nothing read yet. */
export const defaultShield = (me?: string, role: Role = "member") => new Shield(newRunPolicy({ id: me ?? null, role }));

const AUDITED = new Set(["role", "cross_tenant", "recipient", "agency_domain", "amount_cap", "run_amount_cap", "tainted", "argument_injection", "exfil_link", "unknown_tool", "run_budget", "untrusted_address"]);

/** The words a refusal gives, naming where an untrusted address came from. */
function reason(s: Shield, d: Extract<Decision, { allow: false }>, input: Record<string, unknown>): string {
  if (d.code !== "recipient") return d.reason;
  const r = /^(\S+@\S+?) /.exec(d.reason)?.[1];
  const seen = r ? s.seen.get(r) : undefined;
  if (r && seen) return seen.bad
    ? `${r} appears only in instructions found inside ${seen.label}, not in anything the person asked. Nothing was drafted. Tell the person what it asked for.`
    : `${r} appears only in ${seen.label}, which Odelia read from outside, not in anything the person gave. Nothing was drafted. Ask the person to confirm the address.`;
  void input;
  return d.reason;
}

/** Every tool behind the policy: decided before it runs, counted, logged with a hash of its input, and a send to an
 *  address that isn't a known contact carries that on its approval card. appReadOnly: the connected apps' tools that
 *  only read. */
export function secureTools(tools: Tool[], s: Shield, o: { get?: () => Workspace; apply?: (p: Patch) => void; appReadOnly?: (t: Tool) => boolean } = {}): Tool[] {
  return tools.map(t => ({
    ...t,
    async execute(input: Record<string, unknown>) {
      const name = t.name, args = input && typeof input === "object" ? input : {};
      const hash = await sha256(stable(args));
      const d = decideCall(s.policy, name, args, { appReadOnly: o.appReadOnly?.(t) });
      if (!d.allow) {
        const why = reason(s, d, args);
        s.log({ tool: name, scope: d.scope, input_hash: hash, decision: "deny", code: d.code, reason: why.slice(0, 300) });
        if (AUDITED.has(d.code)) o.apply?.(audit("agent", B("Refused a step by Placetta's rules", "按快哉的规则拒绝了一步操作"), same(name), same(why.slice(0, 240))));
        throw new Error(why);
      }
      let out: unknown;
      try { out = await t.execute(args); }
      catch (e) { s.log({ tool: name, scope: d.scope, input_hash: hash, decision: "error", reason: String((e as Error)?.message ?? e).slice(0, 300) }); throw e; }
      spend(s.policy, d, args);
      s.log({ tool: name, scope: d.scope, input_hash: hash, decision: "allow" });
      // a message to someone the business never named: the owner sees that on the card before approving it
      const id = out && typeof out === "object" ? String((out as Record<string, unknown>).approval_id ?? "") : "";
      if (d.notes?.length && id && o.apply) {
        const line: Bi = B(`Check before approving: ${d.notes.join("; ")}.`, `批准前请核对：${d.notes.join("；")}。`);
        o.apply(w => ({ ...w, approvals: w.approvals.map(a => (a.id === id && !a.does.some(x => x.en === line.en) ? { ...a, does: [...a.does, line] } : a)) }));
      }
      return out;
    },
  }));
}
