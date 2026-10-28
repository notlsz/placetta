// deno test supabase/functions/file/sign_paper_test.ts
// Sign once, and paper without the owner: the per-form signature flag, the honest way each ink form is signed (a copy
// Placetta faxes or emails, or the original mailed back in Placetta's return envelope), the signing kit, the owner
// packets that stay the owner's and why, and what Lob and Telnyx tell Placetta back.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { DEST, destFor, destinationProblems, OWNER_KIND, OWNER_KIND_SAID, signFlag, SIGN_FLAG_SEED, type Dest } from "./destinations.ts";
import {
  canEmailSignedFor, check, envFrom, feeBlocks, type Filing, handoffPacket, kitAddress, ownerPacket, paperFile, pick, signKit, wetAsk, wetPath,
} from "./logic.ts";
import { agencyLetter, faxEvent, kitLetter, kitSendAt, lobEvent, lobSigned } from "./paper.ts";

const WS = "11111111-1111-1111-1111-111111111111";
const b = (s: string) => ({ en: s, zh: s });
const filing = (over: Partial<Filing["payload"]> = {}, f: Partial<Filing> = {}): Filing => ({
  id: "f1", workspace_id: WS, app_id: "app", title: b("Form"), status: "requested", channel: null, agent_state: null, agent_log: [],
  handoff_url: null, provider_ref: null, submit_clicked_at: null, attempts: 0, requirements_checked: false, confirmation_number: null, portal_url: null,
  payload: { official: "test-form", fields: [{ id: "l1", label: b("Legal name"), value: "Acme LLC" }], attachments: [], pdf_path: `${WS}/filings/f1.pdf`, ...over }, ...f,
});
const signedLog = [{ en: "", zh: "", kind: "signed_copy", ref: `${WS}/receipts/signed.pdf` }];
const agency = { name: "Agency", line1: "1 Main St", city: "Town", state: "OH", zip: "45999" };
const wet = (d: Partial<Dest> = {}): Dest => ({ signature: "wet", checked: "2026-10-01", source: "https://agency.gov/where", ...d });
const ENV = envFrom((k) => ({ FILER_AGENCIES: "test-form", FILER_CHANNELS: "email,fax,mail,portal", FILER_ENABLED: "1", TELNYX_API_KEY: "k", TELNYX_FAX_CONNECTION_ID: "c", TELNYX_FAX_FROM: "+1", LOB_API_KEY: "test_x", LOB_FROM: "{}" } as Record<string, string>)[k]);
const NO_LOB = { ...ENV, mail: false };
const mailbox = { hasLogin: false, mailConnected: true };
const DASHES = /[–—]/;

