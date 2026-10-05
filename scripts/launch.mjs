#!/usr/bin/env node
/* Takes Placetta from preview to production in one run:
     1. asks for your keys (typed keys are hidden and never written to disk, except a temporary file the Supabase CLI reads)
     2. creates the Stripe prices and the webhook (test or live, depending on the key)
     3. sets every Edge Function secret in the Placetta Supabase project
     4. builds the app and, if you want, deploys it to Netlify
     5. checks each server function is configured
   Run from the repo root:  npm install && node scripts/launch.mjs
   Needs Node 18+. The first run of the Supabase CLI asks you to log in (npx supabase login). */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";

const REF = "esquxzcfsylffuijvzec";
const SUPABASE_URL = `https://${REF}.supabase.co`;
const PUBLISHABLE = "sb_publishable_Ub54H3S-bU8WDuY7toMtzg_S1ieEO_p";
const ANON_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcXV4emNmc3lsZmZ1aWp2emVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5OTEzMzQsImV4cCI6MjEwNjU2NzMzNH0.iZqmAxn083ub4c4Kfcv57cfg8EydkmnvUb6Pzr2wIsY";
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/stripe-webhook`;
const WEBHOOK_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];

/* Prices match the landing page: Starter $750 and Growth $2,000 a month billed annually, $100 a month per extra location,
   and the $299 entry plan per market. Stripe needs every recurring item in one checkout on the same interval, so all are yearly. */
const PRICES = [
  { secret: "STRIPE_PRICE_ENTRY", lookup: "placetta_entry", name: "Placetta Entry plan (per market)", cents: 29_900, yearly: false },
  { secret: "STRIPE_PRICE_STARTER", lookup: "placetta_starter_yearly", name: "Placetta Starter", cents: 900_000, yearly: true },
  { secret: "STRIPE_PRICE_GROWTH", lookup: "placetta_growth_yearly", name: "Placetta Growth", cents: 2_400_000, yearly: true },
  { secret: "STRIPE_PRICE_EXTRA_LOCATION", lookup: "placetta_extra_location_yearly", name: "Placetta extra location", cents: 120_000, yearly: true },
];

const bold = (s) => `\x1b[1m${s}\x1b[0m`, dim = (s) => `\x1b[2m${s}\x1b[0m`, green = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`;

/* One prompt. Hidden prompts read the terminal in raw mode and echo a star per character, so a key never shows,
   not even when you paste it or press backspace. */
function ask(question, { hidden = false, fallback = "" } = {}) {
  const { stdin, stdout } = process;
  if (!hidden || !stdin.isTTY) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: stdin, output: stdout, terminal: !!stdin.isTTY });
      rl.question(question, (a) => { rl.close(); resolve(a.trim() || fallback); });
    });
  }
  return new Promise((resolve) => {
    let value = "";
    stdout.write(question);
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
    const done = () => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData); stdout.write("\n"); resolve(value.trim() || fallback); };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done();
        if (ch === "\u0003") { stdin.setRawMode(false); stdout.write("\n"); process.exit(130); }
        if (ch === "\u007f" || ch === "\b") { if (value) { value = value.slice(0, -1); stdout.write("\b \b"); } continue; }
        if (ch < " ") continue;
        value += ch; stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
  return r.status === 0;
}

async function stripe(key, method, path, form, idem) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", ...(idem ? { "Idempotency-Key": idem } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${body?.error?.message ?? res.status}`);
  return body;
}

async function setupStripe(key, secrets) {
  const mode = key.includes("_live_") ? "LIVE" : "test";
  console.log(`\n${bold("Stripe")} (${mode} mode)`);
  for (const p of PRICES) {
    const found = await stripe(key, "GET", `prices?active=true&lookup_keys[]=${encodeURIComponent(p.lookup)}`);
    let price = found.data?.[0];
    if (!price) {
      const form = { currency: "usd", unit_amount: String(p.cents), lookup_key: p.lookup, "product_data[name]": p.name };
      if (p.yearly) form["recurring[interval]"] = "year";
      price = await stripe(key, "POST", "prices", form, `placetta-${p.lookup}`);
      console.log(`  created ${p.name}: ${price.id}`);
    } else console.log(`  found ${p.name}: ${price.id}`);
    secrets[p.secret] = price.id;
  }
  const hooks = await stripe(key, "GET", "webhook_endpoints?limit=100");
  const existing = hooks.data?.find((h) => h.url === WEBHOOK_URL);
  if (existing) {
    console.log(`  webhook already exists (${existing.id}). Stripe shows its signing secret only in the dashboard.`);
    const s = await ask("  Paste its signing secret (whsec_...), or leave blank to keep the current one: ", { hidden: true });
    if (s) secrets.STRIPE_WEBHOOK_SECRET = s;
  } else {
    const form = { url: WEBHOOK_URL, description: "Placetta plans" };
    WEBHOOK_EVENTS.forEach((e, i) => { form[`enabled_events[${i}]`] = e; });
    const hook = await stripe(key, "POST", "webhook_endpoints", form);
    secrets.STRIPE_WEBHOOK_SECRET = hook.secret;
    console.log(`  created webhook ${hook.id}`);
  }
  console.log(dim("  Turn on the customer portal in Stripe (Settings, Billing, Customer portal) so people can manage cards and invoices."));
}

