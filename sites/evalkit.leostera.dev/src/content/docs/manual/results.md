---
title: Results and reports
description: Interpret local reports, checkpoint and final scoring, trajectories, artifacts, and CI gates.
---

Eval definitions can live in Git, but run output is **local evidence**, not automatically committed, uploaded, or shared. The Bun CLI writes one directory per run under the project's `reportDir` (default `_evalkit-results/`). A run is one execution of one scenario: one agent session in one sandbox, scored. Each matrix cell is its own run, and `repeat: 3` (or `--repeat 3`) starts three runs that share a **batch**.

## Files on disk

```text
_evalkit-results/<run-uuid>/
├── manifest.json             # what ran: identity, parameters, source, process, batch, datasets, status
├── catalog.json              # the project's scenarios when the run started
├── transcript.atxf.jsonl     # what the agent did, as an ATXF transcript, sealed when the run ends
├── run-events.jsonl          # EvalKit's events: steps, checkpoints, scorers, a reached limit
├── transcripts/...           # sub-agents' ATXF transcripts, when the agent kept any
├── scoring.json              # the scores: scorer results, checkpoints, metrics, overall, passed
├── summary.json              # how it ended: status, scoring (again), duration, artifacts, error
├── artifacts/candidate/...   # the candidate files at the end of the run, if any
└── artifacts/attachments/... # files the agent or scorers attach()
```

**Looking for scores?** They are in the run's `scoring.json`, repeated in its `summary.json`. Manifests describe what ran and its status, never scores. From code, use `readRunScoring` and the other readers in the [API reference](/docs/reference/api/#running-and-reading-results-leosteraevalkitrunner).

A newly written manifest has `schemaVersion: 7`, the human-authored `evalId` (and optional `suiteId`), a generated UUID-based `runUri`, optional agent identity (`aut`), optional effective `parameters` and `matrix: { id, cellKey }`, the `limits` in force, `startedAt`, `source` (see below), `process: { pid, hostname }` (the process that owns the run), and `datasets`: every dataset the run used, with its visibility, `static` or `computed` source, and a content digest. A run launched as one of several repeats has `batch: { id, index, size }`: the batch's UUID, its zero-based position, and how many runs were launched together. Directory names are the UUIDs; an eval ID is **not** a directory name. Manifests start with `status: "running"` and are updated when finalized; the summary is written then too. A run with no summary whose owning process is no longer alive on this host is read as **cancelled (interrupted)**; runs owned by another host stay running.

Results from EvalKit before 0.9 (schema versions 2 to 5) held several trials inside one run. `bun run evalkit upgrade` rewrites them in place: An old run of one trial keeps its ID; an old run of several becomes runs with the trials' IDs, in a batch with the old run's ID. Either way, old run and trial links keep working. Runs from EvalKit 0.9 and 0.10 (schema version 6) keep their IDs; their `trajectory.jsonl` becomes `transcript.atxf.jsonl` and `run-events.jsonl`, sealed and checked, and a run that cannot be converted is left as it was and listed with why. It is safe to interrupt and run again, leaves runs that are still running for later, and `--dry-run` reports what it would change. Until then, the CLI and dashboard skip those runs and say how many they skipped.

