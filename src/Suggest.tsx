import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { I } from "./ui";
import { fold, matchIn, recentRows, remember, type Source, type Sug, type SugIcon } from "./suggestions";
import type { Lang } from "./i18n";
import "./suggest.css";

/* One text field with suggestions under it, like Airbnb's search box: type and a clean list offers matching places,
   kinds of business, agencies or the workspace's own facts, each with its icon and a quiet second line; an empty field
   offers what this viewer entered before. Arrow keys move, Enter takes the highlighted one, Esc closes the list, and a
   pick never submits the form. What's typed always stands, unless the field is a fixed list (`fixed`: a state, a
   country, a kind of company), where only a listed value is kept. The rows come from src/suggestions.ts. */

const ICON: Record<SugIcon, () => ReactNode> = {
  place: I.pin, kind: I.store, fact: I.context, recent: I.clock, agency: I.scale, state: I.pin, country: I.globe, entity: I.hq, person: I.user, option: I.form,
};

/** The typed part of a label in bold. */
export function Marked({ label, q }: { label: string; q: string }) {
  const m = matchIn(label, q);
  if (!m) return <>{label}</>;
  return <>{label.slice(0, m[0])}<b className="sug-m">{label.slice(m[0], m[1])}</b>{label.slice(m[1])}</>;
}

/** A list of things typed one after another ("Dallas, Houston and Austin"): the last one is what's being typed. */
const SEP = /(,\s*|，\s*|、\s*|\s+and\s+|\s*和\s*)/i;
const lastPart = (v: string) => { const parts = v.split(SEP); return parts[parts.length - 1] ?? ""; };
const withLast = (v: string, x: string) => { const parts = v.split(SEP); parts[parts.length - 1] = x; return parts.join(""); };

export type SuggestProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "list"> & {
  value: string;
  onValue: (v: string) => void;
  source: Source;
  lang: Lang;
  /** Remembers what's picked or entered here, per viewer, and offers it when the field is empty. */
  recent?: string;
  /** Only a listed value is kept (a picker): the field shows the label, the value is the option's value. */
  fixed?: boolean;
  /** The field holds a list ("Dallas, Houston, Austin"): suggestions complete the last item. */
  many?: boolean;
  onPick?: (s: Sug) => void;
};

