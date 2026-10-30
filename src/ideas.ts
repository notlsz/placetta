import { B, type Bi } from "./bi.ts";
import type { Workspace } from "./model.ts";
import { runway } from "./runway.ts";
import { choices } from "./expedite.ts";
import { costToOpen } from "./cost.ts";
import { fmtDay } from "./time.ts";

/* What Odelia can take on next, each with the reason from the business's own records (Muse's "Ideas": "I can follow up
   on your airline refund. I found an email from the airline confirming..."). The difference from a to-do: a to-do is
   something already waiting on the owner; an idea is work nobody has asked for yet that the records say is worth doing,
   and one tap hands it to her. Every reason is a fact the workspace holds (a date, a count, the agency's own option);
   when the records don't support an idea it isn't offered, and no number is estimated here.

   Ranked by what it protects: a license that lapses, then the opening date, then money, then growth. Pure, so the app,
   Home and the tests all show the same list. */

export type IdeaIcon = "renew" | "person" | "fast" | "fee" | "store" | "margin";
export type Idea = { id: string; icon: IdeaIcon; title: Bi; why: Bi; ask: Bi; rank: number };

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function ideas(w: Workspace, today: string, o: { unpublished?: number } = {}): Idea[] {
  const out: Idea[] = [];
  const day = (d: string, zh = false) => fmtDay(d, zh ? "zh" : "en", true);

  // 1. renewals in the next 90 days: a license Odelia renews, a certificate she reminds its holder about
  for (const r of runway(w, today)) {
    if (r.lane === "lapsed") continue;
    const at = r.holder ? B(` for ${r.holder.en}`, `${r.holder.zh}的`) : B("", "");
    if (r.kind === "license") {
      out.push({
        id: "renew:" + r.id, icon: "renew", rank: r.days,
        title: B(`I can renew the ${lower(r.name.en)}${at.en}`, `我可以续期${at.zh}${r.name.zh}`),
        why: B(`Its renewal is due on ${day(r.date)}, ${r.days} days from now. I'll prepare it and you approve it.`,
          `${day(r.date, true)}前要续期，还有 ${r.days} 天。我来准备，您批准即可。`),
        ask: B(`Start the renewal of the ${r.name.en}${at.en}, which expires on ${r.date}.`, `开始续期${at.zh}${r.name.zh}，${r.date} 到期。`),
      });
    } else if (r.holder) {
      // the certificate itself, so the offer and the store say the same thing: renewal due first, then it expires
      const first = r.holder.en.split(" ")[0];
      const cert = (w.stores ?? []).flatMap(st => st.certs ?? []).find(c => c.person.split(" ")[0] === first);
      const who = cert ? B(cert.person, cert.person) : r.holder;
      const what = cert ? cert.kind : B(r.name.en.replace(/^\S+'s\s+/, ""), r.name.zh);
      out.push({
        id: "cert:" + r.id, icon: "person", rank: r.days + 5,
        title: B(`I can remind ${who.en} to renew the ${what.en}`, `我可以提醒${who.zh}续期${what.zh}`),
        why: B(`Renewal is due ${day(r.date)}${cert ? `, before it expires ${day(cert.expires)}` : ""}. I'll text the reminder in ${first}'s own language and keep the new card on file.`,
          `${day(r.date, true)}前要续期${cert ? `，${day(cert.expires, true)}到期` : ""}。我会用${who.zh}的母语发提醒，并把新证存档。`),
        ask: B(`Remind ${r.holder.en} to renew their ${r.name.en} before ${r.date}, and keep the new card on file.`, `提醒${r.holder.zh}在 ${r.date} 前续期${r.name.zh}，并把新证存档。`),
      });
    }
  }

  // 2. the opening date: a license on the critical path the agency will review faster for a fee
  for (const a of w.apps) {
    if (!a.critical || a.expedite || ["approved", "review", "filing"].includes(a.status)) continue;
    const c = choices(a);
    const std = c.find(x => x.id === null), fast = c.find(x => x.id !== null && x.changes);
    if (!std || !fast) continue;
    out.push({
      id: "fast:" + a.id, icon: "fast", rank: 40,
      title: B(`I can ask for ${lower(fast.label.en)} on the ${lower(a.name.en)}`, `我可以为${a.name.zh}申请${fast.label.zh}`),
      why: B(`It sets your opening date. Standard takes ${std.time.en}; ${lower(fast.label.en)} is ${fast.time.en}, ${fast.fee.en}.`,
        `它决定开业日。标准需要${std.time.zh}；${fast.label.zh}为${fast.time.zh}，${fast.fee.zh}。`),
      ask: B(`Ask for ${fast.label.en} on the ${a.name.en}, and tell me what it does to the opening date.`, `为${a.name.zh}申请${fast.label.zh}，并告诉我对开业日的影响。`),
    });
    break;   // one: the earliest on the path
  }

  // 3. money: fees the agencies haven't published, so the cost to open is exact
  // the same count the cost-to-open line shows (src/CostToOpen.tsx passes it, with the agencies' quotes counted)
  const n = o.unpublished ?? costToOpen(w, { today }).unpublished;
  if (n > 0) {
    out.push({
      id: "fees", icon: "fee", rank: 70,
      title: B(`I can get the ${n === 1 ? "agency fee" : `${n} agency fees`} that aren't published`, `我可以问清 ${n} 项未公布的机构费用`),
      why: B(`The agencies don't publish ${n === 1 ? "it" : "them"}, so your cost to open leaves ${n === 1 ? "it" : "them"} out. I'll ask each agency and add what they say.`,
        `机构没有公布这些费用，开业成本暂未计入。我会逐一询问机构并补上。`),
      ask: B(`Ask each agency for the fees they don't publish, and add them to the cost to open.`, `向各机构询问未公布的费用，并计入开业成本。`),
    });
  }

  // 4. margin: money a store's own records say it is losing to rules it can keep (the operator's lens: cut the cost
  //    that buys nothing). Only from what is on file: premium pay owed for late schedule changes, fines paid.
  for (const st of w.stores ?? []) {
    const owed = st.schedule?.premiumOwed ?? 0;
    if (owed > 0 && st.schedule) out.push({
      id: "premium:" + st.id, icon: "margin", rank: 60,
      title: B(`I can stop the schedule-change premiums at ${st.name.en}`, `我可以帮${st.name.zh}避免排班变更补偿`),
      why: B(`${st.schedule.changes} late schedule ${st.schedule.changes === 1 ? "change" : "changes"} left $${owed.toLocaleString("en-US")} in premium pay owed. I'll post the next schedule early and flag changes before they cost you.`,
        `${st.schedule.changes} 次晚改排班，产生应付补偿 $${owed.toLocaleString("en-US")}。我会提前发布下期排班，并在变更产生费用前提醒您。`),
      ask: B(`Help ${st.name.en} stop owing schedule-change premiums: post the next schedule on time and warn me before a change costs premium pay.`, `帮${st.name.zh}避免排班变更补偿：按时发布下期排班，并在变更产生补偿前提醒我。`),
    });
    if (st.value.fines > 0) out.push({
      id: "fines:" + st.id, icon: "margin", rank: 55,
      title: B(`I can keep ${st.name.en}'s fines from coming back`, `我可以防止${st.name.zh}再被罚款`),
      why: B(`${st.name.en} has paid $${st.value.fines.toLocaleString("en-US")} in fines. I'll run a mock inspection against what was cited and fix it before the next visit.`,
        `${st.name.zh}已缴罚款 $${st.value.fines.toLocaleString("en-US")}。我会按被罚的项目做一次模拟检查，在下次检查前整改。`),
      ask: B(`Run a mock inspection at ${st.name.en} against what it was fined for, and list what to fix before the next visit.`, `按${st.name.zh}被罚的项目做一次模拟检查，列出下次检查前要整改的地方。`),
    });
  }

  // 5. growth: the next store starts from a store that already has its licenses
  const open = (w.stores ?? []).find(s => s.stage === "open" && (s.apps?.length || s.permits?.length));
  if (open) {
    const n = (open.permits?.length ?? 0) || (open.apps?.length ?? 0);
    out.push({
      id: "store:" + open.id, icon: "store", rank: 90,
      title: B(`I can open your next store from ${open.name.en}`, `我可以照${open.name.zh}开下一家店`),
      why: B(`${open.name.en} holds ${n} licenses. A new address starts from the same list, so only that city's own rules are new work.`,
        `${open.name.zh}有 ${n} 项执照。新地址从同一份清单开始，只有当地的规定需要新办。`),
      ask: B(`I'm opening another store. Start it from ${open.name.en}'s licenses. Ask me for the address.`, `我要再开一家店，照${open.name.zh}的执照来办。请问我地址。`),
    });
  }

  return out.sort((a, b) => a.rank - b.rank).slice(0, 6);
}
