import type { Workspace } from "./model";
import type { Filing } from "./cloud/api";
import type { ValueFiling, ValueInput } from "./value.ts";

/* The value report's input from a workspace: the filings table when signed in (its own submitted and decided dates),
   else each application's own filing record (Application.filed). Medians come only from network data (network_view's
   forms, which only lists a form once 3 or more businesses filed it). */

export function filingsOf(ws: Workspace, filings?: Filing[] | null): ValueFiling[] {
  if (filings) return filings.filter(f => f.status !== "canceled").map(f => ({ app: f.app_id, status: f.status, submitted: f.submitted_at, decided: f.decided_at, official: f.payload?.official ?? null, title: f.title }));
  return ws.apps.filter(a => a.filed?.submitted).map(a => ({ app: a.id, status: a.filed!.status, submitted: a.filed!.submitted, decided: a.filed!.decided, official: a.official ?? null }));
}

/** Entity reports that reached the agency: the entity module's applications (ids start with ent-). */
export const entityReports = (f: ValueFiling[]) => f.filter(x => x.app.startsWith("ent-") && x.submitted).length;

export function valueInputOf(ws: Workspace, filings: Filing[] | null | undefined, medians: ValueInput["medians"]): ValueInput {
  const fs = filingsOf(ws, filings ?? null);
  return {
    business: ws.business,
    apps: ws.apps.map(a => ({ id: a.id, name: a.name, official: a.official, agency: a.agency })),
    stores: (ws.stores ?? []).map(s => ({ id: s.id, name: s.name, stage: s.stage, apps: s.apps, notices: s.notices })),
    deadlines: ws.deadlines.map(d => ({ id: d.id, date: d.date, kind: d.kind, app: d.app })),
    docs: ws.docs.map(d => ({ id: d.id })),
    filings: fs,
    medians,
    entityReports: entityReports(fs),
  };
}

/** The forms whose network medians the report asks for. */
export const formKeys = (ws: Workspace) => [...new Set(ws.apps.map(a => a.official).filter((x): x is string => !!x))].map(f => "form:" + f).slice(0, 60);
