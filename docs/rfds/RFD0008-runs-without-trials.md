# RFD0008 - Runs Without Trials

- Feature Name: `runs-without-trials`
- Status: Accepted
- Author: `leostera`
- Start Date: `2026-11-01`
- Updated: `2026-11-01`
- Discussion PR: `TBD`
- Tracking Issue: `TBD`

## Summary

A **run** becomes one execution of a scenario: one agent session in one sandbox, scored. That is what a trial is today. The extra level above it goes away: there is no "run of N trials" any more. Asking for repetition (`repeat: 3`, `--repeat 3`) starts three ordinary runs that share a **batch** ID, and everything that counts (the scoreboard, Compare, `evalkit compare`, the CLI summary, JUnit) counts runs. On disk, a run's directory holds its manifest, trajectory, scores and artifacts directly, as report schema version 6. `evalkit upgrade` rewrites older results into the new layout, turning each old trial into a run with the same ID, and the share server does the same for runs uploaded by older versions, both those it has stored and those still being uploaded, so every shared result stays viewable in the new dashboard.

## Motivation

EvalKit has four levels today (see [RFD0003](RFD0003-canonical-resource-identifiers-and-trial-navigation.md) and [RFD0007](RFD0007-scenarios-datasets-and-ci-reporting.md)):

| Level         | What it is                                                      | Where it shows      |
| ------------- | --------------------------------------------------------------- | ------------------- |
| Scenario      | what to test: prompts, data, scorers                            | Scenarios page      |
| Configuration | a scenario with one set of parameter values (a matrix cell)     | a scoreboard row    |
| Run           | one launch of a configuration, `policy.trials` attempts at once | Runs list, run page |
| Trial         | one attempt: a session in a sandbox, scored                     | trial page          |

The run level costs more than it gives:

- **Most runs are one trial.** All 93 runs in a real project's results (ocaml.ai's) have exactly one trial. For them, the run page is a page with one row that has to be clicked through to reach anything useful, and the Runs and Trials pages list the same things twice.
- **"Run" means the wrong thing.** In plain language a run is an execution. Here it names a batch of executions, so a second trial reads like a second run, which is what it is, just launched together with the first.
- **Counting is inconsistent.** A run passes only if every trial passes ([`packages/runner/src/index.ts`](../../packages/runner/src/index.ts)), while the scoreboard's pass rate is over the last 10 runs. Ten attempts as one run of ten trials, or as ten runs of one trial, give different pass rates for the same attempts. `evalkit compare` counts runs too.
- **Two of everything.** Two manifests, two summaries, two schemas, two sets of readers (`readTrialScoring`, `readTrialSummary`, …), and API routes nested two levels deep (`/v1/runs/:runId/trials/:trialId/workspace/…`), all to represent what is usually one thing.

The batch still has one real use: repeated attempts under identical conditions (same commit, data and settings, started together) measure flakiness, for example "passes at least 8 of 10 at this commit". That needs a shared label on runs, not a level of navigation.

## Goals

- A run is one execution, everywhere: on disk, in the API, in the dashboard, in the CLI, in JUnit and in share uploads.
- Repetition launches several runs with a shared batch ID; nothing else about them is special.
- Every count and rate is over runs, so the same attempts give the same numbers however they were launched.
- `evalkit upgrade` turns results from report schema versions 2 to 5 into version 6, in place, losslessly.
- The share server shows runs stored or uploaded by older versions, by upgrading them to the new snapshot format.
- Links to old trial pages keep working, since trial IDs become run IDs.

## Non-goals

- **Pass-rate gates** ("fail CI below 80% over the batch"). Batches make them easy to add later; see Future possibilities.
- **Grouping by `evalkit run` invocation.** A batch is the repeats of one configuration in one launch, not everything one command started.
- **Changing scoring, checkpoints, datasets or matrices.** Only where their results are kept and how they are counted changes.
- **The share server's base path and single-repository mode.** They ship in the same release but are independent of this design.
- **Reading old layouts at runtime.** Readers understand version 6 only; older results go through `evalkit upgrade` once.

## Guide-level explanation

### Running

```ts
export default defineEval({
  id: 'lint-and-fix',
  agent: piAgent,
  transcript: [user('Lint the program and fix what it finds.')],
  scoring: [buildsCleanly, noLintWarnings],
  repeat: 3,
});
```

