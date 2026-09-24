---
title: CLI and matrices
description: Select evals and suites, sweep parameter axes, inspect plans, and use the local dashboard.
---

Run the CLI **from the eval project's directory**. In this repository, `bun run evalkit ...` resolves the workspace-installed command in each example; after the consumer package is released, install `@leostera/evalkit` in your project to use the same command. Use `--config <path>` to select a config elsewhere; the config's directory becomes the project root.

## Run commands

```sh
# In examples/starter: the only provider-free eval is greeting.
bun run evalkit run-evals greeting --trials 1
bun run evalkit run-evals greeting --dry-run
bun run evalkit run-evals greeting --json
bun run evalkit serve-dashboard

# In examples/configured-matrix: both style choices use a local agent.
bun run evalkit run-matrix letter-case --dry-run
bun run evalkit run-matrix letter-case --eval case-transform --select style=upper
```

| Command                   | Selection                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run-evals [eval-id,...]` | Run all registered/discovered evals, or select comma-separated IDs/positionals or repeat `--eval <id,...>`. If a config defines a matrix, this command sweeps its selected cells too. |
| `run-matrix <matrix-id>`  | Run a configured or explicitly registered matrix, optionally filtered with `--eval` and axis flags.                                                                                   |
| `run-suite <suite-id>`    | Run the evals in an explicitly registered suite. If a project matrix is configured, uses its axes/defaults over the suite's evals; otherwise each runs once.                          |
| `serve-dashboard`         | Start the local report viewer and run launcher; `--config` selects a project.                                                                                                         |

Running every eval in the starter also starts Pi-backed examples. They need an installed/configured `pi` and can incur model costs; select `greeting` to run without a provider. A zero-config discovery project has no suites and no named project matrix. See [Project structure](/docs/manual/project-structure/) for registering those.

`--dry-run` prints a JSON plan (`matrix`, selected `evals`, cell count, axis selection, overrides, and trial override) **without creating reports, workspaces, or agent sessions**. It does not calculate the total trial count when evals have different `policy.trials`. The CLI refuses more than `execution.maxCells` cells (default **100**) unless you pass `--all`; inspect the dry run and narrow your selection before bypassing the limit. Unknown eval IDs, axes, and axis values fail before dispatch. If any executed cell fails its execution or scoring gate, the CLI exits nonzero.

## Matrix definitions and selection

A matrix is a lazy Cartesian expansion of registered evals × axis choices; it does not allocate a list of every cell up front. For a runnable provider-free example, configure `style` instead of claiming a model has been selected:

```ts
// evalkit.config.ts
import { defineConfig } from '@evalkit/core';

export default defineConfig({
  matrix: {
    id: 'letter-case',
    parameters: { style: ['lower', 'upper'] },
    defaults: { turnBudget: 6 },
  },
  execution: { concurrency: 2, maxCells: 4 },
});
```

With one discovered eval and two styles this plans **two cells**. Axis names are sorted for stable expansion; each `cellKey` is a canonical JSON key of the matrix ID, eval ID, and **effective** parameters. Defaults are merged with CLI non-axis overrides, then each axis supplies its selected value. Duplicate axis values or empty axes fail configuration; axis selections must be among the configured choices. Cell parameters and matrix provenance are written to every run/trial manifest.

```sh
bun run evalkit run-matrix letter-case --eval case-transform --dry-run
bun run evalkit run-matrix letter-case --eval case-transform --select style=upper
# model/mode have dedicated selection flags when those axes exist:
bun run evalkit run-matrix models --eval greeting --model model-a,model-b --mode with-docs
```

`--model` and `--mode` accept comma-separated values and can be repeated; they select _existing_ axes rather than adding new choices. `--select axis=value` is repeatable for other axes; its value is parsed as JSON when possible (`--select 'temperature=0.5'` selects a numeric choice). Quote shell-sensitive JSON. Without a configured matrix, one `--model` or `--mode` value becomes a plain parameter override, **not** a provider setting; multiple values require an axis. `--param name=JSON` supplies a non-axis override (e.g. `--param 'temperature=0.5'`), and trying to override a matrix axis that way fails. Axes/defaults/overrides must be finite JSON values, not functions, `undefined`, or `NaN`.

An AUT only responds to these choices if its adapter reads `context.parameters`. The [configured-matrix agent](https://github.com/leostera/evalkit/blob/main/examples/configured-matrix/agents/case-agent.ts) uses `context.parameters.style`. The built-in `piAgent()` does **not** read `model`, `maxTokens`, or other forwarded parameters; `piAgent({ args: [...] })` configures its Pi invocation separately.

## Execution options

| Flag                                                             | Effect                                                                                                                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--concurrency <n>`                                              | Maximum concurrent **cells** for CLI matrix runs; default is `execution.concurrency` or 4. Trials within one CLI cell run with concurrency 1.                                     |
| `--trials <n>`                                                   | Override `execution.trials` and each eval's `policy.trials` for this invocation. Otherwise `execution.trials` overrides the policy; absent both, the policy or one trial applies. |
| `--local`                                                        | Require a declared `local` AUT runtime rather than auto-selecting the first declared runtime (`local`, then `remote`, then `sandbox`).                                            |
| `--max-tokens <n>`, `--turn-budget <n>`, `--chat-timeout-ms <n>` | Positive-integer values forwarded as `maxTokens`, `turnBudget`, `chatTimeoutMs` in `context.parameters`. Evalkit does **not** enforce these budgets/timeouts.                     |
| `--json`                                                         | Print one JSON object **per completed cell** containing the cell key, eval ID, effective parameters, and run result; not a single JSON array.                                     |
| `--config <file>`, `--dry-run`, `--all`                          | Choose a config, inspect a no-execution plan, or lift the cell-count limit.                                                                                                       |

CLI flags expecting positive integers reject zero, fractions, and negative numbers. Cell count does **not** include trial repetitions; a plan of two cells at ten trials per eval can perform twenty trials. Factor that into provider costs and rate limits. `--local` does not magically run a remote-only adapter locally; it fails if `local` is undeclared.

## Dashboard runs and inspection

`bun run evalkit serve-dashboard` serves the bundled local UI (default `http://localhost:4317`). Set `PORT=4318` to choose another port or `EVALKIT_NO_OPEN=1` to prevent its best-effort browser launch. Use the dashboard to browse cataloged suites/evals/agents/fixtures, launch runs, and inspect trials, scores, trajectories, and candidate files from [local reports](/docs/manual/results/).

With a config-backed matrix, the dashboard asks for **one eval and one configured value for every axis** and starts **one cell** per request. It does not launch an entire suite under that matrix; use the CLI to sweep or run the suite. It rejects a second matrix cell while one is in flight. Without a config-backed matrix it can launch a single eval or an explicit suite, but does not accept custom parameter overrides in the UI. `serve-dashboard` reads the same project and report directory as CLI runs; it is a local server, not a hosted synchronization service.
