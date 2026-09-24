---
title: Troubleshooting and limitations
description: Diagnose discovery, fixture, runtime, matrix, scoring, and report problems.
---

Start with a side-effect-free plan from your eval project directory: `bun run evalkit run-evals --dry-run` (or `run-matrix <matrix-id> --dry-run`). If a run has begun, inspect the run/trial `summary.json`, `scoring.json`, and `trajectory.jsonl` in `_evalkit-results/` before changing the eval. See [Results and reports](/docs/manual/results/).

## Project loading and selection

- **“Eval directory not found”, “No eval files found”, or “Unknown eval”:** Run from the correct project root; check `testDir`, `include` and `exclude` relative to it. Default discovery needs a **default export** from `evals/**/*.eval.ts` or `.js` (an array is also accepted); a named export alone or a helper file does not count. Check the `id`, not the display `name`. An explicit config `registry` or `evals` list bypasses discovery. [Project structure](/docs/manual/project-structure/#automatic-discovery)
- **A suite vanished when a config was added:** `src/registry.ts` is implicitly loaded only when there is **no** config; import it and set `registry` in the config. Register an eval either standalone or inside its suite, not both. [Suites](/docs/manual/project-structure/#authoring-ids-and-suites)
- **Multiple configs found / invalid ID / duplicate ID:** Keep one `evalkit.config.ts`, `.js`, or `.mjs`, or pass `--config`. Authored IDs use lowercase kebab-case (`my-eval`, not `My Eval`, `my/eval`, or a UUID) and must be unique within their registered category. Do not use authored `uri`, `uuid`, or `slug` fields.
- **Command cannot find `evalkit` or import `@evalkit/core`:** In this monorepo, run `bun install` at the root and invoke the example's workspace script. External projects use the prepared `@leostera/evalkit` package and its imports, **not** internal workspace package names. The first GitHub Packages release has not yet been published; see [installation state](/docs/manual/project-structure/#getting-the-cli-and-api).

## Running and scoring

- **Fixture source missing / destination conflict:** `src` is relative to the CLI project root, not to the eval file; `dst` must stay within the candidate/evaluator workspace. Check duplicate destinations for the **same visibility**, including results of `dynamic(...)`. Candidate symlinks or unsupported entries also cause report snapshot failure. [Fixtures](/docs/manual/fixtures/)
- **Pi exits or is missing:** The starter's `greeting` eval is provider-free; its Pi evals need an installed `pi` command and configured model access. `piAgent()` invokes `--print --no-session --no-tools` **once per message**, so it does not preserve a conversation. Pi model arguments belong in `piAgent({ args: [...] })` or Pi configuration; `--model` does not configure this adapter. [Agents under test](/docs/manual/agents/#built-in-and-custom-integrations)
- **No answer in the trajectory, despite a returned value from `send()`:** Emit an AUT `message` with `role: 'assistant'`, JSON `content`, and `timestamp` using `onEvent`. The session's return value is ignored. Filter for `source: 'aut'` in scorers. [Events](/docs/manual/agents/#events-and-the-recorded-trajectory)
- **`completed` run, but a failing eval or nonzero exit:** Execution status and scoring pass/fail are separate. Read `scoring.json` for `passed: false`, errors, and numeric values, then use run `summary.failed` for a gate. A score below 1 does not pass unless your predicate explicitly sets `passed: true`. [Score semantics](/docs/manual/scoring-and-evals/#score-return-values)
- **Invalid score / scorer error:** Return a finite value between 0 and 1; `evidence` must be JSON-serializable. Predicate exceptions are captured as failed scores; other scorers can still execute. With a failed AUT, only predicates marked `supportsPartial: true` can run if a context/workspace exists. [Partial errors](/docs/manual/scoring-and-evals/#partial-execution-and-errors)
- **Unexpected number of runs or provider charges:** Inspect `--dry-run`. A matrix has evals × choices across axes, and _each cell_ may request multiple trials. Narrow with `--eval`, `--model`/`--mode`, or `--select`; cap cells with `execution.maxCells` and set `--trials` deliberately. [CLI and matrices](/docs/manual/cli-and-matrices/)
- **Unknown matrix axis/value or `--local` failure:** A selection must match a configured axis and existing choice (with the right JSON type). `--param` cannot replace an axis selection; a forced local runtime must be declared by the AUT. Check `context.parameters` in the adapter if a selection has no effect. [Matrix selection](/docs/manual/cli-and-matrices/#matrix-definitions-and-selection)

## Dashboard and reports

- **No reports or a running entry with no details:** `serve-dashboard` reads the current project's `reportDir`. A trial may still be in progress, or a process may have ended before finalizing summaries. Confirm `--config` and project root, and inspect the report tree. The dashboard only lists compatible v2 manifests; it does not migrate v1 files.
- **A dashboard matrix run asks for a single cell:** Select one eval and one value for **every** configured axis. The dashboard does not launch a whole suite with a config-backed matrix; use `run-suite` or `run-matrix` on the CLI. [Dashboard runs](/docs/manual/cli-and-matrices/#dashboard-runs-and-inspection)
- **No saved evaluator files under report artifacts:** Only the candidate workspace is snapshotted in reports. Evaluator inputs remain in the local sandbox when the CLI supplies a persistent workspace root; handle them as sensitive files. [Report privacy](/docs/manual/results/#privacy-and-retention)
- **Stale site documentation routes during local website development:** After changing Starlight integrations or route configuration, restart the Astro dev server. `/docs/` is the guide; `/docs/manual/` is the manual index.

## Current limitations

| Declared feature                                      | Current behavior                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent(...)` and `judge(...)` transcript steps        | Typed but not executable; a non-`user` step fails trial execution.                                                                                              |
| `judgeScorer(...)`                                    | Declared but not implemented; attempting to score it records an error. Use `predicate(...)`.                                                                    |
| `policy.timeoutMs` and forwarded CLI budgets/timeouts | Not enforced. Flags such as `--chat-timeout-ms` and `--max-tokens` only set adapter-visible parameters.                                                         |
| `agentsSdk()`                                         | Throws “not implemented yet”; the Agents SDK example is an integration sketch, not a runnable remote transport.                                                 |
| `piAgent()` conversation and parameter selection      | One new, tool-free Pi process per message. Does not read `context.parameters` for a model or budget.                                                            |
| Standalone project generator and published package    | No dedicated `evalkit init`; `bun create` copies the repository. The consumer package build exists, but its first GitHub Packages release has not yet occurred. |
| Hosted sync or automatic report versioning            | No automatic sharing, upload, or Git commit for local report/sandbox files.                                                                                     |

For implementation details, consult the [core API](https://github.com/leostera/evalkit/blob/main/packages/core/src/index.ts), [runner](https://github.com/leostera/evalkit/blob/main/packages/runner/src/index.ts), and [CLI project loader](https://github.com/leostera/evalkit/blob/main/packages/cli/src/project.ts).