```sh
evalkit run lint-and-fix            # 3 runs, as the scenario asks
evalkit run lint-and-fix --repeat 1 # one run
evalkit run -m models -s testing -n 5
```

`repeat` replaces `policy.trials` (and `execution.trials` in the config); `-n, --repeat <n>` replaces `-n, --trials <n>`. A scenario without `repeat` runs once. The CLI shows one line per run and sums runs:

```
✓ lint-and-fix  model=luna  1.00  1m 12s
✗ lint-and-fix  model=luna  0.50  1m 40s  noLintWarnings: 3 warnings remain
✓ lint-and-fix  model=luna  1.00  1m 05s

2 of 3 runs passed · 1 scenario · 3m 57s
```

### Results

```
_evalkit-results/<runId>/
├── manifest.json        # what ran: scenario, parameters, commit, batch, datasets
├── catalog.json         # the project's scenarios and suites at the time
├── trajectory.jsonl     # agent and runner events
├── scoring.json         # scorer results, checkpoints, metrics, overall, passed
├── summary.json         # how it ended: status, duration, error, artifacts, attachments
└── artifacts/
    ├── candidate/...    # end-of-run workspace snapshot
    └── attachments/...  # files the agent or scorers attached
```

A run that was part of a batch says so in its manifest: `"batch": { "id": "…", "index": 1, "size": 3 }`.

### Dashboard

- **Runs** lists executions, newest first, with the filters it has today. A batch shows as a small `2/3` label that filters the list to that batch when clicked.
- **A run's page** is today's trial page: trajectory, scores, metrics, attachments, and a **Workspace** view, with the run's details (commit, parameters, batch) in the side panel.
- The **Trials** page goes away; **Workspaces** lists runs whose sandbox was kept.
- The **scoreboard**, **Compare** and **pass rates** count the last 10 runs of each configuration, which are now executions.

Old links redirect: `/runs/<old run>/trials/<trial>` goes to `/runs/<trial>`, and `/runs/<old run>` goes to the Runs list filtered to that batch.

### Upgrading

```sh
$ evalkit dev
  ➜  Reports: _evalkit-results (0 runs, 93 from an older EvalKit hidden; run `evalkit upgrade`)

$ evalkit upgrade --dry-run
Would upgrade 93 runs from older EvalKit versions into 112 runs. Nothing was changed.

$ evalkit upgrade
Upgraded 93 runs into 112 runs (19 had more than one trial; each trial is now a run in a batch).
```

On a share server, an operator runs the same upgrade once after deploying, the way `reindex` works today:

```sh
curl -X POST https://evals.example.com/api/v1/upgrade
{"upgraded":41,"runs":57,"remaining":0}
```

Until then, and for CI jobs still on an older EvalKit, the server upgrades each old-format upload as it arrives, so nothing has to be updated in lockstep.

## Reference-level explanation

### Concepts

- **Run:** one execution of one configuration. Identity `evalkit:run:<uuid>`. Status is one of `running`, `passed`, `failed`, `errored`, `cancelled`, decided by that execution alone.
- **Batch:** `{ id, index, size }` on runs launched together as repeats of one configuration. `id` is a UUID with no page or resource URI of its own; `index` is zero-based. Runs launched once have no batch.
- The `evalkit:trial:` resource type is removed.

### Report schema version 6

- `RunManifestSchema`: today's run and trial manifest fields merged: `schemaVersion: 6`, `runUri`, `evalId`, `suiteId?`, `parameters?`, `matrix?`, `aut?`, `startedAt`, `source?`, `process?`, `workspaceIgnore?`, `datasets?`, `batch?`, `status?`.
- `RunSummarySchema`: today's trial summary (`status`, `endedAt`, `durationMs?`, `scoring?`, `artifacts?`, `attachments?`, `error?`). The counting fields (`trialCount`, `passed`, `failed`, `cancelled`) go away.
- `RunScoringSchema`: today's `TrialScoringSchema`, renamed.
- `TrialMetadataSchema`, `TrialManifestSchema`, `TrialSummarySchema` and `TrialScoringSchema` are removed. Readers accept `schemaVersion: 6` only; any other version is counted as "from an older EvalKit".

The status vocabulary unifies on the run's: a trial status of `completed` becomes `passed` or `failed` from `scoring.passed`, and an execution error is `errored`.

### Execution

