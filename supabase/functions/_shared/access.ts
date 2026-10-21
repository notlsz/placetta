// Who may do what in a workspace, for the functions that keep their own accessFor (agent, agent-run, tts, billing).
// The rules live in the database (access_for): the person's role (owner, admin, member, viewer), staff with two-step,
// "mfa_required", and "sso_required" when their email domain requires single sign-on and this session didn't use it.
// The functions with shared.ts use its accessFor and requireAccess, which follow the same rules.

type Rpc = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }> };

/** The JWT's claims (the caller verified the token with getUser first). */
export function claimsOf(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split(".")[1] ?? "";
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return claims && typeof claims === "object" && !Array.isArray(claims) ? claims : {};
  } catch {
    return {};
  }
}

export const aalOf = (jwt: string): string => {
  const aal = claimsOf(jwt).aal;
  return typeof aal === "string" ? aal : "aal1";
};

/** access_for with how the session signed in (its amr claim), so the database can apply the SSO rule. Falls back to
 *  the three-argument access_for on a database without the enterprise access migration. */
export async function accessRpc(db: Rpc, ws: string, uid: string, jwt: string): Promise<{ data: unknown; error: { code?: string } | null }> {
  const r = await db.rpc("access_for", { ws, uid, p_aal: aalOf(jwt), p_claims: { amr: claimsOf(jwt).amr ?? [] } });
  if (!r.error || r.error.code !== "PGRST202") return r;
  return await db.rpc("access_for", { ws, uid, p_aal: aalOf(jwt) });
}

/** Roles that may change the workspace (ask Odelia to work, have replies read aloud): members, admins, owners. */
export const WORKS = new Set(["owner", "admin", "member"]);
