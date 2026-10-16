#!/usr/bin/env node
/* Takes Placetta from preview to production in one run:
     1. asks for your keys (typed keys are hidden; nothing is written to disk except a temporary file the Supabase CLI reads)
     2. brings the database up to date (applies any migration the project doesn't have yet)
     3. deploys every server function
     4. creates the Stripe prices and the webhook (test or live, depending on the key)
     5. sets every server secret
     6. configures sign-in: your app address, your email sender and templates, Google and Microsoft, two-step sign-in
     7. builds the app and, if you want, deploys it to Netlify
     8. adds your team and checks each server function
     9. runs Odelia's live self-test on the deployed agent (npm run selftest runs it again any time)
   Run from the repo root:  npm install && npm run launch
   Needs Node 18+ and a Supabase access token (supabase.com/dashboard/account/tokens). */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";
import { runSelftest } from "./selftest-lib.mjs";

const REF = "esquxzcfsylffuijvzec";
const SUPABASE_URL = `https://${REF}.supabase.co`;
const PUBLISHABLE = "sb_publishable_Ub54H3S-bU8WDuY7toMtzg_S1ieEO_p";
const ANON_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcXV4emNmc3lsZmZ1aWp2emVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5OTEzMzQsImV4cCI6MjEwNjU2NzMzNH0.iZqmAxn083ub4c4Kfcv57cfg8EydkmnvUb6Pzr2wIsY";
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/stripe-webhook`;
const WEBHOOK_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];

/* Prices match the landing page: $149 a location a month billed yearly, $3,500 once per new store opening,
   and the $299 entry plan per market. Stripe needs every recurring item in one checkout on the same interval, so the plan is yearly. */
const PRICES = [
  { secret: "STRIPE_PRICE_ENTRY", lookup: "placetta_entry", name: "Placetta Entry plan (per market)", cents: 29_900, yearly: false },
  { secret: "STRIPE_PRICE_LOCATION", lookup: "placetta_location_yearly", name: "Placetta per location (billed yearly)", cents: 178_800, yearly: true },
  { secret: "STRIPE_PRICE_OPENING", lookup: "placetta_opening", name: "Placetta new store opening", cents: 350_000, yearly: false },
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

let TOKEN = "";   // Supabase access token: given to the Supabase CLI and the Management API, never saved
function run(cmd, args, opts = {}) {
  const env = { ...process.env, ...(TOKEN ? { SUPABASE_ACCESS_TOKEN: TOKEN } : {}), ...(opts.env ?? {}) };
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts, env });
  return r.status === 0;
}

/* ------------------------------------------------ Supabase Management API */

async function mgmt(method, path, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${path}: ${typeof data === "object" && data?.message ? data.message : res.status}`);
  return data;
}
const sql = (query) => mgmt("POST", "database/query", { query });

/** Applies, in order, every migration in supabase/migrations whose name the project hasn't recorded yet. */
async function migrate() {
  console.log(`\n${bold("Database")}`);
  const done = new Set((await sql("select name from supabase_migrations.schema_migrations")).map((r) => r.name));
  const files = readdirSync("supabase/migrations").filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  let applied = 0;
  for (const f of files) {
    const [, version, name] = /^(\d+)_(.+)\.sql$/.exec(f);
    if (done.has(name)) continue;
    const body = readFileSync(join("supabase/migrations", f), "utf8");
    await sql(body);
    await sql(`insert into supabase_migrations.schema_migrations(version, name, statements) values ('${version}', '${name.replace(/'/g, "")}', array[$placetta_migration$${body}$placetta_migration$])`);
    console.log(`  applied ${name}`); applied++;
  }
  if (!applied) console.log("  already up to date");
}

