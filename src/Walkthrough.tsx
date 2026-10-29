import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import { I } from "./ui";
import { AgentBot } from "./Bot";
import { isFirstRun } from "./firstRun";

/* The first minute: three cards, one idea each, a picture of the real thing on each. Anyone gets it, with no AI
   experience at all: say what you need, she does the work, you tap Approve. Shown once; Help, Take the tour, shows it
   again. Ends by handing them the one thing to do next. */

const KEY = "placetta-tour-1";
/* Skip or finish sticks. The tour once came back after Skip: in a browser that reads storage but refuses writes (a full
   quota, some private modes) the "seen" mark was never kept, so the next page load showed it again. Now the mark is kept
   in this tab's memory first (it holds across every page of the visit), then in localStorage, sessionStorage or a
   cookie, whichever takes it; any one of them counts as seen. With nowhere to read from at all, it counts as seen. */
let seenThisVisit = false;
const COOKIE = KEY + "=1";
export function tourSeen(): boolean {
  if (seenThisVisit) return true;
  let readable = false;
  try { if (localStorage.getItem(KEY) === "1") return true; readable = true; } catch { /* storage blocked */ }
  try { if (sessionStorage.getItem(KEY) === "1") return true; readable = true; } catch { /* storage blocked */ }
  try { if (document.cookie.split("; ").includes(COOKIE)) return true; readable = true; } catch { /* cookies blocked */ }
  return !readable;
}
function keepSeen() {
  seenThisVisit = true;
  try { localStorage.removeItem(KEY + "-at"); } catch { /* storage blocked */ }
  try { localStorage.setItem(KEY, "1"); if (localStorage.getItem(KEY) === "1") return; } catch { /* storage full or blocked */ }
  try { sessionStorage.setItem(KEY, "1"); if (sessionStorage.getItem(KEY) === "1") return; } catch { /* storage full or blocked */ }
  try { document.cookie = `${COOKIE}; max-age=31536000; path=/; samesite=lax`; } catch { /* cookies blocked */ }
}
export const replayTour = () => {
  seenThisVisit = false;
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
  try { document.cookie = `${KEY}=; max-age=0; path=/`; } catch { /* cookies blocked */ }
  window.dispatchEvent(new Event("placetta-tour"));
};

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
  // In the first run Home already leads with the plan and one button (src/FirstRun.tsx): nothing covers it, and the
  // tour waits for a later visit.
  const [open, setOpen] = useState(() => !tourSeen() && !/[?&]notour\b/.test(location.search) && !firstWin && !isFirstRun(ws));
  // On first load the tour floats near the top without a scrim, so the plan behind it stays in view and usable (the
  // 2026-10-23 review: "An onboarding modal covers the dashboard on first load"). Asked for again from Help, it opens
  // as a dialog, since the person asked to see it.
  const [floating, setFloating] = useState(true);
  // where it was left: closing the tab mid-tour comes back to the same card
  const [i, setIRaw] = useState(() => { try { return Math.min(CARDS.length - 1, Number(localStorage.getItem(KEY + "-at")) || 0); } catch { return 0; } });
  const setI = (n: number) => { setIRaw(n); try { localStorage.setItem(KEY + "-at", String(n)); } catch { /* storage blocked */ } };
  const zh = lang === "zh";
  useEffect(() => { const on = () => { setI(0); setFloating(false); setOpen(true); }; window.addEventListener("placetta-tour", on); return () => window.removeEventListener("placetta-tour", on); }, []);
  // Escape skips it too, and it sticks the same way
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { keepSeen(); setOpen(false); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open]);
  if (!open) return null;
  const done = () => { keepSeen(); setOpen(false); };
  const c = CARDS[i], last = i === CARDS.length - 1;
  return (
    <div className={floating ? "tour-float" : "scrim tour-scrim"} role="dialog" aria-modal={floating ? "false" : "true"} aria-label={zh ? "使用导览" : "Quick tour"}>
      <div className="tour">
        <button type="button" className="tour-skip" onClick={done} aria-label={zh ? "跳过导览" : "Skip the tour"}><span>{zh ? "跳过" : "Skip"}</span><I.x /></button>
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
