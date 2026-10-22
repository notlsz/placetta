// Who a run acts for. agent-run saves the workspace with the service role, so the role a run may act with is looked up
// here, from the database, at the start of every chunk (a run can outlive a role change): the person who started it and
// their role in this workspace now (owner, admin, member, viewer), Placetta staff, or the system for background checks
// that nobody started. Every tool call is then checked against that role (src/security/policy.ts); the service role
// never stands in for them.

export type Role = "owner" | "admin" | "member" | "viewer" | "staff" | "system";
export type Actor = { id: string | null; role: Role };
type Db = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  from(t: string): { select(c: string): { eq(k: string, v: unknown): { eq(k: string, v: unknown): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> } } } };
};
const ROLES = new Set(["owner", "admin", "member", "viewer", "staff"]);

/** The run's actor, or why it can't run: the person left the workspace, or only views it. */
export async function actorOf(db: Db, run: { workspace_id: string; created_by: string | null; kind: string }): Promise<{ actor: Actor } | { refused: string }> {
  if (!run.created_by) return run.kind === "watch" ? { actor: { id: null, role: "system" } } : { refused: "This run has no person behind it." };
  let role: string | null = null;
  const r = await db.rpc("agent_actor_role", { p_ws: run.workspace_id, p_uid: run.created_by });
  if (!r.error) role = typeof r.data === "string" ? r.data : null;
  else if (r.error.code === "PGRST202" || r.error.code === "42883") {
    // a database without 20261022190000_agent_security.sql yet: the membership row alone
    const { data } = await db.from("workspace_members").select("role").eq("workspace_id", run.workspace_id).eq("user_id", run.created_by).maybeSingle();
    role = (data as { role?: string } | null)?.role ?? "none";
  } else return { refused: "Couldn't check who asked. Try again." };
  if (!role || !ROLES.has(role)) return { refused: "The person who asked isn't on this workspace anymore, so Odelia stopped." };
  if (role === "viewer") return { refused: "The person who asked can only view this workspace now, so Odelia stopped. Ask an admin for member access." };
  return { actor: { id: run.created_by, role: role as Role } };
}
