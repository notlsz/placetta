// "Placetta as your agent" (src/agentPacket.ts, src/forms/agentAuthority.ts): the cited table, the one-session packet, the
// check before every act as agent, the San José opening's touches at signup and during the process, revoking, and the
// Done screen's summary. Run from scripts/agent-test.ts.
import { agentCheck, agentPacket, agentState, agentTouches, actAsAgent, putAgent, revokeAgent, type AgentAuth } from "../src/agentPacket";
import { AGENT, agentOk, byLaw, NOT_USED } from "../src/forms/agentAuthority";
import { autopilotCheck, autopilotPlan, defaultScope, ownerTouches, revokeGrant } from "../src/autopilot";
import { doneSummary } from "../src/done";
import { grant, sanJoseOpening } from "./autopilot-test";
import type { Workspace } from "../src/model";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;
const NOW = "2026-10-27T12:00:00.000Z";
export const AGENT_OF_RECORD = { name: "Dana Reyes", title: "Filing agent, Placetta", phone: "(408) 555-0100", email: "agent@placetta.com" };

/** The packet as the database would record it after the owner signed everything in the one session. */
export function signedPacket(w: Workspace, over: Partial<AgentAuth> = {}): AgentAuth {
  const p = agentPacket(w, { agent: AGENT_OF_RECORD });
  return {
    id: "ag1", by: "Mei Lin", at: NOW, expires: "2027-10-27T12:00:00.000Z", version: "2026-10-28", agencies: p.agencies, forms: p.forms, agent: AGENT_OF_RECORD.name,
    items: p.items.map(i => ({ id: i.id, ...(i.form ? { form: i.form } : {}), ...(i.agency ? { agency: i.agency.en } : {}), sig: i.sig, at: NOW, ...(i.id === "sj-building-section-c" ? { expires: "2027-10-27T12:00:00.000Z" } : {}), doc: `ws/agent/${i.id}.pdf` })),
    apEmail: "ap@moonleaf.example", ...over,
  };
}
/** The San José opening with Autopilot and the agent packet signed in one session. */
export function sjSigned(over: Partial<AgentAuth> = {}): Workspace {
  const sj = sanJoseOpening();
  const g = grant({ scope: defaultScope(sj) });
  const w: Workspace = { ...sj, controls: { ...(sj.controls ?? {}), autopilot: g, autonomy: "autopilot" } };
  return putAgent(signedPacket(w, over))(w);
}

