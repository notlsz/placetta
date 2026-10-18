// The free compliance check on the website, signed out: each store's city and what it sells, then what it holds, then
// the gaps and lapse risks per store, from Placetta's own registry (src/plan/existing.ts, the same check as the app's
// onboarding). No model is called and nothing leaves the browser until the person asks for their plan: then the site's
// own lead form (site/index.html, window.placettaLead) opens at its contact step with what the check found, and one
// lead is saved per submit. Built by `npm run site:check` into site/stores-check.js, loaded the first time it's opened.
import { checkStores, findingLine, KINDS, RANK, readPlace, requiredFor, totals, type Answers, type Finding, type Have, type StoreInput, type StoreResult } from "../plan/existing";

type Lang = "en" | "zh";
type Bi = { en: string; zh: string };
declare global { interface Window { placettaCheck?: { open(lang: Lang): void }; placettaLead?: (x: Record<string, unknown>) => void } }

const B = (en: string, zh: string): Bi => ({ en, zh });
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const HAVE: [Have, Bi][] = [["have", B("Have it", "已有")], ["unsure", B("Not sure", "不确定")], ["missing", B("Don't have", "没有")]];
const TAG: Record<string, Bi> = { lapsed: B("Expired", "已过期"), gap: B("Missing", "缺少"), due_soon: B("Renew soon", "即将续期"), unsure: B("Not sure", "不确定"), no_date: B("No renewal date", "无续期日期") };
const CITIES = ["Flushing, NY", "Brooklyn, NY", "Manhattan, NY", "Boston, MA", "Philadelphia, PA", "Chicago, IL", "Houston, TX", "Dallas, TX", "Atlanta, GA", "Miami, FL", "Seattle, WA",
  "San Francisco, CA", "San Jose, CA", "Los Angeles, CA", "Arcadia, CA", "Irvine, CA", "San Diego, CA", "Las Vegas, NV", "Phoenix, AZ", "Denver, CO"];

