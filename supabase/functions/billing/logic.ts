// Billing's decisions, kept free of I/O so they can be tested: where Stripe may send the person back to, and what the
// stores billing reads from the database add up to.

/** The origins Stripe may send someone back to: the app's own (APP_ORIGINS), its Vercel address (which keeps working
    when a custom domain isn't connected), and, only when DEV_ORIGINS lists them, development origins such as
    http://localhost:5173. A localhost return address is refused unless DEV_ORIGINS names it. */
export function returnOrigins(get: (k: string) => string | undefined): string[] {
  const list = (k: string) => (get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...list("APP_ORIGINS"), "https://placetta.com", "https://www.placetta.com", "https://placetta.vercel.app", ...list("DEV_ORIGINS")].flatMap((o) => {
    try {
      const u = new URL(o);
      return u.protocol === "https:" || u.protocol === "http:" ? [u.origin] : [];
    } catch {
      return [];
    }
  });
}

/** The return address without its query or fragment, when it is on an allowed origin; else null. */
export function safeReturn(url: unknown, origins: string[]): string | null {
  if (typeof url !== "string" || !url || url.length > 2000) return null;
  try {
    const u = new URL(url);
    return origins.includes(u.origin) ? `${u.origin}${u.pathname}` : null;
  } catch {
    return null;
  }
}

export type Kind = "retail" | "food" | "complex";
export type Store = { id: string; name: string; opening: boolean; kind: Kind };

/** Rows of store_billing (kept by a database trigger that members can't get around) as billing's stores. */
export function storesFrom(rows: { store_id: unknown; name?: unknown; kind: unknown; opening: unknown }[]): Store[] {
  return rows.filter((r) => typeof r.store_id === "string").slice(0, 2000).map((r) => ({
    id: r.store_id as string,
    name: typeof r.name === "string" && r.name ? r.name : (r.store_id as string),
    opening: r.opening === true,
    kind: (r.kind === "food" || r.kind === "complex" ? r.kind : "retail") as Kind,
  }));
}

/** How many of each opening fee a list of stores owes: one per store still opening, by kind. Complex ones are quoted. */
export function openingCounts(list: Pick<Store, "opening" | "kind">[]): { retail: number; food: number } {
  const n = (k: Kind) => list.filter((s) => s.opening && s.kind === k).length;
  return { retail: n("retail"), food: n("food") };
}

/** What the person sees when Stripe refuses a request. Stripe's own message stays in the server log. */
export const STRIPE_FAILED = {
  en: "The payment service couldn't do that just now. Try again in a minute, or email support@placetta.com.",
  zh: "支付服务暂时无法完成该操作。请稍后再试，或发邮件至 support@placetta.com。",
};
