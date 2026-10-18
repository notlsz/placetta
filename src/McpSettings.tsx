import { useCallback, useEffect, useState } from "react";
import { useApp } from "./ctx";
import { I } from "./ui";
import { SetSheet } from "./SetUI";
import * as api from "./cloud/api";
import { MCP_CATALOG, type CatalogEntry } from "../supabase/functions/_shared/mcp_catalog";
import notionLogo from "./assets/integrations/notion.svg";
import airtableLogo from "./assets/integrations/airtable.svg";
import linearLogo from "./assets/integrations/linear.svg";
import asanaLogo from "./assets/integrations/asana.svg";
import hubspotLogo from "./assets/integrations/hubspot.svg";
import stripeLogo from "./assets/integrations/stripe.svg";
import zapierLogo from "./assets/integrations/zapier.svg";
import boxLogo from "./assets/integrations/box.svg";
import gdriveLogo from "./assets/integrations/drive.png";
import gmailLogo from "./assets/integrations/gmail.png";
import slackLogo from "./assets/integrations/slack.png";
import squareLogo from "./assets/integrations/square.svg";
import dropboxLogo from "./assets/integrations/dropbox.svg";

/* Settings, Integrations: connect any app through its own MCP server, the way Claude and Perplexity do. An owner pastes
   the server's address (and a token, if the app gave one) or picks an app from the list, signs in where the app asks,
   and sees every tool Odelia gets: the ones that only read run right away, the rest wait for an owner's approval, and
   any one can be switched off. The server side is supabase/functions/integrations/mcp.ts. */

type Tool = { name: string; title?: string; description: string; read_only: boolean; on: boolean };
type Server = { id: string; slug: string; name: string; url: string; catalog_id: string | null; auth: string; status: "connected" | "error"; error: string | null; tools: Tool[] };
type Pin = { locked: boolean; guard: (fn: () => void) => void };

const LOGOS: Record<string, string> = {
  notion: notionLogo, airtable: airtableLogo, linear: linearLogo, asana: asanaLogo, hubspot: hubspotLogo, stripe: stripeLogo, zapier: zapierLogo, box: boxLogo,
  gdrive: gdriveLogo, gmail: gmailLogo, slack: slackLogo, square: squareLogo, dropbox: dropboxLogo,
};
const GROUPS: { id: CatalogEntry["group"]; en: string; zh: string }[] = [
  { id: "docs", en: "Documents and records", zh: "文件与记录" },
  { id: "team", en: "Mail, chat and contacts", zh: "邮件、聊天和联系人" },
  { id: "tasks", en: "Tasks and automations", zh: "任务与自动化" },
  { id: "money", en: "Sales and payments", zh: "销售与收款" },
];

const Logo = ({ src }: { src?: string }) => <span className={"sg-logo" + (src === notionLogo || src === squareLogo ? " mono" : "")} aria-hidden="true">{src ? <img src={src} alt="" /> : <I.plug />}</span>;
const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };

