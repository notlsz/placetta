// The words a person agrees to before Placetta records them (California Invasion of Privacy Act, Penal Code 631 and
// 632). The database stores its own copy of these words with the consent (recording_consent_text,
// 20261105090600_privacy_recording_age.sql), never what a request sends; scripts/agent-test.ts checks the two match.
import type { Bi } from "./bi";

export type RecordingKind = "screen" | "teach" | "call";
export const RECORDING_CONSENT_VERSION = "2026-11-05";

export const RECORDING_KINDS: { kind: RecordingKind; name: Bi; text: Bi }[] = [
  {
    kind: "screen",
    name: { en: "Recorded browser", zh: "录制的浏览器" },
    text: {
      en: "I agree that when Odelia hands me a step on an agency's website, the browser I use may be recorded by Placetta's browser provider, including what I type and click there. I can withdraw this in Settings at any time.",
      zh: "我同意：当 Odelia 把机构网站上的某一步交给我时，我使用的浏览器可能会被快哉的浏览器服务商录制，包括我在其中的输入和点击。我可以随时在设置中撤回。",
    },
  },
  {
    kind: "teach",
    name: { en: "Teach mode", zh: "教学模式" },
    text: {
      en: "I agree that when I show Odelia how to file on an agency's website, she records the steps I take there (never my passwords or secret numbers) to learn them. I can withdraw this in Settings at any time.",
      zh: "我同意：当我教 Odelia 如何在机构网站上申报时，她会记录我在其中的操作步骤（从不记录密码或保密号码）以便学会。我可以随时在设置中撤回。",
    },
  },
  {
    kind: "call",
    name: { en: "Call recording", zh: "通话录音" },
    text: {
      en: "I agree that my phone calls with Odelia may be recorded and transcribed and kept with my account. Odelia says so at the start of each recorded call. I can withdraw this in Settings at any time.",
      zh: "我同意：我与 Odelia 的通话可能会被录音和转录，并保存在我的账户中。每次录音的通话开始时 Odelia 都会说明。我可以随时在设置中撤回。",
    },
  },
];
