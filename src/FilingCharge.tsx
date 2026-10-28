import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import { B } from "./bi";
import * as api from "./cloud/api";
import type { Application } from "./model";
import { filingKindOf, IN_PLAN, type Quote } from "./overage.ts";
import type { LicenseQuote } from "./pricing.ts";
import { openSettings } from "./Settings";

/* A filing outside the plan's own licenses, in its approval card: who does the work (Odelia on her own, or Placetta's
   team) and what it costs this month, said to an owner before they approve (src/overage.ts). The quote comes from the
   billing function, which prices it from the filing's verified destination; the price and kind shown here are the ones
   the approval sends, and the billing function refuses any other, by a cent, and charges nothing above the owner's
   monthly cap. These prices are for owners only. */

/** The price each approval card showed, by approval id: what approving it agrees to. */
export const shownCharges = new Map<string, { mode: string; cents: number }>();
/** On the simple model: the price each filing's card showed, by approval id (src/pricing.ts LicenseQuote). */
export const shownLicense = new Map<string, { tier: string; cents: number }>();

/* The simple model: every filing's own price, shown to an owner before approving it: a new license $149, a complex one
   $999, a renewal $99 unless the store plan includes it, free for what staff complete themselves, or included with 10
   or more stores on the plan. The government fee is passed through at cost. Approving sends this exact price and kind;
   the billing function works it out again and refuses any other. Without its Stripe price, the team quotes it. */
function LicensePriceSection({ approvalId, app }: { approvalId: string; app: Application }) {
  const { b, cloud } = useApp();
  const [q, setQ] = useState<LicenseQuote | null>(null);
  const [err, setErr] = useState<{ en: string; zh: string } | null>(null);
  const owner = !!cloud?.owner;
  useEffect(() => {
    shownLicense.delete(approvalId);
    if (!cloud?.wsId || !owner) return;
    let on = true;
    void api.licenseQuote(cloud.wsId, app.id).then(r => {
      if (!on) return;
      setQ(r.quote); setErr(null);
      if (r.quote.priceOk) shownLicense.set(approvalId, { tier: r.quote.tier, cents: r.quote.cents });
    }, (e: api.ApiError) => { if (on) { setQ(null); setErr({ en: e.message, zh: e.message_zh ?? e.message }); } });
    return () => { on = false; };
  }, [cloud?.wsId, owner, approvalId, app.id]);
  if (!cloud) return null;
  const title = b(B("Placetta's price for this filing", "快哉对此次申报的收费"));
  if (!owner) return <section><h3>{title}</h3><p className="note">{b(B("An owner sees the price and approves it.", "由所有者查看价格并批准。"))}</p></section>;
  if (!q && !err) return null;
  return (
    <section>
      <h3>{title}</h3>
      <p className="note">{b(q ? q.line : err!)}</p>
    </section>
  );
}

export function FilingChargeSection({ approvalId, app }: { approvalId: string; app: Application }) {
  const { cloud } = useApp();
  if (cloud?.billing?.price_model === "simple") return <LicensePriceSection approvalId={approvalId} app={app} />;
  return <LegacyChargeSection approvalId={approvalId} app={app} />;
}

/** A customer from before the simple model: filings past the plan's own licenses (src/overage.ts). */
function LegacyChargeSection({ approvalId, app }: { approvalId: string; app: Application }) {
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
