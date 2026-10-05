// team: invite people to a workspace and email them.
// POST {workspace_id, action, ...}. Owners only.
//   invite {email, role: "owner" | "member", return_url?}   records the invite (the database checks and audits it), then emails it
//   resend {id, return_url?}                                emails an open invite again
// The invite is accepted when that email signs in (accept_invites in the database), so the email only has to get them to sign in:
// new people get Supabase's invite email, people with an account get a sign-in link.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  admin,
  allowedReturn,
  appOrigins,
  HttpError,
  ok,
  readBody,
  requireAccess,
  requireUser,
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

serve(async (req) => {
  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
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

  throw new HttpError("bad_request", "Unknown action. Use invite or resend.");
});
