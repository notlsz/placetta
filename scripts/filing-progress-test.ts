// A portal filing's progress against the agency's guide (src/filingProgress.ts): the outline the worker logs, and which
// pages are done, now and next as the run reaches them. Run from scripts/agent-test.ts.
import { outlineOf, progressOf } from "../src/filingProgress";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;

export function filingProgressTests(ok: Ok, eq: Eq) {
  console.log("\n# Watching a filing: the guide's pages, done, now and next");
  const log = [{ kind: "visit", en: "Opening aca-prod.accela.com" }, { kind: "playbook", ref: JSON.stringify(["Home", "Select a Record Type", "Contact Information", "Work Location", "Review", "Pay Fees"]) }];
  const outline = outlineOf(log);
  eq(outline, ["Home", "Select a Record Type", "Contact Information", "Work Location", "Review", "Pay Fees"], "the outline comes from the worker's playbook step");
  eq(outlineOf([{ kind: "playbook" }]), undefined, "an older worker's step without an outline shows none");
  eq(outlineOf([{ kind: "playbook", ref: "[not json" }]), undefined, "a broken outline shows none, never an error");
  const p = progressOf(outline, ["Accela Citizen Access Home", "Select a Record Type", "Contact Information"]);
  eq(p?.steps.map(s => s.state), ["done", "done", "now", "next", "next", "next"], "pages reached are done, the last one is now");
  eq([p?.done, p?.of, p?.now], [2, 6, "Contact Information"], "page 3 of 6");
  eq(progressOf(outline, ["Something the guide doesn't name"])?.done, 0, "a page the guide doesn't name moves nothing");
  eq(progressOf(outline, ["Home", "Work Location", "Contact Information"])?.now, "Work Location", "going back a page doesn't move progress backwards");
  ok(progressOf(outline, ["Home"], true)?.steps.every(s => s.state === "done"), "a submitted filing shows every page done");
  eq(progressOf(undefined, ["Home"]), null, "no outline, no progress list");
}
