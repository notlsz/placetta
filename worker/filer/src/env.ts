// What the worker needs to run, checked before it takes a single filing. Missing keys never mean a half-working
// worker: it claims nothing, says exactly which value is missing and where to find it (in the log and on /healthz),
// and Render's health check marks the deploy failed, right where the founder pasted the values. Pure.

import { usableSeats } from "./llm.ts";

export type EnvCheck = {
  ok: boolean;
  /** The values that must be set and aren't, with where to get each one. */
  missing: { key: string; where: string }[];
  warnings: string[];
  /** Which browser runs the filings: local Chromium in the container (the default; "browserbase" when its keys are set
   *  for the hosts that refuse a cloud server), or every run on Steel or Browserbase (BROWSER_PROVIDER). */
  browser: "local" | "browserbase" | "steel";
  /** The models a filing step may go to, in failover order ("anthropic:claude-sonnet-5-5"): no keys, only names. */
  models: string[];
  /** BROWSER_PROVIDER's first choice: local (the default), steel or browserbase. */
  provider: Provider;
  /** The whole order a run tries (providersOf). */
  providers: Provider[];
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
  ANTHROPIC_API_KEY: "a model key: console.anthropic.com, Settings, API keys, Create key (or GEMINI_API_KEY with GEMINI_PAID=1, OPENROUTER_API_KEY or MUSE_API_KEY: SETUP.md, Odelia's models)",
  STEEL_API_KEY: "app.steel.dev, sign up (the free plan is enough), API Keys, copy the key",
  BROWSERBASE_API_KEY: "browserbase.com, Settings, API Key",
  BROWSERBASE_PROJECT_ID: "browserbase.com, Settings, Project ID",
  BROWSER_PROVIDER: "local, steel or browserbase, or an order of them such as browserbase,steel,local (unset: browserbase,steel,local when Browserbase's keys are set, else local Chromium)",
};

export type Provider = "local" | "steel" | "browserbase";
const PROVIDERS: Provider[] = ["local", "steel", "browserbase"];
/** BROWSER_PROVIDER, an ordered list ("browserbase,steel,local"): a run opens on the first that gives it a session, and
 *  the next is tried when one refuses (a quota, a 4xx or 5xx, a failed connection; browsers.ts opener). Unset: with
 *  Browserbase's two keys, browserbase, then steel when STEEL_API_KEY is set, then local Chromium (Browserbase Developer
 *  is $20 a month for 100 browser hours with 6-hour sessions and recording that can be turned off; Steel's free plan
 *  caps a session at 15 minutes and records every one); without them, local Chromium as before. Any name other than
 *  the three makes the list "invalid" (the worker files nothing). */
export function providersOf(env: Record<string, string | undefined>): Provider[] | "invalid" {
  const raw = (env.BROWSER_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) {
    const bb = !!env.BROWSERBASE_API_KEY?.trim() && !!env.BROWSERBASE_PROJECT_ID?.trim();
    return bb ? ["browserbase", ...(env.STEEL_API_KEY?.trim() ? ["steel" as const] : []), "local"] : ["local"];
  }
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length || list.some((p) => !PROVIDERS.includes(p as Provider))) return "invalid";
  return [...new Set(list)] as Provider[];
}
/** The order with every provider whose keys aren't set left out, while one that can run remains (a single provider is
 *  kept as it is, so its own missing key is what the run reports). */
export function usableProviders(env: Record<string, string | undefined>): Provider[] | "invalid" {
  const l = providersOf(env);
  if (l === "invalid" || l.length < 2) return l;
  const bb = !!env.BROWSERBASE_API_KEY?.trim() && !!env.BROWSERBASE_PROJECT_ID?.trim();
  const keyed = (x: Provider) => x === "local" || (x === "steel" ? !!env.STEEL_API_KEY?.trim() : bb);
  return l.some(keyed) ? l.filter(keyed) : l;
}
/** The first choice (what the worker reports as its browser). */
export function providerOf(env: Record<string, string | undefined>): Provider | "invalid" {
  const l = usableProviders(env);
  return l === "invalid" ? l : l[0];
}