Deno.test("each form's signature flag: ink originals, an adopted e-signature, or Placetta's named agent, from a cited page", () => {
  assertEquals(signFlag("irs-ss4", DEST["irs-ss4"]), "wet");
  assertEquals(signFlag("irs-8832", DEST["irs-8832"]), "esign", "the IRS's e-signature list names Form 8832");
  assertEquals(signFlag("sj-building-ti", DEST["sj-building-ti"]), "agent");
  assertEquals(signFlag("fda-ffr", DEST["fda-ffr"]), "none");
  assertEquals(signFlag("not-a-form", undefined), null, "no destination: unknown, as before");
  for (const [id, s] of Object.entries(SIGN_FLAG_SEED)) assert(/^https:\/\//.test(s.source) && /^\d{4}-\d{2}-\d{2}$/.test(s.checked) && s.why.length > 20, id);
  // every destination has a flag, and only a seeded one says agent
  for (const [id, d] of Object.entries(DEST)) {
    const f = signFlag(id, d);
    assert(f !== null, id);
    if (f === "agent") assert(!!SIGN_FLAG_SEED[id], id);
  }
});

Deno.test("an agency that bills afterwards doesn't keep a form off email, fax or mail; a fee that goes with it still does", () => {
  const fee = filing({}, { fee_estimate: 450 });
  assert(!feeBlocks(fee, wet({ payment: "invoice" })));
  assert(feeBlocks(fee, wet({ payment: "portal" })), "a fee with no word that it's billed after stays off paper");
  assert(feeBlocks(fee, wet({})));
  assert(feeBlocks(filing(), wet({ payment: "with_filing" })));
  assert(feeBlocks(filing(), wet({ payment: "in_person" })));
});

Deno.test("an ink form's signed copy goes by fax first, then by email to an agency that takes email, never by certified mail", () => {
  const signed = filing({}, { agent_log: signedLog });
  assertEquals(pick(signed, wet({ fax: { us: "+18005550100" }, email: "a@agency.gov" }), ENV, mailbox), "fax");
  assertEquals(pick(signed, wet({ email: "a@agency.gov", payment: "invoice" }), ENV, mailbox), "email");
  assertEquals(pick(filing({}, { agent_log: signedLog, fee_estimate: 470 }), wet({ email: "a@agency.gov", payment: "invoice" }), ENV, mailbox), "email", "billed after");
  assertEquals(pick(signed, wet({ email: "a@agency.gov" }), ENV, { hasLogin: false, mailConnected: false }), "team", "no mailbox to send from");
  assertEquals(pick(signed, wet({ email: "a@agency.gov" }), { ...ENV, channels: ["fax", "mail", "portal"] }, mailbox), "team", "email switched off");
  assertEquals(pick(signed, wet({ mail: agency }), ENV, mailbox), "team", "a mailed form is the original");
  assertEquals(pick(filing(), wet({ email: "a@agency.gov" }), ENV, mailbox), "team", "not signed yet");
  assert(canEmailSignedFor(signed, wet({ email: "a@agency.gov" }), ENV, mailbox));
  assert(!canEmailSignedFor(filing({ attachments: Array.from({ length: 5 }, (_, i) => ({ name: `d${i}.pdf`, path: `${WS}/d${i}.pdf` })) }, { agent_log: signedLog }), wet({ email: "a@agency.gov" }), ENV, mailbox), "more than an email carries");
  // what goes: the hand-signed copy, else the filled form
  assertEquals(paperFile(signed), `${WS}/receipts/signed.pdf`);
  assertEquals(paperFile(filing()), `${WS}/filings/f1.pdf`);
  // the signed copy passes the checks for an email to the agency
  const problems = check(signed, wet({ email: "a@agency.gov" }), { docPaths: new Set([`${WS}/filings/f1.pdf`, `${WS}/receipts/signed.pdf`]) }, "email");
  assertEquals(problems, []);
});

Deno.test("the honest way each ink form is signed: a photo Placetta sends, the original back in a return envelope, or the packet", () => {
  assertEquals(wetPath(filing(), wet({ fax: { us: "+18005550100" } }), ENV, mailbox), { path: "photo", via: "fax" });
  assertEquals(wetPath(filing(), wet({ email: "a@agency.gov", payment: "invoice" }), ENV, mailbox), { path: "photo", via: "email" });
  assertEquals(wetPath(filing(), wet({ mail: agency, payment: "with_filing" }), ENV, mailbox), { path: "return" }, "the owner puts the check in the envelope");
  assertEquals(wetPath(filing(), wet({ mail: agency }), NO_LOB, mailbox), { path: "yours" }, "no Lob: the packet");
  assertEquals(wetPath(filing(), wet({ mail: agency, payment: "in_person" }), ENV, mailbox), { path: "yours" }, "paid at the counter");
  assertEquals(wetPath(filing({ attachments: [{ name: "lease.pdf", path: `${WS}/lease.pdf` }] }), wet({ mail: agency }), ENV, mailbox), { path: "yours" });
  assertEquals(wetPath(filing(), { ...wet(), signature: "drawn", mail: agency }, ENV, mailbox), { path: "yours" }, "not an ink form");
  // every shipped ink destination without a portal gets a way that isn't the owner printing and posting it, or says why not
  for (const [id, d0] of Object.entries(DEST)) {
    if (d0.signature !== "wet" || d0.portal || d0.owner) continue;
    const d = d0.byState ? destFor(id, { fields: d0.byState.from.map((x) => ({ id: x, value: `City, ${d0.byState!.groups[0].states[0]} 00000` })) })! : d0;
    const w = wetPath(filing({ official: id }), d, ENV, mailbox);
    if (w.path === "yours") assert(d.payment === "in_person" || !!d.ids || (!d.mail && !d.fax && !d.email), `${id}: has a way, but got the packet`);
  }
  // an ITIN application goes with the applicant's own identity documents: theirs to send, and the card says why
  const w7 = DEST["irs-w7"];
  assertEquals(wetPath(filing({ official: "irs-w7" }), w7, ENV, mailbox), { path: "yours" });
  assert(/identity documents/.test(handoffPacket(filing({ official: "irs-w7" }), w7, { en: "x", zh: "x" }).lines.join(" ")) || !!w7.ids);
});

Deno.test("the signing kit says what to do in plain ASCII, carries the agency's address for the return envelope, and the card says it in both languages", () => {
  const d = wet({ mail: { name: "Delaware Division of Corporations", line1: "401 Federal Street, Suite 4", city: "Dover", state: "DE", zip: "19901" }, payment: "with_filing" });
  const f = filing({ form: { en: "Certificate of Formation", zh: "成立证书" } }, { fee_estimate: 110 });
  const k = signKit(f, d, { path: "return" });
  assert(k.cover.every((l) => l.length <= 90 && /^[\x20-\x7e]*$/.test(l)), "the cover page prints");
  assert(k.cover.some((l) => /check or money order/.test(l)) && k.cover.some((l) => /\$110/.test(l)), "the fee goes in the envelope");
  assert(k.cover.some((l) => /I've sent it/.test(l)));
  assertEquals(k.slip, ["Delaware Division of Corporations", "401 Federal Street, Suite 4", "Dover DE 19901"]);
  const photo = signKit(filing(), wet({ fax: { us: "+18005550100" } }), { path: "photo", via: "fax" });
  assertEquals(photo.slip, null);
  assert(photo.cover.some((l) => /faxes it to the agency/.test(l)) && !photo.cover.some((l) => /return envelope/.test(l)));
  for (const x of [k, photo, { ...wetAsk(f, d, { path: "return" }), cover: [] }, { ...wetAsk(filing(), wet({ email: "a@agency.gov" }), { path: "photo", via: "email" }), cover: [] }]) {
    assert(x.en.length > 40 && x.zh.length > 20 && !DASHES.test(x.en) && !DASHES.test(x.zh), x.en);
  }
  assert(wetAsk(f, d, { path: "return" }).en.includes("Mail me the page") && wetAsk(f, d, { path: "return" }).en.includes("check"));
  assert(!wetAsk(filing(), wet({ mail: agency, payment: "none" }), { path: "return" }).en.includes("check"), "no fee, no check");
});

Deno.test("the kit's address: a name, a street, a city, a state and a ZIP code, or nothing is mailed", () => {
  assertEquals(kitAddress({ name: " Mei Chen ", line1: "1 Market St", city: "San Jose", state: "ca", zip: "95112" }), { name: "Mei Chen", line1: "1 Market St", city: "San Jose", state: "CA", zip: "95112" });
  assertEquals(kitAddress({ name: "Mei", line1: "1 Market St", line2: "Suite 2", city: "San Jose", state: "CA", zip: "95112-1234" })?.line2, "Suite 2");
  assertEquals(kitAddress({ name: "Mei", line1: "1 Market St", city: "San Jose", state: "California", zip: "95112" }), null);
  assertEquals(kitAddress({ name: "Mei", line1: "1 Market St", city: "San Jose", state: "CA", zip: "9511" }), null);
  assertEquals(kitAddress(null), null);
  assertEquals(kitAddress({ name: "Mei\nChen", line1: "1 Market\tSt", city: "San Jose", state: "CA", zip: "95112" })?.name, "Mei Chen", "no line breaks reach the label");
});

Deno.test("Lob: the kit is first class and held for the undo window; a return kit adds the envelope and perforates the slip; the agency gets certified mail with return receipt", () => {
  const to = { name: "Mei Chen", line1: "1 Market St", city: "San Jose", state: "CA", zip: "95112" };
  const sendAt = kitSendAt(Date.parse("2026-11-05T10:00:00Z"), 10);
  assertEquals(sendAt, "2026-11-05T10:10:00.000Z");
  assertEquals(kitSendAt(Date.parse("2026-11-05T10:00:00Z"), 0), "2026-11-05T10:05:00.000Z", "at least five minutes, so a cancel lands first");
  const r = kitLetter({ filingId: "f1", official: "de-llc-form", to, from: { name: "Placetta" }, file: "https://x/kit.pdf", pages: 4, sendAt, returnKit: true });
  assertEquals([r.mail_type, r.send_date, r.return_envelope, r.perforated_page, (r.metadata as { purpose: string }).purpose], ["usps_first_class", sendAt, true, 4, "sign_kit"]);
  assertEquals(kitLetter({ filingId: "f1", official: "x", to, from: {}, file: "u", pages: 4, sendAt, returnKit: true, returnEnvelope: " no_9_brm " }).return_envelope, "no_9_brm");
  const p = kitLetter({ filingId: "f1", official: "irs-ss4", to, from: {}, file: "u", pages: 3, sendAt, returnKit: false });
  assert(!("return_envelope" in p) && !("perforated_page" in p));
  const a = agencyLetter({ filingId: "f1", official: "irs-8832", to: { ...agency }, from: {}, file: "u" });
  assertEquals([a.extra_service, (a.metadata as { purpose: string }).purpose, "send_date" in a], ["certified_return_receipt", "filing", false]);
});

Deno.test("Lob webhooks: only Lob's signature, only fresh, and each letter event means what it says on the timeline", async () => {
  const secret = "whsec_test_secret_1234";
  const raw = JSON.stringify({ id: "evt_1", event_type: { id: "letter.certified.delivered" }, body: { id: "ltr_abc123" } });
  const now = Date.parse("2026-11-05T10:00:00Z"), ts = String(now);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${raw}`)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  assert(await lobSigned(secret, ts, raw, sig, now));
  assert(await lobSigned(secret, String(now / 1000), raw, [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${now / 1000}.${raw}`)))].map((x) => x.toString(16).padStart(2, "0")).join(""), now), "seconds too");
  assert(!(await lobSigned(secret, ts, raw + " ", sig, now)), "a changed body");
  assert(!(await lobSigned("whsec_other_secret", ts, raw, sig, now)), "another secret");
  assert(!(await lobSigned(secret, ts, raw, sig, now + 6 * 60_000)), "stale");
  assert(!(await lobSigned("", ts, raw, sig, now)), "no secret set: refused");
  assert(!(await lobSigned(secret, ts, raw, "nothex", now)));

  const ev = (type: string, letter = "ltr_abc123") => ({ id: "evt_" + type, event_type: { id: type }, body: { id: letter } });
  assertEquals(lobEvent(ev("letter.certified.delivered"), "filing")?.done, "delivered");
  assertEquals(lobEvent(ev("letter.in_transit"), "filing")?.done, undefined);
  assertEquals(lobEvent(ev("letter.certified.returned_to_sender"), "filing")?.problem, "returned");
  assertEquals(lobEvent(ev("letter.certified.issue"), "filing")?.problem, "issue");
  assertEquals(lobEvent(ev("letter.return_envelope.in_transit"), "sign_kit")?.done, "posted_back", "the owner's signed original is on its way to the agency");
  assertEquals(lobEvent(ev("letter.return_envelope.in_transit"), "filing"), null, "a filing letter has no return envelope");
  assertEquals(lobEvent(ev("letter.deleted"), "sign_kit")?.canceled, true);
  assertEquals(lobEvent(ev("letter.rendered_pdf"), "filing"), null);
  assertEquals(lobEvent(ev("postcard.delivered"), "filing"), null);
  assertEquals(lobEvent(ev("letter.mailed", "not-a-letter"), "filing"), null);
  const said = lobEvent(ev("letter.processed_for_delivery"), "sign_kit")!;
  assert(/on its way to you/.test(said.en) && !DASHES.test(said.en) && !DASHES.test(said.zh));
});

