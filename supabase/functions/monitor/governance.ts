// The weekly governance summary for the Placetta team: on Mondays the monitor reads the last 7 days of agent health
// (agent_health_data in the database), claims the week once (governance_reports), emails every staff address and
// posts the same summary as an Update in the team's own workspaces. Pure text building here, so it can be tested.

export type Health = {
  days?: number;
  totals?: {
    runs?: number; done?: number; failed?: number; tool_calls?: number; tool_error_pct?: number | null; first_try_pct?: number | null; checked?: number | null;
    reply_p50_s?: number | null; reply_p95_s?: number | null; done_p50_s?: number | null; done_p95_s?: number | null;
    ai_cost_usd?: number | null; cost_per_run_usd?: number | null; saver_pct?: number | null; throttles?: number | null;
  };
  by_vendor?: { provider: string; model: string; calls: number; cost_usd: number }[];
  slowest?: { id: string; business?: string | null; title?: string | null; done_s?: number | null; cost_usd?: number | null }[];
  costliest?: { id: string; business?: string | null; title?: string | null; done_s?: number | null; cost_usd?: number | null }[];
};
type Bi = { en: string; zh: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const usd = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;
const pct = (n: number | null | undefined) => (n == null ? "not measured yet" : `${n}%`);
const pctZh = (n: number | null | undefined) => (n == null ? "尚未统计" : `${n}%`);
/** Seconds as people say them: 3.2s, 41s, 3m 10s. */
export function dur(s: number | null | undefined): string {
  if (s == null) return "-";
  if (s < 10) return `${Number(s).toFixed(1)}s`;
  if (s < 90) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return r ? `${m}m ${r}s` : `${m}m`;
}

/** The week's summary as an email and as an Update, in English and Chinese. */
export function governanceText(h: Health, week: string, app = "") {
  const t = h.totals ?? {};
  const runs = t.runs ?? 0, done = t.done ?? 0;
  const donePct = runs ? Math.round((100 * done) / runs) : 0;
  const top = (h.by_vendor ?? []).slice(0, 3).map((v) => `${v.provider} ${v.model} ${usd(v.cost_usd)} (${v.calls} calls)`).join(", ");
  const slow = (h.slowest ?? [])[0], dear = (h.costliest ?? [])[0];
  const lines = [
    `Runs: ${runs} (${donePct}% done, ${t.failed ?? 0} failed)`,
    `First-try pass rate: ${pct(t.first_try_pct)}${t.checked ? ` of ${t.checked} jobs checked` : ""}`,
    `Tool errors: ${pct(t.tool_error_pct)} of ${t.tool_calls ?? 0} tool calls`,
    `Time to first reply: median ${dur(t.reply_p50_s)}, 95th percentile ${dur(t.reply_p95_s)}`,
    `Time to done: median ${dur(t.done_p50_s)}, 95th percentile ${dur(t.done_p95_s)}`,
    `AI cost: ${usd(t.ai_cost_usd)} (${t.cost_per_run_usd == null ? "-" : usd(t.cost_per_run_usd)} a run)${top ? `. Most: ${top}` : ""}`,
    `Saver mode: ${pct(t.saver_pct)} of calls. Throttles: ${t.throttles ?? 0}`,
    ...(slow ? [`Slowest run: ${slow.business ?? "?"}, ${slow.title ?? ""} (${dur(slow.done_s)})`] : []),
    ...(dear ? [`Most expensive run: ${dear.business ?? "?"}, ${dear.title ?? ""} (${usd(dear.cost_usd)})`] : []),
  ];
  const linesZh = [
    `运行：${runs} 次（${donePct}% 完成，${t.failed ?? 0} 次失败）`,
    `首次通过率：${pctZh(t.first_try_pct)}`,
    `工具出错：${pctZh(t.tool_error_pct)}（共 ${t.tool_calls ?? 0} 次调用）`,
    `首次回复用时：中位数 ${dur(t.reply_p50_s)}，95 分位 ${dur(t.reply_p95_s)}`,
    `完成用时：中位数 ${dur(t.done_p50_s)}，95 分位 ${dur(t.done_p95_s)}`,
    `AI 成本：${usd(t.ai_cost_usd)}（每次运行 ${t.cost_per_run_usd == null ? "-" : usd(t.cost_per_run_usd)}）`,
    `节省模式：${pctZh(t.saver_pct)} 的调用；限流 ${t.throttles ?? 0} 次`,
  ];
  const link = app ? `${app}/app/queue` : "";
  const subject = `Agent health, week of ${week}: ${runs} runs, first try ${pct(t.first_try_pct)}, ${usd(t.ai_cost_usd)} AI`;
  const text = `${subject}\n\n${lines.join("\n")}\n\n${linesZh.join("\n")}${link ? `\n\nAgent health: ${link}` : ""}\n`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0E1116">
<p style="font-size:13px;color:#5B6470;margin:0 0 6px">Placetta team</p>
<h1 style="font-size:19px;margin:0 0 14px">Agent health, week of ${esc(week)}</h1>
<ul style="padding-left:18px;font-size:14px;line-height:1.55">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<ul style="padding-left:18px;font-size:14px;line-height:1.55">${linesZh.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
${link ? `<p><a href="${esc(link)}">Open Agent health</a></p>` : ""}</div>`;
  const title: Bi = { en: `Agent health, week of ${week}`, zh: `Agent 健康周报（${week} 这周）` };
  const body: Bi = { en: lines.slice(0, 7).join(". ") + ".", zh: linesZh.join("。") + "。" };
  return { subject, text, html, title, body };
}

type Admin = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  from(t: string): { select(c: string): PromiseLike<{ data: unknown; error: unknown }> };
};
type Send = (to: string[], subject: string, text: string, html: string) => Promise<boolean>;

/** Monday's run: once a week, the summary to every staff address (when email is set up) and as an Update. */
export async function weeklyGovernance(admin: Admin, week: string, send: Send | null, app = ""): Promise<{ sent: boolean; emailed: number; updates: number }> {
  const { data: h, error } = await admin.rpc("agent_health_data", { p_days: 7 });
  if (error || !h) { console.error("agent_health_data", error?.code ?? ""); return { sent: false, emailed: 0, updates: 0 }; }
  const { data: claimed } = await admin.rpc("governance_claim", { p_week: week, p_summary: h });
  if (claimed !== true) return { sent: false, emailed: 0, updates: 0 };   // already sent this week
  const m = governanceText(h as Health, week, app);
  let emailed = 0;
  if (send) {
    const { data: staff } = await admin.from("staff_emails").select("email");
    const to = ((staff ?? []) as { email: string }[]).map((s) => s.email).filter(Boolean);
    if (to.length && (await send(to, m.subject, m.text, m.html))) emailed = to.length;
  }
  const { data: n } = await admin.rpc("governance_post", { p_week: week, p_title: m.title, p_body: m.body, p_emailed: emailed });
  return { sent: true, emailed, updates: Number(n) || 0 };
}
