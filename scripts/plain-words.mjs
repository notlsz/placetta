#!/usr/bin/env node
/* Plain words: the interface never says engineer words. Anyone running a tea shop should read every label without a
   glossary, so the words below may not appear in anything shown to a person. Fails (exit 1) when one does.

   What's checked:
     src/i18n.ts                every string
     src/*.tsx                  every string literal that reads as a sentence (has a space or Chinese characters),
                                plus every B("…", "…") pair; identifiers in quotes ("handoff" as a state name) don't count
     src/jobs.ts, src/serverRun.ts, src/harness.ts, src/live.ts, src/replay.ts, src/finish.ts, src/today.ts, and the owner controls (src/autonomy.ts, rewind.ts,
     businessRules.ts, commands.ts, held.ts, demoPlan.ts, autopilot.ts, autopilotFile.ts, weekDone.ts, forms/esign.ts)
                                B("…", "…") and L("…", "…") pairs and { en: "…", zh: "…" } labels only: the step
                                labels and notes a person sees, not the instructions written for the model
   Allowed: code comments, import paths, class names, and the restaurant sense of "seats" in the forms library
   (src/forms/ isn't scanned; it's the agencies' own wording).

   Run: node scripts/plain-words.mjs            (CI runs it after the type check) */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const BANNED = [
  // English: engineer words for how the agent is built, not what it does for you
  /\bharness(es)?\b/i, /\bseats?\b/i, /\bhand-?offs?\b/i, /\bcompactions?\b/i, /\bcheckers?\b/i,
  // the owner controls copied from Claude Code: people see Business rules and Undo, never hooks or checkpoints
  /\bhooks?\b/i, /\bcheckpoints?\b/i,
  // Chinese equivalents: 交接 (handoff), 检查器 (checker), 座席 (seat, the agent sense), 上下文压缩 (compaction), 线束 (harness)
  /交接/, /检查器/, /座席/, /上下文压缩/, /线束/,
];

/** Every string literal in a source file, with its line: "…", '…' and `…` (template holes left in place). */
function literals(src) {
  const out = [];
  const re = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = re.exec(src))) {
    const before = src.slice(0, m.index);
    // not inside a // or /* comment on that line (rough, and enough for this codebase's one-line comments)
    const lineStart = before.lastIndexOf("\n") + 1, lineText = before.slice(lineStart);
    if (/(^|\s)\/\/|\/\*/.test(lineText) && !/\*\//.test(lineText)) continue;
    const line = before.split("\n").length;
    // a template's holes are code (`${h.seat}`), not words anyone reads
    out.push({ text: m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, " "), line, lead: lineText.slice(-24) });
  }
  return out;
}
const sentence = s => /\s/.test(s.trim()) || /[㐀-鿿]/.test(s);
const inPair = lead => /\b[BL]\(\s*$|\{\s*en:\s*$|,\s*$/.test(lead);

const files = [];
const srcDir = join(ROOT, "src");
for (const f of readdirSync(srcDir)) if (f.endsWith(".tsx") || f === "i18n.ts") files.push({ path: join(srcDir, f), all: true });
for (const f of ["jobs.ts", "serverRun.ts", "harness.ts", "live.ts", "replay.ts", "autonomy.ts", "rewind.ts", "businessRules.ts", "commands.ts", "held.ts", "demoPlan.ts", "finish.ts", "today.ts", "initiative.ts", "escalate.ts", "autopilot.ts", "autopilotFile.ts", "weekDone.ts", "forms/esign.ts"]) files.push({ path: join(srcDir, f), all: false });

const hits = [];
for (const { path, all } of files) {
  const src = readFileSync(path, "utf8");
  const lines = src.split("\n");
  for (const lit of literals(src)) {
    const lineText = lines[lit.line - 1] ?? "";
    if (/^\s*import\b|\bfrom\s+["']/.test(lineText) && !sentence(lit.text)) continue;   // import paths
    if (/className=/.test(lit.lead)) continue;                                            // class names
    // model instructions (tool descriptions, prompts) are for the model, not the person
    if (!all && !(inPair(lit.lead) || /\bzh:\s*$/.test(lit.lead))) continue;
    if (!all && /description:|prompt|note:/.test(lit.lead)) continue;
    if (all && !sentence(lit.text)) continue;
    for (const re of BANNED) {
      const m = re.exec(lit.text);
      if (m) hits.push({ file: path.slice(ROOT.length), line: lit.line, word: m[0], text: lit.text.slice(0, 90) });
    }
  }
}

if (hits.length) {
  console.error(`Plain words: ${hits.length} engineer word${hits.length === 1 ? "" : "s"} in the interface. Say it the way the person would.`);
  for (const h of hits) console.error(`  ${h.file}:${h.line}  "${h.word}"  in  "${h.text}"`);
  process.exit(1);
}
console.log(`Plain words: ${files.length} files checked, nothing to fix.`);
