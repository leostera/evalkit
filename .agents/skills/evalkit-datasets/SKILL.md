---
name: evalkit-datasets
description: Add or troubleshoot EvalKit datasets and trial workspaces. Use for files and values scenarios need, expected answers kept from the agent, computed or cached inputs (onLoad/onRun), per-trial data, or dataset path failures.
---

# Add EvalKit datasets

Read `../evalkit/SKILL.md` and `../../../sites/evalkit.leostera.dev/src/content/docs/manual/datasets.md`. Check `../../../packages/core/src/dataset.ts` and `../../../packages/runner/src/datasets.ts` for current behavior.

1. Define each dataset once with `defineDataset({ id, ... })` in `datasets/<name>.dataset.ts`, and import it from every scenario that uses it: `defineEval({ datasets: [a, b], ... })`. Nothing is discovered from `datasets/`. IDs are lowercase kebab-case; a scenario may use each dataset once.
2. **Static** datasets give `files` (a directory relative to the project root, e.g. `'datasets/repo'`, or a map `{ 'path/in/workspace': 'text' | bytes | { file: 'src' } }`), `value` (any JSON-convertible value), or `valueFile` (`.json`, or `.jsonl` read as an array). Both files and a value are allowed.
3. **Computed** datasets give `onLoad({ root, signal })` instead, returning `{ files?, value? }`. It runs once per process when a trial first needs it (never at import) and is cached; a failure is not cached. `onRun(loaded, trial)` derives each trial's copy using `trial.seed`, `trial.trialIndex` or `trial.parameters`. Put expensive or credentialed work (fetching, generating) here, not at module top level.
4. Choose `visibility` deliberately. `candidate` (default): files go into the agent's workspace (`context.workspace.root`) and the value is `context.data[id]`. `evaluator`: files go into the evaluator workspace and the value is only on the scoring context. Scorers see every value as `data[id]`. Keep expected answers in evaluator datasets; never pass evaluator paths or contents to a model.
5. Files land below `mount` (default: the dataset ID; `'.'` is the workspace root). Paths may not escape the mount; two datasets in one scenario may not write the same file. Each trial gets fresh copies.
6. For a file-creating agent, inspect candidate files via `artifacts.candidate.root` in predicates and the report's `trials/<trial-id>/artifacts/candidate/`. Each trial records a digest per dataset; `evalkit compare` lists datasets whose digest changed.

Datasets never template or fan out scenarios: write one concrete scenario file per case and share the dataset. When dataset setup fails, the trial's `summary.json` and `trajectory.jsonl` record the error naming the dataset. Test the smallest scenario from the project directory.
