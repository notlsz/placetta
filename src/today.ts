import { B, type Bi } from "./bi";
import { readyToFile } from "./core";
import { formById } from "./forms/registry";
import type { Approval, Workspace } from "./model";
import { preflight } from "./smart";

/* ------------------------------------------------------------------ *
 * Today's approvals, in one tap. Everything Odelia put up for the
 * owner is gathered once a day (the monitor's morning digest says how
 * many), and what passed every check goes together: the owner still
 * sees each one named, with its agency, its fee and what was checked,
 * and nothing goes out until they tap. What needs more than a glance
 * stays one at a time: a payment (the owner pays the agency themselves),
 * a signature to draw, a change to the business or a plan, anything the
 * second look flagged, and anything a business rule gave to two owners.
 * Approving is still the owner's: this only decides what can share a tap.
 * ------------------------------------------------------------------ */

export type Solo = { id: string; why: Bi };
export type OneTap = { ids: string[]; solo: Solo[] };

/** What can be approved together today, and why the rest can't. account: a signed-in workspace (a form signed in the
 *  card can't share a tap). filings: filing is open on this plan (a workspace without the monthly plan can still send
 *  its messages together). */
export function oneTap(w: Workspace, today: string, o: { account: boolean; filings: boolean }): OneTap {
  const ids: string[] = [], solo: Solo[] = [];
  const flagged = (a: Approval) => { const pf = preflight(w, a, today); return pf.errors.length > 0 || pf.warnings.length > 0; };
  for (const a of w.approvals) {
    if (a.second) { solo.push({ id: a.id, why: B("A business rule wants two owners to approve it", "业务规则要求两位所有者批准") }); continue; }
    if (a.kind === "pay") { solo.push({ id: a.id, why: B("A payment: you pay it yourself", "付款：由您本人支付") }); continue; }
    if (a.kind === "change") { solo.push({ id: a.id, why: a.change?.op === "plan" ? B("A plan to read before it starts", "开始前需要阅读的计划") : B("A change to review on its own", "需要单独查看的更改") }); continue; }
    if (a.kind === "upload") { solo.push({ id: a.id, why: B("Needs a document from you", "需要您提供文件") }); continue; }
    if (a.kind === "file") {
      const app = w.apps.find(x => x.id === a.app);
      if (!app || !readyToFile(app)) { solo.push({ id: a.id, why: B("Not complete yet", "尚未填写完整") }); continue; }
      if (!o.filings) { solo.push({ id: a.id, why: B("Filing needs the monthly plan", "提交申请需要月度方案") }); continue; }
      const off = app.official ? formById(app.official) : undefined;
      if (o.account && off?.sign && off.esign) { solo.push({ id: a.id, why: B("Needs your signature in the card", "需要在卡片中签名") }); continue; }
      if (flagged(a)) { solo.push({ id: a.id, why: B("Something to check first", "有需要先核对的地方") }); continue; }
      ids.push(a.id);
      continue;
    }
    if (a.kind === "send") {
      if (a.fee) { solo.push({ id: a.id, why: B("It carries a fee", "涉及费用") }); continue; }
      if (a.auto) continue;   // already going out under an Always allow rule
      if (flagged(a)) { solo.push({ id: a.id, why: B("Something to check first", "有需要先核对的地方") }); continue; }
      ids.push(a.id);
      continue;
    }
    solo.push({ id: a.id, why: B("Review it on its own", "需要单独查看") });
  }
  return { ids, solo };
}

/** The line the morning digest gives the approvals waiting: how many, how many share one tap, and their titles. Null
 *  when nothing is waiting. */
export function approvalsLine(w: Workspace, today: string, o: { account: boolean; filings: boolean }): { title: Bi; body: Bi } | null {
  const n = w.approvals.length;
  if (!n) return null;
  const t = oneTap(w, today, o), k = t.ids.length;
  const names = (lang: "en" | "zh") => w.approvals.slice(0, 4).map(a => a.title[lang] || a.title.en).join(lang === "zh" ? "；" : "; ") + (n > 4 ? (lang === "zh" ? ` 等 ${n} 项` : `, and ${n - 4} more`) : "");
  return {
    title: B(`${n} thing${n === 1 ? "" : "s"} waiting for your approval${k > 1 ? `, ${k} in one tap` : ""}`, `${n} 项等待您批准${k > 1 ? `，其中 ${k} 项可一键批准` : ""}`),
    body: B(`${names("en")}. ${k > 1 ? `Open Placetta: the ${k} that passed every check go together from Home. ` : ""}Nothing is filed, paid or sent until you approve.`,
      `${names("zh")}。${k > 1 ? `打开快哉：通过全部核对的 ${k} 项可在首页一起批准。` : ""}您批准之前，不会提交、付款或发送任何内容。`),
  };
}
