// deno test supabase/functions/file/logic_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { DEST, destinationProblems, staleDestinations, TO_VERIFY, type Dest } from "./destinations.ts";
import {
  afterHold, asAgent, askedToResubmit, canFaxSigned, canFaxSignedFor, check, emailFor, envFrom, faxFailures, faxFile, faxTo, feeBlocks, type Filing, hasLoginFor, holdMinutes,
  fallback, handBackDue, handoffPacket, holds, isForeign, killSwitchOn, selfFileScope, workerOn, workerState, mailOutcome, mailTo, OWNER_REF, ownerPacket, pick, PORTAL_FAILED, refusalOf, REVIEW_HOURS, rerouteDue,
  sentByYou, signedCopy, teachRefusal, teamApproved, waysToSend, whyYours, YOURS_REF, checkCents, lobCheckBody, captchaPlan,
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

Deno.test("the UK food business registration goes to the Food Standards Agency's own site, and only when switched on", () => {
  const d = DEST["gb-food"];
  assert(!!d, "gb-food has a destination");
  // the agency's own host, started from its own page, with no saved login (the service makes the registration itself)
  assertEquals(d.portal, "register.food.gov.uk");
  assertEquals(new URL(d.portalUrl!).hostname, "register.food.gov.uk");
  assertEquals(d.noLogin, true);
  // no channel that would send Placetta's own copy: the portal is the only way it goes
  assert(!d.email && !d.fax && !d.mail && !d.owner, "portal only");
  assertEquals(destinationProblems({ "gb-food": d }), []);
  const f = filing({ official: "gb-food" });
  // the worker on and the portal channel on: the agency's site, with no saved login needed
  assertEquals(pick(f, d, ENV, { hasLogin: false, mailConnected: true }), "portal");
  // the portal channel off, or the worker off: nothing Placetta sends on, so the business sends it
  assertEquals(pick(f, d, { ...ENV, channels: ["email", "fax", "mail"] }, { hasLogin: false, mailConnected: true }), "team");
  assertEquals(pick(f, d, { ...ENV, portalWorker: false }, { hasLogin: true, mailConnected: true }), "team");
  // the kill switch: nothing is sent for gb-food until it is listed in FILER_AGENCIES
  assertEquals(killSwitchOn(f, ENV), false);
  const on = envFrom((k) => ({ FILER_AGENCIES: "gb-food", FILER_CHANNELS: "portal", FILER_ENABLED: "1" } as Record<string, string>)[k]);
  assertEquals(killSwitchOn(f, on), true);
  assertEquals(pick(f, d, on, { hasLogin: false, mailConnected: false }), "portal");
});

Deno.test("M5: the three GOV.UK services are routed to their own HMRC paths, marked not ready, and send nothing until switched on", () => {
  const ids = ["gb-incorporate", "gb-vat", "gb-paye"] as const;
  const paths = { "gb-incorporate": "/register-your-company", "gb-vat": "/register-for-vat", "gb-paye": "/register-for-paye" };
  for (const id of ids) {
    const d = DEST[id];
    assert(!!d && d.portal === "www.tax.service.gov.uk", `${id}: on HMRC's service host`);
    assertEquals(d.tenant, paths[id], `${id}: its own path on the shared host`);
    assert(new URL(d.portalUrl!).pathname.startsWith(paths[id]), `${id}: starts on that path`);
    assert(!d.noLogin, `${id}: needs the business's own sign-in`);
    assert(!!d.notReady && d.notReady.length > 10, `${id}: says why it isn't ready`);
    assert(!d.email && !d.fax && !d.mail && !d.owner, `${id}: no channel but the site`);
    assertEquals(destinationProblems({ [id]: d }), []);
    const f = filing({ official: id });
    // off by default: the kill switch refuses it, whatever the worker settings
    assertEquals(killSwitchOn(f, ENV), false, `${id}: off by default`);
    // with no saved login it never goes to the site
    assertEquals(pick(f, d, ENV, { hasLogin: false, mailConnected: true }), "team", `${id}: no login, no site`);
  }
  // a saved login for one HMRC service never opens another on the same host
  assert(hasLoginFor(["https://www.tax.service.gov.uk/register-for-vat"], DEST["gb-vat"]));
  assert(!hasLoginFor(["https://www.tax.service.gov.uk/register-for-vat"], DEST["gb-paye"]));
  assert(!hasLoginFor(["https://www.tax.service.gov.uk/register-for-vat"], DEST["gb-incorporate"]));
  // the £100 fee is paid on the site (the person's), and nothing else claims a fee
  assertEquals(DEST["gb-incorporate"].payment, "portal");
  assertEquals(DEST["gb-vat"].payment, undefined);
  assertEquals(DEST["gb-paye"].payment, undefined);
});

Deno.test("Show Odelia how: only for a form filed on an agency site, with the worker on, before it's sent or while it's free", () => {
  const site = dest({ portal: "tax.county.example" });
  assertEquals(teachRefusal(filing({}, { agent_state: "handoff", channel: "team" }), site, ENV), null);
  assertEquals(teachRefusal(filing({}, { agent_state: "needs_you" }), site, ENV), null);
  assertEquals(teachRefusal(filing(), dest(), ENV), "no_portal");
  assertEquals(teachRefusal(filing(), undefined, ENV), "no_portal");
  assertEquals(teachRefusal(filing(), site, envFrom((k) => (k === "FILER_ENABLED" ? "0" : undefined))), "worker_off");
  assertEquals(teachRefusal(filing({}, { submit_clicked_at: "2026-10-30T00:00:00Z" }), site, ENV), "finished");
  assertEquals(teachRefusal(filing({}, { status: "submitted" }), site, ENV), "finished");
  for (const s of ["queued", "running", "held"]) assertEquals(teachRefusal(filing({}, { agent_state: s }), site, ENV), "busy");
});
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
Deno.test("pick: a portal that keeps showing CAPTCHAs gives way to a way without one, unless that is days slower", () => {
  const f = filing();
  const seen = { hasLogin: true, mailConnected: true, captchaHost: true };
  // email and fax arrive within a day: preferred to the CAPTCHA
  assertEquals(pick(f, dest({ portal: "x.gov", email: "a@x.gov" }), ENV, seen), "email");
  assertEquals(pick(f, dest({ portal: "x.gov" }), ENV, { ...seen, mailConnected: false }), "fax");
  // only a letter (about five days): the portal stays, and its CAPTCHA still goes to the team, then the owner
  assertEquals(pick(f, dest({ portal: "x.gov", fax: undefined }), ENV, { ...seen, mailConnected: false }), "portal");
  // nothing else the agency accepts: the portal
  assertEquals(pick(f, { signature: "drawn", checked: "2026-10-01", source: "https://x.gov", portal: "x.gov" }, ENV, seen), "portal");
  // no CAPTCHA seen there: the portal, as before
  assertEquals(pick(f, dest({ portal: "x.gov", email: "a@x.gov" }), ENV, { ...seen, captchaHost: false }), "portal");
});
Deno.test("before it starts: a CAPTCHA portal with a slower way without one asks the owner, once; a saved answer decides", () => {
  const f = filing();
  const d = dest({ portal: "x.gov", fax: undefined });   // mail only, about 5 days slower
  const facts = { hasLogin: true, mailConnected: false, captchaHost: true };
  const asked = captchaPlan(f, d, ENV, facts, pick(f, d, ENV, facts));
  assert("ask" in asked);
  if ("ask" in asked) {
    assertEquals(asked.alt, "mail"); assertEquals(asked.days, 5);
    assert(/\(a\) I'll do it when it comes up, one tap on my phone\. \(b\) Placetta's team does it\. \(c\) Send it another way: by mail, usually about 5 days slower\./.test(asked.ask.en));
    assert(/通过邮寄，通常约慢 5 天/.test(asked.ask.zh));
  }
  // the saved default: "me" and "team" keep the portal without asking (and pick() keeps it even when email is faster),
  // "route" sends it the other way
  for (const c of ["me", "team"] as const) {
    assertEquals(captchaPlan(f, d, ENV, { ...facts, captchaChoice: c }, "portal"), { channel: "portal" });
    assertEquals(pick(f, dest({ portal: "x.gov", email: "a@x.gov" }), ENV, { ...facts, mailConnected: true, captchaChoice: c }), "portal");
  }
  assertEquals(captchaPlan(f, d, ENV, { ...facts, captchaChoice: "route" }, "portal"), { channel: "mail" });
  // "always ask" asks again
  assert("ask" in captchaPlan(f, d, ENV, { ...facts, captchaChoice: "ask" }, "portal"));
  // no CAPTCHA seen, or no way without one: the portal, never a question
  assertEquals(captchaPlan(f, d, ENV, { ...facts, captchaHost: false }, "portal"), { channel: "portal" });
  assertEquals(captchaPlan(f, { signature: "drawn", checked: "2026-10-01", source: "https://x.gov", portal: "x.gov" }, ENV, facts, "portal"), { channel: "portal" });
});
Deno.test("pick: a site with a CAPTCHA in the way loses to a way that needs nobody; the site still files when it's the only way", () => {
  const f = filing();
  const both = dest({ portal: "x.gov", email: "a@x.gov", captcha: true });
  assertEquals(pick(f, both, ENV, { hasLogin: true, mailConnected: true }), "email", "the agency's inbox takes it: nobody solves a CAPTCHA");
  assertEquals(pick(f, both, ENV, { hasLogin: true, mailConnected: false }), "fax", "or its fax");
  const only = dest({ portal: "x.gov", email: undefined, fax: undefined, mail: undefined, captcha: true });
  assertEquals(pick(f, only, ENV, { hasLogin: true, mailConnected: true }), "portal", "the site is the only way: Odelia files and hands the CAPTCHA to a person");
  assertEquals(pick(f, dest({ portal: "x.gov", email: "a@x.gov" }), ENV, { hasLogin: true, mailConnected: true }), "portal", "no CAPTCHA: the site first, as before");
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

/* ---------------- owner packets, fees that travel with a filing, attachments ---------------- */

const all = { hasLogin: true, mailConnected: true };
const pdf = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `doc${i + 1}.pdf`, path: `${WS}/docs/doc${i + 1}.pdf` }));

