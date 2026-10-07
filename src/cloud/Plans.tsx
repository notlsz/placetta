import { useState } from "react";
import { useApp } from "../ctx";
import { B } from "../model";
import { I, Modal, Pill } from "../ui";

/* The plans sheet: the entry plan to start the agent, and the annual plans for filing by the team.
   Prices match the landing page. Agency fees are always paid by the business to the agency. */

const TIERS = [
  { id: "starter" as const, name: B("Starter", "入门版"), price: "$750", note: B("Billed annually. Up to 5 locations in one market.", "按年计费。1 个市场，最多 5 家门店。"),
    f: [B("Our team files every approved application", "团队提交每一份您批准的申请"), B("License wallet with automatic renewals", "执照钱包，自动续期"), B("Policy monitor and deadline alerts", "政策监测与截止提醒"), B("Store readiness and daily logs", "门店迎检就绪度与每日记录")] },
  { id: "growth" as const, name: B("Growth", "成长版"), price: "$2,000", tag: B("For growing chains", "适合扩张中的连锁品牌"), note: B("Billed annually. Up to 25 locations in three markets.", "按年计费。3 个市场，最多 25 家门店。"),
    f: [B("Everything in Starter", "包含入门版全部功能"), B("Openings in several markets at once", "多个市场同时开店"), B("HQ view with roles for each team", "总部视图，按团队分配权限"), B("Priority filing queue", "优先申报通道")] },
];

export function Plans({ reason, onClose }: { reason: "start" | "file"; onClose: () => void }) {
  const { b, t, lang, cloud } = useApp();
  const [markets, setMarkets] = useState(1);
  const [busy, setBusy] = useState("");
  if (!cloud) return null;
  const go = async (p: "entry" | "starter" | "growth") => { setBusy(p); await cloud.checkout(p, p === "entry" ? { markets } : {}); setBusy(""); };
  const showEntry = cloud.plan === "none";
  return (
    <Modal label={b(B("Plans", "方案"))} onClose={onClose} wide>
      <header className="m-h">
        <span className="m-eyebrow"><I.card />{b(B("Plans", "方案"))}</span>
        <h2>{reason === "file" ? b(B("Filing by our team is part of the annual plans.", "由团队代为申报属于年度方案。")) : b(B("Start with one market.", "从一个市场开始。"))}</h2>
        <p>{reason === "file" ? b(B("Your approval is saved. Pick a plan and the team takes it from here.", "您的批准已保存。选择方案后，团队即可接手。")) : b(B("The agent maps every license your store needs, in order, with fees and timelines, and prepares each application.", "助理按顺序列出门店所需的全部许可、费用与时间，并准备好每一份申请。"))}</p>
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
        <div className="tiers">
          {TIERS.map(x => (
            <section key={x.id} className={"plan" + (x.tag ? " hl" : "")}>
              <div className="plan-h"><b>{b(x.name)}</b>{x.tag && <em>{b(x.tag)}</em>}</div>
              <span className="price">{x.price}<small>{lang === "zh" ? " /月" : " /month"}</small></span>
              <p>{b(x.note)}</p>
              <ul>{x.f.map((f, i) => <li key={i}><I.check />{b(f)}</li>)}</ul>
              <Pill kind={x.tag ? "ink" : "primary"} disabled={!!busy} onClick={() => void go(x.id)}>{busy === x.id ? "…" : b(B(`Choose ${x.name.en}`, `选择${x.name.zh}`))}</Pill>
            </section>
          ))}
          <section className="plan">
            <div className="plan-h"><b>{b(B("Scale", "规模版"))}</b></div>
            <span className="price">$5,000+<small>{lang === "zh" ? " /月" : " /month"}</small></span>
            <p>{b(B("Billed annually. 26+ locations, any number of markets.", "按年计费。26 家门店以上，市场数量不限。"))}</p>
            <ul>{[B("Everything in Growth", "包含成长版全部功能"), B("Unlimited markets", "市场数量不限"), B("A named compliance lead", "专属合规负责人")].map((f, i) => <li key={i}><I.check />{b(f)}</li>)}</ul>
            <a className="pill primary" href="mailto:support@placetta.com?subject=Scale%20plan"><span>{b(B("Talk to us", "联系我们"))}</span><i aria-hidden="true"><I.arrow /></i></a>
          </section>
        </div>
        <p className="note">{b(B("Extra locations are $100 a month each. Government fees are paid by you directly to each agency, through the payment link we send. Payments are handled by Stripe.", "超出的门店每家每月 100 美元。政府规费由您通过我们发送的付款链接直接支付给各机构。付款由 Stripe 处理。"))}</p>
      </div>
    </Modal>
  );
}
