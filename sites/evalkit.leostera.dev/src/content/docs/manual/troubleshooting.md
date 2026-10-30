---
title: Troubleshooting and limitations
description: Diagnose discovery, dataset, runtime, matrix, scoring, and report problems.
---

Start with a side-effect-free plan from your eval project directory: `bun run evalkit run --dry-run` (or `run --matrix <matrix-id> --dry-run`). If a run has begun, inspect the run/trial `summary.json`, `scoring.json`, and `trajectory.jsonl` in `_evalkit-results/` before changing the eval. See [Results and reports](/docs/manual/results/).

## Project loading and selection

- **“Eval directory not found”, “No eval files found”, or “Unknown eval”:** Run from the correct project root; check `testDir`, `include` and `exclude` relative to it. Default discovery needs a **default export** from `scenarios/**/*.eval.ts` or `.js` (an array is also accepted); a named export alone or a helper file does not count. A project still using `evals/` needs to move it or set `testDir: 'evals'`. Check the `id`, not the display `name`. An explicit config `registry` or `evals` list bypasses discovery. [Project structure](/docs/manual/project-structure/#automatic-discovery)
- **A scenario is in the wrong suite, or none:** its suite is the first directory below `scenarios/`; files directly in `scenarios/` have none. An explicit registry ignores directories, and `src/registry.ts` is only loaded when there is **no** config. [Suites](/docs/manual/project-structure/#suites)
- **“failed to load” for one file:** that file threw while being imported, often a missing credential. Other scenarios still run; `run` refuses to run the broken file's scenarios unless `--skip-broken`. Move credentialed work into a dataset's `onLoad` or the agent's `start()`. [Load errors](/docs/manual/project-structure/#load-errors)
- **Multiple configs found / invalid ID / duplicate ID:** Keep one `evalkit.config.ts`, `.js`, or `.mjs`, or pass `--config`. Authored IDs use lowercase kebab-case (`my-eval`, not `My Eval`, `my/eval`, or a UUID) and must be unique within their registered category. Do not use authored `uri`, `uuid`, or `slug` fields.
- **Command cannot find `evalkit` or import `@evalkit/core`:** In this monorepo, run `bun install` at the root and invoke the example's workspace script. External projects use the published `@leostera/evalkit` package and its imports, **not** internal workspace package names; see [installation](/docs/manual/project-structure/#getting-the-cli-and-api).

## Running and scoring

- **Dataset files missing or overwritten:** dataset paths are relative to the project root, not to the dataset's file, and files go below a directory named after the dataset unless `mount` says otherwise. Two datasets in one scenario cannot write the same file. `uses fixtures, which were replaced by datasets` means a 0.5 scenario still passes `fixtures`; see the [migration guide](https://github.com/leostera/evalkit/blob/main/CHANGELOG.md). [Datasets](/docs/manual/datasets/)
- **Pi exits or is missing:** The starter's `greeting` eval is provider-free; its Pi evals need an installed `pi` command and configured model access. `piAgent()` invokes `--print --no-session --no-tools` **once per message**, so it does not preserve a conversation. Pi model arguments belong in `piAgent({ args: [...] })` or Pi configuration; `--model` does not configure this adapter. [Agents under test](/docs/manual/agents/#built-in-and-custom-integrations)
- **No answer in the trajectory:** return the reply from `send()` (a string, or `{ reply }`), or emit an assistant `message` with `onEvent`. Use `output` in scorers for the final reply. [Agents](/docs/manual/agents/#implement-an-adapter)
- **`completed` run, but a failing eval or nonzero exit:** Execution status and scoring pass/fail are separate. Read `scoring.json` for `passed: false`, errors, and numeric values, then use the CLI exit status or run `summary.failed` for a gate. A score below 1 does not pass unless the predicate has `passAt` or sets `passed: true`. [Score semantics](/docs/manual/scoring-and-evals/#score-return-values)
- **Invalid score / scorer error:** Return a finite value between 0 and 1, or `skip(reason)`; `evidence` must convert to JSON (no functions, `bigint` or cycles). Predicate exceptions are captured as failed scores; other scorers can still execute. With a failed AUT, only final predicates or judges marked `supportsPartial: true` can run if a context/workspace exists. [Partial errors](/docs/manual/scoring-and-evals/#partial-execution-and-errors)
- **Missing eval `judge` / judge error:** Any inline or final `judge(...)` rule requires a separate eval-level `judge` agent; the AUT is not implicitly reused. The judge must emit a JSON verdict in `completed.output` or its assistant message. A missing/invalid verdict or failed judge session is a checkpoint execution error inline or a final scorer error. Judge usage appears only if the judge agent emits it; cost is not measured automatically. [Judges](/docs/manual/scoring-and-evals/#judge-agents)
- **Unexpected number of runs or provider charges:** Inspect `--dry-run`. A matrix has evals × choices across axes, and _each cell_ may request multiple trials. Narrow with `--eval`, `--model`/`--mode`, or `--select`; cap cells with `execution.maxCells` and set `--trials` deliberately. [CLI and matrices](/docs/manual/cli-and-matrices/)
- **Unknown matrix axis/value or `--local` failure:** A selection must match a configured axis and existing choice (with the right JSON type). `--param` cannot replace an axis selection; a forced local runtime must be declared by the AUT. Check `context.parameters` in the adapter if a selection has no effect. [Matrix selection](/docs/manual/cli-and-matrices/#matrix-definitions-and-selection)

## Dashboard and reports

- **No reports or a running entry with no details:** `dev` reads the current project's `reportDir`. A trial may still be in progress, or a process may have ended before finalizing summaries. Confirm `--config` and project root, and inspect the report tree. The dashboard lists report versions 2 to 5; it does not migrate v1 files. A run whose process is gone shows as cancelled (interrupted).
- **A dashboard matrix run asks for a single cell:** Select one eval and one value for **every** configured axis. The dashboard does not launch a whole suite with a config-backed matrix; use `run --suite` or `run --matrix` on the CLI. [Dashboard runs](/docs/manual/cli-and-matrices/#dashboard-runs-and-inspection)
- **No saved evaluator files under report artifacts:** Only the candidate workspace is snapshotted in reports. Evaluator inputs remain in the local sandbox when the CLI supplies a persistent workspace root; handle them as sensitive files. [Report privacy](/docs/manual/results/#privacy-and-retention)
- **Stale site documentation routes during local website development:** After changing Starlight integrations or route configuration, restart the Astro dev server. `/docs/` is the guide; `/docs/manual/` is the manual index.

## Current limitations

| Declared feature                                      | Current behavior                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `agent(...)` transcript step                          | Typed but not executable; inserting it into a transcript fails trial execution.                                              |
| Implicit judge agent                                  | None: supply an independent agent in the eval's `judge` field. No judge model or tool permissions are borrowed from the AUT. |
| `policy.timeoutMs` and forwarded CLI budgets/timeouts | Not enforced. Flags such as `--chat-timeout-ms` and `--max-tokens` only set adapter-visible parameters.                      |
| `agentsSdk()`                                         | Throws “not implemented yet”; the Agents SDK example is an integration sketch, not a runnable remote transport.              |
| `piAgent()` conversation and parameter selection      | One new, tool-free Pi process per message. Does not read `context.parameters` for a model or budget.                         |
| npm release                                           | Install `@leostera/evalkit` from npm; run `bunx @leostera/evalkit new ./evals` for a standalone project.                     |
| Hosted sync or automatic report versioning            | No automatic sharing, upload, or Git commit for local report/sandbox files.                                                  |

For implementation details, consult the [core API](https://github.com/leostera/evalkit/blob/main/packages/core/src/index.ts), [runner](https://github.com/leostera/evalkit/blob/main/packages/runner/src/index.ts), and [CLI project loader](https://github.com/leostera/evalkit/blob/main/packages/cli/src/project.ts).
