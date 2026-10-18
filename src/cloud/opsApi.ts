import type { Bi } from "../model";
import { supabase, type ApiError } from "./api";

/* ------------------------------------------------------------------ *
 * Specialist reviews (supabase/migrations/20261017150200_specialist_reviews.sql),
 * Agent health, the incident log and the weekly governance summary
 * (20261017150300_agent_health.sql). The team's calls need two-step
 * sign-in; the database checks it on every one.
 * ------------------------------------------------------------------ */

export type ReviewRow = {
  app_id: string; kind: "two_key" | "requested"; status: "requested" | "done"; reviewer_name: string | null; reviewed_at: string | null;
  outcome: "looks_right" | "changes_needed" | null; comment: string | null; requested_at: string | null; due_at: string | null;
};
export type QueueReview = {
  id: string; workspace_id: string; business: string; app_id: string; title: Bi; note: string | null; requested_by: string | null;
  requested_at: string; due_at: string; status: "requested" | "done"; reviewer_name: string | null; reviewed_at: string | null;
  outcome: "looks_right" | "changes_needed" | null; comment: string | null;
};

export type HealthDay = {
  day: string; runs: number; done: number; failed: number; first_try_pct: number | null; checked: number; tool_calls: number; tool_error_pct: number | null;
  reply_p50_s: number | null; reply_p95_s: number | null; done_p50_s: number | null; done_p95_s: number | null;
  ai_cost_usd: number; cost_per_run_usd: number | null; saver_pct: number | null; throttles: number;
};
export type HealthRun = {
  id: string; business: string | null; kind: string; channel: string | null; status: string; title: string | null; created_at: string;
  reply_s: number | null; done_s: number | null; cost_usd: number; tool_calls: number | null; tool_errors: number | null;
};
export type Health = {
  days: number; since: string; by_day: HealthDay[];
  totals: Omit<HealthDay, "day" | "checked"> & { checked: number | null };
  by_vendor: { provider: string; model: string; calls: number; cost_usd: number }[];
  slowest: HealthRun[]; costliest: HealthRun[];
  measured_since: { first_reply: string | null; tools: string | null; saver: string | null };
};
export type RunReplay = {
  id: string; workspace_id: string; business: string | null; kind: string; channel: string | null; status: string; title: Bi | null; prompt: string;
  error: string | null; created_at: string; first_reply_at: string | null; done_at: string | null; tool_calls: number | null; tool_errors: number | null;
  steps: { state: string; label: Bi; tool?: string }[]; reply: Bi[] | null; cost_usd: number;
  calls: { at: string; kind: string; role: string | null; provider: string | null; model: string | null; cost_usd: number; saver: boolean | null }[];
  checks: { job_id: string; passed: number; of: number; at: string }[];
};
export type Incident = { id: string; happened_at: string; title: string; impact: string; fix: string | null; public: boolean; by: string | null; created_at: string };
export type GovernanceReport = { week: string; summary: Partial<Health>; emailed_to: number; updates: number };

const pg = (e: { message?: string; code?: string; hint?: string } | null): ApiError => {
  const m = e?.message ?? "Something went wrong.";
  if (m === "rate_limited") return { code: "rate_limited", message: e?.hint ?? "Too many requests today." };
  return { code: e?.code ?? "db_error", message: m.replace(/^.*?:\s/, "") };
};
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw pg(error);
  return data as T;
}

export const reviewsFor = (ws: string) => rpc<ReviewRow[]>("specialist_reviews_for", { ws });
export const requestReview = (ws: string, appId: string, title: Bi, note?: string) =>
  rpc<ReviewRow & { id: string }>("request_specialist_review", { ws, p_app_id: appId, p_title: title, p_note: note ?? null });
export const reviewQueue = () => rpc<QueueReview[]>("review_queue");
export const reviewFinish = (id: string, outcome: "looks_right" | "changes_needed", comment?: string) =>
  rpc<QueueReview>("review_finish", { p_id: id, p_outcome: outcome, p_comment: comment ?? null });

export const agentHealth = (days = 14) => rpc<Health>("agent_health", { p_days: days });
export const runReplay = (id: string) => rpc<RunReplay>("agent_run_replay", { p_id: id });
export const incidentsList = () => rpc<{ since: string | null; incidents: Incident[] }>("incidents_list");
export const incidentAdd = (i: { happened_at: string; title: string; impact: string; fix?: string; public: boolean }) =>
  rpc<string>("incident_add", { p_happened_at: i.happened_at, p_title: i.title, p_impact: i.impact, p_fix: i.fix ?? null, p_public: i.public });
export const incidentUpdate = (id: string, fix: string, isPublic: boolean) => rpc<null>("incident_update", { p_id: id, p_fix: fix, p_public: isPublic });
export const governanceReports = () => rpc<GovernanceReport[]>("governance_reports_list");
