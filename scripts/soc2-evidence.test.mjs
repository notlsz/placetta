// Tests for the SOC 2 evidence collector and the Dependabot check: node --test scripts/soc2-evidence.test.mjs
// No network: every remote source runs against a fake fetch.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkDependabot, parseDependabot } from "./check-dependabot.mjs";
import {
  attention, collect, compareFunctions, compareMigrations, compareProtection, context, controlCounts, countFromRange,
  insideRepo, parseArgs, pickAuthSettings, policyMeta, redact, SOURCES, staffMfa, summarizeRuns, summaryMarkdown,
} from "./soc2-evidence.mjs";

const FILES = ["package-lock.json", "worker/filer/package-lock.json", "worker/filer/Dockerfile", ".github/workflows/ci.yml", "node_modules/x/package-lock.json"];

test("dependabot: the repo's config covers every manifest", () => {
  const r = checkDependabot(readFileSync(new URL("../.github/dependabot.yml", import.meta.url), "utf8"), FILES);
  assert.equal(r.ok, true, r.problems.join("; "));
  assert.equal(r.required.length, 4);
});

test("dependabot: a missing Dockerfile entry, a monthly schedule and a zero limit are problems", () => {
  const yml = `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: monthly }
  - package-ecosystem: "npm"
    directory: "/worker/filer"
    schedule:
      interval: weekly
    open-pull-requests-limit: 0
  - package-ecosystem: github-actions # the workflows
    directory: /
    schedule: { interval: weekly }
`;
  const cfg = parseDependabot(yml);
  assert.equal(cfg.updates[1].schedule.interval, "weekly");
  assert.equal(cfg.updates[1]["package-ecosystem"], "npm");
  const r = checkDependabot(yml, FILES);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes("no docker entry for /worker/filer")));
  assert.ok(r.problems.some((p) => p.includes("monthly")));
  assert.ok(r.problems.some((p) => p.includes("open-pull-requests-limit 0")));
});

test("redact: every token value is replaced, short values are left alone", () => {
  const r = redact('{"a":"ghp_secretvalue123","b":"x ghp_secretvalue123 y","c":"abc"}', ["ghp_secretvalue123", "abc", null]);
  assert.equal(r.replaced, 2);
  assert.ok(!r.text.includes("ghp_secretvalue123"));
  assert.ok(r.text.includes('"c":"abc"'));
});

test("args: options parse, unknown ones and bad windows are refused", () => {
  const a = parseArgs(["--out", "/tmp/x", "--since", "30", "--dry-run", "--repo", "a/b"]);
  assert.deepEqual([a.out, a.since, a.dryRun, a.repo], ["/tmp/x", 30, true, "a/b"]);
  assert.throws(() => parseArgs(["--token", "x"]), /Unknown option/);
  assert.throws(() => parseArgs(["--since", "0"]), /--since/);
});

test("the bundle can't be written inside the repo", () => {
  assert.equal(insideRepo("/repo/evidence", "/repo"), true);
  assert.equal(insideRepo("/repo", "/repo"), true);
  assert.equal(insideRepo("/elsewhere/evidence", "/repo"), false);
  assert.equal(insideRepo("/repo-evidence", "/repo"), false);
});

test("migrations: applied, applied under another version, pending, live only, duplicates", () => {
  const local = [{ version: "1", name: "a" }, { version: "2", name: "b" }, { version: "3", name: "c" }, { version: "3", name: "d" }];
  const live = [{ version: "1", name: "a" }, { version: "20", name: "b" }, { version: "99", name: "probe" }];
  const c = compareMigrations(local, live);
  assert.deepEqual(c.applied, ["1_a"]);
  assert.deepEqual(c.applied_under_other_version, [{ file: "2_b", live_versions: ["20"] }]);
  assert.deepEqual(c.pending, ["3_c", "3_d"]);
  assert.deepEqual(c.live_only, ["99 probe"]);
  assert.deepEqual(c.duplicate_local_versions, ["3"]);
});

