// The founder's check, in one command: cd worker/filer && npm run check (on Render: the service's Shell tab, same
// command). Each line says yes or what to fix. It reads, it never files: the keys are there and work, the database has
// the worker's functions, Chromium starts, and a public agency page opens. Exit code 0 when everything passes.
import { defaultDeps, launcher } from "./browsers.ts";
import { checkEnv, missingLines } from "./env.ts";
import { askSeat, KEY_OF, redact, usableSeats } from "./llm.ts";
import { readPublic } from "./probe.ts";
import { PLAYBOOKS } from "./playbooks.ts";
import { dbKey, SupabaseStore } from "./store.ts";
import { VERSION } from "./main.ts";

const lines: [boolean, string][] = [];
const say = (ok: boolean, line: string) => { lines.push([ok, line]); console.log(`${ok ? "yes " : "FIX "} ${line}`); };

const env = checkEnv(process.env);
say(env.ok, env.ok ? `keys: SUPABASE_URL, the database key and a model key are set (models in failover order: ${env.models.join(", ")})` : `keys: ${missingLines(env).join("; ")}`);
for (const w of env.warnings) console.log(`note ${w}`);
say(true, `browser: ${env.provider === "steel" ? "Steel for every run (no Chromium in this container)" : env.provider === "browserbase" ? "Browserbase for every run (no Chromium in this container)"
  : env.browser === "local" ? "local Chromium in the container (Browserbase not needed)" : "Browserbase for the hosts that refuse a cloud server, local Chromium for the rest"}`);
say(!!env.publicUrl || env.browser !== "local", env.publicUrl ? `live browser for hand-backs at ${env.publicUrl}/live/...` : "live browser: no public address; on Render, RENDER_EXTERNAL_URL is set for a web service");
say(env.wake, env.wake ? "wake on demand: FILER_SECRET is set (use the same value in the Supabase secrets, with FILER_URL)" : "wake on demand: set FILER_SECRET (32+ characters, the same as the Supabase secret) so the app can wake a sleeping worker");

// every model seat answers a one-tool question (a model call has no side effects); one that doesn't is a failover gap
const penv = (k: string) => process.env[k];
for (const s of usableSeats(penv)) {
  const probe = { prompt: "Health check. Call the ok tool.", tools: [{ name: "ok", description: "Say the check passed.", input_schema: { type: "object", properties: { passed: { type: "boolean" } }, required: ["passed"] } }], only: "ok", maxTokens: 200 };
  const err = await askSeat(s, probe, penv).then(() => null, (e: Error) => redact(`${(e as { status?: number }).status ?? ""} ${e?.message ?? e}`.trim(), penv).slice(0, 160));
  say(err === null, err === null ? `model ${s.vendor}:${s.model} answers with a tool call` : `model ${s.vendor}:${s.model} refused (${err || "no answer"}): check ${KEY_OF[s.vendor]} and that account's spend limit`);
}
if (env.ok) {
  try {
    await new SupabaseStore(process.env.SUPABASE_URL!, dbKey(process.env, () => undefined)).heartbeat?.({ version: VERSION, browser: env.browser });
    say(true, "database: the worker's key works and the heartbeat is recorded (the app now shows online filing as live)");
  } catch (e) {
    say(false, `database: ${e instanceof Error ? e.message.slice(0, 160) : e}. Apply the migrations (npm run launch), then check the key.`);
  }
}
try {
  const b = await launcher(defaultDeps(process.env))();
  try {
    const st = await readPublic(b, "https://boiefiling.fincen.gov/fileboir", ["boiefiling.fincen.gov"], 500);
    say(/Beneficial Ownership/i.test(st.text), `the browser (${env.provider}) starts and opens a public agency page (FinCEN's BOI E-Filing)`);
  } finally { await b.close(); }
} catch (e) {
  say(false, `browser (${env.provider}): ${e instanceof Error ? e.message.slice(0, 160) : e}`);
}
say(true, `${PLAYBOOKS.length} playbooks, ${PLAYBOOKS.filter((p) => p.verified).length} verified on a watched first run`);
const bad = lines.filter(([ok]) => !ok).length;
console.log(bad ? `\n${bad} thing${bad === 1 ? "" : "s"} to fix.` : "\nAll good: the portal worker is ready.");
process.exit(bad ? 1 : 0);
