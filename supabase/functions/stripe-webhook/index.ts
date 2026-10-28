// Stripe tells us when someone pays. The work is in handler.ts (tested with signed sample events in handler_test.ts);
// this file only wires it to the database and Stripe. The endpoint itself is made by ensureWebhook: on the monitor's
// daily run, from staff's billing health check, and before any checkout (_shared/stripe_catalog.ts).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { client, webhookSecret } from "../_shared/stripe_catalog.ts";
import { configStore, stripeDb } from "../_shared/stripe_db.ts";
import { handle } from "./handler.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = (k: string) => Deno.env.get(k);

Deno.serve((req) => handle(req, {
  db: stripeDb(admin),
  env,
  secret: () => webhookSecret(env, configStore(admin)),
  paymentIntentMeta: async (id) => env("STRIPE_SECRET_KEY") ? ((await client(env).get(`payment_intents/${encodeURIComponent(id)}`))?.metadata ?? null) : null,
}));
