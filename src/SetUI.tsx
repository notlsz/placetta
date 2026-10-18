import type { ReactNode } from "react";
import { useApp } from "./ctx";
import { I, Sheet } from "./ui";
import "./settings.css";

/* Settings' side sheet: a long form (a bot's setup, an MCP server, house rules, a business rule, a password) opens
   here, on the app's drawer, instead of growing a box inside the page. The title and one muted line on top, the form
   below, its buttons at the bottom of the form (.sst-act), which stay in view while the form scrolls. */
export function SetSheet({ title, sub, onClose, children, className }: { title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; className?: string }) {
  const { lang } = useApp();
  return (
    <Sheet label={title} onClose={onClose}>
      <div className="sst">
        <header className="sst-h">
          <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
          <button type="button" className="sst-x" onClick={onClose} aria-label={lang === "zh" ? "关闭" : "Close"}><I.x /></button>
        </header>
        <div className={"sst-body" + (className ? " " + className : "")}>{children}</div>
      </div>
    </Sheet>
  );
}
