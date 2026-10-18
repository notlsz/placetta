// The partner API and the embedded plan box, as pure functions over their dependencies (the database, the rate
// limit, the registry), so logic_test.ts can run every rule without a server. index.ts wires in the real ones.
//
//   GET /partner-api/v1/referrals   Authorization: Bearer plk_<8 hex>_<48 hex>
//     The key's partner's referrals that share their progress: business name, stage, permits approved out of the
//     total, opening date. Keys are checked by their SHA-256 (the database keeps only that). 60 requests a minute.
//   GET /partner-api/v1/plan?type=Milk%20tea&city=Flushing,%20NY&ref=ABCD2345
//     The instant plan from Placetta's registry for a kind of business in a city (no model), for the box partners
//     put on their own site. No key. 20 a minute and 300 a day from one address.

export type Bi = { en: string; zh: string };
export type ReferralRow = {
  referral_id: string; business_name: string | null; stage: string | null; permits_done: number | null; permits_total: number | null;
  opening_date: string | null; referred_at: string; updated_at: string | null;
};
export type PlanRow = { name: Bi; agency: Bi; level: string; fees: { amount: number; tbd?: boolean }[]; est?: Bi; source: { url: string } };
export type Deps = {
  /** The partner a key's SHA-256 belongs to (live key, approved partner), or null. */
  auth(hash: string): Promise<string | null>;
  /** That partner's consenting referrals (the database scopes them; this file scopes them again). */
  referrals(partnerId: string): Promise<ReferralRow[]>;
  /** One hit against a limit: true when it's allowed. */
  limit(key: string, max: number, windowSeconds: number): Promise<boolean>;
  /** The registry's plan for a business in a place, or null when the place has no state. */
  plan(what: string, where: string): { apps: PlanRow[] } | null;
  /** An approved partner's name for a referral code, or null. */
  partner(code: string): Promise<string | null>;
  /** Where "Start with Placetta" goes. */
  appOrigin: string;
};

export const LIMITS = {
  api: { max: 60, window: 60 },          // per key
  apiIp: { max: 120, window: 60 },       // per address, keys or not (wrong keys included)
  plan: { max: 20, window: 60 },         // the plan box, per address
  planDay: { max: 300, window: 86_400 },
} as const;

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });
}
const fail = (status: number, code: string, message: string, extra: Record<string, string> = {}) => json({ error: { code, message } }, status, extra);

/* ------------------------------ keys ------------------------------ */

const KEY = /^plk_([0-9a-f]{8})_[0-9a-f]{48}$/;

/** The key in "Authorization: Bearer plk_…", or null when there's none or it isn't one of ours. */
export function keyFrom(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m && KEY.test(m[1]) ? m[1] : null;
}

/** SHA-256 of the key, as lowercase hex: what the database stores (encode(digest(key, 'sha256'), 'hex')). */
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The caller's address, for the per-address limits. */
export function clientIp(req: Request): string {
  const f = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return (f || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown").slice(0, 64);
}

/* ------------------------------ what leaves ------------------------------ */

const FIELDS = ["referral_id", "business_name", "stage", "permits_done", "permits_total", "opening_date", "referred_at", "updated_at"] as const;

/** Only the fields a business agreed to share, and only rows that carry them: whatever the database returns, nothing
 *  else leaves this function. A row without a business name or stage is one whose sharing just stopped. */
export function scope(rows: unknown): ReferralRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as Record<string, unknown>).referral_id === "string" && (r as Record<string, unknown>).stage != null)
    .map((r) => Object.fromEntries(FIELDS.map((k) => [k, r[k] ?? null])) as unknown as ReferralRow);
}

/* ------------------------------ the plan box ------------------------------ */

export type PlanQuery = { what: string; where: string; ref: string | null; lang: "en" | "zh" };

