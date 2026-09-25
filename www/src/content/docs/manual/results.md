---
title: Results and reports
description: Interpret local v2/v3 manifests, checkpoint and final scoring, trajectories, artifacts, and CI gates.
---

Eval definitions can live in Git, but run output is **local evidence**, not automatically committed, uploaded, or shared. The Bun CLI writes one report tree per eval run under the project's `reportDir` (default `_evalkit-results/`). A matrix cell creates its own run; several trials of one eval share that run's ID.

## Files on disk

```text
_evalkit-results/<run-uuid>/
├── manifest.json                 # v3 run identity, parameters, start time, status
├── summary.json                  # run status and passed/failed trial counts
└── trials/<trial-uuid>/
    ├── manifest.json             # v3 trial identity and zero-based trialIndex
    ├── trajectory.jsonl          # AUT + runner events, one JSON object per line
    ├── scoring.json              # individual score results, overall, passed
    ├── summary.json              # execution status, scoring, error, artifacts
    └── artifacts/candidate/...   # end-of-trial candidate file snapshot, if any
```

A newly written run/trial manifest has `schemaVersion: 3`, human-authored `evalId` (and optional `suiteId`), generated UUID-based `runUri`/`trialUri`, optional agent identity (`aut`), optional effective `parameters` and `matrix: { id, cellKey }`, and `startedAt`. Directory names are the UUIDs; an eval ID is **not** a directory name. Manifests start with `status: "running"` and are updated when finalized. Run and trial summaries are written at finalization; a live or interrupted run may not yet have one. The CLI and dashboard also read existing v2 reports without rewriting them or assuming they contain checkpoints. Older v1 authored-resource-URI manifests are not migrated or listed by the current dashboard, though they remain on disk.

`scoring.json` contains final scorer `results` with each scorer's `name`, `kind`, duration, optional `value`/`passed`, explanation, JSON evidence, or recorded error. It can also contain separate `checkpoints` with authored step index, status (`passed`, `failed`, `error`, or `skipped`), score/evidence/error, and a matched tool-call event reference; `skippedScorers` names final predicates or judges omitted after failfast. Judge results may include `judge: { agent?, usage?, events? }`: identity and observations from the separate judge agent, never AUT events. Usage appears only when the judge emits it; Evalkit does not infer cost. Judge events and prompts can contain sensitive data. `summary.json` for a trial repeats the scoring, records execution `status`, duration and ending time, and lists snapshotted artifact paths/sizes or an error. `trajectory.jsonl` includes `source: "aut"` messages/tool events and `source: "runner"` steps/scorer events, all with timestamps. `turn-completed` events carry latency/token usage **only if the adapter emitted it**; Evalkit does not measure provider usage automatically.

The CLI also retains `_evalkit-sandbox/<trial-uuid>/{candidate,evaluator}/` for local debugging. These are the **actual** workspaces; the report artifact directory is a separate snapshot of candidate files at the end of execution. Evaluator files are not included in the report snapshot, but remain in the sandbox. A low-level runner call without `workspaceRoot` instead uses a temporary workspace that is removed after its trial.

## Understanding status and scores

There are two independent questions: did execution complete, and did its scorers pass?

| Field                           | Meaning                                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trial `summary.status`          | `completed` if the runner finished the AUT/workspace lifecycle; `failed` for an execution, close, snapshot, or cleanup error. It does **not** turn into `failed` for a scored failure or final scorer error; a thrown inline rule is an execution failure. |
| Trial `scoring.passed`          | All final scorers and checkpoints passed, with no skipped final scorers or errored checkpoints. A failed execution still fails the run gate, even if a partial scorer passed.                                          |
| Trial `scoring.overall`         | Arithmetic mean of valid numeric **final scorer** values (not checkpoint values), **not** pass rate. Absent if no scorer returned a valid value.                                                                  |
| Run `summary.status`            | `completed` unless an execution trial failed. A scoring-only failure can still leave this as `completed`.                                                                                                         |
| Run `summary.passed` / `failed` | Counts of trials that completed **and** passed scoring vs all other trials. Use these for aggregate gates.                                                                                                        |

