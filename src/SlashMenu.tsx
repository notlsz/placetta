import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useApp } from "./ctx";
import { commandsFor, expandCommand, matchCommands, type Command } from "./commands";
import { PLAN_CMD } from "./autonomy";
import { B } from "./bi";
import "./controls.css";

/* The message box's commands: type "/" for the list (keyboard: arrows, Enter or Tab to pick, Escape to close; or tap
   one), and Plan first, which sends the next request as "/plan …" so Odelia writes the plan and waits for approval.
   Plan first has no button of its own in the box: "/plan", ⌘K and Settings turn it on, and while it's on a quiet chip
   says so and turns it off. "/upload" opens the file picker (the box has no attach button). */

const UPLOAD: Command = { cmd: "/upload", label: B("Upload a file", "上传文件"), hint: B("A lease, a floor plan, a photo: Odelia reads it", "租约、平面图、照片：Odelia 会读取") };

const PlanIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h7" /><path d="M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2 2.3-2.2" /><path d="M4.5 18h1.5" /></svg>;

export type Slash = {
  /** The list over the message box, or nothing. */
  menu: ReactNode;
  /** The Plan first chip while it's on (tap to turn it off); nothing otherwise. */
  toggle: (disabled?: boolean) => ReactNode;
  /** Turn Plan first on or off for the next request (⌘K). */
  setPlan: (on: boolean) => void;
  /** Keys while typing: true when the menu used it. */
  onKey: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Send what was typed: a command becomes its request, "/forget" starts a fresh conversation, Plan first adds "/plan". */
  send: (text: string) => void;
  /** For the text box: it controls the list. */
  inputProps: Record<string, string | boolean | undefined>;
  plan: boolean;
};

export function useSlash({ draft, setDraft, variant, onUpload }: { draft: string; setDraft: (s: string) => void; variant: string; onUpload?: () => void }): Slash {
  const { lang, ws, ask, b } = useApp();
  const list = useMemo(() => (onUpload ? [...commandsFor(ws), UPLOAD] : commandsFor(ws)), [ws, onUpload]);
  const hits = useMemo(() => matchCommands(list, draft), [list, draft]);
  const [at, setAt] = useState(0);
  const [shut, setShut] = useState(false);
  const [plan, setPlan] = useState(false);
  // a new "/" opens it again after Escape
  useEffect(() => { if (!draft.startsWith("/")) setShut(false); }, [draft]);
  useEffect(() => { setAt(0); }, [hits.length]);
  const open = hits.length > 0 && !shut;
  const zh = lang === "zh";

  const send = (text: string) => {
    if (onUpload && text.trim().toLowerCase() === UPLOAD.cmd) { onUpload(); return; }
    const x = expandCommand(list, text, lang);
    if (x && "local" in x) { window.dispatchEvent(new CustomEvent("placetta:forget")); setPlan(false); return; }
    const q = x ? x.prompt : text;
    ask(plan && !PLAN_CMD.test(q) ? `/plan ${q}` : q);
    setPlan(false);
  };
  const pick = (c: Command) => {
    if (c === UPLOAD) { setDraft(""); onUpload?.(); return; }
    if (c.local || (!c.args && !c.needs)) { setDraft(""); send(c.cmd); return; }
    setDraft(c.cmd + " ");
    setShut(true);
    setTimeout(() => (document.getElementById("ask-" + variant) as HTMLTextAreaElement | null)?.focus(), 0);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setAt(i => (i + 1) % hits.length); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setAt(i => (i - 1 + hits.length) % hits.length); return true; }
    if ((e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) || e.key === "Tab") { e.preventDefault(); pick(hits[Math.min(at, hits.length - 1)]); return true; }
    if (e.key === "Escape") { e.preventDefault(); setShut(true); return true; }
    return false;
  };
  const listId = "slash-" + variant;
  const builtin = (c: Command) => !c.cmd.startsWith("/") || ["/plan", "/status", "/renew", "/inspection", "/map", "/deadlines", "/forget", "/upload"].includes(c.cmd);
  let last = "";
  const menu = open ? (
    <div className="slash" role="presentation">
      <div className="slash-h"><span>{zh ? "命令" : "Commands"}</span><span><kbd>↑↓</kbd> <kbd>Enter</kbd></span></div>
      <ul id={listId} role="listbox" aria-label={zh ? "命令" : "Commands"}>
        {hits.map((c, i) => {
          const g = builtin(c) ? (zh ? "常用" : "Jobs") : (zh ? "手册" : "Playbooks");
          const head = g !== last ? g : null; last = g;
          return [
            head && <li key={"g-" + g} className="sl-g" role="presentation">{head}</li>,
            <li key={c.cmd} role="presentation">
              <button type="button" id={`${listId}-${i}`} role="option" aria-selected={i === at} className={i === at ? "on" : ""}
                onMouseDown={e => e.preventDefault()} onMouseEnter={() => setAt(i)} onClick={() => pick(c)}>
                <code>{c.cmd}{c.args && <small>{b(c.args)}</small>}</code>
                <span className="sl-t"><b>{b(c.label)}</b>{c.hint && <small>{b(c.hint)}</small>}</span>
              </button>
            </li>,
          ];
        })}
      </ul>
    </div>
  ) : null;
  const toggle = (disabled?: boolean) => !plan ? null : (
    <button type="button" className="pf" aria-pressed={plan} disabled={disabled} onClick={() => setPlan(v => !v)}
      title={zh ? "先做计划：Odelia 先写好计划，等您批准后再做" : "Plan first: Odelia writes the plan and waits for your approval"} aria-label={zh ? "先做计划" : "Plan first"}>
      <PlanIcon /><span className="pf-w">{zh ? "先做计划" : "Plan first"}</span>
    </button>
  );
  return {
    menu, toggle, onKey, send, plan, setPlan,
    inputProps: { role: "combobox", "aria-autocomplete": "list", "aria-expanded": open, "aria-controls": open ? listId : undefined, "aria-activedescendant": open ? `${listId}-${Math.min(at, hits.length - 1)}` : undefined },
  };
}
