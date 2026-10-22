// Run: deno test -A supabase/functions/_shared/business_rules_test.ts
// Business rules on the server: a rule's message goes out once per event through the business's own channels, says
// what happened and nothing a filing holds, and the morning check fires each deadline once.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { deadlineRules, deliverNotice } from "./business_rules.ts";
import { fire, validRule, type Notice } from "../../../src/businessRules.ts";

/* A tiny stand-in for the service-role client: tables as arrays, the filters business_rules.ts uses, and unique keys
   for the upserts that claim things. */
type Row = Record<string, unknown>;
function fakeAdmin(tables: Record<string, Row[]>, users: Record<string, string>, vault: Record<string, string> = {}) {
  const unique: Record<string, string[]> = { updates: ["workspace_id", "dedupe"], odelia_outbox: ["user_id", "dedupe"] };
  const log: { table: string; op: string; row?: Row }[] = [];
  const from = (table: string) => {
    tables[table] ??= [];
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "upsert" | "update" | "insert" = "select", payload: Row | Row[] | null = null, wantRows = false, ignore = false;
    const run = () => {
      const t = tables[table];
      if (op === "upsert" || op === "insert") {
        const rows = (Array.isArray(payload) ? payload : [payload!]).map(r => ({ ...r }));
        const added: Row[] = [];
        for (const r of rows) {
          const keys = unique[table];
          if (keys && t.some(x => keys.every(k => x[k] === r[k]))) { if (!ignore) return { data: null, error: { code: "23505" } }; continue; }
          t.push(r); added.push(r); log.push({ table, op, row: r });
        }
        return { data: wantRows ? added : null, error: null };
      }
      const hit = t.filter(r => filters.every(f => f(r)));
      if (op === "update") { for (const r of hit) { Object.assign(r, payload); r.updated_at = new Date().toISOString(); log.push({ table, op, row: r }); } return { data: wantRows ? hit : null, error: null }; }
      return { data: hit, error: null };
    };
    const q = {
      select() { if (op !== "select") wantRows = true; return q; },
      eq(k: string, v: unknown) { filters.push(r => r[k] === v); return q; },
      not(k: string, _o: string, v: unknown) { filters.push(r => r[k] !== v && !(v === null && r[k] == null)); return q; },
      is(k: string, v: unknown) { filters.push(r => (v === null ? r[k] == null : r[k] === v)); return q; },
      upsert(r: Row | Row[], o: { ignoreDuplicates?: boolean } = {}) { op = "upsert"; payload = r; ignore = !!o.ignoreDuplicates; return q; },
      insert(r: Row | Row[]) { op = "insert"; payload = r; return q; },
      update(r: Row) { op = "update"; payload = r; return q; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }); },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej); },
    };
    return q;
  };
  const admin = {
    from, rpc: (_n: string, a: { p_id: string }) => Promise.resolve({ data: vault[a.p_id] ?? null, error: null }),
    auth: { admin: { getUserById: (id: string) => Promise.resolve({ data: { user: users[id] ? { email: users[id] } : null } }) } },
  } as unknown as SupabaseClient;
  return { admin, log, tables };
}
const env = (k: string) => ({ RESEND_API_KEY: "re_test", MAIL_FROM: "odelia@placetta.test", APP_ORIGINS: "https://placetta.test" } as Record<string, string>)[k];
const WS = "11111111-1111-1111-1111-111111111111";

