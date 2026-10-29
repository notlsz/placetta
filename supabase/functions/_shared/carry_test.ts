// deno test _shared/carry_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { actFor, agencyDomains, answerAsks, answerMail, answerRoute, appealRoute, asksIn, bookingEmail, bookingMail, carriesNumber, chaseStep, checkRead, classifyAgencyMail, confirmFromMail,
  dateIn, feeIn, inquiryMail, inspectionMoves, licenseMoment, matchFiling, oneQuestion, photoAuditPrompt, portalCheckDue, portalOpen, prepMessage, readNews, windowIn, workspaceAddress, wsTagOf,
  type Candidate, type Profile } from "./carry.ts";

const b = (en: string, zh = en) => ({ en, zh });
const DASH = /[–—]/;

Deno.test("an agency's mail is classified in code, and a denial's words outrank an approval's", () => {
  assertEquals(classifyAgencyMail("Your permit has been issued", "Congratulations, your health permit is attached.").kind, "approved");
  assertEquals(classifyAgencyMail("Application status", "We regret that your application has not been approved.").kind, "denied");
  assertEquals(classifyAgencyMail("Notice of denial", "The application is denied.").kind, "denied");
  assertEquals(classifyAgencyMail("Plan check comments", "Corrections required: 1. Provide a floor plan.").kind, "deficiency");
  assertEquals(classifyAgencyMail("Request for additional information", "Please provide a copy of your lease.").kind, "rfi");
  assertEquals(classifyAgencyMail("Invoice 2231", "Amount due: $245.00").kind, "fee_due");
  assertEquals(classifyAgencyMail("Inspection confirmed", "Your inspection is scheduled for 2026-11-12 between 8:00 AM and 12:00 PM.").kind, "inspection_scheduled");
  assertEquals(classifyAgencyMail("Hello", "Our office is closed Friday.").kind, "other");
  // an approval with a fee still due: the fee first, and less sure
  const mixed = classifyAgencyMail("Approved", "Approved once the balance due of $50 is paid.");
  assertEquals(mixed.kind, "fee_due");
  assert(mixed.confidence < 0.8);
  // subject and text together are surer than either
  assert(classifyAgencyMail("Permit issued", "Your permit has been issued.").confidence > classifyAgencyMail("Update", "Your permit has been issued.").confidence);
});

Deno.test("numbers, dates, windows, fees and asks come out of the agency's words", () => {
  assert(carriesNumber("Re: application A-2026-0045123", "A20260045123"));
  assert(!carriesNumber("call 408 555", "4085"));               // too short to trust
  assertEquals(dateIn("set for November 12, 2026 in the morning", "2026-10-28"), "2026-11-12");
  assertEquals(dateIn("on 11/3/2026", "2026-10-28"), "2026-11-03");
  assertEquals(dateIn("was 2026-01-01", "2026-10-28"), null);   // in the past
  assertEquals(windowIn("between 8:00 AM and 12:00 PM"), "08:00-12:00");
  assertEquals(windowIn("arrive in the afternoon"), "afternoon");
  assertEquals(feeIn("Amount due: $1,245.50"), 1245.5);
  const asks = asksIn("Hello,\nPlease provide the following:\n1. A copy of the signed lease\n2. Certificate of insurance\nThank you.\n> On Oct 1 we wrote: please provide everything");
  assertEquals(asks.includes("A copy of the signed lease"), true);
  assertEquals(asks.includes("Certificate of insurance"), true);
  assert(!asks.some((x) => /everything/.test(x)));             // the quoted thread is not read
});

