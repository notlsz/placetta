import { useEffect, useState } from "react";
import * as api from "./api";
import { useApp } from "../ctx";
import { B } from "../model";
import { I, Modal, Pill } from "../ui";

/* The plans sheet: the entry plan to start the agent, and the annual plans for filing by the team.
   Prices match the landing page. Agency fees are always paid by the business to the agency. */


export function Plans({ reason, onClose }: { reason: "start" | "file"; onClose: () => void }) {
  const { b, t, lang, cloud } = useApp();
  const [markets, setMarkets] = useState(1);
  const [busy, setBusy] = useState("");
  const [prices, setPrices] = useState<{ location: api.LocationPrice | null; opening: api.LocationPrice | null } | null>(null);
  const wsId = cloud?.wsId;
  useEffect(() => { if (wsId) void api.locationPrices(wsId).then(setPrices, () => setPrices(null)); }, [wsId]);
  if (!cloud) return null;
  const go = async (p: "entry" | "starter" | "growth" | "locations") => { setBusy(p); await cloud.checkout(p, p === "entry" ? { markets } : {}); setBusy(""); };
  const showEntry = cloud.plan === "none";
  return (
    <Modal label={b(B("Plans", "方案"))} onClose={onClose} wide>
      <header className="m-h">
        <span className="m-eyebrow"><I.card />{b(B("Plans", "方案"))}</span>
        <h2>{reason === "file" ? b(B("Filing is part of the yearly plan.", "申报包含在年度套餐中。")) : b(B("Start with one market.", "从一个市场开始。"))}</h2>
        <p>{reason === "file" ? b(B("Your approval is saved. Start the plan and Odelia takes it from here.", "您的确认已保存。开通套餐后，由 Odelia 接手。")) : b(B("The agent maps every license your store needs, in order, with fees and timelines, and prepares each application.", "助理按顺序列出门店所需的全部许可、费用与时间，并准备好每一份申请。"))}</p>
        <button type="button" className="icbtn close" onClick={onClose} aria-label={t("close")}><I.x /></button>
      </header>
      <div className="m-body plans">
        {showEntry && (
          <section className="plan entry">
            <div className="plan-h"><b>{b(B("Entry plan", "开店计划"))}</b><span className="price">$299<small>{b(B(" per market, one time", " 每个市场，一次性"))}</small></span></div>
            <p>{b(B("Credited toward your first year on an annual plan.", "可抵扣年度方案首年费用。"))}</p>
            <div className="plan-act">
              <label className="mk">{b(B("Markets", "市场数"))}
                <select aria-label={b(B("Markets", "市场数"))} value={markets} onChange={e => setMarkets(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select>
              </label>
              <Pill kind="ink" disabled={!!busy} onClick={() => void go("entry")}>{busy === "entry" ? "…" : b(B(`Pay $${299 * markets}`, `支付 $${299 * markets}`))}</Pill>
            </div>
          </section>
        )}
        {prices?.location && <PerLocation p={prices.location} o={prices.opening} busy={busy === "locations"} disabled={!!busy} onGo={() => void go("locations")} />}
        {!prices?.location && (
          <section className="plan hl perloc">
            <div className="plan-h"><b>{b(B("Every location", "每家门店"))}</b><em>{b(B("For franchise chains", "连锁加盟品牌"))}</em></div>
            <span className="price">$149<small>{lang === "zh" ? " /店/月" : " per location a month"}</small></span>
            <p>{b(B("Billed yearly. Plus $3,500 once for each new store opening, credited against the yearly plan. Licenses, renewals, staff certificates, vendor service proof, inspection prep and rule changes for every store.", "按年计费。每家新店开业另收 3,500 美元，可抵扣年度套餐。每家门店的执照、续期、员工证书、供应商服务凭证、检查准备和规则变化。"))}</p>
            <a className="pill primary" href="mailto:support@placetta.com?subject=Odelia%20for%20our%20locations"><span>{b(B("Talk to us", "联系我们"))}</span><i aria-hidden="true"><I.arrow /></i></a>
          </section>
        )}
        <p className="note">{b(B("Exceptions handled by people are quoted per step. Government fees are paid by you directly to each agency. Payments are handled by Stripe.", "由专人处理的例外事项按步骤报价。政府规费由您直接支付给各机构。付款由 Stripe 处理。"))}</p>
      </div>
    </Modal>
  );
}

/* Per location: one price per store, read from Stripe, so it grows with the chain. Shown once the prices are set. */
function PerLocation({ p, o, busy, disabled, onGo }: { p: api.LocationPrice; o: api.LocationPrice | null; busy: boolean; disabled: boolean; onGo: () => void }) {
  const { b, lang, ws } = useApp();
  const zh = lang === "zh";
  const money = (x: api.LocationPrice) => (x.currency === "USD" ? "$" : x.currency + " ") + x.amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const per = p.interval === "year" ? (zh ? " /店/年" : " per store a year") : p.interval === "month" ? (zh ? " /店/月" : " per store a month") : "";
  const n = (ws.stores ?? []).length;
  return (
    <section className="plan hl perloc">
      <div className="plan-h"><b>{b(B("Per location", "按门店计费"))}</b><em>{b(B("Grows with your chain", "随门店数量增长"))}</em></div>
      <span className="price">{money(p)}<small>{per}</small></span>
      <p>{o ? (zh ? `新门店另收一次性开店费 ${money(o)}。` : `Plus ${money(o)} once for each new store we open.`) : ""} {zh ? "每家门店的全部许可、续期、检查与申报，由快哉持续跟进。" : "Every permit, renewal, inspection and filing for each store, handled for as long as it's open."}</p>
      <div className="plan-act">
        <span className="mk">{zh ? `${Math.max(1, n)} 家门店` : `${Math.max(1, n)} store${Math.max(1, n) === 1 ? "" : "s"}`}</span>
        <Pill kind="ink" disabled={disabled} onClick={onGo}>{busy ? "…" : b(B("Choose per location", "选择按门店计费"))}</Pill>
      </div>
    </section>
  );
}
