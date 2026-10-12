#!/usr/bin/env node
/* npm run selftest: runs Odelia's live self-test on the deployed agent-run function and prints a pass/fail table.
   Needs SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens) to read the monitor key; exits 1 on a failure. */
import { readFileSync } from "node:fs";
import { runSelftest } from "./selftest-lib.mjs";

const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
if (!token) { console.error("Set SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens) and run again."); process.exit(2); }
const ref = process.env.SUPABASE_PROJECT_REF ?? /project_id\s*=\s*"([^"]+)"/.exec(readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8"))?.[1];
if (!ref) { console.error("No project ref: set SUPABASE_PROJECT_REF."); process.exit(2); }

const out = await runSelftest({ ref, token });
process.exit(out.ok ? 0 : 1);
