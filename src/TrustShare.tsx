import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./ctx";
import { SetSheet } from "./SetUI";
import { daysFromNow } from "./time";
import * as tapi from "./cloud/trustApi";
import { DAYS_CHOICES, headline, requestPrompt, SHOW_DEFAULT, SHOW_KEYS, SHOW_WORDS, trustPath, trustSnapshot, trustView, type TrustShow } from "./trust";
import { TrustPage } from "./TrustPage";
import "./trust.css";

/* Status pages, the owner's side (Stores, "Status pages"): share a store's licenses in good standing with a landlord,
   franchisor, insurer, lender or delivery platform. Pick who it's for, what shows and for how long; the link shows once.
   See who opened it and when, change what shows (the page follows at once), revoke in one tap, and answer document
   requests. In the sample (no account), the preview shows exactly what a viewer would see. */

const origin = () => { try { return location.origin; } catch { return ""; } };
const fmt = (iso: string | null | undefined, zh: boolean) => {
  if (!iso) return "";
  const d = new Date(iso);
  return zh ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function Switches({ show, onChange, disabled }: { show: TrustShow; onChange: (s: TrustShow) => void; disabled?: boolean }) {
  const { b } = useApp();
  return (
    <div className="ts-switches" role="group">
      {SHOW_KEYS.map(k => (
        <label key={k} className="ts-switch">
          <input type="checkbox" checked={show[k]} disabled={disabled} onChange={e => onChange({ ...show, [k]: e.target.checked })} />
          <span>{b(SHOW_WORDS[k].label)}<small>{b(SHOW_WORDS[k].hint)}</small></span>
        </label>
      ))}
    </div>
  );
}

export function TrustShare({ onClose, store: first }: { onClose: () => void; store?: string }) {
  const { ws, lang, b, cloud, say, ask } = useApp();
  const zh = lang === "zh";
  const stores = ws.stores ?? [];
  const [store, setStore] = useState(first ?? stores[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [show, setShow] = useState<TrustShow>(SHOW_DEFAULT);
  const [days, setDays] = useState<number>(90);
  const [links, setLinks] = useState<tapi.TrustLink[] | null>(null);
  const [reqs, setReqs] = useState<tapi.TrustRequest[]>([]);
  const [made, setMade] = useState<{ url: string; prefix: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const live = !!cloud;
  const owner = !!cloud?.owner;
  const today = daysFromNow(0);
  const snap = useMemo(() => (store ? trustSnapshot(ws, store, today) : null), [ws, store, today]);
  const view = useMemo(() => (snap ? trustView(snap, show, today) : null), [snap, show, today]);

  const load = useCallback(async () => {
    if (!cloud) return;
    try {
      setLinks(await tapi.trustList(cloud.wsId));
      if (cloud.owner) setReqs(await tapi.trustRequests(cloud.wsId));
    } catch { setLinks([]); }
  }, [cloud]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!cloud || !snap) return;
    setBusy(true); setErr("");
    try {
      const r = await tapi.trustCreate(cloud.wsId, store, label.trim(), show, days, snap);
      setMade({ url: origin() + trustPath(r.token), prefix: r.prefix });
      try { window.dispatchEvent(new Event("placetta:trust")); } catch { /* fine */ }
      setLabel("");
      await load();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); say(zh ? "已复制链接" : "Link copied"); } catch { /* the link is on screen to copy by hand */ } };
  const mine = (links ?? []).filter(l => l.store_id === store);
  const active = (l: tapi.TrustLink) => !l.revoked_at && Date.parse(l.expires_at) > Date.now();
  const storeName = stores.find(s => s.id === store)?.name;

  return (
    <SetSheet title={zh ? "状态页" : "Status pages"} onClose={onClose} className="ts-body"
      sub={zh ? "房东、加盟总部、保险公司或贷款方问“执照是否齐全有效”时，发一个链接即可。只显示状态与到期日，不公开文件，可随时撤销。"
        : "When a landlord, franchisor, insurer or lender asks whether your licenses are in order, send a link. It shows status and expiry, never the documents, and you can revoke it any time."}>
      {stores.length > 1 && (
        <label className="ts-field">{zh ? "门店" : "Store"}
          <select value={store} onChange={e => { setStore(e.target.value); setMade(null); }}>{stores.map(s => <option key={s.id} value={s.id}>{b(s.name)}</option>)}</select>
        </label>
      )}
      {!stores.length && <p>{zh ? "先添加一家门店，才能共享它的状态页。" : "Add a store first; a status page is for one store."}</p>}

      {made && (
        <div className="ts-new" role="status">
          <b>{zh ? "链接已生成。只显示这一次，请现在复制。" : "Your link is ready. It shows only this once, so copy it now."}</b>
          <code>{made.url}</code>
          <div className="ts-acts">
            <button type="button" className="pill ink sm" onClick={() => copy(made.url)}>{zh ? "复制链接" : "Copy link"}</button>
            <button type="button" className="pill quiet sm" onClick={() => ask(zh ? `起草一封给对方的简短邮件，附上${storeName ? b(storeName) : "门店"}的状态页链接：${made.url}。说明页面显示执照状态和到期日，文件需另行申请。给我批准后再发。`
              : `Draft a short email sharing the status page for ${storeName ? b(storeName) : "our store"}: ${made.url}. Say it shows each license's status and expiry, and that documents are available on request. Show it to me to approve before it goes.`)}>{zh ? "让 Odelia 起草邮件" : "Have Odelia draft the email"}</button>
          </div>
        </div>
      )}

      {stores.length > 0 && (
        <section className="ts-sec">
          <h3>{zh ? "新建链接" : "New link"}</h3>
          <div className="ts-form">
            <label className="ts-field">{zh ? "给谁（只有您能看到）" : "Who it's for (only you see this)"}
              <input type="text" maxLength={80} value={label} onChange={e => setLabel(e.target.value)} placeholder={zh ? "例如：房东 Westfield" : "For example: Landlord, Westfield"} />
            </label>
            <Switches show={show} onChange={setShow} />
            <div className="ts-field"><span>{zh ? "有效期" : "Lasts"}</span>
              <div className="ts-days" role="group">{DAYS_CHOICES.map(d => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{zh ? `${d} 天` : `${d} days`}</button>)}</div>
            </div>
            {err && <p className="tp-err" role="alert">{err}</p>}
            {live
              ? <div className="ts-acts"><button type="button" className="pill ink sm" disabled={!owner || busy || !snap} onClick={create}>{busy ? (zh ? "正在生成" : "Making the link") : (zh ? "生成链接" : "Make the link")}</button>
                  {!owner && <small>{zh ? "只有所有者可以共享状态页。" : "Only an owner can share a status page."}</small>}</div>
              : <small>{zh ? "示例中不生成真实链接。登录后即可共享；下方预览就是对方看到的样子。" : "The sample doesn't make real links. Sign in to share one; the preview below is exactly what they'd see."}</small>}
          </div>
        </section>
      )}

      {live && mine.length > 0 && (
        <section className="ts-sec">
          <h3>{zh ? "已共享的链接" : "Links you've shared"}</h3>
          <ul className="ts-links">
            {mine.map(l => (
              <li key={l.id} className={"ts-link" + (active(l) ? "" : " off")}>
                <div className="ts-link-top"><b>{l.label || (zh ? "状态链接" : "Status link")}</b><small>{l.prefix}</small></div>
                <small>
                  {l.revoked_at ? (zh ? `已于 ${fmt(l.revoked_at, zh)} 撤销` : `Revoked ${fmt(l.revoked_at, zh)}`)
                    : !active(l) ? (zh ? `已于 ${fmt(l.expires_at, zh)} 过期` : `Expired ${fmt(l.expires_at, zh)}`)
                    : (zh ? `有效至 ${fmt(l.expires_at, zh)}；打开 ${l.views} 次${l.last_viewed_at ? `，最近 ${fmt(l.last_viewed_at, zh)}` : ""}` : `Active until ${fmt(l.expires_at, zh)}. Opened ${l.views} time${l.views === 1 ? "" : "s"}${l.last_viewed_at ? `, last ${fmt(l.last_viewed_at, zh)}` : ""}`)}
                </small>
                {active(l) && owner && (
                  <details>
                    <summary>{zh ? "显示内容" : "What it shows"}</summary>
                    <Switches show={l.show} onChange={async s => { try { await tapi.trustUpdate(l.id, s); await load(); say(zh ? "已更新，页面立即生效" : "Updated. The page follows now"); } catch (e) { say((e as Error).message); } }} />
                  </details>
                )}
                {active(l) && owner && <div className="ts-acts"><button type="button" className="pill quiet sm" onClick={async () => { try { await tapi.trustRevoke(l.id); await load(); say(zh ? "已撤销，链接立即失效" : "Revoked. The link stops working now"); } catch (e) { say((e as Error).message); } }}>{zh ? "撤销" : "Revoke"}</button></div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {live && owner && reqs.filter(r => r.status === "open").length > 0 && (
        <section className="ts-sec">
          <h3>{zh ? "文件申请" : "Document requests"}</h3>
          <p>{zh ? "页面不会自动发送任何文件。由您决定发送或拒绝。" : "Nothing is sent on its own. You decide to send or decline."}</p>
          {reqs.filter(r => r.status === "open").map(r => (
            <div key={r.id} className="ts-req">
              <b>{r.name}{r.org ? `, ${r.org}` : ""}</b>
              <small>{r.email}{r.note ? `: ${r.note}` : ""}</small>
              <div className="ts-acts">
                <button type="button" className="pill ink sm" onClick={async () => {
                  ask(requestPrompt(r, stores.find(s => s.id === mine.find(l => l.id === r.link_id)?.store_id)?.name, lang));
                  await tapi.trustRequestClose(r.id, "sent").catch(() => undefined); await load();
                }}>{zh ? "让 Odelia 准备回复" : "Have Odelia prepare the reply"}</button>
                <button type="button" className="pill quiet sm" onClick={async () => { await tapi.trustRequestClose(r.id, "declined").catch(() => undefined); await load(); }}>{zh ? "拒绝" : "Decline"}</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {view && (
        <section className="ts-sec">
          <h3>{zh ? "对方看到的样子" : "What they'll see"}</h3>
          <p>{headline(view.counts, lang)}</p>
          <div className="ts-preview"><TrustPage token={`sample-${store}`} lang={lang} preview={{ status: "ok", snapshot_at: new Date().toISOString(), expires_at: new Date(Date.now() + days * 864e5).toISOString(), ...view }} /></div>
        </section>
      )}
    </SetSheet>
  );
}

/** Mounted once in the app: while the workspace is open, keep every live link's page current: written again (cut to each link's choices by the
 *  database) a few seconds after the workspace changes, only when what a page holds changed. Members and owners only. */
export function TrustSync() {
  const { ws, cloud } = useApp();
  const sent = useRef<Record<string, string>>({});
  const stores = useRef<Set<string> | null>(null);
  const [tick, bump] = useState(0);
  useEffect(() => {
    const k = () => { stores.current = null; bump(n => n + 1); };
    window.addEventListener("placetta:trust", k);
    return () => window.removeEventListener("placetta:trust", k);
  }, []);
  useEffect(() => {
    if (!cloud || cloud.viewer) return;
    let stop = false;
    const t = setTimeout(async () => {
      try {
        if (!stores.current) stores.current = new Set((await tapi.trustList(cloud.wsId)).filter(l => !l.revoked_at && Date.parse(l.expires_at) > Date.now()).map(l => l.store_id));
        const today = daysFromNow(0);
        for (const id of stores.current) {
          if (stop) return;
          const snap = trustSnapshot(ws, id, today);
          if (!snap) continue;
          const key = JSON.stringify(snap);
          if (sent.current[id] === key) continue;
          await tapi.trustRefresh(cloud.wsId, id, snap);
          sent.current[id] = key;
        }
      } catch { /* the next change tries again */ }
    }, 4000);
    return () => { stop = true; clearTimeout(t); };
  }, [ws, cloud, tick]);
  return null;
}

