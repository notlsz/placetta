// deno test supabase/functions/file/accounts_test.ts
// "Odelia gets the login": which portals Odelia may make the business's account on, and how the dispatcher queues a
// portal filing with no saved login (the worker makes the account first) instead of asking the owner.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { ACCOUNT_SAY, accountOf, accountProblems, PORTAL_ACCOUNTS } from "./accounts.ts";
import { DEST, type Dest, destinationProblems } from "./destinations.ts";
import { canMakeAccount, envFrom, type Filing, pick, PORTAL_FAILED, rerouteLead, whyYours } from "./logic.ts";
import { inboxRow } from "../_shared/agent_inbox_in.ts";
import { inboxTokenOf } from "../_shared/agent_inbox.ts";
import type { InMail } from "../_shared/mail.ts";

const WS = "11111111-1111-1111-1111-111111111111";
const b = (s: string) => ({ en: s, zh: s });
const filing = (official: string, log: Filing["agent_log"] = []): Filing => ({
  id: "f1", workspace_id: WS, app_id: "x", title: b("X"), status: "requested", channel: null, agent_state: null, agent_log: log,
  handoff_url: null, provider_ref: null, submit_clicked_at: null, attempts: 0, requirements_checked: false, confirmation_number: null, portal_url: null,
  payload: { official, fields: [], attachments: [] },
});
const ENV = envFrom((k) => ({ FILER_AGENCIES: "all", FILER_CHANNELS: "email,fax,mail,portal", FILER_ENABLED: "1" } as Record<string, string>)[k]);

Deno.test("every account row is a host a destination files on, with its reason", () => {
  const portals = [...new Set(Object.values(DEST).map((d) => d.portal).filter((h): h is string => !!h))];
  assertEquals(accountProblems(PORTAL_ACCOUNTS, portals), []);
  assertEquals(destinationProblems(), []);
  assertEquals(destinationProblems({ x: { portal: "x.gov", noLogin: true, account: "business", signature: "none", checked: "2026-11-05", source: "https://x.gov" } }).length, 1, "an open portal has no account to make");
});

Deno.test("no saved login: a business-account portal is queued for the worker under agent authority, never without it", () => {
  const d = DEST["ga-sos"];
  assertEquals(accountOf(d), "business");
  const f = filing("ga-sos");
  assertEquals(pick(f, d, ENV, { hasLogin: false, mailConnected: true, makesAccount: canMakeAccount(d, true) }), "portal");
  // without the business's agent authority the site isn't used: the owner is told why, in plain words
  assertEquals(canMakeAccount(d, false), false);
  const why = whyYours(f, d, ENV, { hasLogin: false, mailConnected: true, makesAccount: false });
  assertEquals(why, ACCOUNT_SAY.authority);
});

Deno.test("an ID.me or Login.gov site is never queued to make an account, and the owner reads why", () => {
  const d = DEST["irs-8821"];
  assertEquals(accountOf(d), "individual");
  assertEquals(canMakeAccount(d, true), false);
  const f = filing("irs-8821");
  assert(pick(f, d, ENV, { hasLogin: false, mailConnected: true, makesAccount: false }) !== "portal");
  const why = whyYours(f, { ...d, fax: undefined, mail: undefined, email: undefined }, ENV, { hasLogin: false, mailConnected: true, makesAccount: false });
  assert(/ID\.me or Login\.gov/.test(why.en) && /only you can make/.test(why.en), why.en);
  assert(!/[–—]/.test(why.en + why.zh), "no dashes in what the owner reads");
});

Deno.test("an unchecked site goes to the worker only to ask the team; its hand-back is tried another way", () => {
  const d: Dest = { portal: "unknown.example.gov", signature: "none", checked: "2026-11-05", source: "https://unknown.example.gov" };
  assertEquals(accountOf(d), "unknown");
  assertEquals(canMakeAccount(d, true), true);
  for (const r of ["account_identity", "account_unknown", "account_authority", "account_no_mail"]) assert(PORTAL_FAILED.has(r), r);
  const f = filing("x", [{ en: ACCOUNT_SAY.unknown.en, zh: ACCOUNT_SAY.unknown.zh, kind: "handoff", ref: "account_identity" }]);
  const lead = rerouteLead(f);
  assertEquals(lead.lead.en, ACCOUNT_SAY.unknown.en);
  assert(/person's own identity/.test(lead.sends(b("by fax")).en));
});

Deno.test("how many of the portal forms need no owner touch for the login", () => {
  const ids = Object.keys(DEST).filter((id) => DEST[id].portal && !id.startsWith("insp-") && !id.startsWith("appeal-"));
  const by: Record<string, number> = {};
  for (const id of ids) { const k = accountOf(DEST[id]); by[k] = (by[k] ?? 0) + 1; }
  // seeded from destinations.ts: every one is accounted for, and the identity sites stay the owner's
  assertEquals((by.business ?? 0) + (by.individual ?? 0) + (by.unknown ?? 0) + (by.none ?? 0), ids.length);
  assert((by.business ?? 0) > 0 && (by.individual ?? 0) >= 2);
});

Deno.test("the business's inbox: odelia+<token>@ is routed to its workspace, with links from the HTML and codes", () => {
  assertEquals(inboxTokenOf(["odelia+k7qx9abc@in.placetta.com"], ["odelia@placetta.com", "odelia@in.placetta.com"]), "k7qx9abc");
  assertEquals(inboxTokenOf(["odelia@in.placetta.com"], ["odelia@in.placetta.com"]), null);
  const raw = [
    "From: Georgia SOS <noreply@sos.ga.gov>", "To: odelia+k7qx9abc@in.placetta.com", "Subject: Verify your account", "Message-ID: <a1@sos.ga.gov>",
    "MIME-Version: 1.0", "Content-Type: multipart/alternative; boundary=\"b\"", "", "--b", "Content-Type: text/plain", "", "Your verification code is 482913.", "--b",
    "Content-Type: text/html", "", "<p><a href=\"https://ecorp.sos.ga.gov/Account/Verify?token=abc&amp;u=1\">Verify</a></p>", "--b--", "",
  ].join("\r\n");
  const m: InMail = { id: "mail:<a1@sos.ga.gov>", from: "noreply@sos.ga.gov", name: "Georgia SOS", to: ["odelia+k7qx9abc@in.placetta.com"], subject: "Verify your account",
    text: "Your verification code is 482913.", headers: {}, files: [], auth: { provider: "ses", verdicts: null, raw, fromCount: 1, fromAddrs: ["noreply@sos.ga.gov"], sesFrom: [] } };
  const row = inboxRow(m, "k7qx9abc", true);
  assertEquals(row.p_links, ["https://ecorp.sos.ga.gov/Account/Verify?token=abc&u=1"]);
  assertEquals(row.p_codes, ["482913"]);
  assertEquals(row.p_verified, true);
  assert(!("p_text" in row), "the body itself is never kept");
});
