// Sales and staff from the business's point of sale, Square or Toast, read only, for compliance work:
//   monthly sales by location, for sales-tax returns, gross-receipts taxes and the permits whose fee scales with sales
//   (Boston's and Atlanta's food permits among them); and the team, their schedules and the hours they actually worked
//   with their breaks, for food handler cards, minors' hours, overtime and meal-break rules.
// Kept free of the database and of Deno.env so it can be tested with a stand-in for fetch: the caller passes in how to
// call Square (an authorized fetch) and Toast (a token getter), and where the money and time zones come from.
//
// Square: Locations (ListLocations), Orders (SearchOrders, completed orders by closed_at, net_amounts after returns),
//   Team (SearchTeamMembers), Labor (SearchScheduledShifts, SearchTimecards; Shift was renamed Timecard in 2025-05-21)
//   https://developer.squareup.com/docs/orders-api/manage-orders/search-orders
//   https://developer.squareup.com/docs/labor-api/retrieve-scheduled-shifts
//   https://developer.squareup.com/docs/labor-api/what-it-does
// Toast: one partner token for every restaurant (reused for hours, at most two logins an hour), the restaurants that
//   added Placetta (partners API, with the Location ID or Group ID the owner typed in Toast), orders by business day
//   (ordersBulk, 100 a page, 5 calls a second per location), employees, shifts and time entries (labor API, 30 days)
//   https://doc.toasttab.com/doc/devguide/authentication.html
//   https://doc.toasttab.com/doc/devguide/apiAuthenticationRateLimit.html
//   https://doc.toasttab.com/doc/devguide/apiPartnersGettingAccessibleRestaurants.html
//   https://doc.toasttab.com/doc/devguide/apiOrdersGetDetailedInfoAboutMultipleOrders.html
//   https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistAccounting.html   (which amounts make a sales report)
//   https://doc.toasttab.com/doc/devguide/apiGettingTimeEntriesForEmployees.html

/** A point-of-sale answer the person should hear about: status, a short code, and what to say. */
export class PosError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly zh?: string) { super(message); }
}

