---
name: evalkit-judges
description: Write or debug Evalkit scoring rules and judges. Use for predicate scorers, grading trajectories/artifacts, pass/fail thresholds, partial scoring, evidence, or interpreting scorer errors.
---

# Score Evalkit trials

Read `../evalkit/SKILL.md`, `../../../www/src/content/manual.md` (Add a scorer and an eval, Read and process results), `../../../packages/runner/src/index.ts` (`normalizeScore`, `scoreSummary`, `runPredicate`), and `../../../examples/starter/judges/greeting.ts`.

Despite the example directory name `judges/`, only `predicate(name, fn, options?)` scorers **execute** today. `judgeScorer(...)` is a declared but unimplemented API and produces a scorer error if run. Do not propose it as a working LLM judge; implement a predicate that calls the desired grader yourself if needed, with clear external dependencies, costs, and privacy protections.

1. Add a named predicate, then reference it from the eval's `scoring` array. Its callback receives `{ context, trajectory: { events }, artifacts: { candidate, evaluator } }`. Filter trajectory events by `source: 'aut'` and event `kind`/role when evaluating an agent response. `context` includes per-trial IDs, metadata and optional parameters; workspace roots are absolute local paths.
2. Return a finite score from 0 to 1, or `{ value, passed?, explanation?, evidence? }` with JSON-serializable evidence. Without `passed`, only `value === 1` passes. Set `passed` explicitly for a threshold (e.g. `value >= 0.8`); avoid treating a partial numeric score as a pass by accident. Use clear explanations/evidence for debugging.
3. Normal predicates are skipped on agent/fixture execution errors; `{ supportsPartial: true }` lets a predicate run if a context/workspace exists, even after an execution error. Scorer exceptions and invalid scores become recorded scorer failures; never mask them as passes.
4. Scorers run after the agent session closes; use `node:fs/promises` to inspect candidate/evaluator files before the workspace is cleaned up. Keep private evaluator data out of evidence, trajectories and exported reports.
5. Test a passing, failing, and missing-output trajectory; inspect `scoring.json` (`results`, `overall`, `passed`) and `summary.json`. `overall` is an unweighted mean of valid scores, not the pass rate. An execution `status: 'completed'` can still have failed scoring; run-level `failed` is the meaningful count for gating.
