// Stage alerts: the moment a filing reaches a new stage (Placetta starts filing it, it's submitted, the agency asks for
// something, approves it or returns it, or a step needs the person), the people in charge of it hear right away,
// instead of in the next morning's sweep.
//
// The database calls the monitor ({ action: "stage", filing_id }) from a trigger on filings (migration
// 20261024120000_stage_alerts). This writes the Update (the app shows it live), then reaches each person in charge the
// way they chose: a text when they asked for texts and linked a phone, else an email to their confirmed address unless
// they told Odelia not to email them, else the app only. Linked team chats (Slack, Lark, WeCom, Teams) get it too.
//
// Who is in charge of a filing: the workspace's owners, and the member who approved it.
//
// The Update's dedupe key is the one the morning sweep uses (filingUpdates in index.ts calls stageUpdates), so a stage
// already announced here is never announced again there, and the same stage twice in a day is announced once.
import { channelFor, type Channel, type Person } from "../_shared/notices.ts";

export type Bi = { en: string; zh: string };
export type StageFiling = {
  id: string; workspace_id: string; app_id: string; title: unknown; status: string; agent_state?: string | null; updated_at: string;
  confirmation_number?: string | null; note?: string | null; payment_url?: string | null; approved_by?: string | null; channel?: string | null;
};
export type StageUpdate = { workspace_id: string; kind: "filing"; app_id: string; title: Bi; body?: Bi; dedupe: string };

/** The stages that are announced. "requested" (the person just approved it) and "canceled" are their own doing. */
export const STAGES = ["in_progress", "submitted", "needs_info", "accepted", "rejected"] as const;

const bi = (v: unknown): Bi => (v && typeof v === "object" && "en" in v ? { en: String((v as Bi).en ?? ""), zh: String((v as Bi).zh ?? (v as Bi).en ?? "") } : { en: String(v ?? ""), zh: String(v ?? "") });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const BY: Record<string, Bi> = {
  email: { en: "by email", zh: "通过电子邮件" }, fax: { en: "by fax", zh: "通过传真" }, mail: { en: "by certified mail", zh: "通过挂号信" },
  portal: { en: "on the agency's site", zh: "在机构网站上" }, team: { en: "through Placetta's filing team", zh: "由快哉申报团队" },
};

/** What a filing's current stage says, as Updates: its status, and a step that needs the person. */
export function stageUpdates(f: StageFiling): StageUpdate[] {
  const out: StageUpdate[] = [], t = bi(f.title), d = String(f.updated_at ?? "").slice(0, 10);
  const by = f.channel ? BY[f.channel] : undefined;
  const said: Record<string, [Bi, Bi | undefined]> = {
    in_progress: [{ en: `Placetta is filing it: ${t.en}`, zh: `快哉正在申报：${t.zh}` }, by ? { en: `It goes to the agency ${by.en}.`, zh: `将${by.zh}提交至机构。` } : undefined],
    submitted: [{ en: `Submitted to the agency: ${t.en}`, zh: `已提交至机构：${t.zh}` }, f.confirmation_number ? { en: `Confirmation ${f.confirmation_number}.`, zh: `确认号 ${f.confirmation_number}。` } : undefined],
    accepted: [{ en: `Approved by the agency: ${t.en}`, zh: `机构已批准：${t.zh}` }, { en: "The approval is in Documents when the agency sends it.", zh: "机构发来批准文件后会放在“文件”中。" }],
    rejected: [{ en: `Returned by the agency: ${t.en}`, zh: `被机构退回：${t.zh}` }, f.note ? { en: f.note, zh: f.note } : { en: "The team will tell you what to fix.", zh: "团队会告诉您需要修改什么。" }],
    needs_info: [{ en: `Action needed: ${t.en}`, zh: `需要您处理：${t.zh}` }, f.payment_url ? { en: "The agency fee is ready to pay.", zh: "机构费用可以支付了。" } : f.note ? { en: f.note, zh: f.note } : undefined],
  };
  const s = said[f.status];
  if (s) out.push({ workspace_id: f.workspace_id, kind: "filing", app_id: f.app_id, dedupe: `filing:${f.id}:${f.status}:${d}`, title: s[0], ...(s[1] ? { body: s[1] } : {}) });
  if (f.agent_state === "needs_you") {
    out.push({ workspace_id: f.workspace_id, kind: "filing", app_id: f.app_id, dedupe: `needs_you:${f.id}:${d}`,
      title: { en: `Placetta needs you for a step: ${t.en}`, zh: `需要您完成一步：${t.zh}` },
      body: { en: "Open the filing to finish it. Placetta carries on right after.", zh: "打开该申请完成这一步，快哉随后继续办理。" } });
  }
  return out;
}

/** The people in charge of a filing: the owners, then the member who approved it, each once. */
export function stageRecipients(members: { user_id: string; role: string }[], approvedBy?: string | null): string[] {
  const ids = members.filter((m) => m.role === "owner").map((m) => m.user_id);
  if (approvedBy && members.some((m) => m.user_id === approvedBy)) ids.push(approvedBy);
  return [...new Set(ids)];
}

