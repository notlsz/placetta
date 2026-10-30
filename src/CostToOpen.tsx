import { useMemo, useState } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import { costToOpen, type Billed, type Cost } from "./cost";
import { daysFromNow, daysUntil, fmtDay, money } from "./time";
import { I, Modal } from "./ui";
import { useEvidence } from "./evidence";

/* Cost to open (src/cost.ts) on Home's plan card and the Permits page: one line, and the breakdown behind it. */

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** The cost for this workspace and this account's plan (list prices in the sample). */
export function useCost(): Cost {
  const { ws, cloud } = useApp();
  const ev = useEvidence();
  return useMemo(() => {
    const bl = cloud?.billing;
    const billing: Billed | undefined = cloud ? { plan: cloud.plan, tier: bl?.subscription_plan === "pro" ? "pro" : "essentials", comped: !!bl?.comped, free: !!bl?.free, entryMarkets: bl?.entry_markets ?? 0, model: bl?.price_model === "simple" ? "simple" : "legacy", paidLocations: (bl as { paid_locations?: number } | undefined)?.paid_locations ?? 0 } : undefined;
    return costToOpen(ws, { today: daysFromNow(0), billing, ev });
  }, [ws, cloud, ev]);
}

/** "about 14 weeks" from today to a date, or days when it's close. */
function until(iso: string): Bi {
  const d = Math.max(0, daysUntil(iso));
  if (d < 21) return B(`about ${d} day${d === 1 ? "" : "s"}`, `约 ${d} 天`);
  const w = Math.round(d / 7);
  return B(`about ${w} weeks`, `约 ${w} 周`);
}

