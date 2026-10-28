import { useApp } from "./ctx";
import { B } from "./bi";
import type { Application } from "./model";
import { chooseExpedite, choices } from "./expedite";
import { hostOf } from "./forms/expedite";
import { estimateSay, openingPath, stepTiming } from "./smart";
import { useEvidence } from "./evidence";
import { daysFromNow } from "./time";

/* Standard or expedited, where the agency offers a faster route: each side with its time and fee, the agency's own page
   behind each, and the store's opening estimate under them, updated the moment the owner picks. The expedite fee is the
   agency's own, paid to the agency; picking one changes the plan, and nothing is filed or paid until the owner approves.
   Shown on the approval card and on the application's progress (the plan row's detail). */
export function ExpeditePick({ a }: { a: Application }) {
  const { b, lang, ws, editWs } = useApp();
  const ev = useEvidence();
  const list = choices(a);
  if (!list.length) return null;
  const zh = lang === "zh";
  const cur = a.expedite ?? null;
  const store = (ws.stores ?? []).find(s => s.stage === "opening" && (s.apps ?? []).includes(a.id));
  const p = store ? openingPath(store, ws, daysFromNow(0), ev) : null;
  const locked = ["filing", "review", "approved"].includes(a.status);
  return (
    <section className="xp" data-expedite-pick="">
      <h3>{zh ? "办理速度" : "How fast"}</h3>
      <div className="xp-list" role="radiogroup" aria-label={zh ? "标准或加急" : "Standard or expedited"}>
        {list.map(c => {
          const on = c.id === cur;
          return (
            <label key={c.id ?? "standard"} className={"xp-opt" + (on ? " on" : "")}>
              <input type="radio" name={"xp-" + a.id} checked={on} disabled={locked} onChange={() => editWs(w => chooseExpedite(w, a.id, c.id))} data-expedite={c.id ?? "standard"} />
              <span className="xp-tx">
                <b>{b(c.label)}</b>
                <span>{b(c.time)}{zh ? "，" : ", "}{b(c.fee)}</span>
                {c.only && <small>{b(c.only)}</small>}
                {c.source && <small><a href={c.source} target="_blank" rel="noopener noreferrer">{zh ? "来源：" : "Source: "}{hostOf(c.source)}</a>{c.id && c.how ? (zh ? (c.how === "form" ? "。Odelia 在机构表格上勾选" : "。由快哉团队向机构申请") : c.how === "form" ? ". Odelia marks it on the agency's form" : ". Placetta's team asks the agency for it") : ""}</small>}
              </span>
            </label>
          );
        })}
      </div>
      {p?.landing && p.verdict !== "not_mapped" && (
        <p className="xp-est" aria-live="polite">{b(B(`${store!.name.en} opens ${estimateSay(p.landing, p.range).en}.`, `${store!.name.zh}预计 ${estimateSay(p.landing, p.range).zh} 开业。`))}</p>
      )}
      <p className="note">{b(locked ? B("Already with the agency: the speed was set when it was filed.", "已提交机构：办理速度在提交时已确定。") : B("Any expedite fee is the agency's own and goes to the agency. Placetta adds nothing to it, and nothing is filed or paid until you approve.", "加急费用是机构自己的收费，直接付给机构，快哉不加价；未经您批准，不会提交或付款。"))}</p>
    </section>
  );
}

/** How long the agency takes for this step, with the page that says so: "Agency time: up to 20 business days after
 *  payment, per deh.santaclaracounty.gov". A step with no published time says so, and that the estimate uses a default. */
export function StepTime({ a }: { a: Application }) {
  const { b, lang } = useApp();
  const ev = useEvidence();
  const { timing: t, expedite: x } = stepTiming(a, ev);
  const zh = lang === "zh";
  const host = hostOf(t.source);
  const kind = t.kind === "report" ? (zh ? "（机构绩效报告）" : " (the agency's performance report)") : t.kind === "statistic" ? (zh ? "（统计数据，非机构公布）" : " (a statistic, not the agency's)") : t.kind === "measured" ? (zh ? "（快哉实际办理）" : " (Placetta's own filings)") : "";
  return (
    <p className="pg-time" data-step-time={t.kind}>
      <b>{zh ? "机构办理时间：" : "Agency time: "}</b>{x ? (zh ? `${x.label.zh}，` : `${x.label.en}, `) : ""}{b(t.say)}
      {t.kind === "default" ? (zh ? "。预计日期按此默认值计算。" : ". The estimate uses this default.") : host ? <>{zh ? "，依据 " : ", per "}<a href={t.source} target="_blank" rel="noopener noreferrer">{host}</a>{kind}</> : kind}
    </p>
  );
}
