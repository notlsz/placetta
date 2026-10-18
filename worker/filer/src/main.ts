// Entry point: node --experimental-strip-types src/main.ts
// Hosted browser (Browserbase) when BROWSERBASE_API_KEY is set, local Chromium otherwise (CHROMIUM_PATH for a custom binary).
import { chromium } from "playwright-core";
import { DEST } from "../../../supabase/functions/file/destinations.ts";
import { AnthropicModel } from "./model.ts";
import { playbookFor } from "./playbooks.ts";
import { type Route, Worker, type Session } from "./run.ts";
import { SupabaseStore } from "./store.ts";

/** The destination's tenant path, other hosts and start page, from destinations.ts like its host. */
export const routeOf = (id: string): Route | null => {
  const d = DEST[id];
  return d?.portal ? { tenant: d.tenant, alsoOn: d.alsoOn, start: d.portalUrl } : null;
};

export async function openBrowser(): Promise<Session> {
  const key = process.env.BROWSERBASE_API_KEY, project = process.env.BROWSERBASE_PROJECT_ID;
  if (key && project) {
    const res = await fetch("https://api.browserbase.com/v1/sessions", { method: "POST", headers: { "X-BB-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project, keepAlive: true }) });
    if (!res.ok) throw new Error(`browserbase ${res.status}`);
    const s = await res.json() as { id: string; connectUrl: string };
    const browser = await chromium.connectOverCDP(s.connectUrl);
    const page = browser.contexts()[0]?.pages()[0] ?? await (browser.contexts()[0] ?? await browser.newContext()).newPage();
    const live = await fetch(`https://api.browserbase.com/v1/sessions/${s.id}/debug`, { headers: { "X-BB-API-Key": key } }).then((r) => r.json()).catch(() => ({})) as { debuggerFullscreenUrl?: string };
    return { browser, page, liveUrl: live.debuggerFullscreenUrl?.startsWith("https://") ? live.debuggerFullscreenUrl : null,
      close: async () => { await browser.close(); await fetch(`https://api.browserbase.com/v1/sessions/${s.id}`, { method: "POST", headers: { "X-BB-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project, status: "REQUEST_RELEASE" }) }).catch(() => undefined); } };
  }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_PATH ? ["--no-sandbox"] : [] });
  const page = await (await browser.newContext()).newPage();
  return { browser, page, liveUrl: null, close: () => browser.close() };
}

export const settings = () => ({
  dryRun: process.env.FILER_DRY_RUN === "1", twoKey: Number(process.env.FILER_TWO_KEY ?? "10"),
  maxSteps: 80, maxMs: 15 * 60_000, holdMs: 20 * 60_000, pollMs: 5000,
  // Off unless staff turn it on to watch a playbook's first run on the live site.
  allowUnverified: process.env.FILER_ALLOW_UNVERIFIED === "1",
});

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.FILER_ENABLED !== "1") { console.log("FILER_ENABLED is not 1; the portal worker is off."); process.exit(0); }
  const store = new SupabaseStore(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const w = new Worker({ store, model: new AnthropicModel(process.env.ANTHROPIC_API_KEY!), open: openBrowser, portalOf: (id) => DEST[id]?.portal ?? null,
    routeOf, playbookOf: playbookFor, ...settings() });
  for (;;) {
    try { if (!(await w.once())) await new Promise((r) => setTimeout(r, 5000)); }
    catch (e) { console.error("worker:", e instanceof Error ? e.message : e); await new Promise((r) => setTimeout(r, 5000)); }
  }
}