Deno.test("an owner-only form is never sent: it becomes the owner's packet, whatever else is switched on", () => {
  const owner = dest({ fax: undefined, mail: undefined, owner: { why: "Notarized in person", mail: { name: "City Clerk", line1: "Room 601", city: "Boston", state: "MA", zip: "02201" } } });
  assertEquals(pick(filing(), owner, ENV, all), "owner");
  assertEquals(pick(filing({}, { fee_estimate: 65 }), owner, ENV, all), "owner");
  // No filled form or signature is checked: the owner sends it.
  assertEquals(check(filing({ pdf_path: undefined }), owner, { docPaths: docs }, "owner"), []);
});

Deno.test("the owner packet says why, where and what goes with it, in English and Chinese, with only an https link", () => {
  const d = dest({ fax: undefined, mail: undefined, signature: "wet", payment: "with_filing", attach: ["Check payable to the City"],
    owner: { why: "The form must be notarized.", url: "https://www.boston.gov/permitting/permits/business-certificate", mail: { name: "City Clerk's Office", line1: "Room 601", line2: "1 City Hall Square", city: "Boston", state: "MA", zip: "02201" } } });
  const p = ownerPacket(filing({ form: { en: "Business Certificate", zh: "营业证明" } }, { fee_estimate: 65 }), d);
  assert(p.en.includes("notarized") && p.en.includes("owner-packet.pdf") && p.en.includes("$65") && p.en.includes("I've sent it") && !/team/i.test(p.en));
  assert(p.zh.includes("营业证明") && p.zh.includes("65 美元"));
  assert(p.lines.some((l) => l.includes("Room 601")) && p.lines.some((l) => l.includes("Check payable")) && p.lines.every((l) => l.length <= 90 || !l.includes(" ")));
  assertEquals(p.link, "https://www.boston.gov/permitting/permits/business-certificate");
  assertEquals(ownerPacket(filing(), dest({ owner: { why: "In person", url: "http://agency.gov/form" } })).link, null);
});

