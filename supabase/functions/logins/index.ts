// logins: the secure store for agency portal logins.
// POST {workspace_id, action, ...}
//   save   {agency, url?, username, password, note?, id?}  members: create, or update when id is given
//   reveal {id}                                           Placetta staff only: returns the password, audited
//   delete {id}                                           members
// Passwords live only in the vault. They are never logged and never written to the audit log.
import {
  admin,
  audit,
  HttpError,
  isStaff,
  ok,
  optText,
  readBody,
  requireMember,
  requireUser,
  same,
  serve,
  text,
  uuidParam,
} from "./shared.ts";

const LOGIN_COLUMNS = "id, workspace_id, agency, url, username, note, created_by, created_at, updated_at, last_opened_at, last_opened_by";

type LoginRow = {
  id: string;
  workspace_id: string;
  agency: string;
  url: string | null;
  username: string;
  note: string | null;
  secret_id: string;
};

async function findLogin(ws: string, id: string): Promise<LoginRow> {
  const { data, error } = await admin
    .from("agency_logins")
    .select("id, workspace_id, agency, url, username, note, secret_id")
    .eq("id", id)
    .eq("workspace_id", ws)
    .maybeSingle();
  if (error) throw new Error(`login lookup failed: ${error.code ?? ""}`);
  if (!data) throw new HttpError("not_found", "That saved login was not found.");
  return data as LoginRow;
}

function httpsUrl(v: unknown): string | null {
  const s = optText(v, "url", 2000);
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new HttpError("bad_request", "url must be a full https:// link.");
  }
  if (u.protocol !== "https:" || u.username || u.password) throw new HttpError("bad_request", "url must be a full https:// link.");
  return u.toString();
}

/** The password exactly as typed (never trimmed). Undefined when omitted. */
function password(v: unknown, required: boolean): string | undefined {
  if (v === undefined || v === null) {
    if (required) throw new HttpError("bad_request", "password is required.");
    return undefined;
  }
  if (typeof v !== "string" || v.length < 1) throw new HttpError("bad_request", "password is required.");
  if (v.length > 500) throw new HttpError("bad_request", "password is too long (at most 500 characters).");
  return v;
}

async function vaultPut(secret: string, ws: string, id?: string): Promise<string> {
  const args: Record<string, unknown> = { p_secret: secret, p_name: `agency_login:${ws}` };
  if (id) args.p_id = id;
  const { data, error } = await admin.rpc("vault_put", args);
  if (error || typeof data !== "string") throw new Error(`vault write failed: ${error?.code ?? ""}`);
  return data;
}

async function vaultDrop(id: string): Promise<void> {
  const { error } = await admin.rpc("vault_drop", { p_id: id });
  if (error) console.error("vault drop failed:", error.code ?? "");
}

serve(async (req) => {
  const { user } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const action = body.action;

  if (action === "save") {
    await requireMember(ws, user.id);
    const agency = text(body.agency, "agency", 1, 160);
    const username = text(body.username, "username", 1, 200);
    const url = httpsUrl(body.url);
    const note = optText(body.note, "note", 1000);
    const id = body.id === undefined || body.id === null || body.id === "" ? null : uuidParam(body.id, "id");
    const pw = password(body.password, !id);

    let login: Record<string, unknown>;
    if (id) {
      const row = await findLogin(ws, id);
      if (pw !== undefined) await vaultPut(pw, ws, row.secret_id);
      const { data, error } = await admin
        .from("agency_logins")
        .update({ agency, url, username, note, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", ws)
        .select(LOGIN_COLUMNS)
        .single();
      if (error || !data) throw new Error(`login update failed: ${error?.code ?? ""}`);
      login = data;
    } else {
      const secretId = await vaultPut(pw as string, ws);
      const { data, error } = await admin
        .from("agency_logins")
        .insert({ workspace_id: ws, agency, url, username, note, secret_id: secretId, created_by: user.id })
        .select(LOGIN_COLUMNS)
        .single();
      if (error || !data) {
        await vaultDrop(secretId);
        throw new Error(`login insert failed: ${error?.code ?? ""}`);
      }
      login = data;
    }

    await audit({
      workspace_id: ws,
      actor: "you",
      actor_id: user.id,
      action: { en: "Saved a login", zh: "保存登录信息" },
      object: same(agency),
    });
    return ok({ login });
  }

  if (action === "reveal") {
    if (!(await isStaff(user))) throw new HttpError("forbidden", "Only the Placetta team can open saved logins.");
    const id = uuidParam(body.id, "id");
    const row = await findLogin(ws, id);
    const { data: secret, error } = await admin.rpc("vault_get", { p_id: row.secret_id });
    if (error) throw new Error(`vault read failed: ${error.code ?? ""}`);
    if (typeof secret !== "string" || !secret) throw new HttpError("not_found", "The saved password is missing. Ask the customer to save it again.");

    // Log first: if the audit row can't be written, the password is not shown.
    await audit(
      {
        workspace_id: ws,
        actor: "team",
        actor_id: user.id,
        action: { en: "Opened your login to file", zh: "为提交申请打开了您的登录信息" },
        object: same(row.agency),
        detail: same(user.email ?? ""),
      },
      true,
    );
    const { error: touchError } = await admin
      .from("agency_logins")
      .update({ last_opened_at: new Date().toISOString(), last_opened_by: user.id })
      .eq("id", row.id);
    if (touchError) console.error("last_opened update failed:", touchError.code ?? "");

    return ok({ agency: row.agency, url: row.url, username: row.username, password: secret });
  }

  if (action === "delete") {
    await requireMember(ws, user.id);
    const id = uuidParam(body.id, "id");
    const row = await findLogin(ws, id);
    const { error } = await admin.from("agency_logins").delete().eq("id", row.id).eq("workspace_id", ws);
    if (error) throw new Error(`login delete failed: ${error.code ?? ""}`);
    await vaultDrop(row.secret_id);
    await audit({
      workspace_id: ws,
      actor: "you",
      actor_id: user.id,
      action: { en: "Removed a saved login", zh: "删除了已保存的登录信息" },
      object: same(row.agency),
    });
    return ok();
  }

  throw new HttpError("bad_request", "Unknown action. Use save, reveal or delete.");
});
