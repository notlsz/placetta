// The local backend for npm run scan:local: the e2e stack (a throwaway Postgres with every migration, PostgREST, the
// stand-in Supabase gateway at http://127.0.0.1:54321 and the real edge functions, with every outside service stubbed
// so nothing leaves the machine). It runs until it is sent SIGTERM or SIGINT, then removes the database.
import { signJwt, startStack } from "../e2e/infra.ts";

const SERVICE_KEY = await signJwt({ role: "service_role" }), ANON_KEY = await signJwt({ role: "anon" });
const ENV: Record<string, string> = {
  SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, SUPABASE_ANON_KEY: ANON_KEY,
  ANTHROPIC_API_KEY: "sk-ant-e2e", APP_ORIGINS: "http://127.0.0.1:4173", RESEND_API_KEY: "re_e2e", MAIL_FROM: "Placetta <hello@placetta.test>",
  TELNYX_API_KEY: "KEY_e2e", ODELIA_NUMBER: "+12125550100", STRIPE_SECRET_KEY: "sk_test_e2e", STRIPE_WEBHOOK_SECRET: "whsec_e2e", RECORDS: "off",
  OAUTH_STATE_SECRET: "e2e-oauth-state-secret-0123456789abcdef", FILER_SECRET: "e2e-filer-secret-0123456789abcdef0123",
};
for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v);
for (const k of ["log", "info", "warn", "error"] as const) console[k] = () => {};
const say = (s: string) => Deno.stdout.writeSync(new TextEncoder().encode(s + "\n"));

const stubs = await import("../e2e/stubs.ts");
stubs.patchFetch((u) => u.hostname === "127.0.0.1" || u.hostname === "localhost");
const gw = await import("../e2e/gateway.ts");
const stack = await startStack(say);
const fns = [...Deno.readDirSync("supabase/functions")].filter((d) => d.isDirectory && !d.name.startsWith("_")).map((d) => d.name)
  .filter((n) => { try { Deno.statSync(`supabase/functions/${n}/index.ts`); return true; } catch { return false; } });
await gw.loadFunctions(fns);
const gateway = gw.startGateway(stack.sql, stack.restPort);
say(`backend ready: ${gw.GATEWAY} (${gw.handlers.size} functions), anon key ${ANON_KEY}`);
const stop = async () => { await gateway.stop().catch(() => {}); await stack.stop().catch(() => {}); say("backend stopped"); Deno.exit(0); };
Deno.addSignalListener("SIGTERM", stop);
Deno.addSignalListener("SIGINT", stop);
await new Promise(() => {});