/** Sign-in settings, through the Management API. Each part is sent on its own so one problem doesn't stop the rest. */
async function configureAuth(o) {
  console.log(`\n${bold("Sign-in")}`);
  const parts = [];
  if (o.origin) parts.push(["app address", { site_url: o.origin, uri_allow_list: [o.origin, `${o.origin}/**`].join(",") }]);
  parts.push(["two-step sign-in", { mfa_totp_enroll_enabled: true, mfa_totp_verify_enabled: true }]);
  if (o.resend) parts.push(["email sender (Resend)", { smtp_host: "smtp.resend.com", smtp_port: 465, smtp_user: "resend", smtp_pass: o.resend, smtp_admin_email: o.from, smtp_sender_name: "Placetta", external_email_enabled: true, mailer_autoconfirm: false }]);
  parts.push(["email templates", {
    mailer_subjects_magic_link: "Your Placetta sign-in code",
    mailer_templates_magic_link_content: EMAIL("Your sign-in code is", "{{ .Token }}", "Or sign in with this link", "{{ .ConfirmationURL }}"),
    mailer_subjects_confirmation: "Your Placetta sign-in code",
    mailer_templates_confirmation_content: EMAIL("Your sign-in code is", "{{ .Token }}", "Or confirm with this link", "{{ .ConfirmationURL }}"),
    mailer_subjects_invite: "You're invited to Placetta",
    mailer_templates_invite_content: EMAIL("A teammate invited you to their Placetta workspace.", "", "Accept the invite", "{{ .ConfirmationURL }}"),
  }]);
  if (o.google) parts.push(["Google sign-in", { external_google_enabled: true, external_google_client_id: o.google.id, external_google_secret: o.google.secret }]);
  if (o.microsoft) parts.push(["Microsoft sign-in", { external_azure_enabled: true, external_azure_client_id: o.microsoft.id, external_azure_secret: o.microsoft.secret, external_azure_url: "https://login.microsoftonline.com/common" }]);
  for (const [label, body] of parts) {
    try { await mgmt("PATCH", "config/auth", body); console.log(`  ${green("set")}  ${label}`); }
    catch (e) { console.log(`  ${red("not set")}  ${label}: ${e.message}. Set it in the dashboard (Authentication).`); }
  }
}

const EMAIL = (lead, code, linkText, link) => `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:440px;margin:0 auto;padding:32px 24px;color:#0E1116">
<p style="font-size:15px;margin:0 0 12px">${lead}</p>
${code ? `<p style="font-size:32px;letter-spacing:6px;font-weight:600;margin:0 0 20px">${code}</p>` : ""}
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#0E1116;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">${linkText}</a></p>
<p style="font-size:12px;color:#6B7280;margin:0">If you didn't ask for this, you can ignore this email.</p>
</div>`;

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

/* Text and call Odelia (Telnyx). The number, its messaging profile and its Call Control application are set up in
   Telnyx's portal (SETUP.md, "Text and call Odelia"); this asks for their IDs and, if you have none yet, creates the
   AI Assistant that talks on calls. Each call sends its own instructions, voice and tools, so the stored one is a shell. */
