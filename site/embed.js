/* Placetta's plan box, for partners' own sites and portals.
   Put this where the box should appear:
     <div data-placetta-plan></div>
     <script src="https://placetta.com/embed.js" data-ref="YOURCODE" async></script>
   Optional on the script: data-lang="zh" (or "en"; otherwise the visitor's browser decides), data-api (another
   partner-api address, for testing). A visitor picks a kind of business and a city and sees every permit it needs,
   in order, with fees, from Placetta's registry of official forms (no AI, nothing stored about the visitor);
   "Start with Placetta" opens sign-up with the partner's code. The box lives in its own shadow root, so the page's
   styles and the box's never mix. */
(function () {
  var me = document.currentScript || document.querySelector("script[src*='embed.js'][data-ref]");
  if (!me) return;
  var REF = (me.getAttribute("data-ref") || "").trim().toUpperCase();
  var API = (me.getAttribute("data-api") || "https://esquxzcfsylffuijvzec.supabase.co/functions/v1/partner-api").replace(/\/+$/, "");
  var START_LANG = me.getAttribute("data-lang") === "zh" || (!me.getAttribute("data-lang") && /^zh/i.test(navigator.language || "")) ? "zh" : "en";
  var KINDS = [["Milk tea", "奶茶"], ["Coffee", "咖啡"], ["Bakery and desserts", "烘焙甜品"], ["Restaurant", "餐厅"], ["Grocery", "超市"], ["Retail", "零售"]];
  var T = {
    en: { h: "Opening in a new market? Get your permit plan", s: "Every license and permit, in order, with government fees. From Placetta's registry of official forms.",
      kind: "What you're opening", city: "City and state", ph: "Flushing, NY", go: "See my plan", busy: "Planning…", n: "{n} permits for {c}, in order",
      fees: "{f} in published government fees", varies: "{v} set by the agency", more: "and {n} more", start: "Start with Placetta", with: "Shared by {p}",
      note: "Odelia, Placetta's compliance agent, confirms each one with the agency before anything is filed.", free: "Fee varies", none: "No fee", err: "Add the city and state, like Flushing, NY.", fail: "Couldn't get the plan just now. Try again in a minute.", lang: "中文" },
    zh: { h: "要在新市场开店？获取您的许可计划", s: "全部执照和许可，按顺序列出，附政府规费。数据来自快哉的官方表格登记库。",
      kind: "开什么店", city: "城市和州", ph: "Flushing, NY", go: "查看计划", busy: "规划中…", n: "{c}共需 {n} 项许可，已按顺序排好",
      fees: "已公布的政府规费 {f}", varies: "{v} 项由机构核定", more: "另有 {n} 项", start: "开始使用快哉", with: "{p} 推荐",
      note: "快哉的合规助手 Odelia 会在提交前向机构逐项核实。", free: "费用视情况而定", none: "免费", err: "请填写城市和州，例如 Flushing, NY。", fail: "暂时无法获取计划，请稍后再试。", lang: "EN" }
  };
  var CSS = ":host{all:initial;display:block;font:15px/1.5 Inter,-apple-system,'Segoe UI','PingFang SC','Noto Sans SC',system-ui,sans-serif;color:#0E1116}" +
    ".b{box-sizing:border-box;max-width:560px;padding:22px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(14,17,22,.08),0 18px 40px -24px rgba(30,50,90,.35)}" +
    ".top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}" +
    "h3{margin:0;font-size:19px;line-height:1.25;font-weight:600;letter-spacing:-.2px}" +
    ".s{margin:6px 0 14px;font-size:13.5px;color:#5B6470}" +
    ".lg{flex:none;height:28px;padding:0 10px;border:0;border-radius:8px;background:#F2F4F7;color:#5B6470;font:inherit;font-size:12.5px;cursor:pointer}" +
    "form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:8px;align-items:end}" +
    "label{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:12px;font-weight:500;color:#5B6470}" +
    "select,input{box-sizing:border-box;width:100%;height:42px;padding:0 12px;border:0;border-radius:11px;background:#fff;box-shadow:0 0 0 1px rgba(14,17,22,.15);font:inherit;font-size:14.5px;color:#0E1116;outline:0}" +
    "select:focus,input:focus{box-shadow:0 0 0 1.5px #7399C6,0 0 0 4px rgba(115,153,198,.2)}" +
    ".go,.st{display:inline-flex;align-items:center;justify-content:center;height:42px;padding:0 16px;border:0;border-radius:999px;background:#0E1116;color:#fff;font:inherit;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;text-decoration:none}" +
    ".go:disabled{opacity:.5;cursor:default}" +
    ".r{margin-top:16px;padding-top:14px;border-top:1px solid rgba(14,17,22,.08)}" +
    ".r b.n{display:block;font-size:15px;font-weight:600}.r .f{display:block;margin-top:2px;font-size:13px;color:#5B6470}" +
    "ol{margin:10px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}" +
    "li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:10px;align-items:baseline;padding:8px 10px;border-radius:10px;background:#F5F7FA;font-size:13.5px}" +
    "li i{font-style:normal;color:#98A0AB;font-variant-numeric:tabular-nums}li span{min-width:0}li small{display:block;color:#98A0AB;font-size:12px}li em{font-style:normal;color:#5B6470;white-space:nowrap;font-size:12.5px}" +
    ".m{margin:6px 0 0;font-size:12.5px;color:#5B6470}" +
    ".foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-top:14px}.foot p{margin:0;font-size:12px;color:#98A0AB;max-width:34ch}" +
    ".w{margin:10px 0 0;padding:8px 12px;border-radius:10px;background:#FBF3E3;color:#A86F14;font-size:13px}" +
    "@media (max-width:520px){.b{padding:18px 16px}form{grid-template-columns:minmax(0,1fr)}.go{width:100%}li{grid-template-columns:20px minmax(0,1fr)}li em{grid-column:2}}";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var money = function (n) { return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }); };

  function mount(host) {
    if (host.__placetta) return;
    host.__placetta = true;
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var lang = START_LANG, kind = KINDS[0][0], city = "", plan = null, busy = false, warn = "";
    function t(k, v) { var s = T[lang][k]; for (var x in (v || {})) s = s.replace("{" + x + "}", v[x]); return s; }
    function render() {
      var html = "<style>" + CSS + "</style><div class='b' lang='" + (lang === "zh" ? "zh-CN" : "en") + "'><div class='top'><h3>" + t("h") + "</h3><button type='button' class='lg' data-lg>" + t("lang") + "</button></div>" +
        "<p class='s'>" + t("s") + "</p><form><label>" + t("kind") + "<select name='k'>" + KINDS.map(function (k) { return "<option value='" + esc(k[0]) + "'" + (k[0] === kind ? " selected" : "") + ">" + esc(lang === "zh" ? k[1] : k[0]) + "</option>"; }).join("") + "</select></label>" +
        "<label>" + t("city") + "<input name='c' value='" + esc(city) + "' placeholder='" + t("ph") + "' autocomplete='address-level2'></label><button class='go' type='submit'" + (busy ? " disabled" : "") + ">" + (busy ? t("busy") : t("go")) + "</button></form>" +
        (warn ? "<p class='w' role='alert'>" + esc(warn) + "</p>" : "");
      if (plan) {
        var shown = plan.permits.slice(0, 6), rest = plan.permits.length - shown.length;
        html += "<div class='r' aria-live='polite'><b class='n'>" + t("n", { n: plan.count, c: esc(plan.where) }) + "</b><span class='f'>" + t("fees", { f: money(plan.known_fees_usd) }) +
          (plan.fees_set_by_agency ? (lang === "zh" ? "，" : ", ") + t("varies", { v: plan.fees_set_by_agency }) : "") + "</span><ol>" +
          shown.map(function (p, i) { return "<li><i>" + (i + 1) + "</i><span>" + esc(p.name[lang] || p.name.en) + "<small>" + esc(p.agency[lang] || p.agency.en) + "</small></span><em>" + (p.fee_usd == null ? t("free") : p.fee_usd === 0 ? t("none") : money(p.fee_usd)) + "</em></li>"; }).join("") + "</ol>" +
          (rest > 0 ? "<p class='m'>" + t("more", { n: rest }) + "</p>" : "") +
          "<div class='foot'><p>" + t("note") + (plan.partner ? " " + t("with", { p: esc(plan.partner.org_name) }) : "") + "</p><a class='st' target='_blank' rel='noopener' href='" + esc(plan.start_url) + "'>" + t("start") + "</a></div></div>";
      }
      root.innerHTML = html + "</div>";
    }
    root.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-lg]")) { lang = lang === "zh" ? "en" : "zh"; render(); } });
    root.addEventListener("input", function (e) { if (e.target.name === "c") city = e.target.value; });
    root.addEventListener("change", function (e) { if (e.target.name === "k") kind = e.target.value; });
    root.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!/,\s*[A-Za-z .]{2,}$/.test(city.trim()) && !/\s[A-Z]{2}$/.test(city.trim())) { warn = t("err"); render(); return; }
      busy = true; warn = ""; render();
      var u = API + "/v1/plan?type=" + encodeURIComponent(kind) + "&city=" + encodeURIComponent(city.trim()) + "&lang=" + lang + (REF ? "&ref=" + encodeURIComponent(REF) : "");
      fetch(u).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) { busy = false; if (x.ok) { plan = x.j; } else { warn = (x.j && x.j.error && x.j.error.code === "bad_request") ? t("err") : t("fail"); } render(); })
        .catch(function () { busy = false; warn = t("fail"); render(); });
    });
    render();
  }

  function start() {
    var hosts = document.querySelectorAll("[data-placetta-plan]");
    if (!hosts.length) { var d = document.createElement("div"); d.setAttribute("data-placetta-plan", ""); me.parentNode.insertBefore(d, me.nextSibling); hosts = [d]; }
    Array.prototype.forEach.call(hosts, mount);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