test("functions: never deployed, older than the code, JWT setting differs", () => {
  const local = [{ slug: "a", verify_jwt: true, last_change: "2026-10-17T00:00:00Z" }, { slug: "b", verify_jwt: false, last_change: "2026-10-01T00:00:00Z" }, { slug: "c", verify_jwt: true, last_change: null }];
  const live = [{ slug: "a", updated_at: Date.parse("2026-10-16T00:00:00Z"), verify_jwt: true }, { slug: "b", updated_at: Date.parse("2026-10-02T00:00:00Z"), verify_jwt: true }, { slug: "z", updated_at: 0, verify_jwt: true }];
  const c = compareFunctions(local, live);
  assert.deepEqual(c.not_deployed, ["c"]);
  assert.deepEqual(c.deployed_not_in_repo, ["z"]);
  assert.deepEqual(c.older_than_code.map((x) => x.slug), ["a"]);
  assert.deepEqual(c.verify_jwt_mismatch, [{ slug: "b", config: false, deployed: true }]);
});

test("branch protection: the repo's file against a weaker live setting", () => {
  const expected = JSON.parse(readFileSync(new URL("../.github/branch-protection.json", import.meta.url), "utf8"));
  const live = {
    required_status_checks: { strict: false, contexts: ["app"], checks: [{ context: "functions" }] },
    required_pull_request_reviews: { required_approving_review_count: 0, require_code_owner_reviews: false, dismiss_stale_reviews: true },
    enforce_admins: { enabled: false }, allow_force_pushes: { enabled: true }, allow_deletions: { enabled: false },
    required_conversation_resolution: { enabled: true },
  };
  const m = compareProtection(expected, live);
  for (const want of ['"database"', '"security"', "up to date", "0 approvals", "code owner", "last push", "admins can bypass", "force pushes"]) {
    assert.ok(m.some((x) => x.includes(want)), `expected a difference about ${want}: ${m.join("; ")}`);
  }
  const same = { required_status_checks: { strict: true, checks: expected.required_status_checks.checks }, required_pull_request_reviews: expected.required_pull_request_reviews,
                 enforce_admins: { enabled: true }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false }, required_conversation_resolution: { enabled: true } };
  assert.deepEqual(compareProtection(expected, same), []);
});

test("staff two-step: by email, case-insensitive; customers only as totals", () => {
  const users = [
    { email: "Ops@Placetta.com", factors: [{ status: "verified" }], email_confirmed_at: "x", last_sign_in_at: "2026-10-17", user_metadata: { full_name: "Ops" } },
    { email: "help@placetta.com", factors: [{ status: "unverified" }] },
    { email: "customer@shop.test", factors: [{ status: "verified" }] },
  ];
  const r = staffMfa([{ email: "ops@placetta.com" }, { email: "help@placetta.com" }, { email: "new@placetta.com" }], users);
  assert.deepEqual(r.staff.map((s) => [s.email, s.mfa, s.signed_up]), [["ops@placetta.com", true, true], ["help@placetta.com", false, true], ["new@placetta.com", false, false]]);
  assert.equal(r.staff[0].name, "Ops");
  assert.deepEqual(r.all_users, { total: 3, with_mfa: 2 });
  assert.ok(!JSON.stringify(r).includes("customer@shop.test"));
});

test("auth settings: secrets never kept", () => {
  const s = pickAuthSettings({ mfa_totp_enroll_enabled: true, password_min_length: 10, security_captcha_secret: "s3cret", smtp_pass: "p", external_google_secret: "g",
                               external_google_enabled: true, jwt_exp: 3600, sms_twilio_auth_token: "t", hook_custom_access_token_secrets: "h", site_url: "https://app.placetta.com" });
  assert.deepEqual(Object.keys(s).sort(), ["external_google_enabled", "jwt_exp", "mfa_totp_enroll_enabled", "password_min_length", "site_url"]);
});

