import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import { I } from "./ui";
import { AgentBot } from "./Bot";

/* The first minute: three cards, one idea each, a picture of the real thing on each. Anyone gets it, with no AI
   experience at all: say what you need, she does the work, you tap Approve. Shown once; Help, Take the tour, shows it
   again. Ends by handing them the one thing to do next. */

const KEY = "placetta-tour-1";
export const tourSeen = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return true; } };
export const replayTour = () => { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } window.dispatchEvent(new Event("placetta-tour")); };

const CARDS: { title: Bi; text: Bi }[] = [
  { title: B("Tell Odelia what you need", "告诉 Odelia 您要做什么"), text: B("Type or talk, in English or 中文. Plain words are fine.", "打字或说话，中文或英文都行，用大白话就可以。") },
  { title: B("She does the work", "她来办"), text: B("She finds every license, fills the government's own forms and tracks every deadline. You can watch her plan.", "她找出全部执照，填好政府的官方表格，盯住每个截止日期。您可以随时看她的进度。") },
  { title: B("You just tap Approve", "您只需点“批准”"), text: B("Nothing is filed, paid or sent until you say yes. That's the only thing she needs from you.", "未经您同意，任何申报、付款或发送都不会发生。她只需要您这一下。") },
];

function Picture({ i, zh }: { i: number; zh: boolean }) {
  if (i === 0) return (
    <div className="tour-pic">
      <div className="tour-ask"><span className="tour-bot"><AgentBot size={30} interactive={false} /></span><span className="tour-typed">{zh ? "我要在法拉盛开一家奶茶店" : "I'm opening a milk tea shop in Flushing"}</span><span className="tour-mic"><I.mic /></span></div>
    </div>
  );
  if (i === 1) return (
    <div className="tour-pic">
      <ol className="tour-plan">
        {[B("Find every license for Flushing", "找出法拉盛所需的全部执照"), B("Fill the city's food permit form", "填写市政府的餐饮许可表"), B("Add the deadlines", "添加截止日期")].map((s, k) => (
          <li key={k} className={k < 2 ? "done" : "now"}><span className="tick">{k < 2 ? <I.check /> : null}</span>{zh ? s.zh : s.en}</li>
        ))}
      </ol>
    </div>
  );
  return (
    <div className="tour-pic">
      <div className="tour-appr">
        <span><b>{zh ? "提交餐饮服务许可证" : "File the food service permit"}</b><small>{zh ? "纽约市卫生局，$280" : "NYC Health Department, $280"}</small></span>
        <span className="tour-btn">{zh ? "批准" : "Approve"}</span>
      </div>
    </div>
  );
}

export function Walkthrough() {
  const { lang, ask, ws } = useApp();
  // An application filled at sign-up and waiting for approval (src/plan/prefill.ts) is the tour's last card for real:
  // the tour waits, so the first tap is Approve. It opens on a later visit, or from Help.
  const firstWin = !!ws.firstPlan?.win && ws.approvals.some(a => a.app === ws.firstPlan?.win);
  const [open, setOpen] = useState(() => !tourSeen() && !/[?&]notour\b/.test(location.search) && !firstWin);
  const [i, setI] = useState(0);
  const zh = lang === "zh";
  useEffect(() => { const on = () => { setI(0); setOpen(true); }; window.addEventListener("placetta-tour", on); return () => window.removeEventListener("placetta-tour", on); }, []);
  if (!open) return null;
  const done = () => { try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked */ } setOpen(false); };
  const c = CARDS[i], last = i === CARDS.length - 1;
  return (
    <div className="scrim tour-scrim" role="dialog" aria-modal="true" aria-label={zh ? "使用导览" : "Quick tour"}>
      <div className="tour">
        <button type="button" className="tour-skip" onClick={done}>{zh ? "跳过" : "Skip"}</button>
        <Picture i={i} zh={zh} />
        <p className="tour-n">{zh ? `第 ${i + 1} 步，共 ${CARDS.length} 步` : `${i + 1} of ${CARDS.length}`}</p>
        <h2>{zh ? c.title.zh : c.title.en}</h2>
        <p className="tour-t">{zh ? c.text.zh : c.text.en}</p>
        <div className="tour-act">
          {i > 0 && <button type="button" className="sbtn quiet" onClick={() => setI(i - 1)}>{zh ? "上一步" : "Back"}</button>}
          {last
            ? <>
                <button type="button" className="sbtn line" onClick={done}>{zh ? "我先看看" : "I'll look around"}</button>
                <button type="button" className="sbtn ink big" onClick={() => { done(); ask(zh ? "我该从哪里开始？" : "Where do I start?"); }}>{zh ? "问 Odelia 从哪开始" : "Ask Odelia where to start"}</button>
              </>
            : <button type="button" className="sbtn ink big" onClick={() => setI(i + 1)}>{zh ? "下一步" : "Next"}</button>}
        </div>
      </div>
    </div>
  );
}
