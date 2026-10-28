import type { WorkerStatus } from "./cloud/api";
import { type Bi, B } from "./model";

/* What each state of online filing means for the owner, in words. Pure: scripts/review-fixes-test.ts checks every state
   in both languages. The state comes from the file function's "worker" action (supabase/functions/file logic.ts
   workerState): live, asleep (the worker sleeps when there's nothing to file and wakes when a filing is approved),
   off, down, or not set up. */

export type WorkerState = WorkerStatus["state"];

/** live: Odelia files on agency websites herself (asleep counts: it wakes on the next filing, so nothing goes another way). */
export const ONLINE_FILING: Record<WorkerState, { short: Bi; long: Bi; live: boolean }> = {
  live: { live: true, short: B("Online filing is live", "网上提交已开启"),
    long: B("Odelia submits on agency websites herself. You approve each filing, and she stops for you only for a CAPTCHA, a code sent to your phone, a signature or the agency's fee.",
      "Odelia 会亲自在机构网站上提交。每份申请都由您批准；只有遇到验证码、发到您手机的验证码、签名或机构费用时，她才会请您来完成。") },
  asleep: { live: true, short: B("Online filing is asleep and wakes on demand", "网上提交处于休眠状态，需要时自动唤醒"),
    long: B("Odelia's filing browser rests while there's nothing to file. When you approve a filing it wakes, usually within a minute or two, and Odelia submits on the agency's website herself. If it doesn't wake in time, Placetta sends the filing another way the agency takes, or gives it to you to send.",
      "没有待提交的申请时，Odelia 的提交浏览器会休眠。您批准申请后它会自动唤醒，通常在一两分钟内，随后 Odelia 亲自在机构网站上提交。如果未能及时唤醒，快哉会改用机构接受的其他方式提交，否则交由您自行提交。") },
  off: { live: false, short: B("Online filing is off", "网上提交未开启"),
    long: B("Filings for agency websites go to the Placetta team, who submit them for you.", "需要在机构网站提交的申请由快哉团队代您提交。") },
  down: { live: false, short: B("Online filing is paused", "网上提交已暂停"),
    long: B("Odelia's filing browser isn't answering right now, so agency-website filings go to the Placetta team until it's back.", "Odelia 的提交浏览器暂时没有响应，恢复前需要在机构网站提交的申请由快哉团队处理。") },
  not_set_up: { live: false, short: B("Online filing isn't set up yet", "网上提交尚未设置"),
    long: B("Until it is, the Placetta team submits agency-website filings for you.", "设置完成前，需要在机构网站提交的申请由快哉团队代您提交。") },
};
