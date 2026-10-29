import { SkeletonRows } from "./Skeleton";
import { useEffect, useState } from "react";
import type { Bi } from "./bi";
import { useApp } from "./ctx";
import type { Application } from "./model";
import * as api from "./cloud/api";
import { filingDocs, proofCreate, proofList, proofLive, proofPage, proofRevoke, signedDoc, type ProofLink, type PublicProof } from "./cloud/proofApi";
import { DOC_ORDER, DOC_WORDS, PROOF_DAYS, SOURCE_WORDS, docKindOf, proofFacts, proofStrength, type DocKind } from "./proofFacts";
import { cloudConfigured } from "./cloud/api";
import { I } from "./ui";
import "./trust.css";

/* Proof of one filing (src/proofFacts.ts): in the application's sheet for the owner and the team, printable, and as a link
   that lasts 1 to 30 days for a landlord, franchisor or inspector (/app/proof/<token>). The store's whole list, with the
   QR code for the window, is the status page (src/TrustShare.tsx); this is the evidence behind one row of it. */

type Lang = "en" | "zh";
const dayOf = (iso: string, lang: Lang): string => {
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return lang === "zh" ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const both = (iso: string): Bi => ({ en: dayOf(iso, "en"), zh: dayOf(iso, "zh") });

/** Print only the proof: the page marks itself, prints, and clears the mark. */
function printProof() {
  document.body.classList.add("printing-proof");
  const done = () => { document.body.classList.remove("printing-proof"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
  window.setTimeout(done, 2000);
}

type Row = { id: string; name: string; path: string; kind: DocKind; at: string };

export function ProofPanel({ a, fallback }: { a: Application; fallback: React.ReactNode }) {
  const { b, lang, cloud, say } = useApp();
  const zh = lang === "zh";
  const f = cloud?.filings.find(x => x.app_id === a.id && x.status !== "canceled");
  const [docs, setDocs] = useState<Row[] | null>(null);
  const [tl, setTl] = useState<api.Timeline | null>(null);
  useEffect(() => {
    if (!f) return;
    let live = true;
    void Promise.all([filingDocs(f.id), api.filingTimeline(f.id).catch(() => null)]).then(([d, t]) => {
      if (!live) return;
      setTl(t);
      const formPath = f.payload.pdf_path ?? null, licensePath = t?.license?.path ?? null;
      setDocs(d.filter(x => x.source !== "customer" || x.path === formPath)
        .map(x => ({ id: x.id, name: x.name, path: x.path, at: x.created_at, kind: docKindOf({ name: x.name, path: x.path, mime: x.mime, source: x.source }, { formPath, licensePath }) }))
        .sort((p, q) => DOC_ORDER.indexOf(p.kind) - DOC_ORDER.indexOf(q.kind) || p.at.localeCompare(q.at)));
    });
    return () => { live = false; };
  }, [f?.id, f?.updated_at]);
  if (!f) return <>{fallback}</>;
  const facts = proofFacts({ ...f, license_expires: tl?.license?.expires ?? null }, both);
  const strength = proofStrength(f, !!docs?.some(d => d.kind === "receipt"));
  const open = async (d: Row) => { const u = await signedDoc(d.path); if (u) window.open(u, "_blank", "noopener,noreferrer"); else say(zh ? "无法打开这份文件。" : "Couldn't open that file."); };
  const events = tl?.events ?? [];
  return (
    <div className="proof" data-proof="">
      <div className="pf-head">
        <div className="pf-title">
          <h3>{zh ? "申报证明" : "Proof of filing"}</h3>
          <p className={"pf-strength " + strength.level}>{b(strength.say)}</p>
        </div>
        <button type="button" className="pill sm pf-print" onClick={printProof}><I.download />{zh ? "打印" : "Print"}</button>
      </div>
      <p className="pf-print-only">{b(a.name)}{a.agency ? `, ${b(a.agency)}` : ""}</p>
      <dl className="pf-facts">
        {facts.map(x => <div key={x.k}><dt>{b(x.label)}</dt><dd className={x.mono ? "mono" : undefined}>{b(x.value)}</dd></div>)}
      </dl>
      {docs && docs.length > 0 && (
        <section className="pf-sec">
          <h4>{zh ? "存档文件" : "Kept with it"}</h4>
          <ul className="pf-docs">
            {docs.map(d => (
              <li key={d.id}>
                <span className="pf-kind">{b(DOC_WORDS[d.kind])}</span>
                <span className="pf-name">{d.name}</span>
                <button type="button" className="pill sm" onClick={() => void open(d)}>{zh ? "打开" : "Open"}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {events.length > 0 && (
        <section className="pf-sec">
          <h4>{zh ? "每次状态变化及来源" : "Every status change, and where it came from"}</h4>
          <ol className="pf-events">
            {events.map((e, i) => (
              <li key={i}>
                <span className="pf-when">{dayOf(e.at, lang)}</span>
                <span className="pf-what">{b(e.title)}</span>
                <span className="pf-src">{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{b(SOURCE_WORDS[e.source] ?? { en: e.source, zh: e.source })}</a> : b(SOURCE_WORDS[e.source] ?? { en: e.source, zh: e.source })}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {tl?.tracking?.last_checked_at && <p className="pf-quiet">{zh ? `快哉最近一次核对机构记录：${dayOf(tl.tracking.last_checked_at, lang)}` : `Placetta last checked the agency's record ${dayOf(tl.tracking.last_checked_at, lang)}.`}</p>}
      {cloud?.owner && <ProofShare filing={f.id} />}
    </div>
  );
}

/** An owner's links to this proof: 1, 7 or 30 days, with or without the documents; each revocable. */
function ProofShare({ filing }: { filing: string }) {
  const { lang, cloud, say } = useApp();
  const zh = lang === "zh";
  const [links, setLinks] = useState<ProofLink[]>([]);
  const [days, setDays] = useState<number>(7);
  const [docs, setDocs] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => { if (cloud) void proofList(cloud.wsId).then(x => setLinks(x.filter(l => l.filing_id === filing && proofLive(l))), () => setLinks([])); };
  useEffect(load, [cloud?.wsId, filing]);
  if (!cloud) return null;
  const make = async () => {
    setBusy(true);
    try {
      const r = await proofCreate(cloud.wsId, filing, days, docs);
      const url = `${location.origin}/app/proof/${r.token}`;
      setMade(url);
      try { await navigator.clipboard.writeText(url); say(zh ? "链接已复制。只显示这一次。" : "Link copied. It's shown only this once."); } catch { /* shown below to copy by hand */ }
      load();
    } catch (e) { say((e as Error).message); }
    setBusy(false);
  };
  return (
    <section className="pf-sec pf-share">
      <h4>{zh ? "分享这份证明" : "Share this proof"}</h4>
      <p className="pf-quiet">{zh ? "给房东、加盟总部或检查员一个只读链接。到期或撤销后即失效。您上传的文件不会通过此链接分享。" : "A read-only link for a landlord, franchisor or inspector. It stops when it expires or you revoke it. Files you uploaded are never shared by it."}</p>
      <div className="pf-row">
        <div className="seg" role="group" aria-label={zh ? "有效期" : "Lasts"}>
          {PROOF_DAYS.map(d => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{zh ? `${d} 天` : `${d} day${d === 1 ? "" : "s"}`}</button>)}
        </div>
        <label className="pf-check"><input type="checkbox" checked={docs} onChange={e => setDocs(e.target.checked)} /><span>{zh ? "包括回执、机构页面和执照" : "Include receipts, agency pages and the license"}</span></label>
        <button type="button" className="pill ink sm" disabled={busy} onClick={() => void make()}>{zh ? "生成链接" : "Make a link"}</button>
      </div>
      {made && <p className="pf-made"><input readOnly value={made} onFocus={e => e.currentTarget.select()} aria-label={zh ? "新链接" : "New link"} /></p>}
      {links.length > 0 && (
        <ul className="pf-links">
          {links.map(l => (
            <li key={l.id}>
              <span className="mono">{l.prefix}</span>
              <span>{zh ? `${dayOf(l.expires_at, lang)} 到期${l.docs ? "，含文件" : ""}，打开 ${l.views} 次` : `Until ${dayOf(l.expires_at, lang)}${l.docs ? ", with documents" : ""}, opened ${l.views} time${l.views === 1 ? "" : "s"}`}</span>
              <button type="button" className="linkbtn" onClick={() => void proofRevoke(l.id).then(load, (e: Error) => say(e.message))}>{zh ? "撤销" : "Revoke"}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const firstLang = (): Lang => {
  try { const q = new URLSearchParams(location.search).get("lang"); if (q === "zh" || q === "en") return q; return /^zh/i.test(navigator.language) ? "zh" : "en"; }
  catch { return "en"; }
};

/** The shared proof: anyone with the link, no sign-in, never indexed, the token never in a Referer. */
export function ProofPage({ token, preview }: { token: string; preview?: PublicProof }) {
  const [lang, setLang] = useState<Lang>(firstLang);
  const [page, setPage] = useState<PublicProof | "loading" | "error" | "busy">(() => preview ?? (cloudConfigured ? "loading" : { status: "gone" }));
  useEffect(() => {
    if (preview) return;
    for (const [n, c] of [["referrer", "no-referrer"], ["robots", "noindex, nofollow"]]) { const m = document.createElement("meta"); m.name = n; m.content = c; document.head.appendChild(m); }
    document.documentElement.dataset.theme = "light";
    if (page !== "loading") return;
    proofPage(token).then(setPage, (e: Error) => setPage(/Too many/.test(e.message) ? "busy" : "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; }, [lang]);
  const zh = lang === "zh";
  const t = (x?: Bi | null) => (x ? x[lang] || x.en : "");
  const ok = typeof page === "object" && page.status === "ok" ? page : null;
  useEffect(() => { document.title = ok ? `${t(ok.title)}, ${ok.business}` : zh ? "申报证明" : "Proof of filing"; });
  const facts = ok ? proofFacts({ ...ok, status: ok.filing_status, confirmation_number: ok.confirmation }, both) : [];
  const strength = ok ? proofStrength({ ...ok, status: ok.filing_status, confirmation_number: ok.confirmation }, ok.docs.some(d => docKindOf(d) === "receipt")) : null;
  return (
    <main className="tp proof-page">
      <header className="tp-top">
        <span className="tp-brand">{zh ? "快哉 Placetta 申报证明" : "Placetta proof of filing"}</span>
        <div className="tp-lang" role="group" aria-label={zh ? "语言" : "Language"}>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
        </div>
      </header>
      {page === "loading" && <SkeletonRows rows={4} label={zh ? "正在载入" : "Loading"} />}
      {page === "busy" && <p className="tp-quiet" role="alert">{zh ? "请求过于频繁，请一分钟后再试。" : "Too many requests. Try again in a minute."}</p>}
      {(page === "error" || (typeof page === "object" && page.status === "gone")) && (
        <section className="tp-gone">
          <h1>{zh ? "此链接已失效" : "This link is no longer active"}</h1>
          <p>{zh ? "业主可能已撤销或链接已过期。请向发送链接的人索取新链接。" : "The owner may have revoked it, or it expired. Ask whoever sent it for a new one."}</p>
        </section>
      )}
      {ok && strength && (
        <>
          <section className="tp-head">
            <p className="tp-biz">{ok.business}</p>
            <h1>{t(ok.title)}</h1>
            {ok.agency && <p className="tp-addr">{t(ok.agency)}</p>}
            <p className={"tp-sum" + (ok.filing_status === "rejected" ? " bad" : "")}>{t(strength.say)}</p>
          </section>
          <dl className="pf-facts pf-public">
            {facts.map(x => <div key={x.k}><dt>{t(x.label)}</dt><dd className={x.mono ? "mono" : undefined}>{t(x.value)}</dd></div>)}
          </dl>
          {ok.docs.length > 0 && (
            <section className="pf-sec">
              <h2>{zh ? "存档文件" : "Kept with it"}</h2>
              <ul className="pf-docs">
                {ok.docs.map(d => (
                  <li key={d.id}>
                    <span className="pf-kind">{t(DOC_WORDS[docKindOf(d)])}</span>
                    <span className="pf-name">{d.name}</span>
                    <a className="tp-btn pf-open" href={api.proofDocUrl(token, d.id)} target="_blank" rel="noopener noreferrer">{zh ? "打开" : "Open"}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {ok.events.length > 0 && (
            <section className="pf-sec">
              <h2>{zh ? "每次状态变化及来源" : "Every status change, and where it came from"}</h2>
              <ol className="pf-events">
                {ok.events.map((e, i) => (
                  <li key={i}>
                    <span className="pf-when">{dayOf(e.at, lang)}</span>
                    <span className="pf-what">{t(e.title)}</span>
                    <span className="pf-src">{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{t(SOURCE_WORDS[e.source] ?? { en: e.source, zh: e.source })}</a> : t(SOURCE_WORDS[e.source] ?? { en: e.source, zh: e.source })}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section className="tp-how">
            <p className="tp-quiet">{zh ? `链接有效至 ${dayOf(ok.expires_at, lang)}。此页面不显示表格内容、费用或任何人的税号。` : `Link active until ${dayOf(ok.expires_at, lang)}. This page never shows the form's answers, fees or anyone's tax ID.`}</p>
          </section>
        </>
      )}
      <footer className="tp-foot">
        <p>{zh ? "由快哉 Placetta 提交与跟踪。此页面不构成法律意见。" : "Filed and tracked by Placetta. This page is not legal advice."}</p>
      </footer>
    </main>
  );
}
