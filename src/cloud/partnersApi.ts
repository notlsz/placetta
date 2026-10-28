import { supabase, type ApiError } from "./api";

/* ------------------------------------------------------------------ *
 * Partners: the people who bring brands to US storefronts (brokers and
 * landlords, franchisors, accountants and bookkeepers, chambers of commerce
 * and market-entry consultancies, investors). The database rules are in
 * supabase/migrations/20261017210100_partners.sql and
 * 20261105091300_trust_partners.sql; partners read their
 * consenting referrals straight from workspace_referrals, where row-level
 * security shows them only those rows and only the shared columns.
 * ------------------------------------------------------------------ */

/** Where the Partner API answers (supabase/functions/partner-api; docs/PARTNER_API.md). */
export const PARTNER_API = `${((import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://esquxzcfsylffuijvzec.supabase.co").replace(/\/+$/, "")}/functions/v1/partner-api`;

export type PartnerKind = "franchisor" | "master_franchisee" | "broker" | "landlord" | "investor" | "accountant" | "bookkeeper" | "chamber" | "consultancy" | "other";
export type PartnerStatus = "pending" | "approved" | "declined" | "paused";
/** The commission that applies: the partner's own, else the default (15% of the plan, 10% of license fees), for `months`. */
export type PartnerTerms = { plan_pct: number; fee_pct: number; months: number; plan_default?: boolean; fee_default?: boolean };
export const DEFAULT_TERMS: PartnerTerms = { plan_pct: 15, fee_pct: 10, months: 12, plan_default: true, fee_default: true };
export type PartnerMe = {
  id: string; org_name: string; kind: PartnerKind; contact_name: string | null; website: string | null; status: PartnerStatus;
  code: string | null; share_pct: number | null; share_months: number; created_at: string; approved_at: string | null; terms?: PartnerTerms;
};
/** share_usd: the plan side; fee_usd: the license-fee side; total_usd: both. */
export type PartnerMonth = { month: string; paying: number; share_usd: number; fee_usd?: number; total_usd?: number; closed: boolean };
/** One referred store, as a consenting business shares it: no address, no documents, no people. */
export type ReferralStore = {
  id: string; name: { en: string; zh: string }; stage: "open" | "opening"; status: "current" | "due" | "overdue"; licensed: boolean;
  current: number; due_30: number; overdue: number; pending: number; next: { kind: string; title: { en: string; zh: string }; date: string | null } | null;
};
export type PartnerDashboard = {
  partner: PartnerMe; referred: number; sharing: number; months: PartnerMonth[];
  earned_usd: number; paid_usd: number; owed_usd: number; payouts: { amount_usd: number; paid_on: string; reference: string | null }[];
};
/** One referred business that shares its progress: these fields, nothing else. */
export type ReferralLine = {
  id: string; attributed_at: string; business_name: string | null; stage: "opening" | "open" | null;
  permits_done: number | null; permits_total: number | null; opening_date: string | null; progress_at: string | null;
  /** each store's licensing status and what's due, when the business's consent covers it (consent_scope 2) */
  stores?: ReferralStore[] | null; consent_scope?: number;
};
export type ApiKeyRow = { id: string; label: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
/** A workspace's partner, as its members see it. */
/** scope 1: a consent from before the store view (name, stage, permits, opening date); 2: also each store's licensing status. */
export type ReferralInfo = { org_name: string; kind: PartnerKind; consent: boolean; consent_at: string | null; attributed_at: string; scope?: number } | null;
export type PartnerAdminRow = PartnerMe & { email: string | null; note: string | null; fee_pct?: number | null; referred: number; sharing: number; earned_usd: number; paid_usd: number };

const pg = (e: { message?: string; code?: string; hint?: string } | null): ApiError =>
  ({ code: e?.code ?? "db_error", message: (e?.message ?? "Something went wrong.").replace(/^.*?:\s/, "") });
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw pg(error);
  return data as T;
}

export const partnerMe = () => rpc<PartnerMe | null>("partner_me");
export const partnerApply = (f: { org: string; kind: PartnerKind; contact?: string; website?: string; note?: string }) =>
  rpc<PartnerMe>("partner_apply", { p_org: f.org, p_kind: f.kind, p_contact: f.contact ?? null, p_website: f.website ?? null, p_note: f.note ?? null });
export const partnerDashboard = () => rpc<PartnerDashboard | null>("partner_dashboard");
/** The consenting referrals, through row-level security: the table answers with nothing else. */
export async function partnerReferrals(): Promise<ReferralLine[]> {
  const { data, error } = await supabase().from("workspace_referrals")
    .select("id, attributed_at, business_name, stage, permits_done, permits_total, opening_date, progress_at, stores, consent_scope").order("attributed_at", { ascending: false });
  if (error) throw pg(error);
  return (data ?? []) as ReferralLine[];
}
export const partnerKeys = () => rpc<ApiKeyRow[]>("partner_keys");
export const partnerKeyCreate = (label: string) => rpc<{ id: string; prefix: string; key: string }>("partner_key_create", { p_label: label });
export const partnerKeyRevoke = (id: string) => rpc<null>("partner_key_revoke", { p_id: id });
export const partnerLookup = (code: string) => rpc<{ org_name: string; kind: PartnerKind } | null>("partner_lookup", { p_code: code });

export const referralClaim = (ws: string, code: string, touchedAt: string, consent: boolean) =>
  rpc<ReferralInfo>("referral_claim", { ws, p_code: code, p_touched_at: touchedAt, p_consent: consent });
export const referralFor = (ws: string) => rpc<ReferralInfo>("referral_for", { ws });
export const referralConsentSet = (ws: string, consent: boolean) => rpc<ReferralInfo>("referral_consent_set", { ws, p_consent: consent });

export const partnerAdminList = () => rpc<PartnerAdminRow[]>("partner_admin_list");
/** sharePct / feePct: null keeps what the partner has; -1 goes back to the default terms. */
export const partnerAdminSet = (id: string, status: PartnerStatus, sharePct?: number | null, shareMonths?: number | null, feePct?: number | null) =>
  rpc<{ id: string; status: PartnerStatus; code: string | null }>("partner_admin_set", { p_id: id, p_status: status, p_share_pct: sharePct ?? null, p_share_months: shareMonths ?? null, p_fee_pct: feePct ?? null });
/** The default commission, for the team. */
export const partnerTermsGet = () => rpc<{ plan_pct: number; fee_pct: number; updated_at: string }>("partner_terms_get");
export const partnerTermsSet = (planPct: number, feePct: number) => rpc<{ plan_pct: number; fee_pct: number; updated_at: string }>("partner_terms_set", { p_plan_pct: planPct, p_fee_pct: feePct });
export const partnerPayoutAdd = (partner: string, amount: number, paidOn: string, reference?: string, note?: string) =>
  rpc<string>("partner_payout_add", { p_partner: partner, p_amount: amount, p_paid_on: paidOn, p_reference: reference ?? null, p_note: note ?? null });