An assertion failure (even with `policy.failfast: true`) can leave execution `status: "completed"` while `scoring.passed` is false. Failfast skips later authored steps, records skipped checkpoints, and permits only `supportsPartial` final predicates or judges. A throwing inline predicate or judge instead makes execution `failed`. A score is between 0 and 1; without an explicit `passed` flag, only `1` passes. A trial with no rules has no overall score and `scoring.passed: true`, so do not treat that as proof of quality. In a multi-trial run, compare `passed` and `failed` rather than inferring success from the first trial or a mean score. The CLI returns a nonzero exit code if a cell did not pass all its trials, even when run execution is `completed`.

## Inspect or gate a run

The commands below expect `jq` and an **actual** UUID from your project; `<run-uuid>` is a placeholder, not an example result.

```sh
RUN="_evalkit-results/<run-uuid>"
jq '{status, trialCount, passed, failed}' "$RUN/summary.json"
jq '{status, scoring, error}' "$RUN"/trials/*/summary.json
jq -r '.results[] | [.name, (.value // "error"), .passed] | @tsv' "$RUN"/trials/*/scoring.json
# Collect assistant messages across this run's trials.
jq -s 'map(select(.source == "aut" and .kind == "message" and .role == "assistant"))' "$RUN"/trials/*/trajectory.jsonl
# CI gate for a finalized run; jq -e exits nonzero when the condition is false.
jq -e '.trialCount > 0 and .failed == 0' "$RUN/summary.json"
```

For a whole CLI invocation, use its exit status as well as the individual report summaries; it evaluates every selected cell. Human-readable CLI output lists each checkpoint by authored step index, name, and status (`passed`, `failed`, `error`, or `skipped`) without printing raw tool arguments or evidence. `--json` prints a JSON object per completed cell for automation (see [CLI and matrices](/docs/manual/cli-and-matrices/#execution-options)).

## Run from code

The local runner also exposes `runEval`, `runMatrix`, and `localReportStore` from `@evalkit/runner` in this monorepo or `@leostera/evalkit/runner` after publication. Both runner functions return **Effect** values; creating one does not start an eval. Execute it with `Effect.runPromise(...)`:

```ts
// From a Bun project rooted beside evals/greeting.eval.ts
import { Effect } from 'effect';
import { localReportStore, runEval } from '@evalkit/runner';
import greetingEval from './evals/greeting.eval.js';

const result = await Effect.runPromise(
  runEval(greetingEval, {
    report: localReportStore('_evalkit-results'),
    workspaceRoot: '_evalkit-sandbox', // omit for cleaned-up temporary workspaces
    runtime: 'local', // only if the agent declares this runtime
    trials: 1, // overrides policy.trials
  }),
);
const passed = result.status === 'completed' && result.scoring?.passed === true;
console.log({ passed, report: result.reportLocation });
```

For multiple trials, inspect `result.aggregateScoring` (`passed`, `failed`, `passRate`, optional mean `overall`) or the persisted run summary instead of just the first trial's `result.scoring`. `runMatrix(matrix, { report, selection?, concurrency?, trials?, onResult?, ... })` runs a `defineEvalMatrix(...)` definition and returns cell-level `{ cells, passed, failed }` counts. You can supply `parameters` directly to `runEval`; an adapter still has to consume them. Execution errors in a trial are normally recorded as failed results; configuration or report I/O failures can reject the Effect. The CLI sets a persistent workspace root and handles exit codes for you.

## Dashboard and privacy

`bun run evalkit serve-dashboard` loads definitions from this project and lists compatible **v2 and v3** reports from its report directory. Browse runs and their trials, view checkpoint and final scorer results and the event timeline, and inspect candidate workspace files and artifacts. Its display statuses (`passed`, `failed`, `errored`) combine report execution and scoring: they are not literal values from the `summary.json` `status` field. An incomplete run may show as running until a summary exists. The dashboard is a local viewer and launcher, not an automatic report sync or Git integration.

### Privacy and retention

Candidate files, assistant/user message events, scorer explanations/evidence, and errors may include sensitive data. The sandbox retains **evaluator** files as well. Ignore `_evalkit-results/` and `_evalkit-sandbox/` in your own Git project, choose retention rules, and inspect contents before copying a report or exposing the local dashboard to others. The example projects already ignore those generated paths; those ignore rules do not automatically apply to every new project. Removing unwanted local runs and retained workspaces is your responsibility.
