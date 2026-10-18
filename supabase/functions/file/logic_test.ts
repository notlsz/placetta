// deno test supabase/functions/file/logic_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { DEST, destinationProblems, staleDestinations, TO_VERIFY, type Dest } from "./destinations.ts";
import {
  afterHold, askedToResubmit, canFaxSigned, check, emailFor, envFrom, faxFailures, faxFile, faxTo, type Filing, holdMinutes, holds, isForeign, killSwitchOn,
  mailOutcome, mailTo, pick, refusalOf, signedCopy, teamApproved,
} from "./logic.ts";

const WS = "11111111-1111-1111-1111-111111111111";
const b = (s: string) => ({ en: s, zh: s });
const filing = (over: Partial<Filing["payload"]> = {}, f: Partial<Filing> = {}): Filing => ({
  id: "f1", workspace_id: WS, app_id: "ein", title: b("EIN"), status: "requested", channel: null, agent_state: null, agent_log: [],
  handoff_url: null, provider_ref: null, submit_clicked_at: null, attempts: 0, requirements_checked: false, confirmation_number: null, portal_url: null,
  payload: { official: "test-form", fields: [{ id: "l1", label: b("Legal name"), value: "Acme LLC" }, { id: "l7b", label: b("SSN, ITIN, or EIN of responsible party"), value: "Foreign" }],
    checklist: [{ label: b("Articles"), state: "done" }], attachments: [], pdf_path: `${WS}/filings/f1.pdf`, ...over }, ...f,
});
const dest = (d: Partial<Dest> = {}): Dest => ({
  fax: { us: "+18005550100", foreign: "+13045550100" },
  mail: { name: "Agency", line1: "1 Main St", city: "Town", state: "OH", zip: "45999", foreign: { name: "Agency Intl", line1: "2 Main St", city: "Town", state: "OH", zip: "45999" } },
  signature: "drawn", checked: "2026-10-01", source: "https://agency.gov/where", ...d,
});
const ENV = envFrom((k) => ({ FILER_AGENCIES: "test-form", FILER_CHANNELS: "email,fax,mail,portal", FILER_ENABLED: "1", TELNYX_API_KEY: "k", TELNYX_FAX_CONNECTION_ID: "c", TELNYX_FAX_FROM: "+1", LOB_API_KEY: "test_x", LOB_FROM: "{}" } as Record<string, string>)[k]);
const docs = new Set([`${WS}/filings/f1.pdf`]);

