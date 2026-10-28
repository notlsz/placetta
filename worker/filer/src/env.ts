// What the worker needs to run, checked before it takes a single filing. Missing keys never mean a half-working
// worker: it claims nothing, says exactly which value is missing and where to find it (in the log and on /healthz),
// and Render's health check marks the deploy failed, right where the founder pasted the values. Pure.

export type EnvCheck = {
  ok: boolean;
  /** The values that must be set and aren't, with where to get each one. */
  missing: { key: string; where: string }[];
  warnings: string[];
  /** Which browser runs the filings: local Chromium in the container (the default; "browserbase" when its keys are set
   *  for the hosts that refuse a cloud server), or every run on Steel or Browserbase (BROWSER_PROVIDER). */
  browser: "local" | "browserbase" | "steel";
  /** BROWSER_PROVIDER as read: local (the default), steel or browserbase. */
  provider: Provider;
  /** Every run on a remote browser: no Chromium is ever started in this container (it fits Render's free plan). */
  remote: boolean;
  /** FILER_SECRET is set (32+ characters): the server can wake this worker with an authenticated ping (POST /wake). */
  wake: boolean;
  /** The worker's own public address, for the live browser it serves (Render sets RENDER_EXTERNAL_URL itself). */
  publicUrl: string | null;
};

export const WHERE = {
  SUPABASE_URL: "Supabase, Project Settings, API, Project URL (render.yaml already has it)",
  FILER_DB_KEY: "the filer's own key (docs/soc2/runbooks/filer-least-privilege.md); until it exists, set SUPABASE_SERVICE_ROLE_KEY instead",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase, Project Settings, API keys, service_role (secret)",
  ANTHROPIC_API_KEY: "console.anthropic.com, Settings, API keys, Create key",
  STEEL_API_KEY: "app.steel.dev, sign up (the free plan is enough), API Keys, copy the key",
  BROWSERBASE_API_KEY: "browserbase.com, Settings, API Key",
  BROWSERBASE_PROJECT_ID: "browserbase.com, Settings, Project ID",
  BROWSER_PROVIDER: "local, steel or browserbase (or leave it unset for local Chromium)",
};

export type Provider = "local" | "steel" | "browserbase";
/** BROWSER_PROVIDER: unset is local Chromium; anything other than the three is "invalid" (the worker files nothing). */
export function providerOf(env: Record<string, string | undefined>): Provider | "invalid" {
  const v = (env.BROWSER_PROVIDER ?? "").trim().toLowerCase();
  if (!v) return "local";
  return v === "local" || v === "steel" || v === "browserbase" ? v : "invalid";
}

