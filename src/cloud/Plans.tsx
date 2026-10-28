import { useEffect, useState } from "react";
import * as api from "./api";
import { useApp } from "../ctx";
import { B } from "../model";
import { I, Modal, Pill } from "../ui";
import { consentLine } from "../contract.ts";
import { COMPLEX_LIST, EXPEDITER_RESTAURANT_USD, PLAN_STORE_YEAR_SAVES_USD, PLAN_STORE_YEAR_USD, planChargeUsd, planItemOf, planTerms, SIMPLE, type PlanInterval, TYPICAL_OPENING, typicalOpeningUsd } from "../pricing.ts";

/* The plans sheet. A new workspace (the simple model, src/pricing.ts SIMPLE) sees the store plan and the per-license
   prices; a customer from before ('legacy') keeps its plan, and the retired plans are never offered again.
   Prices match the landing page. Agency fees are always paid by the business to the agency, at cost. */

const money = (n: number) => "$" + n.toLocaleString("en-US");

/** The simple model: one subscription (the store plan), each new license priced on its own, and the anchor next to it. */
function SimplePlans({ reason, prices, onClose }: { reason: "start" | "file"; prices: Prices | null; onClose: () => void }) {
  const { b, t, lang, cloud, ws } = useApp();
  const zh = lang === "zh";
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [interval, setPlanInterval] = useState<PlanInterval>("year");
  if (!cloud) return null;
  const n = Math.max(1, (ws.stores ?? []).length);
  const online = prices?.simple?.online;
  const onPlan = cloud.plan === "monthly";
  const chain = n >= SIMPLE.chainMinStores;
  const monthly = interval === "month";
  const charge = planChargeUsd(interval, n);
  const quoted = !!online && !online[planItemOf(interval)];
  const start = async () => { setBusy(true); await cloud.startPlan(n, interval); setBusy(false); };
  const rows: [string, string, string, string][] = [
    [`${money(SIMPLE.licenseUsd)}`, `${SIMPLE.licenseUsd} 美元`, "Each new license, permit or registration, filed and tracked to approval", "每一项新执照、许可或登记，提交并跟踪至获批"],
    [`${money(SIMPLE.complexUsd)}`, `${SIMPLE.complexUsd} 美元`, `A complex license: ${COMPLEX_LIST.map(c => c.name.en.toLowerCase()).join(", ")}`, `复杂执照：${COMPLEX_LIST.map(c => c.name.zh).join("、")}`],
    [`${money(SIMPLE.renewalUsd)}`, `${SIMPLE.renewalUsd} 美元`, "A renewal that needs our team, or for a store without the plan, after your one-tap approval", "需要团队处理的续期，或未开通方案门店的续期，经您一键批准后收费"],
    ["Free", "免费", "Your plan preview: every license a store needs, with agency fees and timelines", "计划预览：门店所需的每一项执照，附机构规费与时间"],
    ["At cost", "按实际金额", "Government fees, paid to each agency, never marked up", "政府规费，直接付给各机构，绝不加价"],
  ];
  return (
    <Modal label={b(B("Plans", "方案"))} onClose={onClose} wide>
      <header className="m-h">
        <span className="m-eyebrow"><I.card />{b(B("Plans", "方案"))}</span>
        <h2>{reason === "file" ? b(B("Every filing shows its price before you approve it.", "每份申报在您批准前都会显示价格。")) : b(B("One plan per store. Each new license priced on its own.", "每家门店一个方案，每项新执照单独计价。"))}</h2>
        <p>{b(B(`A permit expediter charges ${money(EXPEDITER_RESTAURANT_USD.low)} to ${money(EXPEDITER_RESTAURANT_USD.high)} for one restaurant opening, before agency fees. On Placetta you see each license's price first, and nothing is charged until you approve it.`, `许可代办公司办一家餐厅开业收费 ${EXPEDITER_RESTAURANT_USD.low.toLocaleString("en-US")} 至 ${EXPEDITER_RESTAURANT_USD.high.toLocaleString("en-US")} 美元，不含政府规费。在快哉，每项执照先显示价格，未经您批准不收任何费用。`))} <a href={EXPEDITER_RESTAURANT_USD.source} target="_blank" rel="noopener noreferrer">{b(B("Source: PermitPlace", "来源：PermitPlace"))}</a></p>
        <button type="button" className="icbtn close" onClick={onClose} aria-label={t("close")}><I.x /></button>
      </header>
      <div className="m-body plans">
        <div className="tiers two">
          <section className="plan perloc hl">
            <div className="plan-h"><b>{b(B("Store plan", "门店方案"))}</b><em>{b(B("Most popular for chains", "连锁品牌首选"))}</em></div>
            <div className="seg sm plan-int" role="group" aria-label={b(B("Billing", "计费方式"))}>
              <button type="button" aria-pressed={!monthly} onClick={() => setPlanInterval("year")}>{b(B("Yearly", "按年"))}</button>
              <button type="button" aria-pressed={monthly} onClick={() => setPlanInterval("month")}>{b(B("Monthly", "按月"))}</button>
            </div>
            {monthly
              ? <span className="price">{money(SIMPLE.planStoreMonthlyUsd)}<small>{zh ? " /店/月，可随时取消" : " a store a month, cancel anytime"}</small></span>
              : <span className="price">{money(SIMPLE.planStoreMonthUsd)}<small>{zh ? ` /店/月，按年计费（${PLAN_STORE_YEAR_USD.toLocaleString("en-US")} 美元）` : ` a store a month, billed yearly (${money(PLAN_STORE_YEAR_USD)})`}</small></span>}
            {!monthly && <p className="note plan-save">{b(B(`Save ${money(PLAN_STORE_YEAR_SAVES_USD)} a store a year`, `每家门店每年节省 ${PLAN_STORE_YEAR_SAVES_USD} 美元`))}</p>}
            <ul>{([["Every license and renewal date tracked", "跟踪每一项执照与续期日期"], ["Renewal monitoring and rule-change alerts", "续期监控与规则变化提醒"], ["Your document vault", "文件库"], ["Odelia, in chat, for your whole team", "Odelia 聊天，全团队可用"], ["Every renewal Odelia files on her own, included", "Odelia 自行提交的续期全部包含"], [`${SIMPLE.chainMinStores} or more stores: every new license included too`, `${SIMPLE.chainMinStores} 家及以上门店：每项新执照也全部包含`]] as [string, string][]).map(([en, z], i) => <li key={i}><I.check />{zh ? z : en}</li>)}</ul>
            {onPlan ? <p className="note">{b(B("You're on the store plan.", "您已开通门店方案。"))}</p> : <>
              <p className="note">{b(((t) => B(t.en + (chain ? " Every new license is included." : ""), t.zh + (chain ? "每项新执照均包含在内。" : "")))(planTerms(interval, n)))}{quoted ? b(B(" Online payment isn't set up for it yet, so the team sends a quote. Nothing is charged.", "该方案暂不能在线支付，团队会向您报价，不会收取任何费用。")) : ""}</p>
              <label className="guar"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /><span>{b(consentLine)}</span></label>
              <div className="plan-act">
                <span className="mk">{zh ? `${n} 家门店` : `${n} store${n === 1 ? "" : "s"}`}</span>
                <Pill kind="ink" disabled={busy || !agreed} onClick={() => void start()}>{busy ? "…" : quoted ? b(B("Ask for a quote", "获取报价")) : monthly ? b(B(`Start, ${money(charge)} a month`, `开通，每月 ${charge.toLocaleString("en-US")} 美元`)) : b(B(`Start, ${money(charge)} a year`, `开通，每年 ${charge.toLocaleString("en-US")} 美元`))}</Pill>
              </div></>}
          </section>
          <section className="plan perloc">
            <div className="plan-h"><b>{b(B("Each new license", "每项新执照"))}</b><em>{b(B("Shown before you approve", "批准前显示价格"))}</em></div>
            <ul className="simple-rows">{rows.map(([v, vz, en, z], i) => <li key={i}><b>{zh ? vz : v}</b><span>{zh ? z : en}</span></li>)}</ul>
            <p className="note">{b(B(`A typical opening, ${TYPICAL_OPENING.where.en}: ${TYPICAL_OPENING.licenses} licenses at ${money(SIMPLE.licenseUsd)} and ${TYPICAL_OPENING.complex} building plan reviews at ${money(SIMPLE.complexUsd)}, ${money(typicalOpeningUsd())} in all, plus agency fees at cost.`, `一次典型开业（${TYPICAL_OPENING.where.zh}）：${TYPICAL_OPENING.licenses} 项执照每项 ${SIMPLE.licenseUsd} 美元，${TYPICAL_OPENING.complex} 项建筑图纸审查每项 ${SIMPLE.complexUsd} 美元，合计 ${typicalOpeningUsd().toLocaleString("en-US")} 美元，另加按实际金额支付的机构规费。`))}</p>
          </section>
        </div>
        <p className="note">{b(B("Each filing's price shows in its card before you approve it, and nothing is charged without your approval. Payments are handled by Stripe.", "每份申报的价格会在批准前显示在卡片中，未经您批准不会收取任何费用。付款由 Stripe 处理。"))} <a href="mailto:support@placetta.com?subject=Placetta%20plan">{b(B("Talk to us", "联系我们"))}</a></p>
      </div>
    </Modal>
  );
}


