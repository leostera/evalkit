# RFD0001 implementation plan

**Status:** active

**Design source:** [`docs/rfds/RFD0001-evalkit-core-execution-and-reporting.md`](../../docs/rfds/RFD0001-evalkit-core-execution-and-reporting.md)

## Current baseline

The first execution slice is complete:

- [x] Declarative `defineEval()` and `defineAgent()` values
- [x] Session-based AUT contract and normalized event types
- [x] `user(...)` transcript execution
- [x] Deterministic predicate scoring
- [x] Local hierarchical report store
- [x] Incremental JSONL trajectory persistence
- [x] Partial reports when an AUT throws

## Implementation order

### 1. Decide and implement fixture visibility

**Decision:** use flat fixture declarations with explicit `visibility: 'candidate' | 'evaluator'`. Destinations are non-empty relative paths within the selected trial workspace.

```ts
fixtures: [
  directory('./starter', { dst: 'workspace', visibility: 'candidate' }),
  directory('./hidden-tests', { dst: 'tests', visibility: 'evaluator' }),
];
```

- [x] Replace provisional fixture types with the selected public API.
- [x] Resolve local directories, local files, inline files, and dynamic fixtures.
- [x] Add fixture validation: relative paths only, destination containment, duplicate-destination detection.
- [x] Create a fresh trial workspace before `agent.start()`.
- [x] Give AUTs candidate-only workspace capabilities.
- [x] Give predicate scorers evaluator workspace access after AUT execution.
- [x] Keep the workspace alive through scoring.
- [x] Clean up workspace resources after scoring while preserving the primary failure.
- [x] Add candidate/evaluator isolation and workspace-cleanup tests.

The local workspace boundary is capability-oriented, not a security sandbox against malicious in-process code. Artifact capture and evaluator capability hardening remain later work.

### 2. Finish artifact report storage

**Decision:** automatically snapshot the entire candidate workspace before cleanup. Evaluator-only files remain excluded unless a future explicit policy permits capture.

- [x] Add `TrialWriter.writeArtifact(path, data)` to the public `ReportStore` contract.
- [x] Implement artifact directory creation and path containment in `localReportStore()`.
- [x] Snapshot every regular candidate-workspace file under `artifacts/candidate/` before cleanup.
- [x] Write snapshot metadata into the trial summary.
- [x] Reject symbolic links and unsupported filesystem entries during snapshotting.
- [ ] Define whether empty directories must be materialized in the report tree, rather than represented only in summary metadata.
- [ ] Refactor local execution so one eval invocation owns one aggregate run and all requested isolated trials.
- [ ] Add explicit abort/failure finalization semantics for aggregate run and trial writers.
- [ ] Add report-store failure and artifact-path escape tests.

### 3. Complete runner lifecycle controls

- [ ] Enforce `EvalPolicy.timeoutMs` as an outer wall-clock timeout.
- [ ] Define cancellation behavior and return `cancelled` results.
- [ ] Define behavior for AUT, close, scorer, cleanup, and report-store failures occurring together.
- [ ] Make report write batching and flush guarantees explicit.
- [ ] Test concurrent AUT callback ordering.
- [ ] Test score-range failures and partial-trial scoring.

### 4. Complete transcript semantics

**Decision required before implementation:** determine whether `agent(...)` and inline `judge(...)` are expectations, scripted messages, checkpoints, or separate concepts.

- [ ] Implement the selected `agent(...)` behavior.
- [ ] Implement the selected inline `judge(...)` behavior, or remove it in favor of top-level scoring only.
- [ ] Add expectations for messages, tool calls, tool results, and artifacts as required.
- [ ] Decide when transcript checkpoints observe the event stream.
- [ ] Support structured messages only if a concrete AUT requires them.

### 5. Add judge execution

- [ ] Define a judge-provider contract distinct from the AUT contract.
- [ ] Render transcript and artifact targets safely for judge input.
- [ ] Normalize judge output to `0..1` with explanation and evidence.
- [ ] Record judge usage, timeout, and errors in the trajectory and scoring report.
- [ ] Define the aggregate policy for judge failures.

### 6. Add concrete AUT adapters

- [ ] Implement one local adapter first.
- [ ] Define per-trial isolation and resource cleanup for that adapter.
- [ ] Implement a remote adapter only after local event normalization is validated.
- [ ] Add integration tests covering messages, tool events, completion, and transport failures.

### 7. Build the CLI

- [ ] Discover and load eval modules.
- [ ] Select evals and configure report output.
- [ ] Execute selected evals through the runner.
- [ ] Render live human-readable progress from trajectory events.
- [ ] Add a machine-readable output mode.
- [ ] Define exit-code behavior for failed scores, execution failures, and invalid definitions.

## Completion criteria

RFD0001 is implemented when the completed system has:

- a stable declarative eval and AUT contract;
- candidate/evaluator-isolated artifact workspaces;
- durable trajectory, score, and artifact reports;
- explicit timeout, cancellation, and multi-failure behavior;
- executable transcript expectations and judge scoring;
- at least one concrete AUT adapter; and
- a CLI that discovers, executes, and reports evaluations.

Items explicitly excluded by RFD0001 remain separate work: multi-AUT comparisons, distributed scheduling, hosted orchestration, public report publishing, and cross-run ranking.
