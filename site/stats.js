/* The stats page's numbers (site/stats.html), from public.public_outcomes() in
   supabase/migrations/20261105091400_outcomes.sql. The server returns a number only once 20 or more real filings are
   behind it, and a comparison only where Placetta's side is measured and the other side has a public source. This
   page checks both again before it prints anything: until then each line keeps "We publish this once we have 20
   filings." No ratio is ever typed here; it is the baseline divided by the measured number.
   statsView() is pure, so scripts/outcomes-test.ts runs it in Node. The publishable key only reads what that function
   returns. */
(function (root) {
  var MIN = 20;
  var FORMS = {
    "irs-ss4": ["EIN (IRS Form SS-4)", "EIN（美国国税局 SS-4 表）"],
    "ca-cdtfa": ["California seller's permit", "加州销售许可证"],
    "ca-llc-1": ["California LLC formation (LLC-1)", "加州 LLC 设立（LLC-1）"],
    "ca-llc-12": ["California Statement of Information (LLC-12)", "加州信息声明（LLC-12）"]
  };
  var num = function (v) { var n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN; return isFinite(n) ? n : null; };
  var fmt = function (n, d) { var p = Math.pow(10, d == null ? 1 : d); return String(Math.round(n * p) / p); };
  var day = function (iso, zh) {
    var d = new Date(String(iso).slice(0, 10) + "T12:00:00Z");
    if (isNaN(d)) return "";
    return zh ? d.getUTCFullYear() + "年" + (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日"
      : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  };
  /** A measured number, or null: it needs its sample and at least 20 behind it. */
  function measured(m, min) {
    if (!m || typeof m !== "object") return null;
    var n = num(m.n), v = num(m.value);
    return n != null && n >= min && v != null ? { n: n, v: v } : null;
  }
  var UNIT = {
    days: [function (v, u) { return fmt(v) + (u === "business" ? " business days" : " days"); }, function (v, u) { return fmt(v) + (u === "business" ? " 个工作日" : " 天"); }],
    owner_hours: [function (v) { return fmt(v, 2) + " hours of the owner's time"; }, function (v) { return "店主 " + fmt(v, 2) + " 小时"; }],
    price: [function (v) { return "$" + fmt(v, 2); }, function (v) { return fmt(v, 2) + " 美元"; }]
  };
  var BETTER = { days: ["faster", "更快"], owner_hours: ["less of the owner's time", "更省店主时间"], price: ["cheaper", "更便宜"] };
  var WAY = { diy: ["doing it yourself", "自己办理"], expediter: ["an expediter", "代办公司"], consultant: ["a consultant", "顾问"] };

  /** What the page may print: each metric's words or null, and the comparison lines. */
  function statsView(data, zh) {
    var L = zh ? 1 : 0, d = data && typeof data === "object" ? data : {};
    var min = Math.max(MIN, num(d.min_n) || 0);
    var out = { metrics: {}, comparisons: [] };
    var m;
    m = measured(d.licenses_approved, min); out.metrics.licenses_approved = m ? fmt(m.v, 0) + (zh ? "（" + m.n + " 份申请）" : " (" + m.n + " filings)") : null;
    m = measured(d.median_days, min); out.metrics.median_days = m ? (zh ? fmt(m.v) + " 天（" + m.n + " 份申请）" : fmt(m.v) + " days (" + m.n + " filings)") : null;
    m = measured(d.human_free_pct, min); out.metrics.human_free_pct = m && m.v >= 0 && m.v <= 100 ? fmt(m.v, 0) + "%" + (zh ? "（" + m.n + " 份申请）" : " (" + m.n + " filings)") : null;
    m = measured(d.owner_touches, min); out.metrics.owner_touches = m ? (zh ? fmt(m.v) + " 次（" + m.n + " 张许可证）" : fmt(m.v) + " (" + m.n + " licenses)") : null;
    m = measured(d.owner_hours, min); out.metrics.owner_hours = m ? (zh ? fmt(m.v, 2) + " 小时（" + m.n + " 张许可证，按每次操作估算）" : fmt(m.v, 2) + " hours (" + m.n + " licenses, estimated per touch)") : null;
    var list = Array.isArray(d.comparisons) ? d.comparisons : [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i] || {}, n = num(c.n), ours = num(c.placetta), theirs = num(c.baseline);
      if (!UNIT[c.metric] || n == null || n < min || ours == null || theirs == null || ours < 0 || theirs < 0) continue;
      if (typeof c.source_url !== "string" || !/^https:\/\//.test(c.source_url)) continue;
      var u = UNIT[c.metric][L], form = (FORMS[c.form] || [c.form, c.form])[L], way = (WAY[c.kind] || [c.kind, c.kind])[L];
      var ratio = ours > 0 ? theirs / ours : null;
      var src = String(c.provider || "") + (c.read_on ? (zh ? "，" + day(c.read_on, true) + "读取" : ", read " + day(c.read_on, false)) : "");
      var line = zh
        ? form + "：快哉 " + u(ours, null) + "（" + n + " 份申请），" + way + " " + u(theirs, c.unit) + "（" + src + "）"
        : form + ": " + u(ours, null) + " on Placetta (" + n + " filings) against " + u(theirs, c.unit) + " " + way + " (" + src + ")";
      // a ratio only when the two are in the same unit and Placetta is ahead; never rounded up
      if (ratio != null && ratio >= 1.5 && !(c.metric === "days" && c.unit === "business")) {
        var r = Math.floor(ratio * 10) / 10;
        line += zh ? "，" + BETTER[c.metric][1] + " " + fmt(r) + " 倍" : ", " + fmt(r) + " times " + BETTER[c.metric][0];
      }
      out.comparisons.push({ text: line + (zh ? "。" : "."), source: c.source_url });
    }
    return out;
  }

  root.PlacettaStats = { statsView: statsView, MIN: MIN };
  if (typeof document === "undefined" || typeof fetch === "undefined") return;

  var SUPA = "https://esquxzcfsylffuijvzec.supabase.co", KEY = "sb_publishable_Ub54H3S-bU8WDuY7toMtzg_S1ieEO_p";
  fetch(SUPA + "/rest/v1/rpc/public_outcomes", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: "{}" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data) return;
      document.querySelectorAll("[data-stats]").forEach(function (box) {
        var zh = !!box.closest("[lang='zh-CN']"), v = statsView(data, zh);
        box.querySelectorAll("[data-metric]").forEach(function (row) {
          var t = v.metrics[row.getAttribute("data-metric")], cell = row.querySelector("[data-value]");
          if (t && cell) cell.textContent = t;
        });
        var cmp = box.querySelector("[data-comparisons]");
        if (cmp && v.comparisons.length) {
          cmp.textContent = "";
          v.comparisons.forEach(function (c) {
            var p = document.createElement("p"), a = document.createElement("a");
            p.textContent = c.text + " ";
            a.href = c.source; a.rel = "noopener"; a.textContent = zh ? "来源" : "Source";
            p.appendChild(a); cmp.appendChild(p);
          });
        }
      });
    })
    .catch(function () { /* nothing measured to show */ });
})(typeof window !== "undefined" ? window : globalThis);
