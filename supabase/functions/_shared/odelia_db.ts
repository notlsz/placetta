// Odelia by text and phone: the database side shared by odelia-sms, odelia-voice and agent-run. Every function here
// runs with the service role, so callers have already decided who the person is.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { BLOCKED_BY_STOP, type Channel, type Env, type Lang, sendSms } from "./odelia.ts";

export type Link = {
  user_id: string; number: string; verified_at: string | null; texts_on: boolean; calls_on: boolean; quiet_start: string; quiet_end: string;
  tz: string; lang: Lang; last_workspace_id: string | null; opted_out_at: string | null;
};
export const LINK_COLS = "user_id, number, verified_at, texts_on, calls_on, quiet_start, quiet_end, tz, lang, last_workspace_id, opted_out_at";

/** The person who verified this number, or null. */
export async function linkByNumber(admin: SupabaseClient, number: string): Promise<Link | null> {
  const { data } = await admin.from("phone_links").select(LINK_COLS).eq("number", number).not("verified_at", "is", null).maybeSingle();
  return (data as Link | null) ?? null;
}
export async function linkOf(admin: SupabaseClient, userId: string): Promise<Link | null> {
  const { data } = await admin.from("phone_links").select(LINK_COLS).eq("user_id", userId).maybeSingle();
  return (data as Link | null) ?? null;
}

export type Kind = "chat" | "ack" | "reply" | "code" | "update" | "urgent" | "system" | "call" | "missed";
/** Log one text or call. Returns the row's id, or null when it's already logged (Telnyx retried a webhook) or failed. */
export async function logMessage(admin: SupabaseClient, row: { user_id: string | null; workspace_id?: string | null; direction: "in" | "out"; channel: Channel; kind: Kind; body: string; provider_id?: string | null; run_id?: string | null }): Promise<number | null> {
  const { data, error } = await admin.from("odelia_messages").insert({ ...row, body: row.body.slice(0, 2000), workspace_id: row.workspace_id ?? null, provider_id: row.provider_id ?? null, run_id: row.run_id ?? null }).select("id").maybeSingle();
  if (error && error.code !== "23505") console.error("odelia log", error.code);
  return error ? null : (data?.id as number | undefined) ?? null;
}

/**
 * Text someone on their verified number, one message per segment, each logged. Never to a number that texted STOP;
 * if Telnyx says it's blocked (40300), that's recorded so nothing else is tried.
 */
export async function textUser(admin: SupabaseClient, env: Env, o: { link: Link; workspace_id?: string | null; segments: string[]; kind: Kind; run_id?: string | null; logBody?: string }): Promise<{ ok: boolean; sent: number; code?: string }> {
  if (o.link.opted_out_at) return { ok: false, sent: 0, code: "opted_out" };
  let sent = 0;
  for (const text of o.segments) {
    const r = await sendSms(env, o.link.number, text);
    if (!r.ok) {
      console.error("odelia text", r.status, r.code, r.detail);
      if (r.code === BLOCKED_BY_STOP) await admin.from("phone_links").update({ opted_out_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", o.link.user_id);
      return { ok: false, sent, code: r.code };
    }
    sent++;
    await logMessage(admin, { user_id: o.link.user_id, workspace_id: o.workspace_id, direction: "out", channel: "sms", kind: o.kind, body: o.logBody ?? text, provider_id: r.id, run_id: o.run_id });
  }
  return { ok: true, sent };
}

export type Ws = { id: string; name: string; role: string };
/** The workspaces this person is on, newest first. */
export async function workspacesOf(admin: SupabaseClient, userId: string): Promise<Ws[]> {
  const { data } = await admin.from("workspace_members").select("role, workspaces(id, name, created_at)").eq("user_id", userId);
  return ((data ?? []) as unknown as { role: string; workspaces: { id: string; name: string; created_at: string } | null }[])
    .filter((m) => m.workspaces).sort((a, b) => (b.workspaces!.created_at ?? "").localeCompare(a.workspaces!.created_at ?? ""))
    .map((m) => ({ id: m.workspaces!.id, name: String(m.workspaces!.name ?? ""), role: m.role }));
}

/** Which workspace a text or call is about: the one they used last by phone, else the one they last asked the agent in, else their newest. */
export async function currentWorkspace(admin: SupabaseClient, link: Link): Promise<{ ws: Ws | null; all: Ws[] }> {
  const all = await workspacesOf(admin, link.user_id);
  if (!all.length) return { ws: null, all };
  let ws = all.find((w) => w.id === link.last_workspace_id) ?? null;
  if (!ws && all.length > 1) {
    const { data } = await admin.from("agent_runs").select("workspace_id").eq("created_by", link.user_id).order("created_at", { ascending: false }).limit(1);
    ws = all.find((w) => w.id === data?.[0]?.workspace_id) ?? null;
  }
  return { ws: ws ?? all[0], all };
}

/** Whether this person may use the agent in this workspace right now: still a member (not staff by email alone), with a plan. */
export async function mayUseAgent(admin: SupabaseClient, ws: string, userId: string): Promise<"ok" | "not_member" | "no_plan"> {
  // A verified phone stands in for the second step, so two-step accounts aren't refused here; staff access never comes by phone.
  const { data: access, error } = await admin.rpc("access_for", { ws, uid: userId, p_aal: "aal2" });
  if (error || (access !== "owner" && access !== "member")) return "not_member";
  const { data: plan } = await admin.rpc("plan_of", { ws });
  return plan === "none" ? "no_plan" : "ok";
}
