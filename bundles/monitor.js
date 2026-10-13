var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// dep:npm:@supabase/supabase-js@2
var require_supabase_js_2 = __commonJS({
  "dep:npm:@supabase/supabase-js@2"(exports, module) {
    module.exports = globalThis.__placettaDeps["npm:@supabase/supabase-js@2"];
  }
});

// ../../../../../../home/claude/placetta-agent/supabase/functions/monitor/index.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);

// ../../../../../../home/claude/placetta-agent/supabase/functions/_shared/odelia.ts
function plainText(s) {
  const lines = String(s ?? "").replace(/```[a-z]*\n?([\s\S]*?)```/gi, "$1").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)").replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1$2").replace(/`([^`]+)`/g, "$1").replace(/\s*[—–]\s*/g, ", ").split(/\n/).map((l) => l.replace(/^\s*(#{1,6}|>|[-*+•·]|\d+[.)])\s+/, "").replace(/^\s*\|.*\|\s*$/, (row) => row.split("|").map((c) => c.trim()).filter(Boolean).join(", ")).trim()).filter((l) => l && !/^[-|:\s]+$/.test(l));
  return lines.map((l, i) => i < lines.length - 1 && !/[.!?。！？:：,，;；]$/.test(l) ? l + (/[㐀-鿿]$/.test(l) ? "\u3002" : ".") : l).join(" ").replace(/\s+([。！？，])/g, "$1").replace(/([。！？，])\s+/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}
function urgency(u, critical) {
  const parts = u.dedupe.split(":"), head = parts[0], bucket2 = Number(parts[parts.length - 1]);
  const title = `${u.title?.en ?? ""}`.toLowerCase();
  const isCritical = !!u.app_id && critical.has(u.app_id);
  if (head === "lapsed") return "urgent";
  if (/inspection/.test(title) && /(fail|returned|overdue|closure|closed)/.test(title)) return "urgent";
  if (head === "overdue") return isCritical ? "urgent" : "important";
  if (head === "filing" && parts[2] === "rejected") return isCritical ? "urgent" : "important";
  if (head === "filing" && parts[2] === "needs_info") return "important";
  if (head === "needs_you" || head === "pay" || head === "approval") return "important";
  if ((head === "deadline" || head === "renewal" || head === "permit") && Number.isFinite(bucket2) && bucket2 <= 7) return "important";
  return null;
}
function noticeText(u, business, lang) {
  const t = plainText(u.title[lang] || u.title.en).replace(/[.。]$/, ""), b = plainText(u.body?.[lang] || u.body?.en || "");
  const s = lang === "zh" ? `\u5FEB\u54C9\uFF1A${t}\uFF08${business}\uFF09\u3002${b}` : `Placetta: ${t} (${business}). ${b}`;
  return s.trim().slice(0, 300);
}
function appLink(origin, ws, approval) {
  if (!origin) return "";
  const q = new URLSearchParams();
  if (ws) q.set("ws", ws);
  if (approval) q.set("approval", approval);
  const qs = q.toString();
  return `${origin}/app/${qs ? "?" + qs : ""}`;
}

// ../../../../../../home/claude/placetta-agent/supabase/functions/monitor/index.ts
var admin = (0, import_supabase_js_2.createClient)(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }
});
var RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
var FROM = Deno.env.get("MAIL_FROM") ?? "";
var APP = ((Deno.env.get("APP_ORIGINS") ?? "").split(",")[0] ?? "").trim().replace(/\/+$/, "");
var SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
var MAX_WATCHES = Number(Deno.env.get("WEEKLY_CHECKS_PER_DAY") ?? "40");
var json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
var day = (d) => d.toISOString().slice(0, 10);
var daysUntil = (from, to) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5);
var isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
var bi = (v) => v && typeof v === "object" && "en" in v ? { en: String(v.en ?? ""), zh: String(v.zh ?? v.en ?? "") } : { en: String(v ?? ""), zh: String(v ?? "") };
var when = (n, en, zh) => {
  const e = n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`, z = n <= 0 ? "\u4ECA\u5929" : n === 1 ? "\u660E\u5929" : `${n} \u5929\u540E`;
  return { en: en ? `${en} ${e}` : e, zh: z + zh };
};
var bucket = (n, steps) => steps.find((s) => n <= s);
var esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function deadlineUpdates(ws, list, today) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const d = raw;
    if (!d || typeof d.id !== "string" || !isDate(d.date)) continue;
    const n = daysUntil(today, d.date), title = bi(d.title);
    if (d.kind === "renewal") {
      const b = n >= 0 ? bucket(n, [1, 7, 14, 30, 60]) : void 0;
      if (b !== void 0) out.push({
        workspace_id: ws,
        kind: "renewal",
        app_id: d.app ?? null,
        dedupe: `renewal:${d.id}:${d.date}:${b}`,
        title: { en: `${title.en}: ${when(n, "expires", "\u5230\u671F").en}`, zh: `${title.zh}\uFF1A${when(n, "expires", "\u5230\u671F").zh}` },
        body: { en: `Expires ${d.date}. Ask Placetta to start the renewal.`, zh: `${d.date} \u5230\u671F\u3002\u53EF\u4EE5\u8BA9\u5FEB\u54C9\u5F00\u59CB\u7EED\u529E\u3002` }
      });
    } else if (n >= 0) {
      const b = bucket(n, [0, 1, 3, 7, 14]);
      if (b !== void 0) out.push({
        workspace_id: ws,
        kind: "deadline",
        app_id: d.app ?? null,
        dedupe: `deadline:${d.id}:${d.date}:${b}`,
        title: { en: `${title.en}: ${when(n, d.kind === "due" ? "due" : "", d.kind === "due" ? "\u622A\u6B62" : "").en}`, zh: `${title.zh}\uFF1A${when(n, d.kind === "due" ? "due" : "", d.kind === "due" ? "\u622A\u6B62" : "").zh}` },
        body: { en: `Date: ${d.date}.`, zh: `\u65E5\u671F\uFF1A${d.date}\u3002` }
      });
    } else if (d.kind === "due" && n >= -30) {
      out.push({
        workspace_id: ws,
        kind: "deadline",
        app_id: d.app ?? null,
        dedupe: `overdue:${d.id}:${d.date}`,
        title: { en: `Overdue: ${title.en}`, zh: `\u5DF2\u903E\u671F\uFF1A${title.zh}` },
        body: { en: `It was due ${d.date}.`, zh: `\u622A\u6B62\u65E5\u671F\u4E3A ${d.date}\u3002` }
      });
    }
  }
  return out;
}
function storeUpdates(ws, stores, today) {
  const out = [];
  for (const raw of Array.isArray(stores) ? stores : []) {
    const s = raw;
    if (typeof s?.id !== "string") continue;
    const store = bi(s.name);
    for (const p of Array.isArray(s.permits) ? s.permits : []) {
      if (!p || !isDate(p.expires)) continue;
      const n = daysUntil(today, p.expires), name = bi(p.name);
      const b = n >= 0 ? bucket(n, [1, 7, 14, 30, 60]) : void 0;
      if (b !== void 0) out.push({
        workspace_id: ws,
        kind: "renewal",
        dedupe: `permit:${s.id}:${name.en}:${p.expires}:${b}`,
        title: { en: `${store.en}: ${name.en} ${when(n, "expires", "\u5230\u671F").en}`, zh: `${store.zh}\uFF1A${name.zh}${when(n, "expires", "\u5230\u671F").zh}` },
        body: { en: `Expires ${p.expires}. Placetta can start the renewal now.`, zh: `${p.expires} \u5230\u671F\u3002\u5FEB\u54C9\u73B0\u5728\u5C31\u53EF\u4EE5\u5F00\u59CB\u7EED\u529E\u3002` }
      });
      else if (n < 0 && n >= -30) out.push({
        workspace_id: ws,
        kind: "renewal",
        dedupe: `lapsed:${s.id}:${name.en}:${p.expires}`,
        title: { en: `Lapsed: ${store.en}, ${name.en}`, zh: `\u5DF2\u8FC7\u671F\uFF1A${store.zh}\uFF0C${name.zh}` },
        body: { en: `It expired ${p.expires}. Operating without it risks a fine or a closure.`, zh: `\u5DF2\u4E8E ${p.expires} \u8FC7\u671F\u3002\u65E0\u8BC1\u7ECF\u8425\u53EF\u80FD\u88AB\u7F5A\u6B3E\u6216\u505C\u4E1A\u3002` }
      });
    }
  }
  return out;
}
function weekAhead(ws, state, openFilings, today) {
  const dl = (Array.isArray(state?.deadlines) ? state.deadlines : []).filter((d) => d && isDate(d.date));
  const due = dl.filter((d) => d.kind !== "renewal" && daysUntil(today, d.date) >= 0 && daysUntil(today, d.date) <= 14).length;
  let renew = dl.filter((d) => d.kind === "renewal" && daysUntil(today, d.date) >= 0 && daysUntil(today, d.date) <= 60).length;
  for (const s of Array.isArray(state?.stores) ? state.stores : [])
    for (const p of Array.isArray(s?.permits) ? s.permits : []) if (isDate(p?.expires) && daysUntil(today, p.expires) >= 0 && daysUntil(today, p.expires) <= 60) renew++;
  const stores = Array.isArray(state?.stores) ? state.stores.length : 0;
  if (!due && !renew && !openFilings && !stores) return null;
  const week = today;
  const parts = [due && `${due} due in the next 2 weeks`, renew && `${renew} renewal${renew === 1 ? "" : "s"} in the next 60 days`, openFilings && `${openFilings} filing${openFilings === 1 ? "" : "s"} in progress`].filter(Boolean);
  const zh = [due && `\u672A\u6765\u4E24\u5468 ${due} \u9879\u5230\u671F`, renew && `\u672A\u6765 60 \u5929 ${renew} \u9879\u7EED\u671F`, openFilings && `${openFilings} \u9879\u7533\u8BF7\u529E\u7406\u4E2D`].filter(Boolean);
  return {
    workspace_id: ws,
    kind: "deadline",
    dedupe: `week:${week}`,
    title: { en: `Your week: ${parts.length ? parts.join(", ") : `${stores} store${stores === 1 ? "" : "s"} all clear`}`, zh: `\u672C\u5468\u6982\u89C8\uFF1A${zh.length ? zh.join("\uFF0C") : `${stores} \u5BB6\u95E8\u5E97\u4E00\u5207\u6B63\u5E38`}` },
    body: { en: "Open Placetta for the full list. Placetta handles what it can and asks you only for what it can't.", zh: "\u6253\u5F00\u5FEB\u54C9\u67E5\u770B\u5B8C\u6574\u6E05\u5355\u3002\u5FEB\u54C9\u80FD\u529E\u7684\u90FD\u4F1A\u529E\u597D\uFF0C\u53EA\u5728\u5FC5\u8981\u65F6\u8BF7\u60A8\u5904\u7406\u3002" }
  };
}
function filingUpdates(f, since, now) {
  const out = [], t = bi(f.title);
  if (f.updated_at > since) {
    const said = {
      submitted: [{ en: `Submitted to the agency: ${t.en}`, zh: `\u5DF2\u63D0\u4EA4\u81F3\u673A\u6784\uFF1A${t.zh}` }, f.confirmation_number ? { en: `Confirmation ${f.confirmation_number}.`, zh: `\u786E\u8BA4\u53F7 ${f.confirmation_number}\u3002` } : void 0],
      accepted: [{ en: `Approved by the agency: ${t.en}`, zh: `\u673A\u6784\u5DF2\u6279\u51C6\uFF1A${t.zh}` }, { en: "The approval is in Documents when the agency sends it.", zh: "\u673A\u6784\u53D1\u6765\u6279\u51C6\u6587\u4EF6\u540E\u4F1A\u653E\u5728\u201C\u6587\u4EF6\u201D\u4E2D\u3002" }],
      rejected: [{ en: `Returned by the agency: ${t.en}`, zh: `\u88AB\u673A\u6784\u9000\u56DE\uFF1A${t.zh}` }, f.note ? { en: f.note, zh: f.note } : { en: "The team will tell you what to fix.", zh: "\u56E2\u961F\u4F1A\u544A\u8BC9\u60A8\u9700\u8981\u4FEE\u6539\u4EC0\u4E48\u3002" }],
      needs_info: [{ en: `Action needed: ${t.en}`, zh: `\u9700\u8981\u60A8\u5904\u7406\uFF1A${t.zh}` }, f.payment_url ? { en: "The agency fee is ready to pay.", zh: "\u673A\u6784\u8D39\u7528\u53EF\u4EE5\u652F\u4ED8\u4E86\u3002" } : f.note ? { en: f.note, zh: f.note } : void 0]
    };
    const s = said[f.status];
    if (s) out.push({ workspace_id: f.workspace_id, kind: "filing", app_id: f.app_id, dedupe: `filing:${f.id}:${f.status}:${f.updated_at.slice(0, 10)}`, title: s[0], body: s[1] });
  }
  if (f.agent_state === "needs_you" && f.updated_at > since) {
    out.push({
      workspace_id: f.workspace_id,
      kind: "filing",
      app_id: f.app_id,
      dedupe: `needs_you:${f.id}:${f.updated_at.slice(0, 10)}`,
      title: { en: `Placetta needs you for a step: ${t.en}`, zh: `\u9700\u8981\u60A8\u5B8C\u6210\u4E00\u6B65\uFF1A${t.zh}` },
      body: { en: "Open the filing to finish it. Placetta carries on right after.", zh: "\u6253\u5F00\u8BE5\u7533\u8BF7\u5B8C\u6210\u8FD9\u4E00\u6B65\uFF0C\u5FEB\u54C9\u968F\u540E\u7EE7\u7EED\u529E\u7406\u3002" }
    });
  }
  if (f.status === "needs_info" && f.payment_url && !f.customer_paid_at && now - Date.parse(f.updated_at) > 2 * 864e5) {
    const week = Math.floor(now / (7 * 864e5));
    out.push({
      workspace_id: f.workspace_id,
      kind: "payment",
      app_id: f.app_id,
      dedupe: `pay:${f.id}:${week}`,
      title: { en: `Agency fee still unpaid: ${t.en}`, zh: `\u673A\u6784\u8D39\u7528\u5C1A\u672A\u652F\u4ED8\uFF1A${t.zh}` },
      body: { en: `The team submits it as soon as the fee${f.fee_paid ? ` ($${f.fee_paid})` : ""} is paid.`, zh: `\u8D39\u7528${f.fee_paid ? `\uFF08$${f.fee_paid}\uFF09` : ""}\u652F\u4ED8\u540E\uFF0C\u56E2\u961F\u4F1A\u7ACB\u5373\u63D0\u4EA4\u3002` }
    });
  }
  return out;
}
function criticalApps(state) {
  const apps = (state ?? {}).apps;
  return new Set((Array.isArray(apps) ? apps : []).filter((a) => a && typeof a === "object" && a.critical === true).map((a) => String(a.id ?? "")));
}
function weekdayOf(id) {
  let h = 0;
  for (const c of id) h = h * 31 + c.charCodeAt(0) >>> 0;
  return h % 7;
}
function watchDue(rows, weekday, recent) {
  return rows.filter((w) => {
    const apps = (w.state ?? {}).apps;
    return Array.isArray(apps) && apps.length > 0 && weekdayOf(w.id) === weekday && !recent.has(w.id);
  }).map((w) => w.id);
}
async function sendMail(to, subject, text, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, text, html })
  });
  if (!res.ok) console.error("resend", res.status, (await res.text()).slice(0, 200));
  return res.ok;
}
function digest(business, items) {
  const link = APP ? `${APP}/app/` : "";
  const lines = items.map((u) => `- ${u.title.en}${u.body ? `. ${u.body.en}` : ""}`).join("\n");
  const linesZh = items.map((u) => `- ${u.title.zh}${u.body ? `\u3002${u.body.zh}` : ""}`).join("\n");
  const text = `${business}: ${items.length} update${items.length === 1 ? "" : "s"} from Placetta

${lines}

${linesZh}${link ? `

Open Placetta: ${link}` : ""}
`;
  const li = (u, lang) => `<li style="margin:0 0 10px"><b>${esc(u.title[lang])}</b>${u.body ? `<br><span style="color:#5B6470">${esc(u.body[lang])}</span>` : ""}</li>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 22px;color:#0E1116">
<p style="font-size:13px;color:#5B6470;margin:0 0 6px">Placetta</p>
<h1 style="font-size:20px;margin:0 0 18px">${esc(business)}: ${items.length} update${items.length === 1 ? "" : "s"}</h1>
<ul style="padding-left:18px;margin:0 0 18px;font-size:14px;line-height:1.5">${items.map((u) => li(u, "en")).join("")}</ul>
<ul style="padding-left:18px;margin:0 0 22px;font-size:14px;line-height:1.5">${items.map((u) => li(u, "zh")).join("")}</ul>
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#0E1116;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">Open Placetta</a></p>` : ""}
<p style="font-size:12px;color:#98A0AB;margin:22px 0 0">You get this because you own this workspace. Nothing is filed, paid or sent without your approval.</p></div>`;
  return { subject: `${business}: ${items.length} update${items.length === 1 ? "" : "s"} from Placetta`, text, html };
}
function hqReport(rows, today) {
  const brands = [...new Set(rows.map((r) => r.brand).filter((b) => !!b))];
  const brand = brands.length === 1 ? brands[0] : "";
  const lines = rows.flatMap((r) => (Array.isArray(r.stores) ? r.stores : []).map((s) => ({ ...s, franchisee: r.name })));
  const count = (st) => lines.filter((l) => l.status === st).length;
  const t = { stores: lines.length, current: count("current"), due: count("due"), overdue: count("overdue") };
  const rank = (st) => st === "overdue" ? 0 : 1;
  const risk = lines.filter((l) => l.status === "overdue" || l.status === "due").sort((a, b) => rank(a.status) - rank(b.status) || String(a.next?.date ?? "9999").localeCompare(String(b.next?.date ?? "9999")));
  const say = (l) => {
    const date = l.next?.date;
    const n = isDate(date) ? daysUntil(today, date) : null;
    const item = l.next ? bi(l.next.title).en || "Unnamed item" : "Item";
    const when2 = n === null ? "" : n < 0 ? `${-n} day${n === -1 ? "" : "s"} overdue` : n === 0 ? "due today" : `due in ${n} day${n === 1 ? "" : "s"}`;
    const more = (l.overdue ?? 0) + (l.due_30 ?? 0) - 1;
    return { where: `${l.franchisee}, ${bi(l.name).en}`, what: `${item}${date ? `, ${date}` : ""}${when2 ? ` (${when2})` : ""}${more > 0 ? `, and ${more} more` : ""}` };
  };
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const head = `${brand ? brand + ": " : ""}${plural(t.stores, "store")}, ${t.current} fully current, ${t.due} due in 30 days, ${t.overdue} overdue`;
  const subject = `${brand ? brand + " " : ""}weekly store status: ${t.overdue ? `${t.overdue} overdue` : t.due ? `${t.due} due soon` : "all current"}`;
  const link = APP ? `${APP}/app/` : "";
  const across = `Across ${plural(rows.length, "franchisee")}, week of ${today}.`;
  const clear = "Every store is current. Nothing is due in the next 30 days.";
  const why = "You get this because a franchisee shared its store status with this email in Placetta. Ask them to remove it to stop.";
  const text = `${head}