async function setupTelnyx(secrets) {
  console.log(`\n${bold("Text and call Odelia")} ${dim("(Telnyx. Leave blank to skip; Settings then says texting isn't set up yet.)")}`);
  const key = await ask("Telnyx API key (KEY...): ", { hidden: true });
  if (!key) return;
  secrets.TELNYX_API_KEY = key;
  const pub = await ask("Telnyx public key, for webhook signatures (Account, Keys and credentials, Public key): ");
  if (pub) secrets.TELNYX_PUBLIC_KEY = pub.trim();
  const num = (await ask("Odelia's phone number in Telnyx (+1...): ")).replace(/[^\d+]/g, "");
  if (num) secrets.ODELIA_NUMBER = num.startsWith("+") ? num : `+1${num.replace(/^1(?=\d{10}$)/, "")}`;
  const profile = await ask(`Messaging profile ID (its inbound webhook is ${SUPABASE_URL}/functions/v1/odelia-sms): `);
  if (profile) secrets.TELNYX_MESSAGING_PROFILE_ID = profile.trim();
  const conn = await ask(`Call Control application ID for calls (webhook ${SUPABASE_URL}/functions/v1/odelia-voice), blank for texts only: `);
  if (!conn) return;
  secrets.TELNYX_VOICE_CONNECTION_ID = conn.trim();
  let assistant = (await ask("Telnyx AI Assistant ID (blank to create one named Odelia): ")).trim();
  if (!assistant) {
    try {
      const res = await fetch("https://api.telnyx.com/v2/ai/assistants", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Odelia (Placetta)", description: "Placetta's AI compliance agent on the phone. odelia-voice sends each call's instructions, voice and tools.",
          instructions: "You are Odelia, Placetta's AI compliance agent. Follow the instructions sent with each call.",
          telephony_settings: { user_idle_reply_secs: 8, user_idle_timeout_secs: 30, time_limit_secs: 900 },
          privacy_settings: { data_retention: false },
        }),
      });
      const body = await res.json().catch(() => ({}));
      assistant = String(body?.id ?? body?.data?.id ?? "");
      if (!res.ok || !assistant) throw new Error(body?.errors?.[0]?.detail ?? `HTTP ${res.status}`);
      console.log(`  ${green("created")}  AI Assistant ${assistant}`);
    } catch (e) { console.log(`  ${red("not created")}  AI Assistant: ${e.message}. Create one in Telnyx (AI, Assistants) and run this again.`); }
  }
  if (assistant) secrets.TELNYX_ASSISTANT_ID = assistant;
}

/* Odelia on iMessage (Linq, linqapp.com: the provider Poke, Lindy and Instinct use). Start the 7-day Pro trial or the
   free tier (20 contacts), then paste the API key: this lists the account's lines, subscribes odelia-sms to incoming
   messages (Linq shows the signing secret once, so it goes straight into the secrets), and can forward each line's
   calls to Odelia's Telnyx number so people save one number for both. Texts then go by iMessage, falling back to RCS and
   SMS for Android, without waiting on 10DLC; Telnyx stays for calls and as the fallback. */
