import type { Lang } from "./i18n";
import { estimateSay, hingeStepSay, type Hinge } from "./smart";
import { hostOf } from "./forms/expedite";

/* The opening estimate as every screen shows it: the date, the range around it, and the one or two steps it hinges on,
   each step's time linking to the page that states it. Home, Stores, the plan and the first-run build all render these
   from the same estimate (src/smart.ts openingPath through workspaceEstimate), so one store never shows two dates.
   No app context: the first-run build renders it before the workspace exists. */

/** "Jan 7, 2027" in bold, then "likely Dec 20 to Feb 3". */
export function EstimateDate({ date, range, lang }: { date: string; range?: { fast: string; slow: string } | null; lang: Lang }) {
  const full = estimateSay(date, range)[lang];
  const just = estimateSay(date)[lang];
  const tail = full.slice(just.length).replace(/^[,，]\s*/, "");
  return <span className="oe-date"><b>{just}</b>{tail && <span className="oe-range">{tail}</span>}</span>;
}

/** "The date hinges on Food facility plan check, up to 20 business days after payment, per deh.santaclaracounty.gov."
 *  The step's name opens it (when onOpen is given) and the host links to the agency's own page. */
export function HingeLine({ hinge, lang, onOpen, className }: { hinge: Hinge[]; lang: Lang; onOpen?: (app: string) => void; className?: string }) {
  if (!hinge.length) return null;
  const zh = lang === "zh";
  return (
    <p className={"oe-hinge" + (className ? " " + className : "")} data-hinge="">
      {zh ? "开业日期取决于：" : "The date hinges on "}
      {hinge.map((h, i) => {
        const said = hingeStepSay(h)[lang], name = h.name[lang];
        const host = hostOf(h.timing.source);
        const at = host ? said.lastIndexOf(host) : -1;
        const mid = at >= 0 ? said.slice(name.length, at) : said.slice(name.length);
        const end = at >= 0 ? said.slice(at + host.length) : "";
        return (
          <span key={h.app} className="oe-step">
            {i > 0 && (zh ? "；以及" : "; and ")}
            {onOpen ? <button type="button" className="lnk" onClick={() => onOpen(h.app)}>{name}</button> : <b>{name}</b>}
            {mid}
            {at >= 0 && <a href={h.timing.source} target="_blank" rel="noopener noreferrer">{host}</a>}
            {end}
          </span>
        );
      })}
      {zh ? "。" : "."}
    </p>
  );
}