`runEval(definition, options)` runs `options.repeat ?? definition.repeat ?? 1` executions and resolves to `RunResult[]`, one per run. With more than one, it creates a batch ID and sets each run's `batch`. Each execution has its own report writer; there is no aggregate summary to finalize. Concurrency, the cell semaphore and cancellation work per execution as they do per trial today. `RunEvalOptions.trials` becomes `repeat`.

### Public API renames

| Today                                                                          | Version 6                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `policy.trials`, `execution.trials`                                            | `repeat`, `execution.repeat`                                                                                 |
| `readTrialManifest`, `readTrialSummary`, `readTrialScoring`, `readTrialEvents` | `readRunManifest`, `readRunSummary`, `readRunScoring`, `readRunEvents` (the run-level versions are replaced) |
| `trialWorkspacePath(root, trialId)`                                            | `runWorkspacePath(root, runId)`                                                                              |
| `TrialResult`, `RunResult.trials`                                              | `RunResult` (one execution)                                                                                  |
| `artifacts.attachments.maxTrialBytes`                                          | `maxRunBytes`                                                                                                |
| `trialIndex`                                                                   | `batch.index`                                                                                                |

These are clean renames with no aliases; the changelog's migration section lists them.

### Local dashboard API and snapshot format

| Today                                                                    | Version 6                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `GET /v1/runs` (batches)                                                 | `GET /v1/runs` (executions; `?batch=<id>` filters)                     |
| `GET /v1/runs/:run/trials`                                               | removed                                                                |
| `GET /v1/runs/:run/trials/:trial`                                        | `GET /v1/runs/:run`                                                    |
| `…/trials/:trial/{events,artifacts,workspace,workspace/*,attachments/*}` | `/v1/runs/:run/{events,artifacts,workspace,workspace/*,attachments/*}` |

The static snapshot (`evalkit build`) and share bundles use the same shape: `runs.json`, and per run `runs/<id>/run.json`, `events.json`, `artifacts.json`, `workspace.json`, `workspace/…` and `attachments/…`. `run.json` merges today's run summary and trial detail and carries `"snapshotVersion": 2`; today's snapshots are version 1 (no field).

### `evalkit upgrade`

```
evalkit upgrade [--dry-run]
```

It works on the project's results folder (the config's `reportDir`, `_evalkit-results` by default). For each directory in it whose manifest has `schemaVersion` 2 to 5:

1. **Skip it if it is still running**: no `summary.json`, and its owning process is alive (the same check `tidy` uses). It is reported as skipped.
2. **Plan one new run per trial directory**: run ID = trial ID, so trial links stay valid. Manifest = the old run manifest's fields (`suiteId`, `source`, `process`, `aut`, `parameters`, `matrix`), then the trial manifest's (`startedAt`, `datasets`, `workspaceIgnore`), then `batch: { id: <old run id>, index: trialIndex, size: <trial count> }` when the old run had more than one trial. Status comes from the trial's summary as above. `trajectory.jsonl`, `scoring.json` and `artifacts/` move unchanged; `catalog.json` is copied into each new run.
3. **Write each new run under a temporary name, then rename it into place**, and only then remove the old directory. A crash leaves either the old run or complete new runs, never a half-written run. A temporary directory left by a crash is removed on the next upgrade.
4. **Old runs without trials** (cancelled before any started) become one `cancelled` run with the old run's ID.

Upgrading is idempotent: version 6 directories are left alone, so it can be re-run after a failure or a partial copy. Trial workspaces kept in `sandboxDir` are renamed to their run path. `--dry-run` prints the plan and changes nothing. `evalkit dev`, `build`, `share`, `compare` and `tidy` mention `evalkit upgrade` whenever they hide older runs.

### Share server upgrade

Stored layout today: `repos/<repo>/commits/<sha>/runs/<run>/{run.json,trials.json,trials/<trial>/…}`, with one index row per run whose `summary_json` is that `run.json`.

- **At upload:** a bundle without `"snapshotVersion": 2` is converted before it is stored, by the same function the stored upgrade uses: one version 6 run per entry in `trials.json`, with files moved from `trials/<trial>/…` to the new run's paths and `run.json` built from the old run summary plus the trial's `detail.json`. An older CLI can keep uploading.
- **Stored runs:** `POST /api/v1/upgrade` converts stored version 1 runs and replaces their index rows, then deletes the old objects. It processes a bounded number of runs per request, so it fits a Worker's limits, and returns `{ upgraded, runs, remaining }`; the operator calls it until `remaining` is 0. It is idempotent: a run whose new objects exist is skipped, and old objects are deleted only after the new ones and their index rows are written.
- **Reading:** the dashboard asks only for version 6 paths. A stored run not yet upgraded is invisible until the upgrade reaches it, so the upgrade runs right after deploying.

