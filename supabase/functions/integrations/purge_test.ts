// deno test integrations/purge_test.ts: a disconnect takes what Placetta copied from the account with it (Instinct kept
// inbox data after Google was disconnected).
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { purgeSynced, SYNCED, type PurgeDb } from "./purge.ts";

type Row = { workspace_id: string; kind: string; last_reply_snippet: string };
function fakeDb(rows: Row[], missing = false) {
  const db: PurgeDb = {
    from(t: string) {
      return {
        delete() {
          const f: [string, string][] = [];
          const q = {
            eq(k: string, v: string) { f.push([k, v]); return q; },
            then(res: (v: { error: { code?: string } | null; count: number | null }) => unknown) {
              if (missing) return Promise.resolve(res({ error: { code: "42P01" }, count: null }));
              assert(t === "mail_threads");
              const keep = rows.filter((r) => !f.every(([k, v]) => (r as unknown as Record<string, string>)[k] === v));
              const n = rows.length - keep.length;
              rows.splice(0, rows.length, ...keep);
              return Promise.resolve(res({ error: null, count: n }));
            },
          };
          return q as never;
        },
      };
    },
  };
  return db;
}

Deno.test("disconnecting Gmail deletes the workspace's watched Gmail threads and their reply snippets, and nothing else", async () => {
  const rows: Row[] = [
    { workspace_id: "w1", kind: "gmail", last_reply_snippet: "Re: lease, from the landlord" },
    { workspace_id: "w1", kind: "gmail", last_reply_snippet: "" },
    { workspace_id: "w1", kind: "outlook_mail", last_reply_snippet: "kept: another account" },
    { workspace_id: "w2", kind: "gmail", last_reply_snippet: "kept: another workspace" },
  ];
  assertEquals(await purgeSynced(fakeDb(rows), "w1", "gmail"), { mail_threads: 2 });
  assertEquals(rows.map((r) => `${r.workspace_id}:${r.kind}`), ["w1:outlook_mail", "w2:gmail"]);
  assertEquals(await purgeSynced(fakeDb(rows), "w1", "outlook_mail"), { mail_threads: 1 });
});

Deno.test("every mailbox kind that copies mail is covered; an account that copies nothing purges nothing", async () => {
  assert(SYNCED.gmail && SYNCED.outlook_mail);
  assertEquals(await purgeSynced(fakeDb([]), "w1", "slack"), {});
  assertEquals(await purgeSynced(fakeDb([], true), "w1", "gmail"), { mail_threads: 0 });
});
