// The monitor's tests import index.ts, which makes its database client as it loads. Outside the Supabase runtime there
// is no SUPABASE_URL, so the import used to crash and `deno test` failed before any test ran. Import this first: it
// fills in stand-in values (never a real project or key) only when they aren't already set. Nothing is ever called.
if (!Deno.env.get("SUPABASE_URL")) Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-only-not-a-key");
