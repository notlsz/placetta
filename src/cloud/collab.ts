import { supabase, type ApiError } from "./api";
import type { Assignment, Comment, ItemRef, Mention, Notice } from "../collab";
import type { HqReviewRow } from "../review";

/* Team review in an account (migration 20261018120000_team_review): comments, assignments, mention notices and
   headquarters' review table. The database decides who sees and writes what; these only ask. Before the migration is
   applied (or in the preview's stand-in backend) the reads come back empty, so nothing breaks. */

const gone = (e: { code?: string } | null) => !!e && ["PGRST202", "PGRST205", "42883", "42P01", "404"].includes(String(e.code));
const fail = (e: { message?: string; code?: string } | null): ApiError => ({ code: e?.code ?? "db_error", message: (e?.message ?? "Something went wrong.").replace(/^.*?:\s/, "") });

type CommentRow = { id: string; item_kind: ItemRef["kind"]; item_id: string; author_id: string | null; author_email: string; from_hq: boolean; shared_hq: boolean; body: string;
  mentions: Mention[] | null; asked_odelia: boolean; created_at: string; resolved_at: string | null; resolved_by: string | null };
const COMMENT_COLS = "id, item_kind, item_id, author_id, author_email, from_hq, shared_hq, body, mentions, asked_odelia, created_at, resolved_at, resolved_by";
const toComment = (r: CommentRow): Comment => ({
  id: r.id, item: { kind: r.item_kind, id: r.item_id }, author: { id: r.author_id, email: r.author_email ?? "", hq: !!r.from_hq }, body: r.body,
  mentions: Array.isArray(r.mentions) ? r.mentions : [], shared: !!r.shared_hq, askedOdelia: !!r.asked_odelia, at: r.created_at, resolvedAt: r.resolved_at, resolvedBy: r.resolved_by,
});

/** Every comment in the workspace (members only), oldest first. */
export async function listComments(ws: string): Promise<Comment[]> {
  const { data, error } = await supabase().from("comments").select(COMMENT_COLS).eq("workspace_id", ws).order("created_at", { ascending: true }).limit(2000);
  if (error) { if (gone(error)) return []; throw fail(error); }
  return ((data ?? []) as CommentRow[]).map(toComment);
}
/** Post a comment. odelia: an owner or member @mentioned her on a permit, so the app starts her on it. */
export async function postComment(ws: string, item: ItemRef, body: string, mentions: Mention[], share: boolean): Promise<{ comment: Comment; odelia: boolean }> {
  const { data, error } = await supabase().rpc("comment_post", { ws, p_kind: item.kind, p_item: item.id, p_body: body, p_mentions: mentions, p_share: share });
  if (error) throw fail(error);
  const row = data as CommentRow & { odelia?: boolean };
  return { comment: toComment(row), odelia: !!row.odelia };
}
export async function resolveComment(id: string, on: boolean): Promise<Comment> {
  const { data, error } = await supabase().rpc("comment_resolve", { p_id: id, p_resolved: on });
  if (error) throw fail(error);
  return toComment(data as CommentRow);
}

export async function listAssignments(ws: string): Promise<Assignment[]> {
  const { data, error } = await supabase().from("assignments").select("item_kind, item_id, assignee, assigned_by, assigned_at").eq("workspace_id", ws);
  if (error) { if (gone(error)) return []; throw fail(error); }
  return ((data ?? []) as { item_kind: "app" | "job"; item_id: string; assignee: string; assigned_by: string | null; assigned_at: string }[])
    .map(r => ({ item: { kind: r.item_kind, id: r.item_id }, assignee: r.assignee, by: r.assigned_by, at: r.assigned_at }));
}
/** Assign an application or job to someone on the workspace; null unassigns. */
export async function assign(ws: string, item: ItemRef, user: string | null): Promise<void> {
  const { error } = await supabase().rpc("assign_item", { ws, p_kind: item.kind, p_item: item.id, p_user: user });
  if (error) throw fail(error);
}

type NoticeRow = { id: string; workspace_id: string; kind: Notice["kind"]; title: Notice["title"]; body: Notice["body"]; item_kind: ItemRef["kind"] | null; item_id: string | null; remind_on: string | null; created_at: string; read_at: string | null };
const toNotice = (r: NoticeRow): Notice => ({ id: r.id, workspaceId: r.workspace_id, kind: r.kind, title: r.title, body: r.body, item: r.item_kind && r.item_id ? { kind: r.item_kind, id: r.item_id } : null,
  at: r.remind_on ? r.remind_on + "T09:00:00" : r.created_at, read: !!r.read_at, remindOn: r.remind_on });
/** This person's notices: in a workspace (ws), or as headquarters (no ws: the ones to their email). Newest first. */
export async function listNotices(ws?: string): Promise<Notice[]> {
  let q = supabase().from("mention_notices").select("id, workspace_id, kind, title, body, item_kind, item_id, remind_on, created_at, read_at").order("created_at", { ascending: false }).limit(200);
  q = ws ? q.eq("workspace_id", ws).not("user_id", "is", null) : q.is("user_id", null);
  const { data, error } = await q;
  if (error) { if (gone(error)) return []; throw fail(error); }
  return ((data ?? []) as NoticeRow[]).map(toNotice);
}
export async function readNotices(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase().rpc("notices_read", { p_ids: ids });
  if (error && !gone(error)) throw fail(error);
}
/** Send the notices this person just made, now, by each recipient's channel (the team function). Best effort: the
 *  morning monitor sends anything left. */
export function notify(): void {
  void supabase().functions.invoke("team", { body: { action: "notify" } }).catch(() => undefined);
}

/* ---------------------------- headquarters ---------------------------- */

/** Every franchisee shared with this email, per store and permit. [] before the migration. */
export async function hqReview(): Promise<HqReviewRow[]> {
  const { data, error } = await supabase().rpc("hq_review");
  if (error) { if (gone(error)) return []; throw fail(error); }
  return ((data ?? []) as HqReviewRow[]).map(r => ({ ...r, stores: Array.isArray(r.stores) ? r.stores : [] }));
}
/** The thread on one permit shared with headquarters: who on the franchisee's team wrote it stays with them. */
export async function hqComments(ws: string, app: string | null): Promise<Comment[]> {
  const { data, error } = await supabase().rpc("hq_comments", { ws, p_app: app });
  if (error) { if (gone(error)) return []; throw fail(error); }
  return ((data ?? []) as { id: string; item_id: string; body: string; from_hq: boolean; author: string | null; mentions_hq: boolean; created_at: string; resolved_at: string | null }[])
    .map(r => ({ id: r.id, item: { kind: "app" as const, id: r.item_id }, author: { id: null, email: r.author ?? "", hq: r.from_hq }, body: r.body,
      mentions: [], shared: true, askedOdelia: false, at: r.created_at, resolvedAt: r.resolved_at }));
}
/** Headquarters asks about several permits at once: one shared comment on each, one notice per owner. */
export async function hqAsk(items: { workspace_id: string; app_id: string }[], body: string): Promise<number> {
  const { data, error } = await supabase().rpc("hq_ask", { p_items: items, p_body: body });
  if (error) throw fail(error);
  return Number(data ?? 0);
}
/** Headquarters reminds itself about permits on a day. */
export async function hqRemind(ws: string, apps: string[], on: string, note?: string): Promise<number> {
  const { data, error } = await supabase().rpc("hq_remind", { ws, p_items: apps, p_on: on, p_note: note ?? null });
  if (error) throw fail(error);
  return Number(data ?? 0);
}
