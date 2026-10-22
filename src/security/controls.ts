import type { Workspace } from "../model";

/* ------------------------------------------------------------------ *
 * The owner's controls (src/autonomy.ts: how much Odelia does on her own,
 * Always allow and Never rules, house rules, business rules, approved
 * plans) change only by an owner. In the app the database holds that line
 * (keep_owner_controls); a server run saves with the service role, which
 * that trigger lets through for Odelia's own bookkeeping. So the run
 * itself holds it, in code, on every change it makes: whatever a tool or
 * a model does, the definitions stay as they were. Only bookkeeping goes
 * through: a rule's use count, a business rule having fired, a plan put
 * up and waiting. A plan becomes approved, or a held change runs, only
 * in a run an owner started with /go or /apply.
 * ------------------------------------------------------------------ */

type C = NonNullable<Workspace["controls"]>;

export function keepOwnerControls(before: Workspace, after: Workspace, o: { owner: boolean }): Workspace {
  if (o.owner || after.controls === before.controls) return after;
  const b: C = before.controls ?? {}, a: C = after.controls ?? {};
  const rules = (b.rules ?? []).map(r => { const n = (a.rules ?? []).find(x => x.id === r.id); return n ? { ...r, used: n.used, last: n.last } : r; });
  const fired = [...(b.fired ?? []), ...(a.fired ?? []).filter(f => !(b.fired ?? []).some(x => x.key === f.key))];
  // a plan may always go (back) to waiting, which asks more of the owner, never less; approved only if it already was
  const fromRun = (a.plans ?? []).filter(p => p.state === "waiting" || (b.plans ?? []).some(x => x.job === p.job && x.state === "approved"));
  const plans = [...fromRun, ...(b.plans ?? []).filter(p => !fromRun.some(x => x.job === p.job) && (a.plans ?? []).some(x => x.job === p.job))].slice(0, 40);
  const controls: C = { ...b, ...(b.rules || a.rules ? { rules } : {}), ...(b.fired || a.fired ? { fired } : {}), ...(b.plans || a.plans ? { plans } : {}) };
  for (const k of ["autonomy", "house", "business"] as const) { if (b[k] === undefined) delete controls[k]; else (controls as Record<string, unknown>)[k] = b[k]; }
  return { ...after, controls };
}