`reindex` reads version 6 `run.json` files only. Like `reindex`, `upgrade` has no authentication; the server already runs on a private network ([RFD0006](RFD0006-commit-provenance-and-share-server.md)).

### Counting

- The scoreboard, Compare and the scenario page take the last 10 finished runs of each configuration, as today; each run is now one execution. A metric's mean is over the runs that measured it, as in 0.9.
- `evalkit compare` counts runs per suite (`8/10 → 9/10`).
- The CLI summary and exit code: the exit code is non-zero if any run failed or errored, as when any trial failed today.
- JUnit: one `<testcase>` per run, named after the scenario and parameters, plus ` #<index + 1>` in a batch.

## Data migration and compatibility

This is a breaking change:

- **Results:** version 2 to 5 results are hidden until `evalkit upgrade` runs. Nothing is deleted without being rewritten first.
- **Share server:** must be redeployed with this version before CLIs on this version upload; version 6 bundles are rejected by older servers (they lack `trials.json`). Older CLIs keep working against the new server.
- **Code:** adapters are unaffected. Code calling `runEval` or the readers, or setting `policy.trials`, `execution.trials` or `maxTrialBytes`, needs the renames above. The release's changelog has a migration section.
- **Links:** old dashboard trial URLs redirect, since trial IDs become run IDs. Old run IDs become batch IDs and redirect to the filtered Runs list.

## Rollout

1. Report schema version 6, execution and readers, with `evalkit upgrade` and its tests over fixture results from versions 2 to 5.
2. The local dashboard API, the snapshot format and the dashboard pages, with redirects.
3. The share server's conversion at upload and `POST /api/v1/upgrade`, tested with stored version 1 runs and uploads from a 0.8 CLI.
4. CLI output, JUnit and `evalkit compare`.
5. Docs, skills, examples and the changelog's migration section; then a release.
6. After deploying the share server: call `/api/v1/upgrade` until nothing remains, then upgrade local results with `evalkit upgrade`.

## Drawbacks

- **Every user has to run `evalkit upgrade`** and every share server operator has to call the upgrade endpoint, once.
- **More directories.** A batch of 10 becomes 10 run directories, each with a copy of `catalog.json` (a few kilobytes).
- **The batch loses its page.** Seeing a batch's ten attempts side by side becomes a filter on the Runs list instead of a page. Compare and the scoreboard already summarise them better.
- **A large rename.** Docs, skills, examples and tests that say "trial" all change.

## Alternatives

- **Do nothing.** The extra level stays, and the counting inconsistency stays with it.
- **Hide trials in the dashboard only.** Skip the run page when a run has one trial, and count trials on the scoreboard. That is cheaper and keeps the data model, but it keeps two words for one execution, two manifests and two sets of readers, and the inconsistency moves rather than goes away.
- **Keep runs, drop trials by forbidding `trials > 1`.** Removes repetition, which is the one real use of the batch.
- **Read old layouts at runtime instead of upgrading.** Every reader, the dashboard and the share server would understand both layouts forever. One upgrade is simpler and keeps the readers to one format.

## Prior art

- **Test runners** (Vitest's `--repeat`, pytest-repeat, `go test -count`) treat a repeat as another test execution reported on its own, not as a container.
- **CI systems** show a re-run of a job as another job attempt with its own logs; grouping is a label on the attempts.
- **RFD0003** made the trial, not the trajectory, the inspectable resource. This RFD keeps that and renames it, removing the container above it.

## Unresolved questions

Before accepting:

- Should a batch also record the `evalkit run` invocation, so one CI job's runs can be listed together? It is left out here; `source.ci` already records the job.
- Is `repeat` the right name, against `attempts` or `samples`?

During implementation:

- The batch label's exact design on the Runs list.
- Whether `evalkit upgrade` should also run automatically on the first `evalkit run` in a project with older results, after asking.

## Future possibilities

- **Pass-rate gates:** `--min-pass-rate 0.8` evaluated per batch, failing CI below it.
- **pass@k and pass^k** on the scoreboard and in Compare, computed from batches.
- **Re-running a single run** from the dashboard into a new batch of one.
