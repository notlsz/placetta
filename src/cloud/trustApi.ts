import { supabase } from "./api";
import type { TrustShow, TrustSnapshot, TrustView } from "../trust";

/* ------------------------------------------------------------------ *
 * Status pages (src/trust.ts): the owner's links and document requests,
 * and the public page by its token. The rules live in the database
 * (supabase/migrations/20261031160000_trust_pages.sql): only an owner
 * shares, changes or revokes; the token is kept only as its SHA-256;
 * what a page shows is cut to the owner's choices when it's written and
 * again when it's read.
 * ------------------------------------------------------------------ */

/** expires_at null: no end date. locked: it has a password. signups: businesses that started from its footer link. */
export type TrustLink = { id: string; store_id: string; label: string; prefix: string; show: TrustShow; snapshot_at: string | null; created_at: string; expires_at: string | null; revoked_at: string | null;
  views: number; last_viewed_at: string | null; open_requests: number; locked?: boolean; signups?: number };
export type TrustRequest = { id: string; link_id: string; prefix: string; label: string; name: string; email: string; org: string; note: string; status: "open" | "sent" | "declined"; created_at: string };
export type TrustPage = { status: "gone" } | { status: "locked"; wrong?: boolean } | ({ status: "ok"; snapshot_at: string | null; expires_at: string | null } & TrustView);
/** Whether a link still opens: not revoked, and not past its end date (when it has one). */
export const linkLive = (l: Pick<TrustLink, "revoked_at" | "expires_at">, now = Date.now()) => !l.revoked_at && (!l.expires_at || Date.parse(l.expires_at) > now);

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message || fn), { code: (error as { code?: string }).code });
  return data as T;
}

/** days 0: no end date. password: optional, 6 to 72 characters, kept only as a bcrypt hash. */
export const trustCreate = (ws: string, store: string, label: string, show: TrustShow, days: number, snapshot: TrustSnapshot, password?: string) =>
  call<{ id: string; prefix: string; token: string; expires_at: string | null }>("trust_link_create", { ws, p_store: store, p_label: label, p_show: show, p_days: days, p_snapshot: snapshot, p_password: password || null });
/** Set or change a page's password; empty takes it off. */
export const trustPassword = (id: string, password: string) => call<boolean>("trust_link_password", { p_id: id, p_password: password || null });
/** A new workspace that came through a status page's footer link (first touch, 90 days). */
export const trustSignupClaim = (ws: string, ref: string, touchedAt: string) => call<boolean>("trust_signup_claim", { ws, p_ref: ref, p_touched_at: touchedAt });
export const trustList = (ws: string) => call<TrustLink[]>("trust_link_list", { ws });
export const trustUpdate = (id: string, show: TrustShow, label?: string) => call<boolean>("trust_link_update", { p_id: id, p_show: show, p_label: label ?? null });
export const trustRevoke = (id: string) => call<boolean>("trust_link_revoke", { p_id: id });
export const trustRefresh = (ws: string, store: string, snapshot: TrustSnapshot) => call<number>("trust_refresh", { ws, p_store: store, p_snapshot: snapshot });
export const trustRequests = (ws: string) => call<TrustRequest[]>("trust_requests_for", { ws });
export const trustRequestClose = (id: string, status: "sent" | "declined") => call<boolean>("trust_request_close", { p_id: id, p_status: status });
/** The public page: anyone with the link, no sign-in. */
export const trustPage = (token: string, password?: string) => call<TrustPage>("trust_page", { p_token: token, p_password: password || null });
export const trustAsk = (token: string, r: { name: string; email: string; org: string; note: string }, password?: string) =>
  call<{ status: "ok" | "gone" | "locked" }>("trust_request", { p_token: token, p_name: r.name, p_email: r.email, p_org: r.org, p_note: r.note, p_password: password || null });