/** One line: what's known, what isn't, and how long. */
/** noDate: the opening date is already stated just above (Home's opening card), so the line ends at the money. */
export function CostLine({ page, noDate }: { page?: boolean; noDate?: boolean }) {
  const { b, ws } = useApp();
  const c = useCost();
  const [open, setOpen] = useState(false);
  if (!ws.apps.length) return null;
  const known = money(c.totalUSD);
  // on Permits, one short line (the breakdown says which fees aren't published yet): "$6,764 so far, opens Feb 7, 2027"
  if (page) {
    // "known", never "so far": the amount isn't money spent, it's every fee an agency has published (Jobs, Rams)
    const short: Bi[] = [B(`${known}${c.quoted && !c.unpublished ? " known" : ""}`, `已知 ${known}`)];
    const plus = c.unpublished ? B(` plus ${c.unpublished} fee${c.unpublished === 1 ? "" : "s"} set by the agenc${c.unpublished === 1 ? "y" : "ies"}`, `，另有 ${c.unpublished} 项由机构核定`) : null;
    if (c.landing && !noDate) short.push(B(`opens ${fmtDay(c.landing, "en", true)}`, `预计 ${fmtDay(c.landing, "zh", true)} 开业`));
    return (
      <>
        <p className="cost-line on-page">
          <I.card />
          <span><b>{b(B("Cost to open", "开业成本"))}</b> {b(short[0])}{plus && <span className="cl-plus">{b(plus)}</span>}{short[1] && <span className="cl-date">{b(B(", ", "，"))}{b(short[1])}</span>}</span>
          <button type="button" className="lnk" onClick={() => setOpen(true)}>{b(B("Breakdown", "明细"))}<I.chevR /></button>
        </p>
        {open && <CostSheet c={c} onClose={() => setOpen(false)} />}
      </>
    );
  }
  const parts: Bi[] = [B(`${known}${c.unpublished || c.quoted ? " known" : ""}`, `${c.unpublished || c.quoted ? "已知 " : ""}${known}`)];
  if (c.unpublished) parts.push(B(`${c.unpublished} agency fee${c.unpublished === 1 ? "" : "s"} not published`, `${c.unpublished} 项机构费用未公布`));
  if (c.quoted) parts.push(B("plus a quote from the team", "另需团队报价"));
  // the date itself, the same one the store card and Deadlines show (src/smart.ts workspaceOpening), then how far off
  if (c.landing && !noDate) parts.push(B(`opens around ${fmtDay(c.landing, "en", true)} (${until(c.landing).en})`, `预计 ${fmtDay(c.landing, "zh", true)} 前后开业（${until(c.landing).zh}后）`));
  return (
    <>
      <p className={"cost-line" + (page ? " on-page" : "")}>
        <I.card />
        <span><b>{b(B("Cost to open", "开业成本"))}</b> {parts.map(b).join(b(B(", ", "，")))}</span>
        <button type="button" className="lnk" onClick={() => setOpen(true)}>{b(B("Breakdown", "明细"))}<I.chevR /></button>
      </p>
      {open && <CostSheet c={c} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The breakdown: every permit's agency fee as published (or plainly not), Placetta's price, and the time to open. */
export function CostSheet({ c, onClose }: { c: Cost; onClose: () => void }) {
  const { b, lang, cloud } = useApp();
  const zh = lang === "zh";
  return (
    <Modal label={b(B("Cost to open", "开业成本"))} onClose={onClose} wide>
      <header className="m-h">
        <span className="m-eyebrow"><I.card />{b(B("No surprises", "没有意外费用"))}</span>
        <h2>{b(B(`Cost to open: ${money(c.totalUSD)}${c.unpublished || c.quoted ? " known so far" : ""}`, `开业成本：${c.unpublished || c.quoted ? "目前已知 " : ""}${money(c.totalUSD)}`))}</h2>
        <p>{b(B("Added up from Placetta's registry of agency fees, Placetta's price list and your plan. A fee an agency doesn't publish is never guessed: it says so, and it isn't in the total.", "根据快哉登记库中的机构费用、快哉价目表和您的方案计算。机构未公布的费用绝不估算：会如实标注，也不计入合计。"))}</p>
        <button type="button" className="icbtn close" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><I.x /></button>
      </header>
      <div className="m-body cost-sheet">
        <section>
          <h3>{b(B("Agency fees", "机构费用"))}<em>{money(c.agencyUSD)}</em></h3>
          <ul className="cost-rows">
            {c.fees.map(f => (
              <li key={f.app}>
                <span className="cr-n"><b>{b(f.name)}</b><small>{[b(f.agency), f.form].filter(Boolean).join(zh ? "，" : ", ")}</small></span>
                <span className={"cr-v" + (f.fee == null ? " unknown" : "")}>{f.fee == null ? b(B("Not published", "未公布")) : f.fee === 0 ? b(B("Free", "免费")) : money(f.fee, f.currency)}
                  <small>{b(f.why)}{f.source && <> <a href={f.source} target="_blank" rel="noreferrer">{host(f.source)}<I.ext /></a></>}</small></span>
              </li>
            ))}
          </ul>
          <p className="note">{b(B(`${c.published} of ${c.fees.length} fees are published. ${c.unpublished ? "The others are set by the agency or not in the registry yet; Odelia confirms each one before you pay. " : ""}Agency fees are paid by you directly to each agency.`,
            `${c.fees.length} 项中有 ${c.published} 项费用已公布。${c.unpublished ? "其余由机构确定或尚未收录，付款前 Odelia 会逐项确认。" : ""}机构费用由您直接支付给各机构。`))}
            {c.otherCurrencies.length > 0 && ` ${b(B("Fees in other currencies, not in the dollar total:", "以其他货币计的费用，未计入美元合计："))} ${c.otherCurrencies.map(x => money(x.amount, x.currency)).join(zh ? "、" : ", ")}`}</p>
        </section>
        <section>
          <h3>{b(B("Placetta", "快哉"))}<em>{money(c.placettaUSD)}</em></h3>
          <ul className="cost-rows">
            {c.placetta.map((r, i) => (
              <li key={i}>
                <span className="cr-n"><b>{b(r.label)}</b><small>{b(r.note)}</small></span>
                <span className={"cr-v" + (r.amount == null ? " unknown" : "")}>{r.amount == null ? b(B("Quoted", "报价")) : r.paid ? <>{money(r.amount)}<small>{b(B("Paid", "已支付"))}</small></> : money(r.amount)}</span>
              </li>
            ))}
          </ul>
          {!cloud && <p className="note">{b(B("List prices. In your account this follows your plan.", "此为标价。在您的账户中按您的方案计算。"))}</p>}
        </section>
        <section>
          <h3>{b(B("Time to open", "开业时间"))}</h3>
          {c.landing ? <p className="cost-time"><I.deadlines /><span><b>{b(B(`Opens in ${until(c.landing).en}, around ${fmtDay(c.landing, "en", true)}`, `${until(c.landing).zh}后，约 ${fmtDay(c.landing, "zh", true)} 开业`))}</b>{c.basis && <small>{b(c.basis)}</small>}</span></p>
            : <p className="note">{b(B("Add the store and its opening date, and the time to open shows here.", "添加门店及其开业日期后，开业时间会显示在这里。"))}</p>}
        </section>
        <p className="cost-total"><span>{b(B("Total known today", "目前已知合计"))}</span><b>{money(c.totalUSD)}</b></p>
      </div>
    </Modal>
  );
}
