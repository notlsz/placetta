// deno test supabase/functions/file/moved_test.ts
// The forms moved from the Placetta team to Odelia on 2026-10-24 (destinations.ts): each one's route, the guards that
// still hold (the owner's own login, the fee on the agency's page, a hand signature first), and the by-state routing the
// IRS's service centers need.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { DEST, destFor, destinationProblems, stateOf, TEAM_ONLY } from "./destinations.ts";
import { canFaxSignedFor, check, envFrom, fallback, type Filing, pick } from "./logic.ts";

const WS = "11111111-1111-1111-1111-111111111111";
const b = (s: string) => ({ en: s, zh: s });
const filing = (payload: Filing["payload"], f: Partial<Filing> = {}): Filing => ({
  id: "f1", workspace_id: WS, app_id: "a1", title: b("Form"), status: "requested", channel: null, agent_state: null, agent_log: [],
  handoff_url: null, provider_ref: null, submit_clicked_at: null, attempts: 0, requirements_checked: false, confirmation_number: null, portal_url: null,
  payload: { attachments: [], pdf_path: `${WS}/filings/f1.pdf`, ...payload }, ...f,
});
const ENV = envFrom((k) => ({ FILER_AGENCIES: "x", FILER_CHANNELS: "email,fax,mail,portal", FILER_ENABLED: "1", TELNYX_API_KEY: "k", TELNYX_FAX_CONNECTION_ID: "c", TELNYX_FAX_FROM: "+1", LOB_API_KEY: "test_x", LOB_FROM: "{}" } as Record<string, string>)[k]);
const facts = { hasLogin: true, mailConnected: true };
const noLogin = { hasLogin: false, mailConnected: true };
const signedLog = [{ en: "", zh: "", kind: "signed_copy", ref: `${WS}/signed.pdf` }];
const fieldsOf = (xs: { id: string; value: string }[]) => xs.map((x) => ({ ...x, label: b(x.id) }));

const PORTALS: Record<string, string> = {
  "tx-205": "webservices.sos.state.tx.us", "tx-503": "webservices.sos.state.tx.us",
  "wa-sos-foreign": "ccfs.sos.wa.gov", "tx-tabc": "tabcaims.elicense365.com", "wa-lcb": "secure.dor.wa.gov", "ga-alcohol": "gtc.dor.ga.gov",
  "la-alarm-permit": "latax.lacity.org", "chi-sidewalk-cafe": "ipi.cityofchicago.org", "ttb-importer": "www.ttbonline.gov",
  "irv-license": "prism.cityofirvine.gov", "fda-device-reg": "www.access.fda.gov", "cc-business-license": "blepay.clarkcountynv.gov",
  "bel-license": "www.filelocal-wa.gov", "tor-license": "aca-prod.accela.com", "alh-license": "secure.alhambraca.gov", "arc-license": "arcadia.hdlgov.com",
  "dly-license": "dalycity.hdlgov.com", "mil-license": "milpitas.hdlgov.com", "qcy-license": "quincyma.viewpointcloud.com", "dul-zoning": "app.govwell.com",
  "dul-otc": "duluthga.govbuilt.com", "sl-plan-review": "energovweb.sugarlandtx.gov",
  "sl-food-permit": "energovweb.sugarlandtx.gov", "pa-foreign-registration": "file.dos.pa.gov", "co-foreign-registration": "www.coloradosos.gov",
  "va-foreign-registration": "cis.scc.virginia.gov", "md-foreign-registration": "egov.maryland.gov", "dc-formation": "corponline.dlcp.dc.gov",
  "dc-foreign-registration": "corponline.dlcp.dc.gov", "mn-sos-llc": "mblsportal.sos.state.mn.us",
};

