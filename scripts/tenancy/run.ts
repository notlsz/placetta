// npm run test:tenancy: the two-account test, on this machine (docs/SECURITY-AUDIT.md, "Two-account test and scanners").
// The e2e stack (a throwaway Postgres with every migration, PostgREST, the stand-in gateway and the real edge functions,
// scripts/e2e) with two customers. Account A signs in and makes a private record of every kind: a workspace with a store
// and an application, a document (its row and its file in storage), a memory, a chat run, a comment, a filing and an MCP
// token, each carrying a marker string. Then account B (its own workspace), and then a caller holding only the anon key,
// try to read, change and delete each of them by swapping in A's ids:
//   - PostgREST: every table and view read whole; every table with a workspace_id (or user_id) patched into B's
//     workspace, deleted, and written into A's workspace;
//   - RPCs: every function the role may execute, called with each of A's ids in every uuid argument;
//   - edge functions: every action each function names, with A's workspace and record ids;
//   - storage: A's object read, renamed, deleted and written next to, as the role Supabase Storage runs as (signed URLs
//     are made only for objects the caller can select).
// It passes when no response carries A's marker or a signed link to A's file, none of A's rows changed, no new row
// appeared in A's workspace (except the audit trail's record of the refusals), and nothing that left the sandbox carried
// the marker. One line per check; exits 1 on any failure.
import { signJwt, startStack, userJwt, type Stack } from "../e2e/infra.ts";

const out = (s: string) => Deno.stdout.writeSync(new TextEncoder().encode(s + "\n"));
const VERBOSE = Deno.env.get("TENANCY_VERBOSE") === "1";
for (const k of ["log", "error", "warn", "info"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => { if (VERBOSE) orig(...a); };
}

const APP = "https://app.placetta.test";
const SERVICE_KEY = await signJwt({ role: "service_role" }), ANON_KEY = await signJwt({ role: "anon" });
const ENV: Record<string, string> = {
  SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, SUPABASE_ANON_KEY: ANON_KEY,
  ANTHROPIC_API_KEY: "sk-ant-e2e", APP_ORIGINS: APP, RESEND_API_KEY: "re_e2e", MAIL_FROM: "Placetta <hello@placetta.test>",
  TELNYX_API_KEY: "KEY_e2e", ODELIA_NUMBER: "+12125550100", TELNYX_MESSAGING_PROFILE_ID: "mp_e2e",
  STRIPE_SECRET_KEY: "sk_test_e2e", STRIPE_WEBHOOK_SECRET: "whsec_e2e", RECORDS: "off",
  OAUTH_STATE_SECRET: "e2e-oauth-state-secret-0123456789abcdef", FILER_SECRET: "e2e-filer-secret-0123456789abcdef0123",
  SEND_HOLD_MINUTES: "0",
};
for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v);

const stubs = await import("../e2e/stubs.ts");
stubs.patchFetch((u) => u.hostname === "127.0.0.1" || u.hostname === "localhost");
const gw = await import("../e2e/gateway.ts");
const { GATEWAY, settle } = gw;

/* ------------------------------ checks ------------------------------ */

let fails = 0, passes = 0, group = "";
function check(name: string, ok: unknown, detail?: unknown) {
  if (ok) { passes++; if (VERBOSE) out(`  pass  ${group}: ${name}`); return; }
  fails++;
  out(`  FAIL  ${group}: ${name}${detail === undefined ? "" : `\n          ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)}`}`);
}
const section = (name: string) => { group = name; out(`\n${name}`); };

const MARK = "TENANCY-SECRET-7f3a91";
type Res = { status: number; text: string };
async function http(path: string, o: { method?: string; key?: string; jwt?: string; body?: unknown; prefer?: string } = {}): Promise<Res> {
  const res = await fetch(`${GATEWAY}${path}`, {
    method: o.method ?? "GET", body: o.body === undefined ? undefined : JSON.stringify(o.body),
    headers: { apikey: o.key ?? ANON_KEY, ...(o.jwt ? { Authorization: `Bearer ${o.jwt}` } : {}), "Content-Type": "application/json", ...(o.prefer ? { Prefer: o.prefer } : {}) },
  }).catch((e) => new Response(String(e), { status: 599 }));
  return { status: res.status, text: await res.text() };
}