export function SuggestInput({ value, onValue, source, lang, recent, fixed, many, onPick, onKeyDown, onFocus, onBlur, ...rest }: SuggestProps) {
  const uid = useId().replace(/:/g, "");
  const listId = "sug-" + uid;
  const own = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(false);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(-1);
  // a fixed list shows the picked option's label; what's typed there is only a search until something is picked
  const labelOf = (v: string) => (fixed ? source("").find(s => s.value === v)?.label ?? v : v);
  const [typed, setTyped] = useState<string | null>(null);
  const shown = fixed ? typed ?? labelOf(value) : value;
  const q = many ? lastPart(shown) : shown;

  const items = useMemo<Sug[]>(() => {
    if (!focus) return [];
    if (fixed) return source(typed ?? "");
    const rows = q.trim() ? source(q) : [...(recent ? recentRows(recent, lang) : []), ...source("")];
    const seen = new Set<string>();
    const out = rows.filter(s => { const k = fold(s.value); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
    // nothing useful: the only suggestion is exactly what's already typed
    return out.length === 1 && fold(out[0].value) === fold(q) ? [] : out;
  }, [focus, fixed, typed, q, source, recent, lang]);
  const showing = open && items.length > 0;

  // a new search starts with nothing highlighted (a fixed list: the picked option, or its best match)
  const fresh = `${q}\u0000${typed ?? ""}\u0000${open}`;
  const [seenQ, setSeenQ] = useState(fresh);
  if (seenQ !== fresh) { setSeenQ(fresh); setAt(fixed && items.length ? Math.max(0, items.findIndex(s => typed === null && s.value === value)) : -1); }

  // the list floats over the page, under the field (above it when there's no room below), never off the side
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const place = () => {
    const el = own.current, m = list.current;
    if (!el) return;
    const r = el.getBoundingClientRect(), h = m?.offsetHeight ?? 0, vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 300), vw - 16, 460);
    const left = Math.min(Math.max(8, r.left), vw - 8 - width);
    const up = vh - r.bottom < h + 12 && r.top > vh - r.bottom;
    setPos(p => (p && p.left === left && p.width === width && p.up === up && p.top === (up ? r.top : r.bottom) ? p : { left, width, up, top: up ? r.top : r.bottom }));
  };
  useLayoutEffect(() => { if (showing) place(); });
  useEffect(() => {
    if (!showing) return;
    const on = () => place();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on, true); window.removeEventListener("resize", on); };
  });
  // the highlighted row stays in view as the arrow keys move
  useEffect(() => { if (at >= 0) document.getElementById(`${listId}-${at}`)?.scrollIntoView({ block: "nearest" }); }, [at, listId]);

  const pick = (s: Sug) => {
    if (fixed) { setTyped(null); onValue(s.value); }
    else if (many) { const v = withLast(shown, s.value); onValue(v + (lang === "zh" ? "、" : ", ")); }
    else onValue(s.value);
    if (recent && !many) remember(recent, s.value);
    onPick?.(s);
    setOpen(false);
    own.current?.focus();
  };
  /** A fixed list keeps only a listed value: what's typed becomes the option it names, or goes back to what was there. */
  const settle = () => {
    if (!fixed || typed === null) return;
    const t = fold(typed);
    const hit = t ? source("").find(s => [s.label, s.value, ...(s.keys ?? [])].some(k => fold(k) === t)) : undefined;
    setTyped(null);
    if (hit && hit.value !== value) onValue(hit.value);
  };

  return (
    <>
      <input
        {...rest}
        ref={own}
        value={shown}
        role="combobox" aria-autocomplete="list" aria-expanded={showing} aria-controls={listId}
        aria-activedescendant={showing && at >= 0 ? `${listId}-${at}` : undefined}
        autoComplete="off"
        onChange={e => { const v = e.target.value; if (fixed) setTyped(v); else onValue(v); setOpen(true); }}
        onFocus={e => { setFocus(true); setOpen(true); onFocus?.(e); }}
        onBlur={e => { setFocus(false); setOpen(false); settle(); onBlur?.(e); }}
        onClick={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!items.length) return;
            e.preventDefault();
            if (!showing) { setOpen(true); return; }
            const n = items.length, d = e.key === "ArrowDown" ? 1 : -1;
            setAt(i => (i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n));
            return;
          }
          if (e.key === "Enter" && showing && at >= 0 && items[at]) { e.preventDefault(); pick(items[at]); return; }
          if (e.key === "Enter" && fixed) settle();
          if (e.key === "Escape" && showing) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setOpen(false); if (fixed) setTyped(null); return; }
          if (e.key === "Tab" && fixed && showing && at >= 0 && items[at] && typed !== null) pick(items[at]);
          onKeyDown?.(e);
        }}
      />
      {showing && createPortal(
        <div ref={list} id={listId} role="listbox" aria-label={typeof rest["aria-label"] === "string" ? rest["aria-label"] : lang === "zh" ? "建议" : "Suggestions"}
          className={"menu sug" + (pos?.up ? " up" : "")}
          style={pos ? { left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top + 6 } : { top: pos.top + 6 }) } : { visibility: "hidden" }}
          onMouseDown={e => e.preventDefault()}>
          {items.map((s, i) => {
            const Icon = ICON[s.icon];
            const picked = !!fixed && s.value === value;
            return (
              <div key={s.id} id={`${listId}-${i}`} role="option" aria-selected={picked} className={"sug-o" + (i === at ? " on" : "")}
                onMouseMove={() => { if (at !== i) setAt(i); }} onClick={() => pick(s)}>
                <Icon />
                <span className="sug-l"><Marked label={s.label} q={fixed ? typed ?? "" : q} /></span>
                {s.sub && <span className="sug-s">{s.sub}</span>}
                {picked && <svg className="menu-check" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
