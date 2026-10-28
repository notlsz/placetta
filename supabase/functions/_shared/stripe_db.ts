// The Supabase side of stripe_apply.ts's Db, for the webhook and the billing function (service role only).
import type { Db } from "./stripe_apply.ts";
import type { Store } from "./stripe_catalog.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export function stripeDb(admin: Admin): Db & { claimEvent(id: string, type: string): Promise<"new" | "retry" | "duplicate">; doneEvent(id: string): Promise<void>; releaseEvent(id: string): Promise<void> } {
  return {
    rpc: async (fn, args) => { const { data, error } = await admin.rpc(fn, args); return { data, error }; },
    async insert(table, row) {
      const q = table === "audit_log" ? admin.from(table).insert(row) : admin.from(table).upsert(row, { onConflict: table === "updates" ? "workspace_id,dedupe" : "dedupe", ignoreDuplicates: true });
      const { error } = await q;
      if (error) throw new Error(`${table}: ${error.code ?? ""} ${error.message ?? ""}`);
    },
    async billing(ws) {
      const { data, error } = await admin.from("billing").select("auto_renew, subscription_id, subscription_status").eq("workspace_id", ws).maybeSingle();
      if (error) throw new Error(`billing: ${error.code ?? ""}`);
      return data;
    },
    async wsOfSubscription(sub) {
      const { data } = await admin.from("billing").select("workspace_id").eq("subscription_id", sub).maybeSingle();
      return (data?.workspace_id as string | undefined) ?? null;
    },
    async claimEvent(id, type) {
      const { data, error } = await admin.rpc("stripe_event_claim", { p_id: id, p_type: type });
      if (error) throw new Error(`stripe_event_claim: ${error.code ?? ""}`);
      return data as "new" | "retry" | "duplicate";
    },
    async doneEvent(id) { const { error } = await admin.rpc("stripe_event_done", { p_id: id }); if (error) throw new Error(`stripe_event_done: ${error.code ?? ""}`); },
    async releaseEvent(id) { await admin.from("stripe_events").delete().eq("id", id); },
  };
}

/** public.stripe_config as ensureWebhook's store. */
export function configStore(admin: Admin): Store {
  return {
    async get(key) { const { data } = await admin.from("stripe_config").select("value").eq("key", key).maybeSingle(); return (data?.value as string | undefined) ?? undefined; },
    async set(key, value) { const { error } = await admin.from("stripe_config").upsert({ key, value, updated_at: new Date().toISOString() }); if (error) throw new Error(error.message); },
  };
}
