// OAuth providers, token storage and authenticated provider calls.
// Copied into integrations/ and oauth-callback/. Keep the copies identical.
import { admin, describe, HttpError, type L10n, SUPABASE_URL } from "./shared.ts";

export const KINDS = ["gmail", "gcal", "gdrive", "outlook_mail", "outlook_cal", "dropbox", "quickbooks", "slack"] as const;
export type Kind = (typeof KINDS)[number];
export const isKind = (v: unknown): v is Kind => typeof v === "string" && (KINDS as readonly string[]).includes(v);

export type Provider = "google" | "microsoft" | "dropbox" | "quickbooks" | "slack";

export const PROVIDER: Record<Kind, Provider> = {
  gmail: "google",
  gcal: "google",
  gdrive: "google",
  outlook_mail: "microsoft",
  outlook_cal: "microsoft",
  dropbox: "dropbox",
  quickbooks: "quickbooks",
  slack: "slack",
};

export const NAMES: Record<Kind, L10n> = {
  gmail: { en: "Gmail", zh: "Gmail" },
  gcal: { en: "Google Calendar", zh: "Google 日历" },
  gdrive: { en: "Google Drive", zh: "Google 云端硬盘" },
  outlook_mail: { en: "Outlook Mail", zh: "Outlook 邮箱" },
  outlook_cal: { en: "Outlook Calendar", zh: "Outlook 日历" },
  dropbox: { en: "Dropbox", zh: "Dropbox" },
  quickbooks: { en: "QuickBooks", zh: "QuickBooks" },
  slack: { en: "Slack", zh: "Slack" },
};

/** Requested scopes. Dropbox uses the scopes enabled in its app console. */
export const SCOPES: Record<Kind, string> = {
  gmail: "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
  gcal: "openid email https://www.googleapis.com/auth/calendar.events",
  gdrive: "openid email https://www.googleapis.com/auth/drive.readonly",
  outlook_mail: "offline_access User.Read Mail.Read Mail.Send",
  outlook_cal: "offline_access User.Read Calendars.ReadWrite",
  dropbox: "",
  quickbooks: "com.intuit.quickbooks.accounting",
  slack: "incoming-webhook",
};

export const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/oauth-callback`;

const ENV: Record<Provider, [string, string]> = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  microsoft: ["MS_CLIENT_ID", "MS_CLIENT_SECRET"],
  dropbox: ["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET"],
  quickbooks: ["QB_CLIENT_ID", "QB_CLIENT_SECRET"],
  slack: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
};

const PROVIDER_NAME: Record<Provider, string> = {
  google: "Google",
  microsoft: "Microsoft",
  dropbox: "Dropbox",
  quickbooks: "QuickBooks",
  slack: "Slack",
};

export function creds(p: Provider): { id: string; secret: string } {
  const [idVar, secretVar] = ENV[p];
  const id = Deno.env.get(idVar) ?? "";
  const secret = Deno.env.get(secretVar) ?? "";
  if (!id || !secret) throw new HttpError("not_configured", `${PROVIDER_NAME[p]} is not set up yet. Set ${idVar} and ${secretVar}.`);
  return { id, secret };
}

const msTenant = (): string => Deno.env.get("MS_TENANT") || "common";
const qbEnv = (): "production" | "sandbox" => (Deno.env.get("QB_ENV") === "production" ? "production" : "sandbox");
export const qbApiBase = (): string =>
  qbEnv() === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";

const TOKEN_URL: Record<Provider, () => string> = {
  google: () => "https://oauth2.googleapis.com/token",
  microsoft: () => `https://login.microsoftonline.com/${encodeURIComponent(msTenant())}/oauth2/v2.0/token`,
  dropbox: () => "https://api.dropboxapi.com/oauth2/token",
  quickbooks: () => "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  slack: () => "https://slack.com/api/oauth.v2.access",
};

