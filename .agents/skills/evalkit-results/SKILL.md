---
name: evalkit-results
description: Run Evalkit locally and interpret or process evaluation results. Use for the CLI, dashboard, JSONL trajectories, trial artifacts, aggregate scores, failures, CI gates, or report retention.
---

# Run and process Evalkit results

Read `../evalkit/SKILL.md` and `../../../www/src/content/manual.md` (Start with the example, Run from the CLI, Read and process results). Verify report semantics in `../../../packages/runner/src/index.ts`, `../../../packages/runner/src/local-report-store.ts`, and `../../../packages/cli/src/index.ts` before automation.

1. Run from the project root containing `src/registry.ts` or `evals/*.eval.ts` (e.g. `cd examples/starter`), not this skill directory. Start with `bun run evalkit run-evals <eval-id>`; run all evals only when intended (Pi-backed evals can cost tokens). `bun run evalkit run-suite <suite-id>`, `bun run evalkit run-matrix <matrix-id>`, and `bun run evalkit serve-dashboard` are also available. Set `EVALKIT_NO_OPEN=1` or `PORT=...` for dashboard behavior. `--concurrency` bounds cell parallelism.
2. Each `_evalkit-results/<run-uuid>/` has `manifest.json`, `summary.json`, and `trials/<trial-uuid>/{manifest.json,trajectory.jsonl,scoring.json,summary.json,artifacts/candidate/...}`. `trajectory.jsonl` contains one JSON event per line; filter by `source` and `kind`. `scoring.json` records scorer values/explanations/errors; candidate snapshot files are report artifacts.
3. Read run `summary.json` fields `passed`, `failed`, `trialCount` for success rates. Trial `status: 'completed'` means execution finished, **not** that its scorers passed. `scoring.overall` is an unweighted mean of valid values, not a pass rate. For CI, use `jq -e '.failed == 0 and .trialCount > 0' "_evalkit-results/<run-uuid>/summary.json"` after replacing the placeholder; CLI exits nonzero when a matrix cell fails; the report supplies trial-level detail.
4. `--json` prints one result per trial including `measurements`, but Effect logs also appear on stdout, so do not parse raw stdout as pure JSONL; filter JSON lines or read saved reports. Turn latency and token usage are only populated if an adapter emitted them.
5. The dashboard can start runs and inspect events, scoring, and candidate files. `_evalkit-sandbox/<trial-uuid>/{candidate,evaluator}/` retains **both** local workspaces; evaluator secrets can live there. Treat reports and sandboxes as sensitive, apply Git ignore/retention rules, and don't share raw data without review. They may be deleted after inspection.
