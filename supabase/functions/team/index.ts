// team: invite people to a workspace and email them.
// POST {workspace_id, action, ...}.
//   invite {email, role: "owner" | "member", return_url?}   owners: records the invite (the database checks and audits it), then emails it
//   resend {id, return_url?}                                owners: emails an open invite again
//   remove {user_id}                                        owners remove anyone; anyone can remove themselves (leave)
//   delete_account {confirm: "DELETE"}                      no workspace_id: deletes the caller's account (see deleteAccount)
// The invite is accepted when that email signs in (accept_invites in the database), so the email only has to get them to sign in:
// new people get Supabase's invite email, people with an account get a sign-in link.
import { createClient, type User } from "npm:@supabase/supabase-js@2";
import {
  aalOf,
  admin,
  allowedReturn,
  appOrigins,
  audit,
  HttpError,
  json,
  ok,
  readBody,
  requireAccess,
  requireUser,
  same,
  serve,
  SUPABASE_URL,
  text,
  userClient,
  uuidParam,
} from "./shared.ts";

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

async function sendInvite(email: string, redirectTo: string | undefined): Promise<"invite" | "sign_in_link" | "not_sent"> {
  const { error } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
  if (!error) return "invite";
  if (!/already|registered|exists/i.test(error.message ?? "")) {
    console.error("invite email failed:", error.status ?? "", (error.message ?? "").slice(0, 160));
    return "not_sent";
  }
  // They already have an account: a sign-in link gets them in, and signing in accepts the invite.
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: linkError } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, ...(redirectTo ? { emailRedirectTo: redirectTo } : {}) } });
  if (linkError) {
    console.error("sign-in link failed:", linkError.status ?? "", (linkError.message ?? "").slice(0, 160));
    return "not_sent";
  }
  return "sign_in_link";
}

/** A paid plan still running (Stripe would keep charging it): the account can't be deleted until it's canceled. */
const PAID = ["active", "trialing", "past_due"];

/** Every stored file under a workspace's folder in the documents bucket (paths are ws/..., at most a few folders deep). */
async function storedFiles(prefix: string, depth = 0, out: string[] = []): Promise<string[]> {
  if (depth > 4 || out.length > 5000) return out;
  const { data, error } = await admin.storage.from("documents").list(prefix, { limit: 1000 });
  if (error) {
    console.error("storage list failed:", (error.message ?? "").slice(0, 160));
    return out;
  }
  for (const o of data ?? []) {
    const path = `${prefix}/${o.name}`;
    if (o.id === null) await storedFiles(path, depth + 1, out); // a folder
    else out.push(path);
  }
  return out;
}

/**
 * delete_account {confirm: "DELETE"}: the signed-in person deletes their account.
 * Workspaces they own alone are deleted with everything in them (refused while one has a paid plan running);
 * on the others they just leave. Then the auth user is deleted. Two-step first when it's on.
 */
async function deleteAccount(user: User, jwt: string, body: Record<string, unknown>): Promise<Response> {
  if (body.confirm !== "DELETE") throw new HttpError("bad_request", "Type DELETE to confirm.");
  const { data: mfa, error: mfaError } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  const factors = mfaError ? (user.factors ?? []) : (mfa?.factors ?? []);
  if (factors.some((f) => f.status === "verified") && aalOf(jwt) !== "aal2") {
    throw new HttpError("mfa_required", "Finish two-step sign-in to delete your account.");
  }

  const { data: mine, error } = await admin.from("workspace_members").select("workspace_id, role").eq("user_id", user.id);
  if (error) throw new Error(`membership lookup failed: ${error.code ?? ""}`);
  const owned = (mine ?? []).filter((m) => m.role === "owner").map((m) => m.workspace_id as string);
  const others = (mine ?? []).filter((m) => m.role !== "owner").map((m) => m.workspace_id as string);
  // Workspaces where this person is the only owner go with the account; where another owner remains, they just leave.
  const alone: string[] = [];
  if (owned.length) {
    const { data: owners, error: ownersError } = await admin.from("workspace_members").select("workspace_id, user_id").in("workspace_id", owned).eq("role", "owner");
    if (ownersError) throw new Error(`owner lookup failed: ${ownersError.code ?? ""}`);
    for (const ws of owned) {
      if ((owners ?? []).some((o) => o.workspace_id === ws && o.user_id !== user.id)) others.push(ws);
      else alone.push(ws);
    }
  }

  if (alone.length) {
    const { data: paid, error: billingError } = await admin.from("billing").select("workspace_id").in("workspace_id", alone).in("subscription_status", PAID);
    if (billingError) throw new Error(`billing lookup failed: ${billingError.code ?? ""}`);
    if (paid?.length) {
      const { data: names } = await admin.from("workspaces").select("name").in("id", paid.map((p) => p.workspace_id as string));
      const list = (names ?? []).map((n) => n.name as string).join(", ");
      return json({ error: { code: "subscription_active", message: `Cancel the paid plan for ${list || "your workspace"} in Manage billing first, then delete your account.` } }, 409);
    }
  }

  // Leave the shared workspaces, with a line in each audit trail.
  if (others.length) {
    const { error: leaveError } = await admin.from("workspace_members").delete().eq("user_id", user.id).in("workspace_id", others);
    if (leaveError) throw new Error(`leaving workspaces failed: ${leaveError.code ?? ""}`);
    for (const ws of others) {
      await audit({ workspace_id: ws, actor: "you", actor_id: null, action: { en: "Deleted their account and left the workspace", zh: "删除了账户并离开了工作区" }, object: same(user.email ?? user.phone ?? "") });
    }
  }

  // Delete the workspaces they owned alone. Members, billing, filings, documents, the audit trail and the rest cascade.
  if (alone.length) {
    const files = (await Promise.all(alone.map((ws) => storedFiles(ws)))).flat();
    const { error: wsError } = await admin.from("workspaces").delete().in("id", alone);
    if (wsError) throw new Error(`workspace deletion failed: ${wsError.code ?? ""}`);
    for (let i = 0; i < files.length; i += 100) {
      const { error: rmError } = await admin.storage.from("documents").remove(files.slice(i, i + 100));
      if (rmError) console.error("storage remove failed:", (rmError.message ?? "").slice(0, 160));
    }
  }

  const { error: pinError } = await admin.from("account_pins").delete().eq("user_id", user.id);
  if (pinError) console.error("pin removal failed:", pinError.code ?? "");

  // The account itself. A hard delete needs the auth.users references set to "on delete set null"
  // (migration 20261012200000_account_deletion); until that's applied, a soft delete scrubs the account instead.
  const { error: delError } = await admin.auth.admin.deleteUser(user.id);
  if (delError) {
    console.error("hard delete failed, soft deleting:", (delError.message ?? "").slice(0, 160));
    const { error: softError } = await admin.auth.admin.deleteUser(user.id, true);
    if (softError) throw new Error(`account deletion failed: ${(softError.message ?? "").slice(0, 120)}`);
  }
  return ok({ deleted: true, workspaces: alone.length });
}