/** The plan box's question, checked: a kind of business and a city with its state. */
export function planQuery(u: URL): PlanQuery | { error: string } {
  const what = (u.searchParams.get("type") ?? "").trim().replace(/\s+/g, " ");
  const where = (u.searchParams.get("city") ?? "").trim().replace(/\s+/g, " ");
  const ref = (u.searchParams.get("ref") ?? "").trim().toUpperCase();
  if (!what || what.length > 60) return { error: "Say what kind of business, like Milk tea or Restaurant." };
  if (!where || where.length > 80) return { error: "Add the city and state, like Flushing, NY." };
  if (/[<>{}]/.test(what + where)) return { error: "Use plain words for the business and the city." };
  return { what, where, ref: /^[A-Z2-9]{8}$/.test(ref) ? ref : null, lang: u.searchParams.get("lang") === "zh" ? "zh" : "en" };
}

/** The link "Start with Placetta" opens: the app, with the partner's code and the line the person typed. */
export function startUrl(origin: string, q: Pick<PlanQuery, "what" | "where" | "ref">): string {
  const u = new URL("/app/", origin);
  if (q.ref) u.searchParams.set("ref", q.ref);
  u.searchParams.set("line", `${q.what} in ${q.where}`.slice(0, 140));
  return u.toString();
}

export function shapePlan(p: { apps: PlanRow[] }, q: PlanQuery, partner: string | null, origin: string) {
  const permits = p.apps.map((a) => {
    const tbd = a.fees.some((f) => f.tbd);
    return { name: a.name, agency: a.agency, level: a.level, fee_usd: tbd ? null : a.fees.reduce((s, f) => s + f.amount, 0), takes: a.est ?? null, source: a.source.url };
  });
  return {
    what: q.what, where: q.where, count: permits.length,
    known_fees_usd: permits.reduce((s, x) => s + (x.fee_usd ?? 0), 0), fees_set_by_agency: permits.filter((x) => x.fee_usd === null).length,
    permits, partner: partner ? { org_name: partner } : null, start_url: startUrl(origin, q),
    note: { en: "From Placetta's registry of official forms. Odelia confirms each one with the agency before anything is filed.", zh: "来自快哉的官方表格登记库。提交前，Odelia 会向机构逐项核实。" },
  };
}

/* ------------------------------ the router ------------------------------ */

const tooMany = (secs: number) => fail(429, "rate_limited", "Too many requests. Try again shortly.", { "Retry-After": String(secs) });

export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return fail(405, "method_not_allowed", "Use GET.");
  const u = new URL(req.url);
  const path = u.pathname.replace(/\/+$/, "");
  const ip = clientIp(req);

  if (path.endsWith("/v1/plan")) {
    if (!(await d.limit(`plan:ip:${ip}`, LIMITS.plan.max, LIMITS.plan.window))) return tooMany(LIMITS.plan.window);
    if (!(await d.limit(`plan:day:${ip}`, LIMITS.planDay.max, LIMITS.planDay.window))) return tooMany(3600);
    const q = planQuery(u);
    if ("error" in q) return fail(400, "bad_request", q.error);
    const p = d.plan(q.what, q.where);
    if (!p) return fail(400, "bad_request", "Add the state to the city, like Flushing, NY.");
    const partner = q.ref ? await d.partner(q.ref) : null;
    // a code that isn't an approved partner's isn't passed on
    return json(shapePlan(p, { ...q, ref: partner ? q.ref : null }, partner, d.appOrigin));
  }

  if (path.endsWith("/v1/referrals")) {
    if (!(await d.limit(`api:ip:${ip}`, LIMITS.apiIp.max, LIMITS.apiIp.window))) return tooMany(LIMITS.apiIp.window);
    const key = keyFrom(req.headers.get("authorization"));
    if (!key) return fail(401, "unauthorized", "Send your API key as: Authorization: Bearer plk_…");
    const hash = await sha256Hex(key);
    if (!(await d.limit(`api:key:${hash.slice(0, 32)}`, LIMITS.api.max, LIMITS.api.window))) return tooMany(LIMITS.api.window);
    const partner = await d.auth(hash);
    if (!partner) return fail(401, "unauthorized", "This key isn't valid. It may have been revoked, or the partner account paused.");
    const data = scope(await d.referrals(partner));
    return json({ data, count: data.length });
  }

  return fail(404, "not_found", "Try GET /v1/referrals or GET /v1/plan.");
}
