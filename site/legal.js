/* Placetta legal pages (terms, privacy, authorization, ai; their text comes from src/legal.ts via scripts/build-legal.mts)
   and the trust page (site/trust.html, written by hand in the same shell):
   company details, language switch, placeholders.
   Fill in CO once and every placeholder on both pages updates. Until a field is filled, it shows as a highlighted placeholder. */
const CO = {
  name:    {en: "Placetta Inc.", zh: "Placetta Inc.（快哉）"},
  address: {en: "9 W 57th St, Fl 48, New York, NY 10019", zh: "美国纽约州纽约市西57街9号48层（邮编 10019）"},
  country: {en: "United States", zh: "美国"},
  email:   "support@placetta.com",
  site:    "https://placetta.com"
};
const PH = {
  name:    ["[Company legal name]", "【公司法定名称】"],
  address: ["[Registered address]", "【注册地址】"],
  country: ["[Country]", "【国家或地区】"],
  email:   ["[Contact email]", "【联系邮箱】"],
  site:    ["[Website address]", "【网站地址】"]
};
const UI = {
  en: {back: "Back to Home", brand: "Placetta", home: "Home", privacy: "Privacy Policy", terms: "Terms of Service", authorization: "Filing Authorization", ai: "How Placetta's AI works", trust: "Trust and security", copy: "© 2026 Placetta"},
  zh: {back: "返回首页", brand: "快哉", home: "首页", privacy: "隐私政策", terms: "服务条款", authorization: "申报授权书", ai: "快哉的 AI 如何工作", trust: "信任与安全", copy: "© 2026 快哉"}
};

let lang = "en";
try {
  const q = new URLSearchParams(location.search).get("lang");
  const s = localStorage.getItem("placetta-lang");
  if (q === "en" || q === "zh") lang = q;
  else if (s === "en" || s === "zh") lang = s;
  else if ((navigator.language || "").toLowerCase().startsWith("zh")) lang = "zh";
} catch (e) { if ((navigator.language || "").toLowerCase().startsWith("zh")) lang = "zh"; }

const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));

function fillCompany(){
  const i = lang === "zh" ? 1 : 0;
  document.querySelectorAll("[data-co]").forEach(el => {
    const k = el.dataset.co, v = CO[k], val = typeof v === "string" ? v : (v && (v[lang] || v.en));
    if (!val) { el.innerHTML = `<mark class="ph">${PH[k][i]}</mark>`; return; }
    if (k === "email") el.innerHTML = `<a href="mailto:${esc(val)}">${esc(val)}</a>`;
    else if (k === "site") el.innerHTML = `<a href="${esc(val)}" target="_blank" rel="noopener">${esc(val.replace(/^https?:\/\//, ""))}</a>`;
    else el.textContent = val;
  });
}

function setLang(l){
  lang = l;
  try { localStorage.setItem("placetta-lang", l); } catch (e) {}
  document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-block]").forEach(b => { b.hidden = b.dataset.block !== l; });
  document.querySelectorAll("[data-ui]").forEach(el => { el.textContent = UI[l][el.dataset.ui]; });
  document.querySelectorAll(".lt [data-lang]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === l)));
  document.querySelectorAll("a[data-home]").forEach(a => { a.href = "index.html?lang=" + l + (a.dataset.home || ""); });
  document.querySelectorAll("a[data-legal]").forEach(a => { a.href = a.dataset.legal + "?lang=" + l; });
  const art = document.querySelector(`[data-block="${l}"]`);
  document.title = art ? art.dataset.title : document.title;
  fillCompany();
}

/* Section links (/trust#report): both languages have the heading, marked data-anchor, but only the English one can
   carry the id, so a link scrolls to the copy in the language on screen. */
/* Sections the trust page no longer has: an old link lands on the nearest one that's left. */
const OLD_ANCHOR = {glance: "security", approvals: "security", audit: "security", access: "security", data: "security", email: "ai", roadmap: "security", status: "report"};
function toAnchor(){
  let h = decodeURIComponent(location.hash.slice(1));
  if (!h) return;
  if (!document.querySelector(`[data-anchor="${CSS.escape(h)}"]`) && OLD_ANCHOR[h]) h = OLD_ANCHOR[h];
  const el = document.querySelector(`[data-block="${lang}"] [data-anchor="${CSS.escape(h)}"]`);
  if (el) el.scrollIntoView();
}

document.querySelectorAll(".lt [data-lang]").forEach(b => b.addEventListener("click", () => setLang(b.dataset.lang)));
setLang(lang);
window.addEventListener("hashchange", toAnchor);
window.addEventListener("load", toAnchor);
toAnchor();