Deno.test("a mail finds its filing by thread, by number from the agency, or by the agency's domain when only one is open", () => {
  const c = (id: string, o: Partial<Candidate> = {}): Candidate => ({ id, workspace_id: "w", app_id: id, status: "submitted", confirmation_number: null, domains: ["sanjoseca.gov"], threads: [], ...o });
  const a = c("a", { confirmation_number: "BT-778812", threads: ["<m1@placetta>"] }), z = c("z", { confirmation_number: "BT-990001" });
  assertEquals(matchFiling({ from: "clerk@sanjoseca.gov", subject: "Re: x", text: "", inReplyTo: "<m1@placetta>" }, [a, z])?.by, "thread");
  assertEquals(matchFiling({ from: "clerk@sanjoseca.gov", subject: "BT 990001", text: "" }, [a, z])?.filing.id, "z");
  // a number from a stranger's domain proves nothing
  assertEquals(matchFiling({ from: "x@gmail.com", subject: "BT-990001", text: "" }, [a, z]), null);
  // a number from another government sender is fine
  assertEquals(matchFiling({ from: "notice@cdtfa.ca.gov", subject: "BT-990001", text: "" }, [a, z])?.by, "confirmation");
  // domain alone: only when one filing is open with that agency
  assertEquals(matchFiling({ from: "clerk@permits.sanjoseca.gov", subject: "hello", text: "" }, [a, z]), null);
  assertEquals(matchFiling({ from: "clerk@permits.sanjoseca.gov", subject: "hello", text: "" }, [a])?.by, "domain");
  assertEquals(agencyDomains({ email: "Food-COO@houstontx.gov", portal: "www.sjpermits.org", urls: ["https://aca-prod.accela.com/x", "nope"] }).sort(), ["houstontx.gov", "sjpermits.org"]);
  const addr = workspaceAddress("odelia@in.placetta.com", "1a2b3c4d-5e6f-7a8b-9c0d-ffffffffffff");
  assertEquals(addr, "odelia+w1a2b3c4d5e6f@in.placetta.com");
  assertEquals(wsTagOf([addr], ["odelia@in.placetta.com"]), "1a2b3c4d5e6f");
  assertEquals(wsTagOf(["odelia+w1a2b3c4d5e6f@evil.com"], ["odelia@in.placetta.com"]), null);
});

Deno.test("news moves the filing only when it's sure: a thread, a number or a portal read, read clearly", () => {
  const n = b("Health permit"), ag = b("County health");
  assertEquals(actFor({ kind: "approved", confidence: 0.9, by: "confirmation" }, n, ag), { status: "accepted", next: "license", title: b("County health approved the health permit", "County health批准了Health permit") });
  assertEquals(actFor({ kind: "approved", confidence: 0.9, by: "domain" }, n, ag).next, "confirm");
  assertEquals(actFor({ kind: "approved", confidence: 0.65, by: "thread" }, n, ag).status, undefined);
  assertEquals(actFor({ kind: "denied", confidence: 0.9, by: "portal" }, n, ag).next, "appeal");
  assertEquals(actFor({ kind: "rfi", confidence: 0.8, by: "thread" }, n, ag).status, "needs_info");
  assertEquals(actFor({ kind: "other", confidence: 0, by: "thread" }, n, ag).next, "read");
});

const profile: Profile = {
  business: "Tea House LLC",
  facts: [{ label: b("Square footage"), value: b("1,450 sq ft") }, { label: b("Hours of operation"), value: b("8am to 9pm daily") }],
  fields: [{ label: b("Seating capacity"), value: "32" }],
  docs: [{ id: "d1", name: "Lease 2026.pdf", path: "w/email/lease.pdf" }, { id: "d2", name: "COI.pdf", tag: b("Insurance"), path: "w/coi.pdf", app: "hp" }],
};

Deno.test("a request is answered from the workspace where it holds the answer, and never with what only a person gives", () => {
  const r = answerAsks(["A copy of the lease", "Certificate of insurance", "Square footage of the space", "Seating capacity", "Signed affidavit of ownership", "Floor plan"], profile, "hp");
  assertEquals(r.answers.map((a) => a.doc?.name ?? a.fact?.value), ["Lease 2026.pdf", "COI.pdf", "1,450 sq ft", "32"]);
  assertEquals(r.missing, ["Signed affidavit of ownership", "Floor plan"]);
  assertEquals(answerAsks(["Driver's license of the owner"], profile).missing.length, 1);
});