Deno.test("a fee the agency wants with the filing keeps it off email, fax and mail, even with no estimate on the filing", () => {
  assert(feeBlocks(filing(), dest({ payment: "with_filing" })));
  assert(!feeBlocks(filing(), dest({ payment: "invoice" })));
  assertEquals(pick(filing(), dest({ payment: "with_filing", email: "a@x.gov" }), ENV, { hasLogin: false, mailConnected: true }), "team");
  assertEquals(pick(filing(), dest({ payment: "in_person" }), ENV, { hasLogin: false, mailConnected: true }), "team");
  // The portal still takes it: the person pays on the agency's site when the worker hands it to them.
  assertEquals(pick(filing(), dest({ payment: "with_filing", portal: "x.gov" }), ENV, all), "portal");
  // An invoice comes after, so nothing travels with it.
  assertEquals(pick(filing(), dest({ payment: "invoice", email: "a@x.gov" }), ENV, { hasLogin: false, mailConnected: true }), "email");
});

Deno.test("a fee or extra documents keep a hand-signed copy from going by fax", () => {
  const wet = dest({ signature: "wet" });
  const signedLog = [{ en: "", zh: "", kind: "signed_copy", ref: `${WS}/receipts/signed.pdf` }];
  assert(canFaxSignedFor(filing({}, { agent_log: signedLog }), wet, ENV));
  assert(!canFaxSignedFor(filing({}, { agent_log: signedLog, fee_estimate: 50 }), wet, ENV));
  assert(!canFaxSignedFor(filing({}, { agent_log: signedLog }), dest({ signature: "wet", payment: "with_filing" }), ENV));
  assert(!canFaxSignedFor(filing({ attachments: pdf(1) }, { agent_log: signedLog }), wet, ENV));
  assertEquals(pick(filing({ attachments: pdf(1) }, { agent_log: signedLog }), wet, ENV, all), "team");
});