Deno.test("Telnyx: delivered and failed settle a fax; queued, prepared and dialing go on the timeline; anything else is ignored", () => {
  assertEquals(faxEvent("fax.delivered")?.settle, "delivered");
  assertEquals(faxEvent("fax.failed")?.settle, "failed");
  for (const t of ["fax.queued", "fax.media.processed", "fax.sending.started"]) { const e = faxEvent(t)!; assert(!e.settle && e.en.length > 5 && e.zh.length > 2, t); }
  assertEquals(faxEvent("call.initiated"), null);
});

Deno.test("owner packets: each says in a word why it stays the owner's, the card leads with the plain reason in both languages", () => {
  assertEquals(destinationProblems(), []);
  const owners = Object.entries(DEST).filter(([, d]) => d.owner);
  assertEquals(owners.length, 26, "31 before: California ABC's application and its four uploads now go on ABC's own site");
  for (const [id] of owners) assert(!!OWNER_KIND[id], id);
  const count = (k: string) => owners.filter(([id]) => OWNER_KIND[id] === k).length;
  assertEquals([count("exam"), count("id"), count("notary"), count("office"), count("payment")], [16, 2, 1, 6, 1]);
  for (const s of Object.values(OWNER_KIND_SAID)) assert(!DASHES.test(s.en) && !DASHES.test(s.zh) && s.zh.length > 8);
  const p = ownerPacket(filing({ official: "nyc-fpc", form: b("Food Protection Certificate") }), DEST["nyc-fpc"]);
  assert(p.en.includes(OWNER_KIND_SAID.exam.en) && p.zh.includes(OWNER_KIND_SAID.exam.zh) && p.lines.some((l) => l.startsWith("It's a course and an exam")));
  assert(destinationProblems({ x: { owner: { why: "In person at the office", url: "https://agency.gov" }, signature: "none", checked: "2026-10-01", source: "https://agency.gov" } }).every((m) => !m.includes("OWNER_KIND")), "a test table isn't held to the shipped list");
});

