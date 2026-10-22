import { useEffect, useState } from "react";
import * as api from "./api";
import { useApp } from "../ctx";
import { B } from "../model";
import { filledName } from "../plan/prefill";
import { I, Modal, Pill, Select } from "../ui";
import { consentLine, disclosure, NOTICE_MAX, termDiscountLine } from "../contract.ts";
import { MODULES, priceLabel } from "../modules.ts";
import { APPROVED, COMPLEX_LIST, EXPEDITER_RESTAURANT_USD, PLAN_STORE_YEAR_USD, SIMPLE, TYPICAL_OPENING, typicalOpeningUsd } from "../pricing.ts";
import { daysUntil } from "../time";
import { RenewalValue } from "../ValueReport";

/* The plans sheet. A new workspace (the simple model, src/pricing.ts SIMPLE) sees the store plan and the per-license
   prices; a customer from before ('legacy') sees the plans it bought from: the entry plan and the yearly plans.
   Prices match the landing page. Agency fees are always paid by the business to the agency, at cost. */

const money = (n: number) => "$" + n.toLocaleString("en-US");

/** The simple model: one subscription (the store plan), each new license priced on its own, and the anchor next to it. */
function SimplePlans({ reason, prices, onClose }: { reason: "start" | "file"; prices: Prices | null; onClose: () => void }) {
  const { b, t, lang, cloud, ws } = useApp();
  const zh = lang === "zh";
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  if (!cloud) return null;
  const n = Math.max(1, (ws.stores ?? []).length);
  const online = prices?.simple?.online;
  const onPlan = cloud.plan === "monthly";
  const chain = n >= SIMPLE.chainMinStores;
  const year = PLAN_STORE_YEAR_USD * n;
  const start = async () => { setBusy(true); await cloud.startPlan(n); setBusy(false); };
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
            <span className="price">{money(SIMPLE.planStoreMonthUsd)}<small>{zh ? " /店/月，按年计费" : " a store a month, billed yearly"}</small></span>
            <ul>{([["Every license and renewal date tracked", "跟踪每一项执照与续期日期"], ["Renewal monitoring and rule-change alerts", "续期监控与规则变化提醒"], ["Your document vault", "文件库"], ["Odelia, in chat, for your whole team", "Odelia 聊天，全团队可用"], ["Every renewal Odelia files on her own, included", "Odelia 自行提交的续期全部包含"], [`${SIMPLE.chainMinStores} or more stores: every new license included too`, `${SIMPLE.chainMinStores} 家及以上门店：每项新执照也全部包含`]] as [string, string][]).map(([en, z], i) => <li key={i}><I.check />{zh ? z : en}</li>)}</ul>
            {onPlan ? <p className="note">{b(B("You're on the store plan.", "您已开通门店方案。"))}</p> : <>
              <p className="note">{b(B(`${n} store${n === 1 ? "" : "s"}: ${money(year)} a year. Renews every year at the same price until you turn auto-renew off in Settings, Billing.${chain ? " Every new license is included." : ""}`, `${n} 家门店：每年 ${year.toLocaleString("en-US")} 美元。每年按同一价格自动续费，可随时在“设置 > 账单”中关闭。${chain ? "每项新执照均包含在内。" : ""}`))}{online && !online.plan ? b(B(" Online payment isn't set up for it yet, so the team sends a quote. Nothing is charged.", "该方案暂不能在线支付，团队会向您报价，不会收取任何费用。")) : ""}</p>
              <label className="guar"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /><span>{b(consentLine)}</span></label>
              <div className="plan-act">
                <span className="mk">{zh ? `${n} 家门店` : `${n} store${n === 1 ? "" : "s"}`}</span>
                <Pill kind="ink" disabled={busy || !agreed} onClick={() => void start()}>{busy ? "…" : online && !online.plan ? b(B("Ask for a quote", "获取报价")) : b(B(`Start, ${money(year)} a year`, `开通，每年 ${year.toLocaleString("en-US")} 美元`))}</Pill>
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
const FOOD = /tea|coffee|caf[eé]|restaurant|food|kitchen|bakery|hot ?pot|noodle|dessert|ice cream|boba|bubble|juice|bar\b|grill|pizza|sushi|dumpling|奶茶|茶|咖啡|餐|火锅|面|甜品|烘焙|食/i;
const usd = (x: api.LocationPrice | null | undefined, monthly = false) => !x ? "" : "$" + (monthly && x.interval === "year" ? Math.round(x.amount / 12) : x.amount).toLocaleString("en-US", { maximumFractionDigits: 0 });

/** filing: the approval that met the plan wall (held until a plan is on), so the sheet names the form that's waiting. */
export function Plans({ reason, filing, onClose }: { reason: "start" | "file"; filing?: string; onClose: () => void }) {
  const { b, t, lang, cloud, ws } = useApp();
  const zh = lang === "zh";
  const [markets, setMarkets] = useState(1);
  const [busy, setBusy] = useState("");
  const [guarantee, setGuarantee] = useState(false);
  // the contract: a term of one to three years, and the automatic renewal terms agreed to next to the buttons
  const [years, setYears] = useState(1);
  const [agreed, setAgreed] = useState(false);
  const [prices, setPrices] = useState<Prices | null>(null);
  const wsId = cloud?.wsId;
  useEffect(() => { if (wsId) void api.locationPrices(wsId).then(setPrices, () => setPrices(null)); }, [wsId]);
  if (!cloud) return null;
  // a new workspace sees only the simple model; a customer from before keeps the plans below
  if (cloud.billing?.price_model === "simple") return <SimplePlans reason={reason} prices={prices} onClose={onClose} />;
  const stores = ws.stores ?? [];
  const n = Math.max(1, stores.length);
  // what this checkout would bill: every store, and an opening fee for each store still opening, by kind
  const sells = [ws.business.en, ...ws.facts.filter(f => /what you sell|business type|cuisine|menu/i.test(f.label.en)).map(f => f.value.en)].join(" ");
  const kindOf = (s: (typeof stores)[number]) => (s as { kind?: string }).kind ?? (FOOD.test(sells) ? "food" : "retail");
  const opening = stores.filter(s => s.stage === "opening");
  const food = opening.filter(s => kindOf(s) === "food").length, retail = opening.filter(s => kindOf(s) === "retail").length, complex = opening.filter(s => kindOf(s) === "complex").length;
  const go = async (p: "entry" | "essentials" | "pro") => {
    setBusy(p);
    if (p === "entry") await cloud.checkout("entry", { markets });
    else await cloud.checkout("locations", { tier: p, guarantee, term_years: years, renewal_consent: agreed });
    setBusy("");
  };
  const showEntry = cloud.plan === "none";
  // The plan is already on screen (the instant plan from sign-up, src/plan/preview.ts): say what they have, then what starting adds.
  const pv = ws.apps.filter(a => a.preview).length;
  const ready = reason === "start" && showEntry && ws.firstPlan && pv > 0
    ? { place: zh ? ws.firstPlan.whereZh ?? ws.firstPlan.where : ws.firstPlan.where.replace(/,\s*[A-Z]{2}$/, ""), n: pv } : null;
  // the form that's filled and waiting: the one just approved, or the one filled at sign-up (src/plan/prefill.ts)
  const heldApp = (() => { const a = filing ? ws.approvals.find(x => x.id === filing) : undefined; return a?.app ? ws.apps.find(x => x.id === a.app) : undefined; })();
  const winApp = ws.firstPlan?.win ? ws.apps.find(a => a.id === ws.firstPlan!.win && a.status === "ready") : undefined;
  const heldName = heldApp ? filledName(heldApp) : null, winName = winApp ? filledName(winApp) : null;
  const title = reason === "file" ? b(B("Filing is part of the yearly plan.", "申报包含在年度方案中。"))
    : ready ? (zh ? `您的计划已就绪：${ready.place}的 ${ready.n} 项许可。` : `Your plan is ready: ${ready.n} permits for ${ready.place}.`)
    : b(B("Open on time. Stay open. No fines.", "按时开业，持续营业，零罚款。"));
  const sub = reason === "file" ? (heldName
      ? (zh ? `您的${heldName.zh}已填好，批准已保存。开通年度方案后，快哉团队即提交。` : `Your ${heldName.en} is filled and your approval is saved. Start the yearly plan and Placetta's team files it.`)
      : b(B("Your approval is saved. Start the plan and Odelia takes it from here.", "您的确认已保存。开通方案后，由 Odelia 接手。")))
    : ready ? (zh ? `开通开店计划，Odelia 会向每个机构核实、填好每一份表格，并在您批准后提交。${winName ? `您的${winName.zh}已经填好，等您批准。` : ""}` : `Start the entry plan and Odelia verifies each one with its agency, fills every form and files them with your approval.${winName ? ` Your ${winName.en} is already filled and waiting for your approval.` : ""}`)
    : b(B("Billed per location, yearly. Odelia does the work; our team files and answers to the agencies.", "按门店、按年计费。Odelia 负责工作，我们的团队负责申报并与机构对接。"));
  const tier = (key: "essentials" | "pro", price: api.LocationPrice | null | undefined, name: [string, string], tag: [string, string], items: [string, string][]) => (
    <section className={"plan perloc" + (key === "pro" ? " hl" : "")}>
      <div className="plan-h"><b>{zh ? name[1] : name[0]}</b><em>{zh ? tag[1] : tag[0]}</em></div>
      <span className="price">{usd(price, true) || (key === "pro" ? "$299" : "$149")}<small>{zh ? " /店/月，按年计费" : " a location a month, billed yearly"}</small></span>
      <ul>{items.map(([en, z], i) => <li key={i}><I.check />{zh ? z : en}</li>)}</ul>
      <div className="plan-act">
        <span className="mk">{zh ? `${n} 家门店` : `${n} store${n === 1 ? "" : "s"}`}</span>
        <Pill kind={key === "pro" ? "ink" : undefined} disabled={!!busy || !price || !agreed} onClick={() => void go(key)}>{busy === key ? "…" : zh ? `选择${name[1]}` : `Choose ${name[0]}`}</Pill>
      </div>
    </section>
  );
  return (
    <Modal label={b(B("Plans", "方案"))} onClose={onClose} wide>
      <header className="m-h">
        <span className="m-eyebrow"><I.card />{b(B("Plans", "方案"))}</span>
        <h2>{title}</h2>
        <p>{sub}</p>
        <button type="button" className="icbtn close" onClick={onClose} aria-label={t("close")}><I.x /></button>
      </header>
      <div className="m-body plans">
        <div className="tiers two">
          {tier("essentials", prices?.location, ["Essentials", "基础版"], ["Every license, kept current", "全部证照，始终有效"], [
            ["Every permit and license mapped and filed", "梳理并申报全部许可与执照"], ["Renewals and deadlines handled before they lapse", "到期前完成续期，不错过截止日期"], ["Rule changes for each store's city and county", "跟进每家门店所在城市和县的规则变化"], ["Odelia's allowance: $25 a location a month", "Odelia 额度：每店每月 25 美元"]])}
          {tier("pro", prices?.pro, ["Pro", "专业版"], ["Inspection ready, every day", "每天都能迎检"], [
            ["Everything in Essentials", "包含基础版全部内容"], ["Daily inspection-readiness logs and mock inspections", "每日迎检记录与模拟检查"], ["Staff certificates and vendor proof tracked", "跟踪员工证书与供应商凭证"], ["Twice Odelia's allowance: $50 a location a month", "双倍 Odelia 额度：每店每月 50 美元"]])}
        </div>
        <section className="plan terms">
          <div className="plan-h"><b>{b(B("Term and renewal", "期限与续费"))}</b>
            <label className="mk">{b(B("Term", "期限"))}
              <Select aria-label={b(B("Term", "期限"))} value={years} onChange={e => setYears(Number(e.target.value))}>{APPROVED.terms.map(y => <option key={y} value={y}>{zh ? `${y} 年${APPROVED.termDiscountPct[y] ? `，优惠 ${APPROVED.termDiscountPct[y]}%` : ""}` : `${y} year${y === 1 ? "" : "s"}${APPROVED.termDiscountPct[y] ? `, ${APPROVED.termDiscountPct[y]}% off` : ""}`}</option>)}</Select>
            </label></div>
          <p>{b(disclosure({ years, locations: n }))}</p>
          {years > 1 && <p className="note">{b(termDiscountLine(years))}{prices && !(prices.terms?.essentials?.[years] && prices.terms?.pro?.[years]) ? b(B(". If a plan below can't be bought online for this term, our team sends you a quote and nothing is charged.", "。如以下方案无法在线购买此期限，团队会向您报价，期间不会收费。")) : "."}</p>}
          <label className="guar"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /><span>{b(consentLine)}</span></label>
        </section>
        {cloud.billing?.current_period_end && daysUntil(cloud.billing.current_period_end.slice(0, 10)) >= 0 && daysUntil(cloud.billing.current_period_end.slice(0, 10)) <= NOTICE_MAX && <RenewalValue />}
        {opening.length > 0 && (
          <section className="plan openings">
            <div className="plan-h"><b>{zh ? `${opening.length} 家门店正在筹备开业` : `${opening.length} store${opening.length === 1 ? "" : "s"} still opening`}</b></div>
            <p>{[retail && (zh ? `零售 ${retail} 家，每家 ${usd(prices?.opening) || "$3,500"}` : `${retail} retail at ${usd(prices?.opening) || "$3,500"} each`), food && (zh ? `餐饮 ${food} 家，每家 ${usd(prices?.opening_food) || "$6,500"}` : `${food} restaurant or food at ${usd(prices?.opening_food) || "$6,500"} each`), complex && (zh ? `${complex} 家含酒类或大型装修，由团队报价` : `${complex} with liquor or a major build-out, quoted by our team`)].filter(Boolean).join(zh ? "；" : "; ")}{zh ? "。每家门店的全部开业许可，直到开业当天。" : ". Every permit each store needs, through opening day."}</p>
            {prices?.guarantee && retail + food > 0 && (
              <label className="guar"><input type="checkbox" checked={guarantee} onChange={e => setGuarantee(e.target.checked)} />
                <span><b>{zh ? `按期开业保障，每家 ${usd(prices.guarantee)}` : `Open-by-date guarantee, ${usd(prices.guarantee)} a store`}</b>{zh ? "如因快哉负责的许可导致延期开业，退还该店开业费用。" : "If a permit Placetta handles makes you open late, that store's opening fee is refunded."}</span></label>
            )}
          </section>
        )}
        {showEntry && (
          <section className="plan entry">
            <div className="plan-h"><b>{b(B("Not ready for a yearly plan? The entry plan", "还没准备好年度方案？先开通开店计划"))}</b><span className="price">$299<small>{b(B(" per market, one time", " 每个市场，一次性"))}</small></span></div>
            <p>{ready
              ? (zh ? `${ready.place}的 ${ready.n} 项许可逐一向机构核实，每份表格由 Odelia 填好，等您批准。60 天内开通年度方案可全额抵扣。` : `Your ${ready.n} permits for ${ready.place}, each verified with its agency and every form filled by Odelia, ready for your approval. Credited in full if you start a yearly plan within 60 days.`)
              : b(B("Every license for one market mapped, in order, with fees and timelines, and each application prepared. Credited in full if you start a yearly plan within 60 days.", "梳理一个市场所需的全部许可，按顺序列出费用与时间，并准备好每份申请。60 天内开通年度方案可全额抵扣。"))}</p>
            <div className="plan-act">
              <label className="mk">{b(B("Markets", "市场数"))}
                <Select aria-label={b(B("Markets", "市场数"))} value={markets} onChange={e => setMarkets(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(k => <option key={k} value={k}>{k}</option>)}</Select>
              </label>
              <Pill disabled={!!busy} onClick={() => void go("entry")}>{busy === "entry" ? "…" : b(B(`Pay $${299 * markets}`, `支付 $${299 * markets}`))}</Pill>
            </div>
          </section>
        )}
        {cloud.owner ? (
          <section className="plan modules">
            <div className="plan-h"><b>{b(B("Grow the same contract with modules", "在同一合同上添加模块"))}</b></div>
            <ul>{MODULES.map(m => <li key={m.id}><I.check /><span><b>{b(m.name)}</b> {b(priceLabel(m.id))}</span></li>)}</ul>
            <p className="note">{b(B("Each one counts its own unit from your workspace and shows the exact charge before you approve it. Add them in Settings, Billing.", "每项按您工作区中的实际数量计价，批准前显示确切金额。可在“设置 > 账单”中添加。"))}</p>
          </section>
        ) : <p className="note">{b(B("Grow the same contract with modules: ", "可在同一合同上添加模块："))}{MODULES.map(m => b(m.name)).join(zh ? "、" : ", ")}{b(B(". An owner adds them in Settings, Billing.", "。由所有者在“设置 > 账单”中添加。"))}</p>}
        <p className="note">{b(B("Ten or more locations: headquarters plans from $25,000 a year, with every store on one dashboard. Overseas brands entering the US: company setup through the first store, quoted. Government fees are paid by you directly to each agency, at cost. Payments are handled by Stripe.", "10 家及以上门店：总部方案每年 25,000 美元起，所有门店一屏掌握。海外品牌进入美国：从公司设立到首店开业，单独报价。政府规费由您按实际金额直接支付给各机构。付款由 Stripe 处理。"))} <a href="mailto:support@placetta.com?subject=Headquarters%20plan">{b(B("Talk to us", "联系我们"))}</a></p>
      </div>
    </Modal>
  );
}