Deno.test("the answer goes back the way it came: as agent by email, a draft without a packet, a resubmission on a portal, else one question", () => {
  const ag = b("County health", "县卫生局");
  assertEquals(answerRoute({ missing: [], asks: 2, authority: true, channel: "email", replyTo: "clerk@x.gov", agency: ag, agencyAddress: true }).route, "send_as_agent");
  // an address that isn't the agency's own (a thread or a printed number tied it): the owner taps
  assertEquals(answerRoute({ missing: [], asks: 2, authority: true, channel: "email", replyTo: "records@evil.example", agency: ag }).route, "draft_for_owner");
  assertEquals(answerRoute({ missing: [], asks: 2, authority: true, channel: "email", replyTo: "records@evil.example", agency: ag, agencyAddress: false }).route, "draft_for_owner");
  assertEquals(answerRoute({ missing: [], asks: 2, authority: false, channel: "email", replyTo: "clerk@x.gov", agency: ag }).route, "draft_for_owner");
  assertEquals(answerRoute({ missing: [], asks: 2, authority: true, channel: "portal", replyTo: null, agency: ag }).route, "resubmit");
  const q = answerRoute({ missing: ["Floor plan", "Signed affidavit"], asks: 3, authority: true, channel: "email", replyTo: "c@x.gov", agency: ag });
  assertEquals(q.route, "ask_owner");
  if (q.route === "ask_owner") {
    assertEquals((q.question.en.match(/\?/g) ?? []).length, 1);   // one question
    assert(q.question.zh.includes("县卫生局"));
  }
  assertEquals(answerRoute({ missing: [], asks: 0, authority: true, channel: "email", replyTo: "c@x.gov", agency: ag }).route, "ask_owner");
  const one = oneQuestion(["a", "b", "c", "d", "e"], ag);
  assert(one.en.includes("2 more"));
  const m = answerMail({ business: "Tea House LLC", agentName: "Jane Agent", appName: "health permit", confirmation: "HP-123456", subject: "Request for information", answers: answerAsks(["A copy of the lease", "Square footage"], profile).answers });
  assert(m.subject.startsWith("Re: "));
  assert(/AI assistant/.test(m.text) && /authorized agent/.test(m.text) && /HP-123456/.test(m.text));
  assertEquals(m.attachments, [{ name: "Lease 2026.pdf", path: "w/email/lease.pdf" }]);
  for (const s of [m.text, one.en, one.zh]) assert(!DASH.test(s));
});

Deno.test("the stale chase: email the agency past its time, call five days later if nothing moved, never twice in 14 days", () => {
  const base = { status: "submitted", submitted_at: "2026-09-01", usualDays: 30, lastMovement: null, canEmail: true, canCall: true };
  assertEquals(chaseStep({ ...base, today: "2026-09-20", log: [] }).act, "none");                                   // within its time
  assertEquals(chaseStep({ ...base, today: "2026-10-10", log: [] }).act, "email");
  assertEquals(chaseStep({ ...base, today: "2026-10-12", log: [{ step: "email", day: "2026-10-10" }] }).act, "none"); // waiting on it
  assertEquals(chaseStep({ ...base, today: "2026-10-15", log: [{ step: "email", day: "2026-10-10" }] }).act, "call");
  assertEquals(chaseStep({ ...base, today: "2026-10-18", log: [{ step: "email", day: "2026-10-10" }, { step: "call", day: "2026-10-15" }] }).act, "none");
  assertEquals(chaseStep({ ...base, today: "2026-10-24", log: [{ step: "email", day: "2026-10-10" }, { step: "call", day: "2026-10-15" }] }).act, "email");
  // the agency moved it this week: no chase
  assertEquals(chaseStep({ ...base, lastMovement: "2026-10-08", today: "2026-10-10", log: [] }).act, "none");
  // no agency inbox (or no packet): straight to the call
  assertEquals(chaseStep({ ...base, canEmail: false, today: "2026-10-10", log: [] }).act, "call");
  assertEquals(chaseStep({ ...base, status: "needs_info", today: "2026-10-10", log: [] }).act, "none");
  const m = inquiryMail({ business: "Tea House", agentName: "Jane Agent", appName: "health permit", agency: "County health", confirmation: "HP-1", submitted: "2026-09-01", waited: 40, usual: 30 });
  assert(/AI assistant/.test(m.text) && /40 days/.test(m.text) && !DASH.test(m.text));
});

