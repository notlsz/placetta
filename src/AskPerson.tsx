import { useState } from "react";
import { useApp } from "./ctx";
import { B } from "./bi";
import type { Job } from "./jobs";
import { I, Modal } from "./ui";

/* Ask a person. Most AI products only ever answer with the bot; here a person on the Placetta team is one tap away,
   from Odelia's panel and from any job that's waiting or that the reviewer found short. The request goes to the team's
   queue with what the person was looking at (supabase/functions/team, ask), the reply comes back in Updates, and a
   workspace can ask three times a day. Owners and members alike. */

/** What a job looks like to the person who picks up the question. */
export const jobContext = (j: Job) => ({
  job: { id: j.id, title: j.title.en, status: j.status, waiting_on: j.waiting?.en, steps: j.steps.map(s => `${s.done ? "[x]" : "[ ]"} ${s.title.en}`).slice(0, 12),
    checked: j.checked ? `${j.checked.passed} of ${j.checked.of}` : undefined },
});

export function AskPerson({ context, compact }: { context: () => Record<string, unknown>; compact?: boolean }) {
  const { b, lang } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={"ask-person" + (compact ? " compact" : "")} onClick={() => setOpen(true)} title={b(B("Ask a person on the Placetta team", "请快哉团队的工作人员协助"))}>
        <I.user /><span>{lang === "zh" ? "找真人" : "Ask a person"}</span>
      </button>
      {open && <AskSheet context={context()} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The sheet itself, opened from the AskPerson button or from Odelia's "…" and ⌘K (src/AgentPanel.tsx). */
export function AskSheet({ context, onClose }: { context: Record<string, unknown>; onClose: () => void }) {
  const { b, lang, cloud } = useApp();
  const zh = lang === "zh";
  const [q, setQ] = useState("");
  const [state, setState] = useState<"write" | "sending" | "sent">("write");
  const job = (context.job ?? null) as { title?: string; waiting_on?: string } | null;
  const attached = job?.title
    ? B(`The job "${job.title}", its steps${job.waiting_on ? " and what it's waiting on" : ""}`, `这项工作“${job.title}”、它的步骤${job.waiting_on ? "和正在等待的内容" : ""}`)
    : context.last_reply ? B("Your last message to Odelia and her answer", "您发给 Odelia 的上一条消息和她的回答") : B("The page you're on", "您所在的页面");
  const send = async () => {
    if (q.trim().length < 2) return;
    setState("sending");
    const ok = cloud ? await cloud.askPerson(q.trim(), context) : true;
    setState(ok ? "sent" : "write");
  };
  return (
    <Modal label={b(B("Ask a person", "找真人"))} onClose={onClose}>
      <header className="m-h">
        <span className="m-eyebrow"><I.user />{b(B("The Placetta team", "快哉团队"))}</span>
        <h2>{b(B("Ask a person", "找真人协助"))}</h2>
        <p>{b(B("A person on the Placetta team reads this and replies in Updates, usually within one business day. Odelia keeps working meanwhile.", "快哉团队的工作人员会阅读并在“动态”中回复，通常在一个工作日内。在此期间 Odelia 会继续工作。"))}</p>
        <button type="button" className="icbtn close" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><I.x /></button>
      </header>
      {state === "sent" ? (
        <div className="m-body ask-done">
          <p className="ask-ok"><I.check /><b>{b(B("Sent to the Placetta team.", "已发给快哉团队。"))}</b></p>
          <p>{cloud ? b(B("A person replies in Updates, usually within one business day.", "工作人员会在“动态”中回复，通常在一个工作日内。"))
            : b(B("This is the sample, so nobody receives it. In your account a person on the Placetta team replies in Updates.", "这是示例，不会真的发出。在您的账户中，快哉团队的工作人员会在“动态”中回复。"))}</p>
        </div>
      ) : (
        <div className="m-body">
          <label className="ask-q">
            <span>{b(B("What do you need help with?", "需要什么帮助？"))}</span>
            <textarea rows={4} value={q} maxLength={2000} autoFocus onChange={e => setQ(e.target.value)}
              placeholder={b(B("For example: the county sent back the plan check and I don't understand what they want.", "例如：县政府退回了图纸审查，我看不懂他们要什么。"))} />
          </label>
          <p className="note ask-att"><I.clip />{b(B(`Sent with it: ${attached.en}.`, `随附：${attached.zh}。`))}</p>
          <p className="note">{b(B("Up to three requests a day for this workspace.", "每个工作区每天最多三次。"))}</p>
        </div>
      )}
      <footer className="m-f"><div className="m-btns">
        {state === "sent"
          ? <button type="button" className="pill ink" onClick={onClose}>{b(B("Done", "完成"))}</button>
          : <>
              <button type="button" className="pill quiet" onClick={onClose}>{b(B("Cancel", "取消"))}</button>
              <button type="button" className="pill ink" disabled={q.trim().length < 2 || state === "sending"} onClick={() => void send()}>{b(B("Send to a person", "发给工作人员"))}</button>
            </>}
      </div></footer>
    </Modal>
  );
}
