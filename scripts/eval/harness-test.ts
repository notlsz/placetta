/* npm run test:eval: the live evaluation's plumbing (scripts/eval/harness.ts) and the argument checker it shares with
   the agent loop (src/toolArgs.ts), then the whole harness end to end on the scripted model: an A/B run, the dated
   history and scoreboard, a baseline, and the gate passing on the same run and failing on a doctored worse one. No key
   is needed and nothing is written outside a temporary folder. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abReport, alert, applyPrompt, consistency, datasetOf, diffReport, diffRuns, entryOf, gate, kindOf, load, parseVariant, rates, record, scoreboard, toolChecks, variantEnv, versionOf, withOpenAI, type Entry, type Outcome } from "./harness";
import { argError, checkArgs, type Schema } from "../../src/toolArgs";
import { requestText, SimClock, speedSummary } from "./speed";

let n = 0;
const t = (name: string, f: () => void) => { f(); n++; console.log(`ok  ${name}`); };
const tAsync = async (name: string, f: () => Promise<void>) => { await f(); n++; console.log(`ok  ${name}`); };
const envOf = (o: Record<string, string>) => (k: string) => o[k];

/* ---------------- arguments against schemas */
const DEADLINE: Schema = { type: "object", properties: { date: { type: "string" }, title: { type: "string" }, kind: { type: "string", enum: ["due", "renewal"] }, day: { type: "integer", minimum: 1, maximum: 31 }, tags: { type: "array", items: { type: "string" }, maxItems: 2 } }, required: ["date", "title"] };
t("valid arguments pass", () => assert.deepEqual(checkArgs(DEADLINE, { date: "2027-01-01", title: "x", kind: "due", day: 3, tags: ["a"] }), { ok: true, errors: [], unknown: [] }));
t("missing, mistyped, out of range, wrong enum and long lists are all reported", () => {
  const r = checkArgs(DEADLINE, { date: 20270101, kind: "soon", day: 40, tags: ["a", "b", 3] });
  assert.equal(r.ok, false);
  for (const want of [/title is required/, /date must be string, got integer/, /kind must be one of "due", "renewal"/, /day must be at most 31/, /tags takes at most 2 items/, /tags\[2\] must be string/]) assert.ok(r.errors.some(e => want.test(e)), `${want} in ${r.errors.join(" | ")}`);
});
t("a quoted integer gets a hint, a string for a list too", () => {
  assert.match(checkArgs({ type: "object", properties: { day: { type: "integer" } } }, { day: "5" }).errors[0], /without quotes/);
  assert.match(checkArgs({ type: "object", properties: { ids: { type: "array" } } }, { ids: "a" }).errors[0], /send a list/);
});
t("unknown arguments never block; a null optional is 'not given'", () => {
  const r = checkArgs(DEADLINE, { date: "2027-01-01", title: "x", colour: "red", kind: null });
  assert.equal(r.ok, true); assert.deepEqual(r.unknown, ["colour"]);
});
t("integers are numbers; nested objects are checked", () => {
  assert.equal(checkArgs({ type: "object", properties: { usd: { type: "number" } } }, { usd: 3 }).ok, true);
  const r = checkArgs({ type: "object", properties: { fields: { type: "array", items: { type: "object", properties: { label: { type: "string" } }, required: ["label"] } } } }, { fields: [{ label: "a" }, { value: "b" }] });
  assert.deepEqual(r.errors, ["fields[1].label is required"]);
});
t("the model's error names every problem and what the tool takes", () => {
  const e = argError("add_deadline", DEADLINE, checkArgs(DEADLINE, { date: 1 }));
  assert.match(e, /^Invalid arguments for add_deadline: title is required; date must be string, got integer 1\. Nothing was done\. add_deadline takes date \(required\): string, title \(required\): string, kind: "due"\|"renewal"/);
});

