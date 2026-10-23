import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import * as api from "./cloud/api";
import { channelsFrom, NONE, type Channels } from "./channelsRule";

/* Which channels are set up, asked once per workspace: live voice (talk, the interpreter, rehearsals) from the voice
   function, and Odelia's phone line (texts, iMessage, calls) from odelia-sms. A button for a channel whose credentials
   aren't configured is hidden, or says "Coming soon" with nothing to press: never an action that opens onto an error.
   Until the answer arrives, nothing is shown. Outside an account (the sample) nothing is set up. */

export type { Channels };
const asked = new Map<string, Promise<Channels>>();

export function useChannels(): Channels | null {
  const { cloud } = useApp();
  const ws = cloud?.wsId ?? "";
  const [c, setC] = useState<Channels | null>(cloud ? null : NONE);
  useEffect(() => {
    if (!ws) return;   // outside an account the state starts as NONE
    let live = true;
    if (!asked.has(ws)) asked.set(ws, Promise.all([api.voiceReady(ws), api.odeliaLine()]).then(([v, l]) => channelsFrom(v, l)).catch(() => NONE));
    void asked.get(ws)!.then(x => { if (live) setC(x); });
    return () => { live = false; };
  }, [ws]);
  return c;
}
