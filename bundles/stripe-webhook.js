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

// ../../../../../../home/claude/placetta-agent/supabase/functions/stripe-webhook/index.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);
var admin = (0, import_supabase_js_2.createClient)(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }
});
var reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
var hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function verified(raw, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")).filter((p) => p.length === 2));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1e3 - t) > 300) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${parts.t}.${raw}`)));
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => same(p.slice(3), sig));
}
var PLAN_NAME = {
  entry: { en: "Entry plan", zh: "\u5F00\u5E97\u8BA1\u5212" },
  starter: { en: "Starter plan", zh: "\u5165\u95E8\u7248" },
  growth: { en: "Growth plan", zh: "\u6210\u957F\u7248" },
  scale: { en: "Scale plan", zh: "\u89C4\u6A21\u7248" },
  locations: { en: "Per location plan", zh: "\u6309\u95E8\u5E97\u8BA1\u8D39" }
};
async function log(ws, action, plan) {
  await admin.from("audit_log").insert({ workspace_id: ws, actor: "you", actor_id: null, action, object: PLAN_NAME[plan] ?? { en: plan, zh: plan } });
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return reply(503, { error: "Set STRIPE_WEBHOOK_SECRET." });
  const raw = await req.text();
  if (!await verified(raw, req.headers.get("stripe-signature") ?? "", secret)) return reply(400, { error: "Bad signature." });
  const event = JSON.parse(raw);
  const { error: dup } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dup) return reply(200, { received: true, duplicate: true });
  try {
    const o = event.data.object;
    if (event.type === "checkout.session.completed") {
      const ws = o.metadata?.workspace_id;
      if (ws) {
        const { data: b } = await admin.from("billing").select("entry_markets, stripe_customer_id").eq("workspace_id", ws).maybeSingle();
        const patch = {};
        if (o.customer && !b?.stripe_customer_id) patch.stripe_customer_id = o.customer;
        if (o.mode === "payment" && o.metadata?.plan === "entry" && o.payment_status === "paid") {
          patch.entry_markets = (b?.entry_markets ?? 0) + Math.max(1, Number(o.metadata?.markets) || 1);
          patch.entry_paid_at = (/* @__PURE__ */ new Date()).toISOString();
          await log(ws, { en: "Paid", zh: "\u5DF2\u4ED8\u6B3E" }, "entry");
        }
        if (o.mode === "subscription" && o.metadata?.plan === "locations") {
          const { data: bc } = await admin.from("billing").select("checkout_store_ids").eq("workspace_id", ws).maybeSingle();
          const listed = bc?.checkout_store_ids;
          if (Array.isArray(listed)) patch.charged_store_ids = listed;
          else {
            const { data: w } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
            const stores = w?.state?.stores;
            patch.charged_store_ids = Array.isArray(stores) ? stores.map((x) => x?.id).filter((x) => typeof x === "string") : [];
          }
          if (Number(o.metadata?.entry_credit) > 0) patch.entry_credited_at = (/* @__PURE__ */ new Date()).toISOString();
        }
        if (Object.keys(patch).length) await admin.from("billing").update(patch).eq("workspace_id", ws);
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      const ws = o.metadata?.workspace_id;
      if (ws) {
        const end = o.current_period_end ?? o.items?.data?.[0]?.current_period_end;
        const status = event.type === "customer.subscription.deleted" ? "canceled" : String(o.status);
        await admin.from("billing").update({
          stripe_customer_id: o.customer,
          subscription_id: o.id,
          subscription_status: status,
          subscription_plan: o.metadata?.plan ?? null,
          current_period_end: end ? new Date(end * 1e3).toISOString() : null
        }).eq("workspace_id", ws);
        if (event.type === "customer.subscription.created") await log(ws, { en: "Started", zh: "\u5F00\u901A" }, o.metadata?.plan ?? "starter");
        if (event.type === "customer.subscription.deleted") await log(ws, { en: "Ended", zh: "\u5DF2\u7ED3\u675F" }, o.metadata?.plan ?? "starter");
      }
    }
  } catch (e) {
    await admin.from("stripe_events").delete().eq("id", event.id);
    console.error("webhook", e.message);
    return reply(500, { error: "Try again." });
  }
  return reply(200, { received: true });
});
