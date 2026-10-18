import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import { B } from "./bi";
import { allowanceLine } from "./allowance";
import * as api from "./cloud/api";
import { I } from "./ui";

/** How close the workspace is to this period's allowance, read once a minute at most (Settings shows it in full). */
let seen: { ws: string; at: number; s: api.AiStatus | null } | null = null;
function useNearLimit(wsId: string | undefined): api.AiStatus | null {
  const [s, setS] = useState<api.AiStatus | null>(seen && seen.ws === wsId ? seen.s : null);
  useEffect(() => {
    if (!wsId) return;
    if (seen && seen.ws === wsId && Date.now() - seen.at < 60_000) { setS(seen.s); return; }
    let on = true;
    void api.aiStatus(wsId).then(x => { seen = { ws: wsId, at: Date.now(), s: x }; if (on) setS(x); }).catch(() => undefined);
    return () => { on = false; };
  }, [wsId]);
  return s;
}

/** Before a long job runs (src/allowance.ts): what it usually uses of the allowance, and the Stop that's always there.
 *  Shown only while a real model works on a workspace's own allowance, and only when that allowance is nearly used
 *  (80% or more, or saver mode); otherwise the panel stays quiet and Settings has the meter. It never waits. */
export function AllowanceNote({ asked }: { asked: string }) {
  const { b, lang, mode, deep, busy, stop, cloud } = useApp();
  const st = useNearLimit(mode === "server" ? cloud?.wsId : undefined);
  if (!busy || mode !== "server" || !st) return null;
  const near = st.used_pct >= 80 || !!st.saver;
  if (!near) return null;
  const line = allowanceLine(asked, { deep });
  if (!line) return null;
  const used = lang === "zh" ? `本期额度已用 ${st.used_pct}%。` : `${st.used_pct}% of this period's allowance is used. `;
  return (
    <p className="allow-note" role="note">
      <I.spark /><span>{used}{b(line)}</span>
      <button type="button" className="lnk" onClick={stop}><I.stopSq />{b(B("Stop", "停止"))}</button>
    </p>
  );
}
