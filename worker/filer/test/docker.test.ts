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