serve(async (req) => {
  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  if (body.action === "delete_account") return await deleteAccount(user, jwt, body);
  const ws = uuidParam(body.workspace_id, "workspace_id");

  if (body.action === "remove") {
    const target = uuidParam(body.user_id, "user_id");
    // The database checks who may remove whom, keeps the last owner, and writes the audit entry.
    const { data: role, error } = await userClient(jwt).rpc("check_remove_member", { ws, p_user: target });
    if (error) throw new HttpError("bad_request", (error.message ?? "Couldn't remove them.").replace(/^.*?:\s/, ""));
    const { error: delError } = await admin.from("workspace_members").delete().eq("workspace_id", ws).eq("user_id", target);
    if (delError) throw new Error(`member removal failed: ${delError.code ?? ""}`);
    // Two owners removing each other at the same moment could leave none: put this one back if so.
    const { count } = await admin.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws).eq("role", "owner");
    if (!count) {
      await admin.from("workspace_members").insert({ workspace_id: ws, user_id: target, role: role ?? "owner" });
      throw new HttpError("bad_request", "Add another owner first. A workspace needs one.");
    }
    return ok({ removed: target });
  }

  await requireAccess(ws, user, jwt, "owner");
  const redirectTo = allowedReturn(body.return_url, appOrigins()) ?? undefined;

  if (body.action === "invite") {
    const email = text(body.email, "email", 3, 254).toLowerCase();
    const role = body.role === "owner" ? "owner" : "member";
    // As the signed-in owner, so the database's own checks and audit entry apply.
    const { data: id, error } = await userClient(jwt).rpc("invite_member", { ws, p_email: email, p_role: role });
    if (error) throw new HttpError("bad_request", (error.message ?? "Couldn't invite them.").replace(/^.*?:\s/, ""));
    const sent = await sendInvite(email, redirectTo);
    return ok({ id, sent });
  }

  if (body.action === "resend") {
    const id = uuidParam(body.id, "id");
    const { data: inv, error } = await admin
      .from("workspace_invites")
      .select("email, created_at")
      .eq("id", id)
      .eq("workspace_id", ws)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw new Error(`invite lookup failed: ${error.code ?? ""}`);
    if (!inv) throw new HttpError("not_found", "That invite is gone. Invite them again.");
    // One email per invite every 10 minutes, so resend can't be used to flood an inbox.
    if (Date.now() - Date.parse(inv.created_at as string) < 10 * 60_000) throw new HttpError("bad_request", "It was sent a few minutes ago. Try again in 10 minutes.");
    const { error: touchError } = await admin.from("workspace_invites").update({ created_at: new Date().toISOString() }).eq("id", id);
    if (touchError) throw new Error(`invite update failed: ${touchError.code ?? ""}`);
    return ok({ id, sent: await sendInvite(inv.email as string, redirectTo) });
  }

  throw new HttpError("bad_request", "Unknown action. Use invite, resend or remove.");
});