export function authorizeUrl(kind: Kind, state: string): string {
  const p = PROVIDER[kind];
  const { id } = creds(p);
  const q = new URLSearchParams({ client_id: id, redirect_uri: REDIRECT_URI, state });
  switch (p) {
    case "google":
      q.set("response_type", "code");
      q.set("scope", SCOPES[kind]);
      q.set("access_type", "offline");
      q.set("prompt", "consent");
      q.set("include_granted_scopes", "true");
      return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    case "microsoft":
      q.set("response_type", "code");
      q.set("response_mode", "query");
      q.set("scope", SCOPES[kind]);
      return `https://login.microsoftonline.com/${encodeURIComponent(msTenant())}/oauth2/v2.0/authorize?${q}`;
    case "dropbox":
      q.set("response_type", "code");
      q.set("token_access_type", "offline");
      return `https://www.dropbox.com/oauth2/authorize?${q}`;
    case "quickbooks":
      q.set("response_type", "code");
      q.set("scope", SCOPES[kind]);
      return `https://appcenter.intuit.com/connect/oauth2?${q}`;
    case "slack":
      q.set("scope", SCOPES[kind]);
      return `https://slack.com/oauth/v2/authorize?${q}`;
  }
}

// ------------------------------------------------------------------ tokens

/** What the vault holds for one integration, as a JSON string. */
export type Bundle = {
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null; // epoch ms
  token_type: string | null;
  webhook_url?: string;
  /** A team chat link's signing secret (Lark custom bots with signature checks on). */
  secret?: string;
};

export type Exchanged = { bundle: Bundle; account: string | null; scopes: string; meta: Record<string, unknown> };

type TokenReply = { status: number; body: Record<string, unknown> };

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v && Number.isFinite(Number(v)) ? Number(v) : null);