${across}

` + (risk.length ? `At risk:
${risk.map((l) => {
    const x = say(l);
    return `- ${x.where}: ${x.what}`;
  }).join("\n")}` : clear) + `${link ? `

See every store live: ${link}` : ""}

${why}
`;
  const tile = (n, label, color = "#0E1116") => `<td style="padding:12px 14px;background:#F5F7FA;border-radius:12px;width:25%"><div style="font-size:24px;color:${color}">${n}</div><div style="font-size:12px;color:#5B6470">${label}</div></td>`;
  const riskRows = risk.map((l) => {
    const x = say(l);
    return `<tr><td style="padding:8px 0;border-top:1px solid #ECF0F5;vertical-align:top"><b>${esc(x.where)}</b><br><span style="color:${l.status === "overdue" ? "#C0473A" : "#A86F14"}">${esc(x.what)}</span></td></tr>`;
  }).join("");
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:28px 22px;color:#0E1116">
<p style="font-size:13px;color:#5B6470;margin:0 0 6px">Placetta for headquarters</p>
<h1 style="font-size:20px;margin:0 0 4px">${esc(brand ? `${brand}: weekly store status` : "Weekly store status")}</h1>
<p style="font-size:13px;color:#5B6470;margin:0 0 18px">${esc(across)}</p>
<table role="presentation" cellspacing="6" style="width:100%;border-collapse:separate;margin:0 0 18px"><tr>${tile(t.stores, "Stores")}${tile(t.current, "Fully current")}${tile(t.due, "Due in 30 days", t.due ? "#A86F14" : "#0E1116")}${tile(t.overdue, "Overdue", t.overdue ? "#C0473A" : "#0E1116")}</tr></table>
${risk.length ? `<h2 style="font-size:15px;margin:0 0 8px">At risk</h2><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.45">${riskRows}</table>` : `<p style="font-size:14px;margin:0">${clear}</p>`}
${link ? `<p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#0E1116;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">See every store live</a></p>` : ""}
<p style="font-size:12px;color:#98A0AB;margin:22px 0 0">${why}</p></div>`;
  return { subject, text, html };
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const { data: okKey } = await admin.rpc("monitor_key_ok", { p_key: req.headers.get("x-monitor-key") ?? "" });
  if (okKey !== true) return json(401, { error: "unauthorized" });
  const started = /* @__PURE__ */ new Date(), today = day(started), now = started.getTime();
  const { data: settings } = await admin.from("app_settings").select("monitor_last_run").maybeSingle();
  const since = settings?.monitor_last_run ?? new Date(now - 864e5).toISOString();
  const created = [];
  const byWs = /* @__PURE__ */ new Map();
  const names = /* @__PURE__ */ new Map();
  const all = [];
  const states = /* @__PURE__ */ new Map();
  for (let from = 0; ; from += 500) {
    const { data: rows, error } = await admin.from("workspaces").select("id, name, state").order("created_at").range(from, from + 499);
    if (error) return json(500, { error: "workspaces: " + error.code });
    for (const w of rows ?? []) {
      names.set(w.id, String(w.name ?? "Your business"));
      const st = w.state ?? {};
      byWs.set(w.id, [...deadlineUpdates(w.id, st.deadlines, today), ...storeUpdates(w.id, w.state?.stores, today)]);
      states.set(w.id, w.state ?? null);
      all.push({ id: w.id, state: { apps: w.state?.apps } });
    }
    if (!rows || rows.length < 500) break;
  }
  const { data: filings, error: fe } = await admin.from("filings").select("id, workspace_id, app_id, title, status, agent_state, updated_at, approved_at, payment_url, customer_paid_at, fee_paid, confirmation_number, assigned_to, note").neq("status", "canceled");
  if (fe) return json(500, { error: "filings: " + fe.code });
  for (const f of filings ?? []) byWs.get(f.workspace_id)?.push(...filingUpdates(f, since, now));
  if (started.getUTCDay() === 1) {
    const open = /* @__PURE__ */ new Map();
    for (const f of filings ?? []) if (["requested", "in_progress", "needs_info", "submitted"].includes(f.status)) open.set(f.workspace_id, (open.get(f.workspace_id) ?? 0) + 1);
    for (const [ws, list] of byWs) {
      const u = weekAhead(ws, states.get(ws) ?? null, open.get(ws) ?? 0, today);
      if (u) list.push(u);
    }
  }
  for (const [ws, list] of byWs) {
    if (!list.length) continue;
    const { data: fresh, error } = await admin.from("updates").upsert(list.map((u) => ({ ...u, app_id: u.app_id ?? null, body: u.body ?? null })), { onConflict: "workspace_id,dedupe", ignoreDuplicates: true }).select("dedupe");
    if (error) {
      console.error("updates insert", ws, error.code);
      continue;
    }
    const got = new Set((fresh ?? []).map((r) => r.dedupe));
    created.push(...list.filter((u) => got.has(u.dedupe)));
  }
  let phoned = 0;
  const notices = created.map((u) => ({ u, level: urgency(u, criticalApps(all.find((w) => w.id === u.workspace_id)?.state)) })).filter((x) => x.level);
  if (notices.length) {
    const wsIds = [...new Set(notices.map((x) => x.u.workspace_id))];
    const { data: owners } = await admin.from("workspace_members").select("workspace_id, user_id").in("workspace_id", wsIds).eq("role", "owner");
    const ownerIds = [...new Set((owners ?? []).map((o) => o.user_id))];
    const { data: links } = ownerIds.length ? await admin.from("phone_links").select("user_id, lang, texts_on, calls_on").in("user_id", ownerIds).not("verified_at", "is", null).is("opted_out_at", null) : { data: [] };
    const byUser = new Map((links ?? []).map((l) => [l.user_id, l]));
    const rows = [];
    for (const { u, level } of notices) {
      for (const o of (owners ?? []).filter((x) => x.workspace_id === u.workspace_id)) {
        const l = byUser.get(o.user_id);
        if (!l || !l.texts_on && !(level === "urgent" && l.calls_on)) continue;
        const lang = l.lang === "zh" ? "zh" : "en";
        rows.push({
          user_id: o.user_id,
          workspace_id: u.workspace_id,
          kind: level === "urgent" && l.calls_on ? "call" : "text",
          urgent: level === "urgent",
          body: noticeText(u, names.get(u.workspace_id) ?? "", lang),
          link: appLink(APP, u.workspace_id) || null,
          dedupe: `update:${u.workspace_id}:${u.dedupe}`.slice(0, 300)
        });
      }
    }
    if (rows.length) {
      const { data: queued, error } = await admin.from("odelia_outbox").upsert(rows, { onConflict: "user_id,dedupe", ignoreDuplicates: true }).select("id");
      if (error) console.error("odelia outbox", error.code);
      else phoned = queued?.length ?? 0;
      if (phoned) await fetch(`${SUPABASE_URL}/functions/v1/odelia-sms`, { method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": req.headers.get("x-monitor-key") ?? "" }, body: JSON.stringify({ action: "flush" }) }).catch(() => null);
    }
  }
  let emailed = 0, team = 0;
  if (RESEND && FROM) {
    const fresh = /* @__PURE__ */ new Map();
    for (const u of created) fresh.set(u.workspace_id, [...fresh.get(u.workspace_id) ?? [], u]);
    for (const [ws, items] of fresh) {
      const { data: owners } = await admin.from("workspace_members").select("user_id").eq("workspace_id", ws).eq("role", "owner");
      const emails = [];
      for (const o of owners ?? []) {
        const { data } = await admin.auth.admin.getUserById(o.user_id);
        if (data?.user?.email && data.user.email_confirmed_at) emails.push(data.user.email);
      }
      if (!emails.length) continue;
      const m = digest(names.get(ws) ?? "Your business", items.slice(0, 20));
      if (await sendMail(emails, m.subject, m.text, m.html)) emailed++;
    }
    const stale = (filings ?? []).filter((f) => f.status === "requested" && !f.assigned_to && f.approved_at && now - Date.parse(f.approved_at) > 864e5);
    if (stale.length) {
      const { data: staff } = await admin.from("staff_emails").select("email");
      const to = (staff ?? []).map((s) => s.email).filter(Boolean);
      if (to.length) {
        const lines = stale.map((f) => `- ${bi(f.title).en} (${names.get(f.workspace_id) ?? f.workspace_id}), approved ${f.approved_at.slice(0, 10)}`).join("\n");
        if (await sendMail(
          to,
          `${stale.length} approved filing${stale.length === 1 ? "" : "s"} waiting for the team`,
          `Nobody has picked these up yet:

