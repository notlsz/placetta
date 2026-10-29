import "./simple.css";

/* Loading and error, the same on every screen (Airbnb's: the page's own shape while it loads, one plain sentence and
   one action when it can't). The skeleton has the app's real frame (the sidebar on a desktop, the top bar and tab bar
   on a phone, a page head and rows), so nothing jumps when the workspace arrives. */

const zhOf = (lang?: "en" | "zh") => {
  if (lang) return lang === "zh";
  try { const v = localStorage.getItem("placetta-lang"); if (v === "en" || v === "zh") return v === "zh"; } catch { /* storage blocked */ }
  return typeof navigator !== "undefined" && /^zh/i.test(navigator.language);
};

/** Rows while a list loads from the server: the shape of the rows it will show. */
export function SkeletonRows({ rows = 3, label }: { rows?: number; label?: string }) {
  return (
    <div className="skel-rows" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel-row"><span className="skel-tx"><span className="skel skel-b" style={{ width: `${50 + ((i * 17) % 30)}%` }} /><span className="skel skel-s" style={{ width: `${30 + ((i * 11) % 24)}%` }} /></span></div>
      ))}
    </div>
  );
}

/** A page's shape while it loads: a title, a line under it, and rows. */
export function PageSkeleton({ rows = 5, label }: { rows?: number; label?: string }) {
  return (
    <div className="page skel-page" role="status" aria-busy="true" aria-label={label}>
      <span className="skel skel-h1" />
      <span className="skel skel-sub" />
      <span className="skel skel-tabs" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel-row"><span className="skel-tx"><span className="skel skel-b" style={{ width: `${46 + ((i * 17) % 30)}%` }} /><span className="skel skel-s" style={{ width: `${30 + ((i * 11) % 24)}%` }} /></span><span className="skel skel-act" /></div>
      ))}
    </div>
  );
}

/** The whole app's frame while the workspace opens (src/cloud/Root.tsx). */
export function AppSkeleton({ lang }: { lang?: "en" | "zh" }) {
  const zh = zhOf(lang);
  return (
    <div className="skel-shell">
      <aside className="skel-side" aria-hidden="true">
        <span className="skel skel-logo" />
        <span className="skel skel-ws" />
        {[0, 1, 2, 3].map(i => <span key={i} className="skel skel-nav" />)}
      </aside>
      <div className="skel-main">
        <header className="skel-mbar" aria-hidden="true"><span className="skel skel-logo" /></header>
        <PageSkeleton label={zh ? "正在打开工作区" : "Opening your workspace"} />
      </div>
    </div>
  );
}

/** When a screen can't show: one plain sentence, Retry, and a way to tell Placetta. */
export function PageError({ onRetry, lang, what }: { onRetry: () => void; lang?: "en" | "zh"; what?: string }) {
  const zh = zhOf(lang);
  const mail = `mailto:support@placetta.com?subject=${encodeURIComponent(zh ? "页面无法打开" : "A page didn't open")}&body=${encodeURIComponent((zh ? "打开的页面：" : "Page: ") + (typeof location !== "undefined" ? location.pathname : "") + (what ? "\n" + what : ""))}`;
  return (
    <div className="page page-err" role="alert">
      <span className="pe-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" /><path d="M12 8v5" /><path d="M12 16.5v.01" /></svg></span>
      <p className="pe-say">{zh ? "这个页面没能打开。" : "This page didn't open."}</p>
      <p className="pe-sub">{zh ? "您的工作都已保存，Odelia 也照常在办。再试一次通常就好。" : "Your work is saved and Odelia carries on. Trying again usually fixes it."}</p>
      <div className="pe-act">
        <button type="button" className="pill ink" onClick={onRetry}>{zh ? "重试" : "Retry"}</button>
        <a className="lnk pe-tell" href={mail}>{zh ? "告诉快哉" : "Tell Placetta"}</a>
      </div>
    </div>
  );
}
