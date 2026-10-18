// A new business's first workspace, built the same way wherever it starts: the app's first screen (src/cloud/Root.tsx)
// and a first text to Odelia (the server bundles this into supabase/functions/_shared/start.js). The instant plan from
// Placetta's registry (src/plan/preview.ts), every form line the answers settle (src/plan/prefill.ts), the store, the
// facts and the record of the first plan. No model is called. Pure: the caller saves the result.
import { B, same, type Bi } from "../bi";
import { normalizeState } from "../core";
import type { Store, Workspace } from "../model";
import { nowIso } from "../time";
import { NYC, STATES, ZH_CITIES } from "./line";
import { FROM_SIGNUP, parseAddress, prefill, type Prefilled } from "./prefill";
import { previewPlan, type PreviewPlan } from "./preview";

export type FirstInput = {
  what: string;              // what it is, in their words ("Milk tea shop", "奶茶店")
  city: string;              // "Flushing"
  state: string;             // "NY"
  lang: "en" | "zh";         // the language the workspace is named in
  brand?: string;            // the name on the sign, when they gave one
  months?: number | null;    // when they want to open, in months from now; 0 when already open; null when not sure
  legal?: string;            // the legal business name, when formed
  notFormed?: boolean;       // they said the company isn't formed yet
  owner?: string;            // the owner's full name
  address?: string;          // the store's address as typed
  now?: Date;                // for tests
};
export type First = { name: string; state: Workspace; plan: PreviewPlan; filled: Prefilled };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "store";