/* ------------------------------ the run ------------------------------ */

let stack: Stack | null = null;
let gateway: { stop: () => Promise<void> } | null = null;
const FUNCTIONS = ["agent-run", "agent", "billing", "file", "team", "integrations", "logins", "spend", "sso", "forms", "tts", "calendar-feed", "monitor", "mcp", "partner-api", "chat-events", "oauth-callback", "scim", "voice"];
out("Placetta two-account test");
try {
  stack = await startStack((s) => out(`  ${s}`));
  const sql = stack.sql;
  await gw.loadFunctions(FUNCTIONS.filter((f) => { try { Deno.statSync(`supabase/functions/${f}/index.ts`); return true; } catch { return false; } }));
  gateway = gw.startGateway(sql, stack.restPort);
  out(`  gateway on ${GATEWAY} with ${gw.handlers.size} functions`);

  const mkUser = async (email: string) => {
    const id = crypto.randomUUID();
    await sql`insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
              values (${id}, 'authenticated', 'authenticated', ${email}, now(), now(), now(), ${sql.json({ provider: "email", providers: ["email"] })}, '{}')`;
    await sql`insert into auth.identities (user_id, provider) values (${id}, 'email')`;
    return { id, email, jwt: await userJwt({ id, email }) };
  };
  const A = await mkUser("owner-a@tenancy.test"), B = await mkUser("owner-b@tenancy.test");

  /* ---------------- A makes a private record of every kind ---------------- */
  section("account A makes its records");
  const state = (who: string, m = who.includes(MARK) ? MARK : "") => ({
    business: { en: `${who} Tea`, zh: `${who} Tea` }, meta: { mapped: true, city: "Flushing", region: "NY", what: "tea shop", entity: "LLC" },
    stores: [{ id: "store-1", stage: "opening", name: { en: `${who} store ${m}`, zh: "x" } }],
    apps: [{ id: "app-1", name: { en: `Business license ${m}`, zh: "x" }, agency: { en: "City", zh: "x" }, status: "draft", fees: [], fields: [{ id: "f-ein", label: { en: "EIN", zh: "EIN" }, value: `12-3456789 ${m}` }], checklist: [] }],
    docs: [], nudges: [], approvals: [], closed: [], facts: [], running: [], connections: [], deadlines: [], locations: [],
  });
  const rpcAs = (fn: string, args: Record<string, unknown>, jwt?: string) => http(`/rest/v1/rpc/${fn}`, { method: "POST", body: args, jwt });
  const makeWs = async (who: { jwt: string }, name: string) => {
    const r = await rpcAs("create_workspace", { p_name: name, p_state: state(name), p_authorized: true }, who.jwt);
    const id = (() => { try { const j = JSON.parse(r.text); return typeof j === "string" ? j : j?.id ?? j?.workspace_id ?? null; } catch { return null; } })();
    return { r, id: id as string | null };
  };
  const wa = await makeWs(A, `Acme ${MARK}`);
  check("A creates a workspace with a store and an application (create_workspace)", wa.id, wa.r);
  const wb = await makeWs(B, "Bravo");
  check("B creates its own workspace", wb.id, wb.r);
  const WA = wa.id!, WB = wb.id!;

  // a document: the file goes to storage as A (as Supabase Storage runs it: the authenticated role, A's claims), the row through PostgREST
  const docPath = `${WA}/lease ${MARK}.pdf`;
  const asRole = async <T>(role: "authenticated" | "anon", sub: string | null, f: (tx: typeof sql) => Promise<T>): Promise<T> => {
    let got: T | undefined; let err: unknown = null;
    await sql.begin(async (tx) => {
      await tx.unsafe(`set local role ${role}`);
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(sub ? { sub, role, aal: "aal1" } : { role })}, true)`;
      try { got = await f(tx as unknown as typeof sql); } catch (e) { err = e; }
    });
    if (err) throw err;
    return got as T;
  };
  const up = await asRole("authenticated", A.id, (tx) => tx`insert into storage.objects (bucket_id, name) values ('documents', ${docPath}) returning id`).then(() => true, (e) => String(e));
  check("A uploads a file into its workspace's folder", up === true, up);
  const doc = await http(`/rest/v1/documents?select=id`, { method: "POST", jwt: A.jwt, prefer: "return=representation", body: { workspace_id: WA, name: `lease ${MARK}.pdf`, path: docPath, size: 10, mime: "application/pdf", source: "customer" } });
  const docId = (() => { try { return JSON.parse(doc.text)[0].id as string; } catch { return null; } })();
  check("A adds the document's row", docId, doc);
  const tok = await rpcAs("mcp_token_create", { ws: WA, p_label: `Claude ${MARK}`, p_scopes: ["status"] }, A.jwt);
  const tokJ = (() => { try { return JSON.parse(tok.text); } catch { return {}; } })();
  check("A makes an MCP token", tokJ.id && tokJ.token, tok);
  const com = await rpcAs("comment_post", { ws: WA, p_kind: "app", p_item: "app-1", p_body: `Comment ${MARK}`, p_mentions: [], p_share: false }, A.jwt);
  check("A posts a comment", com.status < 300, com);
  // a shared status page (20261031160000_trust_pages.sql): public only by its token, which nobody else has
  const tp = await rpcAs("trust_link_create", { ws: WA, p_store: "store-1", p_label: `Landlord ${MARK}`, p_days: 30,
    p_snapshot: { store: { en: `Store ${MARK}`, zh: "x" }, rows: [{ id: "app-1", name: { en: `Business license ${MARK}`, zh: "x" }, status: "draft" }] } }, A.jwt);
  const tpJ = (() => { try { return JSON.parse(tp.text); } catch { return {}; } })();
  check("A shares a status page", tpJ.id && /^[0-9a-f]{48}$/.test(tpJ.token ?? ""), tp);
  // what only the server writes: a chat run and its messages, a memory, a filing (as agent-run, the monitor and file do)
  const runId = crypto.randomUUID(), filingId = crypto.randomUUID(), memId = `mem-${crypto.randomUUID().slice(0, 8)}`;
  await sql`insert into public.agent_runs (id, workspace_id, prompt, created_by, reply) values (${runId}, ${WA}, ${"Plan my opening " + MARK}, ${A.id}, ${"Reply " + MARK})`;
  await sql`insert into public.odelia_messages (workspace_id, channel, direction, body) values (${WA}, 'sms', 'in', ${"Chat " + MARK})`;
  // a call with its transcript, summary and recording (as odelia-voice writes them)
  const callId = crypto.randomUUID(), recPath = `${WA}/${callId}.wav`;
  await sql`insert into public.voice_calls (id, workspace_id, user_id, kind, direction, brain, lang, status, consent, recording_path, transcript, summary)
            values (${callId}, ${WA}, ${A.id}, 'agency_phone', 'out', 'openai', 'en', 'ended', 'announced', ${recPath}, ${sql.json([{ who: "agency", at: 1, text: "In review " + MARK }])}, ${sql.json({ en: "Call " + MARK })})`;
  await sql`insert into storage.objects (bucket_id, name) values ('call-recordings', ${recPath})`;
  await sql`insert into public.agent_memories (id, workspace_id, topic, entity, attr, value, text_en, text_zh, source_kind, status, trust)
            values (${memId}, ${WA}, 'company', 'entity:e1', 'name', ${"Acme LLC " + MARK}, ${"Acme files as " + MARK}, 'x', 'chat', 'suggested', 'agent')`;
  await sql`insert into public.filings (id, workspace_id, app_id, payload, title) values (${filingId}, ${WA}, 'app-1', ${sql.json({ note: MARK })}, ${sql.json({ en: "Business license " + MARK, zh: "x" })})`;
  const own = await http(`/rest/v1/documents?select=name&workspace_id=eq.${WA}`, { jwt: A.jwt });
  check("A reads its own document (the test can see a leak)", own.text.includes(MARK), own);
  const ownRun = await http(`/rest/v1/agent_runs?select=prompt&id=eq.${runId}`, { jwt: A.jwt });
  check("A reads its own run", ownRun.text.includes(MARK), ownRun);
  const commentId = (await sql`select id from public.comments where workspace_id = ${WA} limit 1`)[0]?.id as string | undefined;

  /* ---------------- what A's data looks like now ---------------- */
  const cols = await sql`select c.table_name t, bool_or(c.column_name = 'workspace_id') ws, bool_or(c.column_name = 'user_id') usr, bool_or(c.column_name = 'created_at') at
                         from information_schema.columns c join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
                         where c.table_schema = 'public' and x.table_type = 'BASE TABLE' group by c.table_name order by 1`;
  const rels = (await sql`select table_name t from information_schema.tables where table_schema = 'public' order by 1`).map((r) => r.t as string);
  const scoped = cols.filter((c) => c.ws || c.usr || c.t === "workspaces");
  const whereA = (c: { t: string; ws: boolean; usr: boolean }) => c.t === "workspaces" ? `id = '${WA}'` : c.ws ? `workspace_id = '${WA}'` : `user_id = '${A.id}'`;
  const snapshot = async (cutoff: string | null) => {
    const m = new Map<string, string>();
    for (const c of scoped) {
      const old = cutoff && c.at ? ` and created_at <= '${cutoff}'` : "";
      const [r] = await sql.unsafe(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) h, count(*)::int n from public."${c.t}" t where ${whereA(c)}${old}`);
      m.set(c.t, `${r.n}:${r.h}`);
    }
    const [s] = await sql`select md5(coalesce(string_agg(o::text, '|' order by o::text), '')) h from storage.objects o where name like ${WA + "/%"}`;
    m.set("storage.objects", s.h);
    const [u] = await sql`select md5(u::text) h from auth.users u where id = ${A.id}`;
    m.set("auth.users", u.h);
    return m;
  };
  await settle();
  const cutoff = (await sql`select now()::text t`)[0].t as string;
  await new Promise((r) => setTimeout(r, 20));
  const before = await snapshot(cutoff);
  const counts = new Map((await Promise.all(scoped.filter((c) => c.ws).map(async (c) => [c.t, (await sql.unsafe(`select count(*)::int n from public."${c.t}" where workspace_id = '${WA}'`))[0].n as number] as const))));
  const recordedBefore = stubs.recorded.length;
  const signedA = `sign/documents/${WA}`, signedCall = `sign/call-recordings/${WA}`;
  const leaks = (r: Res) => r.text.includes(MARK) || r.text.includes(signedA) || r.text.includes(signedCall) || r.text.includes(encodeURIComponent(WA) + "%2F");
  const ids: [string, string][] = [["workspace", WA], ["user", A.id], ["run", runId], ["filing", filingId], ["document", docId ?? WA], ["token", tokJ.id ?? WA], ["comment", commentId ?? WA], ["call", callId]];

  /* ---------------- B, then anon, try everything ---------------- */
  const callers: { name: string; jwt?: string; role: "authenticated" | "anon"; sub: string | null }[] = [
    { name: "B (signed in, own workspace)", jwt: B.jwt, role: "authenticated", sub: B.id },
    { name: "anon key only", role: "anon", sub: null },
  ];
  for (const who of callers) {
    section(`${who.name}: PostgREST tables and views`);
    for (const t of rels) {
      const r = await http(`/rest/v1/${t}?select=*&limit=1000`, { jwt: who.jwt });
      check(`reads nothing of A's from ${t}`, !leaks(r), `${r.status} ${r.text.slice(0, 200)}`);
    }
    for (const c of scoped) {
      const filter = c.t === "workspaces" ? `id=eq.${WA}` : c.ws ? `workspace_id=eq.${WA}` : `user_id=eq.${A.id}`;
      const r = await http(`/rest/v1/${c.t}?${filter}&select=*`, { jwt: who.jwt });
      check(`filtered read of ${c.t} by A's id is empty or refused`, !leaks(r) && (r.status >= 400 || r.text.trim() === "[]"), `${r.status} ${r.text.slice(0, 200)}`);
      const patch = c.t === "workspaces" ? { name: "taken" } : c.ws ? { workspace_id: WB } : { user_id: who.sub ?? B.id };
      const p = await http(`/rest/v1/${c.t}?${filter}`, { method: "PATCH", jwt: who.jwt, body: patch, prefer: "return=representation" });
      check(`patching A's ${c.t} changes nothing`, !leaks(p) && (p.status >= 400 || p.text.trim() === "[]"), `${p.status} ${p.text.slice(0, 200)}`);
      const d = await http(`/rest/v1/${c.t}?${filter}`, { method: "DELETE", jwt: who.jwt, prefer: "return=representation" });
      check(`deleting A's ${c.t} removes nothing`, !leaks(d) && (d.status >= 400 || d.text.trim() === "[]"), `${d.status} ${d.text.slice(0, 200)}`);
      if (c.ws) {
        const i = await http(`/rest/v1/${c.t}`, { method: "POST", jwt: who.jwt, body: { workspace_id: WA } });
        check(`writing a row into A's ${c.t} is refused`, i.status >= 400, `${i.status} ${i.text.slice(0, 200)}`);
      }
    }

    section(`${who.name}: storage (A's file, as Supabase Storage queries it)`);
    const seen = await asRole(who.role, who.sub, (tx) => tx`select count(*)::int n from storage.objects where name = ${docPath}`).catch(() => [{ n: 0 }]);
    check("can't see A's object (so no signed link can be made for it)", seen[0].n === 0, seen);
    const mv = await asRole(who.role, who.sub, (tx) => tx`update storage.objects set name = ${WB + "/stolen.pdf"} where name = ${docPath} returning 1`).catch(() => []);
    check("can't move A's object", mv.length === 0, mv);
    const rm = await asRole(who.role, who.sub, (tx) => tx`delete from storage.objects where name = ${docPath} returning 1`).catch(() => []);
    check("can't delete A's object", rm.length === 0, rm);
    const put = await asRole(who.role, who.sub, (tx) => tx`insert into storage.objects (bucket_id, name) values ('documents', ${WA + "/planted.pdf"}) returning 1`).then(() => "written", (e) => String(e));
    check("can't write into A's folder", put !== "written", put);
    const s2 = await http(`/storage/v1/object/sign/documents/${encodeURI(docPath)}`, { method: "POST", jwt: who.jwt, body: { expiresIn: 60 } });
    check("the storage API makes no signed link to A's file", !leaks(s2) && s2.status >= 400, `${s2.status} ${s2.text.slice(0, 160)}`);

    section(`${who.name}: edge functions, every action with A's ids`);
    let calls = 0;
    for (const fn of gw.handlers.keys()) {
      const src = [...Deno.readDirSync(`supabase/functions/${fn}`)].filter((f) => f.name.endsWith(".ts") && !/_test|\.test\./.test(f.name)).map((f) => Deno.readTextFileSync(`supabase/functions/${fn}/${f.name}`)).join("\n");
      const actions = [...new Set([...src.matchAll(/action\s*===\s*"([a-z_]+)"|case\s+"([a-z_]+)"\s*:/g)].map((m) => m[1] ?? m[2]))].slice(0, 120);
      for (const action of actions.length ? actions : [""]) {
        for (const [, id] of ids) {
          const body = { action, workspace_id: WA, ws: WA, id, filing_id: filingId, document_id: docId, doc_id: docId, run_id: runId, token_id: tokJ.id, app_id: "app-1", store_id: "store-1", path: docPath, user_id: A.id, memory_id: memId, call_id: callId };
          const r = await http(`/functions/v1/${fn}`, { method: "POST", jwt: who.jwt, body });
          calls++;
          check(`${fn} ${action || "(no action)"} with A's ${id === WA ? "workspace" : "ids"} gives nothing of A's`, !leaks(r), `${r.status} ${r.text.slice(0, 200)}`);
        }
        const g = await http(`/functions/v1/${fn}?workspace_id=${WA}&id=${runId}&path=${encodeURIComponent(docPath)}`, { jwt: who.jwt });
        check(`${fn} GET with A's ids gives nothing of A's`, !leaks(g), `${g.status} ${g.text.slice(0, 200)}`);
      }
      await settle().catch(() => {});
    }
    out(`  ${calls} edge function calls`);

    section(`${who.name}: every RPC it may execute, with each of A's ids`);
    const fns = await sql`select p.proname n, coalesce(p.proargnames, '{}') names, array(select format_type(t, null) from unnest(p.proargtypes) t) types, p.proargmodes modes
                          from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                          where s.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype and has_function_privilege(${who.role}, p.oid, 'execute')
                            and p.proname not in ('delete_my_account', 'leave_workspace') order by 1`;
    let rpcs = 0;
    for (const f of fns) {
      const names = (f.names as string[]).slice(0, (f.types as string[]).length);
      if (names.some((x) => !x) || (f.modes && (f.modes as string[]).some((m) => m === "v"))) continue;
      for (const [kind, id] of ids) {
        const args: Record<string, unknown> = {};
        names.forEach((n, i) => {
          const t = (f.types as string[])[i];
          args[n] = t === "uuid" ? id : t === "uuid[]" ? [id] : t === "text" ? (/id|item|key/.test(n) ? (kind === "workspace" ? memId : id) : "x") : t === "text[]" ? [] : /json/.test(t) ? {} : /int|numeric|real|double/.test(t) ? 1 : t === "boolean" ? false : t === "date" ? "2026-11-01" : /timestamp/.test(t) ? new Date().toISOString() : null;
        });
        const r = await rpcAs(f.n as string, args, who.jwt);
        rpcs++;
        check(`${f.n}(${kind}) gives nothing of A's`, !leaks(r), `${r.status} ${r.text.slice(0, 200)}`);
      }
    }
    out(`  ${rpcs} RPC calls`);
  }
  await settle().catch(() => {});

  /* ---------------- A's data afterwards ---------------- */
  section("A's data afterwards");
  const after = await snapshot(cutoff);
  for (const [t, h] of before) check(`A's ${t} unchanged`, after.get(t) === h, `${h} -> ${after.get(t)}`);
  // the audit trail and the call log record the refused attempts; nothing else may gain a row in A's workspace
  const LOGS = new Set(["audit_log", "agent_tool_calls", "rate_limits"]);
  for (const c of scoped.filter((c) => c.ws && !LOGS.has(c.t))) {
    const [r] = await sql.unsafe(`select count(*)::int n from public."${c.t}" where workspace_id = '${WA}'`);
    check(`no new row in A's ${c.t}`, r.n === counts.get(c.t), `${counts.get(c.t)} -> ${r.n}`);
  }
  const sent = stubs.recorded.slice(recordedBefore).filter((x) => x.raw.includes(MARK) || JSON.stringify(x.body ?? "").includes(MARK));
  check("nothing sent out of the sandbox carried A's data", sent.length === 0, sent.map((x) => `${x.service} ${x.path}`));
  const own2 = await http(`/rest/v1/agent_runs?select=prompt&id=eq.${runId}`, { jwt: A.jwt });
  check("A still reads its own run", own2.text.includes(MARK), own2);

  /* ---------------- chat bots: a message can't reach another workspace ---------------- */
  // A connects a Telegram and a Teams bot (as the integrations function saves them); then requests that aren't from those
  // bots, or are aimed at B's workspace with A's secret, start nothing anywhere.
  section("chat bots: a message can't reach another workspace");
  const TG_SECRET = `tg-secret-${MARK}`;
  const tgSecretId = (await sql`select public.vault_put(${JSON.stringify({ access_token: "", token_type: "bot", bot_token: "7012345678:AAH9f3kq2Zx0-LmNoPqRsTuVwXyZ_abcdEF", secret: TG_SECRET, bot_id: "7012345678", username: "AcmeOdeliaBot" })}, 'integration:telegram_bot') id`)[0].id;
  await sql`insert into public.integrations (workspace_id, kind, account, scopes, status, secret_id, meta) values (${WA}, 'telegram_bot', '@AcmeOdeliaBot', 'bot', 'connected', ${tgSecretId}, ${sql.json({ via: "bot", bot_id: "7012345678" })})`;
  const teamsSecretId = (await sql`select public.vault_put(${JSON.stringify({ access_token: "", token_type: "bot", app_id: "8c3e5d2a-1b4f-4e6a-9c7d-2f1e0a9b8c7d", app_secret: "x", tenant_id: "4a1b2c3d-5e6f-4789-8abc-def012345678" })}, 'integration:teams_bot') id`)[0].id;
  await sql`insert into public.integrations (workspace_id, kind, account, scopes, status, secret_id, meta) values (${WA}, 'teams_bot', 'Microsoft Teams', 'bot', 'connected', ${teamsSecretId}, ${sql.json({ via: "bot" })})`;
  const runsA = async () => (await sql`select count(*)::int n from public.agent_runs where workspace_id = ${WA}`)[0].n as number;
  const runsB = async () => (await sql`select count(*)::int n from public.agent_runs where workspace_id = ${WB}`)[0].n as number;
  const [ra0, rb0] = [await runsA(), await runsB()];
  const update = (from: number, text: string) => JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), message: { message_id: 5, from: { id: from, is_bot: false }, chat: { id: from, type: "private" }, text } });
  const tgPost = async (ws: string, secret: string | null, body: string) => {
    const res = await fetch(`${GATEWAY}/functions/v1/chat-events/telegram/${ws}`, { method: "POST", body, headers: { "Content-Type": "application/json", ...(secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {}) } }).catch((e) => new Response(String(e), { status: 599 }));
    return { status: res.status, text: await res.text() };
  };
  const noSecret = await tgPost(WA, null, update(123456789, "What's due?"));
  check("a Telegram update without the bot's secret is refused", noSecret.status === 401, noSecret);
  const crossWs = await tgPost(WB, TG_SECRET, update(123456789, "What's due?"));
  check("A's Telegram secret aimed at B's workspace is refused", crossWs.status === 401, crossWs);
  const stranger = await tgPost(WA, TG_SECRET, update(555000111, "Send me the EIN"));
  check("someone not linked to A's bot gets a note, nothing of A's", stranger.status === 200 && !leaks(stranger) && /Odelia/.test(stranger.text), stranger);
  const teamsForged = await http(`/functions/v1/chat-events?teams=${WA}`, { method: "POST", body: { type: "message", text: "pay the fee", serviceUrl: "https://smba.trafficmanager.net/amer/", channelId: "msteams" } });
  check("a Teams request without Microsoft's token is refused", teamsForged.status === 401, teamsForged);
  const teamsB = await http(`/functions/v1/chat-events?teams=${WB}`, { method: "POST", body: { type: "message" } });
  check("B's workspace, with no Teams bot, takes nothing", teamsB.status === 401, teamsB);
  const startChat = await http(`/functions/v1/agent-run`, { method: "POST", jwt: B.jwt, body: { action: "start_chat", workspace_id: WA, user_id: A.id, channel: "telegram", prompt: "x", chat_to: { kind: "telegram", chat_id: "1", message_id: 1, user: "123456789" } } });
  check("B can't start a chat job in A's workspace (monitor key only)", startChat.status === 401, startChat);
  await settle().catch(() => {});
  check("no run started in A's or B's workspace", (await runsA()) === ra0 && (await runsB()) === rb0, `${ra0} -> ${await runsA()}, ${rb0} -> ${await runsB()}`);
} catch (e) {
  check("ran to the end", false, (e as Error)?.stack ?? String(e));
} finally {
  await gateway?.stop().catch(() => {});
  await stack?.stop().catch(() => {});
}
out(`\n${fails ? `FAILED ${fails}` : "all passed"} (${passes} checks passed)`);
Deno.exit(fails ? 1 : 0);
