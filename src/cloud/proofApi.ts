import { supabase, type DocRow } from "./api";
import type { IssueStat } from "../risk";
import type { Bi } from "../bi";

/* ------------------------------------------------------------------ *
 * Rejection risk's learned numbers and proof pages (src/risk.ts, src/Proof.tsx,
 * supabase/migrations/20261106090000_risk_and_proof.sql). The rules live in the database: only an owner shares or
 * revokes proof, a link lasts 30 days at most, the token is kept only as its SHA-256, and a proof link never shares a
 * document the business uploaded.
 * ------------------------------------------------------------------ */

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message || fn), { code: (error as { code?: string }).code });
  return data as T;
}

/** Per issue, over Placetta's decided filings of one form: how many had it and how many came back (3 or more only). */
export async function riskIssueStats(form: string): Promise<IssueStat[]> {
  try { return (await call<IssueStat[]>("risk_issue_stats", { p_form: form })) ?? []; } catch { return []; }
}

/** The documents kept with a filing: the filled form, receipts, the screenshots of the agency's pages, the agency's letters. */
export async function filingDocs(filing: string): Promise<DocRow[]> {
  const { data, error } = await supabase().from("documents").select("*").eq("filing_id", filing).order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as DocRow[];
}
/** A member's short-lived address for one of the workspace's own files. */
export async function signedDoc(path: string): Promise<string | null> {
  const { data, error } = await supabase().storage.from("documents").createSignedUrl(path, 300);
  return error ? null : data?.signedUrl ?? null;
}

export type ProofLink = { id: string; filing_id: string; label: string; prefix: string; docs: boolean; created_at: string; expires_at: string; revoked_at: string | null; views: number; last_viewed_at: string | null };
export const proofCreate = (ws: string, filing: string, days: number, docs: boolean, label?: string) =>
  call<{ id: string; prefix: string; token: string; expires_at: string }>("proof_link_create", { ws, p_filing: filing, p_days: days, p_docs: docs, p_label: label ?? null });
export const proofList = (ws: string) => call<ProofLink[]>("proof_link_list", { ws });
export const proofRevoke = (id: string) => call<boolean>("proof_link_revoke", { p_id: id });
/** Whether a link still opens: not revoked and not past its end. */
export const proofLive = (l: Pick<ProofLink, "revoked_at" | "expires_at">, now = Date.now()) => !l.revoked_at && Date.parse(l.expires_at) > now;

export type PublicProof = { status: "gone" } | {
  status: "ok"; business: string; title: Bi; agency: Bi | null; channel: string | null; filing_status: string;
  approved_at: string | null; submitted_at: string | null; decided_at: string | null; confirmation: string | null; license_expires: string | null;
  events: { at: string; status: string | null; title: Bi; source: string; url: string | null }[];
  docs: { id: string; name: string; source: string; at: string }[]; expires_at: string;
};
/** The public proof page, for anyone with the link. */
export const proofPage = (token: string) => call<PublicProof>("proof_page", { p_token: token });
