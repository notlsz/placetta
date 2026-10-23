import type { OdeliaLine, VoiceReady } from "./cloud/api";

/* What the server's answers about channels mean for the buttons (src/channels.ts asks; this decides). Pure, so the
   tests run it without a server: scripts/review-fixes-test.ts. */

export type Channels = { talk: boolean; interpreter: boolean; rehearse: boolean; calls: boolean; texts: boolean; imessage: boolean };
export const NONE: Channels = { talk: false, interpreter: false, rehearse: false, calls: false, texts: false, imessage: false };

export function channelsFrom(v: VoiceReady | null, line: Pick<OdeliaLine, "configured" | "voice" | "imessage" | "sms"> | null): Channels {
  return {
    talk: !!v?.talk, interpreter: !!v?.interpreter, rehearse: !!v?.rehearse,
    calls: !!line?.configured && !!line.voice,
    texts: !!line?.configured && (!!line.sms || !!line.imessage),
    imessage: !!line?.configured && !!line.imessage,
  };
}