async function tokenRequest(p: Provider, params: Record<string, string>): Promise<TokenReply> {
  const { id, secret } = creds(p);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  const form = new URLSearchParams(params);
  if (p === "quickbooks") headers.Authorization = `Basic ${btoa(`${id}:${secret}`)}`;
  else {
    form.set("client_id", id);
    form.set("client_secret", secret);
  }
  let res: Response;
  try {
    res = await fetch(TOKEN_URL[p](), { method: "POST", headers, body: form, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    console.error(`${p} token endpoint unreachable:`, describe(e));
    throw new HttpError("upstream_error", `${PROVIDER_NAME[p]} did not respond. Try again.`);
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  // Slack answers 200 with ok:false on failure.
  const status = p === "slack" && body.ok === false ? 400 : res.status;
  if (status >= 400) console.error(`${p} token endpoint ${status}:`, String(body.error ?? "").slice(0, 80));
  return { status, body };
}

function expiresAt(body: Record<string, unknown>): number | null {
  const s = num(body.expires_in);
  return s ? Date.now() + s * 1000 : null;
}

function jwtEmail(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    const part = idToken.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    return str(claims.email);
  } catch {
    return null;
  }
}

async function getJson(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`account lookup ${res.status} at ${new URL(url).host}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.error("account lookup failed:", describe(e));
    return null;
  }
}

/** Exchange an authorization code. Throws HttpError; the callback turns it into a short code. */
export async function exchangeCode(kind: Kind, code: string, realmId: string | null): Promise<Exchanged> {
  const p = PROVIDER[kind];
  const params: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI };
  if (p === "microsoft") params.scope = SCOPES[kind];
  if (p === "quickbooks" && !(realmId && /^\d{1,32}$/.test(realmId))) throw new HttpError("bad_request", "missing_realm");

  const t = await tokenRequest(p, params);
  const access = str(t.body.access_token);
  if (t.status >= 400 || !access) throw new HttpError("upstream_error", "token_exchange");

  const bundle: Bundle = {
    access_token: access,
    refresh_token: str(t.body.refresh_token),
    expires_at: expiresAt(t.body),
    token_type: str(t.body.token_type),
  };
  const auth = { Authorization: `Bearer ${access}`, Accept: "application/json" };
  let account: string | null = null;
  let scopes = str(t.body.scope) ?? SCOPES[kind];
  const meta: Record<string, unknown> = {};

  switch (p) {
    case "google": {
      account = jwtEmail(t.body.id_token);
      if (!account) account = str((await getJson("https://openidconnect.googleapis.com/v1/userinfo", { headers: auth }))?.email);
      break;
    }
    case "microsoft": {
      const me = await getJson("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: auth });
      account = str(me?.mail) ?? str(me?.userPrincipalName);
      break;
    }
    case "dropbox": {
      const me = await getJson("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: "null",
      });
      account = str(me?.email);
      if (str(t.body.account_id)) meta.account_id = t.body.account_id;
      break;
    }
    case "quickbooks": {
      const realm = realmId as string;
      meta.realm_id = realm;
      meta.env = qbEnv();
      const info = await getJson(`${qbApiBase()}/v3/company/${realm}/companyinfo/${realm}`, { headers: auth });
      account = str((info?.CompanyInfo as Record<string, unknown> | undefined)?.CompanyName);
      break;
    }
    case "slack": {
      const hook = (t.body.incoming_webhook ?? {}) as Record<string, unknown>;
      const team = (t.body.team ?? {}) as Record<string, unknown>;
      const url = str(hook.url);
      if (!url || !url.startsWith("https://hooks.slack.com/")) throw new HttpError("upstream_error", "no_webhook");
      bundle.webhook_url = url;
      account = str(team.name);
      meta.channel = str(hook.channel);
      meta.channel_id = str(hook.channel_id);
      meta.team_id = str(team.id);
      scopes = str(t.body.scope) ?? SCOPES.slack;
      break;
    }
  }
  return { bundle, account, scopes, meta };
}

/** The provider refused the refresh token: the user must reconnect. */
export class RefreshRejected extends Error {}

export async function refreshBundle(kind: Kind, b: Bundle): Promise<Bundle> {
  const p = PROVIDER[kind];
  if (!b.refresh_token) throw new RefreshRejected("no refresh token");
  const params: Record<string, string> = { grant_type: "refresh_token", refresh_token: b.refresh_token };
  if (p === "microsoft") params.scope = SCOPES[kind];
  const t = await tokenRequest(p, params);
  const access = str(t.body.access_token);
  if (t.status === 400 || t.status === 401) throw new RefreshRejected(`refresh rejected ${t.status}`);
  if (t.status >= 400 || !access) throw new HttpError("upstream_error", `${NAMES[kind].en} did not refresh the sign-in. Try again.`);
  return {
    ...b,
    access_token: access,
    refresh_token: str(t.body.refresh_token) ?? b.refresh_token,
    expires_at: expiresAt(t.body) ?? Date.now() + 3600 * 1000,
    token_type: str(t.body.token_type) ?? b.token_type,
  };
}

// ------------------------------------------------------------------ stored integrations

export type IntegrationRow = {
  id: string;
  workspace_id: string;
  kind: Kind;
  account: string | null;
  scopes: string | null;
  status: "connected" | "error";
  error: string | null;
  secret_id: string | null;
  meta: Record<string, unknown>;
  connected_by: string | null;   // who connected the account: a member may read only what they connected themselves
};

const ROW_COLUMNS = "id, workspace_id, kind, account, scopes, status, error, secret_id, meta, connected_by";

export async function findIntegration(ws: string, kind: Kind): Promise<IntegrationRow | null> {
  const { data, error } = await admin.from("integrations").select(ROW_COLUMNS).eq("workspace_id", ws).eq("kind", kind).maybeSingle();
  if (error) throw new Error(`integration lookup failed: ${error.code ?? ""}`);
  return (data as IntegrationRow | null) ?? null;
}

export async function listIntegrations(ws: string, kinds: Kind[]): Promise<IntegrationRow[]> {
  const { data, error } = await admin.from("integrations").select(ROW_COLUMNS).eq("workspace_id", ws).in("kind", kinds);
  if (error) throw new Error(`integration lookup failed: ${error.code ?? ""}`);
  return (data as IntegrationRow[] | null) ?? [];
}

export async function readBundle(secretId: string | null): Promise<Bundle | null> {
  if (!secretId) return null;
  const { data, error } = await admin.rpc("vault_get", { p_id: secretId });
  if (error) throw new Error(`vault read failed: ${error.code ?? ""}`);
  if (typeof data !== "string" || !data) return null;
  try {
    const b = JSON.parse(data) as Bundle;
    return typeof b.access_token === "string" ? b : null;
  } catch {
    return null;
  }
}

/** Create a vault secret, or overwrite secretId. Returns the secret id. */
export async function writeBundle(b: Bundle, name: string, secretId: string | null): Promise<string> {
  const args: Record<string, unknown> = { p_secret: JSON.stringify(b), p_name: name };
  if (secretId) args.p_id = secretId;
  const { data, error } = await admin.rpc("vault_put", args);
  if (error || typeof data !== "string") throw new Error(`vault write failed: ${error?.code ?? ""}`);
  return data;
}

export async function dropSecret(secretId: string | null): Promise<void> {
  if (!secretId) return;
  const { error } = await admin.rpc("vault_drop", { p_id: secretId });
  if (error) console.error("vault drop failed:", error.code ?? "");
}

const reconnect = (kind: Kind) => new HttpError("not_connected", `Reconnect ${NAMES[kind].en} in Settings.`);

/** An open connection: refreshes tokens, retries once on 401, marks the row on a dead sign-in. */
export class Conn {
  private constructor(readonly row: IntegrationRow, private b: Bundle) {}

  get kind(): Kind {
    return this.row.kind;
  }
  get name(): string {
    return NAMES[this.row.kind].en;
  }
  get bundle(): Readonly<Bundle> {
    return this.b;
  }

  static async open(ws: string, kind: Kind): Promise<Conn> {
    const row = await findIntegration(ws, kind);
    if (!row) throw new HttpError("not_connected", `Connect ${NAMES[kind].en} in Settings.`);
    return Conn.fromRow(row);
  }

  static async fromRow(row: IntegrationRow): Promise<Conn> {
    const b = await readBundle(row.secret_id);
    const c = new Conn(row, b ?? { access_token: "", refresh_token: null, expires_at: null, token_type: null });
    if (!b) {
      await c.markError("The saved sign-in is missing. Reconnect in Settings.");
      throw reconnect(row.kind);
    }
    const { error } = await admin.from("integrations").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
    if (error) console.error("last_used_at update failed:", error.code ?? "");
    return c;
  }

  async markError(message: string): Promise<void> {
    const { error } = await admin.from("integrations").update({ status: "error", error: message }).eq("id", this.row.id);
    if (error) console.error("integration status update failed:", error.code ?? "");
    this.row.status = "error";
  }

  private refreshing: Promise<string> | null = null;

  /** A usable access token, refreshed when it expires within 60 seconds (or when forced). */
  async token(force = false): Promise<string> {
    const exp = this.b.expires_at;
    if (!force && (!exp || exp - Date.now() > 60_000)) return this.b.access_token;
    if (!this.b.refresh_token) {
      if (!force && exp && exp > Date.now()) return this.b.access_token;
      await this.markError("The sign-in expired. Reconnect in Settings.");
      throw reconnect(this.kind);
    }
    // One refresh at a time: parallel calls share it (some providers rotate refresh tokens).
    if (!this.refreshing) this.refreshing = this.refresh().finally(() => (this.refreshing = null));
    return await this.refreshing;
  }

  private async refresh(): Promise<string> {
    try {
      this.b = await refreshBundle(this.kind, this.b);
    } catch (e) {
      if (e instanceof RefreshRejected) {
        await this.markError("The sign-in expired or access was removed. Reconnect in Settings.");
        throw reconnect(this.kind);
      }
      throw e;
    }
    await writeBundle(this.b, `integration:${this.kind}`, this.row.secret_id);
    if (this.row.status === "error") {
      await admin.from("integrations").update({ status: "connected", error: null }).eq("id", this.row.id);
      this.row.status = "connected";
    }
    return this.b.access_token;
  }

  /** fetch with the bearer token. Retries once after a forced refresh on 401. */
  async call(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
    const go = async (tok: string): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${tok}`);
      try {
        return await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
      } catch (e) {
        console.error(`${this.kind} request failed:`, describe(e));
        throw new HttpError("upstream_error", `${this.name} did not respond. Try again.`);
      }
    };
    let res = await go(await this.token());
    if (res.status === 401 && this.b.refresh_token) {
      await res.body?.cancel();
      res = await go(await this.token(true));
    }
    if (res.status === 401) {
      await res.body?.cancel();
      await this.markError("The sign-in was rejected. Reconnect in Settings.");
      throw reconnect(this.kind);
    }
    return res;
  }

  /** call, then parse JSON; any non-2xx becomes upstream_error. */
  async callJson<T = Record<string, unknown>>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await this.call(url, init);
    if (!res.ok) throw await this.upstream(res);
    if (res.status === 202 || res.status === 204) return {} as T;
    return (await res.json()) as T;
  }

  /** Log a provider error (status and error code only) and build the response error. */
  async upstream(res: Response): Promise<HttpError> {
    let code = "";
    try {
      const body = (await res.json()) as Record<string, unknown>;
      const err = body.error as Record<string, unknown> | string | undefined;
      code = typeof err === "string" ? err : String(body.error_summary ?? err?.status ?? err?.code ?? "");
    } catch {
      /* not JSON */
    }
    console.error(`${this.kind} upstream ${res.status}:`, code.slice(0, 80));
    if (res.status === 404 || (res.status === 409 && /not_found/i.test(code))) {
      return new HttpError("not_found", `${this.name} could not find that item.`);
    }
    if (res.status === 403) return new HttpError("upstream_error", `${this.name} refused the request. Check the connection's permissions.`);
    return new HttpError("upstream_error", `${this.name} returned an error (${res.status}). Try again.`);
  }
}

