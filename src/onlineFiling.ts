import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import * as api from "./cloud/api";
import { type Bi, B } from "./model";

/* Is online filing live? The portal worker beats once a minute (supabase/migrations/20261102090000_filer_heartbeat.sql);
   the file function says live, off, down or not set up, and this says it in words. Asked once per workspace and again
   every two minutes while a screen shows it. Outside an account (the sample) nothing is asked. */

export type WorkerState = api.WorkerStatus["state"];

/** What each state means for the owner. Pure: scripts/review-fixes-test.ts checks every state in both languages. */
export const ONLINE_FILING: Record<WorkerState, { short: Bi; long: Bi; live: boolean }> = {
  live: { live: true, short: B("Online filing is live", "网上提交已开启"),
    long: B("Odelia submits on agency websites herself. You approve each filing, and she stops for you only for a CAPTCHA, a code sent to your phone, a signature or the agency's fee.",
      "Odelia 会亲自在机构网站上提交。每份申请都由您批准；只有遇到验证码、发到您手机的验证码、签名或机构费用时，她才会请您来完成。") },
  off: { live: false, short: B("Online filing is off", "网上提交未开启"),
    long: B("Filings for agency websites go to the Placetta team, who submit them for you.", "需要在机构网站提交的申请由快哉团队代您提交。") },
  down: { live: false, short: B("Online filing is paused", "网上提交已暂停"),
    long: B("Odelia's filing browser isn't answering right now, so agency-website filings go to the Placetta team until it's back.", "Odelia 的提交浏览器暂时没有响应，恢复前需要在机构网站提交的申请由快哉团队处理。") },
  not_set_up: { live: false, short: B("Online filing isn't set up yet", "网上提交尚未设置"),
    long: B("Until it is, the Placetta team submits agency-website filings for you.", "设置完成前，需要在机构网站提交的申请由快哉团队代您提交。") },
};

const asked = new Map<string, { at: number; p: Promise<api.WorkerStatus | null> }>();

export function useOnlineFiling(): api.WorkerStatus | null {
  const { cloud } = useApp();
  const ws = cloud?.wsId ?? "";
  const [s, setS] = useState<api.WorkerStatus | null>(null);
  useEffect(() => {
    if (!ws) return;
    let live = true;
    const ask = () => {
      const had = asked.get(ws);
      if (!had || Date.now() - had.at > 120_000) asked.set(ws, { at: Date.now(), p: api.portalWorker(ws).catch(() => null) });
      void asked.get(ws)!.p.then(x => { if (live) setS(x); });
    };
    ask();
    const t = window.setInterval(ask, 120_000);
    return () => { live = false; clearInterval(t); };
  }, [ws]);
  return s;
}