export function checkEnv(env: Record<string, string | undefined>): EnvCheck {
  const has = (k: string) => !!env[k]?.trim();
  const missing: EnvCheck["missing"] = [];
  const warnings: string[] = [];
  if (!has("SUPABASE_URL")) missing.push({ key: "SUPABASE_URL", where: WHERE.SUPABASE_URL });
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(env.SUPABASE_URL!.trim()) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(env.SUPABASE_URL!.trim())) warnings.push("SUPABASE_URL doesn't look like https://<project>.supabase.co");
  if (!has("FILER_DB_KEY") && !has("SUPABASE_SERVICE_ROLE_KEY")) missing.push({ key: "SUPABASE_SERVICE_ROLE_KEY", where: WHERE.SUPABASE_SERVICE_ROLE_KEY });
  else if (!has("FILER_DB_KEY")) warnings.push("FILER_DB_KEY is not set: the worker uses the service role key until the filer's own key exists (docs/soc2/runbooks/filer-least-privilege.md).");
  // at least one model the data rules allow (llm.ts); every other one set is a failover seat
  const models = usableSeats((k) => env[k]);
  // a free Gemini key with GEMINI_FREE_SYNTHETIC=1 runs rehearsals (synthetic workspaces) only: enough to start, but
  // every customer's filing waits for the team until a model that may see customer data is set
  const rehearsalOnly = !models.length && usableSeats((k) => env[k], { synthetic: true }).length > 0;
  if (rehearsalOnly) warnings.push("Only a free Gemini key is set (GEMINI_FREE_SYNTHETIC=1): it runs rehearsals on synthetic workspaces only. Every customer's filing waits for the team until ANTHROPIC_API_KEY (or GEMINI_PAID=1) is set.");
  else if (!models.length) missing.push({ key: "ANTHROPIC_API_KEY", where: WHERE.ANTHROPIC_API_KEY });
  else if (models.length === 1) warnings.push(`Only one model can run filings: if it hits a spend limit or goes down, filings wait for the team. Add GEMINI_API_KEY (with GEMINI_PAID=1), OPENROUTER_API_KEY or MUSE_API_KEY as a failover.`);
  if (has("ANTHROPIC_API_KEY") && !/^sk-ant-/.test(env.ANTHROPIC_API_KEY!.trim())) warnings.push("ANTHROPIC_API_KEY doesn't start with sk-ant-: check it was pasted whole.");
  if (has("GEMINI_API_KEY") && env.GEMINI_PAID !== "1" && env.GEMINI_FREE_SYNTHETIC !== "1") warnings.push("GEMINI_API_KEY is set without GEMINI_PAID=1: Google's free tier may use prompts to improve its products, so Gemini gets no filing until billing is on and GEMINI_PAID=1.");
  const bb = has("BROWSERBASE_API_KEY") && has("BROWSERBASE_PROJECT_ID");
  const list = providersOf(env);
  if (list === "invalid") missing.push({ key: "BROWSER_PROVIDER", where: WHERE.BROWSER_PROVIDER });
  // A list is an order of fallbacks: a provider in it without its keys is skipped (a warning) while another listed one
  // can run; with none that can, its keys are missing and the worker files nothing.
  const all = list === "invalid" ? [] : list;
  const keyed = (x: Provider) => x === "local" || (x === "steel" ? has("STEEL_API_KEY") : bb);
  const named = all.length > 1 && all.some(keyed) ? all.filter(keyed) : all;
  for (const x of all.filter((y) => !named.includes(y))) warnings.push(`${x} is in BROWSER_PROVIDER but its keys aren't set: skipped until they are.`);
  if (named.includes("steel") && !has("STEEL_API_KEY")) missing.push({ key: "STEEL_API_KEY", where: WHERE.STEEL_API_KEY });
  if (named.includes("browserbase")) {
    if (!has("BROWSERBASE_API_KEY")) missing.push({ key: "BROWSERBASE_API_KEY", where: WHERE.BROWSERBASE_API_KEY });
    if (!has("BROWSERBASE_PROJECT_ID")) missing.push({ key: "BROWSERBASE_PROJECT_ID", where: WHERE.BROWSERBASE_PROJECT_ID });
  } else if (has("BROWSERBASE_API_KEY") !== has("BROWSERBASE_PROJECT_ID")) warnings.push("Browserbase needs both BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID; using local Chromium.");
  const p: Provider | "invalid" = list === "invalid" ? "invalid" : named[0];
  if (named.length > 1 && named[0] === "steel") warnings.push("Steel first: its free plan caps a session at 15 minutes and records every session. browserbase,steel,local puts it second.");
  // the first choice is remote: runs start on a provider's browser (local Chromium, if listed, is the last resort)
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
  return { ok: missing.length === 0, missing, warnings, models: models.map((m) => `${m.vendor}:${m.model}`), browser, provider, providers: named, remote, wake: secret.length >= 32, publicUrl: pub };
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