test("runs, ranges, policies and the control matrix parse", () => {
  const runs = [
    { id: 1, head_branch: "main", event: "push", conclusion: "success", created_at: "2026-10-16T01:00:00Z" },
    { id: 2, head_branch: "main", event: "push", conclusion: "failure", created_at: "2026-10-17T01:00:00Z", head_sha: "abcdef1234567890" },
    { id: 3, head_branch: "x", event: "pull_request", conclusion: null, created_at: "2026-10-15T01:00:00Z" },
  ];
  const s = summarizeRuns(runs, "main");
  assert.deepEqual(s.on_branch, { total: 2, success: 1, failure: 1 });
  assert.equal(s.by_conclusion.in_progress, 1);
  assert.equal(s.failures[0].sha, "abcdef123456");
  assert.equal(countFromRange("0-0/1234"), 1234);
  assert.equal(countFromRange("*/0"), 0);
  assert.equal(countFromRange(null), null);
  const p = policyMeta("# X Policy\n\n| | |\n| --- | --- |\n| Owner | Founder |\n| Next review | 2026-01-01 |\n", "2026-10-18");
  assert.deepEqual([p.title, p.owner, p.next_review, p.overdue], ["X Policy", "Founder", "2026-01-01", true]);
  const c = controlCounts(readFileSync(new URL("../docs/soc2/CONTROLS.md", import.meta.url), "utf8"));
  assert.ok(c.rows >= 38, "every criterion has at least one control");
  assert.equal(c.counts["in place"] + c.counts.partial + c.counts.gap, c.rows);
});

test("every policy has an owner, a review cadence and a next review date", () => {
  const ctx = context(parseArgs([]), {}, Date.parse("2026-10-18T12:00:00Z"));
  const src = SOURCES.find((s) => s.id === "repo.policies");
  return src.run(ctx).then((list) => {
    assert.ok(list.length >= 15);
    for (const p of list) assert.ok(p.owner && p.review && /^\d{4}-\d{2}-\d{2}$/.test(p.next_review ?? ""), `${p.file} is missing its header`);
  });
});

test("collect: tokens missing means skipped; remote sources run against a fake API and never write a token", async () => {
  const ctx = context(parseArgs(["--repo", "o/r", "--project-ref", "ref1"]), { GITHUB_TOKEN: "gh-test-token-123", SUPABASE_SERVICE_ROLE_KEY: "sr-test-key-456" }, Date.parse("2026-10-18T12:00:00Z"));
  const seen = [];
  ctx.fetch = async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization });
    const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
    if (url.includes("/branches/main/protection")) return json({ message: "Upgrade to GitHub Pro or make this repository public to enable this feature." }, 403);
    if (url.includes("/rulesets")) return json({ message: "Upgrade to GitHub Pro" }, 403);
    if (url.includes("/dependabot/alerts")) return json({ message: "Dependabot alerts are disabled for this repository." }, 403);
    if (url.includes("/rest/v1/staff_emails")) return json([{ email: "ops@placetta.com" }]);
    if (url.includes("/auth/v1/admin/users")) return json({ users: [{ email: "ops@placetta.com", factors: [] }] });
    if (url.includes("/rest/v1/audit_log")) return json([], 200, { "content-range": "0-0/7" });
    if (url.includes("/rest/v1/incidents")) return json({ message: 'relation "public.incidents" does not exist' }, 404);
    return json({ message: "Not Found" }, 404);
  };
  const pick = SOURCES.filter((s) => ["github.branch_protection", "github.dependabot_alerts", "supabase.staff", "supabase.audit_log", "supabase.incidents", "supabase.secrets", "repo.controls"].includes(s.id));
  const ev = await collect(ctx, pick);
  assert.equal(ev.sources["supabase.secrets"].status, "skipped");
  assert.match(ev.sources["supabase.secrets"].reason, /SUPABASE_ACCESS_TOKEN/);
  assert.equal(ev.sources["github.branch_protection"].data.protected, false);
  assert.equal(ev.sources["github.dependabot_alerts"].status, "unavailable");
  assert.equal(ev.sources["supabase.incidents"].status, "unavailable");
  assert.equal(ev.sources["supabase.audit_log"].data.in_window, 7);
  assert.ok(seen.every((s) => s.auth), "every remote call is authenticated");
  const flags = attention(ev).join("\n");
  assert.match(flags, /Branch protection is off/);
  assert.match(flags, /ops@placetta.com has no two-step/);
  assert.match(flags, /Dependabot alerts/);
  const md = summaryMarkdown(ev);
  assert.ok(!md.includes("gh-test-token-123") && !JSON.stringify(ev).includes("sr-test-key-456"));
  assert.match(md, /\| ops@placetta.com \|  \| off \|/);
});