Deno.test("a fax or a letter carries only the form; an email carries at most four attachments", () => {
  const d = dest({ email: "a@x.gov" });
  assertEquals(pick(filing({ attachments: pdf(4) }), d, ENV, all), "email");
  assertEquals(pick(filing({ attachments: pdf(5) }), d, ENV, all), "team");
  assertEquals(pick(filing({ attachments: pdf(1) }), d, ENV, { hasLogin: false, mailConnected: false }), "team");   // would have been fax
  assertEquals(pick(filing({ attachments: pdf(1) }), dest({ fax: undefined }), ENV, all), "team");                   // would have been mail
  assertEquals(pick(filing(), dest({ fax: undefined }), ENV, all), "mail");
});

Deno.test("an agency that takes it from a filer only with the owner's signed authorization gets it", () => {
  const d = dest({ email: "a@x.gov", onBehalf: "authorization", authorization: "Power of Attorney/Authority to Act form" });
  const signedAs = { signature: { name: "A", signed_at: "n", kind: "drawn" as const } };
  const missing = check(filing(signedAs), d, { docPaths: docs }, "email");
  assert(missing.some((p) => p.kind === "file" && p.en.includes("Power of Attorney")));
  const poa = { name: "Power of Attorney.pdf", path: `${WS}/docs/poa.pdf` };
  assertEquals(check(filing({ ...signedAs, attachments: [poa] }), d, { docPaths: new Set([...docs, poa.path]) }, "email"), []);
});

Deno.test("what is checked follows where it goes: a portal filing needs no filled PDF, an email does", () => {
  const d = dest({ portal: "x.gov", email: "a@x.gov", signature: "none" });
  assertEquals(check(filing({ pdf_path: undefined }), d, { docPaths: docs }, "portal"), []);
  assert(check(filing({ pdf_path: undefined }), d, { docPaths: docs }, "email").some((p) => p.kind === "file"));
});

Deno.test("a saved login opens a portal only on its host and, on a shared host, its agency's path", () => {
  const dallas = dest({ portal: "aca-prod.accela.com", tenant: "/dallastx", portalUrl: "https://aca-prod.accela.com/dallastx" });
  assert(hasLoginFor(["https://aca-prod.accela.com/DALLASTX/Default.aspx"], dallas));
  assert(!hasLoginFor(["https://aca-prod.accela.com/CFW/Default.aspx"], dallas));
  assert(!hasLoginFor(["https://aca-prod.accela.com/DALLASTX"], dest({ email: "a@x.gov" })));
  assert(hasLoginFor(["https://www.sjpermits.org/"], dest({ portal: "sjpermits.org" })));
});

/* ------------------------------ another way when the agency's site fails ------------------------------ */