${lines}

${APP ? `Filing queue: ${APP}/app/` : ""}`,
          `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif"><p>Nobody has picked these up yet:</p><ul>${stale.map((f) => `<li>${esc(bi(f.title).en)} (${esc(names.get(f.workspace_id) ?? "")}), approved ${f.approved_at.slice(0, 10)}</li>`).join("")}</ul>${APP ? `<p><a href="${esc(APP)}/app/">Open the filing queue</a></p>` : ""}</div>`
        )) team = stale.length;
      }
    }
  }
  let hqSent = 0;
  if (RESEND && FROM && started.getUTCDay() === 1) {
    const { data: hq, error: he } = await admin.rpc("hq_weekly");
    if (he) console.error("hq_weekly", he.code);
    const byEmail = /* @__PURE__ */ new Map();
    for (const r of hq ?? []) byEmail.set(r.hq_email, [...byEmail.get(r.hq_email) ?? [], r]);
    for (const [email, rows] of byEmail) {
      const { data: claim, error: ce } = await admin.from("hq_reports").upsert({ hq_email: email, week: today }, { onConflict: "hq_email,week", ignoreDuplicates: true }).select("hq_email");
      if (ce || !claim?.length) continue;
      const m = hqReport(rows, today);
      if (await sendMail([email], m.subject, m.text, m.html)) hqSent++;
      else await admin.from("hq_reports").delete().eq("hq_email", email).eq("week", today);
    }
  }
  let watches = 0;
  if (Deno.env.get("ANTHROPIC_API_KEY") && Deno.env.get("WEEKLY_CHECKS") !== "off") {
    const { data: recent } = await admin.from("agent_runs").select("workspace_id").eq("kind", "watch").gt("created_at", new Date(now - 6 * 864e5).toISOString());
    for (const id of watchDue(all, started.getUTCDay(), new Set((recent ?? []).map((r) => r.workspace_id))).slice(0, MAX_WATCHES)) {
      const { data: plan } = await admin.rpc("plan_of", { ws: id });
      if (plan === "none") continue;
      const { data: last } = await admin.from("agent_runs").select("lang").eq("workspace_id", id).eq("kind", "task").order("created_at", { ascending: false }).limit(1);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-monitor-key": req.headers.get("x-monitor-key") ?? "" },
        body: JSON.stringify({ action: "watch", workspace_id: id, lang: last?.[0]?.lang === "zh" ? "zh" : "en" })
      }).catch(() => null);
      if (res?.ok) watches++;
      else console.error("weekly check", id, res?.status ?? "unreachable");
    }
  }
  const sweep = await fetch(`${SUPABASE_URL}/functions/v1/file`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-monitor-key": req.headers.get("x-monitor-key") ?? "" },
    body: "{}"
  }).then((r) => r.ok ? r.json() : null).catch(() => null);
  if (!sweep) console.error("self-filing sweep did not run");
  await admin.from("app_settings").update({ monitor_last_run: started.toISOString() }).eq("id", true);
  return json(200, { ok: true, self_filing: sweep ? { requeued: sweep.requeued, refreshed: sweep.refreshed } : null, workspaces: byWs.size, created: created.length, emailed, team_alerts: team, hq_reports: hqSent, email: !!(RESEND && FROM), weekly_checks: watches, phone_notices: phoned });
});
export {
  criticalApps,
  deadlineUpdates,
  digest,
  filingUpdates,
  hqReport,
  storeUpdates,
  watchDue,
  weekAhead,
  weekdayOf
};
