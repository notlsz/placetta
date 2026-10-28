// The owner decides how a "prove you're human" check (a CAPTCHA) on an agency's site is handled, at two moments:
//   1. before the filing starts, when the portal is known to show one (the worker's per-host log, portal_challenges) and
//      the agency also takes a way without one (email, fax or mail): the file function asks (logic.ts captchaPlan)
//   2. when one appears mid-run unexpectedly: the worker pauses with the page live and nothing submitted, and asks
//      (worker/filer/src/run.ts captchaAsk)
// The three answers: (a) the owner does it, one tap on their phone; (b) Placetta's team does it; (c) send it another way.
// The answer is saved as the workspace's default for that agency's site ("always ask", "always me", "always the team",
// "always another route": captcha_preferences), so they are asked once. Nobody solves or bypasses a CAPTCHA, ever: (a)
// and (b) are people, and (c) avoids the site. No answer within the agency session's lifetime parks the run safely and
// tells the team. Pure, shared by the file function and the portal worker.

export type CaptchaChoice = "ask" | "me" | "team" | "route";
/** The question's ref in the filing's log: kind needs_you before the filing starts, need_person mid-run. The answer is a
 *  log entry of kind captcha_choice whose ref is the choice. */
export const CAPTCHA_ASK_REF = "captcha_choice";
export const CAPTCHA_CHOICES: CaptchaChoice[] = ["ask", "me", "team", "route"];
export const isChoice = (v: unknown): v is CaptchaChoice => typeof v === "string" && (CAPTCHA_CHOICES as string[]).includes(v);

/** About how many days each way takes to reach the agency: a portal and a fax arrive the same day, an email the same day
 *  or the next, a letter about five (USPS First-Class, 1 to 5 business days). An estimate, said as one. */
export const CHANNEL_DAYS: Record<"portal" | "email" | "fax" | "mail", number> = { portal: 0, email: 1, fax: 0, mail: 5 };

type Bi = { en: string; zh: string };
const WAY: Record<"email" | "fax" | "mail", Bi> = { email: { en: "by email", zh: "通过邮件" }, fax: { en: "by fax", zh: "通过传真" }, mail: { en: "by mail", zh: "通过邮寄" } };

/** How much slower the other way usually is, in words; null days is "not sure". */
function slower(days: number | null): Bi {
  if (days === null) return { en: "not sure how much slower", zh: "不确定会慢多少" };
  if (days <= 0) return { en: "usually no slower", zh: "通常不会更慢" };
  return { en: `usually about ${days} day${days === 1 ? "" : "s"} slower`, zh: `通常约慢 ${days} 天` };
}

/** The question, the same words at both moments. alt: the agency's way without a CAPTCHA, or null when it has none
 *  (then only (a) and (b)). midRun: said when the run is paused on the page. */
export function captchaQuestion(alt: "email" | "fax" | "mail" | null, days: number | null, midRun = false): Bi {
  const lead = midRun
    ? { en: "The agency's site is showing a \"prove you're human\" check. Odelia paused with the page open and nothing sent.", zh: "机构网站正在显示“证明您是真人”的验证。Odelia 已暂停，页面保持打开，尚未提交任何内容。" }
    : { en: "This agency's site shows a \"prove you're human\" check.", zh: "该机构网站会显示“证明您是真人”的验证。" };
  const s = alt ? slower(days) : null;
  const en = `${lead.en} How should it be handled? (a) I'll do it when it comes up, one tap on my phone. (b) Placetta's team does it.${alt ? ` (c) Send it another way: ${WAY[alt].en}, ${s!.en}.` : ""} Odelia remembers your answer for this agency.`;
  const zh = `${lead.zh}您希望如何处理？(a) 出现时由我在手机上点一下完成。(b) 由快哉团队完成。${alt ? `(c) 改用其他方式提交：${WAY[alt].zh}，${s!.zh}。` : ""}Odelia 会为该机构记住您的选择。`;
  return { en, zh };
}

/** What a mid-run answer does: the owner's one tap, the team, another way (only while nothing was submitted: after the
 *  submit was pressed, another way would be a second filing, so it goes to the team instead). */
export function midRunAction(choice: CaptchaChoice, submitted: boolean): "me" | "team" | "route" {
  if (choice === "route") return submitted ? "team" : "route";
  return choice === "team" ? "team" : "me";
}

export const CAPTCHA_ROUTE_MSG: Bi = {
  en: "You chose to send it another way, so Odelia left the agency's site with nothing submitted and sends it the other way the agency takes.",
  zh: "您选择改用其他方式提交，Odelia 已离开机构网站（未提交任何内容），改用机构接受的其他方式提交。",
};
export const CAPTCHA_PARKED_MSG: Bi = {
  en: "The agency's \"prove you're human\" check waited for an answer until its page timed out. Nothing was submitted, and the Placetta team has it now.",
  zh: "机构的“证明您是真人”验证一直等待答复，直到页面超时。未提交任何内容，快哉团队已接手。",
};
