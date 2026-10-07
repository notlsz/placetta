/* Placetta guides: search and region tabs on the hub, copy for the embeddable checklists, and the one conversion,
   the plan for your address. The lead goes to plan_requests (the website's own table) and the answers ride into the
   app through the same handoff the homepage uses, so sign-up opens already filled in. */
(() => {
  const zh = document.documentElement.lang.startsWith("zh");
  window.dataLayer = window.dataLayer || [];
  const track = (event, data) => window.dataLayer.push(Object.assign({ event, page: location.pathname, ts: Date.now() }, data || {}));

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
