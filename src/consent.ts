// The consent words shown before a phone is linked to Odelia, in one place: Settings (texting a code, or confirming a
// code Odelia texted) and claiming a plan Odelia texted (src/cloud/Root.tsx). When these words change, bump
// phone_consent_version() (supabase/migrations/..._phone_consent_log.sql): the ledger records which version was shown.

export type ConsentHow = "text_code" | "send_code" | "link";

/** The disclosure for linking a number, for how it's being linked. */
export function phoneConsent(how: ConsentHow, zh: boolean): string {
  const lead = how === "text_code" ? (zh ? "您将用这个号码把一个 6 位验证码发给 Odelia。" : "You'll text a 6-digit code to Odelia from this number. ")
    : how === "send_code" ? (zh ? "我们会发送一个 6 位验证码。" : "We'll text a 6-digit code. ") : "";
  const act = how === "text_code" ? (zh ? "发送验证码" : "texting the code") : how === "send_code" ? (zh ? "确认验证码" : "confirming the code") : (zh ? "关联" : "linking it");
  return zh
    ? `${lead}关联后，用这个号码发短信或打电话就能联系 Odelia。${act}即表示您同意快哉就您的工作区向这个号码发送短信和拨打电话，包括自动短信和使用 AI 语音的电话。短信频率不定，可能产生短信和流量费用。回复 STOP 退订，回复 HELP 获取帮助。同意不是购买任何服务的条件。`
    : `${lead}Once linked, texts and calls from this number reach Odelia as you. By ${act}, you agree to texts and calls from Placetta at this number about your workspace, including automated texts and calls with an AI voice. Message frequency varies. Msg & data rates may apply. Reply STOP to cancel, HELP for help. Consent isn't a condition of purchase.`;
}
