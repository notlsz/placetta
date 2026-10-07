// deno test supabase/functions/file/logic_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { DEST, destinationProblems, staleDestinations, TO_VERIFY, type Dest } from "./destinations.ts";
import { check, emailFor, envFrom, faxTo, type Filing, isForeign, killSwitchOn, mailTo, pick, teamApproved } from "./logic.ts";

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
