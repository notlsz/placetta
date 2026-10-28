import { useEffect, useMemo, useState } from "react";
import { useApp } from "./ctx";
import type { Evidence } from "./smart";
import type { AgencyStat, FormStat } from "./plan";
import * as api from "./cloud/api";

/* What makes an opening date real (src/smart.ts openingPath): Placetta's own filing times per form and per agency, read once per page load, and
   when each application went to the agency. Every screen that shows an opening date passes the same evidence, so the
   store card, the cost line, Deadlines and Home land on the same day. */
let statsOnce: Promise<FormStat[]> | null = null;
let agenciesOnce: Promise<AgencyStat[]> | null = null;
export function useEvidence(): Evidence {
  const { cloud } = useApp();
  const [stats, setStats] = useState<FormStat[]>([]);
  const [agencies, setAgencies] = useState<AgencyStat[]>([]);
  useEffect(() => {
    if (!cloud) return;
    statsOnce ??= api.filingStats().catch(() => []); void statsOnce.then(setStats);
    agenciesOnce ??= api.agencyTimes().catch(() => []); void agenciesOnce.then(setAgencies);
  }, [cloud]);
  return useMemo(() => {
    const submitted: Record<string, string> = {};
    for (const f of cloud?.filings ?? []) if (f.submitted_at && f.status !== "canceled" && !submitted[f.app_id]) submitted[f.app_id] = f.submitted_at;
    return { submitted, stats, agencies };
  }, [cloud?.filings, stats, agencies]);
}
