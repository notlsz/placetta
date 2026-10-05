import { Fragment, type ReactNode } from "react";
import { useApp } from "./ctx";
import { LEGAL } from "./legal";
import { fmtDay } from "./time";
import { I, Modal } from "./ui";

/** Links in legal text: bare URLs and emails become links, nothing else. */
function linkify(s: string): ReactNode[] {
  return s.split(/(https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]+)/g).map((part, i) => {
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noreferrer">{part.replace(/^https?:\/\//, "")}</a>;
    if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(part)) return <a key={i} href={`mailto:${part}`}>{part}</a>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Renders the legal body markup: "## " headings, "- " bullets, blank lines between paragraphs. */
export function LegalBody({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="legal-body">
      {blocks.map((blk, i) => {
        const lines = blk.split("\n");
        if (lines.every(l => l.startsWith("- "))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{linkify(l.slice(2))}</li>)}</ul>;
        if (lines[0].startsWith("## ")) return <Fragment key={i}><h3>{lines[0].slice(3)}</h3>{lines.length > 1 && <p>{linkify(lines.slice(1).join(" "))}</p>}</Fragment>;
        return <p key={i}>{linkify(lines.join(" "))}</p>;
      })}
    </div>
  );
}

export function LegalReader({ id, onClose }: { id: string; onClose: () => void }) {
  const { lang, t } = useApp();
  const doc = LEGAL.find(d => d.id === id);
  if (!doc) return null;
  return (
    <Modal label={doc.title[lang]} onClose={onClose} wide>
      <header className="m-h">
        <span className="m-eyebrow"><I.scale />{lang === "zh" ? `更新于 ${fmtDay(doc.updated, lang, true)}` : `Updated ${fmtDay(doc.updated, lang, true)}`}</span>
        <h2>{doc.title[lang]}</h2>
        <button type="button" className="icbtn close" onClick={onClose} aria-label={t("close")}><I.x /></button>
      </header>
      <div className="m-body legal"><LegalBody text={doc.body[lang]} /></div>
    </Modal>
  );
}
