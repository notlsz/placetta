/* Odelia's live self-test, called from the command line: asks the deployed agent-run function to run its short
   real-model checks on scratch workspaces in memory ({action: "selftest"}) and prints a pass/fail table.
   The function only answers the server's monitor key, read here from the database's vault with the Supabase
   Management API, so it needs a Supabase access token. Nothing is written to any workspace. */

const bold = (s) => `\x1b[1m${s}\x1b[0m`, dim = (s) => `\x1b[2m${s}\x1b[0m`, green = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`;

async function sql(ref, token, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`database: ${typeof data === "object" && data?.message ? data.message : res.status}`);
  return data;
}

/** Runs the self-test and prints the table. Returns {ok, model, checks, total_ms} (ok false with an error when it couldn't run). */
export async function runSelftest({ ref, token, log = console.log }) {
  log(`\n${bold("Odelia self-test")} ${dim("(real model, scratch workspaces in memory; about a minute)")}`);
  let key;
  try {
    const rows = await sql(ref, token, "select decrypted_secret as key from vault.decrypted_secrets where name = 'monitor_key' limit 1");
    key = rows?.[0]?.key;
  } catch (e) { log(`  ${red("couldn't run")}  ${e.message}`); return { ok: false, error: e.message }; }
  if (!key) { log(`  ${red("couldn't run")}  no monitor key in the vault yet: apply the database migrations first.`); return { ok: false, error: "no monitor key" }; }

  let out;
  try {
    const res = await fetch(`https://${ref}.supabase.co/functions/v1/agent-run`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": key }, body: JSON.stringify({ action: "selftest" }),
      signal: AbortSignal.timeout(170_000),
    });
    const text = await res.text();
    try { out = JSON.parse(text); } catch { out = null; }
    if (!res.ok || !out || !Array.isArray(out.checks)) {
      const msg = out?.error?.message ?? `HTTP ${res.status}: ${text.slice(0, 200)}`;
      log(`  ${red("couldn't run")}  ${msg}${res.status === 404 ? " (is agent-run deployed?)" : ""}`);
      return { ok: false, error: msg };
    }
  } catch (e) { log(`  ${red("couldn't run")}  ${e.name === "TimeoutError" ? "no answer in 170 s" : e.message}`); return { ok: false, error: String(e.message) }; }

  printTable(out, log);
  return out;
}

export function printTable(out, log = console.log) {
  const w = Math.max(...out.checks.map((c) => c.name.length), 5);
  log(dim(`  ${"check".padEnd(w)}  result  time    detail`));
  for (const c of out.checks) {
    log(`  ${c.name.padEnd(w)}  ${c.pass ? green("pass  ") : red("FAIL  ")}  ${(String(Math.round(c.ms / 100) / 10) + "s").padEnd(6)}  ${dim(String(c.detail ?? "").slice(0, 160))}`);
  }
  const passed = out.checks.filter((c) => c.pass).length;
  log(`  ${out.ok ? green(`all ${passed} passed`) : red(`${out.checks.length - passed} of ${out.checks.length} failed`)} ${dim(`on ${out.model ?? "?"} in ${Math.round((out.total_ms ?? 0) / 1000)} s`)}`);
}