const CSS = `
.pc-scrim{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(14,17,22,.48);font:15px/1.5 Inter,-apple-system,"Segoe UI","PingFang SC","Noto Sans SC",system-ui,sans-serif;color:#0E1116}
.pc-sheet{position:relative;width:100%;max-width:680px;max-height:calc(100dvh - 32px);overflow:auto;border-radius:16px;background:#fff;padding:26px 28px 24px;box-shadow:0 30px 80px -30px rgba(14,17,22,.5)}
.pc-sheet h2{margin:0 40px 6px 0;font:500 24px/1.2 Inter,-apple-system,"PingFang SC",sans-serif;letter-spacing:-.3px}
.pc-sub{margin:0 0 16px;color:#5B6470;font-size:14.5px}
.pc-x{position:absolute;top:18px;right:18px;width:34px;height:34px;border:0;border-radius:10px;background:#F2F4F7;color:#0E1116;font-size:18px;line-height:1;cursor:pointer}
.pc-rows{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}
.pc-row{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) 34px;gap:8px;align-items:end}
.pc-f{display:flex;flex-direction:column;gap:4px;min-width:0}
.pc-f span{font-size:12.5px;font-weight:500;color:#5B6470}
.pc-f input,.pc-f select,.pc-date input{height:44px;min-width:0;width:100%;box-sizing:border-box;padding:0 12px;border:0;border-radius:12px;background:#fff;box-shadow:0 0 0 1px rgba(14,17,22,.14);font:inherit;font-size:15px;color:#0E1116;outline:0}
.pc-f input:focus,.pc-f select:focus,.pc-date input:focus{box-shadow:0 0 0 1.5px #7399C6,0 0 0 4px rgba(115,153,198,.2)}
.pc-f input[aria-invalid=true]{box-shadow:0 0 0 1.5px #D9A040}
.pc-rm{height:44px;border:0;border-radius:10px;background:#F2F4F7;color:#5B6470;cursor:pointer;font-size:16px}
.pc-act{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:18px}
.pc-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:42px;padding:0 18px;border:0;border-radius:999px;font:inherit;font-size:14.5px;font-weight:500;cursor:pointer;text-decoration:none}
.pc-ink{background:#0E1116;color:#fff}.pc-ink:disabled{opacity:.45;cursor:default}
.pc-soft{background:#F2F4F7;color:#0E1116}
.pc-line{background:#fff;color:#0E1116;box-shadow:0 0 0 1px rgba(14,17,22,.16)}
.pc-store{margin-top:12px;padding:14px 16px;border-radius:16px;background:#F5F7FA}
.pc-store>b{display:block;font-size:15px}
.pc-store>small{display:block;margin:0 0 8px;font-size:13px;color:#5B6470}
.pc-items{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}
.pc-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;align-items:center;padding:10px 12px;border-radius:12px;background:#fff}
.pc-name{display:flex;flex-direction:column;min-width:0}
.pc-name b{font-size:14px;font-weight:500;overflow-wrap:anywhere}
.pc-name small{font-size:12.5px;color:#98A0AB;overflow-wrap:anywhere}
.pc-seg{display:inline-flex;gap:2px;padding:3px;border-radius:14px;background:#ECF0F5}
.pc-seg button{height:30px;padding:0 11px;border:0;border-radius:11px;background:none;font:inherit;font-size:13px;color:#5B6470;cursor:pointer;white-space:nowrap}
.pc-seg button[aria-pressed=true]{background:#fff;color:#0E1116;box-shadow:0 1px 2px rgba(14,17,22,.08)}
.pc-date{grid-column:1/-1;display:flex;align-items:center;gap:10px;font-size:13px;color:#5B6470}
.pc-date input{width:190px;height:36px}
.pc-tot{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:4px 0 0}
.pc-tot div{display:flex;flex-direction:column;padding:12px 14px;border-radius:14px;background:#F5F7FA}
.pc-tot dd{order:1;margin:0;font-size:26px;line-height:1.1}
.pc-tot dt{order:2;font-size:12.5px;color:#5B6470}
.pc-tot .w dd{color:#A86F14}
.pc-find{display:grid;grid-template-columns:118px minmax(0,1fr);gap:12px;padding:10px 12px;border-radius:12px;background:#fff}
.pc-tag{justify-self:start;align-self:start;padding:2px 9px;border-radius:999px;background:#ECF0F5;color:#5B6470;font-size:12px;font-weight:500;white-space:nowrap}
.pc-find.k-lapsed .pc-tag,.pc-find.k-gap .pc-tag{background:#FBF3E3;color:#A86F14}
.pc-ok{margin:0;font-size:13.5px;color:#5B6470}
.pc-note{margin:14px 0 0;font-size:12.5px;color:#98A0AB}
.pc-warn{margin:10px 0 0;padding:10px 14px;border-radius:12px;background:#FBF3E3;color:#A86F14;font-size:13.5px}
@media (max-width:640px){.pc-scrim{align-items:flex-end;padding:0}.pc-sheet{max-width:none;border-radius:18px 18px 0 0;max-height:94dvh;padding:18px 16px calc(20px + env(safe-area-inset-bottom,0px))}
.pc-row{grid-template-columns:minmax(0,1fr) 34px}.pc-row .pc-f:nth-child(2){grid-column:1}.pc-rm{grid-column:2;grid-row:1}
.pc-item{grid-template-columns:minmax(0,1fr)}.pc-tot{grid-template-columns:repeat(2,minmax(0,1fr))}.pc-find{grid-template-columns:minmax(0,1fr);gap:6px}.pc-sheet h2{font-size:21px}}
`;

let n = 0;
const blank = (): StoreInput => ({ id: "s" + (++n), city: "", what: KINDS[0].en });

