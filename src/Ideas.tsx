import { useMemo, type ReactNode } from "react";
import { useApp } from "./ctx";
import { I } from "./ui";
import { ideas, type IdeaIcon } from "./ideas";
import { nowIso } from "./time";
import { useCost } from "./CostToOpen";

/* Odelia's Ideas: what she can take on next, each with its reason from the business's own records (src/ideas.ts).
   A row is the offer in her words and the fact behind it; tapping it hands the work to her in the chat, where anything
   that gets filed, sent or paid still waits for the owner's approval. */

const ICON: Record<IdeaIcon, () => ReactNode> = { renew: I.renew, person: I.user, fast: I.fast, fee: I.card, store: I.store, margin: I.margin };

export function IdeasList({ max, compact }: { max?: number; compact?: boolean }) {
  const { b, lang, ws, ask, go, busy } = useApp();
  const unpublished = useCost().unpublished;
  const list = useMemo(() => ideas(ws, nowIso().slice(0, 10), { unpublished }), [ws, unpublished]);
  const rows = max ? list.slice(0, max) : list;
  if (!rows.length) return compact ? null : <p className="ideas-none">{lang === "zh" ? "暂时没有新的建议。有新情况我会写在这里。" : "Nothing new to take on right now. When your records show something worth doing, it shows up here."}</p>;
  return (
    <ul className={"ideas" + (compact ? " compact" : "")}>
      {rows.map(x => {
        const Icon = ICON[x.icon];
        return (
          <li key={x.id}>
            <button type="button" className="idea" disabled={busy} onClick={() => { go("odelia"); ask(b(x.ask)); }}>
              <span className="idea-ico" aria-hidden="true"><Icon /></span>
              <span className="idea-tx"><b>{b(x.title)}</b>{!compact && <small>{b(x.why)}</small>}</span>
              <I.chevR />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function IdeasPage() {
  const { lang } = useApp();
  return (
    <section className="ideas-page" aria-label={lang === "zh" ? "建议" : "Ideas"}>
      <p className="ideas-sub">{lang === "zh" ? "我从您的记录里找到的、值得做的事。点一下交给我；要提交、发送或付款的，仍等您批准。" : "Work your records say is worth doing. Tap one to hand it to me; anything filed, sent or paid still waits for your approval."}</p>
      <IdeasList />
    </section>
  );
}
