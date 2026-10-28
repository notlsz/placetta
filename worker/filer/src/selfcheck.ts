// The founder's check, in one command: cd worker/filer && npm run check (on Render: the service's Shell tab, same
// command). Each line says yes or what to fix. It reads, it never files: the keys are there and work, the database has
// the worker's functions, Chromium starts, and a public agency page opens. Exit code 0 when everything passes.
import { checkEnv, missingLines } from "./env.ts";
import { launchLocal, readPublic } from "./probe.ts";
import { PLAYBOOKS } from "./playbooks.ts";
import { dbKey, SupabaseStore } from "./store.ts";
import { VERSION } from "./main.ts";

const lines: [boolean, string][] = [];
const say = (ok: boolean, line: string) => { lines.push([ok, line]); console.log(`${ok ? "yes " : "FIX "} ${line}`); };

const env = checkEnv(process.env);
say(env.ok, env.ok ? "keys: SUPABASE_URL, the database key and ANTHROPIC_API_KEY are set" : `keys: ${missingLines(env).join("; ")}`);
for (const w of env.warnings) console.log(`note ${w}`);
say(true, `browser: ${env.browser === "local" ? "local Chromium in the container (Browserbase not needed)" : "Browserbase for the hosts that refuse a cloud server, local Chromium for the rest"}`);
say(!!env.publicUrl || env.browser === "browserbase", env.publicUrl ? `live browser for hand-backs at ${env.publicUrl}/live/...` : "live browser: no public address; on Render, RENDER_EXTERNAL_URL is set for a web service");

if (process.env.ANTHROPIC_API_KEY) {
  const r = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } }).catch(() => null);
  say(!!r?.ok, r?.ok ? "Anthropic key works" : `Anthropic key refused (${r?.status ?? "no answer"}): make a new one at console.anthropic.com`);
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
  const b = await launchLocal();
  try {
    const st = await readPublic(b, "https://boiefiling.fincen.gov/fileboir", ["boiefiling.fincen.gov"], 500);
    say(/Beneficial Ownership/i.test(st.text), "Chromium starts and opens a public agency page (FinCEN's BOI E-Filing)");
  } finally { await b.close(); }
} catch (e) {
  say(false, `Chromium: ${e instanceof Error ? e.message.slice(0, 160) : e}`);
}
say(true, `${PLAYBOOKS.length} playbooks, ${PLAYBOOKS.filter((p) => p.verified).length} verified on a watched first run`);
const bad = lines.filter(([ok]) => !ok).length;
console.log(bad ? `\n${bad} thing${bad === 1 ? "" : "s"} to fix.` : "\nAll good: the portal worker is ready.");
process.exit(bad ? 1 : 0);
