#!/usr/bin/env node
/* Placetta SOC 2 evidence bundle. Collects what the repo and the founder's own API tokens can show, and writes a dated
   folder (evidence.json, summary.md, SHA256SUMS) wherever you choose, never inside the repo. Tokens are read from the
   environment, used for read-only calls, and never written: the bundle is scanned for them before it's saved.

     node scripts/soc2-evidence.mjs --dry-run                  what it would collect; reads the repo only, no network
     node scripts/soc2-evidence.mjs --out ~/placetta-evidence   collect and write the bundle

   Options: --since 90 (days)  --repo notlsz/placetta  --branch main  --project-ref esquxzcfsylffuijvzec  --run-tests
   Tokens, each optional (a source without its token is skipped and listed as skipped in the summary):
     GITHUB_TOKEN or GH_TOKEN    fine-grained, this repo only, read-only: Actions, Administration, Contents, Metadata,
                                 Pull requests, Dependabot alerts, Secret scanning alerts
     SUPABASE_ACCESS_TOKEN       supabase.com/dashboard/account/tokens: migrations, functions, secret names, backups,
                                 auth settings, and read-only SQL (row-level security, scheduled jobs, audit triggers)
     SUPABASE_SERVICE_ROLE_KEY   staff with two-step status, audit-log and incident counts (SUPABASE_URL defaults to
                                 https://<project-ref>.supabase.co)
   What each source shows and how an auditor uses it: docs/soc2/README.md, "Evidence". */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkDependabot, trackedFiles } from "./check-dependabot.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GITHUB_API = "https://api.github.com";
const SUPABASE_API = "https://api.supabase.com";
const DAY = 86_400_000;

/* ================================ pure helpers (tested in soc2-evidence.test.mjs) ================================ */

export function parseArgs(argv) {
  const a = { since: 90, dryRun: false, runTests: false, allowInsideRepo: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === "--dry-run") a.dryRun = true;
    else if (k === "--run-tests") a.runTests = true;
    else if (k === "--allow-inside-repo") a.allowInsideRepo = true;
    else if (k === "--help" || k === "-h") a.help = true;
    else if (k === "--out") a.out = v();
    else if (k === "--since") a.since = Number(v());
    else if (k === "--repo") a.repo = v();
    else if (k === "--branch") a.branch = v();
    else if (k === "--project-ref") a.ref = v();
    else throw new Error(`Unknown option ${k}. Try --help.`);
  }
  if (!Number.isFinite(a.since) || a.since < 1 || a.since > 730) throw new Error("--since takes a number of days, 1 to 730.");
  return a;
}

/** Replaces every token value in text. Returns the clean text and how many it replaced. */
export function redact(text, secrets) {
  let n = 0, out = text;
  for (const s of secrets) {
    if (!s || s.length < 8) continue;
    const parts = out.split(s);
    n += parts.length - 1;
    out = parts.join("[redacted]");
  }
  return { text: out, replaced: n };
}

/** "0-0/1234" or "*\/0" from PostgREST's Content-Range. */
export function countFromRange(h) {
  const m = String(h ?? "").match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** Workflow runs into counts: by conclusion and event, on the protected branch, and the failures. */
export function summarizeRuns(runs, branch) {
  const by = (k) => runs.reduce((o, r) => ((o[r[k] ?? "in_progress"] = (o[r[k] ?? "in_progress"] ?? 0) + 1), o), {});
  const onBranch = runs.filter((r) => r.head_branch === branch && r.event === "push");
  const dates = runs.map((r) => r.created_at).sort();
  return {
    total: runs.length,
    by_conclusion: by("conclusion"),
    by_event: by("event"),
    on_branch: { total: onBranch.length, success: onBranch.filter((r) => r.conclusion === "success").length,
                 failure: onBranch.filter((r) => r.conclusion === "failure").length },
    first_at: dates[0] ?? null,
    last_at: dates[dates.length - 1] ?? null,
    failures: runs.filter((r) => r.conclusion === "failure").slice(0, 20)
      .map((r) => ({ id: r.id, branch: r.head_branch, event: r.event, sha: String(r.head_sha ?? "").slice(0, 12), at: r.created_at, url: r.html_url })),
  };
}

/** Local migration files against the live history, by version and, where versions differ, by name. */
export function compareMigrations(local, live) {
  const liveVersions = new Set(live.map((m) => String(m.version)));
  const liveByName = new Map();
  for (const m of live) liveByName.set(m.name, [...(liveByName.get(m.name) ?? []), String(m.version)]);
  const localVersions = new Set(local.map((m) => m.version)), localNames = new Set(local.map((m) => m.name));
  const seen = new Map();
  for (const m of local) seen.set(m.version, (seen.get(m.version) ?? 0) + 1);
  return {
    local: local.length,
    live: live.length,
    applied: local.filter((m) => liveVersions.has(m.version)).map((m) => `${m.version}_${m.name}`),
    applied_under_other_version: local.filter((m) => !liveVersions.has(m.version) && liveByName.has(m.name))
      .map((m) => ({ file: `${m.version}_${m.name}`, live_versions: liveByName.get(m.name) })),
    pending: local.filter((m) => !liveVersions.has(m.version) && !liveByName.has(m.name)).map((m) => `${m.version}_${m.name}`),
    live_only: live.filter((m) => !localVersions.has(String(m.version)) && !localNames.has(m.name)).map((m) => `${m.version} ${m.name}`),
    duplicate_local_versions: [...seen].filter(([, n]) => n > 1).map(([v]) => v),
  };
}

/** Function folders in the repo against what's deployed: missing, extra, older than the code, JWT setting. */
export function compareFunctions(local, live) {
  const L = new Map(local.map((f) => [f.slug, f])), D = new Map(live.map((f) => [f.slug, f]));
  const ms = (t) => (typeof t === "number" ? t : Date.parse(t));
  return {
    not_deployed: local.filter((f) => !D.has(f.slug)).map((f) => f.slug),
    deployed_not_in_repo: live.filter((f) => !L.has(f.slug)).map((f) => f.slug),
    older_than_code: local.filter((f) => D.has(f.slug) && f.last_change && ms(D.get(f.slug).updated_at) < ms(f.last_change))
      .map((f) => ({ slug: f.slug, deployed_at: new Date(ms(D.get(f.slug).updated_at)).toISOString(), code_changed_at: f.last_change })),
    verify_jwt_mismatch: local.filter((f) => D.has(f.slug) && D.get(f.slug).verify_jwt !== f.verify_jwt)
      .map((f) => ({ slug: f.slug, config: f.verify_jwt, deployed: D.get(f.slug).verify_jwt })),
  };
}

/** Branch protection as GitHub reports it, against .github/branch-protection.json. Empty list: it matches. */
export function compareProtection(expected, live) {
  const out = [];
  const on = (x) => (x && typeof x === "object" ? !!x.enabled : !!x);
  const want = expected.required_status_checks;
  if (want) {
    const have = live.required_status_checks;
    if (!have) out.push("no required status checks");
    else {
      const names = new Set([...(have.contexts ?? []), ...(have.checks ?? []).map((c) => c.context)]);
      for (const c of want.checks ?? []) if (!names.has(c.context)) out.push(`status check "${c.context}" isn't required`);
      if (want.strict && !have.strict) out.push("branches don't have to be up to date before merging");
    }
  }
  const wr = expected.required_pull_request_reviews, hr = live.required_pull_request_reviews;
  if (wr) {
    if (!hr) out.push("pull requests aren't required");
    else {
      if ((hr.required_approving_review_count ?? 0) < (wr.required_approving_review_count ?? 0))
        out.push(`${hr.required_approving_review_count ?? 0} approvals required, policy says ${wr.required_approving_review_count}`);
      if (wr.require_code_owner_reviews && !hr.require_code_owner_reviews) out.push("code owner review isn't required");
      if (wr.dismiss_stale_reviews && !hr.dismiss_stale_reviews) out.push("new commits don't dismiss old approvals");
      if (wr.require_last_push_approval && !hr.require_last_push_approval) out.push("the last push doesn't need its own approval");
    }
  }
  if (expected.enforce_admins && !on(live.enforce_admins)) out.push("admins can bypass the rules");
  if (expected.allow_force_pushes === false && on(live.allow_force_pushes)) out.push("force pushes are allowed");
  if (expected.allow_deletions === false && on(live.allow_deletions)) out.push("the branch can be deleted");
  if (expected.required_conversation_resolution && !on(live.required_conversation_resolution)) out.push("open review comments don't block a merge");
  return out;
}

/** The two-step status of each staff email, from the auth admin user list. Customer accounts are only counted. */
export function staffMfa(staffEmails, users) {
  const byEmail = new Map(users.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u]));
  const verified = (u) => (u.factors ?? []).filter((f) => f.status === "verified").length;
  const staff = staffEmails.map((s) => {
    const u = byEmail.get(String(s.email).toLowerCase());
    if (!u) return { email: s.email, added_at: s.added_at ?? null, signed_up: false, mfa: false };
    const meta = u.user_metadata ?? {};
    return { email: s.email, name: meta.full_name ?? meta.name ?? null, added_at: s.added_at ?? null, signed_up: true,
             email_confirmed: !!u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at ?? null,
             mfa: verified(u) > 0, mfa_factors: verified(u) };
  });
  return { staff, all_users: { total: users.length, with_mfa: users.filter((u) => verified(u) > 0).length } };
}

