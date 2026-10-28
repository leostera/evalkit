---
title: CLI and matrices
description: Select evals and suites, sweep parameter axes, inspect plans, and use the local dashboard.
---

Run the CLI **from the eval project's directory**. In this repository, `bun run evalkit ...` resolves the workspace-installed command in each example; a generated project installs `@leostera/evalkit` from npm and uses the same command. Use `--config <path>` to select a config elsewhere; the config's directory becomes the project root.

## Run commands

```sh
# In examples/starter: the only provider-free eval is greeting.
bun run evalkit run greeting --trials 1
bun run evalkit run greeting --dry-run
bun run evalkit run greeting --json
bun run evalkit dev
bun run evalkit build

# In examples/configured-matrix: both style choices use a local agent.
bun run evalkit run --matrix letter-case --dry-run
bun run evalkit run --matrix letter-case --eval case-transform --select style=upper
# With an explicitly registered suite:
bun run evalkit run --suite conversation-basics
```

| Command             | Selection                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `new <directory>`   | Generate a provider-free project with `bunx @leostera/evalkit new ./evals`, or initialize an existing Bun project with `bun run evalkit new .` after `bun add @leostera/evalkit`. Never overwrites existing evals. |
| `run [eval-id,...]` | Run all discovered/registered evals or select IDs by position or `--eval`. Use `--matrix <id>` for a named matrix and `--suite <id>` for a registered suite. These selectors are mutually exclusive.               |
| `dev`               | Start the local dashboard and run launcher; `--config` selects a project.                                                                                                                                          |
| `build`             | Write a read-only static dashboard snapshot to `_evalkit-dashboard/` (or `--out <dir>`). See [Sharing a static snapshot](#sharing-a-static-snapshot).                                                              |

Running every eval in the starter also starts Pi-backed examples. They need an installed/configured `pi` and can incur model costs; select `greeting` to run without a provider. A zero-config discovery project has no suites and no named project matrix. See [Project structure](/docs/manual/project-structure/) for registering those.

`--dry-run` prints a JSON plan (`matrix`, selected `evals`, cell count, axis selection, overrides, and trial override) **without creating reports, workspaces, or agent sessions**. It does not calculate the total trial count when evals have different `policy.trials`. The CLI refuses more than `execution.maxCells` cells (default **100**) unless you pass `--all`; inspect the dry run and narrow your selection before bypassing the limit. Unknown eval IDs, axes, and axis values fail before dispatch. If any executed cell fails its execution or scoring gate, the CLI exits nonzero.

## Matrix definitions and selection

A matrix lazily expands registered evals across declared choices. Independent axes form a Cartesian product; optional correlated `cases` and partial `exclude` patterns restrict it to eligible cells without scheduling invalid combinations. For a runnable provider-free example, configure `style` instead of claiming a model has been selected:

```ts
// evalkit.config.ts
import { defineConfig } from '@leostera/evalkit';

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

To avoid combinations you cannot run, add a partial exclusion: `exclude: [{ os: 'windows', arch: 'arm64' }]` removes Windows ARM across every other axis. To correlate choices, use `cases: [{ language: 'ruby', framework: 'rails' }, { language: 'go', framework: 'gin' }]`; each complete case crosses with the independent `parameters` axes. Case keys must be consistent, must not overlap axis or default keys, and can be selected with `--select language=ruby`. Exclusions match declared dimensions, not non-axis overrides. `--dry-run` and `maxCells` count only eligible cells; selecting an excluded combination produces a zero-cell error. For details and future comparison work, see [RFD0005](https://github.com/leostera/evalkit/blob/main/docs/rfds/RFD0005-constrained-matrices-and-comparisons.md).

```sh
bun run evalkit run --matrix letter-case --eval case-transform --dry-run
bun run evalkit run --matrix letter-case --eval case-transform --select style=upper
# model/mode have dedicated selection flags when those axes exist:
bun run evalkit run --matrix models --eval greeting --model model-a,model-b --mode with-docs
```

`--model` and `--mode` accept comma-separated values and can be repeated; they select _existing_ axes rather than adding new choices. `--select axis=value` is repeatable for other axes; its value is parsed as JSON when possible (`--select 'temperature=0.5'` selects a numeric choice). Quote shell-sensitive JSON. Without a configured matrix, one `--model` or `--mode` value becomes a plain parameter override, **not** a provider setting; multiple values require an axis. `--param name=JSON` supplies a non-axis override (e.g. `--param 'temperature=0.5'`), and trying to override a matrix axis that way fails. Axes/defaults/overrides must be finite JSON values, not functions, `undefined`, or `NaN`.

An AUT only responds to these choices if its adapter reads `context.parameters`. The [configured-matrix agent](https://github.com/leostera/evalkit/blob/main/examples/configured-matrix/agents/case-agent.ts) uses `context.parameters.style`. The built-in `piAgent()` does **not** read `model`, `maxTokens`, or other forwarded parameters; `piAgent({ args: [...] })` configures its Pi invocation separately.

## Execution options

| Flag                                                             | Effect                                                                                                                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--concurrency <n>`                                              | Maximum concurrent **cells** for CLI matrix runs; default is `execution.concurrency` or 4. Trials within one CLI cell run with concurrency 1.                                     |
| `--trials <n>`                                                   | Override `execution.trials` and each eval's `policy.trials` for this invocation. Otherwise `execution.trials` overrides the policy; absent both, the policy or one trial applies. |
| `--local`                                                        | Require a declared `local` AUT runtime rather than auto-selecting the first declared runtime (`local`, then `remote`, then `sandbox`).                                            |
| `--max-tokens <n>`, `--turn-budget <n>`, `--chat-timeout-ms <n>` | Positive-integer values forwarded as `maxTokens`, `turnBudget`, `chatTimeoutMs` in `context.parameters`. EvalKit does **not** enforce these budgets/timeouts.                     |
| `--json`                                                         | Print one JSON object **per completed cell** containing the cell key, eval ID, effective parameters, and run result; not a single JSON array.                                     |
| `--config <file>`, `--dry-run`, `--all`                          | Choose a config, inspect a no-execution plan, or lift the cell-count limit.                                                                                                       |

CLI flags expecting positive integers reject zero, fractions, and negative numbers. Cell count does **not** include trial repetitions; a plan of two cells at ten trials per eval can perform twenty trials. Factor that into provider costs and rate limits. `--local` does not magically run a remote-only adapter locally; it fails if `local` is undeclared.

## Comparing an intervention against a baseline

Use a matrix axis for a controlled comparison such as memory off/on. Keep the eval task and model fixed, and make the AUT read only the treatment parameter. For a saved-memory fixture, the adapter can inject that content only when `memory === 'on'`; this measures whether the content helps when supplied, not whether the agent can retrieve it through MCP.

```ts
// evalkit.config.ts
import { defineConfig } from '@leostera/evalkit';

export default defineConfig({
  matrix: {
    id: 'memory-ablation',
    parameters: { memory: ['off', 'on'] },
  },
  execution: { trials: 3, concurrency: 1 },
});
```

First inspect the planned cells without invoking the agent, then run just the experiment:

```sh
bun run evalkit run --matrix memory-ablation --dry-run
bun run evalkit run --matrix memory-ablation --local
```

Use the same prompt, model, and other settings in both conditions. Add a negative control where irrelevant memory is present, and score both task success and undesirable side effects. Repeat trials and inspect every cell's run summary and trial scores; a three-trial pilot is directional, not evidence of statistical significance. EvalKit only records provider cost, latency, or token counts when the adapter emits those measurements. For a live MCP retrieval study, use a tool-enabled custom AUT that records actual tool events; the built-in `piAgent()` disables tools. See [agents under test](/docs/manual/agents/#evaluating-tool-assisted-agents).

## Dashboard runs and inspection

`bun run evalkit dev` serves the bundled local UI (default `http://localhost:4317`). Set `PORT=4318` to choose another port or `EVALKIT_NO_OPEN=1` to prevent its best-effort browser launch. Use the dashboard to browse cataloged suites/evals/agents/fixtures, launch runs, and inspect trials, scores, trajectories, and candidate files from [local reports](/docs/manual/results/). The terminal logs each run launched from the dashboard with its pass/fail result, trial count, duration, and report path. Reports written by an older EvalKit report format are hidden and counted rather than breaking the run list.

The CLI prints its own summaries and hides the runner's structured info logs. Set `EVALKIT_LOG_LEVEL=info` (or `debug`) to show them for `run`, `dev`, and dashboard-launched runs.

With an unconstrained config-backed matrix, the dashboard asks for **one eval and one configured value for every axis** and starts **one cell** per request. For matrices with `cases` or `exclude`, the dashboard lists only eligible cells through a bounded, server-backed view; you can search, sort, page, and launch one cell at a time. It rejects excluded or invalid one-cell submissions. For selections above 100,000 eligible cells, narrow the matrix using the CLI; the dashboard does not scan unbounded plans. It does not launch an entire suite under a matrix; use the CLI to sweep or run the suite. It rejects a second matrix cell while one is in flight. Without a config-backed matrix it can launch a single eval or an explicit suite, but does not accept custom parameter overrides in the UI. `dev` reads the same project and report directory as CLI runs; it is a local server, not a hosted synchronization service.

To work on the dashboard UI itself, start `bun run evalkit dev` in an example project, then run `bun run dev` in `packages/dashboard/`. Vite hot-reloads the UI and proxies `/v1` requests to the running API (set `EVALKIT_API_PORT` if it is not on 4317).

## Sharing a static snapshot

`bun run evalkit build` writes a read-only copy of the dashboard and the project's current local reports to `_evalkit-dashboard/` (choose another directory with `--out`). It includes the catalog, runs, trials, scores, checkpoints, trajectories, and each trial's **candidate** artifact snapshot. It never copies `_evalkit-sandbox/` or evaluator workspaces. Runs cannot be started from a snapshot; it uses hash URLs and relative asset paths, so you can host it under any path on a static file server (`bunx serve _evalkit-dashboard`, Workers Static Assets, GitHub Pages, and so on). Opening `index.html` directly from disk does not work, because browsers block `fetch()` from `file://` pages.

Rebuilding replaces a directory that `evalkit build` created earlier; the command refuses to overwrite any other non-empty directory. A snapshot is not filtered or redacted: user and assistant messages, tool arguments and results, scorer evidence, judge events, and candidate files are all included. Review it, or build from a report directory that contains only the runs you intend to publish, before sharing it.
