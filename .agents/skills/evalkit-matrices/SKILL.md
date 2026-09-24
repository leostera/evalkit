---
name: evalkit-matrices
description: Configure, run, or debug Evalkit parameter matrices and model sweeps. Use for matrix axes, defaults, eval ID filtering, CLI overrides, or making agents consume per-cell parameters.
---

# Configure an Evalkit matrix

Read `../evalkit/SKILL.md`, `../../../www/src/content/docs/manual/project-structure.md` and `../../../www/src/content/docs/manual/cli-and-matrices.md`, the runnable `../../../examples/configured-matrix/`, `../../../packages/core/src/matrix.ts`, `../../../packages/cli/src/run-command.ts`, and `../../../packages/runner/src/matrix.ts`.

1. In a discovery-based project, default-export each eval from `evals/*.eval.ts` and configure `defineConfig({ matrix: { id: 'models', parameters: { model: ['a', 'b'] }, defaults? }, execution: { maxCells: 100 } })` in `evalkit.config.js`. The CLI loads the config and attaches all discovered evals. For an explicit registry instead, create `defineEvalMatrix({ id: 'models', evals: [myEval], parameters: { model: ['a', 'b'] }, defaults? })`. Axes must have JSON-serializable choices; `cells()` lazily expands the Cartesian product per eval.
2. For an explicit registry, register the matrix with `registerEvals([myEval, matrix])` (or register `myEval` via a suite): a matrix **does not** register its evals for normal `run-evals`. Do not register an eval twice outside matrices. Use eval IDs with `--eval`.
3. In the AUT adapter read `context.parameters` and apply the values. Cells merge `defaults`, then selected axis values; `--model`, `--mode`, or `--select axis=value` **select** declared axis choices, while `--param` and budget flags override non-axis parameters. You cannot override an axis with `--param`. The built-in `piAgent()` currently ignores these parameters: using it unchanged does **not** compare different models.
4. Run from the eval project: `bun run evalkit run-matrix <matrix-id> --eval <eval-id> --dry-run` before dispatch; then remove `--dry-run`, optionally narrow with `--model model-a` or `--concurrency 4`. Plans exceeding `execution.maxCells` (default 100) require `--all`. `--eval` is a filter, not a matrix axis. Matrix cell keys and effective parameters are persisted in report manifests.
5. Compare trial scores/pass counts across runs in `_evalkit-results`; verify that the AUT really applied the axis values before interpreting differences. Read `../evalkit-results/SKILL.md` for processing reports.
