import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import * as api from "./cloud/api";
import { ONLINE_FILING, type WorkerState } from "./onlineFilingWords";

/* Is online filing live? The portal worker beats once a minute (supabase/migrations/20261102090000_filer_heartbeat.sql);
   the file function says live, asleep (wakes on demand), off, down or not set up, and src/onlineFilingWords.ts says it
   in words. Asked once per workspace and again every two minutes while a screen shows it. Outside an account (the
   sample) nothing is asked. */

export { ONLINE_FILING, type WorkerState };

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