// ------------------------------------------------------------------ disconnect

/** Rows that share the same grant. Revoking would cut them off too, so we skip the revoke then. */
async function grantShared(row: IntegrationRow): Promise<boolean> {
  const p = PROVIDER[row.kind];
  const kinds = KINDS.filter((k) => PROVIDER[k] === p);
  let q = admin.from("integrations").select("id").in("kind", kinds).neq("id", row.id).limit(1);
  if (p === "quickbooks") {
    const realm = typeof row.meta?.realm_id === "string" ? row.meta.realm_id : null;
    if (!realm) return true;
    q = q.eq("meta->>realm_id", realm);
  } else if (p === "slack") {
    const team = typeof row.meta?.team_id === "string" ? row.meta.team_id : null;
    if (!team) return true;
    q = q.eq("meta->>team_id", team);
  } else {
    if (!row.account) return true;
    q = q.eq("account", row.account);
  }
  const { data, error } = await q;
  if (error) return true;
  return (data?.length ?? 0) > 0;
}

/** Best-effort revoke. Never throws. Microsoft has no per-token revoke endpoint, so it is skipped. */
export async function revoke(row: IntegrationRow): Promise<void> {
  try {
    const p = PROVIDER[row.kind];
    if (p === "microsoft") return;
    const b = await readBundle(row.secret_id);
    if (!b) return;
    if (await grantShared(row)) return;
    const signal = AbortSignal.timeout(8000);
    let res: Response | null = null;
    switch (p) {
      case "google":
        res = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: b.refresh_token ?? b.access_token }),
          signal,
        });
        break;
      case "dropbox": {
        let tok = b.access_token;
        if (b.expires_at && b.expires_at - Date.now() < 60_000 && b.refresh_token) tok = (await refreshBundle(row.kind, b)).access_token;
        res = await fetch("https://api.dropboxapi.com/2/auth/token/revoke", { method: "POST", headers: { Authorization: `Bearer ${tok}` }, signal });
        break;
      }
      case "quickbooks": {
        const { id, secret } = creds("quickbooks");
        res = await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
          method: "POST",
          headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ token: b.refresh_token ?? b.access_token }),
          signal,
        });
        break;
      }
      case "slack":
        res = await fetch("https://slack.com/api/auth.revoke", { method: "POST", headers: { Authorization: `Bearer ${b.access_token}` }, signal });
        break;
    }
    if (res && !res.ok) console.error(`${row.kind} revoke ${res.status}`);
    await res?.body?.cancel();
  } catch (e) {
    console.error(`${row.kind} revoke skipped:`, describe(e));
  }
}
