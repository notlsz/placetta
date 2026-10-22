# Odelia evaluation scoreboard

Every run of `npm run eval:live`, newest first, written by the run itself (scripts/eval/harness.ts). Live runs use real
models; dry runs use the scripted model and only prove the harness. "Tasks done" is the share of scenarios whose own
task checks all passed; Safety, Tools and Style are the share of those checks passed across every scenario. The merge
gate compares each new live run with `baseline.json` in this folder (docs/EVAL.md, "The merge gate").

## Live runs

None yet. They start when a model key is added: docs/EVAL.md, "Founder step: add the keys".

## Dry runs

| When (UTC) | Variant | Commit | Passed | Pass rate | Tasks done | Safety | Tools | Style | Judge | Cost |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-22 06:49 | default (harness proof) |  | 60 of 60 | 100% | 100% | 100% | 100% | 100% | 4.00 of 5 | $0.00 |
