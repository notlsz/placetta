/* Placetta guides: search and region tabs on the hub, copy for the embeddable checklists, and the one conversion,
   the plan for your address. The lead goes to plan_requests (the website's own table) and the answers ride into the
   app through the same handoff the homepage uses, so sign-up opens already filled in. */
(() => {
  const zh = document.documentElement.lang.startsWith("zh");
  window.dataLayer = window.dataLayer || [];
  const track = (event, data) => window.dataLayer.push(Object.assign({ event, page: location.pathname, ts: Date.now() }, data || {}));

  /* in-page links without a #: [data-to] scrolls to that part of the page; from another page, a hub link opens the
     hub and lands on its section; a page reached by an old #link drops the # from the address bar */
  const goTo = id => { const el = document.getElementById(id); if (!el) return false; el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    if (id === "main") { el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); } return true; };
  const follow = a => { const id = a.dataset.to; if (goTo(id)) return; const href = a.getAttribute("href"); if (href) { try { sessionStorage.setItem("guides-to", id); } catch (e) {} location.href = href; } };
  document.addEventListener("click", e => { const a = e.target.closest("[data-to]"); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); follow(a); });
  document.addEventListener("keydown", e => { if (e.key !== "Enter" && e.key !== " ") return; const a = e.target.closest && e.target.closest("[data-to]:not([href])"); if (!a) return; e.preventDefault(); follow(a); });
  try { const id = sessionStorage.getItem("guides-to") || location.hash.slice(1); sessionStorage.removeItem("guides-to"); if (location.hash) history.replaceState(null, "", location.pathname + location.search); if (id) addEventListener("load", () => setTimeout(() => goTo(id), 50), { once: true }); } catch (e) {}

  /* hub: search across cities, answers and forms */
  const q = document.getElementById("q"), count = document.getElementById("count");
  if (q) {
    const items = [...document.querySelectorAll("[data-f]")];
    q.addEventListener("input", () => {
      const v = q.value.trim().toLowerCase(); let n = 0;
      document.body.classList.toggle("searching", !!v);
      for (const el of items) { const on = !v || el.dataset.f.includes(v); el.hidden = !on; if (on) n++; }
      document.querySelectorAll(".fgroup").forEach(g => { g.hidden = !!v && !g.querySelector("li:not([hidden])"); if (v) g.open = true; });
      count.textContent = v ? (zh ? "找到 " + n + " 项" : n + (n === 1 ? " match" : " matches")) : "";
    });
    q.addEventListener("change", () => track("guides_search", { q: q.value.slice(0, 80) }));
    // /guides/?q=dubai opens with the search run (the site search that search engines and assistants link to)
    try { const pre = new URLSearchParams(location.search).get("q"); if (pre) { q.value = pre.slice(0, 80); q.dispatchEvent(new Event("input")); } } catch (e) {}
  }

  /* hub: region tabs (every panel shows when scripts are off) */
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  if (tabs.length) {
    const show = t => { tabs.forEach(x => { const on = x === t; x.setAttribute("aria-selected", String(on)); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute("aria-controls")).classList.toggle("off", !on); }); };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => { show(t); track("guides_region", { region: t.id }); });
      t.addEventListener("keydown", e => { const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { const n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); show(n); } });
    });
    document.body.classList.add("tabbed"); show(tabs[0]);
  }

  /* embeddable checklist */
  document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => {
    const ta = b.parentElement.querySelector("textarea"); ta.select();
    const done = () => { b.textContent = zh ? "已复制" : "Copied"; track("embed_copied"); };
    (navigator.clipboard ? navigator.clipboard.writeText(ta.value).then(done, () => { document.execCommand("copy"); done(); }) : (document.execCommand("copy"), done()));
  }));

  /* real counts: one view per visitor per day and one helpful vote per visitor, counted by page_hit() in Supabase.
     The button shows on every page; the counts show only once they mean something (a page reading "1 view" looks
     unread), so a guide shows its views from 500 and its helpful votes from 10. */
  const STATS = "https://esquxzcfsylffuijvzec.supabase.co/rest/v1/rpc/page_hit", SKEY = "sb_publishable_Ub54H3S-bU8WDuY7toMtzg_S1ieEO_p";
  const VIEWS_MIN = 500, HELPFUL_MIN = 10, path = location.pathname.toLowerCase();
  const get = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  const hit = (view, helpful) => fetch(STATS, { method: "POST", headers: { apikey: SKEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_path: path, p_view: view, p_helpful: helpful }) }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const fmt = n => n.toLocaleString(zh ? "zh-CN" : "en-US");
  const box = document.querySelector("[data-helpful]");
  if (path.startsWith("/guides/")) {
    const day = String(Math.floor(Date.now() / 864e5)), seen = get("pv:" + path) === day, voted = !!get("ph:" + path);
    // the button is on every page from the start; the counts fill in as soon as they're read
    const btn = box && box.querySelector(".hbtn"), out = box && box.querySelector(".hcount");
    const show = n => { if (out) out.textContent = n >= HELPFUL_MIN ? (zh ? fmt(n) + " 人觉得有帮助" : fmt(n) + (n === 1 ? " person found this helpful" : " people found this helpful")) : ""; };
    const thanks = () => { btn.disabled = true; btn.textContent = zh ? "谢谢反馈" : "Thanks for letting us know"; };
    if (box) {
      if (voted) thanks(); box.hidden = false;
      btn.addEventListener("click", () => {
        if (get("ph:" + path)) return;
        set("ph:" + path, "1"); thanks(); track("guides_helpful");
        hit(false, true).then(r => r && show(r.helpful));
      });
    }
    hit(!seen, false).then(s => {
      if (!s) return;
      set("pv:" + path, day);
      const meta = document.querySelector(".hero .meta");
      if (meta && s.views >= VIEWS_MIN) { const sp = document.createElement("span"); sp.textContent = zh ? fmt(s.views) + " 次浏览" : fmt(s.views) + (s.views === 1 ? " view" : " views"); meta.appendChild(sp); }
      show(s.helpful);
    });
  }

  /* the conversion */
  document.querySelectorAll("[data-track]").forEach(a => a.addEventListener("click", () => track("guides_cta", { where: a.dataset.track })));
  const SUPA = "https://esquxzcfsylffuijvzec.supabase.co", KEY = "sb_publishable_Ub54H3S-bU8WDuY7toMtzg_S1ieEO_p";
  const INDUSTRY = { "Milk tea": "fb", Coffee: "fb", Restaurant: "fb", "Bakery and desserts": "fb", Grocery: "fb", Retail: "retail" };
  document.querySelectorAll("form[data-lead]").forEach(form => {
    let started = false;
    form.addEventListener("input", () => { if (!started) { started = true; track("lead_form_start"); } }, { once: false });
    form.addEventListener("submit", e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form)), err = form.querySelector(".cv-err");
      const email = String(f.email || "").trim(), company = String(f.company || "").trim();
      const bad = !company ? (zh ? "请填写品牌或公司名称。" : "Add your brand or company name.") : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? (zh ? "请填写有效的邮箱。" : "Enter a valid email address.") : "";
      if (bad) { err.textContent = bad; err.hidden = false; return; }
      err.hidden = true;
      const addr = String(f.address || "").trim(), city = String(f.city || "").trim();
      const market = (addr && city && !addr.toLowerCase().includes(city.toLowerCase()) ? addr + ", " + city : addr || city).slice(0, 200), p = new URLSearchParams(location.search), utm = {};
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(k => { if (p.get(k)) utm[k] = p.get(k).slice(0, 200); });
      const row = { client_id: crypto.randomUUID(), source: "guides", page_lang: zh ? "zh" : "en", preferred_language: zh ? "zh" : "en", market, industry: INDUSTRY[f.sell] || (f.sell ? "other" : null),
        contact_method: "email", email: email.slice(0, 320), company: company.slice(0, 300), answers: { business: f.business || null, sell: f.sell || null, city: f.city || null, address: f.address || null }, utm,
        page_url: (location.origin + location.pathname).slice(0, 500), referrer: document.referrer.slice(0, 500) || null, user_agent: navigator.userAgent.slice(0, 300) };
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      try { localStorage.setItem("placetta-handoff", JSON.stringify({ v: 1, at: Date.now(), email, company, market, sell: f.sell || "", plang: zh ? "zh" : "en" })); } catch (_) {}
      const go = () => { location.href = "/app/"; };
      track("lead_submitted", { business: f.business, city: f.city });
      fetch(SUPA + "/rest/v1/plan_requests", { method: "POST", keepalive: true, headers: { apikey: KEY, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(row) })
        .then(r => track(r.ok ? "lead_saved" : "lead_save_failed", { status: r.status }), () => track("lead_save_failed", { status: 0 }))
        .finally(go);
      setTimeout(go, 1500);
    });
  });
})();