type Prices = api.PlanPrices;

/** A customer from before the simple model (billing.price_model = 'legacy'): its plan is kept as it is, and the plans it
 *  bought from are retired, so nothing old is offered here. Card, invoices and cancel stay in Manage billing. */
function KeptPlan({ onClose }: { onClose: () => void }) {
  const { b, t, cloud } = useApp();
  if (!cloud) return null;
  return (
    <Modal label={b(B("Plans", "方案"))} onClose={onClose}>
      <header className="m-h">
        <span className="m-eyebrow"><I.card />{b(B("Plans", "方案"))}</span>
        <h2>{b(B("Your plan is kept as it is.", "您的方案保持不变。"))}</h2>
        <p>{b(B("Your workspace keeps the plan it started on. The plans it was bought from aren't offered any more; to move to the store plan, write to us and we'll set it up with you.", "您的工作区沿用开通时的方案。原有方案已不再对外提供；如需改为门店方案，请联系我们，我们会与您一起设置。"))}</p>
        <button type="button" className="icbtn close" onClick={onClose} aria-label={t("close")}><I.x /></button>
      </header>
      <div className="m-body plans">
        <div className="plan-act">
          {cloud.billing?.stripe_customer_id && <Pill onClick={() => void cloud.portal()}>{b(B("Manage billing", "管理账单"))}</Pill>}
          <a className="pill" href="mailto:support@placetta.com?subject=Placetta%20store%20plan">{b(B("Talk to us", "联系我们"))}</a>
        </div>
      </div>
    </Modal>
  );
}

/** filing: the approval that met the plan wall (held until a plan is on), so the sheet names the form that's waiting. */
export function Plans({ reason, onClose }: { reason: "start" | "file"; filing?: string; onClose: () => void }) {
  const { cloud } = useApp();
  const [prices, setPrices] = useState<Prices | null>(null);
  const wsId = cloud?.wsId;
  useEffect(() => { if (wsId) void api.locationPrices(wsId).then(setPrices, () => setPrices(null)); }, [wsId]);
  if (!cloud) return null;
  // a new workspace sees the simple model; a customer from before keeps its plan and is offered nothing old
  if (cloud.billing?.price_model === "legacy") return <KeptPlan onClose={onClose} />;
  return <SimplePlans reason={reason} prices={prices} onClose={onClose} />;
}
