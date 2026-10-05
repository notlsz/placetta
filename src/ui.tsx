import { useEffect, useRef, type ReactNode } from "react";
import type { Application, Doc, Level, Status } from "./model";
import { useApp } from "./ctx";
import { bytes, fmtAgo } from "./time";
import type { Key } from "./i18n";

const sv = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export const I = {
  overview: () => <svg {...sv}><rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" /></svg>,
  apps: () => <svg {...sv}><path d="M7 3.5h7l4.5 4.5v12.5H7z" /><path d="M14 3.5V8h4.5M10 12.5h5.5M10 16h5.5" /></svg>,
  docs: () => <svg {...sv}><path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>,
  deadlines: () => <svg {...sv}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  audit: () => <svg {...sv}><path d="M12 3.5l7.5 3v5.5c0 4.5-3.2 7.7-7.5 9-4.3-1.3-7.5-4.5-7.5-9V6.5z" /><path d="M8.8 12.2l2.2 2.2 4.3-4.6" /></svg>,
  context: () => <svg {...sv}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5c.3 2.6 1.6 3.9 4.2 4.2v.1c-2.6.3-3.9 1.6-4.2 4.2h-.1c-.3-2.6-1.6-3.9-4.2-4.2v-.1c2.6-.3 3.9-1.6 4.2-4.2z" /></svg>,
  find: () => <svg {...sv}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>,
  settings: () => <svg {...sv}><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></svg>,
  pin: () => <svg {...sv}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>,
  plus: () => <svg {...sv} width={18} height={18}><path d="M12 5v14M5 12h14" /></svg>,
  x: () => <svg {...sv} width={18} height={18}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  check: () => <svg {...sv} width={14} height={14} strokeWidth={2.1}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  chev: () => <svg {...sv} width={14} height={14}><path d="M6 9l6 6 6-6" /></svg>,
  chevR: () => <svg {...sv} width={14} height={14}><path d="M9 6l6 6-6 6" /></svg>,
  arrow: () => <svg {...sv} width={14} height={14} strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  mic: () => <svg {...sv} width={18} height={18}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  send: () => <svg {...sv} width={18} height={18} strokeWidth={2}><path d="M12 19V5M5 12l7-7 7 7" /></svg>,
  speaker: () => <svg {...sv} width={14} height={14}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>,
  stopSq: () => <svg {...sv} width={12} height={12}><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" /></svg>,
  spark: () => <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5c.4 4.6 2.9 7.1 7.5 7.5v.1c-4.6.4-7.1 2.9-7.5 7.5h-.1c-.4-4.6-2.9-7.1-7.5-7.5V10c4.6-.4 7.1-2.9 7.5-7.5z" /></svg>,
  upload: () => <svg {...sv} width={15} height={15}><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" /></svg>,
  download: () => <svg {...sv} width={15} height={15}><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" /></svg>,
  ext: () => <svg {...sv} width={13} height={13}><path d="M14 4.5h5.5V10M19.5 4.5l-8 8M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></svg>,
  lock: () => <svg {...sv} width={14} height={14}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>,
  pencil: () => <svg {...sv} width={14} height={14}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>,
  pause: () => <svg {...sv} width={12} height={12}><path d="M9 6v12M15 6v12" strokeWidth={2.4} /></svg>,
  menu: () => <svg {...sv} width={20} height={20}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  panel: () => <svg {...sv}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M14.5 4.5v15" /></svg>,
  form: () => <svg {...sv} width={18} height={18}><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" /></svg>,
  card: () => <svg {...sv}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></svg>,
  message: () => <svg {...sv}><path d="M4 5h16v11H9l-5 4z" /></svg>,
  clip: () => <svg {...sv}><path d="M20.5 11.5l-8.3 8.3a5 5 0 0 1-7-7l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" /></svg>,
};

export const LevelTag = ({ l }: { l: Level | "vault" }) => { const { t } = useApp(); return <span className={"lvl lvl-" + l}>{t(("lv_" + l) as Key)}</span>; };
export const StatusChip = ({ s }: { s: Status }) => { const { t } = useApp(); return <span className={"st st-" + s}>{t(("s_" + s) as Key)}</span>; };
export const Sample = () => { const { t } = useApp(); return <span className="sample">{t("sampleTag")}</span>; };

export const feeTotal = (a: Application) => a.fees.reduce((s, f) => s + f.amount, 0);

/** Alven-style file card: a type tile, the name, size and where it came from, and a download button. */
export function FileCard({ d, compact }: { d: Doc; compact?: boolean }) {
  const { b, t, lang, download, ws } = useApp();
  const app = d.app ? ws.apps.find(a => a.id === d.app) : undefined;
  const ext = d.name.split(".").pop()?.toUpperCase() ?? "FILE";
  return (
    <div className={"file" + (compact ? " compact" : "")}>
      <span className={"ftile ft-" + d.kind} aria-hidden="true">{ext.slice(0, 4)}</span>
      <span className="fmeta">
        <b title={d.name}>{d.name}</b>
        <span><em>{bytes(d.size)}</em><em>{b(d.tag)}</em>{!compact && <em>{fmtAgo(d.at, lang)}</em>}</span>
        {!compact && app && <span className="fapp">{b(app.name)}</span>}
      </span>
      <button type="button" className="fdl" onClick={() => download(d.id)} aria-label={t("download") + " " + d.name} title={t("download")}><I.download /></button>
    </div>
  );
}

/** An application as an artifact you can open: the filled form, checklist and fees in one place. */
export function AppArtifact({ a }: { a: Application }) {
  const { b, lang, openApp } = useApp();
  const filled = a.fields.filter(f => f.value).length;
  return (
    <button type="button" className="artifact" onClick={() => openApp(a.id, a.fields.length ? "form" : "check")}>
      <span className="atile" aria-hidden="true"><I.form /></span>
      <span className="ameta">
        <b>{b(a.form ?? a.name)}</b>
        <span>{lang === "zh" ? `${b(a.agency)}，已填 ${filled}/${a.fields.length} 项` : `${b(a.agency)}. ${filled} of ${a.fields.length} fields filled`}</span>
      </span>
      <span className="achev" aria-hidden="true"><I.chevR /></span>
    </button>
  );
}

/** Centered dialog: the only surface with a shadow. Esc and the backdrop close it. */
export function Modal({ label, onClose, children, wide }: { label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div>
    </div>
  );
}

/** Right-hand sheet for an application. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".modal, .voice")) onClose(); };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="scrim right" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div>
    </div>
  );
}

/** Data handling, the way Legora puts it: quietly, at the bottom. The full note lives in Settings. */
export function Footer({ full }: { full?: boolean }) {
  const { t } = useApp();
  return (
    <footer className={"foot" + (full ? " full" : "")}>
      {full ? <p><b>{t("foot_data")}</b>{t("foot_text")}</p> : <p>{t("foot_short")}</p>}
      <p>{t("foot_sample")}</p>
    </footer>
  );
}

/** Legora's pill: a label, then the arrow in a white circle. "quiet" drops the circle. */
export function Pill({ children, onClick, disabled, kind = "primary", sm }: { children: ReactNode; onClick: () => void; disabled?: boolean; kind?: "primary" | "ink" | "quiet"; sm?: boolean }) {
  return (
    <button type="button" className={"pill " + kind + (sm ? " sm" : "")} onClick={onClick} disabled={disabled}>
      <span>{children}</span>{kind !== "quiet" && <i aria-hidden="true"><I.arrow /></i>}
    </button>
  );
}
