---
name: evalkit-judges
description: Write or debug EvalKit scoring rules and judges. Use for predicate scorers, grading trajectories/artifacts, pass/fail thresholds, partial scoring, evidence, or interpreting scorer errors.
---

# Score EvalKit trials

Read `../evalkit/SKILL.md`, `../../../sites/evalkit.leostera.dev/src/content/docs/manual/scoring-and-evals.md` and `../../../sites/evalkit.leostera.dev/src/content/docs/manual/results.md`, `../../../packages/runner/src/index.ts` (`normalizeScore`, `scoreSummary`, `runPredicate`), and `../../../examples/starter/judges/greeting.ts`.

EvalKit currently executes deterministic `predicate(name, callback)` scorers and agent-backed `judge(name, { rubric })` rules. A judge rule requires a **separate eval-level `judge` adapter**; it is not inferred from or shared with the AUT. The `judgeScorer(...)` API is not implemented—do not suggest it.

1. Add a named `predicate(...)` for deterministic checks or a `judge(...)` descriptor for rubric-based LLM assessment, then reference it from the eval's `scoring` array or supported transcript checkpoint. The predicate callback receives `{ context, trajectory, artifacts, turn? }`. Filter trajectory events by `source: 'aut'` and event `kind`/role when evaluating an agent response. `context` includes per-trial IDs, metadata, random seed and optional parameters; workspace roots are absolute local paths.
2. A predicate returns a boolean, a finite score from 0 to 1, or `{ value, passed?, explanation?, evidence? }` with JSON-serializable evidence. Without `passed`, only `value === 1` passes. Set `passed` explicitly for a threshold (for example `value >= 0.8`); do not mistake a partial score for a pass. Use clear evidence for debugging.
3. A `judge(...)` rule sends a rubric plus the current turn or trajectory to the separate judge adapter, which must emit a JSON verdict. Validate that the judge is independent from the AUT, runs in an appropriate workspace, and does not receive secrets. Judge events/prompts may contain sensitive data and incur model cost; cost is not inferred unless the adapter emits usage.
4. Normal scorers are skipped after primary execution errors unless declared with `{ supportsPartial: true }` and the required context/workspace exists. Scorer exceptions and invalid scores become recorded failures; never mask them as passes.
5. Scorers run after the AUT closes; use `node:fs/promises` to inspect candidate/evaluator files before workspace cleanup. Keep evaluator references and secrets out of AUT events, evidence, and exported reports. Reading one evaluator fixture in a trusted adapter and deliberately injecting it as an experiment treatment is valid, but measures injected context—not whether the AUT retrieved it itself.
6. Test passing, failing, and missing-output trajectories; inspect `scoring.json` (`results`, `overall`, `passed`) and run `summary.json`. `overall` is an unweighted mean of valid scores, not the pass rate. Execution `status: 'completed'` can still have failed scoring; run-level `failed` is the meaningful aggregate gate.
