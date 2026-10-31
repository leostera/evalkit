---
title: CLI and matrices
description: Select scenarios and suites, sweep parameter axes, report to CI, compare against a base, and use the dashboard.
---

Run the CLI **from the eval project's directory**. In this repository, `bun run evalkit ...` resolves the workspace-installed command in each example; a generated project installs `@leostera/evalkit` from npm and uses the same command. Use `--config <path>` to select a config elsewhere; the config's directory becomes the project root.

## Run commands

```sh
# In examples/starter: the only provider-free scenario is greeting.
bun run evalkit run greeting --trials 1
bun run evalkit run greeting --dry-run
bun run evalkit run greeting --json
bun run evalkit dev
bun run evalkit build

# In examples/configured-matrix: both style choices use a local agent.
bun run evalkit run --matrix letter-case --dry-run
bun run evalkit run --matrix letter-case --eval case-transform --select style=upper
# A suite: every scenario in one directory below scenarios/.
bun run evalkit run --suite billing
```

| Command             | Selection                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `new <directory>`   | Generate a provider-free project with `bunx @leostera/evalkit new ./agent-evals`, or initialize an existing Bun project with `bun run evalkit new .` after `bun add @leostera/evalkit`. Never overwrites existing files. |
| `run [eval-id,...]` | Run all discovered/registered evals or select IDs by position or `--eval`. Use `--matrix <id>` for a named matrix and `--suite <id>` for a suite. These selectors are mutually exclusive.                                |
| `dev`               | Start the local dashboard and run launcher; `--config` selects a project.                                                                                                                                                |
| `build`             | Write a read-only static dashboard snapshot to `_evalkit-dashboard/` (or `--out <dir>`). See [Sharing a static snapshot](#sharing-a-static-snapshot).                                                                    |
| `tidy`              | Mark runs of evals that are no longer in the project as archived. See [Archiving removed evals](#archiving-removed-evals).                                                                                               |
| `compare`           | Compare this commit's results with a base commit's. See [Comparing against a base](#comparing-against-a-base).                                                                                                           |
| `share`             | Upload results for the current commit to your share server and print the URL. `share serve` runs a share server locally. See [Sharing results](#sharing-results).                                                        |

Running every eval in the starter also starts Pi-backed examples. They need an installed/configured `pi` and can incur model costs; select `greeting` to run without a provider. Suites come from directories below `scenarios/`; see [Project structure](/docs/manual/project-structure/#suites).

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
| `--junit <file>`                                                 | Write a JUnit XML report with one test case per scenario and matrix cell. See [Running in CI](#running-in-ci).                                                                    |
| `--skip-broken`                                                  | Run the healthy scenarios when some files fail to load, then exit 1. See [load errors](/docs/manual/project-structure/#load-errors).                                              |
| `--config <file>`, `--dry-run`, `--all`                          | Choose a config, inspect a no-execution plan, or lift the cell-count limit.                                                                                                       |

CLI flags expecting positive integers reject zero, fractions, and negative numbers. Cell count does **not** include trial repetitions; a plan of two cells at ten trials per eval can perform twenty trials. Factor that into provider costs and rate limits. `--local` does not magically run a remote-only adapter locally; it fails if `local` is undeclared.

## Comparing an intervention against a baseline

Use a matrix axis for a controlled comparison such as memory off/on. Keep the scenario and model fixed, and make the AUT read only the treatment parameter. For a saved-memory dataset, the adapter can inject that content only when `memory === 'on'`; this measures whether the content helps when supplied, not whether the agent can retrieve it through MCP.

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

## Running in CI

`evalkit run` reports per scenario and matrix cell, with the reason for each failure on the same line (for example `correct 0.0 (passes at 0.5)`). On a terminal, failures print as they happen below a live progress line; elsewhere, such as in CI, every finished scenario prints one plain line. One summary of passed, failed and cancelled scenarios ends the run. It exits 1 when any scenario fails or a selected file failed to load, and 130 when cancelled.

```sh
bun run evalkit run --junit _evalkit-results/junit.xml
```

`--junit <file>` writes one JUnit test case per scenario and matrix cell, grouped by suite, so CI systems show failures as test results. Upload the file as a test report artifact.

Ctrl+C (or `SIGINT` from CI) cancels a run cleanly: running trials are stopped, their runs are saved as `cancelled`, and the summary and JUnit file are still written. A second Ctrl+C exits at once; those runs are shown as cancelled (interrupted) later. Cancelled runs never count as failures and are never shared.

## Comparing against a base

`evalkit compare` compares the current commit's results with a base commit's, for merge request gates and comments. Scenarios are matched by ID and parameters, using the latest finished run of each.

```sh
# Base results from the share server, by branch, tag or commit:
bun run evalkit compare --base main
# Or from a directory of results, such as a CI artifact from the base pipeline:
bun run evalkit compare --base-dir base-results/_evalkit-results
# Gate and comment:
bun run evalkit compare --base main --fail-on regression --markdown compare.md
```

Each scenario is **regressed** (passed on base, failed now), **fixed**, **new**, **removed**, **unchanged**, or **not comparable** (cancelled, errored, or scored by a different set of scorers). Per suite, the output shows the mean of each scorer on both sides, and it lists datasets whose [digests](/docs/manual/datasets/#digests) changed, so a score change can be read against changed inputs.

| Flag                               | Effect                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--base <ref>`, `--base-dir <dir>` | Where the base results come from. Give exactly one.                                                  |
| `--fail-on regression`             | Exit 1 when any scenario regressed. Default: never fail.                                             |
| `--fail-on score-drop=0.05`        | Also exit 1 when a scorer's mean drops by more than the given amount. Repeat `--fail-on` to combine. |
| `--markdown <file>`                | Write the comparison as Markdown for a merge request comment.                                        |
| `--json`                           | Print the comparison as JSON.                                                                        |
| `--require-base`                   | Exit 1 when the base has no results. By default `compare` says so and exits 0.                       |
| `--allow-dirty`                    | Include this commit's runs made with uncommitted changes.                                            |

## Dashboard runs and inspection

`bun run evalkit dev` serves the bundled local UI on `http://localhost:4317`, or the next free port when that one is taken (so several projects can run at once); it prints the address it chose. Set `PORT` to require a specific port or `EVALKIT_NO_OPEN=1` to prevent its best-effort browser launch. The sidebar has two groups. **Evals** holds results: the **Scoreboard** (one row per scenario and matrix cell with its latest result, recent history and pass rate, coloured green, yellow and red), and **Runs**, **Trials** and **Workspaces**, which share one set of filters kept in the URL. A run page lists its trials; a trial page shows its trajectory beside its scores, datasets and artifacts; its workspace page browses the files the agent left. **Library** holds what scenarios are built from: **Agents**, **Judges**, **Scenarios** and **Datasets**, each with a page showing how it is defined, where (file and line), and which scenarios use it. A static dataset's page browses its files. Every page has a stable URL (`/scoreboard`, `/runs/:id`, `/runs/:id/trials/:id`, `…/workspace`, `/library/scenarios/:id`, `/library/datasets/:id`), and the header shows the repository and commit being viewed. Data comes from [local reports](/docs/manual/results/). The terminal logs each run launched from the dashboard with its pass/fail result, trial count, duration, and report path. Reports written by an older EvalKit report format are hidden and counted rather than breaking the run list.

The CLI prints its own summaries and hides the runner's structured info logs. Set `EVALKIT_LOG_LEVEL=info` (or `debug`) to show them for `run`, `dev`, and dashboard-launched runs.

With an unconstrained config-backed matrix, the dashboard asks for **one eval and one configured value for every axis** and starts **one cell** per request. For matrices with `cases` or `exclude`, the dashboard lists only eligible cells through a bounded, server-backed view; you can search, sort, page, and launch one cell at a time. It rejects excluded or invalid one-cell submissions. For selections above 100,000 eligible cells, narrow the matrix using the CLI; the dashboard does not scan unbounded plans. It does not launch an entire suite under a matrix; use the CLI to sweep or run the suite. It rejects a second matrix cell while one is in flight. Without a config-backed matrix it can launch a single eval or an explicit suite, but does not accept custom parameter overrides in the UI. `dev` reads the same project and report directory as CLI runs; it is a local server, not a hosted synchronization service.

To work on the dashboard UI itself, start `bun run evalkit dev` in an example project, then run `bun run dev` in `packages/dashboard/`. Vite hot-reloads the UI and proxies `/v1` requests to the running API (set `EVALKIT_API_PORT` if `dev` printed a port other than 4317).

## Sharing a static snapshot

`bun run evalkit build` writes a read-only copy of the dashboard and the project's current local reports to `_evalkit-dashboard/` (choose another directory with `--out`). It includes the catalog, runs, trials, scores, checkpoints, trajectories, and each trial's **candidate** artifact snapshot. It never copies `_evalkit-sandbox/` or evaluator workspaces. Runs of evals archived by [`evalkit tidy`](#archiving-removed-evals) are left out. Runs cannot be started from a snapshot.

Before building, `build` asks whether to run the evals first so the snapshot has fresh results. With no current results it runs them without asking. Pass `--run` to always run them first or `--no-run` to use existing results; without a terminal to answer (CI, pipes) it uses existing results. Failing evals do not stop the build; their results are included.

The snapshot uses clean URLs such as `/runs/<id>`: it writes one small page per known route (`runs/<id>.html`, `trials/<id>.html`, and so on), each with a relative `<base href>`. Any static host that serves `/x` from `x.html` works under any mount path without SPA rewrite rules: `bunx serve _evalkit-dashboard`, Workers Static Assets, Cloudflare Pages, and GitHub Pages all do this. Opening `index.html` directly from disk does not work, because browsers block `fetch()` from `file://` pages.

Rebuilding replaces a directory that `evalkit build` created earlier; the command refuses to overwrite any other non-empty directory. A snapshot is not filtered or redacted: user and assistant messages, tool arguments and results, scorer evidence, judge events, and candidate files are all included. Review it, or build from a report directory that contains only the runs you intend to publish, before sharing it.

## Sharing results

Every run records which commit produced it: the repository, the eval project's path inside it, the commit SHA, the branch, and whether there were uncommitted changes. In CI it reads GitLab or GitHub variables, otherwise it asks git. `evalkit run` prints it (`Running 2 cell(s) from default at 3a01fda (main)`). Results are only tagged with the commit. They never go into your repository.

`evalkit share` uploads the results for the current commit to a share server that your team runs, then prints where to see them:

```sh
bun run evalkit run
bun run evalkit share
#   ✓ Source     gitlab.example.com/team/evals @ 3a01fda (main)
#   ✓ Runs       4 runs to share
#   ✓ Uploading  4 new · 0 already shared · 1.2 MB
#   ➜  https://evals.example.com/gitlab.example.com/team/evals/-/3a01fda7c2…
```

Point the project at the server in `evalkit.config.ts`, or set `EVALKIT_SHARE_URL` (useful in CI):

```ts
export default defineConfig({ share: { url: 'https://evals.example.com' } });
```

- **Which runs:** finished runs at the current commit. Runs made with uncommitted changes are skipped unless you pass `--allow-dirty`, and they are then labelled and left out of the commit's pass rate. `--all` also uploads runs from other commits. Untracked runs (no git) and archived runs are never uploaded.
- **What is uploaded:** the same data as `evalkit build`: run summaries, scores, checkpoints, trajectories, and candidate workspace files. Evaluator workspaces are never uploaded. `--no-workspace` leaves out candidate file contents and keeps their listing.
- **Safe to repeat:** uploading a run again does nothing, so rerunning `share` after a failure only sends what's missing. Concurrent CI jobs for the same commit don't interfere.

On the server, `/<repo>` opens the latest commit, `/<repo>/-/<branch>` opens the latest commit on that branch, and a version picker in the header switches between commits. An eval project inside a larger repository gets its own address, `/<repo>/~<path>`.

### Behind an auth proxy

If something sits in front of the share server, such as Cloudflare Access, give `evalkit share` the headers it needs with `share.headers`. It can be an object or a function, sync or async. The function is called once per `evalkit share` and can run a command to fetch a token. Header values are never printed. EvalKit itself knows nothing about the proxy: if the server redirects or answers with something other than JSON, `share` stops and says so.

```ts
// evalkit.config.ts
import { defineConfig } from '@leostera/evalkit';
import { getCloudflareAccessTokenHeaders } from './cloudflare-access-token.js';

const url = 'https://evals.example.com';

export default defineConfig({
  share: { url, headers: () => getCloudflareAccessTokenHeaders(url) },
});
```

Here `cloudflare-access-token.js` is your own helper. For Access, it can return `CF-Access-Client-Id` and `CF-Access-Client-Secret` from a service token in CI, and otherwise `cf-access-token` from `cloudflared access token -app=<url>`. Use `node:child_process` rather than runtime-specific APIs so the config stays portable.

### Running a share server

The share server is a small Worker: a JSON API plus the same dashboard. It keeps files in R2 and an index of repositories, commits and runs in a SQLite Durable Object. It has **no authentication**, so deploy it on a private network (for example, behind Cloudflare Access).

```ts
// worker.ts, in a directory with @leostera/evalkit installed
export { default, ShareIndex } from '@leostera/evalkit/share/worker';
```

```jsonc
// wrangler.jsonc
{
  "name": "evalkit-share",
  "main": "worker.ts",
  "compatibility_date": "2025-04-01",
  "assets": {
    "directory": "node_modules/@leostera/evalkit/dist/dashboard",
    "binding": "ASSETS",
    "run_worker_first": ["/*", "!/assets/*"],
  },
  "r2_buckets": [{ "binding": "RESULTS", "bucket_name": "evalkit-share" }],
  "durable_objects": {
    "bindings": [{ "name": "INDEX", "class_name": "ShareIndex" }],
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["ShareIndex"] }],
}
```

Create the bucket (`npx wrangler r2 bucket create evalkit-share`), then run `npx wrangler deploy`. The index can always be rebuilt from R2 with `POST /api/v1/reindex`.

To try it without Cloudflare, `bun run evalkit share serve` runs the same server on port 4318, storing everything in `_evalkit-share/` (`--dir`, `--port`).

## Archiving removed evals

`bun run evalkit tidy` compares saved runs with the evals the project defines today (standalone, in suites, or only in matrices). Runs of evals that no longer exist are marked **archived** by writing `archived.json` into the run directory; nothing is deleted. Archived runs are hidden in `evalkit dev` (turn on **Show archived** in the runs filters) and left out of `evalkit build`. Running `tidy` again after an eval returns restores its runs; delete `archived.json` to restore a single run by hand.