function open(lang: Lang) {
  const L = (x: Bi) => x[lang];
  if (!document.getElementById("pc-css")) { const st = document.createElement("style"); st.id = "pc-css"; st.textContent = CSS; document.head.appendChild(st); }
  let stores: StoreInput[] = [blank()];
  let answers: Answers = {};
  let step: "stores" | "check" | "results" = "stores";
  let warn = "";
  const scrim = document.createElement("div");
  scrim.className = "pc-scrim";
  scrim.setAttribute("role", "dialog"); scrim.setAttribute("aria-modal", "true"); scrim.setAttribute("aria-label", L(B("Check your stores", "检查您的门店")));
  const sheet = document.createElement("div"); sheet.className = "pc-sheet"; scrim.appendChild(sheet);
  const last = document.activeElement as HTMLElement | null;
  const close = () => { scrim.remove(); document.body.style.overflow = ""; removeEventListener("keydown", onKey); last?.focus?.(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  addEventListener("keydown", onKey);
  scrim.addEventListener("click", e => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim); document.body.style.overflow = "hidden";

  const ready = () => stores.filter(s => readPlace(s.city));
  const merged = (): Answers => Object.fromEntries(ready().map(s => [s.id, { ...(answers[s.id] ?? {}), ...(answers.biz ?? {}) }]));
  const results = (): StoreResult[] => checkStores(ready(), merged(), today());
  const whole = (rs: StoreResult[]) => { const m = new Map<string, ReturnType<typeof requiredFor>[number]>(); for (const r of rs) for (const q of r.required) if (q.whole && !m.has(q.key)) m.set(q.key, q); return [...m.values()]; };
  const item = (sid: string, q: ReturnType<typeof requiredFor>[number]) => {
    const a = answers[sid]?.[q.key] ?? {};
    return `<li class="pc-item"><span class="pc-name"><b>${esc(L(q.name))}</b><small>${esc(L(q.agency))}${q.every !== null ? (lang === "zh" ? "，需要续期" : ", renews") : ""}</small></span>
      <span class="pc-seg" role="group" aria-label="${esc(L(q.name))}">${HAVE.map(([v, l]) => `<button type="button" data-s="${sid}" data-k="${esc(q.key)}" data-v="${v}" aria-pressed="${a.have === v}">${L(l)}</button>`).join("")}</span>
      ${a.have === "have" && q.every !== null ? `<label class="pc-date"><span>${L(B("Renews on", "续期日期"))}</span><input type="date" data-s="${sid}" data-d="${esc(q.key)}" value="${esc(a.renews ?? "")}"></label>` : ""}</li>`;
  };
  const finding = (f: Finding) => `<li class="pc-find k-${f.kind}"><span class="pc-tag">${L(TAG[f.kind])}</span><span class="pc-name"><b>${esc(L(f.name))}</b><small>${esc(L(findingLine(f)))}</small></span></li>`;

  const render = () => {
    const head = `<button type="button" class="pc-x" data-close aria-label="${L(B("Close", "关闭"))}">×</button>`;
    if (step === "stores") {
      sheet.innerHTML = `${head}<h2>${L(B("Check the stores you already run", "检查您已开业的门店"))}</h2>
        <p class="pc-sub">${L(B("Each store's city and what it sells. Placetta lists what each one has to hold, from its registry of official forms, and shows the gaps. Free, no sign-up, no AI.", "填写每家门店的城市和业态。快哉根据官方表格登记库列出每家店必须持有的许可，并找出缺口。免费，无需注册，不使用 AI。"))}</p>
        <datalist id="pc-cities">${CITIES.map(c => `<option value="${c}">`).join("")}</datalist>
        <ol class="pc-rows">${stores.map(s => `<li class="pc-row">
          <label class="pc-f"><span>${L(B("City and state", "城市和州"))}</span><input data-city="${s.id}" list="pc-cities" value="${esc(s.city)}" placeholder="Flushing, NY" autocomplete="off" aria-invalid="${!!s.city && !readPlace(s.city)}"></label>
          <label class="pc-f"><span>${L(B("What it sells", "业态"))}</span><select data-what="${s.id}">${KINDS.map(k => `<option value="${esc(k.en)}"${k.en === s.what ? " selected" : ""}>${esc(L(k))}</option>`).join("")}</select></label>
          ${stores.length > 1 ? `<button type="button" class="pc-rm" data-rm="${s.id}" aria-label="${L(B("Remove this store", "移除这家门店"))}">×</button>` : "<span></span>"}</li>`).join("")}</ol>
        ${warn ? `<p class="pc-warn" role="alert">${esc(warn)}</p>` : ""}
        <div class="pc-act">${stores.length < 20 ? `<button type="button" class="pc-btn pc-line" data-add>${L(B("Add another store", "再添加一家"))}</button>` : ""}<button type="button" class="pc-btn pc-ink" data-next>${L(B("Check my stores", "检查我的门店"))}</button></div>`;
    } else if (step === "check") {
      const rs = results(), w = whole(rs);
      sheet.innerHTML = `${head}<h2>${L(B("What each store holds", "每家门店持有的许可"))}</h2>
        <p class="pc-sub">${L(B("Tick what you have and add the renewal date from the certificate when you know it. Anything you're not sure about stays not sure.", "勾选您已有的许可，知道续期日期的请按证书填写。不确定的保留“不确定”。"))}</p>
        ${w.length ? `<section class="pc-store"><b>${L(B("For the whole business", "整个企业"))}</b><small>${L(B("Held once, for every store", "只需一份，覆盖所有门店"))}</small><ul class="pc-items">${w.map(q => item("biz", q)).join("")}</ul></section>` : ""}
        ${rs.map(r => `<section class="pc-store"><b>${esc(r.place)}</b><small>${esc(L(KINDS.find(k => k.en === r.store.what) ?? B(r.store.what, r.store.what)))}</small>
          <ul class="pc-items">${r.required.filter(q => !q.whole).map(q => item(r.store.id, q)).join("")}</ul></section>`).join("")}
        <div class="pc-act"><button type="button" class="pc-btn pc-soft" data-back="stores">${L(B("Back", "返回"))}</button><button type="button" class="pc-btn pc-ink" data-results>${L(B("Show my gaps", "查看缺口"))}</button></div>`;
    } else {
      const rs = results(), t = totals(rs), w = new Set(whole(rs).map(q => q.key));
      const work = t.gap + t.lapsed + t.unsure;
      const wholeTodo = (rs[0]?.findings ?? []).filter(f => w.has(f.key) && f.kind !== "ok").sort((a, b) => RANK[a.kind] - RANK[b.kind]);
      sheet.innerHTML = `${head}<h2>${work ? L(B(`${t.stores} store${t.stores === 1 ? "" : "s"} checked: ${work} thing${work === 1 ? "" : "s"} to sort out`, `已检查 ${t.stores} 家门店：${work} 项需要处理`)) : L(B("Everything you told us is in order", "您填写的各项均已具备"))}</h2>
        <dl class="pc-tot"><div class="${t.lapsed ? "w" : ""}"><dt>${L(B("Expired", "已过期"))}</dt><dd>${t.lapsed}</dd></div><div class="${t.gap ? "w" : ""}"><dt>${L(B("Missing", "缺少"))}</dt><dd>${t.gap}</dd></div>
          <div><dt>${L(B("Renew within 60 days", "60 天内续期"))}</dt><dd>${t.due_soon}</dd></div><div><dt>${L(B("Not sure", "不确定"))}</dt><dd>${t.unsure}</dd></div></dl>
        ${wholeTodo.length ? `<section class="pc-store"><b>${L(B("For the whole business", "整个企业"))}</b><small></small><ul class="pc-items">${wholeTodo.map(finding).join("")}</ul></section>` : ""}
        ${rs.map(r => { const todo = r.findings.filter(f => f.kind !== "ok" && !w.has(f.key)).sort((a, b) => RANK[a.kind] - RANK[b.kind]); const ok = r.findings.filter(f => f.kind === "ok" && !w.has(f.key)).length;
          return `<section class="pc-store"><b>${esc(r.place)}</b><small>${lang === "zh" ? `${ok} 项已具备` : `${ok} in order`}</small>${todo.length ? `<ul class="pc-items">${todo.map(finding).join("")}</ul>` : `<p class="pc-ok">${L(B("Nothing to fix for this store.", "这家门店没有需要处理的事项。"))}</p>`}</section>`; }).join("")}
        <p class="pc-note">${L(B("From Placetta's registry of official forms. Odelia confirms each one with the agency before anything is filed. This check isn't legal advice.", "依据快哉的官方表格登记库。提交前，Odelia 会向机构逐项核实。本检查不构成法律意见。"))}</p>
        <div class="pc-act"><button type="button" class="pc-btn pc-soft" data-back="check">${L(B("Back", "返回"))}</button><button type="button" class="pc-btn pc-ink" data-lead>${L(B("Get my plan for these", "获取处理这些事项的计划"))}</button></div>`;
    }
  };

  /** What the lead keeps: per store, the place, what it sells and the names of what needs work. Small enough for the row. */
  const summary = (rs: StoreResult[]) => {
    const t = totals(rs);
    return { totals: { stores: t.stores, gap: t.gap, lapsed: t.lapsed, due_soon: t.due_soon, unsure: t.unsure, no_date: t.no_date },
      stores: rs.slice(0, 8).map(r => ({ place: r.place, what: r.store.what,
        needs: r.findings.filter(f => f.kind !== "ok").slice(0, 8).map(f => ({ kind: f.kind, permit: f.name.en.slice(0, 60), ...(f.date ? { date: f.date } : {}) })) })) };
  };

  sheet.addEventListener("input", e => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.city) { const s = stores.find(x => x.id === el.dataset.city); if (s) s.city = el.value; el.setAttribute("aria-invalid", String(!!el.value && !readPlace(el.value))); }
    if (el.dataset.d && el.dataset.s) { answers = { ...answers, [el.dataset.s]: { ...(answers[el.dataset.s] ?? {}), [el.dataset.d]: { ...(answers[el.dataset.s]?.[el.dataset.d] ?? {}), renews: el.value } } }; }
  });
  sheet.addEventListener("change", e => { const el = e.target as HTMLSelectElement; if (el.dataset.what) { const s = stores.find(x => x.id === el.dataset.what); if (s) s.what = el.value; } });
  sheet.addEventListener("click", e => {
    const el = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!el) return;
    if (el.hasAttribute("data-close")) { close(); return; }
    if (el.hasAttribute("data-add")) { stores = [...stores, blank()]; render(); return; }
    if (el.dataset.rm) { stores = stores.filter(s => s.id !== el.dataset.rm); render(); return; }
    if (el.hasAttribute("data-next")) {
      if (stores.some(s => !readPlace(s.city))) { warn = L(B("Add each store's city and state, like Flushing, NY.", "请为每家门店填写城市和州，例如 Flushing, NY。")); render(); return; }
      warn = ""; step = "check"; render(); sheet.scrollTop = 0; return;
    }
    if (el.dataset.back) { step = el.dataset.back as typeof step; render(); sheet.scrollTop = 0; return; }
    if (el.hasAttribute("data-results")) { step = "results"; render(); sheet.scrollTop = 0; return; }
    if (el.dataset.s && el.dataset.k && el.dataset.v) {
      const sid = el.dataset.s, key = el.dataset.k;
      answers = { ...answers, [sid]: { ...(answers[sid] ?? {}), [key]: { ...(answers[sid]?.[key] ?? {}), have: el.dataset.v as Have } } };
      const top = sheet.scrollTop; render(); sheet.scrollTop = top; return;
    }
    if (el.hasAttribute("data-lead")) {
      const rs = results(), first = rs[0], food = rs.some(r => !/^Retail$/.test(r.store.what));
      const n = rs.length;
      close();
      window.placettaLead?.({ source: "stores_check", market: first?.place ?? "", industry: food ? "fb" : "retail", locations: n <= 1 ? "1" : n <= 5 ? "2–5" : n <= 20 ? "6–20" : "20+", check: summary(rs) });
    }
  });
  render();
  (sheet.querySelector("input") as HTMLInputElement | null)?.focus();
}

window.placettaCheck = { open };
