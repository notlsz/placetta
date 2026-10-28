// deno test -A supabase/functions/_shared/tenancy_test.ts
// Every server function, read as text: how each proves who is calling, and that a workspace id or a record id from the
// request is never used before the caller's access to that workspace is checked (the IDOR class). The live checks are
// in the database tests (supabase/tests/security_audit.sql: Eve asks for Olivia's ids through every function and
// table); this keeps a new function, or a new action in an old one, from skipping the check. docs/SECURITY-AUDIT.md.
import { deepStrictEqual as assertEquals, ok } from "node:assert";

const root = new URL("../", import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root));
const fns = [...Deno.readDirSync(root)].filter((d) => d.isDirectory && !d.name.startsWith("_")).map((d) => d.name).sort();

/** How each function knows who is calling. A new function must be added here, with its proof. */
const PROOF: Record<string, RegExp[]> = {
  // a signed-in person's session, then their role in the workspace
  "agent": [/auth\.getUser\(/, /accessFor\(ws, user, jwt\)/],
  "agent-run": [/auth\.getUser\(/, /accessRpc\(admin, ws, user\.id, jwt\)/, /monitor_key_ok|monitorKeyOk/],
  "billing": [/auth\.getUser\(/, /accessFor\(ws, user, jwt\)/],
  "file": [/requireUser\(req\)/, /requireAccess\(ws, user, jwt/, /monitor_key_ok/, /Ed25519/],
  "integrations": [/requireUser\(req\)/, /requireAccess\(ws, user, jwt/, /monitor_key_ok/],
  "logins": [/requireUser\(req\)/, /requireAccess\(ws, user, jwt/, /requireStaffTwoStep/],
  // and the portal worker's run token, live for the one filing it names (filer_run_live)
  "spend": [/requireUser\(req\)/, /requireAccess\(ws, user, jwt/, /monitor_key_ok/, /filer_run_live/],
  "sso": [/requireUser\(req\)/, /requireAccess\(ws, user, jwt, "admin"\)/],
  "team": [/requireUser\(req\)/, /requireAccess\(ws, user, jwt/],
  "tts": [/auth\.getUser\(/, /accessFor\(/],
  // every action: the session, then access_for on the workspace; a recording only from the workspace's own folder
  "voice": [/auth\.getUser\(/, /accessRpc\(admin, ws, user\.id, jwt\)/, /startsWith\(`\$\{a\.ws\}\/`\)/],
  "forms": [/requireUser\(req\)/, /monitor_key_ok/],
  // their own credential: a hashed token, a signed webhook, a signed state, the monitor key
  "calendar-feed": [/calendar_feeds"\)\.select\("workspace_id"\)\.eq\("token", token\)/],
  "chat-events": [/slackSigned\(/, /larkOpen\(/, /monitor_key_ok/],
  "mcp": [/mcp_token_auth/],
  "monitor": [/monitor_key_ok|monitorKeyOk|x-monitor-key/],
  "oauth-callback": [/verifyState\(/],
  "odelia-mail": [/verifyStandardWebhook\(|postmarkAuthOk\(/, /routeSns\(/],
  "odelia-sms": [/verifyTelnyx\(/, /verifyLinq\(/, /verifyWhatsApp\(/, /monitorKeyOk\(/],
  "odelia-voice": [/verifyTelnyx\(/, /verifyCallToken\(/, /monitorKeyOk\(/],
  "partner-api": [/partner_api_auth/],
  "scim": [/scim_auth/],
  "stripe-webhook": [/handle\(req, \{/],
};
// a function whose request handler lives in a module beside its index.ts: what that module must do
const HANDLER: Record<string, [string, RegExp[]]> = {
  "stripe-webhook": ["handler.ts", [/verified\(raw, req\.headers\.get\("stripe-signature"\)/, /if \(!\(await verified\(/]],
  // Amazon SES over SNS: the signature, our own topics, before anything else
  "odelia-mail": ["../_shared/ses_inbound.ts", [/const v = await verifySns\(raw, env/, /if \(!v\.ok\)/]],
};

Deno.test("every server function says how it knows who is calling, and does it", () => {
  assertEquals(fns.filter((f) => !(f in PROOF)), [], "a function with no entry in PROOF: add how it proves the caller");
  for (const f of fns) {
    const src = read(`${f}/index.ts`);
    for (const r of PROOF[f]) ok(r.test(src), `${f}/index.ts no longer has ${r}`);
    if (HANDLER[f]) for (const r of HANDLER[f][1]) ok(r.test(read(`${f}/${HANDLER[f][0]}`)), `${f}/${HANDLER[f][0]} no longer has ${r}`);
  }
});

Deno.test("a workspace id from the request is checked before it's used", () => {
  for (const f of fns) {
    // the request handler (server-to-server helpers above it carry their own key: the monitor's, the filer's)
    const all = read(`${f}/index.ts`), entry = Math.max(all.lastIndexOf("serve(async"), all.lastIndexOf("export async function handle("));
    const src = entry >= 0 ? all.slice(entry) : all;
    // where the request's workspace id is read, and where the first access check comes after it
    const at = src.search(/(body|b)\.workspace_id\b/);
    if (at < 0) continue;
    const rest = src.slice(at);
    const check = rest.search(/requireAccess\(|accessFor\(|accessRpc\(|requireMember\(|isMember\(|hq_sees|monitor_key_ok|monitorKeyOk|is_member|userClient\(jwt\)\.rpc\("check_remove_member"/);
    ok(check >= 0, `${f}: reads workspace_id from the request and never checks access`);
    // and no table is read or written with it between the two
    const between = rest.slice(0, check);
    ok(!/admin\s*\.from\([^)]*\)[\s\S]{0,200}\.eq\("workspace_id", ws\)/.test(between), `${f}: uses the workspace before checking access`);
  }
});

Deno.test("a record looked up by its id is looked up inside the caller's workspace", () => {
  // the tables a customer's ids point into; a lookup by id alone must also name the workspace (or be the server's own sweep)
  const tenant = /admin\s*\.from\("(filings|agency_logins|purchases|workspace_invites|documents|integrations|mail_threads|comments)"\)\s*\.(select|update|delete)\([^)]*\)\s*\.eq\("id", (id|filingId|body\.id)\)(?![\s\S]{0,80}\.eq\("workspace_id")/;
  // the monitor answers only to the monitor key and sweeps every workspace on purpose
  for (const f of fns.filter((x) => x !== "monitor")) {
    for (const file of [...Deno.readDirSync(new URL(`${f}/`, root))].filter((e) => e.isFile && e.name.endsWith(".ts") && !/_test\.ts$|\.test\.ts$/.test(e.name))) {
      const src = read(`${f}/${file.name}`);
      const m = src.match(tenant);
      ok(!m, `${f}/${file.name}: ${m?.[0].slice(0, 120)}`);
    }
  }
});

Deno.test("signed links to stored files last an hour at most", () => {
  for (const f of fns) {
    const src = read(`${f}/index.ts`);
    for (const m of src.matchAll(/createSignedUrl\([^,]+,\s*(\d+)/g)) ok(Number(m[1]) <= 3600, `${f}: a signed link lasts ${m[1]} seconds`);
  }
});

Deno.test("a stored file's path from the request stays inside the workspace's folder", () => {
  for (const f of ["spend", "file"]) {
    const src = read(`${f}/index.ts`);
    ok(/startsWith\(`\$\{(ws|f\.workspace_id)\}\/`\)/.test(src) && /p === "\.\."/.test(src), `${f}: a path from the request must start with the workspace and have no ".."`);
  }
});
