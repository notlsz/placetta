// scim: SCIM 2.0 provisioning for a workspace's identity provider (Okta, Microsoft Entra ID, Google, OneLogin...).
// The IdP's SCIM base URL is https://<project>.supabase.co/functions/v1/scim/v2 and its token is the one an owner or
// admin makes in Settings, Security (shown once; only its SHA-256 is kept). The protocol is in logic.ts; the rules in
// the database. Deployed with verify_jwt = false (supabase/config.toml): it checks its own token.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Filter, type GroupRow, handle, type Store, type UserRow } from "./logic.ts";

const URL_ = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const BASE = `${URL_}/functions/v1/scim/v2`;
const DOCS = "https://placetta.com/trust.html";

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  // the database's own messages (scim_conflict, scim_not_found, scim_invalid: ..., scim_owner) become SCIM errors
  if (error) throw new Error(error.message ?? `${fn} failed`);
  return data as T;
}
const filterArgs = (f: Filter | null) => ({ p_attr: f?.attr ?? null, p_value: f?.value ?? null });

const store: Store = {
  async auth(hash) {
    const { data, error } = await admin.rpc("scim_auth", { p_hash: hash });
    if (error) { console.error("scim_auth", error.code ?? ""); return null; }
    return (data as string | null) ?? null;
  },
  async limit(key, max, windowSeconds) {
    const { data, error } = await admin.rpc("rate_hit", { p_key: key, p_limit: max, p_window_seconds: windowSeconds });
    if (error) { console.error("rate_hit", error.code ?? ""); return false; }
    return data === true;
  },
  listUsers: (ws, f, start, count) => call("scim_users_list", { ws, ...filterArgs(f), p_start: start, p_count: count }),
  async getUser(ws, id) {
    const r = await call<{ rows: UserRow[] }>("scim_users_list", { ws, p_attr: null, p_value: null, p_start: 1, p_count: 1, p_id: id });
    return r.rows[0] ?? null;
  },
  putUser: (ws, id, p) => call("scim_user_put", { ws, p_id: id, p }),
  async deleteUser(ws, id) { await call("scim_user_delete", { ws, p_id: id }); },
  listGroups: (ws, f, start, count) => call("scim_groups_list", { ws, ...filterArgs(f), p_start: start, p_count: count }),
  async getGroup(ws, id) {
    const r = await call<{ rows: GroupRow[] }>("scim_groups_list", { ws, p_attr: null, p_value: null, p_start: 1, p_count: 1, p_id: id });
    return r.rows[0] ?? null;
  },
  async putGroup(ws, id, p) {
    const g = await call<{ id: string }>("scim_group_put", { ws, p_id: id, p });
    return (await store.getGroup(ws, g.id))!;
  },
  async deleteGroup(ws, id) { await call("scim_group_delete", { ws, p_id: id }); },
  async note(ws, en, zh, who) {
    const { error } = await admin.from("audit_log").insert({ workspace_id: ws, actor: "idp", actor_id: null, action: { en, zh }, object: { en: who, zh: who } });
    if (error) console.error("scim audit", error.code ?? "");
  },
};

Deno.serve((req) => handle(req, store, BASE, DOCS));
