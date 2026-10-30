import { useMemo, useState } from "react";
import { useApp } from "./ctx";
import { fmtDay, nowIso } from "./time";
import type { Application, Workspace } from "./model";
import "./approved.css";

/* The moment a license comes through. Opening a restaurant is months of forms; the day the agency says yes deserves
   more than a status chip turning green (Airbnb's "You're booked", Apple's Activity rings closing). One quiet card at
   the top of Home: the agency's seal, the license, its number and what Odelia does next. It stays a week, or until the
   owner closes it. Everything on it is from the record: the agency's decision and the document it sent. */

const KEY = "placetta-approved-seen-";
const seen = (id: string) => { try { return localStorage.getItem(KEY + id) === "1"; } catch { return false; } };
const keep = (id: string) => { try { localStorage.setItem(KEY + id, "1"); } catch { /* storage blocked */ } };

/** An agency's name as people say it: its initials when the full name is long ("California Department of Tax and Fee
 *  Administration" is CDTFA), the name itself when it's short ("IRS", "City of San Jose"). */
export const short = (name: string) => name.length <= 28 ? name : name.split(/\s+/).filter(w => /^[A-Z]/.test(w)).map(w => w[0]).join("");

export type Win = { app: Application; at: string; number?: string; renews?: string };

/** The newest license the agency approved in the last 7 days, from its decision or the document it sent. */
export function latestWin(w: Workspace, now: string): Win | null {
  const week = new Date(now).getTime() - 7 * 864e5;
  const wins = w.apps.filter(a => a.status === "approved").map((a): Win | null => {
    const doc = w.docs.find(d => d.id === a.receipt && d.by === "agency");
    const at = a.filed?.status === "accepted" && a.filed.decided ? a.filed.decided : doc?.at;
    const renews = w.deadlines.filter(d => d.app === a.id && d.kind === "renewal").map(d => d.date).sort()[0];
    return at ? { app: a, at, number: a.filed?.confirmation, ...(renews ? { renews } : {}) } : null;
  }).filter((x): x is Win => !!x && new Date(x.at).getTime() >= week && new Date(x.at).getTime() <= new Date(now).getTime() + 864e5);
  return wins.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
}

export function ApprovedMoment() {
  const { b, lang, ws, openApp } = useApp();
  const zh = lang === "zh";
  const win = useMemo(() => latestWin(ws, nowIso()), [ws]);
  const [gone, setGone] = useState(false);
  if (!win || gone || seen(win.app.id)) return null;
  const close = () => { keep(win.app.id); setGone(true); };
  const name = b(win.app.name);
  // the warm line (Paul Smith): how many are left, from the plan
  const left = ws.apps.filter(a => a.status !== "approved").length;
  return (
    <section className="win" aria-labelledby="win-h" role="status">
      <span className="win-seal" aria-hidden="true">
        <svg viewBox="0 0 48 48"><circle className="win-ring" cx="24" cy="24" r="21" /><path className="win-tick" d="M15 24.5l6 6 12-13" /></svg>
      </span>
      <button type="button" className="win-tx" onClick={() => { keep(win.app.id); openApp(win.app.id); }}>
        <h2 id="win-h">{zh ? `您的${name}已办好。` : `Your ${name.charAt(0).toLowerCase() + name.slice(1)} is in.`}</h2>
        <p className="win-sub">
          {zh ? `${b(win.app.agency)}于 ${fmtDay(win.at.slice(0, 10), lang)} 批准。` : `Approved by ${short(b(win.app.agency))}, ${fmtDay(win.at.slice(0, 10), lang)}. `}{left > 0 ? (zh ? `还剩 ${left} 项。` : `${left === 1 ? "One" : left}\u00a0to go. `) : (zh ? "全部办好了。" : "That's all of them. ")}
          {win.number ? (zh ? `编号 ${win.number}。` : `Number ${win.number}. `) : ""}
          {win.renews ? (zh ? `续期已记在 ${fmtDay(win.renews, lang, true)}。` : `Renewal on the calendar for ${fmtDay(win.renews, lang, true)}.`) : ""}
        </p>
      </button>
      <div className="win-act">
        <button type="button" className="win-x" aria-label={zh ? "关闭" : "Close"} onClick={close}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
      </div>
    </section>
  );
}
