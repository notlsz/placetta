// What a disconnect takes with it. Instinct kept a person's inbox data after Google was disconnected. Here, when an owner
// disconnects an account, its token goes (the vault secret, and the provider's revoke where there is one), and so does
// what Placetta copied from it: for a mailbox, the threads Placetta watched for replies, with the senders and first
// lines of those replies. Documents an owner chose to import stay: they are the workspace's own files now, deleted with
// the workspace or one by one in Documents. Pure apart from the database calls, tested with a stand-in.

/** The tables holding copies of a connected account's data, by the kind of account. */
export const SYNCED: Record<string, { table: string; by: "kind" }[]> = {
  gmail: [{ table: "mail_threads", by: "kind" }],
  outlook_mail: [{ table: "mail_threads", by: "kind" }],
};

type Q = { eq(k: string, v: string): Q; then?: unknown } & PromiseLike<{ error: { code?: string } | null; count?: number | null }>;
export type PurgeDb = { from(t: string): { delete(o?: { count?: "exact" }): Q } };

/** Delete what was copied from this account. Returns the rows removed per table; a table that isn't there is skipped. */
export async function purgeSynced(db: PurgeDb, ws: string, kind: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const s of SYNCED[kind] ?? []) {
    // one account of a kind per workspace: everything of that kind goes, whichever mailbox it was sent from
    const { error, count } = await db.from(s.table).delete({ count: "exact" }).eq("workspace_id", ws).eq("kind", kind);
    if (error && error.code !== "42P01" && error.code !== "PGRST205") throw new Error(`${s.table} purge failed: ${error.code ?? ""}`);
    out[s.table] = (out[s.table] ?? 0) + (count ?? 0);
  }
  return out;
}