async function setupLinq(secrets) {
  console.log(`\n${bold("Odelia on iMessage")} ${dim("(Linq. Leave blank to skip; texts then go by Telnyx SMS.)")}`);
  const key = await ask("Linq API key: ", { hidden: true });
  if (!key) return;
  const linq = async (method, path, body) => {
    const res = await fetch(`https://api.linqapp.com/api/partner${path}`, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
    return j;
  };
  let lines = [];
  try {
    const j = await linq("GET", "/v3/phone_numbers");
    lines = (j.phone_numbers ?? []).filter((p) => (p.line_type ?? "iMessage") === "iMessage").map((p) => ({ id: p.id, number: p.phone_number }));
  } catch (e) { console.log(`  ${red("couldn't list lines")}  ${e.message}`); return; }
  if (!lines.length) { console.log(`  ${red("no iMessage lines")}  Add one in Linq's dashboard, then run this again.`); return; }
  console.log(`  lines: ${lines.map((l) => l.number).join(", ")}`);
  const pick = (await ask(`Lines for Odelia, comma separated [all ${lines.length}]: `)).split(",").map((x) => x.replace(/[^\d+]/g, "")).filter(Boolean);
  const use = pick.length ? lines.filter((l) => pick.some((p) => l.number.endsWith(p.replace(/^\+?1?/, "")))) : lines;
  if (!use.length) { console.log(`  ${red("none of those are on the account")}`); return; }
  try {
    const sub = await linq("POST", "/v3/webhook-subscriptions", { target_url: `${SUPABASE_URL}/functions/v1/odelia-sms?version=2026-02-03`, subscribed_events: ["message.received"], phone_numbers: use.map((l) => l.number) });
    if (!sub.signing_secret) throw new Error("no signing secret in the answer");
    secrets.LINQ_WEBHOOK_SECRET = sub.signing_secret;
    console.log(`  ${green("subscribed")}  odelia-sms to incoming messages (${sub.id})`);
  } catch (e) { console.log(`  ${red("not subscribed")}  ${e.message}. Add a webhook for message.received in Linq and paste its secret below.`); const s = await ask("Webhook signing secret (whsec_...): ", { hidden: true }); if (!s) return; secrets.LINQ_WEBHOOK_SECRET = s; }
  secrets.LINQ_API_KEY = key;
  secrets.LINQ_NUMBERS = use.map((l) => l.number).join(",");
  const voice = secrets.ODELIA_NUMBER;
  if (voice && /^y/i.test(await ask(`Forward calls to these lines to Odelia's phone number ${voice}, so people save one number? [Y/n] `, { fallback: "y" }))) {
    let all = true;
    for (const l of use) {
      try { await linq("PUT", `/v3/phone_numbers/${encodeURIComponent(l.id)}`, { forwarding_number: voice }); } catch (e) { all = false; console.log(`  ${red("not forwarded")}  ${l.number}: ${e.message}`); }
    }
    if (all) { secrets.LINQ_FORWARDS_CALLS = "1"; console.log(`  ${green("forwarding")}  calls to ${voice}`); }
  }
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
  // Text and call Odelia says for itself whether its Telnyx secrets are all there.
  const line = await fetch(`${SUPABASE_URL}/functions/v1/odelia-sms`, { method: "POST", headers: { Authorization: `Bearer ${ANON_JWT}`, apikey: ANON_JWT, "Content-Type": "application/json" }, body: JSON.stringify({ action: "line" }) })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  console.log(`  ${line ? (line.configured ? green("keys set") : dim("not set up")) : red("couldn't reach it")}  Texting Odelia${line?.configured ? ` (${line.display})` : ""}`);
  if (line) console.log(`  ${line.voice ? green("keys set") : dim("not set up")}  Calling Odelia`);
}

async function main() {
  console.log(bold("Placetta: preview to production\n"));
  console.log(dim("Leave anything blank to skip it. Keys you type are hidden.\n"));

  TOKEN = await ask("Supabase access token (supabase.com/dashboard/account/tokens): ", { hidden: true });
  if (!TOKEN) console.log(dim("  No token: the database update, function deploy and sign-in settings are skipped. The CLI will ask you to log in for secrets."));
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
  await setupTelnyx(secrets);
  await setupLinq(secrets);

  const auth = {};
  if (TOKEN) {
    console.log(dim("\nSign-in emails need your own sender. Resend is the quickest: resend.com, add your domain, create an API key."));
    auth.resend = await ask("Resend API key (re_...): ", { hidden: true });
    if (auth.resend) auth.from = await ask("Send sign-in emails from [no-reply@placetta.com]: ", { fallback: "no-reply@placetta.com" });
    console.log(dim(`\nGoogle and Microsoft sign-in are optional. Their redirect address is ${SUPABASE_URL}/auth/v1/callback`));
    const gid = await ask("Google OAuth client ID: ");
    if (gid) auth.google = { id: gid, secret: await ask("Google OAuth client secret: ", { hidden: true }) };
    const mid = await ask("Microsoft (Entra ID) application ID: ");
    if (mid) auth.microsoft = { id: mid, secret: await ask("Microsoft client secret: ", { hidden: true }) };
  }
  const staff = (await ask("Your team's emails for the filing queue, comma separated (blank to skip): ")).toLowerCase();

  if (TOKEN) {
    await migrate();
    console.log(`\n${bold("Server functions")}`);
    // Odelia's server copy is bundled from src (tools, prompts, skills); rebuild it so the server never runs an old agent.
    if (!run("npm", ["run", "build:agent"])) console.log(red("  Agent bundle failed to build. See the error above."));
    if (!run("npx", ["--yes", "supabase", "functions", "deploy", "--project-ref", REF, "--use-api"])) console.log(red("  Function deploy failed. See the error above, then run this again."));
  }
  if (sk) { secrets.STRIPE_SECRET_KEY = sk; await setupStripe(sk, secrets); }
  secrets.OAUTH_STATE_SECRET = randomBytes(32).toString("hex");
  // The same sender powers the daily update emails from the monitor.
  if (auth.resend) { secrets.RESEND_API_KEY = auth.resend; secrets.MAIL_FROM = `Placetta <${auth.from}>`; }

  console.log(`\n${bold("Building the app")}`);
  const env = { VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_KEY: PUBLISHABLE };
  if (!run("npm", ["run", "build"], { env })) { console.log(red("Build failed. Fix the error above and run this again.")); process.exit(1); }

  let origin = app;
  const deploy = (await ask("\nDeploy to Vercel now? It asks you to log in and pick or create a project. [y/N] ")).toLowerCase().startsWith("y");
  if (deploy) {
    // Vercel builds from the project folder with vercel.json and .env.production.
    const ok = run("npx", ["--yes", "vercel", "deploy", "--prod"]);
    if (!ok) console.log(red("Vercel deploy did not finish. You can also import the GitHub repo at vercel.com/new."));
    if (!origin) origin = (await ask("Paste the live site address Vercel printed (https://...): ")).replace(/\/+$/, "");
  }
  if (origin) secrets.APP_ORIGINS = origin;
  else console.log(dim("No app address yet, so checkout, invites and integrations won't know where to send people back. Run this again once the app is online."));

  if (!setSecrets(secrets)) {
    console.log(red("\nSetting secrets failed. Check the access token, or add them in the dashboard: Edge Functions, Secrets."));
    process.exit(1);
  }
  if (TOKEN) {
    await configureAuth({ ...auth, origin });
    // Plans only apply once there's a way to pay: with Stripe set up, switch payments on.
    if (sk) {
      try { await sql("update public.app_settings set payments_on = true, updated_at = now()"); console.log(`  ${green("on")}  payments: plans now apply`); }
      catch (e) { console.log(`  ${red("not switched on")}  payments: ${e.message}`); }
    }
    const emails = staff.split(",").map((e) => e.trim()).filter((e) => /^[^@\s']+@[^@\s']+\.[^@\s']+$/.test(e));
    if (emails.length) {
      try { await sql(`insert into public.staff_emails (email) values ${emails.map((e) => `('${e}')`).join(", ")} on conflict do nothing`); console.log(`  ${green("added")}  team: ${emails.join(", ")}`); }
      catch (e) { console.log(`  ${red("not added")}  team: ${e.message}`); }
    }
  }
  await check();
  // Odelia on the deployed functions with a real model: runs once the functions are deployed and the model key is set.
  let selftest = null;
  if (TOKEN) selftest = await runSelftest({ ref: REF, token: TOKEN });

  console.log(`\n${bold("Left to do")}`);
  if (selftest && !selftest.ok) console.log(`  Odelia's self-test didn't pass${selftest.error ? ` (${selftest.error})` : ""}. Check the model key in the Edge Function secrets and the agent-run logs, then run: npm run selftest`);
  if (!TOKEN) {
    console.log(`  Dashboard (supabase.com/dashboard/project/${REF}): Authentication, URL Configuration (Site URL ${origin || "<your app>"}), SMTP Settings, and SQL Editor:`);
    console.log("  run supabase/migrations/20261005050000_teams_roles_two_step.sql, then: insert into public.staff_emails (email) values ('you@placetta.com');");
  }
  if (TOKEN && !auth.resend) console.log("  Add an email sender (Authentication, Emails, SMTP). Without one, sign-in emails only reach your Supabase team.");
  console.log("  Turn on the Stripe customer portal (Settings, Billing, Customer portal).");
  console.log("  Your team: sign in, turn on two-step sign-in in Settings, Security. The filing queue opens after that.");
  console.log(`\nThen sign up at ${origin || "your app"}, buy the entry plan${sk && !sk.includes("_live_") ? " with Stripe's test card 4242 4242 4242 4242" : ""}, and file one test application end to end.`);
}

main().catch((e) => { console.error(red(`\n${e.message}`)); process.exit(1); });
