// deno test supabase/functions/billing/logic_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { openingCounts, returnOrigins, safeReturn, storesFrom, STRIPE_FAILED } from "./logic.ts";

const env = (o: Record<string, string>) => (k: string) => o[k];

Deno.test("return addresses: the app's origins and its Vercel address", () => {
  const o = returnOrigins(env({ APP_ORIGINS: "https://app.placetta.com, https://placetta.com/" }));
  assertEquals(safeReturn("https://app.placetta.com/app/?x=1#y", o), "https://app.placetta.com/app/");
  assertEquals(safeReturn("https://placetta.vercel.app/app/", o), "https://placetta.vercel.app/app/");
  assertEquals(safeReturn("https://evil.example/app/", o), null);
  assertEquals(safeReturn("https://app.placetta.com.evil.example/", o), null);
  assertEquals(safeReturn("javascript:alert(1)", o), null);
  assertEquals(safeReturn(42, o), null);
});
Deno.test("localhost only when DEV_ORIGINS lists it", () => {
  const prod = returnOrigins(env({ APP_ORIGINS: "https://app.placetta.com" }));
  assertEquals(safeReturn("http://localhost:5173/app/", prod), null);
  assertEquals(safeReturn("http://localhost/app/", prod), null);
  const dev = returnOrigins(env({ APP_ORIGINS: "https://app.placetta.com", DEV_ORIGINS: "http://localhost:5173" }));
  assertEquals(safeReturn("http://localhost:5173/app/", dev), "http://localhost:5173/app/");
  assertEquals(safeReturn("http://localhost:6666/app/", dev), null);
  assertEquals(returnOrigins(env({ DEV_ORIGINS: "not a url, ftp://x" })), ["https://placetta.com", "https://www.placetta.com", "https://placetta.vercel.app"]);
});
Deno.test("stores come from store_billing rows", () => {
  const s = storesFrom([
    { store_id: "a", name: "Main St", kind: "food", opening: true },
    { store_id: "b", name: null, kind: "retail", opening: false },
    { store_id: "c", name: "Pier", kind: "complex", opening: true },
    { store_id: 7, name: "bad", kind: "food", opening: true },
    { store_id: "d", name: "Odd", kind: "weird", opening: "yes" },
  ]);
  assertEquals(s.map((x) => x.id), ["a", "b", "c", "d"]);
  assertEquals(s[1].name, "b");
  assertEquals(s[3], { id: "d", name: "Odd", opening: false, kind: "retail" });
  assertEquals(openingCounts(s), { retail: 0, food: 1 });
});
Deno.test("Stripe's own words never reach the person", () => {
  assert(!/stripe/i.test(STRIPE_FAILED.en) && STRIPE_FAILED.zh.length > 0);
});
