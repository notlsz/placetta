import { useEffect, useState } from "react";
import type { Bi } from "./bi";
import { SAMPLE } from "./model";
import { cloudConfigured } from "./cloud/api";
import { trustAsk, trustPage, type TrustPage as Page } from "./cloud/trustApi";
import { headline, SHOW_DEFAULT, STANDING_WORDS, trustSnapshot, trustView, type Standing, type TrustViewRow } from "./trust";
import { daysFromNow } from "./time";
import "./trust.css";

/* The status page a landlord, franchisor, insurer, lender or delivery platform opens from the owner's link
   (/app/trust/<token>). No sign-in. Status, agency and expiry as the owner allowed, never a document: a viewer can ask
   the owner for one when the owner turned requests on. In the sample (/app/trust/sample), the sample store's page. */

type Lang = "en" | "zh";
const firstLang = (): Lang => {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "zh" || q === "en") return q;
    return /^zh/i.test(navigator.language) ? "zh" : "en";
  } catch { return "en"; }
};

function day(iso: string | undefined | null, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return lang === "zh" ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The sample's page: the San Jose store, with its expiry dates and agency, as an owner's default choices show it. */
function samplePage(store?: string): Page {
  const today = daysFromNow(0);
  const id = store && (SAMPLE.stores ?? []).some(s => s.id === store) ? store : (SAMPLE.stores ?? [])[0]?.id ?? "";
  const snap = trustSnapshot(SAMPLE, id, today) ?? { rows: [] };
  return { status: "ok", snapshot_at: new Date().toISOString(), expires_at: new Date(Date.now() + 90 * 864e5).toISOString(), ...trustView(snap, SHOW_DEFAULT, today) };
}

const MARK: Record<Standing, string> = { good: "ok", renewing: "soon", expired: "bad", attention: "bad", pending: "wait", preparing: "wait" };

function Row({ r, lang }: { r: TrustViewRow; lang: Lang }) {
  const t = (x?: Bi) => (x ? x[lang] || x.en : "");
  return (
    <li className={"tp-row " + MARK[r.standing]}>
      <div className="tp-main">
        <b>{t(r.name)}</b>
        {r.agency && <span className="tp-agency">{r.source ? <a href={r.source} target="_blank" rel="noopener noreferrer">{t(r.agency)}</a> : t(r.agency)}</span>}
      </div>
      <div className="tp-state">
        <span className="tp-chip">{t(STANDING_WORDS[r.standing])}</span>
        <small>
          {[r.expires && (r.standing === "expired" ? (lang === "zh" ? `已于 ${day(r.expires, lang)} 过期` : `Expired ${day(r.expires, lang)}`) : (lang === "zh" ? `${day(r.expires, lang)} 到期` : `Expires ${day(r.expires, lang)}`)),
            r.number && (lang === "zh" ? `编号 ${r.number}` : `No. ${r.number}`),
            r.verified && (lang === "zh" ? `${day(r.verified, lang)} 核对机构记录` : `Agency record checked ${day(r.verified, lang)}`),
            r.proof && (lang === "zh" ? "有存档副本" : "Copy on file")].filter(Boolean).join(lang === "zh" ? "；" : "; ")}
        </small>
      </div>
    </li>
  );
}

function Ask({ token, lang }: { token: string; lang: Lang }) {
  const zh = lang === "zh";
  const [f, setF] = useState({ name: "", email: "", org: "", note: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  if (state === "sent") return <p className="tp-sent">{zh ? "已送达业主。是否发送文件由业主决定，会直接回复到您的邮箱。" : "Sent to the owner. They decide whether to share, and reply to your email directly."}</p>;
  return (
    <form className="tp-ask" onSubmit={async e => {
      e.preventDefault();
      if (token.startsWith("sample")) { setState("sent"); return; }
      setState("sending"); setErr("");
      try { const r = await trustAsk(token, f); setState(r.status === "ok" ? "sent" : "error"); if (r.status !== "ok") setErr(zh ? "此链接已失效。" : "This link is no longer active."); }
      catch (x) { setState("error"); setErr(/Too many/.test(String((x as Error).message)) ? (zh ? "请求过于频繁，请稍后再试。" : "Too many requests. Try again later.") : (zh ? "未能发送，请检查邮箱后重试。" : "Couldn't send. Check the email and try again.")); }
    }}>
      <h2>{zh ? "向业主申请文件" : "Ask the owner for documents"}</h2>
      <p>{zh ? "此页面不公开任何文件。您的申请会送到业主，由业主决定是否发送。" : "No document is published on this page. Your request goes to the owner, who decides whether to send it."}</p>
      <label>{zh ? "您的姓名" : "Your name"}<input required maxLength={120} value={f.name} onChange={set("name")} autoComplete="name" /></label>
      <label>{zh ? "邮箱" : "Email"}<input required type="email" maxLength={200} value={f.email} onChange={set("email")} autoComplete="email" /></label>
      <label>{zh ? "公司或机构" : "Company"}<input maxLength={120} value={f.org} onChange={set("org")} autoComplete="organization" /></label>
      <label>{zh ? "需要哪些文件" : "What you need"}<textarea maxLength={1000} rows={3} value={f.note} onChange={set("note")} placeholder={zh ? "例如：卫生许可证副本" : "For example: a copy of the health permit"} /></label>
      {err && <p className="tp-err" role="alert">{err}</p>}
      <button type="submit" className="tp-btn" disabled={state === "sending"}>{state === "sending" ? (zh ? "正在发送" : "Sending") : (zh ? "发送申请" : "Send request")}</button>
    </form>
  );
}

/** preview: the owner's own page in the sharing sheet, from their workspace and switches: nothing fetched, and the
 *  surrounding app's title, language and theme left alone. */
export function TrustPage({ token, preview, lang: asked }: { token: string; preview?: Page; lang?: Lang }) {
  const [lang, setLang] = useState<Lang>(() => asked ?? firstLang());
  const [page, setPage] = useState<Page | "loading" | "error" | "busy">(() => preview ?? (token.startsWith("sample") || !cloudConfigured ? samplePage(token.split("-").slice(1).join("-") || undefined) : "loading"));
  useEffect(() => { if (preview) setPage(preview); }, [preview]);
  useEffect(() => {
    if (preview) return;
    // the token never leaves in a Referer, and the page is never indexed
    for (const [n, c] of [["referrer", "no-referrer"], ["robots", "noindex, nofollow"]]) {
      const m = document.createElement("meta"); m.name = n; m.content = c; document.head.appendChild(m);
    }
    document.documentElement.dataset.theme = "light";
    if (page !== "loading") return;
    trustPage(token).then(setPage, (e: Error) => setPage(/Too many/.test(e.message) ? "busy" : "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { if (!preview) document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; }, [lang, preview]);
  const zh = lang === "zh";
  const t = (x?: Bi) => (x ? x[lang] || x.en : "");
  const ok = typeof page === "object" && page.status === "ok" ? page : null;
  useEffect(() => { if (!preview) document.title = ok ? `${t(ok.page.store)}, ${t(ok.page.business)}` : zh ? "状态页" : "Status page"; });
  return (
    <main className="tp" aria-label={preview ? (zh ? "状态页预览" : "Status page preview") : undefined}>
      <header className="tp-top">
        <span className="tp-brand">{zh ? "快哉 Placetta 状态页" : "Placetta status page"}</span>
        <div className="tp-lang" role="group" aria-label={zh ? "语言" : "Language"}>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
        </div>
      </header>
      {page === "loading" && <p className="tp-quiet" aria-live="polite">{zh ? "正在载入" : "Loading"}</p>}
      {page === "busy" && <p className="tp-quiet" role="alert">{zh ? "请求过于频繁，请一分钟后再试。" : "Too many requests. Try again in a minute."}</p>}
      {(page === "error" || (typeof page === "object" && page.status === "gone")) && (
        <section className="tp-gone">
          <h1>{zh ? "此链接已失效" : "This link is no longer active"}</h1>
          <p>{zh ? "业主可能已撤销或链接已过期。请向发送链接的人索取新链接。" : "The owner may have revoked it, or it expired. Ask whoever sent it for a new one."}</p>
        </section>
      )}
      {ok && (
        <>
          <section className="tp-head">
            <p className="tp-biz">{t(ok.page.business)}</p>
            <h1>{t(ok.page.store)}</h1>
            {ok.page.address && <p className="tp-addr">{ok.page.address}</p>}
            <p className={"tp-sum" + (ok.counts.attention ? " bad" : "")}>{headline(ok.counts, lang)}</p>
            {ok.counts.attention > 0 && <p className="tp-note">{zh ? `${ok.counts.attention} 项需要处理，详见下方。` : `${ok.counts.attention} need${ok.counts.attention === 1 ? "s" : ""} attention, shown below.`}</p>}
          </section>
          <ul className="tp-list">{ok.page.rows.map(r => <Row key={r.id} r={r} lang={lang} />)}</ul>
          <section className="tp-how">
            <h2>{zh ? "这些状态从哪里来" : "Where this comes from"}</h2>
            <p>{zh ? "状态来自业主在快哉的工作区，以及机构公开记录（如有）。到期状态按您打开页面的当天计算，因此过期的执照不会显示为有效。"
              : "Status comes from the owner's Placetta workspace and, where the agency publishes it, the agency's own record. Expiry is worked out on the day you open this page, so a lapsed license never shows as current."}</p>
            <p className="tp-quiet">{zh ? `更新于 ${day(ok.snapshot_at, lang)}；链接有效至 ${day(ok.expires_at, lang)}。` : `Updated ${day(ok.snapshot_at, lang)}. Link active until ${day(ok.expires_at, lang)}.`}</p>
          </section>
          {ok.requests && <Ask token={token} lang={lang} />}
        </>
      )}
      <footer className="tp-foot">{zh ? "快哉 Placetta 为门店办理、跟踪和续期执照与许可。此页面不构成法律意见。" : "Placetta files, tracks and renews licenses and permits for stores. This page is not legal advice."}</footer>
    </main>
  );
}