Deno.test("each moved form files on the agency's own site, read from the agency's page this round", () => {
  assertEquals(destinationProblems(), []);
  for (const [id, host] of Object.entries(PORTALS)) {
    const d = DEST[id];
    assert(d, id);
    assertEquals(d.portal, host, id);
    assert(d.checked >= "2026-10-24", `${id}: checked this round`);
    assert(/^https:\/\//.test(d.source), `${id}: cites the agency's page`);
    assertEquals(TEAM_ONLY[id], undefined, `${id} is no longer team-only`);
    // the agency's fee is paid by the person on the agency's page: a fee never keeps a portal filing from going
    assertEquals(pick(filing({ official: id }, { fee_estimate: 300 }), d, ENV, facts), "portal", id);
    // Placetta never creates an account: without the owner's saved login a portal that needs one isn't opened
    if (!d.noLogin) assertEquals(pick(filing({ official: id }), d, ENV, noLogin), "team", `${id}: no saved login`);
    // and nothing goes on a portal while the worker is off
    assertEquals(pick(filing({ official: id }), d, { ...ENV, portalWorker: false }, facts) === "portal", false, `${id}: worker off`);
  }
});

Deno.test("the guards each moved form keeps", () => {
  // Texas keeps its mail route for when SOSPortal fails, but a fee never travels by mail from Placetta
  assertEquals(fallback(filing({ official: "tx-205" }, { fee_estimate: 300 }), DEST["tx-205"], ENV, facts), "team");
  // the TTB takes a filer's application only with the owner's power of attorney (TTB F 5000.8)
  assertEquals(DEST["ttb-importer"].onBehalf, "authorization");
  assert(check(filing({ official: "ttb-importer" }), DEST["ttb-importer"], { docPaths: new Set() }, "portal").some((p) => /5000\.8/.test(p.en)));
  // TABC takes signed applications, uploaded: the hand signature is the owner's
  assertEquals(DEST["tx-tabc"].signature, "wet");
  // Alhambra's application is open without an account, so no login is needed
  assertEquals(pick(filing({ official: "alh-license" }), DEST["alh-license"], ENV, noLogin), "portal");
  // Clark County keeps its mail route, but the application fee keeps a letter with the team
  assertEquals(fallback(filing({ official: "cc-business-license" }), DEST["cc-business-license"], ENV, facts), "team");
  // a site several agencies share keeps each agency's path: Torrance on Accela, Duluth on GovWell
  assertEquals(DEST["tor-license"].tenant, "/TORRANCE");
  assertEquals(DEST["dul-zoning"].tenant, "/duluth");
});

Deno.test("Georgia's DOL-1N: the owner signs it by hand, then Placetta faxes it, or the owner mails it", () => {
  const d = DEST["ga-dol"];
  assertEquals([d.signature, d.payment, d.fax?.us, d.mail?.zip], ["wet", "none", "+14042323285", "30303-1751"]);
  const f = filing({ official: "ga-dol" });
  assertEquals(pick(f, d, ENV, facts), "team");                       // nothing goes before the signed copy
  assert(canFaxSignedFor(f, d, ENV));
  assertEquals(pick({ ...f, agent_log: signedLog }, d, ENV, facts), "fax");
  // the filled form must be in Documents before a fax goes
  assert(check({ ...f, payload: { ...f.payload, pdf_path: undefined } }, d, { docPaths: new Set() }, "fax").some((p) => p.kind === "file"));
});

Deno.test("by state: the IRS service center comes from the form's own address line", () => {
  assertEquals(stateOf("San Jose, CA 95112"), "CA");
  assertEquals(stateOf("1 Georgia Ave, Flushing, NY 11354-1234"), "NY");
  assertEquals(stateOf("Atlanta, Georgia 30303"), "GA");
  assertEquals(stateOf("Shanghai, China 200000"), null);
  assertEquals(stateOf("Tax ID 123456789"), null);
  assertEquals(stateOf(undefined), null);
  const city = (id: string, line: string, value: string) => destFor(id, { fields: [{ id: line, value }] })?.mail?.city;
  assertEquals(city("irs-8832", "citystatezip", "San Jose, CA 95112"), "Ogden");
  assertEquals(city("irs-8832", "citystatezip", "Houston, TX 77036"), "Ogden");
  assertEquals(city("irs-8832", "citystatezip", "Flushing, NY 11354"), "Kansas City");
  assertEquals(city("irs-8832", "citystatezip", "Duluth, GA 30097"), "Kansas City");
  // each form's own table: Tennessee is Ogden on the 8832 page and Kansas City on the 2553 page
  assertEquals(city("irs-8832", "citystatezip", "Nashville, TN 37203"), "Ogden");
  assertEquals(city("irs-2553", "citystatezip", "Nashville, TN 37203"), "Kansas City");
  // an owner abroad: the 8832's row for a foreign country
  assertEquals(destFor("irs-8832", { fields: [], us_address: false })?.mail?.zip, "84201-0023");
  // the 8822-B goes by the OLD address
  assertEquals(city("irs-8822b", "old_mailing", "1250 N First St, San Jose, CA 95112"), "Ogden");
  assertEquals(city("irs-8822b", "old_mailing", "18 Beach St, Boston, MA 02111"), "Kansas City");
  // no state on the form: no address, so it stays with the team
  assertEquals(destFor("irs-8832", { fields: [{ id: "citystatezip", value: "somewhere" }] })?.mail, undefined);
  assertEquals(pick(filing({ official: "irs-8832", fields: [] }), destFor("irs-8832", { fields: [] }), ENV, facts), "team");
  // the 8832 by hand: the owner signs and mails it (no fax or online route), the dispatcher hands it back with the address
  const p8832 = { official: "irs-8832", fields: fieldsOf([{ id: "citystatezip", value: "Irvine, CA 92604" }]) };
  const d8832 = destFor("irs-8832", p8832)!;
  assertEquals([pick(filing(p8832), d8832, ENV, facts), d8832.signature, d8832.mail?.zip], ["team", "wet", "84201"]);
  // the 2553 by fax: Kansas City's or Ogden's number, after the owner's signed copy
  assertEquals(destFor("irs-2553", { fields: [{ id: "citystatezip", value: "Flushing, NY 11354" }] })?.fax?.us, "+18558877734");
  const p2553 = { official: "irs-2553", fields: fieldsOf([{ id: "citystatezip", value: "Irvine, CA 92604" }]) };
  assertEquals(destFor("irs-2553", p2553)?.fax?.us, "+18552147520");
  assertEquals(pick(filing(p2553, { agent_log: signedLog }), destFor("irs-2553", p2553), ENV, facts), "fax");
  // every other destination is returned as it is
  assertEquals(destFor("tx-205"), DEST["tx-205"]);
});

Deno.test("a by-state route covers every state once and checks its addresses", () => {
  const mail = { name: "IRS", line1: "IRS", city: "Ogden", state: "UT", zip: "84201" };
  const entry = (groups: string[][], from = ["x"]) => ({ byState: { from, groups: groups.map((states) => ({ states, mail })) }, signature: "wet" as const, checked: "2026-10-24", source: "https://www.irs.gov/x" });
  assert(destinationProblems({ x: entry([["CA"]]) }).some((p) => p.includes("NY must be in exactly one state group")));
  assert(destinationProblems({ x: entry([["CA"], ["CA"]]) }).some((p) => p.includes("CA must be in exactly one")));
  assert(destinationProblems({ x: entry([], []) }).some((p) => p.includes("lines a by-state route reads")));
  assert(destinationProblems({ x: { ...entry([["CA"]]), mail } }).some((p) => p.includes("keeps its addresses in its groups")));
  assert(destinationProblems({ x: entry([["XX"]]) }).some((p) => p.includes("XX isn't a state code")));
});
