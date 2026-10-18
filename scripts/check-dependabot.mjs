#!/usr/bin/env node
/* Checks that .github/dependabot.yml watches every dependency manifest in the repo, at least weekly:
   every package-lock.json (npm), every Dockerfile (docker), and the GitHub Actions workflows.
   Run: node scripts/check-dependabot.mjs   (CI runs it in the security job; exit 1 lists what's missing)
   Policy: docs/soc2/policies/vulnerability-management.md. */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OFTEN_ENOUGH = new Set(["daily", "weekly"]);

/** The subset of YAML dependabot.yml uses: scalars, `- ` list items under updates, flow maps and one level of nesting. */
export function parseDependabot(text) {
  const out = { version: null, updates: [] };
  let inUpdates = false, entry = null, entryIndent = -1, nestKey = null, nestIndent = -1;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").replace(/^\s*#.*$/, "");
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    if (indent === 0) {
      inUpdates = false; entry = null; nestKey = null;
      const [k, v] = splitKV(body);
      if (k === "version") out.version = scalar(v);
      if (k === "updates") inUpdates = true;
      continue;
    }
    if (!inUpdates) continue;
    const dash = body.match(/^-\s+(.*)$/);
    if (dash) {
      entry = {}; out.updates.push(entry); entryIndent = indent; nestKey = null;
      assign(entry, dash[1]);
      continue;
    }
    if (!entry) continue;
    if (nestKey && indent > nestIndent) { assign(entry[nestKey], body); continue; }
    nestKey = null;
    if (indent > entryIndent) {
      const [k, v] = splitKV(body);
      if (k && v === "") { entry[k] = {}; nestKey = k; nestIndent = indent; } else assign(entry, body);
    }
  }
  return out;
}

function splitKV(s) {
  const i = s.indexOf(":");
  if (i < 0) return [null, s];
  return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
}

function scalar(v) {
  if (v === undefined || v === null) return null;
  const s = v.trim();
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^(true|false)$/.test(s)) return s === "true";
  const q = s.match(/^(["'])(.*)\1$/);
  if (q) return q[2];
  if (s.startsWith("{") && s.endsWith("}")) {
    const o = {};
    for (const part of s.slice(1, -1).split(",")) { const [k, val] = splitKV(part); if (k) o[k] = scalar(val); }
    return o;
  }
  if (s.startsWith("[") && s.endsWith("]")) return s.slice(1, -1).split(",").map((x) => scalar(x)).filter((x) => x !== "");
  return s;
}

function assign(obj, body) {
  const [k, v] = splitKV(body);
  if (k) obj[k] = scalar(v);
}

const norm = (d) => "/" + String(d ?? "").replace(/^\.?\/+/, "").replace(/\/+$/, "");

/** The manifests Dependabot should watch, from the list of tracked files. */
export function requiredEntries(files) {
  const need = new Map();
  for (const f of files) {
    if (f.includes("node_modules/")) continue;
    const base = f.split("/").pop();
    const dir = norm(f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "");
    if (base === "package-lock.json") need.set(`npm ${dir}`, { ecosystem: "npm", directory: dir, because: f });
    if (base === "Dockerfile" || /\.Dockerfile$/.test(base)) need.set(`docker ${dir}`, { ecosystem: "docker", directory: dir, because: f });
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(f)) need.set("github-actions /", { ecosystem: "github-actions", directory: "/", because: ".github/workflows" });
  }
  return [...need.values()];
}

/** Problems with the config against the repo's files: missing coverage, slow schedules, updates switched off. */
export function checkDependabot(yamlText, files) {
  const problems = [], warnings = [];
  const cfg = parseDependabot(yamlText);
  if (cfg.version !== 2) problems.push(`version should be 2 (found ${cfg.version})`);
  const covered = new Set();
  for (const u of cfg.updates) {
    const eco = u["package-ecosystem"];
    const dirs = Array.isArray(u.directories) ? u.directories : [u.directory];
    const interval = u.schedule && typeof u.schedule === "object" ? u.schedule.interval : null;
    for (const d of dirs) covered.add(`${eco} ${norm(d)}`);
    if (!OFTEN_ENOUGH.has(interval)) problems.push(`${eco} ${dirs.map(norm).join(", ")}: schedule.interval is ${interval ?? "missing"}; the policy is weekly or more often`);
    if (u["open-pull-requests-limit"] === 0) problems.push(`${eco} ${dirs.map(norm).join(", ")}: open-pull-requests-limit 0 switches version updates off`);
  }
  const need = requiredEntries(files);
  for (const n of need) {
    if (!covered.has(`${n.ecosystem} ${n.directory}`)) problems.push(`no ${n.ecosystem} entry for ${n.directory} (${n.because})`);
  }
  const needed = new Set(need.map((n) => `${n.ecosystem} ${n.directory}`));
  for (const c of covered) if (!needed.has(c)) warnings.push(`${c} is watched but has no manifest there`);
  return { ok: problems.length === 0, problems, warnings, entries: cfg.updates.length, required: need };
}

export function trackedFiles(root = ROOT) {
  try {
    return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 }).split("\n").filter(Boolean);
  } catch {
    const out = [];
    const walk = (d, rel) => {
      for (const name of readdirSync(d)) {
        if (name === "node_modules" || name === ".git") continue;
        const p = join(d, name), r = rel ? `${rel}/${name}` : name;
        if (statSync(p).isDirectory()) walk(p, r); else out.push(r);
      }
    };
    walk(root, "");
    return out;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const res = checkDependabot(readFileSync(join(ROOT, ".github/dependabot.yml"), "utf8"), trackedFiles());
  for (const w of res.warnings) console.log(`note: ${w}`);
  if (!res.ok) {
    for (const p of res.problems) console.error(`dependabot: ${p}`);
    process.exit(1);
  }
  console.log(`dependabot: ${res.entries} entries cover all ${res.required.length} manifests, weekly or more often`);
}