export function McpConnectors({ pin }: { pin: Pin }) {
  const { lang, cloud, say } = useApp();
  const zh = lang === "zh";
  const owner = !!cloud?.owner;
  const [servers, setServers] = useState<Server[]>([]);
  const [ready, setReady] = useState<Record<string, boolean> | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<{ url: string; name: string; token: string; hint?: string } | null>(null);
  const wsId = cloud?.wsId ?? "";

  const tell = (e: unknown) => { const x = e as api.ApiError; say((zh && x.message_zh) || x.message || (zh ? "出了点问题，请重试。" : "Something went wrong. Try again.")); };
  const load = useCallback(async () => {
    if (!wsId) return;
    // an answer without the list (an older server, or the preview's stand-in backend) is nothing connected, not a crash
    try { setServers((await api.integration<{ servers?: Server[] }>(wsId, "mcp_list")).servers ?? []); } catch { /* shown as nothing connected */ }
    try { setReady((await api.integration<{ catalog?: Record<string, boolean> }>(wsId, "mcp_available")).catalog ?? {}); } catch { setReady({}); }
  }, [wsId]);
  useEffect(() => { void load(); }, [load]);
  const demo = () => say(zh ? "登录您的快哉账户后即可连接。" : "Sign in to your Placetta account to connect.");
  const guarded = (fn: () => void) => () => (cloud ? pin.guard(fn) : demo());

  /** Connect: either it's connected now, or the app's sign-in page opens and the app comes back here to finish. */
  const connect = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    try {
      const r = await api.integration<{ server?: Server; auth_url?: string }>(wsId, "mcp_connect", { ...body, return_to: window.location.href });
      if (r.auth_url) { window.location.href = r.auth_url; return; }
      if (r.server) {
        const n = r.server.tools.length;
        say(zh ? `已连接${r.server.name}。Odelia 现在可以使用其中 ${n} 个工具。` : `${r.server.name} is connected. Odelia can use ${n} of its tools.`);
        setForm(null); setShown(r.server.id);
      }
      await load();
    } catch (e) { tell(e); }
    setBusy(null);
  };
  const act = async (key: string, action: string, body: Record<string, unknown>, done?: string) => {
    setBusy(key);
    try { await api.integration(wsId, action, body); if (done) say(done); await load(); } catch (e) { tell(e); }
    setBusy(null);
  };

  const byCatalog = (id: string) => servers.find(s => s.catalog_id === id);
  const srv = servers.find(s => s.id === shown);
  return (
    <div className="sg-sub mcp">
      <h3>{zh ? "连接任何应用（MCP）" : "Connect any app (MCP)"}</h3>
      <p className="sg-note">{zh
        ? "粘贴任何应用的 MCP 服务器地址，或从下方选一个。Odelia 只读的操作会直接执行；任何会更改内容的操作，都要等所有者在这里批准后才会执行一次。"
        : "Paste the address of any app's MCP server, or pick one below. What only reads runs right away; anything that changes something in the app runs once, only after an owner approves it here."}</p>
      <ul className="sg-list">
        {servers.map(s => {
          const reads = s.tools.filter(t => t.read_only).length, off = s.tools.filter(t => !t.on).length;
          const summary = zh
            ? `${host(s.url)}，${s.tools.length} 个工具，其中 ${reads} 个只读${off ? `，已关闭 ${off} 个` : ""}`
            : `${host(s.url)}, ${s.tools.length} tools, ${reads} read only${off ? `, ${off} off` : ""}`;
          return (
            <li key={s.id} className="sg-row">
              <Logo src={s.catalog_id ? LOGOS[s.catalog_id] : undefined} />
              <span className="sg-tx"><b>{s.name}</b><small>{summary}</small></span>
              <span className="sg-r">
                {s.status === "error" ? <em className="bad">{zh ? "需要重新连接" : "Reconnect needed"}</em> : <em className="ok"><I.check />{zh ? "已连接" : "Connected"}</em>}
                <button type="button" className="sbtn quiet" aria-expanded={shown === s.id} onClick={() => setShown(x => (x === s.id ? null : s.id))}>{zh ? "工具" : "Tools"}</button>
                {owner && <button type="button" className={"sbtn quiet warm" + (pin.locked ? " pinned" : "")} disabled={busy === s.id} onClick={guarded(() => {
                  if (window.confirm(zh ? `断开${s.name}？Odelia 将不能再使用它的工具。` : `Disconnect ${s.name}? Odelia stops using its tools.`)) void act(s.id, "mcp_disconnect", { id: s.id }, zh ? `已断开${s.name}` : `Disconnected ${s.name}`);
                })}>{pin.locked && <I.lock />}{zh ? "断开" : "Disconnect"}</button>}
              </span>
            </li>
          );
        })}
        {owner || !cloud ? (
          <li key="mcp-open" className="sg-row">
            <Logo />
            <span className="sg-tx"><b>{zh ? "添加应用" : "Add an app"}</b><small>{zh ? "任何提供 MCP 服务器的应用" : "Any app that offers an MCP server"}</small></span>
            <span className="sg-r"><button type="button" className={"sbtn line" + (pin.locked && cloud ? " pinned" : "")} onClick={guarded(() => setForm({ url: "", name: "", token: "" }))}>{pin.locked && cloud && <I.lock />}{zh ? "添加" : "Add"}</button></span>
          </li>
        ) : <li key="mcp-owner" className="sg-row"><span className="sg-tx"><small>{zh ? "由所有者连接应用。" : "Owners connect apps."}</small></span></li>}
      </ul>

      {/* a server's tools, each with its switch, in a side sheet */}
      {srv && (
        <SetSheet title={srv.name} sub={host(srv.url)} onClose={() => setShown(null)} className="mcp-tools">
          {srv.error && <p className="bad">{srv.error}</p>}
          {srv.tools.length ? (
            <ul>
              {srv.tools.map(t => (
                <li key={t.name}>
                  <span className="mcp-t"><b>{t.title || t.name}</b>{t.description && <small>{t.description}</small>}</span>
                  <em className={"mcp-tag" + (t.read_only ? " read" : " ask")}>{t.read_only ? (zh ? "只读" : "Reads only") : (zh ? "需要批准" : "Needs approval")}</em>
                  <label className="switch" title={owner ? undefined : (zh ? "由所有者设置" : "Owners set this")}>
                    <input type="checkbox" checked={t.on} disabled={!owner || busy === `${srv.id}:${t.name}`} aria-label={zh ? `允许 Odelia 使用 ${t.title || t.name}` : `Let Odelia use ${t.title || t.name}`}
                      onChange={e => { const on = e.target.checked; pin.guard(() => void act(`${srv.id}:${t.name}`, "mcp_tool", { id: srv.id, tool: t.name, on })); }} />
                    <i />
                  </label>
                </li>
              ))}
            </ul>
          ) : <p className="sg-empty">{zh ? "这个应用没有列出任何工具。" : "This app didn't list any tools."}</p>}
          {owner && <p><button type="button" className="linkish" disabled={busy === srv.id} onClick={guarded(() => void act(srv.id, "mcp_refresh", { id: srv.id }, zh ? "工具列表已更新" : "Tool list updated"))}>{zh ? "重新获取工具列表" : "Get the tool list again"}</button></p>}
        </SetSheet>
      )}
      {/* connecting by address (and a token, if the app gave one) */}
      {form && (owner || !cloud) && (
        <SetSheet title={form.name ? (zh ? `连接${form.name}` : `Connect ${form.name}`) : (zh ? "添加应用" : "Add an app")} onClose={() => setForm(null)}>
          <p>{form.hint ?? (zh ? "粘贴应用提供的 MCP 服务器地址（以 https:// 开头）。如果应用给了访问令牌，也一并粘贴；否则会打开该应用的登录页面。" : "Paste the MCP server address the app gives you (it starts with https://). If the app gave you an access token, paste it too; otherwise its sign-in page opens.")}</p>
          <form className="sst-form" onSubmit={e => { e.preventDefault(); if (!cloud) { demo(); return; } pin.guard(() => void connect("form", { url: form.url.trim(), name: form.name.trim() || undefined, token: form.token.trim() || undefined })); }}>
            <input type="url" required autoFocus value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://mcp.example.com/mcp" aria-label={zh ? "服务器地址" : "Server address"} spellCheck={false} autoComplete="off" />
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={zh ? "名称（可选）" : "Name (optional)"} aria-label={zh ? "名称" : "Name"} maxLength={60} autoComplete="off" />
            <input type="password" value={form.token} onChange={e => setForm({ ...form, token: e.target.value })} placeholder={zh ? "访问令牌（可选）" : "Access token (optional)"} aria-label={zh ? "访问令牌" : "Access token"} autoComplete="off" />
            <p className="sg-fine">{zh ? "快哉只连接公共互联网上使用 https 的地址。令牌和登录信息加密保存在保险库中，随时可以断开。" : "Placetta only connects to https addresses on the public internet. Tokens and sign-ins are kept encrypted in a vault, and you can disconnect any time."}</p>
            <div className="sst-act">
              <button type="button" className="sbtn quiet" onClick={() => setForm(null)}>{zh ? "取消" : "Cancel"}</button>
              <button type="submit" className="sbtn ink" disabled={busy === "form" || !form.url.trim()}>{busy === "form" ? (zh ? "正在连接…" : "Connecting...") : (zh ? "连接" : "Connect")}</button>
            </div>
          </form>
        </SetSheet>
      )}

      {GROUPS.map(g => (
        <div key={g.id} className="sg-sub">
          <h3>{zh ? g.zh : g.en}</h3>
          <ul className="sg-list">
            {MCP_CATALOG.filter(e => e.group === g.id).map(e => {
              const have = byCatalog(e.id);
              const open = !cloud || !ready || ready[e.id] !== false;
              let right;
              if (have) right = have.status === "error" && owner
                ? <button type="button" className="sbtn line" disabled={busy === e.id} onClick={guarded(() => void connect(e.id, { catalog_id: e.id }))}>{zh ? "重新连接" : "Reconnect"}</button>
                : <em className="ok"><I.check />{zh ? "已连接" : "Connected"}</em>;
              else if (cloud && !owner) right = <em className="lock">{zh ? "由所有者连接" : "Owners connect"}</em>;
              else if (!open && !e.token) right = <em className="lock">{zh ? "即将开放" : "Opens soon"}</em>;
              else right = <>
                {e.token && <button type="button" className="sbtn quiet" onClick={guarded(() => setForm({ url: e.url, name: e.name, token: "", hint: zh ? e.token!.zh : e.token!.en }))}>{zh ? "用令牌" : "Use a token"}</button>}
                {open && <button type="button" className={"sbtn line" + (pin.locked && cloud ? " pinned" : "")} disabled={busy === e.id} onClick={guarded(() => void connect(e.id, { catalog_id: e.id }))}>{pin.locked && cloud && <I.lock />}{busy === e.id ? (zh ? "正在连接…" : "Connecting...") : (zh ? "连接" : "Connect")}</button>}
              </>;
              return (
                <li key={e.id} className="sg-row">
                  <Logo src={LOGOS[e.id]} />
                  <span className="sg-tx"><b>{zh && e.zh ? e.zh : e.name}</b><small>{zh ? e.use.zh : e.use.en}</small></span>
                  <span className="sg-r">{right}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