function setSecrets(secrets) {
  const names = Object.keys(secrets);
  if (!names.length) return true;
  const dir = mkdtempSync(join(tmpdir(), "placetta-"));
  const file = join(dir, "secrets.env");
  try {
    writeFileSync(file, names.map((k) => `${k}=${String(secrets[k]).replace(/\n/g, "")}`).join("\n") + "\n", { mode: 0o600 });
    console.log(`\n${bold("Supabase secrets")}: ${names.join(", ")}`);
    return run("npx", ["--yes", "supabase", "secrets", "set", "--project-ref", REF, "--env-file", file]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* Each function checks its own secrets before anything else, so a request without a signed-in user tells us whether the
   secrets are there: 503 means missing; the expected refusal (401 for a stranger, 400 for an unsigned webhook) means set.
   It can't tell whether a key is valid; the first real sign-in and test filing does that. */
async function check() {
  console.log(`\n${bold("Checking the server")}`);
  const probes = [["agent", "AI agent", 401], ["tts", "Voice", 401], ["billing", "Checkout", 401], ["stripe-webhook", "Stripe webhook", 400]];
  for (const [fn, label, expected] of probes) {
    let status = 0;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, { method: "POST", headers: { Authorization: `Bearer ${ANON_JWT}`, apikey: ANON_JWT, "Content-Type": "application/json" }, body: "{}" });
      status = res.status;
    } catch { /* offline */ }
    const word = status === expected ? green("keys set") : status === 503 ? red("missing keys") : red(status ? `couldn't check (HTTP ${status})` : "couldn't reach it");
    console.log(`  ${word}  ${label}`);
  }
}

async function main() {
  console.log(bold("Placetta: preview to production\n"));
  console.log(dim("Leave anything blank to skip it. Keys you type are hidden.\n"));

  const app = (await ask("App address (e.g. https://app.placetta.com, or blank if you'll deploy to Netlify now): ")).replace(/\/+$/, "");
  const secrets = {};
  const anthropic = await ask("Anthropic API key (sk-ant-...): ", { hidden: true });
  if (anthropic) secrets.ANTHROPIC_API_KEY = anthropic;
  const azure = await ask("Azure Speech key: ", { hidden: true });
  if (azure) {
    secrets.AZURE_SPEECH_KEY = azure;
    secrets.AZURE_SPEECH_REGION = await ask("Azure Speech region [eastus]: ", { fallback: "eastus" });
  }
  const sk = await ask("Stripe secret key (sk_test_... to try it first, sk_live_... to charge): ", { hidden: true });
  if (sk) { secrets.STRIPE_SECRET_KEY = sk; await setupStripe(sk, secrets); }
  secrets.OAUTH_STATE_SECRET = randomBytes(32).toString("hex");

  console.log(`\n${bold("Building the app")}`);
  const env = { ...process.env, VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_KEY: PUBLISHABLE };
  if (!run("npm", ["run", "build"], { env })) { console.log(red("Build failed. Fix the error above and run this again.")); process.exit(1); }
  copyFileSync("vercel.json", "dist/vercel.json");

  let origin = app;
  const deploy = (await ask("\nDeploy to Netlify now? It asks you to log in and pick or create a site. [y/N] ")).toLowerCase().startsWith("y");
  if (deploy) {
    const ok = run("npx", ["--yes", "netlify-cli", "deploy", "--prod", "--dir", "dist"]);
    if (!ok) console.log(red("Netlify deploy did not finish. You can drag the dist folder onto app.netlify.com/drop instead."));
    if (!origin) origin = (await ask("Paste the live site address Netlify printed (https://...): ")).replace(/\/+$/, "");
  }
  if (origin) secrets.APP_ORIGINS = origin;
  else console.log(dim("No app address yet, so checkout and integrations will refuse to return anywhere. Run this again once the app is online."));

  if (!setSecrets(secrets)) {
    console.log(red("\nSetting secrets failed. Run `npx supabase login` and try again, or add them in the dashboard: Edge Functions, Secrets."));
    process.exit(1);
  }
  await check();

  const staff = await ask("\nYour team's email for the filing queue (blank to skip): ");
  console.log(`\n${bold("Three things only the dashboard can do")} (supabase.com/dashboard/project/${REF})`);
  console.log(`  1. Authentication, URL Configuration: Site URL ${origin || "<your app address>"}; add the same to Redirect URLs.`);
  console.log("  2. Authentication, Emails, SMTP Settings: add your sender (Resend, Postmark or SES). Then in the Magic Link template add: Your code: {{ .Token }}");
  console.log(`  3. SQL Editor: insert into public.staff_emails (email) values ('${(staff || "you@placetta.com").toLowerCase()}');`);
  console.log(`\nThen sign up at ${origin || "your app"}, buy the entry plan${sk && !sk.includes("_live_") ? " with Stripe's test card 4242 4242 4242 4242" : ""}, and file one test application end to end.`);
}

main().catch((e) => { console.error(red(`\n${e.message}`)); process.exit(1); });