/* ------------------------------------------------------------------ dates */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
/** The months from one YYYY-MM to another, both included. */
export function monthsBetween(from: string, to: string): string[] {
  const a = MONTH.exec(from), b = MONTH.exec(to);
  if (!a || !b) return [];
  const out: string[] = [];
  for (let y = +a[1], m = +a[2]; y < +b[1] || (y === +b[1] && m <= +b[2]); m === 12 ? (y++, m = 1) : m++) out.push(`${y}-${String(m).padStart(2, "0")}`);
  return out;
}
/** The last month that has ended. */
export function lastFullMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}
/** The calendar date (YYYY-MM-DD) a moment falls on in a time zone; UTC when the zone is missing or unknown. */
export function localDate(iso: string, tz?: string | null): string {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "";
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(t); }
  catch { return t.toISOString().slice(0, 10); }
}
const addDays = (date: string, n: number) => new Date(Date.parse(date + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
/** Every date from one YYYY-MM-DD to another, both included. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}
/** The ISO week a date is in, like 2026-W41: overtime rules count hours by the week. */
export function isoWeek(date: string): string {
  const d = new Date(date + "T00:00:00Z"), day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear(), w = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
const hoursBetween = (a?: string | null, b?: string | null) => { const x = Date.parse(a ?? ""), y = Date.parse(b ?? ""); return Number.isFinite(x) && Number.isFinite(y) && y > x ? (y - x) / 3_600_000 : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ sales */

/** One location's month. Money in dollars. net_sales: what was sold after discounts and returns, before tax, tips and
 *  service charges; gross_sales: the same before discounts. */
export type SalesRow = {
  month: string; location_id: string; location: string; address?: string; orders: number;
  gross_sales: number; discounts: number; net_sales: number; service_charges: number; tax: number; tips: number; refunds: number; total_collected: number;
  currency: string;
};
type Acc = { orders: number; net: number; discounts: number; service: number; tax: number; tips: number; refunds: number };
const acc = (): Acc => ({ orders: 0, net: 0, discounts: 0, service: 0, tax: 0, tips: 0, refunds: 0 });
const row = (month: string, loc: { id: string; name: string; address?: string }, a: Acc, currency: string): SalesRow => ({
  month, location_id: loc.id, location: loc.name, ...(loc.address ? { address: loc.address } : {}), orders: a.orders,
  gross_sales: round2((a.net + a.discounts) / 100), discounts: round2(a.discounts / 100), net_sales: round2(a.net / 100), service_charges: round2(a.service / 100),
  tax: round2(a.tax / 100), tips: round2(a.tips / 100), refunds: round2(a.refunds / 100), total_collected: round2((a.net + a.service + a.tax + a.tips) / 100), currency,
});
export const SALES_HOW = {
  square: "Square completed orders by the day they closed, in each location's time zone, after returns (net_amounts). net_sales = total minus tax, tips and service charges; gross_sales adds the discounts back. Confirm against Square's Sales Summary before filing.",
  toast: "Toast orders by business day, voided and deleted ones left out, as Toast's sales report guide says: net_sales = check amounts minus service charges, fundraising and gift cards sold; gross_sales adds the discounts back; tips and refunds from payments. Confirm against Toast's Sales Summary before filing.",
};

type Money = { amount?: number; currency?: string } | undefined;
const cents = (m: Money) => (typeof m?.amount === "number" && Number.isFinite(m.amount) ? m.amount : 0);
type SqOrder = {
  closed_at?: string; state?: string; total_money?: Money; total_tax_money?: Money; total_discount_money?: Money; total_tip_money?: Money; total_service_charge_money?: Money;
  net_amounts?: { total_money?: Money; tax_money?: Money; discount_money?: Money; tip_money?: Money; service_charge_money?: Money };
};
/** Adds one completed Square order: net_amounts (after returns) when Square gives them, else the order's totals. */
export function addSquareOrder(a: Acc, o: SqOrder) {
  const n = o.net_amounts;
  const total = cents(n?.total_money ?? o.total_money), tax = cents(n?.tax_money ?? o.total_tax_money), tip = cents(n?.tip_money ?? o.total_tip_money);
  const svc = cents(n?.service_charge_money ?? o.total_service_charge_money), disc = cents(n?.discount_money ?? o.total_discount_money);
  a.orders++;
  a.net += total - tax - tip - svc; a.tax += tax; a.tips += tip; a.service += svc; a.discounts += disc;
  if (n?.total_money && o.total_money) a.refunds += Math.max(0, cents(o.total_money) - cents(n.total_money));
}

/** How Placetta calls Square: an authorized fetch (it adds the bearer token and renews it). */
export type Call = (url: string, init?: RequestInit) => Promise<Response>;
type SqLocation = { id: string; name?: string; business_name?: string; status?: string; timezone?: string; currency?: string; address?: { address_line_1?: string; locality?: string; administrative_district_level_1?: string; postal_code?: string } };
const sqHeaders = (version: string) => ({ "Square-Version": version, "Content-Type": "application/json", Accept: "application/json" });

async function sqJson<T>(call: Call, url: string, version: string, body?: unknown): Promise<T> {
  const res = await call(url, body === undefined ? { headers: sqHeaders(version) } : { method: "POST", headers: sqHeaders(version), body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({})) as T & { errors?: { code?: string; category?: string }[] };
  if (!res.ok) {
    const code = j.errors?.[0]?.code ?? String(res.status);
    if (res.status === 403) throw new PosError(403, "forbidden", "Square refused (missing permission). Reconnect Square in Settings so it can grant sales and team access.", "Square 拒绝了请求（缺少权限）。请在设置中重新连接 Square，授予销售和团队权限。");
    if (res.status === 429) throw new PosError(429, "rate_limited", "Square is busy. Try again in a minute.", "Square 正忙，请一分钟后再试。");
    throw new PosError(res.status, code, `Square returned an error (${code}).`, `Square 返回错误（${code}）。`);
  }
  return j;
}

const sqAddress = (l: SqLocation) => [l.address?.address_line_1, l.address?.locality, l.address?.administrative_district_level_1, l.address?.postal_code].filter(Boolean).join(", ");
/** The seller's active locations, or the one asked for (by id or a word of its name). */
export async function squareLocations(call: Call, base: string, version: string, only?: string | null): Promise<SqLocation[]> {
  const j = await sqJson<{ locations?: SqLocation[] }>(call, `${base}/v2/locations`, version);
  let locs = (j.locations ?? []).filter((l) => l.status !== "INACTIVE");
  if (only) {
    const k = only.toLowerCase();
    locs = locs.filter((l) => l.id === only || (l.name ?? "").toLowerCase().includes(k) || sqAddress(l).toLowerCase().includes(k));
    if (!locs.length) throw new PosError(404, "not_found", `No Square location matches "${only}".`, `没有与“${only}”匹配的 Square 门店。`);
  }
  return locs;
}

/** Monthly sales for each location, from Square's completed orders. Stops at deadline (ms) and says it's partial. */
export async function squareSales(call: Call, base: string, version: string, months: string[], o: { location?: string | null; deadline?: number; maxPages?: number } = {}): Promise<{ rows: SalesRow[]; complete: boolean; how: string }> {
  const locs = await squareLocations(call, base, version, o.location);
  // a day either side, then each order lands in its location's own month
  const start = addDays(`${months[0]}-01`, -1) + "T00:00:00Z";
  const [ly, lm] = months[months.length - 1].split("-").map(Number);
  const end = addDays(new Date(Date.UTC(ly, lm, 1)).toISOString().slice(0, 10), 1) + "T00:00:00Z";
  const rows: SalesRow[] = [];
  let complete = true;
  for (const l of locs) {
    const by = new Map(months.map((m) => [m, acc()]));
    let cursor: string | undefined, pages = 0, currency = l.currency ?? "USD";
    do {
      const j = await sqJson<{ orders?: SqOrder[]; cursor?: string }>(call, `${base}/v2/orders/search`, version, {
        location_ids: [l.id], return_entries: false, limit: 500, ...(cursor ? { cursor } : {}),
        query: { filter: { date_time_filter: { closed_at: { start_at: start, end_at: end } }, state_filter: { states: ["COMPLETED"] } }, sort: { sort_field: "CLOSED_AT", sort_order: "ASC" } },
      });
      for (const ord of j.orders ?? []) {
        const a = by.get(localDate(ord.closed_at ?? "", l.timezone).slice(0, 7));
        if (a) { addSquareOrder(a, ord); currency = ord.total_money?.currency ?? currency; }
      }
      cursor = j.cursor; pages++;
      if (cursor && ((o.deadline && Date.now() > o.deadline) || pages >= (o.maxPages ?? 60))) { complete = false; break; }
    } while (cursor);
    for (const m of months) rows.push(row(m, { id: l.id, name: l.name ?? l.business_name ?? l.id, address: sqAddress(l) || undefined }, by.get(m)!, currency));
  }
  return { rows, complete, how: SALES_HOW.square };
}

/* ------------------------------------------------------------------ staff */

export type Person = { id: string; name: string; email?: string; jobs?: string[]; locations?: string[] };
export type Shift = { person: string; location?: string; date: string; start: string; end: string | null; hours: number };
export type Worked = Shift & { breaks: { minutes: number; paid: boolean; missed?: boolean }[]; overtime_hours?: number };
export type StaffOut = {
  people: Person[]; scheduled: Shift[]; worked: Worked[];
  totals: { person: string; days_worked: number; worked_hours: number; longest_shift_hours: number; by_week: Record<string, number> }[];
  notes: string[]; complete: boolean;
};
const MAX_ROWS = 300;
/** Each person's hours: days worked, total, the longest shift, and hours by ISO week. */
export function staffTotals(worked: Worked[]): StaffOut["totals"] {
  const by = new Map<string, Worked[]>();
  for (const w of worked) by.set(w.person, [...(by.get(w.person) ?? []), w]);
  return [...by].map(([person, ws]) => {
    const weeks: Record<string, number> = {};
    for (const w of ws) weeks[isoWeek(w.date)] = round2((weeks[isoWeek(w.date)] ?? 0) + w.hours);
    return { person, days_worked: new Set(ws.map((w) => w.date)).size, worked_hours: round2(ws.reduce((n, w) => n + w.hours, 0)), longest_shift_hours: round2(Math.max(...ws.map((w) => w.hours))), by_week: weeks };
  }).sort((a, b) => a.person.localeCompare(b.person));
}
const finish = (o: Omit<StaffOut, "totals">): StaffOut => {
  const notes = [...o.notes];
  if (o.scheduled.length > MAX_ROWS || o.worked.length > MAX_ROWS) notes.push(`Only the first ${MAX_ROWS} shifts of each kind are listed; the totals count them all. Ask for a shorter range for the rest.`);
  return { people: o.people, scheduled: o.scheduled.slice(0, MAX_ROWS), worked: o.worked.slice(0, MAX_ROWS), totals: staffTotals(o.worked), notes, complete: o.complete };
};

type SqMember = { id: string; given_name?: string; family_name?: string; email_address?: string; status?: string; is_owner?: boolean; assigned_locations?: { location_ids?: string[] } };
type SqShiftDetails = { location_id?: string; team_member_id?: string; start_at?: string; end_at?: string; is_deleted?: boolean; timezone?: string };
type SqTimecard = { team_member_id?: string; location_id?: string; timezone?: string; start_at?: string; end_at?: string | null; wage?: { title?: string }; breaks?: { start_at?: string; end_at?: string; is_paid?: boolean }[] };

/** Square's team for a date range (up to 31 days): active team members, published shifts, and timecards. A part
 *  Square won't give (scheduling not used, a permission missing) becomes a note instead of an error. */
export async function squareStaff(call: Call, base: string, version: string, from: string, to: string, o: { location?: string | null; deadline?: number } = {}): Promise<StaffOut> {
  const locs = await squareLocations(call, base, version, o.location);
  const locName = new Map(locs.map((l) => [l.id, l.name ?? l.id]));
  const tz = locs.find((l) => l.timezone)?.timezone ?? "UTC";
  const ids = o.location ? locs.map((l) => l.id) : undefined;
  const notes: string[] = [];
  let complete = true;
  const pages = async <T>(path: string, body: Record<string, unknown>, key: string, max: number): Promise<T[]> => {
    const out: T[] = [];
    let cursor: string | undefined, n = 0;
    do {
      const j = await sqJson<Record<string, unknown>>(call, `${base}${path}`, version, { ...body, ...(cursor ? { cursor } : {}) });
      out.push(...((j[key] as T[] | undefined) ?? []));
      cursor = j.cursor as string | undefined; n++;
      if (cursor && (n >= max || (o.deadline && Date.now() > o.deadline))) { complete = false; break; }
    } while (cursor);
    return out;
  };
  const members = await pages<SqMember>("/v2/team-members/search", { query: { filter: { status: "ACTIVE", ...(ids ? { location_ids: ids } : {}) } }, limit: 100 }, "team_members", 10);
  const name = new Map(members.map((m) => [m.id, [m.given_name, m.family_name].filter(Boolean).join(" ") || m.id]));
  const who = (id?: string) => (id ? name.get(id) ?? id : "unassigned");
  const workday = (match: string) => ({ date_range: { start_date: from, end_date: to }, [match]: "START_AT", default_timezone: tz });
  let shifts: { published_shift_details?: SqShiftDetails }[] = [];
  try {
    shifts = await pages("/v2/labor/scheduled-shifts/search", { query: { filter: { workday: workday("match_shifts_by"), assignment_status: "ASSIGNED", scheduled_shift_statuses: ["PUBLISHED"], ...(ids ? { location_ids: ids } : {}) }, sort: { field: "START_AT", order: "ASC" } }, limit: 50 }, "scheduled_shifts", 20);
  } catch (e) { if (e instanceof PosError && (e.status === 403 || e.status === 404 || e.status === 400)) notes.push("Square didn't give schedules (the business may not schedule in Square)."); else throw e; }
  let cards: SqTimecard[] = [];
  try {
    cards = await pages("/v2/labor/timecards/search", { query: { filter: { workday: workday("match_timecards_by"), ...(ids ? { location_ids: ids } : {}) }, sort: { field: "START_AT", order: "ASC" } }, limit: 200 }, "timecards", 20);
  } catch (e) { if (e instanceof PosError && (e.status === 403 || e.status === 404 || e.status === 400)) notes.push("Square didn't give timecards (the business may not clock in with Square)."); else throw e; }
  const jobs = new Map<string, Set<string>>();
  for (const c of cards) if (c.team_member_id && c.wage?.title) jobs.set(c.team_member_id, (jobs.get(c.team_member_id) ?? new Set()).add(c.wage.title));
  return finish({
    people: members.map((m) => ({ id: m.id, name: who(m.id), ...(m.email_address ? { email: m.email_address } : {}),
      ...(jobs.get(m.id)?.size ? { jobs: [...jobs.get(m.id)!] } : {}), ...(m.assigned_locations?.location_ids?.length ? { locations: m.assigned_locations.location_ids.map((l) => locName.get(l) ?? l) } : {}) })),
    scheduled: shifts.map((s) => s.published_shift_details).filter((d): d is SqShiftDetails => !!d && !d.is_deleted && !!d.start_at).map((d) => ({
      person: who(d.team_member_id), location: locName.get(d.location_id ?? "") ?? d.location_id, date: localDate(d.start_at!, d.timezone ?? tz), start: d.start_at!, end: d.end_at ?? null, hours: round2(hoursBetween(d.start_at, d.end_at)),
    })),
    worked: cards.filter((c) => c.start_at).map((c) => {
      const breaks = (c.breaks ?? []).map((b) => ({ minutes: Math.round(hoursBetween(b.start_at, b.end_at) * 60), paid: b.is_paid === true }));
      const unpaid = breaks.filter((b) => !b.paid).reduce((n, b) => n + b.minutes, 0) / 60;
      return { person: who(c.team_member_id), location: locName.get(c.location_id ?? "") ?? c.location_id, date: localDate(c.start_at!, c.timezone ?? tz), start: c.start_at!, end: c.end_at ?? null,
        hours: round2(Math.max(0, hoursBetween(c.start_at, c.end_at) - unpaid)), breaks };
    }),
    notes, complete,
  });
}

/* ------------------------------------------------------------------ Toast */

/** What Placetta keeps of Toast's partner token between instances (the vault, through server_tokens). */
export type SavedToken = { token: string; exp: number; fetched_at: number };
export type ToastCtx = { f: typeof fetch; base: string; token: (stale?: string) => Promise<string>; sleep?: (ms: number) => Promise<void> };

/**
 * Toast's partner token. Toast hands back the same token until its last minute and asks for no more than two logins an
 * hour, reusing each for at least 30 minutes, so: the saved token while it has over 50 seconds left; the same one again
 * when it was fetched in the last two minutes; a new login only after that, or when a call said the token was refused
 * (stale) and it's at least 30 minutes old.
 */
export function toastTokens(o: { f: typeof fetch; base: string; clientId: string; clientSecret: string; load: () => Promise<SavedToken | null>; store: (t: SavedToken) => Promise<void>; now?: () => number }) {
  const now = o.now ?? Date.now;
  let mem: SavedToken | null = null;
  return async (stale?: string): Promise<string> => {
    const t = now();
    const saved = mem ?? (await o.load().catch(() => null));
    const refused = !!stale && saved?.token === stale && t - saved.fetched_at >= 30 * 60_000;
    if (saved && !refused) {
      if (saved.exp - t > 50_000) return saved.token;
      if (t - saved.fetched_at < 120_000 && saved.exp > t) return saved.token;
    }
    const res = await o.f(`${o.base}/authentication/v1/authentication/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: o.clientId, clientSecret: o.clientSecret, userAccessType: "TOAST_MACHINE_CLIENT" }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    const j = (res ? await res.json().catch(() => ({})) : {}) as { token?: { accessToken?: string; expiresIn?: number } };
    if (!res?.ok || !j.token?.accessToken) {
      if (saved && saved.exp > t) return saved.token;
      throw new PosError(res?.status === 401 ? 503 : 502, "toast_login", "Toast didn't let Placetta sign in. Placetta's team has been told.", "Toast 拒绝了快哉的登录，快哉团队已收到通知。");
    }
    mem = { token: j.token.accessToken, exp: t + Math.max(60, Number(j.token.expiresIn) || 3600) * 1000, fetched_at: t };
    await o.store(mem).catch(() => undefined);
    return mem.token;
  };
}

/** One Toast call for a restaurant (by its GUID), with a token refused once fetched again and a busy answer waited out
 *  once. 403 is how Toast says the location hasn't opened to Placetta (yet, or any more). */
export async function toastGet<T>(ctx: ToastCtx, path: string, guid?: string): Promise<T> {
  let token = await ctx.token(), tried401 = false, tried429 = false;
  for (;;) {
    const res = await ctx.f(`${ctx.base}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(guid ? { "Toast-Restaurant-External-ID": guid } : {}) }, signal: AbortSignal.timeout(20000) })
      .catch(() => { throw new PosError(502, "unreachable", "Toast didn't answer. Try again.", "Toast 没有响应，请重试。"); });
    if (res.status === 401 && !tried401) { await res.body?.cancel(); tried401 = true; token = await ctx.token(token); continue; }
    if (res.status === 429 && !tried429) { await res.body?.cancel(); tried429 = true; await (ctx.sleep ?? wait)(Math.min(5000, 1000 * (Number(res.headers.get("retry-after")) || 1))); continue; }
    if (res.status === 403) { await res.body?.cancel(); throw new PosError(403, "forbidden", "Toast hasn't opened this location to Placetta. It can take 15 minutes after adding Placetta in Toast; if it's longer, add Placetta again in Toast Web, Integrations.", "Toast 尚未向快哉开放此门店。在 Toast 中添加快哉后最多需要 15 分钟；如更久，请在 Toast Web 的集成中重新添加快哉。"); }
    if (res.status === 429) { await res.body?.cancel(); throw new PosError(429, "rate_limited", "Toast is busy. Try again in a minute.", "Toast 正忙，请一分钟后再试。"); }
    if (!res.ok) { await res.body?.cancel(); throw new PosError(res.status, String(res.status), `Toast returned an error (${res.status}).`, `Toast 返回错误（${res.status}）。`); }
    return await res.json() as T;
  }
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type ToastPlace = { guid: string; name: string; location?: string | null; tz?: string | null; address?: string };
type ToastConnection = { restaurantGuid?: string; restaurantName?: string; locationName?: string | null; externalGroupRef?: string | null; externalRestaurantRef?: string | null };
const sameCode = (a?: string | null, b?: string) => !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase();

/** The restaurants that added Placetta in Toast and carry this workspace's code as their Location ID or Group ID. */
export async function toastMatches(ctx: ToastCtx, code: string): Promise<ToastPlace[]> {
  const out: ToastPlace[] = [];
  for (let page = 1; page <= 20; page++) {
    const j = await toastGet<{ results?: ToastConnection[]; nextPageNum?: number | null }>(ctx, `/partners/v1/connectedRestaurants?pageSize=100&page=${page}`);
    for (const r of j.results ?? []) {
      if (r.restaurantGuid && (sameCode(r.externalRestaurantRef, code) || sameCode(r.externalGroupRef, code)))
        out.push({ guid: r.restaurantGuid, name: r.restaurantName ?? r.restaurantGuid, location: r.locationName ?? null });
    }
    if (!j.nextPageNum) break;
  }
  return out;
}

/** A restaurant's time zone and address from the restaurants API (needs restaurants:read; left out when Toast says no). */
export async function toastPlace(ctx: ToastCtx, p: ToastPlace): Promise<ToastPlace> {
  try {
    const j = await toastGet<{ general?: { name?: string; locationName?: string; timeZone?: string }; location?: { address1?: string; city?: string; stateCode?: string; zipCode?: string } }>(ctx, `/restaurants/v1/restaurants/${encodeURIComponent(p.guid)}`, p.guid);
    const address = [j.location?.address1, j.location?.city, j.location?.stateCode, j.location?.zipCode].filter(Boolean).join(", ");
    return { ...p, tz: j.general?.timeZone ?? p.tz ?? null, ...(address ? { address } : {}) };
  } catch { return p; }
}

type Num = number | null | undefined;
const dollars = (n: Num) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : 0);
type ToastCheck = {
  voided?: boolean; deleted?: boolean; amount?: Num; taxAmount?: Num;
  appliedDiscounts?: { discountAmount?: Num }[];
  appliedServiceCharges?: { chargeAmount?: Num; gratuity?: boolean; serviceChargeCategory?: string }[];
  selections?: { voided?: boolean; deferred?: boolean; price?: Num; appliedDiscounts?: { discountAmount?: Num }[] }[];
  payments?: { paymentStatus?: string; tipAmount?: Num; refund?: { refundAmount?: Num } | null; voidInfo?: unknown }[];
};
export type ToastOrder = { voided?: boolean; deleted?: boolean; businessDate?: number | string; checks?: ToastCheck[] };
/** Adds one Toast order the way Toast's sales report guide does: voided and deleted orders, checks, selections and
 *  payments left out; check amount includes non-gratuity service charges, so they (and fundraising) come out of net
 *  sales; deferred selections (gift cards sold) count when they're used, not now. */
export function addToastOrder(a: Acc, o: ToastOrder) {
  if (o.voided || o.deleted) return;
  a.orders++;
  for (const c of o.checks ?? []) {
    if (c.voided || c.deleted) continue;
    let net = dollars(c.amount);
    for (const sc of c.appliedServiceCharges ?? []) {
      if (sc.gratuity) continue;
      net -= dollars(sc.chargeAmount);
      if (sc.serviceChargeCategory !== "FUNDRAISING_CAMPAIGN") a.service += dollars(sc.chargeAmount);
    }
    for (const s of c.selections ?? []) {
      if (s.voided) continue;
      if (s.deferred) net -= dollars(s.price);
      for (const d of s.appliedDiscounts ?? []) a.discounts += dollars(d.discountAmount);
    }
    for (const d of c.appliedDiscounts ?? []) a.discounts += dollars(d.discountAmount);
    a.net += net; a.tax += dollars(c.taxAmount);
    for (const p of c.payments ?? []) {
      if (p.paymentStatus === "VOIDED" || p.voidInfo) continue;
      a.tips += dollars(p.tipAmount); a.refunds += dollars(p.refund?.refundAmount);
    }
  }
}

/** Monthly sales for each Toast location, business day by business day (ordersBulk, 100 a page), at most 4 calls a
 *  second per location. Days still to come are skipped. Stops at deadline (ms) and says it's partial. */
export async function toastSales(ctx: ToastCtx, places: ToastPlace[], months: string[], o: { deadline?: number; today?: string } = {}): Promise<{ rows: SalesRow[]; complete: boolean; how: string }> {
  const sleep = ctx.sleep ?? wait, today = o.today ?? new Date().toISOString().slice(0, 10);
  const rows: SalesRow[] = [];
  let complete = true;
  for (const p of places) {
    const by = new Map(months.map((m) => [m, acc()]));
    days: for (const m of months) {
      const [y, mo] = m.split("-").map(Number);
      const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
      for (const d of daysBetween(`${m}-01`, last)) {
        if (d > today) break;
        for (let page = 1; page <= 50; page++) {
          if (o.deadline && Date.now() > o.deadline) { complete = false; break days; }
          const orders = await toastGet<ToastOrder[]>(ctx, `/orders/v2/ordersBulk?businessDate=${d.replace(/-/g, "")}&pageSize=100&page=${page}`, p.guid);
          for (const ord of orders ?? []) addToastOrder(by.get(m)!, ord);
          await sleep(250);
          if (!Array.isArray(orders) || orders.length < 100) break;
        }
      }
    }
    for (const m of months) rows.push(row(m, { id: p.guid, name: [p.name, p.location].filter(Boolean).join(", "), address: p.address }, by.get(m)!, "USD"));
  }
  return { rows, complete, how: SALES_HOW.toast };
}

type ToastEmployee = { guid: string; firstName?: string; lastName?: string; chosenName?: string; email?: string; deleted?: boolean; jobReferences?: { guid?: string }[] };
type ToastShift = { employeeReference?: { guid?: string }; jobReference?: { guid?: string }; inDate?: string; outDate?: string | null; deleted?: boolean };
type ToastTimeEntry = ToastShift & { businessDate?: string | number; regularHours?: Num; overtimeHours?: Num; breaks?: { inDate?: string; outDate?: string | null; paid?: boolean; missed?: boolean }[] };
/** Toast's date-time format for the labor API, like 2026-10-01T00:00:00.000+0000. */
export const toastTime = (date: string) => `${date}T00:00:00.000+0000`;

/** Toast's team for a date range (up to 28 days): employees, scheduled shifts and time entries (with missed breaks),
 *  each restaurant in turn. Time entries count by Toast's business date. */
export async function toastStaff(ctx: ToastCtx, places: ToastPlace[], from: string, to: string): Promise<StaffOut> {
  const people = new Map<string, Person>(), names = new Map<string, string>();
  const scheduled: Shift[] = [], worked: Worked[] = [], notes: string[] = [];
  // a day either side for time zones; each shift then counts on its own local or business date
  const q = `startDate=${encodeURIComponent(toastTime(addDays(from, -1)))}&endDate=${encodeURIComponent(toastTime(addDays(to, 2)))}`;
  for (const p of places) {
    const place = [p.name, p.location].filter(Boolean).join(", ");
    const emps = await toastGet<ToastEmployee[]>(ctx, "/labor/v1/employees", p.guid);
    let titles = new Map<string, string>();
    try { titles = new Map((await toastGet<{ guid: string; title?: string }[]>(ctx, "/labor/v1/jobs", p.guid)).map((j) => [j.guid, j.title ?? ""])); } catch { /* job titles are a nicety */ }
    for (const e of emps ?? []) {
      if (e.deleted) continue;
      const name = [e.chosenName || e.firstName, e.lastName].filter(Boolean).join(" ") || e.guid;
      names.set(e.guid, name);
      const had = people.get(e.guid);
      const jobs = (e.jobReferences ?? []).map((j) => titles.get(j.guid ?? "")).filter((t): t is string => !!t);
      people.set(e.guid, { id: e.guid, name, ...(e.email ? { email: e.email } : {}), ...(jobs.length ? { jobs: [...new Set([...(had?.jobs ?? []), ...jobs])] } : {}), locations: [...new Set([...(had?.locations ?? []), place])] });
    }
    const who = (g?: string) => (g ? names.get(g) ?? g : "unassigned");
    try {
      for (const s of await toastGet<ToastShift[]>(ctx, `/labor/v1/shifts?${q}`, p.guid) ?? []) {
        if (s.deleted || !s.inDate) continue;
        const date = localDate(s.inDate, p.tz);
        if (date < from || date > to) continue;
        scheduled.push({ person: who(s.employeeReference?.guid), location: place, date, start: s.inDate, end: s.outDate ?? null, hours: round2(hoursBetween(s.inDate, s.outDate)) });
      }
    } catch (e) { if (e instanceof PosError && e.status !== 403) notes.push(`Toast didn't give schedules for ${place}.`); else throw e; }
    for (const t of await toastGet<ToastTimeEntry[]>(ctx, `/labor/v1/timeEntries?${q}&includeMissedBreaks=true`, p.guid) ?? []) {
      if (t.deleted || !t.inDate) continue;
      const bd = String(t.businessDate ?? ""), date = /^\d{8}$/.test(bd) ? `${bd.slice(0, 4)}-${bd.slice(4, 6)}-${bd.slice(6)}` : localDate(t.inDate, p.tz);
      if (date < from || date > to) continue;
      const regular = typeof t.regularHours === "number" ? t.regularHours : null, over = typeof t.overtimeHours === "number" ? t.overtimeHours : 0;
      worked.push({ person: who(t.employeeReference?.guid), location: place, date, start: t.inDate, end: t.outDate ?? null,
        hours: round2(regular !== null ? regular + over : hoursBetween(t.inDate, t.outDate)), ...(over ? { overtime_hours: round2(over) } : {}),
        breaks: (t.breaks ?? []).map((b) => ({ minutes: b.missed ? 0 : Math.round(hoursBetween(b.inDate, b.outDate) * 60), paid: b.paid === true, ...(b.missed ? { missed: true } : {}) })) });
    }
  }
  const order = (a: Shift, b: Shift) => a.start.localeCompare(b.start);
  return finish({ people: [...people.values()], scheduled: scheduled.sort(order), worked: worked.sort(order), notes, complete: true });
}
