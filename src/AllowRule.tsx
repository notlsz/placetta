import { useState, type MutableRefObject } from "react";
import { useApp } from "./ctx";
import { addRule, permissionOptions, secondStep } from "./autonomy";
import { audit, dropApproval } from "./core";
import { B, same } from "./bi";
import type { Approval } from "./model";
import { HOLD_MINUTES } from "./hold";
import "./controls.css";

/* On an approval card, for each kind of action it covers, the three answers Grok gives: Ask me (this time only, by
   approving), Always allow (a message's recipients, or the kinds of change held under Ask me first, added when the owner
   approves; never for a filing, a payment, a purchase or anything with a fee) and Never (a Never rule, and the card is
   set aside). Also says when a card goes out under a rule, needs a second owner under a business rule, is being filed
   under Autopilot, or why Autopilot left it for the owner (src/autopilot.ts). */
type Choice = "once" | "always" | "never";
export function AllowRule({ a, commit, onClose }: { a: Approval; commit: MutableRefObject<(() => void) | null>; onClose?: () => void }) {
  const { b, lang, ws, editWs, cloud } = useApp();
  const [pick, setPick] = useState<Record<number, Choice>>({});
  const zh = lang === "zh", owner = !cloud || cloud.owner;
  const opts = owner && !a.auto && !a.autopilot ? permissionOptions(a, ws) : [];
  commit.current = () => { opts.forEach((o, i) => { if (pick[i] === "always" && o.allow) editWs(addRule({ kind: "allow", action: o.action, target: o.allow.target }, cloud?.email)); }); };
  const nevers = opts.filter((_, i) => pick[i] === "never");
  const decline = () => {
    editWs(w => {
      let x = w;
      for (const o of nevers) x = addRule({ kind: "deny", action: o.action, target: o.deny.target }, cloud?.email)(x);
      return audit("you", B("Set it aside and said never again", "搁置并设为“绝不”"), a.title, same(nevers.map(o => o.deny.label.en).join("; ")))(dropApproval(a.id)(x));
    });
    onClose?.();
  };
  const me = cloud?.email ?? "you";
  const second = a.second ? secondStep(a, me) : null;
  return (
    <>
      {a.autopilot && <p className="ap-note">{zh ? `自动驾驶：这项申报通过了全部核对，正依据您的授权为您提交，无需再点。发出前 ${HOLD_MINUTES} 分钟内仍可撤销。` : `Autopilot: this filing passed every check and is being filed for you under your authorization, with no tap needed. You can undo it for ${HOLD_MINUTES} minutes before it leaves.`}</p>}
      {!a.autopilot && a.autopilotWhy && a.autopilotWhy.length > 0 && (
        <div className="ap-note waits"><b>{zh ? "自动驾驶没有自行提交这一项，原因是：" : "Autopilot didn't file this one on its own:"}</b>
          <ul>{a.autopilotWhy.map((w, i) => <li key={i}>{b(w)}</li>)}</ul></div>
      )}
      {a.auto && <p className="auto-note">{zh ? `按您的规则（${b(a.auto.label)}），这条消息无需再点即获批准，${HOLD_MINUTES} 分钟内仍可撤销。` : `Under your rule (${b(a.auto.label)}), this message is approved without another tap. You can still undo it for ${HOLD_MINUTES} minutes.`}</p>}
      {second && <p className="second-note">{second === "first"
        ? (zh ? "按您的业务规则，这一项需要两位所有者批准。您批准后，还需另一位所有者批准。" : "Under your business rule, two owners approve this. After you approve, another owner approves it too.")
        : (zh ? "您已批准。还需另一位所有者批准。" : "You approved it. Another owner approves it too.")}</p>}
      {opts.length > 0 && (
        <section className="allow-rule">
          <h3>{zh ? "下次怎么做" : "Next time"}</h3>
          {opts.map((o, i) => {
            const c = pick[i] ?? "once";
            const choices: [Choice, string][] = [["once", zh ? "先问我" : "Ask me"], ...(o.allow ? [["always", zh ? "始终允许" : "Always allow"] as [Choice, string]] : []), ["never", zh ? "绝不" : "Never"]];
            return (
              <div key={i} className="perm-row">
                <span className="perm-what"><b>{b(o.what)}</b>
                  <small>{c === "never"
                    ? (zh ? "Odelia 以后不再这样做，这张卡片也会搁置。" : "Odelia won't do this again, and this card is set aside.")
                    : c === "always"
                      ? (a.kind === "send"
                        ? (zh ? `以后只发给这些人的消息，在应用中无需您再批准，${HOLD_MINUTES} 分钟内仍可撤销。来自短信、电话或聊天的请求仍需批准。` : `Next time a message goes only to them, it's approved in the app without a card, with ${HOLD_MINUTES} minutes to undo it. Requests by text, call or chat still ask.`)
                        : (zh ? "以后这类更改直接进行，不再等您批准。提交、付款和任何收费的事项始终先问您。" : "Next time she makes this kind of change, it goes ahead without a card. Filing, paying and anything with a fee always ask."))
                      : (zh ? "批准只针对这一次，下次她还会先问您。" : "Approving covers this one time. Next time she asks again.")}</small>
                </span>
                <span className="seg sm" role="radiogroup" aria-label={b(o.what)}>
                  {choices.map(([v, label]) => <button key={v} type="button" role="radio" aria-checked={c === v} aria-pressed={c === v} onClick={() => setPick(p => ({ ...p, [i]: v }))}>{label}</button>)}
                </span>
              </div>
            );
          })}
          {nevers.length > 0 && <div className="perm-act"><button type="button" className="sbtn warm" onClick={decline}>{zh ? "不做这一项" : "Don't do this"}</button></div>}
          <p className="note">{zh ? "可随时在“设置 > Odelia”中删除规则。" : "Remove a rule any time in Settings, Odelia."}</p>
        </section>
      )}
    </>
  );
}
