/* The trust page's incident log line: shown only when Placetta's incident log exists (public.incident_log_public, in
   supabase/migrations/20261017210300_agent_health.sql), with the day it began and the entries the team made public.
   Until it answers, the roadmap says nothing about it. The publishable key only reads what that function returns. */
(function () {
  var SUPA = "https://esquxzcfsylffuijvzec.supabase.co", KEY = "sb_publishable_Ub54H3S-bU8WDuY7toMtzg_S1ieEO_p";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var day = function (iso, zh) {
    var d = new Date(String(iso).slice(0, 10) + "T12:00:00Z");
    if (isNaN(d)) return "";
    return zh ? d.getUTCFullYear() + "年" + (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日"
      : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  };
  fetch(SUPA + "/rest/v1/rpc/incident_log_public", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: "{}" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (log) {
      if (!log || !log.since) return;
      document.querySelectorAll("[data-incidents]").forEach(function (box) {
        var zh = !!box.closest("[lang='zh-CN']");
        box.querySelectorAll("[data-incidents-since]").forEach(function (el) { el.textContent = day(log.since, zh); });
        var list = box.querySelector("[data-incidents-list]");
        var items = Array.isArray(log.incidents) ? log.incidents : [];
        list.innerHTML = items.length ? items.map(function (i) {
          return "<li><b>" + esc(day(i.happened_at, zh)) + (zh ? "：" : ": ") + esc(i.title) + "</b><br>" + (zh ? "影响：" : "Impact: ") + esc(i.impact) +
            (i.fix ? "<br>" + (zh ? "修复：" : "Fix: ") + esc(i.fix) : "") + "</li>";
        }).join("") : "<li>" + (zh ? "目前没有需要报告的事件。" : "No incidents to report.") + "</li>";
        box.hidden = false;
      });
    })
    .catch(function () { /* no log to show */ });
})();