Deno.test("a portal is signed in to only in its hours, with a saved login, not too often, and within its rate limit", () => {
  const tue10 = new Date("2026-10-27T17:00:00Z");                  // 10:00 in Los Angeles
  const sun = new Date("2026-10-25T17:00:00Z"), night = new Date("2026-10-27T08:00:00Z");
  const h = { tz: "America/Los_Angeles" };
  assert(portalOpen(tue10, h)); assert(!portalOpen(sun, h)); assert(!portalOpen(night, h));
  const o = { status: "submitted", channel: "portal", hasLogin: true, now: tue10, hours: h, lastQueued: null, everyHours: 24, hostThisHour: 0, perHostPerHour: 6 };
  assertEquals(portalCheckDue(o).due, true);
  assertEquals(portalCheckDue({ ...o, hasLogin: false }).why, "no saved login");
  assertEquals(portalCheckDue({ ...o, channel: "email" }).due, false);
  assertEquals(portalCheckDue({ ...o, lastQueued: "2026-10-27T10:00:00Z" }).why, "checked recently");
  assertEquals(portalCheckDue({ ...o, hostThisHour: 6 }).why, "the portal's rate limit");
  assertEquals(portalCheckDue({ ...o, status: "accepted" }).due, false);
});

Deno.test("a portal read counts only when the receipt's number is the one on the page, and a license link only on the portal", () => {
  const page = "Application BT-778812 Status: Issued. Download license";
  const ok = checkRead({ state: "issued", status: "Issued", confirmation_seen: "BT 778812", license_link: "https://sjpermits.org/lic/1.pdf", expires: "2027-10-31" }, { confirmation: "BT-778812", pageText: page, host: "sjpermits.org" });
  assertEquals([ok.matched, ok.read.state, ok.read.license_link, ok.read.expires], [true, "issued", "https://sjpermits.org/lic/1.pdf", "2027-10-31"]);
  assertEquals(readNews(ok.read), "approved");
  // the model says it saw the number, but it isn't on the page: nothing is decided
  assertEquals(checkRead({ state: "issued", status: "Issued", confirmation_seen: "BT-778812" }, { confirmation: "BT-778812", pageText: "Status: Issued", host: "sjpermits.org" }).read.state, "unknown");
  // another filing's number
  assertEquals(checkRead({ state: "denied", status: "Denied", confirmation_seen: "BT-111111" }, { confirmation: "BT-778812", pageText: page + " BT-111111", host: "sjpermits.org" }).matched, false);
  // a license link off the portal is dropped
  assertEquals(checkRead({ state: "issued", status: "Issued", confirmation_seen: "BT-778812", license_link: "https://evil.example/x.pdf" }, { confirmation: "BT-778812", pageText: page, host: "sjpermits.org" }).read.license_link, null);
  assertEquals(checkRead({ state: "weird" as never, status: "x", confirmation_seen: "BT-778812" }, { confirmation: "BT-778812", pageText: page, host: "sjpermits.org" }).read.state, "unknown");
  assertEquals(readNews({ state: "needs_info", status: "x", asks: [], fee_usd: 40 }), "fee_due");
  assertEquals(readNews({ state: "needs_info", status: "x", asks: ["Lease"] }), "rfi");
  assertEquals(readNews({ state: "in_review", status: "x" }), null);
});

Deno.test("the license moment: approved, the PDF one tap away, and the renewal from the agency's date or its cycle, never made up", () => {
  const m = licenseMoment({ name: b("Health permit", "卫生许可"), agency: b("County health", "县卫生局"), number: "PR-1", expires: "2027-10-31", decided: "2026-10-28", today: "2026-10-28", pdf: true });
  assertEquals(m.renewal, { date: "2027-10-31", from: "agency" });
  assertEquals(m.title.en, "Your health permit is approved");
  assert(m.body.en.includes("Documents") && m.body.zh.includes("文件"));
  const c = licenseMoment({ name: b("Health permit"), agency: b("County health"), renews: b("Every year."), decided: "2026-10-28", today: "2026-10-28", pdf: false });
  assertEquals(c.renewal, { date: "2027-10-28", from: "cycle" });
  assertEquals(licenseMoment({ name: b("X"), agency: b("Y"), decided: "2026-10-28", today: "2026-10-28", pdf: false }).renewal, null);
  for (const s of [m.body.en, m.body.zh, c.body.en]) assert(!DASH.test(s));
});

