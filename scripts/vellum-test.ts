// What Vellum's breakdowns of Hermes Agent, Grok Bot, Meta Muse, Instinct and Vellum's own memory taught, held as tests:
// memory the owner can read, correct (a correction replaces, never duplicates), export and delete; the three answers on
// an approval card (Ask me, Always allow, Never) and what Never does; the tainted-data gate's words. The attacks
// themselves are in scripts/redteam-test.ts (VL1 to VL9). Run from scripts/agent-test.ts.
import { addRule, denyRule, permissionOptions, TAINT_WHY } from "../src/autonomy";
import { addApproval, normalizeState } from "../src/core";
import { B } from "../src/bi";
import { apply, edit, forgetAll, observation, plan, remove } from "../src/odeliaMemory/update";
import { memoryExport, memoryFileName } from "../src/odeliaMemory/export";
import { emptyAgentMemory } from "../src/odeliaMemory/types";
import type { Approval, Workspace } from "../src/model";
import { card as apCard, seller as apSeller, ws as apWs } from "./autopilot-test";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;
const NOW = "2026-10-29T12:00:00.000Z";

export function vellumTests(ok: Ok, eq: Eq) {
  console.log("\n# Memory you can read, correct, export and delete (Grok's gap, Vellum's corrections)");
  const src = { kind: "chat" as const, ref: "run-1", quote: "Our landlord is Ms. Chen" };
  let m = apply(emptyAgentMemory(), plan(emptyAgentMemory(), [observation({ entity: "landlord", attr: "name", value: "Ms. Chen", text: B("The landlord is Ms. Chen", "房东是陈女士"), source: src, trust: "owner" }, NOW)]));
  eq(m.items.length, 1, "an owner's own word is kept as a memory");
  // the owner says the landlord changed: the new fact replaces the old one, which stays only as history
  m = apply(m, plan(m, [observation({ entity: "landlord", attr: "name", value: "Mr. Park", text: B("The landlord is Mr. Park", "房东是朴先生"), source: { ...src, quote: "Our landlord is Mr. Park now" }, trust: "owner" }, "2026-10-30T12:00:00.000Z")]));
  const live = m.items.filter(o => o.status === "approved" && !o.validTo);
  ok(live.length === 1 && live[0].text.en === "The landlord is Mr. Park" && m.items.some(o => o.status === "superseded" && o.supersededBy === live[0].id), "a correction replaces the fact: one current, the old one superseded, never two", m.items);
  const e = edit(m, live[0].id, { en: "The landlord is Mr. Park (Park Realty)", zh: "房东是朴先生（Park Realty）" }, "owner", NOW);
  ok(e.ok && e.memory.items.length === m.items.length && e.memory.items.find(o => o.id === live[0].id)?.text.en.includes("Park Realty"), "an edit changes the memory in place, no copy");
  const x = memoryExport(e.memory, "Moonleaf Tea", NOW);
  ok(x.memories.length === 2 && x.counts.current === 1 && x.counts.past === 1 && x.memories.some(r => r.replacedBy === live[0].id) && x.memories.every(r => r.source?.ref), "the export holds every memory with its source, the past version and what replaced it", x.counts);
  eq(memoryFileName(NOW), "odelia-memory-2026-10-29.json", "the file is named for the day");
  ok(remove(e.memory, live[0].id).items.every(o => o.id !== live[0].id) && forgetAll(e.memory).items.length === 0, "one memory, or all of them, can be deleted");

  console.log("\n# Ask me, Always allow, Never: the three answers on an approval card (Grok's permission controls)");
  const w0: Workspace = normalizeState("Tea", { apps: [] });
  const msg: Approval = { id: "ap-m", kind: "send", title: B("Message", "消息"), action: B("Send", "发送"), does: [], data: [{ id: "to", label: B("To", "收件人"), value: "kevin@contractor.com" }, { id: "msg", label: B("Message", "内容"), value: "Hi" }] };
  const po = permissionOptions(msg, addApproval(msg)(w0));
  ok(po.length === 1 && po[0].allow?.target === "kevin@contractor.com" && po[0].deny.target === "kevin@contractor.com" && /^Messages to kevin/.test(po[0].what.en) && !!po[0].what.zh, "a message: Always allow its recipient, or Never contact them", po);
  const ws1 = apWs([apSeller()]), fileCard = apCard(ws1.apps[0]);
  const pf = permissionOptions(fileCard, ws1);
  ok(pf.length === 1 && !pf[0].allow && pf[0].action === "filing" && pf[0].deny.target === ws1.apps[0].agency.en, "a filing: never Always allow from a card (that's Autopilot's signed authorization), but Never for this agency", pf);
  const never = addRule({ kind: "deny", action: "filing", target: pf[0].deny.target }, "owner")(ws1);
  ok(!!denyRule(never, "request_filing_approval", { application_id: ws1.apps[0].id }), "the Never rule stops the next filing with that agency");
  ok(/instructions aimed at an AI/.test(TAINT_WHY), "the tainted-data gate says why a card waits");
}
