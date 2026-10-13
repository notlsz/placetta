import { useEffect, useRef, type ReactNode } from "react";
import type { Application, Doc, Level, Status } from "./model";
import { useApp } from "./ctx";
import { bytes, fmtAgo, money } from "./time";
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
  phone: () => <svg {...sv}><path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" /></svg>,
  store: () => <svg {...sv}><path d="M4 9.5V20h16V9.5M3 9.5l1.6-5h14.8l1.6 5M3 9.5c0 1.4 1.1 2.5 2.5 2.5S8 10.9 8 9.5c0 1.4 1.1 2.5 2.5 2.5S13 10.9 13 9.5c0 1.4 1.1 2.5 2.5 2.5S18 10.9 18 9.5c0 1.4 1.1 2.5 2.5 2.5" /><path d="M10 20v-5h4v5" /></svg>,
  plug: () => <svg {...sv}><path d="M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0zM12 17v4" /></svg>,
  key: () => <svg {...sv}><circle cx="8" cy="15" r="4" /><path d="M11 12l8.5-8.5M16.5 7l2.5 2.5M14 9.5l2 2" /></svg>,
  user: () => <svg {...sv}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></svg>,
  globe: () => <svg {...sv}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z" /></svg>,
  sun: () => <svg {...sv}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></svg>,
  moon: () => <svg {...sv}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>,
  monitor: () => <svg {...sv}><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M9 20h6M12 16.5V20" /></svg>,
  help: () => <svg {...sv}><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" /></svg>,
  scale: () => <svg {...sv}><path d="M12 4v16M7 20h10M5 7h14M7.5 7l-3 6.5h6zM16.5 7l-3 6.5h6z" /></svg>,
  logout: () => <svg {...sv}><path d="M14 4.5h4.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H14M10 16.5L5.5 12 10 7.5M5.5 12H16" /></svg>,
  bell: () => <svg {...sv}><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5h4" /></svg>,
  thermo: () => <svg {...sv}><path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a3.5 3.5 0 1 1-4 0z" /><path d="M12 9v7" /></svg>,
  hq: () => <svg {...sv}><path d="M4.5 20.5V6.5l7-3v17M11.5 9.5h8v11M2.5 20.5h19M7.5 8.5v.01M7.5 12v.01M7.5 15.5v.01M15 13v.01M15 16.5v.01" /></svg>,
  queue: () => <svg {...sv}><rect x="4" y="4" width="16" height="5" rx="1.5" /><rect x="4" y="11" width="16" height="4" rx="1.5" /><path d="M4 19h10" /></svg>,
  copy: () => <svg {...sv} width={14} height={14}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15.5V6a1 1 0 0 1 1-1h9.5" /></svg>,
  clip: () => <svg {...sv}><path d="M20.5 11.5l-8.3 8.3a5 5 0 0 1-7-7l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" /></svg>,
};

export const LevelTag = ({ l }: { l: Level | "vault" }) => { const { t } = useApp(); return <span className={"lvl lvl-" + l}>{t(("lv_" + l) as Key)}</span>; };
export const StatusChip = ({ s }: { s: Status }) => { const { t } = useApp(); return <span className={"st st-" + s}>{t(("s_" + s) as Key)}</span>; };
export const Sample = () => { const { t } = useApp(); return <span className="sample">{t("sampleTag")}</span>; };

export const feeTotal = (a: Application) => a.fees.reduce((s, f) => s + f.amount, 0);
/** The fee as the person reads it: an amount, "from $X" when the agency sets the rest, "Set by the agency", or "No fee". */
export const feeText = (a: Pick<Application, "fees" | "currency">, t: (k: Key) => string, f?: Application["fees"][number]) => {
  const n = f ? f.amount : a.fees.reduce((s, x) => s + x.amount, 0), open = f ? !!f.tbd : a.fees.some(x => x.tbd);
  return n ? money(n, a.currency) + (open ? "+" : "") : open ? t("feeTbd") : t("free");
};

/** An answer as the agent wrote it: paragraphs, "- " bullets and "1. " steps, line breaks kept. */
export function Prose({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let para: string[] = [], list: { ordered: boolean; items: string[] } | null = null;
  const flushP = () => { if (para.length) out.push(<p key={out.length}>{para.flatMap((l, i) => (i ? [<br key={i} />, l] : [l]))}</p>); para = []; };
  const flushL = () => { if (list) { const items = list.items.map((x, i) => <li key={i}>{x}</li>); out.push(list.ordered ? <ol key={out.length} className="prose-l">{items}</ol> : <ul key={out.length} className="prose-l">{items}</ul>); } list = null; };
  for (const raw of text.split("\n")) {
    const line = raw.trim(), bullet = /^[-*•]\s+(.*)/.exec(line), num = /^\d+[.)]\s+(.*)/.exec(line);
    if (!line) { flushP(); flushL(); continue; }
    if (bullet || num) {
      flushP();
      const ordered = !!num;
      if (list && list.ordered !== ordered) flushL();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? num)![1]);
      continue;
    }
    // a wrapped line right after a bullet belongs to it
    if (list && /^\s{2,}/.test(raw)) { list.items[list.items.length - 1] += " " + line; continue; }
    flushL(); para.push(line);
  }
  flushP(); flushL();
  return <>{out}</>;
}

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
  const { t, cloud } = useApp();
  return (
    <footer className={"foot" + (full ? " full" : "")}>
      {full ? <p><b>{t("foot_data")}</b>{t("foot_text")}</p> : <p>{t("foot_short")}</p>}
      {!cloud && <p>{t("foot_sample")}</p>}
    </footer>
  );
}

/** Legora's pill: a label, then the arrow in a white circle. "quiet" drops the circle. */
/** Without onClick it submits its form. */
export function Pill({ children, onClick, disabled, kind = "primary", sm }: { children: ReactNode; onClick?: () => void; disabled?: boolean; kind?: "primary" | "ink" | "quiet"; sm?: boolean }) {
  return (
    <button type={onClick ? "button" : "submit"} className={"pill " + kind + (sm ? " sm" : "")} onClick={onClick} disabled={disabled}>
      <span>{children}</span>{kind !== "quiet" && <i aria-hidden="true"><I.arrow /></i>}
    </button>
  );
}