Deno.test("California ABC: the original license goes on ABC's own site as the business's consultant, the uploads with it; the notary stays the owner's", () => {
  const d = DEST["ca-abc"];
  assertEquals([d.portal, d.onBehalf, d.payment, d.signature, !!d.owner, !!d.notReady], ["services.abc.ca.gov", "allowed", "portal", "wet", false, false]);
  assert((d.attach ?? []).some((a) => /notarized Application Signature Sheet/.test(a)), "each signer's notarized sheet goes with it");
  for (const id of ["ca-abc-211", "ca-abc-257", "ca-abc-255", "ca-abc-140"]) assert(DEST[id].portal === "services.abc.ca.gov" && /inside ABC's online application/.test(DEST[id].notReady ?? ""), id);
  for (const id of ["ca-abc-217", "ca-abc-258", "ca-abc-247", "ca-abc-243", "ca-abc-256", "ca-abc-244"]) assertEquals(OWNER_KIND[id], "office", id);
  assertEquals(pick(filing({ official: "ca-abc" }), d, ENV, { hasLogin: true, mailConnected: true }), "portal");
  // the business's packet, if the site can't be used, says the fee is paid on the site and what goes with it
  const pk = handoffPacket(filing({ official: "ca-abc" }), d, b("The site didn't work."));
  assert(pk.lines.some((l) => /notarized/.test(l)));
});