export function checkEnv(env: Record<string, string | undefined>): EnvCheck {
  const has = (k: string) => !!env[k]?.trim();
  const missing: EnvCheck["missing"] = [];
  const warnings: string[] = [];
  if (!has("SUPABASE_URL")) missing.push({ key: "SUPABASE_URL", where: WHERE.SUPABASE_URL });
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(env.SUPABASE_URL!.trim()) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(env.SUPABASE_URL!.trim())) warnings.push("SUPABASE_URL doesn't look like https://<project>.supabase.co");
  if (!has("FILER_DB_KEY") && !has("SUPABASE_SERVICE_ROLE_KEY")) missing.push({ key: "SUPABASE_SERVICE_ROLE_KEY", where: WHERE.SUPABASE_SERVICE_ROLE_KEY });
  else if (!has("FILER_DB_KEY")) warnings.push("FILER_DB_KEY is not set: the worker uses the service role key until the filer's own key exists (docs/soc2/runbooks/filer-least-privilege.md).");
  if (!has("ANTHROPIC_API_KEY")) missing.push({ key: "ANTHROPIC_API_KEY", where: WHERE.ANTHROPIC_API_KEY });
  else if (!/^sk-ant-/.test(env.ANTHROPIC_API_KEY!.trim())) warnings.push("ANTHROPIC_API_KEY doesn't start with sk-ant-: check it was pasted whole.");
  const bb = has("BROWSERBASE_API_KEY") && has("BROWSERBASE_PROJECT_ID");
  const p = providerOf(env);
  if (p === "invalid") missing.push({ key: "BROWSER_PROVIDER", where: WHERE.BROWSER_PROVIDER });
  if (p === "steel" && !has("STEEL_API_KEY")) missing.push({ key: "STEEL_API_KEY", where: WHERE.STEEL_API_KEY });
  if (p === "browserbase") {
    if (!has("BROWSERBASE_API_KEY")) missing.push({ key: "BROWSERBASE_API_KEY", where: WHERE.BROWSERBASE_API_KEY });
    if (!has("BROWSERBASE_PROJECT_ID")) missing.push({ key: "BROWSERBASE_PROJECT_ID", where: WHERE.BROWSERBASE_PROJECT_ID });
  } else if (has("BROWSERBASE_API_KEY") !== has("BROWSERBASE_PROJECT_ID")) warnings.push("Browserbase needs both BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID; using local Chromium.");
  const remote = p === "steel" || p === "browserbase";
  const provider: Provider = p === "invalid" ? "local" : p;
  const browser: EnvCheck["browser"] = p === "steel" ? "steel" : p === "browserbase" || bb ? "browserbase" : "local";
  const publicUrl = (env.FILER_PUBLIC_URL || env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "") || null;
  const pub = publicUrl?.startsWith("https://") ? publicUrl : null;
  if (!pub && remote) warnings.push("No public address (RENDER_EXTERNAL_URL or FILER_PUBLIC_URL): the owner's hand-backs use the browser provider's live view, but a CAPTCHA can't go to the Placetta team's covered view.");
  else if (!pub && !bb) warnings.push("No public address (RENDER_EXTERNAL_URL or FILER_PUBLIC_URL): hand-backs (a CAPTCHA, a code, the fee) can't open a live browser.");
  const secret = (env.FILER_SECRET ?? "").trim();
  if (!secret) warnings.push("FILER_SECRET is not set: the server can't wake this worker on demand, so on a plan that sleeps, agency-website filings go another way while it's asleep.");
  else if (secret.length < 32) warnings.push("FILER_SECRET is shorter than 32 characters: wake on demand stays off. Use the same value as the Supabase secret.");
  return { ok: missing.length === 0, missing, warnings, browser, provider, remote, wake: secret.length >= 32, publicUrl: pub };
}

/** The lines the worker logs at start when something is missing: each key, and where to find it. */
export const missingLines = (c: EnvCheck) => c.missing.map((m) => `missing ${m.key}: ${m.where}`);

/** Hosts on which local Chromium on a cloud server is refused by the agency's bot protection (seen 2026-10-24 from a
 *  data-center address: Akamai "Access Denied" on EDD and sanjoseca.gov, Imperva on bizfile Online, a 403 on
 *  MassTaxConnect). A run there uses Browserbase when its keys are set; FILER_BROWSERBASE_HOSTS adds more, "*" sends
 *  every run there. */
export const BLOCKS_DATACENTER = ["eddservices.edd.ca.gov", "bizfileonline.sos.ca.gov", "mtc.dor.state.ma.us", "www.sanjoseca.gov"];
export function wantsHostedBrowser(host: string, env: Record<string, string | undefined>): boolean {
  if (!(env.BROWSERBASE_API_KEY && env.BROWSERBASE_PROJECT_ID)) return false;
  const extra = (env.FILER_BROWSERBASE_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (extra.includes("*")) return true;
  const h = host.toLowerCase();
  return [...BLOCKS_DATACENTER, ...extra].some((x) => h === x || h.endsWith("." + x));
}

/** The agency's bot protection refused the browser (not a page of the form). */
const BLOCKED = /^(access denied|403 forbidden|request blocked|forbidden)$|this request was blocked by our security service|you don't have permission to access .* on this server|errors\.edgesuite\.net|incapsula incident id/i;
export const blockedPage = (s: { title: string; headings: string[]; text: string }) =>
  BLOCKED.test(s.title.trim()) || s.headings.some((h) => BLOCKED.test(h.trim())) || BLOCKED.test(s.text.slice(0, 600));