Deno.test("every shipped destination has its checked date and source", () => {
  assertEquals(destinationProblems(), []);
});
Deno.test("an entry without checked or source fails", () => {
  const bad = destinationProblems({ x: { ...dest(), checked: "", source: "" } });
  assert(bad.some((p) => p.includes("checked")) && bad.some((p) => p.includes("source")));
  assert(destinationProblems({ y: dest({ fax: { us: "<from the IRS page>" } }) }).some((p) => p.includes("E.164")));
});
Deno.test("unverified destinations are never used", () => {
  for (const id of Object.keys(TO_VERIFY)) assertEquals(DEST[id], undefined);
});
Deno.test("stale entries after 90 days", () => {
  assertEquals(staleDestinations("2027-01-15", 90, { a: dest({ checked: "2026-10-01" }) }).length, 1);
  assertEquals(staleDestinations("2026-11-01", 90, { a: dest({ checked: "2026-10-01" }) }).length, 0);
});
Deno.test("kill switch is off by default", () => {
  assert(!killSwitchOn(filing(), envFrom(() => undefined)));
  assert(killSwitchOn(filing(), ENV));
  assertEquals(envFrom(() => undefined).channels, []);
});
Deno.test("check: complete filing passes", () => {
  assertEquals(check(filing({ signature: { name: "A", signed_at: "now", kind: "drawn" } }), dest(), { docPaths: docs }), []);
});
Deno.test("check: SSN, empty line, missing signature, missing file", () => {
  const p = check(filing({ fields: [{ id: "l1", label: b("Legal name"), value: "" }, { id: "x", label: b("Owner number"), value: "123-45-6789" }], pdf_path: `${WS}/nope.pdf` }), dest(), { docPaths: docs });
  const kinds = new Set(p.map((x) => x.kind));
  assert(kinds.has("secret") && kinds.has("missing") && kinds.has("signature") && kinds.has("file"));
});
Deno.test("check: a file outside the workspace is refused", () => {
  const p = check(filing({ attachments: [{ name: "x", path: "other/x.pdf" }], signature: { name: "A", signed_at: "n", kind: "drawn" } }), dest(), { docPaths: new Set([...docs, "other/x.pdf"]) });
  assert(p.some((x) => x.kind === "file"));
});
Deno.test("pick: portal, email, fax, mail, team in order", () => {
  const f = filing();
  assertEquals(pick(f, dest({ portal: "x.gov", email: "a@x.gov" }), ENV, { hasLogin: true, mailConnected: true }), "portal");
  assertEquals(pick(f, dest({ portal: "x.gov", email: "a@x.gov" }), ENV, { hasLogin: false, mailConnected: true }), "email");
  assertEquals(pick(f, dest({ email: "a@x.gov" }), ENV, { hasLogin: false, mailConnected: false }), "fax");
  assertEquals(pick(f, dest({ fax: undefined }), ENV, { hasLogin: false, mailConnected: false }), "mail");
  assertEquals(pick(f, undefined, ENV, { hasLogin: true, mailConnected: true }), "team");
  const noFax = envFrom((k) => (k === "FILER_CHANNELS" ? "fax" : undefined));
  assertEquals(pick(f, dest(), noFax, { hasLogin: false, mailConnected: false }), "team");
});
Deno.test("pick: a wet signature never goes by email, fax or mail", () => {
  assertEquals(pick(filing(), dest({ signature: "wet", email: "a@x.gov" }), ENV, { hasLogin: false, mailConnected: true }), "team");
});
Deno.test("wet signature: a hand-signed copy goes by fax, never by email or mail", () => {
  const signedLog = [{ en: "", zh: "", kind: "signed_copy", ref: `${WS}/receipts/signed.pdf` }];
  const f = filing({}, { agent_log: signedLog });
  assertEquals(signedCopy(f), `${WS}/receipts/signed.pdf`);
  assertEquals(faxFile(f), `${WS}/receipts/signed.pdf`);
  assertEquals(faxFile(filing()), `${WS}/filings/f1.pdf`);
  assertEquals(pick(f, dest({ signature: "wet", email: "a@x.gov" }), ENV, { hasLogin: false, mailConnected: true }), "fax");
  assertEquals(pick(f, dest({ signature: "wet", fax: undefined }), ENV, { hasLogin: false, mailConnected: true }), "team");
  const faxOff = envFrom((k) => (k === "FILER_CHANNELS" ? "email,mail" : k.startsWith("TELNYX") ? "x" : undefined));
  assert(!canFaxSigned(dest({ signature: "wet" }), faxOff));
  assertEquals(pick(f, dest({ signature: "wet" }), faxOff, { hasLogin: false, mailConnected: true }), "team");
});
Deno.test("check: the signed copy must be in this workspace's Documents", () => {
  const f = (ref: string) => filing({}, { agent_log: [{ en: "", zh: "", kind: "signed_copy", ref }] });
  assertEquals(check(f(`${WS}/receipts/s.pdf`), dest({ signature: "wet" }), { docPaths: new Set([...docs, `${WS}/receipts/s.pdf`]) }), []);
  assert(check(f(`${WS}/receipts/missing.pdf`), dest({ signature: "wet" }), { docPaths: docs }).some((x) => x.kind === "file"));
  assert(check(f("other/s.pdf"), dest({ signature: "wet" }), { docPaths: new Set([...docs, "other/s.pdf"]) }).some((x) => x.kind === "file"));
});
Deno.test("foreign owners get the foreign fax and address", () => {
  const f = filing();
  assert(isForeign(f.payload));
  assertEquals(faxTo(dest(), f.payload), "+13045550100");
  assertEquals(mailTo(dest(), f.payload)?.name, "Agency Intl");
  const us = filing({ fields: [{ id: "l7b", label: b("EIN"), value: "12-3456789" }] });
  assertEquals(faxTo(dest(), us.payload), "+18005550100");
  assert(isForeign(filing({ us_address: false, fields: [] }).payload));
});
Deno.test("two-key approval is read from the log", () => {
  assert(!teamApproved(filing()));
  assert(teamApproved(filing({}, { agent_log: [{ en: "", zh: "", kind: "two_key_ok" }] })));
});
Deno.test("the agency email names the form and the business", () => {
  const e = emailFor(filing({ form: b("Form SS-4") }));
  assertEquals(e.subject, "Form SS-4: Acme LLC");
  assert(e.body.includes("authorization"));
});

Deno.test("a filing with an agency fee never goes by email, fax or mail; a portal still takes it", () => {
  const paid = filing({}, { fee_estimate: 250 });
  assertEquals(pick(paid, dest({ email: "a@x.gov" }), ENV, { hasLogin: false, mailConnected: true }), "team");
  assertEquals(pick(paid, dest({ portal: "x.gov" }), ENV, { hasLogin: true, mailConnected: true }), "portal");
  assertEquals(pick(filing({}, { fee_estimate: "0.00" }), dest({ email: "a@x.gov" }), ENV, { hasLogin: false, mailConnected: true }), "email");
});
Deno.test("a portal that files without an account runs with no saved login", () => {
  assertEquals(pick(filing(), dest({ portal: "x.gov", noLogin: true }), ENV, { hasLogin: false, mailConnected: false }), "portal");
  assertEquals(pick(filing(), dest({ portal: "x.gov" }), ENV, { hasLogin: false, mailConnected: false }), "fax");
});