`scoring.json` contains final scorer `results` with each scorer's `name`, `kind`, duration, optional `value`/`passed`, explanation, JSON evidence, or recorded error. A scorer that returned `skip(reason)` has `skipped: true` and no value. `metrics` lists the run's [metrics](/docs/manual/scoring-and-evals/#metrics): `name`, `value` (absent when nothing was measured), optional `unit` and `better`, `builtIn: true` for the built-in ones, or a recorded `error`. It can also contain separate `checkpoints` with authored step index, status (`passed`, `failed`, `error`, or `skipped`), score/evidence/error, and the matched tool call (`matchedToolCall: { messageId, id }`); `skippedScorers` names final predicates or judges omitted after failfast. Every result records `passAt`, the pass mark applied; a `choices` judge adds `choice` and a criteria score adds `criteria`. Judge results include `judge: { agent?, model?, prompt?, reply?, attempts?, usage?, transcript? }`: the prompt EvalKit sent, the judge's reply, its own ATXF transcript, and how many times it was asked, never the agent's records. Usage appears only when the judge reports it; EvalKit does not infer cost. Judge transcripts and prompts can contain sensitive data. `summary.json` repeats the scoring, records the run's `status`, duration and ending time, and lists snapshotted artifact paths/sizes and attachments, or an error; a `limited` run adds `limit: { limit, value, used }`. `transcript.atxf.jsonl` is the agent's [ATXF](https://atxf.leostera.dev) transcript: the user messages EvalKit sent, the agent's messages, tool calls and results, reasoning, compactions, and usage and model **only as the adapter reported them**; EvalKit does not measure provider usage itself. When the run ends it is sealed with a hash of every record, so any ATXF tool can check it was not altered. `run-events.jsonl` holds EvalKit's own events, each with `at`, the ID of the transcript record it follows.

The CLI keeps `$TMPDIR/evalkit/<project>-<hash>/`<run-uuid>/{candidate,evaluator}/ for runs that did not pass, for local debugging (`keepSandboxes` changes this). These are the **actual** workspaces; the report artifact directory is a separate snapshot of candidate files at the end of execution, without dependencies, build output and VCS metadata (`artifacts.exclude`, then the scenario's `workspace.ignore`; the manifest records the effective list as `workspaceIgnore`), and without symbolic links, which are never followed. Evaluator files are not included in the report snapshot, but remain in the sandbox. A low-level runner call without `workspaceRoot` instead uses a temporary workspace that is removed after its run.

## Understanding status and scores

A run has one `status`, in its manifest and summary:

| Status      | Meaning                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `running`   | Not finished yet.                                                                                                                               |
| `passed`    | It ran to the end and every final scorer and checkpoint passed, with no skipped final scorers or errored checkpoints.                           |
| `failed`    | It ran to the end, but a scorer or checkpoint did not pass. A final scorer that throws is a failed score, not an execution error.               |
| `errored`   | It could not finish: the agent, a workspace step, a snapshot or cleanup threw, or an inline rule threw. A partial scorer passing does not help. |
| `limited`   | It reached a [limit](/docs/manual/agents/#limits) on steps, tokens or time. Only `supportsPartial` scorers grade it; it counts as a failure.    |
| `cancelled` | Stopped before it finished (Ctrl+C, or its process went away). Never counted as a failure.                                                      |

`scoring.passed` is the scoring verdict on its own, and `scoring.overall` is the arithmetic mean of valid numeric **final scorer** values (not checkpoint values), **not** a pass rate; it is absent if no scorer returned a valid value.

A failed assertion (even with `policy.failfast: true`) makes the run `failed`, not `errored`. Failfast skips later authored steps, records skipped checkpoints, and permits only `supportsPartial` final predicates or judges. A score is between 0 and 1; without an explicit `passed` flag, only `1` passes. A run with no rules has no overall score and passes, so do not treat that as proof of quality. For a batch, count its runs: how many passed out of how many ran, rather than the first run or a mean score. The CLI exits nonzero if any selected run did not pass.

## Inspect or gate a run

The commands below expect `jq` and an **actual** UUID from your project; `<run-uuid>` is a placeholder, not an example result.

```sh
RUN="_evalkit-results/<run-uuid>"
jq '{status, error}' "$RUN/summary.json"
jq -r '.results[] | [.name, (.value // "error"), .passed] | @tsv' "$RUN/scoring.json"
# The assistant's messages.
jq -c 'select(.type == "message" and .role == "assistant")' "$RUN/transcript.atxf.jsonl"
# Every run of a batch, with its status.
BATCH=$(jq -r '.batch.id' "$RUN/manifest.json")
jq -r --arg batch "$BATCH" 'select(.batch.id == $batch) | [.runUri, .status] | @tsv' _evalkit-results/*/manifest.json
# CI gate for a finalized run; jq -e exits nonzero when the condition is false.
jq -e '.status == "passed"' "$RUN/summary.json"
```

For a whole CLI invocation, use its exit status as well as the individual report summaries; it evaluates every selected cell. Human-readable CLI output lists each checkpoint by authored step index, name, and status (`passed`, `failed`, `error`, or `skipped`) without printing raw tool arguments or evidence. `--json` prints a JSON object per finished run for automation (see [CLI and matrices](/docs/manual/cli-and-matrices/#execution-options)).

## Run from code

The local runner also exposes `runEval`, `runMatrix`, and `localReportStore` from `@evalkit/runner` in this monorepo or `@leostera/evalkit/runner` from npm in standalone projects. Both runner functions return **Effect** values; creating one does not start an eval. Execute it with `Effect.runPromise(...)`:

```ts
// From a project rooted beside scenarios/greeting.eval.ts
import { Effect } from 'effect';
import { localReportStore, runEval } from '@leostera/evalkit/runner';
import greetingEval from './scenarios/greeting.eval.js';

const runs = await Effect.runPromise(
  runEval(greetingEval, {
    report: localReportStore('_evalkit-results'),
    workspaceRoot: '/tmp/my-evals', // omit for cleaned-up temporary workspaces
    runtime: 'local', // only if the agent declares this runtime
    repeat: 3, // overrides the scenario's repeat
  }),
);
const passed = runs.filter((run) => run.status === 'passed').length;
console.log(`${passed} of ${runs.length} runs passed`);
```

`runEval` resolves to one `RunResult` per run (`runId`, `status`, `batch`, `scoring`, `reportLocation`, …); runs that never started because of cancellation are left out. `readRunTranscript(root, runId)` reads a run's ATXF transcript. `runMatrix(matrix, { report, selection?, concurrency?, repeat?, onResult?, ... })` runs a `defineEvalMatrix(...)` definition, calls `onResult(cell, runs)` as each cell finishes, and returns `{ cells, runs, passed, failed, limited, cancelled }`, counting runs. `limits: { base?, override? }` sets the project's limits and a `--limit`-style override. You can supply `parameters` directly to `runEval`; an adapter still has to consume them. An execution error is recorded as an `errored` run; configuration or report I/O failures can reject the Effect. The CLI sets a persistent workspace root and handles exit codes for you.

## Dashboard and privacy

`bun run evalkit dev` loads definitions from this project and lists the runs in its report directory; see [the dashboard](/docs/manual/cli-and-matrices/#dashboard-runs-and-inspection). Runs and Workspaces share filters for scenario, matrix, status, dates, and saved parameter values, with sortable columns and text search. Select several values within a filter to include any of them; different filters narrow the result together. Parameter choices come from retained reports, so changing the current matrix does not hide earlier configurations. A run that is part of a batch shows `2/3` beside its ID; select it to list that batch's runs. Filters stay in the URL. The dashboard is a local viewer and launcher, not an automatic report sync or Git integration. Run manifests include a `source` block with the repository, eval project path, commit, branch, and whether the tree had uncommitted changes, and each run saves the project's eval catalog as `catalog.json`. `bun run evalkit share` uploads a commit's results to your team's share server; see [Sharing results](/docs/manual/cli-and-matrices/#sharing-results). After removing or renaming evals, `bun run evalkit tidy` archives their old runs so they stop cluttering the run list; see [Archiving removed evals](/docs/manual/cli-and-matrices/#archiving-removed-evals). To share results, `bun run evalkit build` exports a read-only static snapshot; see [Sharing a static snapshot](/docs/manual/cli-and-matrices/#sharing-a-static-snapshot).

### Privacy and retention

Candidate files, assistant/user message events, scorer explanations/evidence, and errors may include sensitive data. The sandbox retains **evaluator** files as well. Ignore `_evalkit-results/` and `_evalkit-dashboard/` in your own Git project, choose retention rules, and inspect contents before copying a report or exposing the local dashboard to others. The example projects already ignore those generated paths; those ignore rules do not automatically apply to every new project. Removing unwanted local runs and retained workspaces is your responsibility.