/** The workspace a new business starts with: its name, and the state saved for it. */
export function firstWorkspace(o: FirstInput): First {
  const { what, city, state, lang } = o;
  const now = o.now ?? new Date();
  // no name yet is fine: one is made from the line, and it can be renamed any time
  const brand = o.brand?.trim() || (lang === "zh" ? `${city}${what}` : `${what} in ${city}`);
  const legal = o.notFormed ? "" : (o.legal ?? "").trim();
  const owner = (o.owner ?? "").trim(), addressText = (o.address ?? "").trim();
  const st = STATES.find(s => s[0] === state)?.[1] ?? state, nyc = state === "NY" && NYC.test(city);
  const month = o.months ? new Date(now.getTime() + o.months * 30.4 * 864e5) : null;
  const monthIso = month ? month.toISOString().slice(0, 7) : "";
  const monthEn = month ? month.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";
  const monthZh = month ? `${month.getFullYear()} 年 ${month.getMonth() + 1} 月` : "";
  const open = o.months === 0;
  const place = `${city}, ${state}`;
  // the store's street and ZIP, read from the address (a street with no number, or one in Chinese characters, isn't one)
  const addr = parseAddress(addressText, place);
  const street = addr?.street ?? "";
  const store: Store = {
    id: slug(city), name: same(street ? `${city}, ${street}` : city), address: street ? `${street}, ${city}, ${state}${addr?.zip ? " " + addr.zip : ""}` : [addressText, city, state].filter(Boolean).join(", "),
    stage: open ? "open" : "opening", plannedOpen: monthIso ? monthIso + "-15" : undefined, rules: nyc ? ["nyc_grades", "nyc_fww"] : [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: [],
  };
  // The instant plan, from Placetta's registry and before any model call: every permit for this kind of business in
  // this place, in order, with fees and times, so the first screen already shows the work. Odelia verifies each one
  // against the agency when the plan starts; the rows stay, marked preview until then.
  const plan = previewPlan(what, place, store.plannedOpen, { entity: legal, storeId: store.id });
  // Then every line the answers settle, on every form, and the first win put up for approval (src/plan/prefill.ts).
  const filled = prefill(plan.apps, { what, where: place, legal, owner, address: addressText, brand: o.brand?.trim() ?? "", open });
  store.apps = filled.apps.map(a => a.id);
  if (!open && plan.projectedOpen) store.projectedOpen = plan.projectedOpen;
  const ws: Workspace = normalizeState(brand, {
    business: same(brand), goal: month ? B(`Open by ${monthEn}`, `${monthZh}开业`) : same(""),
    locations: [{ id: slug(city), name: same(city), county: same(st), state: "active" }],
    apps: filled.apps, deadlines: plan.deadlines, approvals: filled.approvals,
    firstPlan: { at: nowIso(), what, where: place, whereZh: ZH_CITIES.find(([, en]) => en === place)?.[2], apps: plan.apps.length, opening: store.plannedOpen, projectedOpen: plan.projectedOpen ?? undefined, filled: filled.filled, win: filled.win?.app },
    facts: [
      ...(legal ? [{ id: "f-name", group: "business" as const, label: B("Legal name", "法定名称"), value: same(legal), source: FROM_SIGNUP }] : []),
      ...(o.notFormed ? [{ id: "f-formed", group: "business" as const, label: B("Company formed", "公司是否已成立"), value: B("Not yet", "尚未成立"), source: FROM_SIGNUP }] : []),
      ...(owner ? [{ id: "f-owner", group: "business" as const, label: B("Owner", "所有人"), value: same(owner), source: FROM_SIGNUP }] : []),
      { id: "f-sell", group: "operations", label: B("What you sell", "销售内容"), value: same(what), source: B("You told me", "您告诉我的") },
      { id: "f-addr", group: "location", label: B("Storefront", "门店"), value: same(store.address), source: street ? FROM_SIGNUP : B("You told me", "您告诉我的") },
      ...(month ? [{ id: "f-open", group: "location" as const, label: B("Target opening", "目标开业"), value: B(monthEn, monthZh), source: B("You told me", "您告诉我的") }] : []),
      { id: "f-appr", group: "rules", label: B("Needs your approval", "需要您批准"), value: B("Every filing, payment and message", "每一次提交、付款和消息"), source: B("Always on", "始终开启"), locked: true },
    ],
    stores: [store],
    meta: { city, region: st, what, entity: legal || undefined },
  });
  return { name: brand, state: ws, plan, filled };
}

/* ------------------------------------------------------------------ the plan in a few lines */

/** One application as a first text names it: its name, agency, the fee the agency publishes (null when the agency
 *  sets it case by case) and its currency. */
export type StartStep = { name: Bi; short: Bi; agency: Bi; fee: number | null; currency: string };
export type StartFacts = {
  permits: number;           // every application in the plan
  first: StartStep[];        // the first three, in the order the agencies want them
  days: number | null;       // from today to where the chain of permits puts the opening, when it can tell
  open: boolean;             // the store is already open (then there's no time to open)
};

/** A form by the name people know it: "EIN", "Certificate of Authority", without "Application for" or the form number. */
function shortName(n: Bi): Bi {
  const acr = /\(([A-Z]{2,6})\)/.exec(n.en)?.[1];
  const en = acr ?? n.en.replace(/^Application for (Registration as an? |an? |)/i, "").replace(/\s*\([^)]*\)\s*$/, "").replace(/^./, c => c.toUpperCase());
  return B(en, n.zh.replace(/（[^）]*）$/, "").replace(/申请(表)?$/, "") || n.zh);
}

/** What a first text says about the plan: how many permits, the first three with agency and fee, and the time to open. */
export function startFacts(f: First, today = new Date()): StartFacts {
  const apps = f.filled.apps;
  const first = apps.slice(0, 3).map(a => {
    const tbd = a.fees.some(x => x.tbd);
    return { name: a.name, short: shortName(a.name), agency: a.agency, fee: tbd ? null : a.fees.reduce((t, x) => t + x.amount, 0), currency: a.currency ?? "USD" };
  });
  const open = f.state.stores?.[0]?.stage === "open";
  const land = f.plan.projectedOpen;
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = land && !open ? Math.max(0, Math.round((Date.parse(land + "T00:00:00Z") - start) / 864e5)) : null;
  return { permits: f.plan.apps.length, first, days, open };
}
