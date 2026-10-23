import { useEffect, useState } from "react";
import { GateBot } from "../Bot";
import { B, type Bi } from "../model";
import type { Lang } from "../i18n";
import * as api from "./api";

/* The consent screen for an AI assistant signing in to Placetta (supabase/functions/mcp/oauth.ts): Claude's connector
   directory and ChatGPT apps send the person here. They see which assistant asks, where they go back to (the MCP
   authorization spec asks for the redirect's host on the screen, with a warning for a program on this computer), pick
   the workspace and what it may read, and allow or refuse. The database makes the code (mcp_oauth_approve) only for
   an owner or admin of that workspace, and only for a redirect the assistant registered. */

const KEY = "placetta-mcp-auth";
const SCOPES: { id: api.McpScope; label: Bi }[] = [
  { id: "status", label: B("Compliance status of each store", "每家门店的合规状态") },
  { id: "deadlines", label: B("Upcoming deadlines", "即将到期的期限") },
  { id: "readiness", label: B("Store readiness", "门店就绪度") },
  { id: "plan", label: B("Permit plan previews", "许可规划预览") },
  { id: "filings", label: B("Filing status", "申报进度") },
];

const decode = (s: string): api.McpAuthRequest | null => {
  try {
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
    const str = (k: string) => (typeof o?.[k] === "string" ? o[k] as string : "");
    if (!str("client_id") || !/^https?:\/\//.test(str("redirect_uri")) || !/^[A-Za-z0-9_-]{43}$/.test(str("code_challenge"))) return null;
    return { client_id: str("client_id"), redirect_uri: str("redirect_uri"), scope: str("scope"), state: str("state"), code_challenge: str("code_challenge"), resource: str("resource"), iss: str("iss") };
  } catch { return null; }
};

/** Keep a sign-in request from the address (?mcp_auth=) through Placetta's own sign-in, which may leave the page. */
export function captureMcpAuth(): void {
  try {
    const q = new URLSearchParams(location.search), s = q.get("mcp_auth");
    if (s === null) return;
    q.delete("mcp_auth");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    const r = decode(s);
    if (r) sessionStorage.setItem(KEY, JSON.stringify({ r, at: Date.now() }));
  } catch { /* no address or storage */ }
}
/** The request waiting for the person, for 15 minutes. */
export function pendingMcpAuth(): api.McpAuthRequest | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    return v && Date.now() - v.at < 15 * 60_000 ? v.r as api.McpAuthRequest : null;
  } catch { return null; }
}
export const clearMcpAuth = () => { try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ } };

/** Back to the assistant with the code, or with access_denied; state and iss always (RFC 9207). */
export function backTo(r: api.McpAuthRequest, params: Record<string, string>): string {
  const u = new URL(r.redirect_uri);
  for (const [k, v] of Object.entries({ ...params, ...(r.state ? { state: r.state } : {}), ...(r.iss ? { iss: r.iss } : {}) })) u.searchParams.set(k, v);
  return u.toString();
}
const loopback = (u: string) => { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(u).hostname); } catch { return false; } };
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };

export function McpConsent({ lang, email, req, rows, start, onDone }: {
  lang: Lang; email: string; req: api.McpAuthRequest; rows: { id: string; name: string }[]; start: string; onDone: () => void;
}) {
  const L = (x: Bi) => x[lang];
  const zh = lang === "zh";
  const asked = SCOPES.filter(s => req.scope.split(" ").includes(s.id));
  const [client, setClient] = useState<{ name: string; redirect_ok: boolean } | null | undefined>(undefined);
  const [ws, setWs] = useState(rows.some(r => r.id === start) ? start : rows[0]?.id ?? "");
  const [scopes, setScopes] = useState<api.McpScope[]>(asked.map(s => s.id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { void api.mcpOauthClient(req.client_id, req.redirect_uri).then(setClient, () => setClient(null)); }, [req.client_id, req.redirect_uri]);
  const leave = (to: string) => { clearMcpAuth(); location.assign(to); };
  const allow = async () => {
    setBusy(true); setErr("");
    try { const code = await api.mcpOauthApprove(ws, req, scopes); leave(backTo(req, { code })); }
    catch (e) { setErr((e as api.ApiError).message || L(B("Something went wrong. Try again.", "出了点问题，请重试。"))); setBusy(false); }
  };
  const deny = () => leave(backTo(req, { error: "access_denied" }));

  if (client === undefined) return <div className="gate-card"><div className="gate-bot"><GateBot busy /></div><p className="gate-sub">{L(B("Checking the assistant…", "正在核对助手…"))}</p></div>;
  // an assistant Placetta doesn't know, or an address it didn't register: never send the person there
  if (!client || !client.redirect_ok) {
    return (
      <div className="gate-card">
        <h1>{L(B("This sign-in link isn't valid.", "这个登录链接无效。"))}</h1>
        <p className="gate-sub">{L(B("The assistant that sent you here isn't registered with Placetta for this address. Start the connection again from the assistant.", "把您带到这里的助手没有为这个地址在快哉登记。请从助手那里重新开始连接。"))}</p>
        <button type="button" className="sbtn ink" onClick={() => { clearMcpAuth(); onDone(); }}>{L(B("Open Placetta", "打开快哉"))}</button>
      </div>
    );
  }
  return (
    <div className="gate-card wide mcp-consent">
      <div className="gate-bot"><GateBot /></div>
      <h1>{zh ? `允许“${client.name}”读取快哉？` : `Allow ${client.name} to read Placetta?`}</h1>
      <p className="gate-sub">{L(B("It can read what you tick, in the workspace you choose. It can't change, file, pay or send anything. You can disconnect it at any time in Settings, AI assistants.",
        "它只能读取您勾选的内容，限于您选择的工作区。它不能修改、提交、付款或发送任何东西。您可以随时在“设置 > AI 助手”中断开。"))}</p>
      {!rows.length ? (
        <p className="gate-err" role="alert">{L(B("Only an owner or admin of a workspace can connect an assistant to it, and you aren't one in any workspace.", "只有工作区的所有者或管理员才能连接助手，而您在任何工作区都不是。"))}</p>
      ) : (
        <form className="onb" onSubmit={e => { e.preventDefault(); if (scopes.length && ws) void allow(); }}>
          {rows.length > 1 && (
            <label className="onb-f"><span>{L(B("Workspace", "工作区"))}</span>
              <select className="sel" value={ws} onChange={e => setWs(e.target.value)}>{rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            </label>
          )}
          <fieldset className="mcp-scopes"><legend>{L(B("What it may read", "可以读取的内容"))}</legend>
            {asked.map(s => (
              <label key={s.id} className="check"><input type="checkbox" checked={scopes.includes(s.id)} onChange={e => setScopes(e.target.checked ? [...scopes, s.id] : scopes.filter(x => x !== s.id))} /><span>{L(s.label)}</span></label>
            ))}
          </fieldset>
          <p className="sg-fine">{zh ? `允许后，您会回到 ${hostOf(req.redirect_uri)}。` : `After you choose, you go back to ${hostOf(req.redirect_uri)}.`}</p>
          {loopback(req.redirect_uri) && <p className="gate-err" role="note">{L(B("This sends you back to a program on this computer. Allow it only if you just started the connection from Claude Code or another app here.", "这会把您带回这台电脑上的程序。只有在您刚刚从 Claude Code 或这台电脑上的其他应用发起连接时才允许。"))}</p>}
          <div className="onb-act">
            <button type="button" className="sbtn quiet" disabled={busy} onClick={deny}>{L(B("Don't allow", "不允许"))}</button>
            <button type="submit" className="sbtn ink big" disabled={busy || !scopes.length || !ws}>{busy ? "…" : L(B("Allow", "允许"))}</button>
          </div>
        </form>
      )}
      {!rows.length && <div className="onb-act"><button type="button" className="sbtn ink" onClick={deny}>{L(B("Go back", "返回"))}</button></div>}
      {err && <p className="gate-err" role="alert">{err}</p>}
      <p className="onb-who">{L(B(`Signed in as ${email}`, `已登录 ${email}`))}</p>
    </div>
  );
}