/** Policy metadata from the table at the top of each policy: owner, review cadence, next review, overdue. */
export function policyMeta(text, today) {
  const cell = (label) => {
    const m = text.match(new RegExp(`^\\|\\s*${label}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, "mi"));
    return m ? m[1].trim() : null;
  };
  const title = (text.match(/^#\s+(.+)$/m) ?? [])[1] ?? null;
  const next = cell("Next review");
  return { title, owner: cell("Owner"), review: cell("Review"), last_reviewed: cell("Last reviewed"), next_review: next,
           overdue: !!(next && /^\d{4}-\d{2}-\d{2}$/.test(next) && next < today) };
}

/** Rows of the control matrix by status. */
export function controlCounts(text) {
  const counts = { "in place": 0, partial: 0, gap: 0 }, rows = [];
  for (const line of text.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4 || !/^[A-Z]{1,3}\d/.test(cells[1] ?? "")) continue;
    const status = cells.map((c) => c.toLowerCase().replace(/\*/g, "")).find((c) => c === "in place" || c === "partial" || c === "gap");
    if (!status) continue;
    counts[status]++;
    rows.push({ id: cells[1], status });
  }
  return { counts, rows: rows.length };
}

/** Only the auth settings an auditor needs, and never one that could hold a secret. */
export function pickAuthSettings(cfg) {
  const allow = /^(mfa_|password_(min_length|required_characters|hibp_enabled)$|security_|refresh_token_rotation_enabled$|sessions_|jwt_exp$|disable_signup$|mailer_autoconfirm$|mailer_secure_email_change_enabled$|external_[a-z0-9_]+_enabled$|site_url$|uri_allow_list$|rate_limit_)/;
  const deny = /(secret|_key$|apikey|token$|_pass|smtp|hook_|_url$)/;
  const out = {};
  for (const [k, v] of Object.entries(cfg ?? {})) {
    if (!allow.test(k) || (deny.test(k) && k !== "site_url")) continue;
    if (v === null || ["boolean", "number"].includes(typeof v) || (typeof v === "string" && v.length <= 300)) out[k] = v;
  }
  return out;
}

/** What should be looked at, from everything collected. Plain sentences, worst first. */
export function attention(ev) {
  const f = [], d = (id) => ev.sources[id]?.data, ok = (id) => ev.sources[id]?.status === "ok";
  const bp = ev.sources["github.branch_protection"];
  if (bp?.status === "ok" && d("github.branch_protection").protected === false) f.push(`Branch protection is off on ${ev.branch}: ${d("github.branch_protection").reason}`);
  if (bp?.status === "ok" && d("github.branch_protection").mismatches?.length) f.push(`Branch protection differs from .github/branch-protection.json: ${d("github.branch_protection").mismatches.join("; ")}`);
  const git = d("repo.git_main");
  if (git && git.direct > 0) f.push(`${git.direct} of ${git.commits} commits on ${ev.branch} in the window didn't come through a pull request`);
  const dep = d("github.deploy_runs");
  if (dep && dep.skipped > 0) f.push(`${dep.skipped} of ${dep.checked} recent "Deploy server functions" runs passed without deploying (no SUPABASE_ACCESS_TOKEN repository secret), so functions are deployed by hand`);
  const fn = d("supabase.functions");
  if (fn?.compare?.not_deployed?.length) f.push(`Functions in the repo that were never deployed: ${fn.compare.not_deployed.join(", ")}`);
  if (fn?.compare?.older_than_code?.length) f.push(`Functions deployed before their latest code change: ${fn.compare.older_than_code.map((x) => x.slug).join(", ")}`);
  if (fn?.compare?.verify_jwt_mismatch?.length) f.push(`Functions whose JWT setting differs from supabase/config.toml: ${fn.compare.verify_jwt_mismatch.map((x) => x.slug).join(", ")}`);
  const mig = d("supabase.migrations");
  if (mig?.compare?.pending?.length) f.push(`${mig.compare.pending.length} migration files aren't applied to the live database: ${mig.compare.pending.slice(0, 8).join(", ")}${mig.compare.pending.length > 8 ? ", ..." : ""}`);
  if (mig?.compare?.live_only?.length) f.push(`Live migrations with no file in the repo: ${mig.compare.live_only.join(", ")}`);
  const staff = d("supabase.staff");
  if (staff) for (const s of staff.staff.filter((x) => !x.mfa)) f.push(`Staff account ${s.email} has no two-step sign-in${s.signed_up ? "" : " (it has never signed up)"}`);
  const bk = d("supabase.backups");
  if (bk && !bk.pitr_enabled) f.push(`Point-in-time recovery is off${bk.backups === 0 ? ", and there are no backups at all" : ""}`);
  if (d("supabase.network")?.ssl_enforced === false) f.push("Direct database connections don't have to use TLS (Database settings, SSL enforcement)");
  const da = ev.sources["github.dependabot_alerts"];
  if (da?.status === "unavailable") f.push(`Dependabot alerts: ${da.reason}`);
  if (da?.status === "ok" && (da.data.by_severity.critical || da.data.by_severity.high)) f.push(`Open Dependabot alerts: ${da.data.by_severity.critical ?? 0} critical, ${da.data.by_severity.high ?? 0} high`);
  const prs = d("github.pull_requests");
  if (prs?.dependabot?.open_over_14_days > 0) f.push(`${prs.dependabot.open_over_14_days} Dependabot pull requests have been open more than 14 days`);
  const audit = d("repo.npm_audit");
  if (audit) for (const a of audit.filter((x) => (x.high ?? 0) + (x.critical ?? 0) > 0)) f.push(`npm audit (${a.dir === "." ? "app" : a.dir}): ${a.critical} critical, ${a.high} high in production dependencies`);
  const db = d("supabase.database");
  if (db?.tables_without_rls?.length) f.push(`Tables in public without row-level security: ${db.tables_without_rls.join(", ")}`);
  const pol = d("repo.policies");
  if (pol) for (const p of pol.filter((x) => x.overdue)) f.push(`Policy review overdue: ${p.file} (was due ${p.next_review})`);
  const st = d("repo.security_txt");
  if (st && st.days_left !== null && st.days_left < 60) f.push(`security.txt expires in ${st.days_left} days`);
  const ci = d("github.ci_runs");
  const main = ci?.["ci.yml"]?.on_branch;
  if (main && main.failure > 0) f.push(`CI failed ${main.failure} of ${main.total} times on pushes to ${ev.branch} in the window`);
  const inc = d("supabase.incidents");
  if (inc && inc.open > 0) f.push(`${inc.open} incidents have no fix recorded`);
  if (!ok("repo.dependabot")) f.push("Dependabot doesn't cover every manifest (see repo.dependabot)");
  return f;
}

/* ================================ I/O ================================ */

function git(ctx, args) {
  return execFileSync("git", args, { cwd: ctx.root, encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "ignore"] }).trim();
}

async function http(ctx, url, { headers = {}, method = "GET", body } = {}) {
  const res = await ctx.fetch(url, { method, headers, body });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, ok: res.ok, json, text: json === null ? text.slice(0, 300) : null, headers: res.headers };
}

const ghHeaders = (ctx) => ({ Authorization: `Bearer ${ctx.tokens.github}`, Accept: "application/vnd.github+json",
                              "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "placetta-soc2-evidence" });
const gh = (ctx, path) => http(ctx, GITHUB_API + path, { headers: ghHeaders(ctx) });

/** Every page of a GitHub list, by page number (a short page is the last), up to maxPages of 100. */
async function ghAll(ctx, path, key, maxPages = 5) {
  const base = GITHUB_API + path + (path.includes("?") ? "&" : "?") + "per_page=100";
  let out = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await http(ctx, `${base}&page=${page}`, { headers: ghHeaders(ctx) });
    if (!r.ok) return page === 1 ? { error: r } : { items: out, truncated: `page ${page}: HTTP ${r.status}` };
    const items = key ? r.json?.[key] ?? [] : r.json ?? [];
    out = out.concat(items);
    if (items.length < 100) return { items: out };
  }
  return { items: out, truncated: `stopped after ${maxPages} pages` };
}

const sbm = (ctx, path, opts = {}) => http(ctx, SUPABASE_API + path, {
  ...opts, headers: { Authorization: `Bearer ${ctx.tokens.supabase}`, "Content-Type": "application/json", ...(opts.headers ?? {}) } });

const rest = (ctx, path, headers = {}) => http(ctx, ctx.supabaseUrl + path, {
  headers: { apikey: ctx.tokens.serviceRole, Authorization: `Bearer ${ctx.tokens.serviceRole}`, ...headers } });

const failed = (r) => {
  const msg = r.json?.message ?? r.json?.msg ?? r.json?.error ?? r.text ?? "";
  return Object.assign(new Error(`HTTP ${r.status}${msg ? `: ${String(msg).slice(0, 200)}` : ""}`), { status: r.status, msg: String(msg) });
};

async function sql(ctx, query) {
  const r = await sbm(ctx, `/v1/projects/${ctx.ref}/database/query`, { method: "POST", body: JSON.stringify({ query, read_only: true }) });
  if (!r.ok) throw failed(r);
  return r.json;
}

function localMigrations(root) {
  const dir = join(root, "supabase/migrations");
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => {
    const m = f.match(/^(\d+)_(.+)\.sql$/);
    return m ? { version: m[1], name: m[2] } : { version: f, name: f };
  });
}

function localFunctions(ctx) {
  const dir = join(ctx.root, "supabase/functions");
  const cfg = readFileSync(join(ctx.root, "supabase/config.toml"), "utf8");
  const noJwt = new Set([...cfg.matchAll(/\[functions\.([\w-]+)\][^[]*?verify_jwt\s*=\s*false/g)].map((m) => m[1]));
  return readdirSync(dir).filter((f) => !f.startsWith("_") && existsSync(join(dir, f, "index.ts"))).sort().map((slug) => {
    let last = null;
    try { last = git(ctx, ["log", "-1", "--format=%cI", "--", `supabase/functions/${slug}`]) || null; } catch { /* not a git checkout */ }
    return { slug, verify_jwt: !noJwt.has(slug), last_change: last };
  });
}

/* ================================ the sources ================================ */

const SOURCES = [
  /* ---------------- the repo: no token, no network ---------------- */
  {
    id: "repo.git_main", needs: [], shows: "every commit on the protected branch in the window: through a pull request, a merge, or direct",
    run: async (ctx) => {
      let ref = `origin/${ctx.branch}`;
      try { git(ctx, ["rev-parse", "--verify", ref]); } catch { ref = ctx.branch; }
      const log = git(ctx, ["log", ref, "--first-parent", `--since=${ctx.sinceISO}`, "--format=%H%x09%an%x09%cI%x09%P%x09%s"]);
      const rows = log ? log.split("\n").map((l) => { const [sha, author, at, parents, ...s] = l.split("\t"); return { sha, author, at, merge: parents.split(" ").length > 1, subject: s.join("\t") }; }) : [];
      const viaPr = rows.filter((r) => /^Merge pull request #\d+/.test(r.subject) || /\(#\d+\)$/.test(r.subject));
      const authors = rows.reduce((o, r) => ((o[r.author] = (o[r.author] ?? 0) + 1), o), {});
      return { ref, commits: rows.length, via_pull_request: viaPr.length, merges_without_pr: rows.filter((r) => r.merge && !viaPr.includes(r)).length,
               direct: rows.filter((r) => !viaPr.includes(r)).length, authors, first_at: rows.at(-1)?.at ?? null, last_at: rows[0]?.at ?? null };
    },
  },
  {
    id: "repo.migrations", needs: [], shows: "the migration files, and versions used twice",
    run: async (ctx) => {
      const files = localMigrations(ctx.root);
      const c = compareMigrations(files, []);
      return { files: files.length, first: files[0] ? `${files[0].version}_${files[0].name}` : null, last: files.at(-1) ? `${files.at(-1).version}_${files.at(-1).name}` : null, duplicate_versions: c.duplicate_local_versions };
    },
  },
  {
    id: "repo.functions", needs: [], shows: "server functions in the repo, their JWT setting in supabase/config.toml and when their code last changed",
    run: async (ctx) => localFunctions(ctx),
  },
  {
    id: "repo.tests", needs: [], shows: "the test suites CI runs and how many tests they declare; with --run-tests, their results",
    run: async (ctx) => {
      const ci = readFileSync(join(ctx.root, ".github/workflows/ci.yml"), "utf8");
      const pkg = JSON.parse(readFileSync(join(ctx.root, "package.json"), "utf8"));
      const files = trackedFiles(ctx.root);
      const denoTests = files.filter((f) => f.startsWith("supabase/functions/") && /(_test|\.test)\.ts$/.test(f));
      const denoCount = denoTests.reduce((n, f) => n + (readFileSync(join(ctx.root, f), "utf8").match(/\bDeno\.test\(/g) ?? []).length, 0);
      const sqlTests = files.filter((f) => /^supabase\/tests\/.+\.sql$/.test(f) && !f.endsWith("supabase_stubs.sql"));
      const out = {
        ci_suites: [...ci.matchAll(/npm run (test:[\w-]+|eval:live)/g)].map((m) => m[1]),
        npm_test_scripts: Object.keys(pkg.scripts).filter((s) => s.startsWith("test:")),
        deno: { files: denoTests.length, declared_tests: denoCount },
        database: { files: sqlTests.length },
      };
      if (ctx.args.runTests) out.results = runSuites(ctx, out.ci_suites);
      return out;
    },
  },
  {
    id: "repo.ci_config", needs: [], shows: "the CI jobs, and that the security job, secret scan and dependency audit are wired in",
    run: async (ctx) => {
      const ci = readFileSync(join(ctx.root, ".github/workflows/ci.yml"), "utf8");
      const jobs = [...ci.slice(ci.indexOf("\njobs:")).matchAll(/^ {2}([\w-]+):\s*$/gm)].map((m) => m[1]);
      const pin = ci.match(/gitleaks\/v8@(v[\d.]+)/);
      const workflows = readdirSync(join(ctx.root, ".github/workflows")).filter((f) => /\.ya?ml$/.test(f));
      return { workflows, ci_jobs: jobs, security_job: jobs.includes("security"), gitleaks_version: pin ? pin[1] : null,
               npm_audit_high: /npm audit[^\n]*--audit-level=high/.test(ci), dependabot_check: ci.includes("check-dependabot.mjs"),
               triggers: (ci.match(/^on:\n((?: {2}.+\n)+)/m)?.[1] ?? "").split("\n").map((s) => s.trim().replace(/:.*$/, "")).filter(Boolean) };
    },
  },
  {
    id: "repo.dependabot", needs: [], shows: "that .github/dependabot.yml watches every package-lock.json, Dockerfile and the workflows, weekly",
    run: async (ctx) => {
      const r = checkDependabot(readFileSync(join(ctx.root, ".github/dependabot.yml"), "utf8"), trackedFiles(ctx.root));
      if (!r.ok) throw Object.assign(new Error(r.problems.join("; ")), { data: r });
      return r;
    },
  },
  {
    id: "repo.secret_scan", needs: [], shows: "the secret-scan config: its exceptions and their reasons",
    run: async (ctx) => {
      const t = readFileSync(join(ctx.root, ".github/gitleaks.toml"), "utf8");
      return { config: ".github/gitleaks.toml", uses_default_rules: /useDefault\s*=\s*true/.test(t),
               allowlists: [...t.matchAll(/description\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
               path_exceptions: (t.match(/^\s*'''[^']*'''\s*,?\s*$/gm) ?? []).length };
    },
  },
  {
    id: "repo.policies", needs: [], shows: "each policy's owner, review cadence and next review date, and which are overdue",
    run: async (ctx) => {
      const dir = join(ctx.root, "docs/soc2/policies");
      return readdirSync(dir).filter((f) => f.endsWith(".md")).sort()
        .map((f) => ({ file: `docs/soc2/policies/${f}`, ...policyMeta(readFileSync(join(dir, f), "utf8"), ctx.today) }));
    },
  },
  {
    id: "repo.controls", needs: [], shows: "the control matrix by status (in place, partial, gap)",
    run: async (ctx) => controlCounts(readFileSync(join(ctx.root, "docs/soc2/CONTROLS.md"), "utf8")),
  },
  {
    id: "repo.security_txt", needs: [], shows: "the published security contact and when it expires",
    run: async (ctx) => {
      const t = readFileSync(join(ctx.root, "site/.well-known/security.txt"), "utf8");
      const exp = (t.match(/^Expires:\s*(\S+)/m) ?? [])[1] ?? null;
      return { contact: (t.match(/^Contact:\s*(\S+)/m) ?? [])[1] ?? null, expires: exp,
               days_left: exp ? Math.floor((Date.parse(exp) - ctx.now) / DAY) : null };
    },
  },
  {
    id: "repo.codeowners", needs: [], shows: "who must review each part of the code",
    run: async (ctx) => {
      const p = join(ctx.root, ".github/CODEOWNERS");
      if (!existsSync(p)) throw new Error(".github/CODEOWNERS is missing");
      const rules = readFileSync(p, "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => l.trim().split(/\s+/));
      return { rules: rules.length, owners: [...new Set(rules.flatMap((r) => r.slice(1)))] };
    },
  },
  {
    id: "repo.npm_audit", needs: [], network: "registry.npmjs.org (npm audit)", shows: "npm audit of production dependencies, by severity",
    run: async (ctx) => {
      const dirs = trackedFiles(ctx.root).filter((f) => f.endsWith("package-lock.json")).map((f) => dirname(f));
      return dirs.map((d) => {
        const r = spawnSync("npm", ["audit", "--omit=dev", "--json", "--package-lock-only"], { cwd: join(ctx.root, d), encoding: "utf8", maxBuffer: 64 << 20 });
        let v = {};
        try { v = JSON.parse(r.stdout).metadata?.vulnerabilities ?? {}; } catch { return { dir: d, error: (r.stderr || "npm audit failed").slice(0, 200) }; }
        return { dir: d, critical: v.critical ?? 0, high: v.high ?? 0, moderate: v.moderate ?? 0, low: v.low ?? 0 };
      });
    },
  },

  /* ---------------- GitHub ---------------- */
  {
    id: "github.repo", needs: ["github"], calls: (c) => [`GET /repos/${c.repo}`], shows: "visibility, default branch, and the security settings GitHub reports",
    run: async (ctx) => {
      const r = await gh(ctx, `/repos/${ctx.repo}`);
      if (!r.ok) throw failed(r);
      const j = r.json;
      return { private: j.private, visibility: j.visibility, default_branch: j.default_branch, owner_type: j.owner?.type,
               security_and_analysis: j.security_and_analysis ?? null, delete_branch_on_merge: j.delete_branch_on_merge ?? null };
    },
  },
  {
    id: "github.branch_protection", needs: ["github"],
    calls: (c) => [`GET /repos/${c.repo}/branches/${c.branch}/protection`, `GET /repos/${c.repo}/rulesets`],
    shows: "branch protection on the protected branch, compared with .github/branch-protection.json",
    run: async (ctx) => {
      const expected = JSON.parse(readFileSync(join(ctx.root, ".github/branch-protection.json"), "utf8"));
      const r = await gh(ctx, `/repos/${ctx.repo}/branches/${ctx.branch}/protection`);
      const rs = await gh(ctx, `/repos/${ctx.repo}/rulesets`);
      const rulesets = rs.ok ? (rs.json ?? []).map((x) => ({ name: x.name, enforcement: x.enforcement, target: x.target })) : { status: rs.status, message: rs.json?.message ?? null };
      const planBlocks = (x) => x.status === 403 && /upgrade|github pro|plan/i.test(x.json?.message ?? "");
      if (r.status === 404) return { protected: false, reason: r.json?.message ?? "not protected", rulesets };
      if (planBlocks(r)) return { protected: false, reason: r.json.message, rulesets };
      if (!r.ok && planBlocks(rs)) return { protected: false, reason: rs.json.message, rulesets };
      if (!r.ok) throw failed(r);
      return { protected: true, mismatches: compareProtection(expected, r.json), rulesets,
               live: { checks: (r.json.required_status_checks?.checks ?? []).map((c) => c.context), reviews: r.json.required_pull_request_reviews?.required_approving_review_count ?? 0,
                       enforce_admins: !!r.json.enforce_admins?.enabled, force_pushes: !!r.json.allow_force_pushes?.enabled } };
    },
  },
  {
    id: "github.ci_runs", needs: ["github"], calls: (c) => [`GET /repos/${c.repo}/actions/workflows/<each workflow>/runs?created=>=${c.sinceDate}`],
    shows: "every workflow run in the window: outcomes, on pushes to the protected branch, and each failure",
    run: async (ctx) => {
      const out = {};
      for (const wf of readdirSync(join(ctx.root, ".github/workflows")).filter((f) => /\.ya?ml$/.test(f))) {
        const r = await ghAll(ctx, `/repos/${ctx.repo}/actions/workflows/${wf}/runs?created=%3E%3D${ctx.sinceDate}`, "workflow_runs", 10);
        out[wf] = r.error ? { error: `HTTP ${r.error.status}` } : { ...summarizeRuns(r.items, ctx.branch), ...(r.truncated ? { truncated: r.truncated } : {}) };
      }
      return out;
    },
  },
  {
    id: "github.deploy_runs", needs: ["github"], calls: (c) => [`GET /repos/${c.repo}/actions/workflows/deploy-functions.yml/runs?per_page=10`, "GET .../runs/<id>/jobs for each"],
    shows: "whether the last 10 function deploy runs actually deployed, or passed after skipping the deploy",
    run: async (ctx) => {
      const r = await gh(ctx, `/repos/${ctx.repo}/actions/workflows/deploy-functions.yml/runs?per_page=10`);
      if (!r.ok) throw failed(r);
      const runs = [];
      for (const run of r.json.workflow_runs ?? []) {
        const j = await gh(ctx, `/repos/${ctx.repo}/actions/runs/${run.id}/jobs`);
        const step = (j.json?.jobs ?? []).flatMap((x) => x.steps ?? []).find((s) => s.name === "Deploy");
        runs.push({ id: run.id, at: run.created_at, conclusion: run.conclusion, deploy_step: step?.conclusion ?? "missing" });
      }
      return { checked: runs.length, deployed: runs.filter((x) => x.deploy_step === "success").length,
               skipped: runs.filter((x) => x.conclusion === "success" && x.deploy_step === "skipped").length, runs };
    },
  },
  {
    id: "github.pull_requests", needs: ["github"], calls: (c) => [`GET /repos/${c.repo}/pulls?state=all`, "GET .../pulls/<n>/reviews for merged ones in the window"],
    shows: "dependency update pull requests (open, merged, how old) and whether merged pull requests had an approval",
    run: async (ctx) => {
      const r = await ghAll(ctx, `/repos/${ctx.repo}/pulls?state=all&sort=created&direction=desc`, null, 3);
      if (r.error) throw failed(r.error);
      const isBot = (p) => p.user?.login === "dependabot[bot]";
      const age = (p) => Math.floor((ctx.now - Date.parse(p.created_at)) / DAY);
      const bots = r.items.filter(isBot), people = r.items.filter((p) => !isBot(p));
      const merged = people.filter((p) => p.merged_at && p.merged_at >= ctx.sinceISO).slice(0, 50);
      let approved = 0;
      for (const p of merged) {
        const rv = await gh(ctx, `/repos/${ctx.repo}/pulls/${p.number}/reviews`);
        if ((rv.json ?? []).some((x) => x.state === "APPROVED" && x.user?.login !== p.user?.login)) approved++;
      }
      return {
        dependabot: { open: bots.filter((p) => p.state === "open").length, merged: bots.filter((p) => p.merged_at).length,
                      closed_unmerged: bots.filter((p) => p.state === "closed" && !p.merged_at).length,
                      open_over_14_days: bots.filter((p) => p.state === "open" && age(p) > 14).length,
                      oldest_open_days: Math.max(0, ...bots.filter((p) => p.state === "open").map(age)),
                      open_titles: bots.filter((p) => p.state === "open").map((p) => `#${p.number} ${p.title}`) },
        people: { merged_in_window: merged.length, approved_by_someone_else: approved, open: people.filter((p) => p.state === "open").length },
      };
    },
  },
  {
    id: "github.dependabot_alerts", needs: ["github"], calls: (c) => [`GET /repos/${c.repo}/dependabot/alerts?state=open`],
    shows: "open vulnerability alerts by severity, or that alerts are switched off",
    run: async (ctx) => {
      const r = await ghAll(ctx, `/repos/${ctx.repo}/dependabot/alerts?state=open`, null, 3);
      if (r.error) {
        if ([403, 404].includes(r.error.status)) throw Object.assign(failed(r.error), { unavailable: true });
        throw failed(r.error);
      }
      const by = r.items.reduce((o, a) => ((o[a.security_advisory?.severity ?? "unknown"] = (o[a.security_advisory?.severity ?? "unknown"] ?? 0) + 1), o), {});
      return { open: r.items.length, by_severity: by };
    },
  },
  {
    id: "github.secret_scanning", needs: ["github"], calls: (c) => [`GET /repos/${c.repo}/secret-scanning/alerts?state=open`],
    shows: "GitHub's own secret-scanning alerts, where the plan has them (the gitleaks job in CI covers the repo either way)",
    run: async (ctx) => {
      const r = await ghAll(ctx, `/repos/${ctx.repo}/secret-scanning/alerts?state=open`, null, 3);
      if (r.error) {
        if ([403, 404].includes(r.error.status)) throw Object.assign(failed(r.error), { unavailable: true });
        throw failed(r.error);
      }
      return { open: r.items.length, types: [...new Set(r.items.map((a) => a.secret_type_display_name ?? a.secret_type))] };
    },
  },
  {
    id: "github.collaborators", needs: ["github"], calls: (c) => [`GET /repos/${c.repo}/collaborators`],
    shows: "who can push to the repo and with which role, for the quarterly access review",
    run: async (ctx) => {
      const r = await ghAll(ctx, `/repos/${ctx.repo}/collaborators`, null, 2);
      if (r.error) throw failed(r.error);
      return r.items.map((u) => ({ login: u.login, role: u.role_name ?? null, admin: !!u.permissions?.admin }));
    },
  },

  /* ---------------- Supabase, management API ---------------- */
  {
    id: "supabase.migrations", needs: ["supabase"], calls: (c) => [`GET /v1/projects/${c.ref}/database/migrations`],
    shows: "the live migration history against the files: applied, applied under another version, pending, live only",
    run: async (ctx) => {
      let live;
      const r = await sbm(ctx, `/v1/projects/${ctx.ref}/database/migrations`);
      if (r.ok) live = (Array.isArray(r.json) ? r.json : r.json?.migrations ?? []).map((m) => ({ version: String(m.version), name: m.name ?? "" }));
      else live = (await sql(ctx, "select version, name from supabase_migrations.schema_migrations order by version")).map((m) => ({ version: String(m.version), name: m.name ?? "" }));
      return { compare: compareMigrations(localMigrations(ctx.root), live) };
    },
  },
  {
    id: "supabase.functions", needs: ["supabase"], calls: (c) => [`GET /v1/projects/${c.ref}/functions`],
    shows: "deployed functions against the repo: never deployed, older than their code, JWT setting",
    run: async (ctx) => {
      const r = await sbm(ctx, `/v1/projects/${ctx.ref}/functions`);
      if (!r.ok) throw failed(r);
      const live = (r.json ?? []).map((f) => ({ slug: f.slug, version: f.version, status: f.status, updated_at: f.updated_at, verify_jwt: f.verify_jwt }));
      return { deployed: live.map((f) => ({ ...f, updated_at: new Date(typeof f.updated_at === "number" ? f.updated_at : Date.parse(f.updated_at)).toISOString() })),
               compare: compareFunctions(localFunctions(ctx), live) };
    },
  },
  {
    id: "supabase.secrets", needs: ["supabase"], calls: (c) => [`GET /v1/projects/${c.ref}/secrets`],
    shows: "the names of the server function secrets (names only; values are dropped as they arrive)",
    run: async (ctx) => {
      const r = await sbm(ctx, `/v1/projects/${ctx.ref}/secrets`);
      if (!r.ok) throw failed(r);
      const names = (r.json ?? []).map((s) => s.name).filter(Boolean).sort();
      return { count: names.length, names };
    },
  },
  {
    id: "supabase.backups", needs: ["supabase"], calls: (c) => [`GET /v1/projects/${c.ref}/database/backups`],
    shows: "whether backups and point-in-time recovery exist, and the latest backup",
    run: async (ctx) => {
      const r = await sbm(ctx, `/v1/projects/${ctx.ref}/database/backups`);
      if (!r.ok) throw failed(r);
      const list = r.json?.backups ?? [];
      const latest = list.map((b) => b.inserted_at).filter(Boolean).sort().at(-1) ?? null;
      return { pitr_enabled: !!r.json?.pitr_enabled, walg_enabled: r.json?.walg_enabled ?? null, region: r.json?.region ?? null,
               backups: list.length, completed: list.filter((b) => b.status === "COMPLETED").length, latest };
    },
  },
  {
    id: "supabase.auth_settings", needs: ["supabase"], calls: (c) => [`GET /v1/projects/${c.ref}/config/auth`],
    shows: "sign-in settings: two-step options, password rules, sessions, providers on (no secret settings are kept)",
    run: async (ctx) => {
      const r = await sbm(ctx, `/v1/projects/${ctx.ref}/config/auth`);
      if (!r.ok) throw failed(r);
      return pickAuthSettings(r.json);
    },
  },
  {
    id: "supabase.network", needs: ["supabase"], calls: (c) => [`GET /v1/projects/${c.ref}/ssl-enforcement`, `GET /v1/projects/${c.ref}/network-restrictions`],
    shows: "whether direct database connections must use TLS, and which addresses may connect",
    run: async (ctx) => {
      const ssl = await sbm(ctx, `/v1/projects/${ctx.ref}/ssl-enforcement`);
      const net = await sbm(ctx, `/v1/projects/${ctx.ref}/network-restrictions`);
      return { ssl_enforced: ssl.ok ? !!ssl.json?.currentConfig?.database : { status: ssl.status },
               network_restrictions: net.ok ? { status: net.json?.status ?? null, allowed: net.json?.config?.dbAllowedCidrs ?? null } : { status: net.status } };
    },
  },
  {
    id: "supabase.database", needs: ["supabase"], calls: (c) => [`POST /v1/projects/${c.ref}/database/query (read only): row-level security per table, scheduled jobs, audit-log triggers, anon grants`],
    shows: "row-level security on every public table, the scheduled jobs (the daily purge among them), the audit-log triggers, what the anon role can touch",
    run: async (ctx) => {
      const out = {};
      const tables = await sql(ctx, `select c.relname as table, c.relrowsecurity as rls,
          (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
          from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`);
      out.tables = tables.length;
      out.tables_without_rls = tables.filter((t) => !t.rls).map((t) => t.table);
      out.tables_with_rls_no_policies = tables.filter((t) => t.rls && !t.policies).map((t) => t.table);
      try { out.cron_jobs = await sql(ctx, "select jobname, schedule, active from cron.job order by jobname"); } catch (e) { out.cron_jobs = { error: e.message }; }
      try { out.audit_log_triggers = (await sql(ctx, "select tgname from pg_trigger where tgrelid = 'public.audit_log'::regclass and not tgisinternal order by 1")).map((t) => t.tgname); } catch (e) { out.audit_log_triggers = { error: e.message }; }
      try { out.anon_table_grants = (await sql(ctx, "select table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' group by 1 order by 1")); } catch (e) { out.anon_table_grants = { error: e.message }; }
      return out;
    },
  },

  /* ---------------- Supabase, service role (counts and staff only; no customer content) ---------------- */
  {
    id: "supabase.staff", needs: ["serviceRole"], calls: (c) => [`GET ${c.supabaseUrl}/rest/v1/staff_emails`, `GET ${c.supabaseUrl}/auth/v1/admin/users (all pages)`],
    shows: "each Placetta staff account (email and name) with its two-step status and last sign-in; customer accounts only as totals",
    run: async (ctx) => {
      const s = await rest(ctx, "/rest/v1/staff_emails?select=email,added_at&order=email");
      if (!s.ok) throw failed(s);
      const users = [];
      for (let page = 1; page <= 50; page++) {
        const r = await rest(ctx, `/auth/v1/admin/users?page=${page}&per_page=1000`);
        if (!r.ok) throw failed(r);
        const batch = r.json?.users ?? [];
        users.push(...batch);
        if (batch.length < 1000) break;
      }
      return staffMfa(s.json ?? [], users);
    },
  },
  {
    id: "supabase.audit_log", needs: ["serviceRole"], calls: (c) => [`GET ${c.supabaseUrl}/rest/v1/audit_log?select=id with count=exact and one row (all time, the window, the last 7 days, each actor)`],
    shows: "how many audit entries were written, by whom (you, agent, team, agency), and the latest; never their content",
    run: async (ctx) => {
      const count = async (q) => {
        const r = await rest(ctx, `/rest/v1/audit_log?select=id${q}`, { Prefer: "count=exact", Range: "0-0" });
        if (!r.ok && r.status !== 416) throw failed(r);
        return countFromRange(r.headers.get("content-range"));
      };
      const since = `&created_at=gte.${encodeURIComponent(ctx.sinceISO)}`;
      const week = `&created_at=gte.${encodeURIComponent(new Date(ctx.now - 7 * DAY).toISOString())}`;
      const by_actor = {};
      for (const a of ["you", "agent", "team", "agency"]) by_actor[a] = await count(`${since}&actor=eq.${a}`);
      const last = await rest(ctx, "/rest/v1/audit_log?select=created_at&order=created_at.desc&limit=1");
      return { all_time: await count(""), in_window: await count(since), last_7_days: await count(week), by_actor_in_window: by_actor,
               latest_at: last.json?.[0]?.created_at ?? null };
    },
  },
  {
    id: "supabase.incidents", needs: ["serviceRole"], calls: (c) => [`GET ${c.supabaseUrl}/rest/v1/incidents?select=happened_at,public,fix`],
    shows: "the incident log: how many, in the window, without a fix, shown on the trust page (no titles)",
    run: async (ctx) => {
      const r = await rest(ctx, "/rest/v1/incidents?select=happened_at,public,fix&order=happened_at.desc");
      if (r.status === 404 || /does not exist|schema cache/i.test(r.json?.message ?? "")) throw Object.assign(new Error("the incidents table isn't in the live database yet"), { unavailable: true });
      if (!r.ok) throw failed(r);
      const rows = r.json ?? [];
      return { total: rows.length, in_window: rows.filter((x) => x.happened_at >= ctx.sinceISO).length,
               open: rows.filter((x) => !x.fix).length, public: rows.filter((x) => x.public).length, latest_at: rows[0]?.happened_at ?? null };
    },
  },
];

function runSuites(ctx, suites) {
  const out = [];
  const parse = (s) => {
    const a = s.match(/(\d+) passed, (\d+) failed/), b = s.match(/(\d+) checks passed/), c = s.match(/ok \| (\d+) passed \| (\d+) failed/);
    if (a) return { passed: +a[1], failed: +a[2] };
    if (c) return { passed: +c[1], failed: +c[2] };
    if (b) return { passed: +b[1], failed: 0 };
    return /all passed/.test(s) ? { passed: "all", failed: 0 } : {};
  };
  const run = (name, cmd, args, env = {}) => {
    const t = Date.now();
    const r = spawnSync(cmd, args, { cwd: ctx.root, encoding: "utf8", maxBuffer: 256 << 20, env: { ...process.env, ...env } });
    const text = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    out.push({ suite: name, exit: r.status, seconds: Math.round((Date.now() - t) / 1000), ...parse(text) });
  };
  for (const s of suites.filter((x) => x.startsWith("test:"))) run(s, "npm", ["run", "--silent", s]);
  if (spawnSync("deno", ["--version"]).status === 0) run("deno test supabase/functions", "deno", ["test", "-A", "supabase/functions"]);
  if (process.env.PGHOST) run("scripts/test-db.sh", "bash", ["scripts/test-db.sh"]);
  return out;
}

/* ================================ the run ================================ */

function context(args, env = process.env, now = Date.now()) {
  let repo = args.repo;
  if (!repo) {
    try {
      const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      repo = (url.match(/github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/) ?? [])[1];
    } catch { /* no remote */ }
  }
  const cfg = existsSync(join(ROOT, "supabase/config.toml")) ? readFileSync(join(ROOT, "supabase/config.toml"), "utf8") : "";
  const ref = args.ref ?? (cfg.match(/^project_id\s*=\s*"([^"]+)"/m) ?? [])[1];
  const since = new Date(now - args.since * DAY);
  return {
    root: ROOT, args, now, today: new Date(now).toISOString().slice(0, 10), sinceISO: since.toISOString(), sinceDate: since.toISOString().slice(0, 10),
    repo: repo ?? "notlsz/placetta", branch: args.branch ?? "main", ref,
    supabaseUrl: (env.SUPABASE_URL ?? `https://${ref}.supabase.co`).replace(/\/$/, ""),
    tokens: { github: env.GITHUB_TOKEN || env.GH_TOKEN || null, supabase: env.SUPABASE_ACCESS_TOKEN || null, serviceRole: env.SUPABASE_SERVICE_ROLE_KEY || null },
    fetch: globalThis.fetch,
  };
}

const TOKEN_ENV = { github: "GITHUB_TOKEN", supabase: "SUPABASE_ACCESS_TOKEN", serviceRole: "SUPABASE_SERVICE_ROLE_KEY" };

export async function collect(ctx, sources = SOURCES) {
  const ev = { generated_at: new Date(ctx.now).toISOString(), window_days: ctx.args.since, since: ctx.sinceISO, repo: ctx.repo,
               branch: ctx.branch, supabase_project: ctx.ref, tool: "scripts/soc2-evidence.mjs", sources: {} };
  for (const s of sources) {
    const missing = s.needs.filter((n) => !ctx.tokens[n]);
    if (missing.length) { ev.sources[s.id] = { status: "skipped", reason: `${missing.map((m) => TOKEN_ENV[m]).join(", ")} not set`, shows: s.shows }; continue; }
    try {
      ev.sources[s.id] = { status: "ok", shows: s.shows, data: await s.run(ctx) };
    } catch (e) {
      ev.sources[s.id] = { status: e.unavailable ? "unavailable" : "error", reason: e.message, shows: s.shows, ...(e.data ? { data: e.data } : {}) };
    }
  }
  ev.attention = attention(ev);
  return ev;
}

export function summaryMarkdown(ev) {
  const d = (id) => ev.sources[id]?.data, L = [];
  const why = (s) => (s?.reason ? `, ${String(s.reason).replace(/[.\s]+$/, "")}` : "");
  const st = (id) => ev.sources[id]?.status ?? "missing";
  L.push(`# Placetta SOC 2 evidence, ${ev.generated_at.slice(0, 10)}`, "");
  L.push(`Window: the ${ev.window_days} days since ${ev.since.slice(0, 10)}. Repository ${ev.repo}, branch ${ev.branch}. Supabase project ${ev.supabase_project}.`);
  L.push(`Generated by ${ev.tool} at ${ev.generated_at}. The full data is in evidence.json; SHA256SUMS fingerprints both files.`, "");
  L.push("## Needs attention", "");
  if (ev.attention.length) for (const a of ev.attention) L.push(`- ${a}`); else L.push("Nothing flagged.");
  L.push("", "## Sources", "", "| Source | Status | What it shows |", "| --- | --- | --- |");
  for (const [id, s] of Object.entries(ev.sources)) L.push(`| ${id} | ${s.status}${s.reason ? `: ${String(s.reason).replace(/\|/g, "/")}` : ""} | ${s.shows ?? ""} |`);

  L.push("", "## Change management", "");
  const g = d("repo.git_main");
  if (g) L.push(`${g.commits} commits on ${ev.branch} (first parent) in the window: ${g.via_pull_request} through a pull request, ${g.merges_without_pr} merges of a branch without one, ${g.direct} not through a pull request in all. Authors: ${Object.entries(g.authors).map(([a, n]) => `${a} ${n}`).join(", ") || "none"}.`);
  const bp = d("github.branch_protection");
  if (bp) L.push(bp.protected ? `Branch protection is on.${bp.mismatches.length ? ` Differences from the policy: ${bp.mismatches.join("; ")}.` : " It matches .github/branch-protection.json."}` : `Branch protection is off: ${bp.reason}.`);
  const ci = d("github.ci_runs");
  if (ci) for (const [wf, s] of Object.entries(ci)) L.push(s.error ? `${wf}: ${s.error}.` : `${wf}: ${s.total} runs (${Object.entries(s.by_conclusion).map(([k, v]) => `${v} ${k}`).join(", ")}); on pushes to ${ev.branch} ${s.on_branch.success} of ${s.on_branch.total} passed.`);
  const dep = d("github.deploy_runs");
  if (dep) L.push(`Function deploys: of the last ${dep.checked} runs, ${dep.deployed} deployed and ${dep.skipped} passed without deploying.`);
  const prs = d("github.pull_requests");
  if (prs) L.push(`Pull requests from people merged in the window: ${prs.people.merged_in_window}, approved by someone other than the author: ${prs.people.approved_by_someone_else}.`);

  L.push("", "## Dependencies and secrets", "");
  if (prs) L.push(`Dependabot pull requests: ${prs.dependabot.open} open (oldest ${prs.dependabot.oldest_open_days} days, ${prs.dependabot.open_over_14_days} over 14 days), ${prs.dependabot.merged} merged, ${prs.dependabot.closed_unmerged} closed without merging.`);
  const dc = d("repo.dependabot");
  if (dc) L.push(`Dependabot config: ${dc.entries} entries covering ${dc.required.length} manifests${dc.ok ? "" : `; problems: ${dc.problems.join("; ")}`}.`);
  const da = ev.sources["github.dependabot_alerts"];
  if (da) L.push(`Dependabot alerts: ${da.status === "ok" ? `${da.data.open} open (${Object.entries(da.data.by_severity).map(([k, v]) => `${v} ${k}`).join(", ") || "none"})` : `${da.status}${why(da)}`}.`);
  const na = d("repo.npm_audit");
  if (na) L.push(`npm audit, production dependencies: ${na.map((a) => (a.error ? `${a.dir === "." ? "app" : a.dir}: ${a.error}` : `${a.dir === "." ? "app" : a.dir} ${a.critical} critical, ${a.high} high, ${a.moderate} moderate, ${a.low} low`)).join("; ")}.`);
  const ss = d("repo.secret_scan"), cc = d("repo.ci_config");
  if (cc) L.push(`CI jobs: ${cc.ci_jobs.join(", ")}. Secret scan: gitleaks ${cc.gitleaks_version ?? "not pinned"}${ss ? ` with ${ss.allowlists.length} documented exceptions (${ss.allowlists.join("; ")})` : ""}.`);
  const gs = ev.sources["github.secret_scanning"];
  if (gs) L.push(`GitHub secret scanning: ${gs.status === "ok" ? `${gs.data.open} open alerts` : `${gs.status}${why(gs)}`}.`);

  L.push("", "## Database and server functions", "");
  const mg = d("supabase.migrations")?.compare;
  if (mg) L.push(`Migrations: ${mg.local} files, ${mg.live} live entries. Applied: ${mg.applied.length}; applied under another version: ${mg.applied_under_other_version.length}; not applied: ${mg.pending.length}${mg.pending.length ? ` (${mg.pending.join(", ")})` : ""}; live with no file: ${mg.live_only.length}${mg.live_only.length ? ` (${mg.live_only.join(", ")})` : ""}.`);
  const fn = d("supabase.functions");
  if (fn) L.push(`Functions: ${fn.deployed.length} deployed. Never deployed: ${fn.compare.not_deployed.join(", ") || "none"}. Older than their code: ${fn.compare.older_than_code.map((x) => x.slug).join(", ") || "none"}.`);
  const sc = d("supabase.secrets");
  if (sc) L.push(`Function secrets set: ${sc.count} (${sc.names.join(", ")}).`);
  const bk = d("supabase.backups");
  if (bk) L.push(`Backups: ${bk.backups} (${bk.completed} completed, latest ${bk.latest ?? "none"}); point-in-time recovery ${bk.pitr_enabled ? "on" : "off"}.`);
  const db = d("supabase.database");
  if (db) L.push(`Row-level security: ${db.tables} public tables, ${db.tables_without_rls.length} without it${db.tables_without_rls.length ? ` (${db.tables_without_rls.join(", ")})` : ""}. Audit-log triggers: ${Array.isArray(db.audit_log_triggers) ? db.audit_log_triggers.join(", ") || "none" : db.audit_log_triggers?.error}. Scheduled jobs: ${Array.isArray(db.cron_jobs) ? db.cron_jobs.map((j) => `${j.jobname} (${j.schedule}${j.active ? "" : ", paused"})`).join(", ") : db.cron_jobs?.error}.`);
  const nw = d("supabase.network");
  if (nw) L.push(`Direct database connections: TLS ${nw.ssl_enforced === true ? "required" : nw.ssl_enforced === false ? "not required" : "unknown"}; network restrictions ${JSON.stringify(nw.network_restrictions)}.`);
  const au = d("supabase.auth_settings");
  if (au) L.push(`Sign-in settings: ${Object.entries(au).filter(([k]) => /^mfa_|password_min_length|sessions_/.test(k)).map(([k, v]) => `${k}=${v}`).join(", ") || "none reported"}.`);

  L.push("", "## Access", "");
  const sf = d("supabase.staff");
  if (sf) {
    L.push("| Staff email | Name | Two-step | Last sign-in |", "| --- | --- | --- | --- |");
    for (const s of sf.staff) L.push(`| ${s.email} | ${s.name ?? ""} | ${s.mfa ? "on" : "off"} | ${s.signed_up ? s.last_sign_in_at ?? "never" : "not signed up"} |`);
    L.push("", `All accounts: ${sf.all_users.total}, with two-step on: ${sf.all_users.with_mfa}.`);
  }
  const co = d("github.collaborators");
  if (co) L.push(`GitHub collaborators: ${co.map((c) => `${c.login} (${c.role ?? (c.admin ? "admin" : "write")})`).join(", ")}.`);

  L.push("", "## Logging and incidents", "");
  const al = d("supabase.audit_log");
  if (al) L.push(`Audit log: ${al.all_time} entries in all, ${al.in_window} in the window (${Object.entries(al.by_actor_in_window).map(([k, v]) => `${k} ${v}`).join(", ")}), ${al.last_7_days} in the last 7 days; latest ${al.latest_at ?? "none"}.`);
  const ic = ev.sources["supabase.incidents"];
  if (ic) L.push(ic.status === "ok" ? `Incident log: ${ic.data.total} entries, ${ic.data.in_window} in the window, ${ic.data.open} without a fix, ${ic.data.public} on the trust page.` : `Incident log: ${ic.status}${why(ic)}.`);

  L.push("", "## Tests", "");
  const t = d("repo.tests");
  if (t) {
    L.push(`CI runs ${t.ci_suites.join(", ")}, the server function tests (${t.deno.files} files, ${t.deno.declared_tests} tests declared) and ${t.database.files} database test files.`);
    if (t.results) for (const r of t.results) L.push(`- ${r.suite}: exit ${r.exit}, ${r.passed ?? "?"} passed, ${r.failed ?? "?"} failed, ${r.seconds}s`);
  }

  L.push("", "## Policies and controls", "");
  const pc = d("repo.controls");
  if (pc) L.push(`Control matrix: ${pc.counts["in place"]} in place, ${pc.counts.partial} partial, ${pc.counts.gap} gaps.`);
  const po = d("repo.policies");
  if (po) L.push(`Policies: ${po.length}, overdue for review: ${po.filter((p) => p.overdue).length}.`);
  const sx = d("repo.security_txt");
  if (sx) L.push(`security.txt: ${sx.contact}, expires ${sx.expires} (${sx.days_left} days).`);
  return L.join("\n") + "\n";
}

export function insideRepo(p, root = ROOT) {
  const rel = relative(root, resolve(p));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function dryRun(ctx) {
  ctx.args = { ...ctx.args, runTests: false };
  const say = (s = "") => console.log(s);
  say(`Placetta SOC 2 evidence: dry run, ${ctx.today}. Nothing is written, and nothing is sent over the network.`);
  say(`Window: the ${ctx.args.since} days since ${ctx.sinceDate}. Repository ${ctx.repo}, branch ${ctx.branch}, Supabase project ${ctx.ref}.`);
  say(`A real run writes <out>/placetta-soc2-evidence-${ctx.today}/ with evidence.json, summary.md and SHA256SUMS.`);
  say();
  const groups = [["repo", "From the repo, no token needed"], ["github", "From GitHub"], ["supabase", "From Supabase"]];
  return (async () => {
    for (const [prefix, title] of groups) {
      say(`${title}:`);
      for (const s of SOURCES.filter((x) => x.id.startsWith(prefix + "."))) {
        const toks = s.needs.map((n) => `${TOKEN_ENV[n]} ${ctx.tokens[n] ? "is set" : "is not set"}`).join(", ");
        say(`  ${s.id}`);
        say(`    shows: ${s.shows}`);
        if (s.calls) for (const c of s.calls(ctx)) say(`    would call: ${c}`);
        if (toks) say(`    needs: ${toks}`);
        if (s.network) { say(`    would call: ${s.network}`); continue; }
        if (!s.needs.length) {
          try {
            const data = await s.run(ctx);
            say(`    now: ${preview(s.id, data)}`);
          } catch (e) { say(`    now: problem: ${e.message}`); }
        }
      }
      say();
    }
    say("Tokens are read from the environment and never written; the bundle is checked for them before it's saved.");
  })();
}

function preview(id, d) {
  switch (id) {
    case "repo.git_main": return `${d.commits} commits on ${d.ref} in the window, ${d.via_pull_request} through a pull request, ${d.direct} not`;
    case "repo.migrations": return `${d.files} files, ${d.last}${d.duplicate_versions.length ? `, version used twice: ${d.duplicate_versions.join(", ")}` : ""}`;
    case "repo.functions": return `${d.length} functions, ${d.filter((f) => !f.verify_jwt).length} with JWT checks off (they check their own signatures)`;
    case "repo.tests": return `CI suites ${d.ci_suites.join(", ")}; ${d.deno.declared_tests} server function tests; ${d.database.files} database test files`;
    case "repo.ci_config": return `jobs ${d.ci_jobs.join(", ")}; gitleaks ${d.gitleaks_version ?? "not pinned"}; npm audit gate ${d.npm_audit_high ? "on" : "off"}`;
    case "repo.dependabot": return `${d.entries} entries cover ${d.required.length} manifests`;
    case "repo.secret_scan": return `${d.allowlists.length} documented exceptions: ${d.allowlists.join("; ")}`;
    case "repo.policies": return `${d.length} policies, ${d.filter((p) => p.overdue).length} overdue`;
    case "repo.controls": return `${d.counts["in place"]} in place, ${d.counts.partial} partial, ${d.counts.gap} gaps`;
    case "repo.security_txt": return `expires ${d.expires} (${d.days_left} days)`;
    case "repo.codeowners": return `${d.rules} rules, owners ${d.owners.join(", ")}`;
    default: return JSON.stringify(d).slice(0, 160);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\s?/, ""));
    return;
  }
  const ctx = context(args);
  if (!ctx.ref) throw new Error("No Supabase project: pass --project-ref.");
  if (args.dryRun) return dryRun(ctx);
  if (!args.out) throw new Error("Say where the bundle goes: --out <folder> (outside the repo), or --dry-run to see what it collects.");
  const outRoot = resolve(args.out.replace(/^~(?=\/|$)/, homedir()));
  if (insideRepo(outRoot) && !args.allowInsideRepo) throw new Error(`${outRoot} is inside the repo. The bundle holds staff emails and must not be committed: pick a folder outside it.`);
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) console.error("note: HTTPS_PROXY is set; Node's fetch ignores it unless NODE_USE_ENV_PROXY=1.");

  const ev = await collect(ctx);
  let dir = join(outRoot, `placetta-soc2-evidence-${ctx.today}`);
  if (existsSync(dir)) dir += `-${new Date(ctx.now).toISOString().slice(11, 19).replace(/:/g, "")}`;
  mkdirSync(dir, { recursive: true });
  const secrets = Object.values(ctx.tokens).filter(Boolean);
  const json = redact(JSON.stringify(ev, null, 2) + "\n", secrets);
  const md = redact(summaryMarkdown(ev), secrets);
  if (json.replaced + md.replaced) console.error(`warning: removed ${json.replaced + md.replaced} token values from the bundle before saving.`);
  writeFileSync(join(dir, "evidence.json"), json.text);
  writeFileSync(join(dir, "summary.md"), md.text);
  const sum = (t) => createHash("sha256").update(t).digest("hex");
  writeFileSync(join(dir, "SHA256SUMS"), `${sum(json.text)}  evidence.json\n${sum(md.text)}  summary.md\n`);
  const counts = Object.values(ev.sources).reduce((o, s) => ((o[s.status] = (o[s.status] ?? 0) + 1), o), {});
  console.log(`Wrote ${dir}`);
  console.log(`Sources: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}. Needs attention: ${ev.attention.length}.`);
  for (const a of ev.attention) console.log(`  ${a}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

export { SOURCES, context };