/** The email for one stage, English then Chinese, with the button into the workspace. */
export function stageEmail(u: StageUpdate, business: string, link: string) {
  const subject = `${u.title.en}${business ? ` (${business})` : ""}`.slice(0, 180);
  const text = `${u.title.en}${u.body ? `\n${u.body.en}` : ""}\n\n${u.title.zh}${u.body ? `\n${u.body.zh}` : ""}${link ? `\n\nOpen Placetta: ${link}` : ""}\n\nYou're getting this because you're in charge of this filing in Placetta. 您负责此项申请，因此收到这封邮件。\n`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 22px;color:#0E1116">
<p style="font-size:13px;color:#5B6470;margin:0 0 6px">Placetta${business ? `, ${esc(business)}` : ""}</p>
<h1 style="font-size:19px;margin:0 0 10px">${esc(u.title.en)}</h1>
${u.body ? `<p style="font-size:14px;line-height:1.5;margin:0 0 16px;color:#5B6470">${esc(u.body.en)}</p>` : ""}
<p style="font-size:14px;margin:0 0 4px">${esc(u.title.zh)}</p>
${u.body ? `<p style="font-size:14px;line-height:1.5;margin:0;color:#5B6470">${esc(u.body.zh)}</p>` : ""}
${link ? `<p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#0E1116;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">Open Placetta</a></p>` : ""}
<p style="font-size:12px;color:#98A0AB;margin:22px 0 0">You're getting this because you're in charge of this filing in Placetta. 您负责此项申请，因此收到这封邮件。</p></div>`;
  return { subject, text, html };
}

/** The text for one stage, in the phone's language. */
export function stageText(u: StageUpdate, business: string, lang: "en" | "zh") {
  const t = u.title[lang] || u.title.en, b = u.body ? (u.body[lang] || u.body.en) : "";
  return (lang === "zh" ? `快哉：${t}（${business}）。${b}` : `Placetta: ${t} (${business}). ${b}`).trim().slice(0, 300);
}

export type StageDb = {
  filing(id: string): Promise<StageFiling | null>;
  workspace(id: string): Promise<{ name: string; state: unknown } | null>;
  members(ws: string): Promise<{ user_id: string; role: string }[]>;
  person(uid: string): Promise<Person>;
  /** Saves the Update; true when it's new (false when this stage was already announced). */
  save(u: StageUpdate): Promise<boolean>;
};
export type StageOut = {
  mail(to: string, subject: string, text: string, html: string): Promise<boolean>;
  text(row: { user_id: string; workspace_id: string; body: string; link: string | null; dedupe: string }): Promise<boolean>;
  chats(ws: string, business: string, items: StageUpdate[]): Promise<number>;
  /** Sends queued texts now rather than at the next sweep (quiet hours still apply). */
  flush(): Promise<void>;
};
export type StageResult = { filing: string; updates: number; emailed: number; texted: number; app_only: number; chats: number; skipped?: string };

export async function stageAlert(db: StageDb, out: StageOut, o: { app: string; filingId: string }): Promise<StageResult> {
  const r: StageResult = { filing: o.filingId, updates: 0, emailed: 0, texted: 0, app_only: 0, chats: 0 };
  const f = await db.filing(o.filingId);
  if (!f) return { ...r, skipped: "no such filing" };
  const ws = await db.workspace(f.workspace_id);
  if (!ws) return { ...r, skipped: "no workspace" };
  const fresh: StageUpdate[] = [];
  for (const u of stageUpdates(f)) if (await db.save(u)) fresh.push(u);
  r.updates = fresh.length;
  if (!fresh.length) return { ...r, skipped: f.status === "requested" || f.status === "canceled" ? "not a stage that's announced" : "already announced" };
  const link = o.app ? `${o.app}/app/?ws=${encodeURIComponent(f.workspace_id)}` : "";
  const people = stageRecipients(await db.members(f.workspace_id), f.approved_by);
  let texts = 0;
  for (const uid of people) {
    const p = await db.person(uid);
    const how: Channel = channelFor(ws.state, uid, p);
    for (const u of fresh) {
      if (how === "text") {
        const lang = p.phone?.lang === "zh" ? "zh" : "en";
        if (await out.text({ user_id: uid, workspace_id: f.workspace_id, body: stageText(u, ws.name, lang), link: link || null, dedupe: `stage:${u.dedupe}`.slice(0, 300) })) { r.texted++; texts++; }
      } else if (how === "email" && p.email) {
        const m = stageEmail(u, ws.name, link);
        if (await out.mail(p.email, m.subject, m.text, m.html)) r.emailed++;
      } else r.app_only++;
    }
  }
  r.chats = await out.chats(f.workspace_id, ws.name, fresh);
  if (texts) await out.flush();
  return r;
}