const handedBack = (ref: string, f: Partial<Filing> = {}): Filing => filing({}, {
  channel: "team", agent_state: "handoff", status: "in_progress",
  agent_log: [{ en: "Opening the site", zh: "打开网站", kind: "visit" }, { en: "Couldn't finish", zh: "未能完成", kind: "handoff", ref }], ...f,
});
Deno.test("a portal run that failed before submitting is due for another way, once", () => {
  for (const ref of ["limit", "left_portal", "no_portal", "portal_failed"]) assert(rerouteDue(handedBack(ref)), ref);
  // another reason for the hand-back (the review page differs, a playbook's first run) stays the team's
  assert(rerouteDue(handedBack("review_differs")) && rerouteDue(handedBack("unverified_playbook")) && !rerouteDue(handedBack("maybe_submitted")));
  // anything that may have been submitted, or is finished, is never sent another way
  assert(!rerouteDue(handedBack("limit", { submit_clicked_at: "2026-10-21T00:00:00Z" })));
  for (const status of ["canceled", "submitted", "accepted", "rejected"]) assert(!rerouteDue(handedBack("limit", { status })), status);
  // once decided (sent another way, or left with the team) or taken over, the last entry isn't the hand-back
  const decided = handedBack("limit");
  assert(!rerouteDue({ ...decided, agent_log: [...decided.agent_log, { en: "Sending by mail instead", zh: "改为邮寄", kind: "reroute", ref: "mail" }] }));
  assert(!rerouteDue({ ...decided, agent_log: [...decided.agent_log, { en: "The Placetta team took over this filing", zh: "团队接手", kind: "take_over" }] }));
  assert(!rerouteDue(handedBack("limit", { agent_state: "running" })) && !rerouteDue(handedBack("limit", { channel: "portal" })));
});
Deno.test("the other way follows the same rules as the first, without the site", () => {
  const facts = { hasLogin: true, mailConnected: true };
  const signed = filing({ signature: { name: "A", signed_at: "n", kind: "drawn" } });
  // the agency's site failed; it also takes email, fax and mail: email first, as pick() would
  assertEquals(fallback(signed, dest({ portal: "x.gov", email: "a@x.gov" }), ENV, facts), "email");
  assertEquals(fallback(signed, dest({ portal: "x.gov" }), ENV, facts), "fax");
  assertEquals(fallback(signed, dest({ portal: "x.gov", fax: undefined }), ENV, facts), "mail");
  // never the site again
  assertEquals(fallback(signed, dest({ portal: "x.gov", fax: undefined, mail: undefined }), ENV, facts), "team");
  // a fee keeps it off email, fax and mail (Placetta never sends money): the team
  assertEquals(fallback(filing({}, { fee_estimate: 50 }), dest({ portal: "x.gov", email: "a@x.gov" }), ENV, facts), "team");
  // a wet signature: the hand-signed copy by fax when there is one, else the team
  assertEquals(fallback(signed, dest({ portal: "x.gov", signature: "wet" }), ENV, facts), "team");
  // a channel switched off isn't used; no destination at all is the team's
  const noFax = envFrom((k) => ({ FILER_AGENCIES: "test-form", FILER_CHANNELS: "mail", TELNYX_API_KEY: "k", TELNYX_FAX_CONNECTION_ID: "c", TELNYX_FAX_FROM: "+1", LOB_API_KEY: "test_x", LOB_FROM: "{}" } as Record<string, string>)[k]);
  assertEquals(fallback(signed, dest({ portal: "x.gov" }), noFax, facts), "mail");
  assertEquals(fallback(signed, undefined, ENV, facts), "team");
  // what goes by paper gets the paper checks: the filled form must be in Documents
  assert(check(filing({ pdf_path: undefined }), dest({ portal: "x.gov" }), { docPaths: docs }, "mail").some((p) => p.kind === "file"));
  assertEquals([...PORTAL_FAILED].sort(), ["account_authority", "account_identity", "account_no_mail", "account_unknown", "captcha_reroute", "left_portal", "limit", "no_live_view", "no_portal", "page_injection", "portal_blocked", "portal_failed", "review_differs", "teach_incomplete", "unverified_playbook", "worker_asleep"]);
});

Deno.test("a filing Odelia can't send goes to the business with a packet: why, where, signature, fee, and I've sent it", () => {
  const d = dest({ signature: "wet", payment: "with_filing", portal: "permits.city.gov", portalUrl: "https://permits.city.gov/apply", email: "permits@city.gov", attach: ["Site plan"] });
  const p = handoffPacket(filing({ form: { en: "Sign Permit", zh: "招牌许可" } }, { fee_estimate: 120 }), d, b("The agency's fee goes with this filing."));
  assert(p.en.startsWith("The agency's fee goes with this filing.") && p.en.includes("filing-packet.pdf") && p.en.includes("sign it by hand") && p.en.includes("$120"));
  assert(p.en.includes("https://permits.city.gov/apply") && p.en.includes("I've sent it") && p.en.includes("confirmation number") && !/team/i.test(p.en));
  assert(p.zh.includes("filing-packet.pdf") && p.zh.includes("120 美元") && p.zh.includes("我已发出") && !p.zh.includes("团队"));
  for (const want of ["permits@city.gov", "+1304", "2 Main St", "Site plan", "sign by hand", "a check or money order goes with it"]) assert(p.lines.some((l) => l.includes(want)), want);
  assert(p.lines.every((l) => l.length <= 90 || !l.includes(" ")));
  assertEquals(p.link, "https://permits.city.gov/apply");
  // check first when something may already have gone
  const c = handoffPacket(filing(), dest(), b("Odelia can't tell whether the email reached the agency."), { check: true });
  assert(c.en.includes("First check whether the agency already has it") && c.lines.includes("First:"));
  // no destination: the agency's own page when Placetta researched one, else ask the agency
  const t = handoffPacket(filing(), undefined, b("x"), { agencyWhy: "Filed in person with the Fire Marshal's Office.", agencySource: "https://agency.gov/fire" });
  assert(t.en.includes("https://agency.gov/fire") && t.lines.some((l) => l.includes("Fire Marshal")));
  assert(handoffPacket(filing(), undefined, b("x")).en.includes("doesn't have the agency's address"));
  // an owner-only form keeps its owner packet
  assert(handoffPacket(filing(), dest({ owner: { why: "Only the owner.", url: "https://a.gov" } }), b("ignored")).en.includes("owner-packet.pdf"));
});

