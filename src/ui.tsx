import { useRef, type ReactElement } from "react";
import type { Approval, ApprovalKind, Bi, Level, Status } from "./model";
import type { Key } from "./i18n";

type T = (k: Key, v?: Record<string, string | number>) => string;
type Bf = (x: Bi) => string;

const sv = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export const I = {
  agent: () => <svg {...sv}><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="4.5" /></svg>,
  filings: () => <svg {...sv}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg>,
  needs: () => <svg {...sv}><path d="M4 13l3-8h10l3 8v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></svg>,
  activity: () => <svg {...sv}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  connections: () => <svg {...sv}><path d="M9 15l6-6" /><path d="M10.5 6.5l1.8-1.8a4 4 0 0 1 5.7 5.7l-1.8 1.8M13.5 17.5l-1.8 1.8a4 4 0 0 1-5.7-5.7l1.8-1.8" /></svg>,
  pin: () => <svg {...sv}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>,
  mic: () => <svg {...sv}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  send: () => <svg {...sv} strokeWidth={2}><path d="M12 19V5M5 12l7-7 7 7" /></svg>,
  check: () => <svg {...sv} width={14} height={14} strokeWidth={2}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  x: () => <svg {...sv} width={14} height={14}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  pay: () => <svg {...sv}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></svg>,
  sign: () => <svg {...sv}><path d="M4 20h6M15.5 4.5l4 4L9 19H5v-4z" /></svg>,
  upload: () => <svg {...sv}><path d="M20.5 11.5l-8.3 8.3a5 5 0 0 1-7-7l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" /></svg>,
  message: () => <svg {...sv}><path d="M4 5h16v11H9l-5 4z" /></svg>,
  submit: () => <svg {...sv}><path d="M7 17L17 7M9 7h8v8" /></svg>,
};
const KIND: Record<ApprovalKind, () => ReactElement> = { pay: I.pay, sign: I.sign, upload: I.upload, send: I.message, submit: I.submit };

export const LevelTag = ({ l, t }: { l: Level | "vault"; t: T }) => <span className={"lvl lvl-" + l}>{t(("lv_" + l) as Key)}</span>;
export const StatusChip = ({ s, t }: { s: Status; t: T }) => <span className={"st st-" + s}>{t(("s_" + s) as Key)}</span>;

/** One thing the agent needs from you before it can carry on. */
export function ApprovalCard({ a, b, t, busy, compact, onApprove }: {
  a: Approval; b: Bf; t: T; busy: boolean; compact?: boolean; onApprove: (files?: string[]) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const Icon = KIND[a.kind];
  const act = () => (a.kind === "upload" ? file.current?.click() : onApprove());
  return (
    <div className={"appr" + (compact ? " compact" : "")}>
      <div className="appr-hd">
        <span className={"appr-ico k-" + a.kind}><Icon /></span>
        <div className="appr-tt">
          <b>{b(a.title)}</b>
          {a.agency && <span>{b(a.agency)}</span>}
        </div>
      </div>
      {!compact && <p className="appr-dt">{b(a.detail)}</p>}
      <div className="appr-act">
        <button type="button" className="btn primary" disabled={busy} onClick={act}>{b(a.action)}</button>
        {a.kind === "upload" && <button type="button" className="btn ghost" disabled={busy} onClick={() => onApprove()}>{t("useSample")}</button>}
        {a.kind === "upload" && (
          <input ref={file} type="file" multiple hidden onChange={e => {
            const names = Array.from(e.target.files ?? []).map(f => f.name); e.target.value = "";
            if (names.length) onApprove(names);
          }} />
        )}
      </div>
    </div>
  );
}

export function ResolvedCard({ title, b, t }: { title: Bi; b: Bf; t: T }) {
  return <div className="appr resolved"><span className="ok-dot"><I.check /></span><span>{b(title)}</span><em>{t("resolved")}</em></div>;
}