Deno.test("a rule's email goes out once per event, saying what happened and nothing from the filing", async () => {
  const { admin, tables } = fakeAdmin({}, {});
  const sent: { to: string[]; subject: string; text: string }[] = [];
  const f = ((_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return Promise.resolve(new Response("{}", { status: 200 })); }) as unknown as typeof fetch;
  const ws = { business: { en: "Moonleaf Tea", zh: "Moonleaf Tea" }, apps: [{ id: "sign", checklist: [] }], approvals: [{ id: "ap-sign", does: [] }], audit: [],
    controls: { business: [{ id: "br1", when: { event: "filing_approval" }, then: { action: "notify", via: "email", to: "kevin@contractor.com" }, at: "x" }] } };
  const ev = { kind: "filing_approval" as const, key: "approval:ap-sign", title: { en: "File the sign permit", zh: "提交招牌许可" }, app: "sign", approval: "ap-sign", fee: 445 };
  const { notices } = fire(ws, ev);
  assertEquals(notices.length, 1);
  const r1 = await deliverNotice(admin, env, WS, notices[0], { f });
  const r2 = await deliverNotice(admin, env, WS, notices[0], { f });
  assert(r1.ok && r2.ok && r2.why === "already delivered", JSON.stringify([r1, r2]));
  assertEquals(sent.length, 1);
  assertEquals(sent[0].to, ["kevin@contractor.com"]);
  assert(/Moonleaf Tea: A filing is waiting for approval: File the sign permit/.test(sent[0].text) && /placetta\.test\/app\//.test(sent[0].text), sent[0].text);
  assertEquals(tables.updates.length, 1);
});

Deno.test("a text goes to a teammate's verified phone through the outbox; someone who isn't a member gets nothing", async () => {
  const uid = "22222222-2222-2222-2222-222222222222";
  const { admin, tables } = fakeAdmin({ workspace_members: [{ workspace_id: WS, user_id: uid }], phone_links: [{ user_id: uid, lang: "zh", verified_at: "2026-10-01", texts_on: true, opted_out_at: null }] }, { [uid]: "Mei@Moonleaf.test" });
  const n: Notice = { rule: "br2", key: "deadline:dl-1:2026-10-20", via: "text", to: "mei@moonleaf.test", text: { en: "Moonleaf Tea: The fire permit is due in 3 days.", zh: "Moonleaf Tea：消防许可将在 3 天后到期。" } };
  assert((await deliverNotice(admin, env, WS, n)).ok);
  assertEquals(tables.odelia_outbox.length, 1);
  assertEquals(tables.odelia_outbox[0].body, n.text.zh);
  const stranger = await deliverNotice(admin, env, WS, { ...n, key: "deadline:dl-2:2026-10-21", to: "someone@else.test" });
  assert(!stranger.ok && stranger.why === "not a member");
  assertEquals(tables.odelia_outbox.length, 1);
});

Deno.test("a rule saved with any other action never runs: it can't file, pay or send a filing", () => {
  for (const action of ["file", "pay", "send_filing", "submit"]) assertEquals(validRule({ id: "x", at: "", when: { event: "filing_approval" }, then: { action } }), null);
  assertEquals(validRule({ id: "x", at: "", when: { event: "job_done" }, then: { action: "second_owner" } }), null, "a second owner only where something waits for approval");
  const ws = { business: { en: "B", zh: "B" }, apps: [], approvals: [], audit: [], controls: { business: [{ id: "bad", when: { event: "filing_approval" }, then: { action: "file" }, at: "" }] } };
  assertEquals(fire(ws, { kind: "filing_approval", key: "k", title: { en: "t", zh: "t" } }).rules.length, 0);
});

Deno.test("the morning check fires each deadline once, puts the checklist item on, and saves only onto the newest state", async () => {
  const today = "2026-10-17";
  const state = {
    business: { en: "Moonleaf Tea", zh: "Moonleaf Tea" },
    apps: [{ id: "fire", checklist: [] }], approvals: [],
    deadlines: [{ id: "dl-fire", date: "2026-10-20", title: { en: "Fire inspection", zh: "消防检查" }, app: "fire" }, { id: "dl-far", date: "2026-12-01", title: { en: "Far away", zh: "很远" } }],
    controls: { business: [
      { id: "br-ck", when: { event: "deadline_soon", days: 7 }, then: { action: "checklist", item: "Book the hood cleaning" }, at: "x" },
      { id: "br-mail", when: { event: "deadline_soon", days: 7 }, then: { action: "notify", via: "email", to: "kevin@contractor.com" }, at: "x" },
    ] },
  };
  const { admin, tables } = fakeAdmin({ workspaces: [{ id: WS, state: structuredClone(state), updated_at: "v1" }], audit_log: [] }, {});
  const mails: string[] = [];
  const f = ((_u: string, init: RequestInit) => { mails.push(String(init.body)); return Promise.resolve(new Response("{}", { status: 200 })); }) as unknown as typeof fetch;
  const first = await deadlineRules(admin, env, [{ id: WS, name: "Moonleaf Tea", state }], today, { f });
  assertEquals(first, 2, "two rules fire for the one deadline under 7 days");
  const saved = tables.workspaces[0].state as typeof state & { controls: { fired?: unknown[] } };
  assertEquals((saved.apps[0].checklist as { id: string; state: string }[]).map(c => [c.id, c.state]), [["br-br-ck", "missing"]]);
  assertEquals(saved.controls.fired?.length, 2);
  assertEquals(tables.updates.length, 1, "one message claimed");
  assertEquals(mails.length, 1, "and sent once");
  assert(/Fire inspection is due in 3 days/.test(mails[0]), mails[0]);
  const again = await deadlineRules(admin, env, [{ id: WS, name: "Moonleaf Tea", state: saved }], today, { f });
  assertEquals(again, 0, "the next morning it doesn't fire again");
  assertEquals((tables.workspaces[0].state as typeof state).apps[0].checklist.length, 1);
});