Deno.test("the ways to send follow the agency: its site, email, fax, mail, the foreign fax and address for a foreign owner", () => {
  const w = waysToSend(dest({ portal: "x.gov", tenant: "/agency", email: "a@x.gov" }), filing().payload);
  assertEquals(w.en.length, 4);
  assert(w.en[0].includes("https://x.gov/agency") && w.en[2].includes("+13045550100") && w.en[3].includes("Agency Intl"));
  assertEquals(waysToSend(undefined, filing().payload).en, []);
  assertEquals(waysToSend(dest({ fax: undefined, mail: undefined }), filing().payload).link, null);
});

Deno.test("why Odelia isn't sending it, in pick()'s order", () => {
  const f = { hasLogin: false, mailConnected: true };
  assert(whyYours(filing(), undefined, ENV, f).en.includes("checked way"));
  assert(whyYours(filing({ official: "hou-fire" }), undefined, ENV, f).en.includes("Fire Marshal"));
  assert(whyYours(filing({}, { fee_estimate: 10 }), dest(), ENV, f).en.includes("never sends money"));
  assert(whyYours(filing(), dest({ signature: "wet" }), ENV, f).en.includes("handwritten"));
  const many = filing({ attachments: [1, 2, 3, 4, 5].map((i) => ({ name: `a${i}`, path: `${WS}/a${i}` })) });
  assert(whyYours(many, dest({ email: "a@x.gov" }), ENV, f).en.includes("attachments"));
  assert(whyYours(filing({ attachments: [{ name: "a", path: `${WS}/a` }] }), dest(), ENV, f).en.includes("only the form"));
  assert(whyYours(filing(), dest({ email: "a@x.gov", fax: undefined, mail: undefined }), ENV, { hasLogin: false, mailConnected: false }).en.includes("Connect one in Settings"));
  for (const x of [whyYours(filing(), dest(), ENV, f)]) assert(!/team/i.test(x.en) && !x.zh.includes("团队"));
});

Deno.test("I've sent it: the owner packet, the business's packet and a hand-signed form; nothing else", () => {
  assert(sentByYou({ kind: "needs_you", ref: OWNER_REF }));
  assert(sentByYou({ kind: "needs_you", ref: YOURS_REF }));
  assert(sentByYou({ kind: "wet_signature", ref: "upload" }));
  assert(sentByYou({ kind: "wet_signature" }));
  assert(!sentByYou({ kind: "needs_you", ref: "duplicate" }));
  assert(!sentByYou({ kind: "needs_you" }));
  assert(!sentByYou({ kind: "need_person" }));
  assert(!sentByYou(undefined));
});

Deno.test("the sweep: reroute a failed site, check first when it may have gone, the business's packet otherwise, Placetta's check for a day", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const h = (log: { kind: string; ref?: string; at?: string }[], over: Partial<Filing> = {}) =>
    handBackDue(filing({}, { channel: "team", agent_state: "handoff", agent_log: log.map((e) => ({ en: "", zh: "", ...e })), ...over }), now);
  for (const ref of PORTAL_FAILED) assertEquals(h([{ kind: "handoff", ref }]), "reroute");
  assertEquals(h([{ kind: "handoff", ref: "maybe_submitted" }]), "check");
  assertEquals(h([{ kind: "handoff", ref: "limit" }], { submit_clicked_at: "2026-11-01T00:00:00Z" }), "check");
  assertEquals(h([{ kind: "handoff" }]), "yours");
  assertEquals(h([{ kind: "retry" }]), "yours");
  // the Placetta team took it over by hand: theirs
  assertEquals(h([{ kind: "take_over" }]), null);
  // Placetta's check keeps its channel and waits REVIEW_HOURS
  const fresh = new Date(now - 3600e3).toISOString(), late = new Date(now - REVIEW_HOURS * 3600e3).toISOString();
  assertEquals(h([{ kind: "review_wait", at: fresh }], { channel: "email" }), null);
  assertEquals(h([{ kind: "review_wait", at: late }], { channel: "email" }), "review_late");
  assertEquals(h([{ kind: "review_page", at: late }], { channel: "portal" }), "review_late");
  assertEquals(h([{ kind: "review_page", at: late }], { channel: "portal", submit_clicked_at: late }), null);
  // not with Placetta, or finished
  assertEquals(h([{ kind: "handoff" }], { agent_state: "needs_you" }), null);
  assertEquals(h([{ kind: "handoff" }], { status: "submitted" }), null);
  assertEquals(h([{ kind: "handoff" }], { channel: "fax" }), null);
  assertEquals(h([]), null);
});