Deno.test("the daily cap on faxes and letters defaults to 10 and reads FILER_DAILY_CAP", () => {
  assertEquals(envFrom(() => undefined).dailyCap, 10);
  assertEquals(envFrom((k) => (k === "FILER_DAILY_CAP" ? "3" : undefined)).dailyCap, 3);
  assertEquals(envFrom((k) => (k === "FILER_DAILY_CAP" ? "0" : undefined)).dailyCap, 0);
  assertEquals(envFrom((k) => (k === "FILER_DAILY_CAP" ? "lots" : undefined)).dailyCap, 10);
  assertEquals(envFrom((k) => (k === "FILER_DAILY_CAP" ? "" : undefined)).dailyCap, 10);
});
Deno.test("the database's refusals are told apart from other errors", () => {
  assertEquals(refusalOf("filing_changed: the filing moved on (agent_state)"), "changed");
  assertEquals(refusalOf("already_submitted: this filing was already sent"), "already");
  assertEquals(refusalOf("filing_stopped: the customer stopped this filing"), "stopped");
  assertEquals(refusalOf("daily_cap: 10 faxes and letters in the last 24 hours"), "cap");
  assertEquals(refusalOf("connection reset"), null);
  assertEquals(refusalOf(undefined), null);
});
Deno.test("an email that may have left is never treated as not sent", () => {
  assertEquals(mailOutcome(200), "sent");
  assertEquals(mailOutcome(null), "unknown");            // a timeout
  assertEquals(mailOutcome(500), "unknown");
  assertEquals(mailOutcome(502), "unknown");
  assertEquals(mailOutcome(504), "unknown");
  assertEquals(mailOutcome(409), "unknown");             // integrations says this filing's email was already claimed
  assertEquals(mailOutcome(400), "refused");
  assertEquals(mailOutcome(403), "refused");
});
Deno.test("fax failures and resubmission are read from the log", () => {
  const two = filing({}, { agent_log: [{ en: "", zh: "", kind: "fax_failed" }, { en: "", zh: "", kind: "fax_queued" }, { en: "", zh: "", kind: "fax_failed" }] });
  assertEquals(faxFailures(two), 2);
  assert(!askedToResubmit(two));
  assert(askedToResubmit(filing({}, { agent_log: [{ en: "", zh: "", kind: "resubmit" }] })));
});

/* ---------------- the undo window ---------------- */

Deno.test("the undo window is 10 minutes unless SEND_HOLD_MINUTES says otherwise; 0 turns it off", () => {
  assertEquals(envFrom(() => undefined).holdMinutes, 10);
  assertEquals(holdMinutes(undefined), 10);
  assertEquals(holdMinutes(""), 10);
  assertEquals(holdMinutes("0"), 0);
  assertEquals(holdMinutes("3"), 3);
  assertEquals(holdMinutes("2.9"), 2);
  assertEquals(holdMinutes("later"), 10);            // a typo never switches the window off
  assertEquals(holdMinutes("-5"), 10);
  assertEquals(holdMinutes("100000"), 1440);         // at most a day
  assertEquals(envFrom((k) => (k === "SEND_HOLD_MINUTES" ? "0" : undefined)).holdMinutes, 0);
});
Deno.test("every channel that leaves Placetta waits; the team's doesn't", () => {
  const on = { holdMinutes: 10 }, off = { holdMinutes: 0 };
  for (const c of ["email", "fax", "mail", "portal"] as const) { assert(holds(c, on), c); assert(!holds(c, off), c); }
  assert(!holds("team", on));
});
Deno.test("when the time is up: email, fax and mail send; the portal is already queued; anything odd goes to the team", () => {
  assertEquals(afterHold({ channel: "fax", agent_state: "running" }, true), "fax");
  assertEquals(afterHold({ channel: "email", agent_state: "running" }, true), "email");
  assertEquals(afterHold({ channel: "mail", agent_state: "running" }, true), "mail");
  assertEquals(afterHold({ channel: "portal", agent_state: "queued" }, true), "queued");
  assertEquals(afterHold({ channel: "fax", agent_state: "running" }, false), "team");     // the destination was withdrawn meanwhile
  assertEquals(afterHold({ channel: "fax", agent_state: "held" }, true), "team");         // never sends a row the release didn't return
  assertEquals(afterHold({ channel: "team", agent_state: "running" }, true), "team");
});
Deno.test("Undo and the send can't both win: the database's answers are told apart", () => {
  // The release is a compare-and-set on agent_state = 'held'. An Undo after it gets too_late, which the sender never
  // retries on; the sender's claim after an Undo is refused as stopped.
  assertEquals(refusalOf("too_late: the time to undo is over"), null);
  assertEquals(refusalOf("filing_stopped: the customer stopped this filing"), "stopped");
  assertEquals(refusalOf("filing_changed: the filing moved on (agent_state)"), "changed");
});
