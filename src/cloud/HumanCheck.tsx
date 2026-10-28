import { useState } from "react";
import { useApp } from "../ctx";
import { I } from "../ui";
import * as api from "./api";

/* A human check (a visible CAPTCHA) the portal worker gave the team (20261102090200_human_checks.sql). One tap opens the
   worker's live view of that one page, with the owner's numbers and saved login covered; the owner's audit trail
   records who opened it. Once it's solved, Odelia carries on by herself. Nobody here? It goes to the owner on its own
   (15 minutes in the team's hours, at once outside them), or now with "Give to the owner". */

type Detail = { human_check_id?: string; escalate_at?: string };

export function HumanCheckActions({ t, onDone }: { t: api.TeamTask; onDone: (id: string) => void }) {
  const { lang, say } = useApp();
  const zh = lang === "zh";
  const d = (t.detail ?? {}) as Detail;
  const [busy, setBusy] = useState(false);
  if (!d.human_check_id) return null;
  const id = d.human_check_id;
  const at = d.escalate_at ? new Date(d.escalate_at).toLocaleTimeString(zh ? "zh-CN" : "en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const open = async () => {
    // the tab opens on the tap (so no blocker stops it), then goes to the view once the audit row is written
    const w = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const url = await api.takeHumanCheck(id);
      if (w) { w.opener = null; w.location.href = url; } else window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      w?.close();
      say((e as api.ApiError).message);
    } finally { setBusy(false); }
  };
  const pass = async () => {
    setBusy(true);
    try {
      await api.passHumanCheck(id);
      onDone(t.id);
      say(zh ? "已交给客户，客户点一下即可打开。" : "Given to the owner. One tap opens it for them.");
    } catch (e) { say((e as api.ApiError).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="ask-reply">
      <p className="note">{zh
        ? "只完成这一页上的验证码。客户的号码和保存的登录信息已遮住，无法输入。打开记录会写入客户的审计记录。"
        : "Solve the CAPTCHA on that one page only. The owner's numbers and saved login are covered and closed to typing. Opening it goes in the owner's audit trail."}
        {at ? (zh ? ` 若无人打开，${at} 交给客户。` : ` If nobody opens it, it goes to the owner at ${at}.`) : ""}</p>
      <span className="q-line">
        <button type="button" className="pill ink sm" disabled={busy} onClick={() => void open()}>{zh ? "打开实时浏览器" : "Open live browser"}<I.ext /></button>
        <button type="button" className="pill quiet sm" disabled={busy} onClick={() => void pass()}>{zh ? "交给客户" : "Give to the owner"}</button>
      </span>
    </div>
  );
}