/* ---------------- variants */
t("presets, routes by hand and prompts", () => {
  assert.deepEqual(parseVariant("default").env, {});
  assert.equal(parseVariant("sonnet").env.AGENT_ROUTE_PLAN, "anthropic:claude-sonnet-5-5");
  assert.equal(parseVariant("openai", envOf({ EVAL_OPENAI_MODEL: "gpt-5.6" })).env.AGENT_ROUTE_SHORT, "openai:gpt-5.6");
  assert.deepEqual(parseVariant("plan=openai:gpt-5.4;review=gemini:gemini-2.5-pro").env, { AGENT_ROUTE_PLAN: "openai:gpt-5.4", AGENT_ROUTE_REVIEW: "gemini:gemini-2.5-pro" });
  assert.deepEqual(parseVariant("prompt-replace:x.md"), { name: "prompt-replace:x.md", env: {}, promptFile: "x.md", promptMode: "replace" });
  assert.throws(() => parseVariant("planz=openai:x"), /isn't role=provider:model/);
  assert.throws(() => parseVariant("nope"), /Unknown variant/);
});
t("OpenAI joins the routes only when its key is set, before the open-model backups", () => {
  assert.equal(withOpenAI(envOf({}))("AGENT_ROUTE_PLAN"), undefined);
  const r = withOpenAI(envOf({ OPENAI_API_KEY: "k" }))("AGENT_ROUTE_PLAN")!.split(",");
  assert.ok(r.indexOf("openai:gpt-5.4") > r.findIndex(x => x.startsWith("anthropic:")) && r.indexOf("openai:gpt-5.4") < r.findIndex(x => x.startsWith("groq:")), r.join(","));
  assert.equal(withOpenAI(envOf({ OPENAI_API_KEY: "k", AGENT_ROUTE_PLAN: "gemini:x" }))("AGENT_ROUTE_PLAN"), "gemini:x");
  assert.equal(variantEnv(envOf({ OPENAI_API_KEY: "k" }), parseVariant("sonnet"))("AGENT_ROUTE_PLAN"), "anthropic:claude-sonnet-5-5");
});
t("a prompt variant touches only the agent's own calls", () => {
  const v = parseVariant("prompt:extra.md"), read = () => "BE BRIEF";
  assert.equal(applyPrompt({ system: "S", tools: [] }, v, read).system, "S\n\nBE BRIEF");
  assert.equal(applyPrompt({ system: "S" }, v, read).system, "S");
  assert.equal(applyPrompt({ system: "S", tools: [] }, parseVariant("prompt-replace:extra.md"), read).system, "BE BRIEF");
});

/* ---------------- tool-calling checks */
t("right tool, valid arguments, forbidden tools, matching arguments", () => {
  const schemas = new Map<string, Schema>([["add_deadline", DEADLINE], ["check_progress", { type: "object", properties: {} }]]);
  const ok = toolChecks([{ name: "add_deadline", input: { date: "2027-03-30", title: "x" }, ok: true, out: "" }], schemas, { firstTool: ["add_deadline"], neverTools: ["file"], args: [{ tool: "add_deadline", match: { date: "2027-03-30", title: /x/ } }] });
  assert.ok(ok.every(c => c.pass), JSON.stringify(ok));
  const bad = toolChecks([{ name: "check_progress", input: {}, ok: true, out: "" }, { name: "add_deadline", input: { date: 1 }, ok: false, out: "" }, { name: "file", input: {}, ok: true, out: "" }], schemas,
    { firstTool: ["add_deadline"], neverTools: ["file"], args: [{ tool: "add_deadline", match: { date: "2027-03-30" } }] });
  assert.deepEqual(bad.filter(c => !c.pass).map(c => c.name), ["every tool called exists", "every tool call's arguments fit its schema", "first tool is add_deadline", "never calls file", "calls add_deadline with date=2027-03-30"]);
});
t("checks sort into kinds", () => {
  assert.equal(kindOf("nothing filed, paid or sent"), "safety");
  assert.equal(kindOf("first tool is add_deadline"), "tools");
  assert.equal(kindOf("at most 60 words"), "style");
  assert.equal(kindOf("in Chinese"), "style");
  assert.equal(kindOf("a deadline on 2027-11-01"), "task");
  assert.equal(kindOf("finished with a reply"), "finish");
});

/* ---------------- history, scoreboard, gate, A/B */
const out = (id: string, pass: boolean, extra: Partial<Outcome> = {}): Outcome => ({ id, category: "x", pass, usd: 0.01, checks: [{ name: "a deadline on 2027-01-01", pass }, { name: "nothing filed, paid or sent", pass: true }], ...extra });
const ent = (results: boolean[], o: Partial<Parameters<typeof entryOf>[0]> = {}) => entryOf({ date: "2026-10-22T10:00:00.000Z", mode: "live", variant: "default", outcomes: results.map((p, k) => out(`s${k}`, p)), total_usd: 0.1, median_usd: 0.01, ...o });
t("task completion and the entry", () => {
  const e = ent([true, true, false, true]);
  assert.equal(e.pass_rate, 0.75); assert.equal(e.task_completion, 0.75); assert.equal(e.safety, 1);
  assert.equal(rates([out("a", false, { checks: [{ name: "at most 60 words", pass: false }, { name: "used add_store", pass: true }] })]).task_completion, 1);
});
t("the gate: no baseline, same, one flaky, a real regression, a safety slip, added scenarios", () => {
  const base = ent([true, true, true, true, false]);
  assert.equal(gate(null, base).regressed, false);
  assert.equal(gate(base, ent([true, true, true, true, false])).regressed, false);
  // one flaky scenario in a full-size run is allowed; in a run of five it is also a 20-point drop, which isn't
  const big = (fail: number[]) => ent(Array.from({ length: 40 }, (_, k) => !fail.includes(k)));
  const flaky = gate(big([39]), big([39, 3]));
  assert.equal(flaky.regressed, false); assert.deepEqual(flaky.newlyFailing, ["s3"]);
  assert.equal(gate(base, ent([true, true, true, false, false])).regressed, true);
  const worse = gate(base, ent([true, false, true, false, true]));
  assert.equal(worse.regressed, true); assert.deepEqual(worse.newlyPassing, ["s4"]);
  const unsafe = { ...ent([true, true, true, true, false]), safety: 0.9 };
  assert.equal(gate(base, unsafe).regressed, true);
  const more = entryOf({ date: "2026-10-23T00:00:00Z", mode: "live", variant: "default", outcomes: [...[true, true, true, true, false].map((p, k) => out(`s${k}`, p)), out("new", false)], total_usd: 0, median_usd: 0 });
  assert.equal(gate(base, more).regressed, false);
  assert.equal(gate({ ...base, judge_mean: 4.4 }, { ...base, judge_mean: 3.6 }).regressed, true);
});
t("history files and the scoreboard", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-hist-"));
  try {
    record(dir, ent([true, false], { date: "2026-10-21T09:00:00.000Z", variant: "gemini" }));
    record(dir, ent([true, true], { date: "2026-10-22T09:00:00.000Z", variant: "sonnet", label: "new prompt" }));
    record(dir, ent([true, true], { date: "2026-10-22T09:30:00.000Z", mode: "dry" }));
    assert.equal(load(dir).length, 3);
    const md = readFileSync(join(dir, "SCOREBOARD.md"), "utf8");
    assert.ok(md.indexOf("sonnet (new prompt)") < md.indexOf("| gemini"), "newest first");
    assert.match(md, /## Dry runs\n\n\| When/);
    assert.match(scoreboard([]), /None yet/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
t("the A/B table lists where variants disagree", () => {
  const md = abReport([ent([true, true], { variant: "gemini" }), ent([true, false], { variant: "sonnet" })]);
  assert.match(md, /## A\/B: gemini vs sonnet/); assert.match(md, /\| s1 \| pass \| fail \|/);
  assert.equal(abReport([ent([true])]), "");
});

/* ---------------- cost and speed on the fixtures */
t("speed: cache reads only past 1,024 shared tokens, breaks located, time to first token from the first words", () => {
  const sys = "R".repeat(8000);   // about 2,000 tokens of rules
  const b1 = { tools: [{ name: "a" }], system: sys, messages: [{ role: "user", content: "hi" }] };
  const b2 = { ...b1, messages: [...b1.messages, { role: "assistant", content: "x" }] };
  let now = 1000;
  const clock = new SimClock(null, 1000, () => now);
  const c1 = clock.call(requestText(b1), { content: [{ type: "tool_use" }] }, "gemini-2.5-flash");
  const c2 = clock.call(requestText(b2), { content: [{ type: "text", text: "Done." }] }, "gemini-2.5-flash");
  assert.equal(c1.read, 0); assert.ok(c2.read >= 2000 && c2.input < 50, JSON.stringify(c2));
  assert.ok(c2.usd < c1.usd, "a cached call costs less");
  now = 1100;
  const d = clock.done();
  assert.equal(d.breaks.none, 1);
  assert.ok(d.ttft_ms > c1.ms && d.ttft_ms < c1.ms + c2.ms, "first words come with the second call");
  const other = new SimClock(null);
  other.call(requestText(b1), { content: [{ type: "text", text: "a" }] }, "x");
  other.call(requestText({ ...b1, tools: [{ name: "b" }] }), { content: [{ type: "text", text: "a" }] }, "x");
  assert.equal(other.done().breaks.tools, 1, "a changed tool list is found as the break");
  const short = new SimClock(null);
  short.call(requestText({ system: "s" }), { content: [] }, "x");
  assert.equal(short.call(requestText({ system: "s" }), { content: [] }, "x").read, 0, "under 1,024 tokens nothing is cached");
  const s = speedSummary([d, d, { ...d, usd: 1, done_ms: 99_000 }]);
  assert.equal(s.runs, 3); assert.equal(s.done_p95_ms, 99_000); assert.equal(s.usd_p50, d.usd);
});

/* ---------------- dataset versions, the per-scenario diff, consistency, the alert */
t("versions: stable, order-free, and a changed scenario is never compared with its old self", () => {
  assert.equal(versionOf({ b: 1, a: [1, { c: "x" }] }), versionOf({ a: [1, { c: "x" }], b: 1 }));
  assert.notEqual(versionOf({ prompt: "Map my permits" }), versionOf({ prompt: "Map my permits." }));
  assert.equal(datasetOf({ s0: "aa", s1: "bb" }), datasetOf({ s1: "bb", s0: "aa" }));
  const v1 = { s0: "v1", s1: "v1", s2: "v1" }, v2 = { ...v1, s1: "v2" };
  const base = ent([true, true, true], { cases: v1 }), head = ent([true, false, true], { cases: v2 });
  assert.ok(base.dataset && base.dataset !== head.dataset, "the set's version moves when a scenario changes");
  const g = gate(base, head);
  assert.equal(g.regressed, false, "s1 changed: its new failure isn't a regression of the old one");
  assert.ok(g.lines.some(l => /Changed since the baseline, so not compared: s1/.test(l)), g.lines.join(" "));
  assert.equal(gate(base, ent([true, false, true], { cases: v1 })).regressed, true, "the same s1 failing is");
});
t("the diff: newly failing and fixed checks, judge and cost moves, each with how it ran", () => {
  const tr = { rounds: 3, calls: 3, tools: 4, tool_errors: 1, wall_ms: 12_300, usd: 0.02, slowest: ["fill_fields"] };
  const mk = (pass: boolean[], judge: number[], o: Partial<Parameters<typeof entryOf>[0]> = {}) => entryOf({ date: "2026-10-22T10:00:00.000Z", mode: "live", variant: "default", total_usd: 0, median_usd: 0,
    outcomes: pass.map((p, k) => out(`s${k}`, p, { judge: { pass: p, score: judge[k] }, usd: 0.01 * (k + 1), ...(k === 0 ? { trace: tr } : {}) })), ...o });
  const d = diffRuns(mk([true, false, true], [5, 2, 4]), mk([false, true, true], [3, 4, 4]));
  assert.deepEqual([d.regressions, d.improvements, d.unchanged], [1, 1, 1]);
  assert.deepEqual(d.rows.map(r => [r.id, r.was, r.now]), [["s0", "pass", "fail"], ["s1", "fail", "pass"], ["s2", "pass", "pass"]], "regressions first, then improvements");
  assert.deepEqual([d.rows[0].broke, d.rows[1].fixed, d.rows[0].judge, d.rows[0].trace?.slowest], [["a deadline on 2027-01-01"], ["a deadline on 2027-01-01"], [5, 3], ["fill_fields"]]);
  const md = diffReport(d, "the baseline");
  assert.match(md, /1 regressed, 1 improved, 1 unchanged/);
  assert.match(md, /\| s0 \| pass \| fail \| a deadline on 2027-01-01 \| +\| 5 to 3 \| \$0\.010 to \$0\.010 \| 3 rounds, 3 model and 4 tool calls \(1 failed\), 12\.3 s, slowest fill_fields \|/);
  assert.doesNotMatch(md, /\| s2 \|/, "only rows that moved");
});
t("consistency: pass^k over the last live runs, flaky ones named", () => {
  const runs = [[true, true, true], [true, false, true], [true, true, true]].map((p, k) => ent(p, { date: `2026-10-2${k}T10:00:00.000Z` }));
  const md = consistency(runs);
  assert.match(md, /2 of 3 scenarios passed every one of the last 3 runs \(pass\^3\)\. Flaky: s1\./);
  assert.match(md, /\| s1 \| 2 of 3 \| P F P \|/);
  assert.equal(consistency(runs.slice(0, 1)), "", "nothing to say with one run");
});
await tAsync("the alert: posted only on a regression, only to https, never throws", async () => {
  const sent: string[] = [];
  const f = ((url: string, init: { body: string }) => { sent.push(`${url} ${init.body}`); return Promise.resolve(new Response("ok")); }) as unknown as typeof fetch;
  const base = ent([true, true, true, true, false]), worse = ent([true, false, true, false, false]);
  const g = gate(base, worse), d = diffRuns(base, worse);
  assert.equal(await alert("https://hooks.slack.test/x", g, d, { variant: "default", commit: "abcdef1234" }, f), true);
  assert.match(sent[0], /^https:\/\/hooks\.slack\.test\/x \{"text":"Odelia eval regression on default at abcdef12\./);
  assert.match(sent[0], /s1: a deadline on 2027-01-01/);
  assert.equal(await alert("https://hooks.slack.test/x", gate(base, base), null, { variant: "default", commit: "" }, f), false, "no regression, no post");
  assert.equal(await alert("http://plain.test", g, d, { variant: "default", commit: "" }, f), false, "https only");
  assert.equal(await alert(undefined, g, d, { variant: "default", commit: "" }, f), false);
  const boom = (() => Promise.reject(new Error("down"))) as unknown as typeof fetch;
  assert.equal(await alert("https://hooks.slack.test/x", g, d, { variant: "default", commit: "" }, boom), false);
  assert.equal(sent.length, 1);
});

/* ---------------- end to end, on the scripted model */
t("the whole harness: A/B, history, baseline, gate, and skipping without a key", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-e2e-"));
  const run = (args: string[], env: Record<string, string> = {}) => {
    const keyless = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/_API_KEY$/.test(k)));
    try { return { code: 0, out: execFileSync("node", ["scripts/live-eval.mjs", ...args], { encoding: "utf8", env: { ...keyless, ...env }, stdio: ["ignore", "pipe", "pipe"] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  try {
    const files = ["--out", join(dir, "e.md"), "--json", join(dir, "e.json"), "--history", join(dir, "h")];
    const ab = run(["--dry", "--only", "tools", "--ab", "default,sonnet", "--set-baseline", ...files]);
    assert.equal(ab.code, 0, ab.out);
    assert.match(ab.out, /A\/B over default vs sonnet/);
    assert.equal(readdirSync(join(dir, "h")).filter(f => f.endsWith(".json") && f !== "baseline.json").length, 2);
    assert.ok(existsSync(join(dir, "h", "baseline.json")));
    assert.match(readFileSync(join(dir, "e.md"), "utf8"), /## A\/B: default vs sonnet/);
    const same = run(["--dry", "--only", "tools", "--gate", join(dir, "h", "baseline.json"), "--no-history", ...files]);
    assert.equal(same.code, 0, same.out); assert.match(same.out, /gate: ok/);
    assert.match(readFileSync(join(dir, "e.md"), "utf8"), /## Scenario by scenario, against the baseline/);
    const saved = JSON.parse(readFileSync(join(dir, "h", "baseline.json"), "utf8")) as Entry;
    assert.ok(saved.dataset && Object.keys(saved.cases ?? {}).length === saved.scenarios, "the run saves the dataset's version and each scenario's");
    assert.ok(Object.values(saved.results).every(r => r.trace && r.trace.calls >= 1), "each scenario keeps its run's trace totals");
    // a real regression end to end: a baseline whose judge scored 5 of 5, against the stand-in judge's 4, fails the run
    const base = JSON.parse(readFileSync(join(dir, "h", "baseline.json"), "utf8")) as Entry;
    writeFileSync(join(dir, "better.json"), JSON.stringify({ ...base, judge_mean: 5 }));
    const worse = run(["--dry", "--judge", "--only", "tools", "--gate", join(dir, "better.json"), "--no-history", ...files]);
    assert.equal(worse.code, 1, worse.out); assert.match(worse.out, /gate: REGRESSION: .*judge's mean fell from 5\.00 to 4\.00/);
    // a dry run never gates against a live baseline: the modes differ, so there's no baseline yet
    writeFileSync(join(dir, "live.json"), JSON.stringify({ ...base, mode: "live", judge_mean: 5 }));
    assert.match(run(["--dry", "--judge", "--only", "tools-1", "--gate", join(dir, "live.json"), "--no-history", ...files]).out, /No baseline yet/);
    const skip = run(["--if-keys", "--only", "tools", ...files]);
    assert.equal(skip.code, 0, skip.out); assert.match(skip.out, /Skipped: no model key/);
    const noKey = run(["--only", "tools", ...files]);
    assert.equal(noKey.code, 2, noKey.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

console.log(`\n${n} eval harness tests passed`);
