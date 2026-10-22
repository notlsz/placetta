import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import { B } from "./bi";
import * as api from "./cloud/api";
import type { Application } from "./model";
import { filingKindOf, IN_PLAN, type Quote } from "./overage.ts";
import { openSettings } from "./Settings";

/* A filing outside the plan's own licenses, in its approval card: who does the work (Odelia on her own, or Placetta's
   team) and what it costs this month, said to an owner before they approve (src/overage.ts). The quote comes from the
   billing function, which prices it from the filing's verified destination; the price and kind shown here are the ones
   the approval sends, and the billing function refuses any other, by a cent, and charges nothing above the owner's
   monthly cap. These prices are for owners only. */

/** The price each approval card showed, by approval id: what approving it agrees to. */
export const shownCharges = new Map<string, { mode: string; cents: number }>();

export function FilingChargeSection({ approvalId, app }: { approvalId: string; app: Application }) {
  const { b, lang, cloud, go } = useApp();
  const [q, setQ] = useState<Quote | null>(null);
  const kind = filingKindOf(app);
  const owner = !!cloud?.owner;
  useEffect(() => {
    shownCharges.delete(approvalId);
    if (!cloud?.wsId || !owner || IN_PLAN.includes(kind)) return;
    let on = true;
    void api.filingQuote(cloud.wsId, app.id).then(r => {
      if (!on) return;
      setQ(r.quote);
      if ((r.quote.kind === "allowance" || r.quote.kind === "charge" || r.quote.kind === "quoted") && r.quote.mode) shownCharges.set(approvalId, { mode: r.quote.mode, cents: r.quote.cents });
    }, () => { if (on) setQ(null); });
    return () => { on = false; };
  }, [cloud?.wsId, owner, approvalId, app.id, kind]);
  if (!cloud || IN_PLAN.includes(kind)) return null;
  if (!owner) return (
    <section>
      <h3>{b(B("Placetta's price for this filing", "快哉对此次申报的收费"))}</h3>
      <p className="note">{b(B("An owner sees the price and approves it.", "由所有者查看价格并批准。"))}</p>
    </section>
  );
  if (!q) return null;
  return (
    <section>
      <h3>{b(B("Placetta's price for this filing", "快哉对此次申报的收费"))}</h3>
      <p className="note">{b(q.line)}</p>
      {q.kind === "blocked" && q.reason !== "no_plan" && <button type="button" className="lnk" onClick={() => openSettings(go, "filingcap")}>{lang === "zh" ? "设置每月上限" : "Set the monthly cap"}</button>}
    </section>
  );
}
