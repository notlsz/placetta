import { useState, type MutableRefObject } from "react";
import { useApp } from "./ctx";
import { addRule, allowOptions, secondStep } from "./autonomy";
import type { Approval } from "./model";
import { HOLD_MINUTES } from "./hold";
import "./controls.css";

/* On an approval card: "Always allow" for what the card covers (a message's recipients, or the kinds of change held
   under Ask me first), added when the owner approves. Never offered for a filing, a payment, a purchase or anything
   with a fee. Also says when a card goes out under a rule, needs a second owner under a business rule, is being filed
   under Autopilot, or why Autopilot left it for the owner (src/autopilot.ts). */
export function AllowRule({ a, commit }: { a: Approval; commit: MutableRefObject<(() => void) | null> }) {
  const { b, lang, ws, editWs, cloud } = useApp();
  const [on, setOn] = useState<number[]>([]);
  const zh = lang === "zh", owner = !cloud || cloud.owner;
  const opts = owner && !a.auto ? allowOptions(a, ws) : [];
  commit.current = () => { for (const i of on) if (opts[i]) editWs(addRule({ kind: "allow", action: opts[i].action, target: opts[i].target }, cloud?.email)); };
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
          <h3>{zh ? "始终允许" : "Always allow"}</h3>
          {opts.map((o, i) => (
            <label key={i}>
              <input type="checkbox" checked={on.includes(i)} onChange={e => setOn(v => (e.target.checked ? [...v, i] : v.filter(x => x !== i)))} />
              <span><b>{b(o.label)}</b>
                <small>{a.kind === "send"
                  ? (zh ? `以后只发给这些人的消息，在应用中无需您再批准，${HOLD_MINUTES} 分钟内仍可撤销。来自短信、电话或聊天的请求仍需批准。` : `Next time a message goes only to them, it's approved in the app without a card, with ${HOLD_MINUTES} minutes to undo it. Requests by text, call or chat still ask.`)
                  : (zh ? "以后这类更改直接进行，不再等您批准。提交、付款和任何收费的事项始终先问您。" : "Next time she makes this kind of change, it goes ahead without a card. Filing, paying and anything with a fee always ask.")}</small>
              </span>
            </label>
          ))}
          <p className="note">{zh ? "可随时在“设置 > Odelia”中删除。" : "Remove it any time in Settings, Odelia."}</p>
        </section>
      )}
    </>
  );
}
