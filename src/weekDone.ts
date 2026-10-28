import { B, type Bi } from "./bi.ts";

/* ------------------------------------------------------------------ *
 * What Odelia did for you this week: one summary, from records only.
 * The value report's weekly line (src/ValueReport.tsx) and the monitor's
 * Monday update (supabase/functions/monitor) both read it, so the app and
 * the email say the same. Each count is something on file: a filing the
 * agency received this week (and how many went under Autopilot), an
 * agency's approval, a routine email she sent on her own, a document
 * she asked someone for, a date she put on Deadlines, and what still
 * waits on the owner. Nothing estimated, no hours saved.
 * Dependency-free so the monitor (Deno) imports it as it is.
 * ------------------------------------------------------------------ */

export type WeekAudit = { at: string; actor: string; action: Bi; object: Bi };
export type WeekFiling = { title: Bi; status: string; submitted_at?: string | null; decided_at?: string | null };
export type WeekInput = { audit: WeekAudit[]; filings: WeekFiling[]; waiting: number; until: string; /** documents Odelia asked people for this week (odelia_chases), when known */ chased?: number };
export type WeekDone = {
  from: string; until: string;
  filed: Bi[]; autopilot: number; approved: Bi[]; sentOnOwn: number; asked: number; dates: number; actions: number; waiting: number;
  empty: boolean;
};

const inWeek = (at: string | null | undefined, from: number, until: number) => { const t = Date.parse(at ?? ""); return Number.isFinite(t) && t > from && t <= until; };

export function weekDone(x: WeekInput): WeekDone {
  const until = Date.parse(x.until), from = until - 7 * 864e5;
  const audit = (x.audit ?? []).filter(a => a && inWeek(a.at, from, until));
  const mine = audit.filter(a => a.actor === "agent");
  const said = (re: RegExp) => mine.filter(a => re.test(a.action?.en ?? "")).length;
  const filed = (x.filings ?? []).filter(f => f.status !== "canceled" && inWeek(f.submitted_at, from, until)).map(f => f.title);
  const approved = (x.filings ?? []).filter(f => f.status === "accepted" && inWeek(f.decided_at, from, until)).map(f => f.title);
  const out: WeekDone = {
    from: new Date(from).toISOString().slice(0, 10), until: x.until.slice(0, 10),
    filed, approved,
    autopilot: said(/^Filed for you under Autopilot$/),
    sentOnOwn: said(/^Sending on its own/),
    asked: Math.max(0, x.chased ?? 0),
    dates: said(/^Added (a )?deadline|^Added a renewal|^Added to your calendar/),
    actions: mine.length,
    waiting: Math.max(0, x.waiting | 0),
    empty: false,
  };
  out.empty = !out.filed.length && !out.approved.length && !out.actions;
  return out;
}

/** The summary in a few lines, in both languages. */
export function weekLines(d: WeekDone): Bi[] {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const lines: Bi[] = [];
  if (d.filed.length) lines.push(B(`${n(d.filed.length, "filing", "filings")} reached the agency${d.autopilot ? `, ${d.autopilot} of them filed for you under Autopilot` : ""}: ${d.filed.map(f => f.en).join(", ")}`,
    `${d.filed.length} 项申报已送达机构${d.autopilot ? `，其中 ${d.autopilot} 项由自动驾驶为您提交` : ""}：${d.filed.map(f => f.zh).join("、")}`));
  else if (d.autopilot) lines.push(B(`${n(d.autopilot, "filing", "filings")} filed for you under Autopilot, on the way to the agency`, `自动驾驶为您提交了 ${d.autopilot} 项申报，正在送往机构`));
  if (d.approved.length) lines.push(B(`The agency approved ${d.approved.map(f => f.en).join(", ")}`, `机构已批准：${d.approved.map(f => f.zh).join("、")}`));
  if (d.sentOnOwn) lines.push(B(`${n(d.sentOnOwn, "routine email", "routine emails")} sent on her own to people you told her about`, `她自行向您告诉过她的人发送了 ${d.sentOnOwn} 封例行邮件`));
  if (d.asked) lines.push(B(`${n(d.asked, "document", "documents")} asked for and followed up`, `索取并跟进了 ${d.asked} 份文件`));
  if (d.dates) lines.push(B(`${n(d.dates, "date", "dates")} put on Deadlines`, `在截止日期中添加了 ${d.dates} 个日期`));
  lines.push(B(`${n(d.actions, "step", "steps")} in all, each in Activity`, `共 ${d.actions} 步，每一步都在活动记录中`));
  lines.push(d.waiting ? B(`${n(d.waiting, "thing waits", "things wait")} on you`, `${d.waiting} 项在等您处理`) : B("Nothing waits on you", "没有需要您处理的事项"));
  return lines;
}

/** The Monday update: null when there's nothing to say. */
export function weekDoneUpdate(ws: string, d: WeekDone): { workspace_id: string; kind: "agent"; title: Bi; body: Bi; dedupe: string } | null {
  if (d.empty) return null;
  const lines = weekLines(d);
  return { workspace_id: ws, kind: "agent", dedupe: `weekdone:${d.until}`,
    title: B(`What Odelia did for you this week${d.filed.length ? `: ${d.filed.length} filed` : ""}`, `本周 Odelia 为您完成的工作${d.filed.length ? `：已提交 ${d.filed.length} 项` : ""}`),
    body: B(lines.map(l => l.en).join(". ") + ".", lines.map(l => l.zh).join("。") + "。") };
}
