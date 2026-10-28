import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import * as api from "./cloud/api";
import { rejectionReasonOf, SIMPLE } from "./pricing";

/* Outcome pricing (src/pricing.ts OUTCOME_RULE, migration 20261105091200): when an agency rejects a filing, the owner
   sees the reason the Placetta team marked, what it means for the license price, and one tap to dispute it. A dispute
   goes to the team; if they agree it was Placetta's mistake, anything paid is refunded. */
export function RejectionReason({ filing }: { filing: api.Filing }) {
  const { lang, cloud } = useApp();
  const zh = lang === "zh";
  const [r, setR] = useState<api.Rejection | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    void api.filingRejection(filing.id).then(x => { if (live) setR(x); }, () => { if (live) setR(null); });
    return () => { live = false; };
  }, [filing.id, filing.updated_at, n]);
  if (filing.status !== "rejected" || !r) return null;
  const why = rejectionReasonOf(r.reason);
  const price = cloud?.billing?.price_model === "simple";
  if (!why) return (
    <section className="tl-reject" aria-label={zh ? "退回原因" : "Why it was turned down"}>
      <b>{zh ? "退回原因" : "Why it was turned down"}</b>
      <p className="quiet">{zh ? "快哉团队正在核对机构的退回原因，核对后会显示在这里。在此之前不会收取任何执照费用。" : "Placetta's team is checking the agency's reason and will show it here. No license charge happens until then."}</p>
    </section>
  );
  const dispute = async () => {
    setBusy(true);
    try { await api.disputeRejection(filing.id); setSaid(zh ? "已发送给快哉团队，我们会回复您。" : "Sent to Placetta's team. We'll get back to you."); setN(x => x + 1); }
    catch (e) { const x = e as api.ApiError; setSaid((zh && x.message_zh) || x.message); }
    setBusy(false);
  };
  const open = !!r.dispute && !r.dispute.resolved_at;
  return (
    <section className="tl-reject" aria-label={zh ? "退回原因" : "Why it was turned down"}>
      <b>{zh ? "退回原因" : "Why it was turned down"}</b>
      <p>{zh ? why.label.zh : why.label.en}</p>
      {r.note && <p className="quiet">{r.note}</p>}
      {price && <p className="note">{why.ours
        ? (zh ? "这是我们的失误，您无需为这项执照付费；已付的费用会全额退还。机构规费按机构自身规定处理。" : "That was a mistake on our side, so you pay nothing for this license, and anything paid for it is refunded. Agency fees follow the agency's own rules.")
        : (zh ? "这不是快哉的失误，因此按这项执照的价格收费，与获批时相同。如您认为原因不对，可以提出异议。" : `That wasn't a mistake on our side, so the license price is charged, the same as an approval (from $${SIMPLE.licenseOnApprovalUsd}). If the reason isn't right, dispute it.`)}</p>}
      {open
        ? <p className="quiet" role="status">{zh ? "您已提出异议，快哉团队正在核对。" : "You disputed this. Placetta's team is looking at it."}</p>
        : cloud?.owner && !why.ours && <button type="button" className="vc-btn" disabled={busy} onClick={() => void dispute()}>{busy ? "…" : zh ? "提出异议" : "Dispute"}</button>}
      {r.dispute?.resolved_at && <p className="quiet">{zh ? "快哉团队已回复您的异议，以上为最新原因。" : "Placetta's team answered your dispute; the reason above is the current one."}</p>}
      {said && <p role="status">{said}</p>}
    </section>
  );
}
