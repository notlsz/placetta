// sso: single sign-on status and domain verification for a workspace (owners and admins). See logic.ts.
// POST {workspace_id, action: "status" | "verify"}
import { authStatus, verifyTxt } from "./logic.ts";
import { admin, HttpError, ok, readBody, requireAccess, requireUser, serve, SUPABASE_URL, userClient, uuidParam } from "./shared.ts";

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type Settings = { domain: string | null; txt_name: string | null; txt_value: string | null; verified_at: string | null };

serve(async (req) => {
  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  await requireAccess(ws, user, jwt, "admin");
  // as the person, so the database checks they're an owner or admin and sees how they signed in
  const { data, error } = await userClient(jwt).rpc("security_settings", { ws });
  if (error) throw new HttpError("forbidden", (error.message ?? "Only an owner or admin can see sign-in settings.").replace(/^.*?:\s/, ""));
  const s = data as Settings;

  if (body.action === "status") {
    return ok({ settings: s, auth: await authStatus(SUPABASE_URL, ANON_KEY, SERVICE_KEY, s.domain) });
  }

  if (body.action === "verify") {
    if (!s.domain || !s.txt_name || !s.txt_value) throw new HttpError("bad_request", "Add your company's email domain first.", "请先填写公司邮箱域名。");
    if (s.verified_at) return ok({ verified: true, settings: s });
    const v = await verifyTxt(s.txt_name, s.txt_value);
    if (!v.verified) return ok({ ...v, settings: s });
    const { error: markError } = await admin.rpc("sso_mark_verified", { ws, p_domain: s.domain, p_by: user.id });
    if (markError) throw new HttpError("bad_request", (markError.message ?? "Couldn't verify the domain.").replace(/^.*?:\s/, ""));
    const { data: after } = await userClient(jwt).rpc("security_settings", { ws });
    return ok({ verified: true, settings: after });
  }

  throw new HttpError("bad_request", "Unknown action. Use status or verify.");
});
