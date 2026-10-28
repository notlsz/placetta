// node --experimental-strip-types --test test/docker.test.ts (no Docker needed)
// The filer's image runs as an unprivileged user: a browser that a hostile agency page manages to break out of lands in
// an account that can't change the image, install anything or read other users' files.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const lines = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const idx = (re: RegExp) => lines.map((l, i) => (re.test(l) ? i : -1)).filter((i) => i >= 0);

test("the image ends on a non-root user, set after every build step and before the command", () => {
  const users = idx(/^USER\s+/i);
  assert.ok(users.length > 0, "no USER line: the container would run as root");
  const last = users.at(-1)!;
  const who = lines[last].split(/\s+/)[1];
  assert.ok(!/^(root|0)(:|$)/.test(who), `USER is ${who}`);
  assert.ok(idx(/^(RUN|COPY|ADD)\s/i).every((i) => i < last), "a build step runs after USER, so it would need root");
  assert.ok(idx(/^(CMD|ENTRYPOINT)\s/i).some((i) => i > last), "the command must come after USER");
});

test("the base image is pinned to the exact Playwright version the worker's lockfile uses", () => {
  const from = lines.find((l) => /^FROM\s/i.test(l)) ?? "";
  const tag = /playwright:v(\d+\.\d+\.\d+)-/.exec(from)?.[1];
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.strictEqual(tag, lock.packages["node_modules/playwright-core"].version);
});

test("render.yaml: a web service with the health check, memory for its browser, and every key the worker needs", async () => {
  const { checkEnv } = await import("../src/env.ts");
  const y = readFileSync(new URL("../../../render.yaml", import.meta.url), "utf8");
  assert.match(y, /type: web\b/);
  assert.match(y, /healthCheckPath: \/healthz/);
  const plan = /^\s+plan: (\w+)/m.exec(y)?.[1] ?? "";
  // the values the blueprint sets, and a stand-in for each one the founder pastes
  const set: Record<string, string> = {};
  for (const m of y.matchAll(/- key: (\w+)\n\s+(?:value: "?([^"\n#]*?)"?\s*(?:#.*)?$|sync: false|generateValue: true)/gm)) set[m[1]] = m[2] ?? (m[1] === "ANTHROPIC_API_KEY" ? "sk-ant-x" : m[1] === "FILER_SECRET" ? "s".repeat(32) : "x");
  const env = checkEnv(set);
  assert.deepEqual(env.missing, [], "the blueprint asks for every required value");
  // Chromium in the container needs 2 GB; the free plan (512 MB) only with a remote browser, which starts no Chromium here
  if (!["standard", "pro", "pro_plus", "pro_max", "pro_ultra"].includes(plan)) {
    assert.ok(["free", "starter"].includes(plan), `unknown plan ${plan}`);
    assert.equal(env.remote, true, `plan ${plan} is too small for Chromium: BROWSER_PROVIDER must be steel or browserbase`);
    assert.match(set.NODE_OPTIONS ?? "", /--max-old-space-size=(\d{3})\b/);
    assert.ok(Number(/--max-old-space-size=(\d+)/.exec(set.NODE_OPTIONS)![1]) <= 384, "the heap fits in 512 MB");
  }
  assert.equal(plan, "free", "the $0 start: Render free with Steel");
  assert.equal(env.provider, "steel");
  assert.equal(env.wake, true, "FILER_SECRET is asked for, so the app can wake it");
  assert.match(y, /plan: standard/, "the comments show the one-line switch to standard");
  assert.match(y, /BROWSER_PROVIDER value: local/);
  assert.match(y, /BROWSER_PROVIDER value: browserbase/);
  const asked = [...y.matchAll(/- key: (\w+)\n\s+sync: false/g)].map((m) => m[1]);
  assert.deepEqual(asked, ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "STEEL_API_KEY"], "the founder pastes three values");
  assert.match(y, /key: FILER_SECRET\n\s+generateValue: true/, "Render makes the wake secret, so nobody types it");
  const docker = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  for (const p of [...y.matchAll(/^\s+- (supabase\/\S+)/gm)].map((m) => m[1])) assert.ok(docker.includes(p), `the image copies ${p}`);
});
