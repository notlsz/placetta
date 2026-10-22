/* Settings, Agent memory (src/AgentMemory.tsx), rendered as people see it: in English and Chinese, as an owner, a member
   and a viewer, with no bullet or dot separators and no leading zeros. Run from scripts/agent-flow-test.ts (npm run test:flow). */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { B, same } from "../src/bi";
import { normalizeState } from "../src/core";
import { AppCtx } from "../src/ctx";
import { AgentMemoryGroup } from "../src/AgentMemory";
import { propose } from "../src/odeliaMemory/brief";
import { observation, update } from "../src/odeliaMemory/update";
import { emptyAgentMemory, type AgentMemory, type Observation } from "../src/odeliaMemory/types";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
const NOW = "2026-10-22T12:00:00.000Z";
const on = (m: AgentMemory = emptyAgentMemory()): AgentMemory => ({ ...m, settings: { ...m.settings, enabled: true } });
const obs = (o: Partial<Observation> & { entity: string; attr: string; value: string; text: string }, now = NOW): Observation =>
  observation({ trust: "owner", source: { kind: "chat", ref: "run-1" }, ...o, text: B(o.text, o.text) }, now);
const ws = () => normalizeState("Acme Tea", { goal: same("x"), stores: [{ id: "flushing", name: B("Flushing", "法拉盛"), address: "136-20 Roosevelt Ave", stage: "opening", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 } }] });

export function memoryUiTests(ok: Ok) {

  console.log("\n# Settings, Agent memory: what people see, in English and Chinese");
  let uiMem = on();
  ({ memory: uiMem } = update(uiMem, [obs({ topic: "company", entity: "entity:e1", attr: "files under", value: "Acme Tea LLC", text: "Brand files under Acme Tea LLC (Delaware)" }, "2026-10-03T00:00:00Z"),
    { ...obs({ scope: { kind: "store", id: "flushing" }, topic: "stores", entity: "landlord", attr: "requires", value: "coi", text: "Landlord requires COI naming them" }), status: "suggested", trust: "untrusted", source: { kind: "email", ref: "m1", title: "read_email" } }]));
  uiMem = propose(uiMem, { kind: "store", id: "flushing" }, "Inspector asked for hood cleaning tags last visit", "flushed", { kind: "chat", ref: "r" }, NOW);
  uiMem = { ...uiMem, conflicts: [{ id: "c1", memory: uiMem.items[0].id, record: "entity:e1", memoryValue: "Acme Tea LLC", recordValue: "Acme Tea Holdings LLC", found: NOW }] };
  const view = (lang: "en" | "zh", cloud: unknown) => renderToStaticMarkup(createElement(AppCtx.Provider, { value: { b: (x: { en: string; zh: string }) => x[lang], lang, ws: { ...ws(), agentMemory: uiMem }, editWs: () => undefined, say: () => undefined, cloud } as never }, createElement(AgentMemoryGroup, { db: () => Promise.reject(new Error("no database here")), ...(cloud ? { preload: uiMem } : {}) })));
  const en = view("en", null), zhv = view("zh", null);
  const words = (h: string) => h.replace(/<[^>]+>/g, " ");
  ok(en.includes("Agent memory") && en.includes("Off by default") && en.includes("Suggestions to review (1)") && en.includes("Approve") && en.includes("From an email") && en.includes("Store: Flushing")
    && en.includes("Since Oct 3, 2026") && en.includes("Don&#x27;t remember this chat") && en.includes("Forget all") && en.includes("Disagrees with your records") && en.includes("Add to brief"), "English: the switch, suggestions with source, date and scope, conflicts, briefs, forget all");
  ok(zhv.includes("助理记忆") && zhv.includes("待批准的建议（1）") && zhv.includes("来自邮件") && zhv.includes("2026年10月3日起") && zhv.includes("不记住这次对话") && zhv.includes("全部忘记"), "Chinese: the same, in Chinese");
  ok(![en, zhv].some(h => /[·•]/.test(words(h))), "no bullet or dot separators");
  ok(![en, zhv].some(h => /(^|[^\d.,:])0\d/.test(words(h))), "no leading zeros");
  const viewer = view("en", { viewer: true, owner: false, admin: false, role: "viewer", wsId: "w", email: "v@x" });
  ok(viewer.includes("You&#x27;re a viewer") && !viewer.includes(">Approve<") && !viewer.includes(">Delete<") && !viewer.includes(">Forget all<") && viewer.includes("Managed by owners and admins"), "a viewer reads it all and changes nothing");
  const member = view("en", { viewer: false, owner: false, admin: false, role: "member", wsId: "w", email: "m@x" });
  ok(!member.includes(">Approve<") && member.includes(">Edit<") && member.includes("An owner or admin approves these"), "a member edits and deletes, an owner or admin approves", {approve: member.includes(">Approve<"), edit: member.includes(">Edit<"), note: member.includes("An owner or admin approves these")});
}
