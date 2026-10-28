// Recording a person (California Invasion of Privacy Act, Penal Code 631 and 632): before a run, the worker asks the
// database what it may record (filer_recording_policy, 20261105090600_privacy_recording_age.sql).
//
//   strict   the business or a member is in California, or nothing says where they are: nothing that records a
//            person's typing or screen runs without that person's opt-in, stored with its time and words
//   screen   every member who may be handed the page opted in to a recorded browser (a Steel session, which Steel
//            always records, or a Browserbase session with recording on)
//   teach    every such member opted in to teach mode recording their actions
//   synthetic   a probe or test workspace (workspaces.synthetic), the one place a free Gemini key may rehearse
//
// Anything that goes wrong reading it gives the strict answer with no consent: the safe side.
//
// Outside California a person is still told before a recording starts: the hand-back's message says the browser is
// recorded, and teach mode's says what it writes down.
import type { Bi } from "./types.ts";

export type RecordingPolicy = { synthetic: boolean; strict: boolean; screen: boolean; teach: boolean };

/** What the worker assumes when it can't ask: California, nobody opted in, not a test. */
export const STRICT: RecordingPolicy = Object.freeze({ synthetic: false, strict: true, screen: false, teach: false });

/** The database's answer, read defensively: anything missing or odd counts as the strict side. */
export function policyOf(raw: unknown): RecordingPolicy {
  if (!raw || typeof raw !== "object") return { ...STRICT };
  const r = raw as Record<string, unknown>;
  return { synthetic: r.synthetic === true, strict: r.strict !== false, screen: r.screen === true, teach: r.teach === true };
}

/** A recorded browser may be handed to a person: outside California (with the notice), or with everyone's opt-in. */
export const screenOk = (p: RecordingPolicy) => !p.strict || p.screen;
/** Teach mode may record a person's actions: outside California (its message says what it writes down), or opted in. */
export const teachOk = (p: RecordingPolicy) => !p.strict || p.teach;

/** Said with a hand-back on a recorded browser, before the person opens it (outside California). */
export const RECORDED_NOTICE: Bi = {
  en: "This browser is recorded by Placetta's browser provider while you use it, including what you type there.",
  zh: "您使用期间，此浏览器会被快哉的浏览器服务商录制，包括您在其中的输入。",
};

/** The hand-back can't go to a person: the only browser here is recorded and they haven't opted in. */
export const SCREEN_CONSENT_MSG: Bi = {
  en: "This step needs a person in the agency's browser, and that browser is recorded. Placetta doesn't record anyone in California without their OK, so Odelia stopped here. To finish it in the live browser, turn on \"Recorded browser\" in Settings, Privacy; otherwise the Placetta team will help you finish another way.",
  zh: "这一步需要有人在机构的浏览器中完成，而该浏览器会被录制。未经同意，快哉不会录制加州的任何人，所以 Odelia 在此停下。若要在实时浏览器中完成，请在设置的隐私中开启“录制的浏览器”；否则快哉团队会协助您用其他方式完成。",
};

/** Teach mode needs the person's opt-in in California. */
export const TEACH_CONSENT_MSG: Bi = {
  en: "Showing Odelia how records the steps you take on the agency's site. Placetta doesn't record anyone in California without their OK, so nothing was recorded. To teach her, turn on \"Teach mode\" in Settings, Privacy, then start again.",
  zh: "教 Odelia 会记录您在机构网站上的操作步骤。未经同意，快哉不会录制加州的任何人，所以没有记录任何内容。若要教她，请在设置的隐私中开启“教学模式”，然后重新开始。",
};

/** A hand-back's message with the notice added when the browser is recorded. */
export function withNotice(message: Bi, recorded: boolean): Bi {
  return recorded ? { en: `${message.en} ${RECORDED_NOTICE.en}`, zh: `${message.zh}${RECORDED_NOTICE.zh}` } : message;
}