export async function agentAuthorityTests(ok: Ok, eq: Eq) {
  console.log("\n# Agent authority: every row cited, nothing assumed");
  for (const [id, r] of Object.entries(AGENT)) {
    ok(r.cite.length > 0 && r.cite.every(u => /^https:\/\/(www\.)?(irs\.gov|edd\.ca\.gov|leginfo\.legislature\.ca\.gov|sanjoseca\.gov|deh\.santaclaracounty\.gov|cdtfa\.ca\.gov)\//.test(u)), `${id}: cited to the agency or the statute itself`, r.cite);
    ok(r.owner.every(o => o.cite.length > 0), `${id}: every act left to the owner is cited`);
    ok(!r.agentOk || r.sends !== "owner", `${id}: agentOk means someone other than the owner sends it`);
  }
  ok(!agentOk("sj-business-tax") && !!AGENT["sj-business-tax"].confirm, "the business tax certificate: the city says nothing about representatives, so no agent route until it confirms");
  ok(AGENT["irs-ss4"].owner[0].why === "law" && AGENT["irs-ss4"].owner[0].sig === "hand", "the SS-4: the responsible party's own signature, in ink (not on the IRS's e-signature list)");
  ok(AGENT["ca-edd-de1"].owner[0].why === "law" && AGENT["ca-edd-de1"].owner[0].when === "later", "the DE 1: a sworn declaration with the first payroll date, so later and the owner's");
  ok(AGENT["sj-sign"].sends === "contractor", "the sign permit: on SJPermits.org only a licensed contractor or the property owner applies");
  ok(AGENT["sj-building-ti"].auth?.months === 12, "the building permit's agent authorization is honored for 12 months, as the city's notarized-letter rule says");
  ok(NOT_USED.some(n => n.form === "IRS Form 2848"), "Form 2848 isn't used: a company can't be a representative");
  eq(byLaw(Object.keys(AGENT)).map(x => x.form), ["irs-ss4", "ca-edd-de1"], "what the law keeps the owner's own: the SS-4 and the DE 1");

  console.log("\n# The packet: one session, everything that can be signed now");
  const sj = sanJoseOpening();
  const p = agentPacket(sj, { agent: AGENT_OF_RECORD });
  eq(p.items.map(i => i.id), ["placetta-agent", "irs-ss4-designee", "scc-health-permit-owner", "sj-building-section-c"], "Placetta as your agent, the SS-4 with its designee line, the health permit's certification, the city's Section C");
  eq(p.items.filter(i => i.sig === "esign").length, 2, "two by e-signature (the agent authorization, Section C)");
  eq(p.items.filter(i => i.sig === "hand").length, 2, "two by hand (the SS-4, the health permit certification)");
  eq(p.later.map(l => l.form).sort(), ["ca-edd-de1", "scc-plan-check", "sj-business-tax"], "later, with why: the DE 1, the plan check, the business tax registration");
  ok(!!agentPacket(sj, {}).blocked, "with no agent of record named, the forms that name one can't be signed");

  console.log("\n# Acting as agent: each check");
  const w = sjSigned();
  const health = w.apps.find(a => a.official === "scc-health-permit")!;
  ok(agentCheck(w, health, NOW).ok, "the health permit: Placetta may send it as agent");
  const wrong = { ...health, agency: { en: "City of San José", zh: "圣何塞市" } };
  ok(agentCheck(w, wrong, NOW).why.some(x => /isn't the agency that takes it/.test(x.en)), "the wrong agency on the filing: refused");
  const notCovered = sjSigned({ agencies: [] });
  ok(agentCheck(notCovered, health, NOW).why.some(x => /doesn't cover/.test(x.en)), "an agency outside the authorization: refused");
  const expired = sjSigned({ expires: "2026-10-01T00:00:00.000Z" });
  ok(agentState(expired.controls!.agent, NOW) === "expired" && agentCheck(expired, health, NOW).why.some(x => /expired on 2026-10-01/.test(x.en)), "an expired authorization: refused");
  const revoked = revokeAgent(NOW)(w);
  ok(agentCheck(revoked, health, NOW).why.some(x => /revoked/.test(x.en)), "a revoked authorization: refused");
  const building = w.apps.find(a => a.official === "sj-building-ti")!;
  const staleC = putAgent({ ...w.controls!.agent!, items: w.controls!.agent!.items.map(i => (i.id === "sj-building-section-c" ? { ...i, expires: "2026-09-01T00:00:00.000Z" } : i)) })(w);
  ok(agentCheck(staleC, building, NOW).why.some(x => /12 months/.test(x.en)), "Section C past the 12 months the city honors: sign it again");
  const off = revokeGrant(NOW)(w);
  ok(!!off.controls?.agent?.revokedAt, "turning Autopilot off revokes the agent authority too: one tap stops everything");
  const acted = actAsAgent(health, { en: "Emailed the application package", zh: "通过电子邮件发送申请材料" }, "Dana Reyes")(w);
  ok(/Acted as your agent: Emailed/.test(acted.audit[0].action.en) && /Dana Reyes/.test(acted.audit[0].detail?.en ?? ""), "every act as agent is in the audit trail, with who and under which authorization");

  console.log("\n# Under Autopilot, with the packet signed");
  const plan = autopilotPlan(w, { now: NOW, issuing: true });
  const row = (f: string) => plan.find(r => w.apps.find(a => a.id === r.app)?.official === f)!;
  ok(row("scc-health-permit").alone && row("scc-health-permit").needs.every(n => n.kind !== "law"), "the health permit goes: pre-signed at signup, sent as agent", row("scc-health-permit"));
  ok(row("sj-building-ti").alone, "the building permit goes: Section C signed at signup, the contractor's declaration is the contractor's, the fee on a single-use card", row("sj-building-ti"));
  ok(row("sj-sign").alone && row("sj-sign").needs.some(n => n.kind === "contractor"), "the sign permit: the contractor applies; nothing for the owner", row("sj-sign"));
  ok(!row("ca-edd-de1").alone && row("ca-edd-de1").needs.some(n => n.kind === "law"), "the DE 1 stays the owner's, by law", row("ca-edd-de1"));
  ok(!row("scc-plan-check").alone && row("scc-plan-check").needs.some(n => n.kind === "wet"), "the plan check waits for the owner's signature on the final plans", row("scc-plan-check"));
  const hp = w.approvals.find(a => a.app === health.id) ?? { id: "ap-h", kind: "file" as const, app: health.id, title: health.name, agency: health.agency, does: [], action: { en: "File", zh: "提交" } };
  const c = autopilotCheck(w, hp, { now: NOW, issuing: false });
  ok(c.needs.some(n => n.kind === "invoice" && n.after), "with single-use cards off, the county's bill comes later (forwarded to accounts payable)");

  console.log("\n# The San José milk tea opening, re-measured");
  const before = ownerTouches(sanJoseOpening(), { now: NOW, as: grant({ scope: defaultScope(sanJoseOpening()) }) });
  const on = agentTouches(w, { issuing: true, capFiling: 500 }), offCards = agentTouches(w, { issuing: false, capFiling: 500 });
  console.log(`   before Autopilot ${before.before.length}, Autopilot alone ${before.after.length}; with the agent packet: ${on.signup.length} at signup (one session), ${on.during.length} during (cards on) or ${offCards.during.length} during and ${offCards.bills.length} bills to accounts payable (cards off)`);
  for (const t of on.signup) console.log(`     signup: ${t.what.en}`);
  for (const t of on.during) console.log(`     during: ${t.what.en}`);
  eq([before.before.length, before.after.length], [21, 14], "the baseline: 21 before Autopilot, 14 with it (the county's two ink forms now go by email once signed)");
  eq(on.signup.length, 4, "4 at signup, all in one session (2 e-signatures, 2 by hand)");
  eq(on.during.length, 3, "3 during the process with single-use cards on: the DE 1 (law), the plan check signature and the business tax registration (agency, until they confirm an agent may)");
  eq([offCards.during.length, offCards.bills.length], [4, 2], "with cards off: the building permit's fee too, and 2 county bills forwarded to accounts payable");
  ok(on.remains.filter(r => r.why === "law").every(r => r.cite.length > 0) && on.remains.filter(r => r.why === "law").length === 2, "what the law keeps the owner's, cited: the SS-4 and the DE 1", on.remains.filter(r => r.why === "law"));

  console.log("\n# Done");
  const done = { ...w, apps: w.apps.map(a => ({ ...a, status: "approved" as const })) };
  const d = doneSummary(done, NOW);
  ok(!doneSummary(w, NOW).done && d.done && d.licenses.length === 8, "Done only when every license is approved", d);
  ok(d.renewals.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date)), "renewal dates set for what renews", d.renewals);
}