Deno.test("every shipped destination: with all four channels on, Placetta sends only a way the agency lists and allows, else the business gets a packet that says where", () => {
  const all = { hasLogin: true, mailConnected: true };
  const seen = { email: 0, fax: 0, mail: 0, portal: 0, owner: 0, team: 0 } as Record<string, number>;
  for (const [id, d] of Object.entries(DEST)) {
    for (const signed of [false, true]) {
      // signed: the card's signature, and for a wet-signature form the hand-signed copy uploaded to Documents
      const copy = `${WS}/receipts/signed.pdf`;
      const f = filing({ official: id, ...(signed ? { signature: { name: "A", signed_at: "n", kind: "drawn" as const } } : {}) },
        signed && d.signature === "wet" ? { agent_log: [{ en: "", zh: "", kind: "signed_copy", ref: copy }] } : {});
      const r = pick(f, d, ENV, all);
      seen[r]++;
      // email carries Placetta's e-signed copy, or for an ink form the hand-signed copy to an agency that takes email
      if (r === "email") assert(!!d.email && !feeBlocks(f, d) && (d.signature !== "wet" || !!signedCopy(f)), id);
      if (r === "fax") assert(!!d.fax && !feeBlocks(f, d) && (d.signature !== "wet" || canFaxSignedFor(f, d, ENV)), id);
      if (r === "mail") assert(!!d.mail && d.signature !== "wet" && !feeBlocks(f, d), id);
      if (r === "portal") assert(!!d.portal, id);
      if (r === "owner") assert(!!d.owner, id);
      // a wet signature never goes by mail (a mailed form is the original), and by email or fax only as the signed copy
      if (d.signature === "wet") assert(r !== "mail" && (!["email", "fax"].includes(r) || !!signedCopy(f)), `${id}: wet`);
      if (r === "team") {
        const p = handoffPacket(f, d, whyYours(f, d, ENV, all));
        assert(waysToSend(d, f.payload).en.length > 0 || !!d.owner, `${id}: the packet says where it goes`);
        if (d.byState) assert(waysToSend(d, f.payload).en.some((l) => /Kansas City|Ogden/.test(l)), `${id}: every IRS center, by state`);
        assert(!/\bteam\b/i.test(p.en) && !p.zh.includes("团队"), `${id}: no team in the packet`);
        assert(p.lines.length > 6, id);
      }
      // a paper send passes the checks once the filled form and signature are there (an authorization letter aside)
      if ((r === "email" || r === "fax" || r === "mail") && signed) {
        const problems = check(f, d, { docPaths: new Set([...docs, `${WS}/receipts/signed.pdf`]) }, r).filter((x) => !/authorization|授权/.test(x.en));
        assertEquals(problems.map((x) => x.en), [], id);
      }
    }
  }
  // certified mail carries Placetta's own copy, so it never takes a wet-signature form (a printed scan isn't the
  // original signature); the shipped mail-only agencies all want a wet signature or a fee, so they're the business's
  for (const c of ["email", "fax", "portal", "owner"]) assert(seen[c] > 0, `${c} is used by some destination`);
});

Deno.test("FILER_AGENCIES=portal switches on every agency website and nothing else; the worker is on while it beats", () => {
  const env = (agencies: string) => envFrom((k) => ({ FILER_AGENCIES: agencies, FILER_CHANNELS: "email,fax,mail,portal" } as Record<string, string>)[k]);
  const f = filing();
  assertEquals(selfFileScope(f, env("portal"), dest({ portal: "x.gov" })), "portal");
  assertEquals(selfFileScope(f, env("portal"), dest({ portal: undefined })), null, "no website: not switched on by the word");
  assertEquals(selfFileScope(f, env(""), dest({ portal: "x.gov" })), null);
  assertEquals(selfFileScope(f, env(f.payload.official ?? ""), dest({ portal: undefined })), "all");
  assert(workerOn("1", null) && !workerOn("0", { live: true }) && workerOn(undefined, { live: true }) && !workerOn(undefined, { live: false }) && !workerOn("", null));
  const on = env("portal"), off = envFrom(() => undefined);
  assertEquals(workerState(undefined, on, { live: true, seen_at: "t" }), "live");
  assertEquals(workerState(undefined, on, { live: false, seen_at: "t" }), "down");
  assertEquals(workerState(undefined, on, { live: false, seen_at: null }), "not_set_up");
  assertEquals(workerState("0", on, { live: true, seen_at: "t" }), "off");
  assertEquals(workerState(undefined, off, { live: true, seen_at: "t" }), "off", "the portal channel isn't on");
});

