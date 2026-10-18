import { useState } from "react";
import { useApp } from "../ctx";
import * as api from "./api";
import { Pill } from "../ui";

/* A customer asked for a person (src/AskPerson.tsx): the team reads the question and what they were looking at, and
   replies. The reply goes to the customer's Updates (answer_person in the database) and closes the task. */

type Asked = { question?: string; context?: { job?: { title?: string; status?: string; waiting_on?: string; steps?: string[] }; asked?: string; last_reply?: string } };

export function AskReply({ t, onDone }: { t: api.TeamTask; onDone: (id: string) => void }) {
  const { lang, say } = useApp();
  const zh = lang === "zh";
  const d = (t.detail ?? {}) as Asked, job = d.context?.job;
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.answerPerson(t.id, reply.trim()); onDone(t.id); say(zh ? "已回复，客户会在“动态”中看到。" : "Replied. The customer sees it in Updates."); }
    catch (e) { say((e as api.ApiError).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="ask-reply">
      <p className="ar-q">{d.question}</p>
      {job?.title && <p className="note">{zh ? "工作：" : "Job: "}{job.title}{job.waiting_on ? (zh ? `，等待：${job.waiting_on}` : `, waiting on: ${job.waiting_on}`) : ""}</p>}
      {d.context?.asked && <p className="note">{zh ? "问 Odelia：" : "Asked Odelia: "}{d.context.asked}</p>}
      {d.context?.last_reply && <p className="note">{zh ? "Odelia 回答：" : "Odelia said: "}{d.context.last_reply}</p>}
      <textarea rows={3} value={reply} onChange={e => setReply(e.target.value)} placeholder={zh ? "写给客户的回复" : "Your reply to the customer"} aria-label={zh ? "回复" : "Reply"} />
      <Pill sm kind="ink" disabled={busy || reply.trim().length < 2} onClick={() => void send()}>{zh ? "回复" : "Reply"}</Pill>
    </div>
  );
}
