import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import { B } from "./bi";
import * as api from "./cloud/api";
import type { Application } from "./model";
import { filingKindOf, IN_PLAN, quoteFiling, type Quote } from "./overage.ts";
import { openSettings } from "./Settings";

/* A filing outside the plan's own licenses, in its approval card: what it costs this month, said before the owner
   approves (src/overage.ts). The price shown here is the one the approval sends; the billing function refuses any
   other, by a cent, and charges nothing above the owner's monthly cap. */

/** The price each approval card showed, by approval id: what approving it agrees to. */
export const shownCharges = new Map<string, { kind: string; cents: number }>();

export function FilingChargeSection({ approvalId, app }: { approvalId: string; app: Application }) {
  const { b, lang, cloud, go } = useApp();
  const [q, setQ] = useState<Quote | null>(null);
  const kind = filingKindOf(app);
  useEffect(() => {
    shownCharges.delete(approvalId);
    if (!cloud?.wsId || IN_PLAN.includes(kind)) return;
    let on = true;
    void Promise.all([api.filingMonth(cloud.wsId), api.locationPrices(cloud.wsId).catch(() => null)]).then(([m, p]) => {
      if (!on || !m) return;
      const packCents = p?.pack ? Math.round(p.pack.amount * 100) : undefined;
      const quote = quoteFiling(kind, { locations: m.paid ? Math.max(1, m.locations) : 0, used: m.used, chargedCents: m.charged_cents, capCents: m.cap_cents, packCents });
      setQ(quote);
      if (quote.kind === "allowance" || quote.kind === "charge") shownCharges.set(approvalId, { kind, cents: quote.cents });
    });
    return () => { on = false; };
  }, [cloud?.wsId, approvalId, kind]);
  if (!cloud || IN_PLAN.includes(kind) || !q) return null;
  return (
    <section>
      <h3>{b(B("Placetta's price for this filing", "快哉对此次申报的收费"))}</h3>
      <p className="note">{b(q.line)}</p>
      {q.kind === "blocked" && q.reason !== "no_plan" && <button type="button" className="lnk" onClick={() => openSettings(go, "filingcap")}>{lang === "zh" ? "设置每月上限" : "Set the monthly cap"}</button>}
    </section>
  );
}
