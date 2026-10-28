// npm run check:messaging: for iMessage (Linq), SMS (Telnyx), WhatsApp and email (Amazon SES), whether each one's keys
// are set, whether the provider accepts them, and whether the deployed webhook answers and refuses a forged one. Reads
// the keys from the environment (export them, or `npm run check:messaging -- --env-file=supabase/.env.secrets`; the
// same names as in Supabase, Edge Functions, Secrets). Prints names and yes or no, never a value. Exits 1 when a
// channel that has any key set isn't ready.
//   --offline       only the keys: no call to any provider or to the project
//   --url=<base>    the functions' base (default https://esquxzcfsylffuijvzec.supabase.co/functions/v1, or SUPABASE_URL)
import { checkMessaging, reportLines } from "../supabase/functions/_shared/messaging_check.ts";

const args = new Map(Deno.args.map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.join("=") || "1"] as [string, string]; }));
const file = args.get("env-file");
const vars: Record<string, string> = {};
if (file) {
  for (const line of (await Deno.readTextFile(file)).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const env = (k: string) => vars[k] ?? Deno.env.get(k);
const base = args.get("url") ?? `${(env("SUPABASE_URL") || "https://esquxzcfsylffuijvzec.supabase.co").replace(/\/+$/, "")}/functions/v1`;
const report = await checkMessaging(env, { fnUrl: base, offline: args.has("offline") });
console.log(reportLines(report).join("\n"));
// a channel someone started setting up (any of its keys set) that isn't ready is a failure; one not started isn't
const broken = report.filter((c) => c.started && !c.ready);
console.log(report.every((c) => c.ready) ? "\nEvery channel is ready." : `\n${report.filter((c) => c.ready).length} of ${report.length} channels ready. SETUP.md, "Messaging: what the founder sets up", has the steps.`);
Deno.exit(broken.length ? 1 : 0);
