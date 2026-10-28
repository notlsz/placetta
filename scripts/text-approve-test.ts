// Approving a filing by text (src/textApprove.ts): the same filing the app makes on Approve, with the same checks, and
// what can't go by text says why. The database's own gates (text_approve_file: owner, Terms, two owners, the plan, the
// Autopilot caps) are tested in supabase/tests/messaging.sql. Run from scripts/agent-test.ts.
import { textApprovable, textApprove, NOT_BY_TEXT, type TextApproveIO, type TextFileResult, type TextFileRow } from "../src/textApprove";
import { card, seller, ws } from "./autopilot-test";
import { B } from "../src/bi";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;
const NOW = "2026-10-27T12:00:00.000Z";

export async function textApproveTests(ok: Ok, eq: Eq) {
  console.log("\n# Approving by text: the app's checks, then the database's");
  const rows: TextFileRow[] = [], started: string[] = [];
  const io = (r: TextFileResult = { result: "filed", id: "f-9" }, fail?: string): TextApproveIO => ({
    loadPdf: async () => null, upload: async (_a, name) => `ws/${name}`,
    file: async row => { if (fail) throw new Error(fail); rows.push(row); return r; }, start: async id => { started.push(id); },
  });
  const w = ws([seller()], null);
  const done = await textApprove(w, "ap-seller", io(), { by: "mei@moonleaf.test", now: NOW });
  ok(done.filed === "f-9" && started[0] === "f-9" && rows[0].app_id === "seller" && rows[0].approval === "ap-seller" && rows[0].fee === 0, "an owner's YES files it, and the dispatcher starts it (which holds it for the undo window)", rows[0]);
  ok(!!(rows[0].payload as { approved_by_text?: unknown }).approved_by_text && !(rows[0].payload as { signature?: unknown }).signature, "the payload says it was approved by text, and carries no signature: none is placed from a text");
  const after = done.patch(w);
  ok(!after.approvals.length && after.apps[0].status === "filing" && after.audit.some(a => a.action.en === "Approved by text"), "the card closes, the application is filing, and the audit trail says Approved by text");
  ok(/^Approved\. Filing the seller's permit now/.test(done.say.en) && !/[—–]/.test(done.say.en + done.say.zh), "they're told in plain words", done.say);

  // the database's refusal, in plain words, and nothing changes
  const capped = await textApprove(w, "ap-seller", io({ result: "refused", why: "text_cap: fees over $250 are approved in the app" }), { by: "mei@moonleaf.test", now: NOW });
  ok(!capped.filed && capped.patch(w) === w && /approved in the app/.test(capped.say.en), "over the cap: refused, in plain words, the card stays", capped.say);
  const two = await textApprove(w, "ap-seller", io({ result: "waiting" }), { by: "mei@moonleaf.test", now: NOW });
  ok(two.waiting && !two.filed && /another owner/.test(two.say.en) && two.patch(w).approvals.length === 1, "a second owner's rule: recorded, and the card waits for them");
  const thrown = await textApprove(w, "ap-seller", io(undefined, "second_owner: two owners approve this"), { by: "x", now: NOW });
  ok(!thrown.filed && /two owners/i.test(thrown.say.en), "an error from the database is said as a sentence");

  // the app's own checks come first
  const blank = ws([seller({ fields: [{ id: "n", label: B("Business name", "名称"), value: "" }] })], null);
  const b = await textApprove(blank, "ap-seller", io(), { by: "x", now: NOW });
  ok(!b.filed && b.patch(blank) === blank, "a blank field: not filed", b.say);
  const gone = await textApprove(w, "ap-nope", io(), { by: "x", now: NOW });
  ok(!gone.filed && /isn't waiting/.test(gone.say.en), "a card that's gone");
  const withdrawn = ws([seller()], null, [card(seller(), { withdrawn: true } as never)]);
  ok(!(await textApprove(withdrawn, "ap-seller", io(), { by: "x", now: NOW })).filed, "a card whose answers changed can't be filed");
  const pay = ws([seller()], null, [card(seller(), { kind: "pay", purchase: "p1" })]);
  const p = await textApprove(pay, "ap-seller", io(), { by: "x", now: NOW });
  eq(p.say, NOT_BY_TEXT, "a purchase is never approved by text");
  ok(!textApprovable(card(seller(), { kind: "send" })) && !textApprovable(card(seller(), { autopilot: { grant: "g", at: NOW, sign: "none" } })) && textApprovable(card(seller())), "only a filing's own card, not one Autopilot is filing");
}