Deno.test("sent as agent only when the database marked it and the payload names the same packet", () => {
  const A = "22222222-2222-4222-8222-222222222222";
  assert(asAgent(filing({ agent: { auth: A } } as Partial<Filing["payload"]>, { agent_auth: A })));
  assert(!asAgent(filing({ agent: { auth: A } } as Partial<Filing["payload"]>)), "a payload alone (a customer's own insert loses the mark) is not enough");
  assert(!asAgent(filing({}, { agent_auth: A })), "nor the mark with no packet in the payload");
  assert(!asAgent(filing({ agent: { auth: "33333333-3333-4333-8333-333333333333" } } as Partial<Filing["payload"]>, { agent_auth: A })), "nor another packet");
});

Deno.test("a fee that goes with a mailed form: a Lob check under the fee authority and cap, only with checks on; otherwise the team as today", () => {
  const CHECKS = envFrom((k) => ({ FILER_AGENCIES: "test-form", FILER_CHANNELS: "email,fax,mail,portal", FILER_ENABLED: "1", LOB_API_KEY: "test_x", LOB_FROM: "{}",
    STRIPE_ISSUING_ON: "1", LOB_CHECK_BANK_ACCOUNT: "bank_8cfeba6c0f6e2c1" } as Record<string, string>)[k]);
  assertEquals(ENV.checks, false, "off by default");
  assertEquals(CHECKS.checks, true);
  assertEquals(envFrom((k) => ({ LOB_API_KEY: "x", LOB_FROM: "{}", STRIPE_ISSUING_ON: "1", LOB_CHECK_BANK_ACCOUNT: "not-a-bank" } as Record<string, string>)[k]).checks, false, "a bank account id from Lob");
  assertEquals(envFrom((k) => ({ LOB_API_KEY: "x", LOB_FROM: "{}", LOB_CHECK_BANK_ACCOUNT: "bank_1" } as Record<string, string>)[k]).checks, false, "Placetta paying fees switched off");
  const d = dest({ fax: undefined, payment: "with_filing" });
  const f = filing({}, { fee_estimate: 50 });
  const authorized = { hasLogin: false, mailConnected: false, feeAuthority: true };
  assertEquals(pick(f, d, CHECKS, authorized), "mail");
  // every other case: the team, exactly as before
  assertEquals(pick(f, d, ENV, authorized), "team", "checks off");
  assertEquals(pick(f, d, CHECKS, { ...authorized, feeAuthority: false }), "team", "no authority");
  assertEquals(pick(f, dest({ fax: undefined, payment: "portal" }), CHECKS, authorized), "team", "a fee the agency takes online");
  assertEquals(pick(f, dest({ fax: undefined, payment: "with_filing", signature: "wet" }), CHECKS, authorized), "team", "a handwritten signature");
  assertEquals(pick(filing({ attachments: [{ name: "a.pdf", path: "p" }] }, { fee_estimate: 50 }), d, CHECKS, authorized), "team", "more than the form");
  assertEquals(pick(f, dest({ fax: undefined, mail: undefined, payment: "with_filing" }), CHECKS, authorized), "team", "no mailing address");
  assertEquals(pick(f, d, { ...CHECKS, channels: ["email", "fax", "portal"] }, authorized), "team", "mail switched off");
  assertEquals(whyYours(f, d, CHECKS, { ...authorized, feeAuthority: false }).en, "The agency's fee goes with this filing, and nobody has authorized Placetta to pay it (Autopilot, or your approval of the fee).");
  assertEquals(whyYours(f, d, ENV, authorized).en, "The agency's fee goes with this filing, and Placetta never sends money.");
  // the exact fee, never above the cap
  assertEquals([checkCents(f, 5000), checkCents(f, 4999), checkCents(filing(), 5000)], [5000, null, null]);
  const body = lobCheckBody({ filing: filing({ form: b("Assumed name certificate") }, { fee_estimate: 25 }), purchase: "pu-1", to: { address_line1: "1 Main St", address_city: "Town", address_state: "OH", address_zip: "45999", name: "Agency" },
    payee: "Secretary of State of Ohio, Business Services", from: { name: "Placetta" }, bank: "bank_1", cents: 2500, file: "https://x/signed.pdf", business: "Acme LLC" });
  assertEquals([body.amount, body.bank_account, body.mail_type, body.to.name, body.memo, body.attachment, body.metadata], [25, "bank_1", "usps_first_class", "Secretary of State of Ohio, Business Ser", "Assumed name certificate", "https://x/signed.pdf", { filing: "f1", purchase: "pu-1" }]);
  assert(body.message.length <= 400 && /enclosed/.test(body.message));
});
