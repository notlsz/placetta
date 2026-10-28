/* A partner's link (?ref=CODE) or a status page's footer (?st=ref) that lands on the website rather than the app: kept
   on this site's own storage for 90 days, in the same shape the app reads (src/referral.ts), so sign-up still credits
   them. Nothing leaves the browser and nothing else is kept. */
(function () {
  try {
    var p = new URLSearchParams(location.search), ref = (p.get("ref") || "").trim().toUpperCase(), st = (p.get("st") || "").trim().toLowerCase();
    if (!ref && !st) return;
    var now = Date.now(), win = 90 * 864e5;
    var live = function (t) { return t && typeof t.at === "number" && now - t.at <= win && t.at <= now + 6e4; };
    if (/^[A-Z2-9]{8}$/.test(ref)) {
      var prev = JSON.parse(localStorage.getItem("placetta-ref") || "null");
      var list = (Array.isArray(prev) ? prev : prev ? [prev] : []).filter(function (t) { return live(t) && /^[A-Z2-9]{8}$/.test(t.code); });
      if (!list.some(function (t) { return t.code === ref; }) && list.length < 5) list.push({ code: ref, at: now });
      localStorage.setItem("placetta-ref", JSON.stringify(list));
    }
    if (/^[a-z2-9]{10}$/.test(st)) {
      var s = JSON.parse(localStorage.getItem("placetta-st") || "null");
      if (!(live(s) && /^[a-z2-9]{10}$/.test(s.ref))) localStorage.setItem("placetta-st", JSON.stringify({ ref: st, at: now }));
    }
    p.delete("ref"); p.delete("st");
    var q = p.toString();
    history.replaceState(history.state, "", location.pathname + (q ? "?" + q : "") + location.hash);
  } catch (e) { /* storage blocked: nothing kept */ }
})();