Deno.test("an appeal is drafted for the owner's one tap, sent to counsel where advised, and never past its last day", () => {
  assertEquals(appealRoute({ found: true, route: "self_serve", lastDay: "2026-11-20", today: "2026-10-28" }), "draft_for_tap");
  assertEquals(appealRoute({ found: true, route: "attorney", lastDay: "2026-11-20", today: "2026-10-28" }), "counsel");
  assertEquals(appealRoute({ found: true, route: "self_serve", lastDay: "2026-10-01", today: "2026-10-28" }), "past");
  assertEquals(appealRoute({ found: true, route: "self_serve", lastDay: null, today: "2026-10-28" }), "read_letter");
  assertEquals(appealRoute({ found: false, route: null, lastDay: null, today: "2026-10-28" }), "read_letter");
});

Deno.test("inspections: a confirmation lands on the booking and Deadlines, email bookings and new times go as agent, photos get audited", () => {
  const bk = { id: "bk1", store: "s1", inspection: "health-preopening", name: b("Pre-opening inspection", "开业前检查"), agency: b("County health"), method: "email", status: "with_team", app: "hp", slots: ["2026-11-10, morning"], created: "x", updated: "2026-10-20T00:00:00Z" };
  const st = { bookings: [bk], deadlines: [{ id: "other" }] };
  const r = confirmFromMail(st, { app: "hp", agency: "County health", date: "2026-11-12", window: "08:00-12:00", confirmation: "C-9", now: "2026-10-28T00:00:00Z" })!;
  assertEquals(r.booking.status, "booked");
  assertEquals(r.booking.slot, "2026-11-12, 08:00-12:00");
  assertEquals((r.state.deadlines as { id: string; date?: string }[]).map((d) => d.id), ["other", "insp-bk1-2026-11-12"]);
  assertEquals(confirmFromMail(st, { app: "zz", agency: "Nobody", date: "2026-11-12", now: "x" }), null);
  assertEquals(bookingEmail("The DPH plan reviewer (DPH-OTCPlanCheck@sfdph.org)"), "dph-otcplancheck@sfdph.org");
  const moves = inspectionMoves({ bookings: [bk, { ...bk, id: "bk2", status: "booked", slot: "2026-11-12, morning", reschedule: { slots: ["2026-11-14, morning"], at: "t" } },
    { ...bk, id: "bk3", status: "booked", slot: "2026-11-15, morning", method: "phone" }],
    docs: [{ id: "p1", name: "hand-sink.jpg", kind: "jpg", at: "2026-10-25T00:00:00Z", app: "hp" }, { id: "p2", name: "old.jpg", kind: "jpg", at: "2026-10-01T00:00:00Z", app: "hp" }] },
    { emailFor: (x) => (x.method === "email" ? "dph@sfdph.org" : null), today: "2026-10-28" });
  assertEquals(moves.map((m) => `${m.kind}:${m.booking.id}`), ["book_email:bk1", "reschedule_email:bk2", "photo_audit:bk2", "photo_audit:bk3"]);
  const audit = moves.find((m) => m.kind === "photo_audit")!;
  assert(audit.kind === "photo_audit" && audit.photos.join() === "hand-sink.jpg");
  assert(/in person/.test(photoAuditPrompt(bk as never, ["hand-sink.jpg"])));
  const p = prepMessage({ name: b("Pre-opening inspection"), agency: b("County health"), slot: "2026-11-12, morning" }, [b("Hand sink stocked"), b("Thermometers in every unit")]);
  assert(/in person/.test(p.body.en) && /Hand sink stocked/.test(p.body.en) && !DASH.test(p.body.en));
  const mail = bookingMail({ business: "Tea House", agentName: "Jane Agent", address: "1 Main St, San Jose", inspection: "Pre-opening inspection", slots: ["2026-11-14, morning"], reschedule: { from: "2026-11-12, morning" } });
  assert(/New time requested/.test(mail.subject) && /AI assistant/.test(mail.text) && /in person/.test(mail.text));
});
