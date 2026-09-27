# PLAN1234 — Aggregate runs, local dashboard, and suite-aware evaluation UX

**Status:** active

## Goal

Make Evalkit’s local execution and dashboard reflect the real hierarchy:

```text
suite → eval → run → trials → trajectory
```

A single eval invocation must create one aggregate run containing its requested independent trials. The CLI, local dashboard API, and dashboard UI consume that same report hierarchy. The future hosted runner adopts the same contracts.

## Principles

- A suite is a lightweight, path-like grouping of evals.
- Suite IDs use dot-separated paths; hierarchy is presentation only.
- The canonical eval reference is `suiteId#evalId`.
- Eval IDs remain stable if suites are reorganized.
- One run owns one or more independent trials.
- One trial owns one trajectory, workspace, scoring result, and report tree.
- The dashboard consumes serializable metadata and reports, never executable closures or secrets.
- Core examples and generic APIs remain provider-neutral; use One Piece references for fictional examples.
- Ordinary tests must not invoke Pi or external models.

## Phase 0 — Effect, Schema, structured logs, and Hono foundation

This phase is a prerequisite for remaining dashboard and hosted-runner work. It preserves the versioned local report tree while moving execution and HTTP boundaries onto shared typed infrastructure.

- [x] Add Effect, Effect Schema, and Hono dependencies with package-level ownership rules.
- [ ] Define Schema contracts for report manifests/summaries, catalog projections, trajectory events, API envelopes, and typed API errors.
  - [x] Add initial schemas for run/trial metadata, run summaries, errors, status, and API errors.
- [ ] Validate report JSON when reading/writing at storage boundaries; retain report schema version compatibility.
- [ ] Introduce Effect services/layers for clock/ID generation, report storage, workspace provisioning, registry/catalog access, and run execution.
  - [x] Add an Effect-native `runEvalEffect` entry point with structured start/finish logs.
- [ ] Convert runner lifecycle/resource cleanup, scoring, fixture provisioning, and report finalization to Effect with typed errors and interruption safety.
  - [x] Public `runEval` is now Effect-native; Promise execution is no longer part of the runner API.
- [x] Add structured Effect lifecycle logs annotated with available run, suite, and eval identity; trial/runtime annotations remain in the deeper runner conversion.
- [x] Replace handcrafted local HTTP routing with Hono routes in the local dashboard server; service injection remains to be completed.
- [x] Migrate the hosted Worker control API to Hono while retaining its bearer-auth boundary.
- [ ] Add Effect-layer and Hono route tests while preserving existing report/API integration coverage.

### Phase 0 exit criteria

- [ ] Core report/API values have Schema definitions and boundary validation.
- [ ] Local runner execution is Effect-managed and resource-safe.
- [ ] Local dashboard/control HTTP API is served through Hono.
- [ ] Existing report-tree and dashboard API compatibility tests pass.

## Phase 1 — Aggregate local run contract

### 1.1 Result types

- [ ] Replace the temporary recursive aggregate result field with explicit types:

  ```ts
  type TrialResult = {
    trialId: string;
    trialIndex: number;
    status: RunStatus;
    scoring?: TrialScoring;
    reportLocation: string;
    error?: RecordedError;
  };

  type RunResult = {
    runId: string;
    evalId: string;
    status: RunStatus;
    trialCount: number;
    passed: number;
    failed: number;
    scoring?: AggregateScoring;
    trials: TrialResult[];
    reportLocation: string;
  };
  ```

- [ ] Define aggregate scorer statistics: pass rate, mean overall score, mean scorer values, and score count.
- [ ] Define aggregate measurements: mean/median trial duration and token usage where supplied by AUT events.

### 1.2 Runner behavior

- [ ] Keep a private single-trial executor (`runTrial`) beneath the public aggregate `runEval` API.
- [ ] Validate `policy.trials` / `RunEvalOptions.trials` before creating report state.
- [ ] Allocate one `runId` and one `RunWriter` for an aggregate invocation.
- [ ] Allocate stable sequential trial identities:

  ```text
  trial-0001
  trial-0002
  ...
  ```

- [ ] Pass the correct `trialIndex` to each AUT and fixture context.
- [ ] Finalize every trial before finalizing the aggregate run summary.
- [ ] Preserve successful trial evidence when another trial fails.
- [ ] Define aggregate terminal status rules for successful, scored-failed, AUT-failed, and cancelled trials.

### 1.3 Report metadata

- [ ] Add optional portable suite provenance to run metadata.
- [ ] Record canonical `suiteId#evalId` when an eval belongs to a suite.
- [ ] Record agent identity and runtime identity in run/trial metadata where available.
- [ ] Keep trajectories, scores, artifacts, and workspace snapshots trial-scoped.
- [ ] Ensure candidate snapshots exclude evaluator-only workspace content.

### 1.4 Tests

- [ ] Ten requested trials create one run directory and ten trial directories.
- [ ] Trial IDs and indices are stable and sequential.
- [ ] Each trial receives an isolated candidate/evaluator workspace.
- [ ] One failed trial does not delete successful trial reports.
- [ ] Aggregate passed/failed counts and score statistics are correct.
- [ ] `trials: 1` overrides an eval’s default trial policy.
- [ ] Invalid counts (`0`, negative, non-integer) fail before report creation.
- [ ] Partial trajectories persist for failed trials.

### Exit criteria

```text
one eval invocation → one aggregate run → N real trial report trees
```

## Phase 2 — Suite-aware registry catalog

### 2.1 Registry semantics

- [ ] Preserve explicit registration:

  ```ts
  registerEvals([
    defineSuite({
      id: 'examples.starter',
      evals: [greetingEval],
    }),
  ]);
  ```

- [ ] Keep flattened `registry.evals` for execution.
- [ ] Keep explicit `registry.suites` for navigation.
- [ ] Reject empty/duplicate suite IDs and duplicate eval registration.
- [ ] Support standalone evals for backward compatibility.

### 2.2 Serializable catalog projection

- [ ] Add metadata-only suite, eval, agent, runtime, scorer, and fixture catalog entries.
- [ ] Include full eval path, suite ID/name, eval ID/name, requested trial count, and scorer descriptions.
- [ ] Project safe fixture metadata only: kind, source descriptor, destination, visibility, and future revision/provenance.
- [ ] Do not serialize functions, dynamic fixture implementations, credentials, or remote URLs.
- [ ] Derive deduplicated agent metadata from registered evals.

### 2.3 Tests

- [ ] Full eval path generation uses `suiteId#evalId`.
- [ ] Suite metadata is deterministic.
- [ ] Agent deduplication is correct.
- [ ] Fixture candidate/evaluator metadata is correct.
- [ ] Dynamic fixture representation is safe and serializable.

## Phase 3 — Local CLI

### 3.1 Commands

- [ ] `evalkit run-evals --local` runs all flattened registry evals.
- [ ] `evalkit run-evals suiteId#evalId --local` runs one eval.
- [ ] `evalkit run-suite suiteId --local` runs all evals in one suite.
- [ ] `evalkit serve-dashboard` serves the local report/dashboard API.

### 3.2 Output

- [ ] Print canonical eval paths, agent identity, runtime, fixture/scorer counts, requested trial count, per-trial measurements, and aggregate summary.
- [ ] Include aggregate pass rate, score, average runtime, token usage, and report location.
- [ ] Retain JSONL-friendly `--json` output for automation.
- [ ] Ensure CLI output has one aggregate run ID per eval invocation.

### 3.3 Pi integration

- [ ] Keep `piAgent()` process-backed and non-interactive.
- [ ] Keep Pi judge execution local and explicit.
- [ ] Add `test:pi` or equivalent opt-in integration command.
- [ ] Ensure ordinary tests never invoke Pi or spend model tokens.
- [ ] Document local Pi authentication, provider cost, and opt-in behavior.

## Phase 4 — Local dashboard API

### 4.1 Read endpoints

- [ ] `GET /v1/catalog`
- [ ] `GET /v1/suites`
- [ ] `GET /v1/evals`
- [ ] `GET /v1/agents`
- [ ] `GET /v1/fixtures`
- [ ] `GET /v1/runs`
- [ ] `GET /v1/runs/:runId`
- [ ] `GET /v1/runs/:runId/trials`
- [ ] `GET /v1/runs/:runId/trials/:trialId`
- [ ] `GET /v1/runs/:runId/trials/:trialId/trajectory`
- [ ] `GET /v1/runs/:runId/trials/:trialId/artifacts`

### 4.2 Local run actions

- [ ] `POST /v1/runs` starts one local eval.
- [ ] `POST /v1/suites/:suiteId/runs` starts every eval in one local suite.
- [ ] Validate full eval paths and suite IDs.
- [ ] Browser requests never shell out directly; the CLI-owned local server owns registry access and execution.
- [ ] Return run IDs and support polling while work is active.

### 4.3 Tests

- [ ] Empty report directory returns safe empty collections.
- [ ] Aggregate run endpoint exposes all trials.
- [ ] Trial endpoint returns measurements and scoring.
- [ ] Trajectory endpoint returns ordered events.
- [ ] Path traversal and malformed IDs reject safely.
- [ ] Local run/suite triggers validate inputs and create expected reports.

## Phase 5 — Dashboard UI

### 5.1 General

- [ ] Remove the repeated “Project-owned evaluation runner” banner.
- [ ] Replace card/blob layouts with tables.
- [ ] Keep loading, empty, and error states.
- [ ] Avoid raw JSON as the default experience.

### 5.2 Suites & evals

- [ ] Top-level suite table: suite, eval count, latest run, pass rate, status.
- [ ] Expand a suite row to reveal an inline eval table.
- [ ] Eval table: canonical path, agent, runtime, trials, latest score, status.
- [ ] Clicking an eval opens its detail view.
- [ ] Add run-suite and run-eval controls backed by local API actions.

### 5.3 Eval detail

- [ ] Show canonical path, suite, agent, runtime profiles, fixtures, transcript summary, scorers, requested trials, and recent runs.
- [ ] Provide a run-eval action.

### 5.4 Agents

- [ ] Table columns: agent ID, kind, runtimes, eval count, latest status, average runtime.
- [ ] Clicking an agent filters or opens associated evals/runs.

### 5.5 Fixtures

- [ ] Table columns: source, destination, visibility, used-by evals.
- [ ] Later add resolved revision/provenance fields for repository-backed fixtures.

### 5.6 Runs and trials

- [ ] Run table columns: short/copyable run ID, suite, eval, agent, status, trials, score, average runtime, average tokens, started time.
- [ ] Clicking a run expands its inline trial table.
- [ ] Trial columns: trial ID/index, status, score, runtime, input tokens, output tokens, started time.
- [ ] Clicking a trial opens trajectory detail.

### 5.7 Trajectory detail

- [ ] Render chronological event timeline, oldest to newest.
- [ ] Render readable message bubbles.
- [ ] Render lifecycle markers.
- [ ] Render expandable tool call/result cards.
- [ ] Render judge/scorer cards with explanation.
- [ ] Render failures as highlighted diagnostics.
- [ ] Show turn timing and token usage.
- [ ] Offer raw event inspection only as a secondary expandable diagnostic.

## Phase 6 — UI and integration tests

- [ ] Unit-test catalog and table/tree transformations.
- [ ] Unit-test full path formatting and aggregate calculations.
- [ ] Unit-test expansion state, copy ID behavior, and empty/loading/error states.
- [x] Add browser integration tests:
  - [x] expanding suite rows reveals evals;
  - [x] eval click opens detail;
  - [x] run rows expand to trials;
  - [x] trial click opens chronological trajectory;
  - [ ] local actions start runs and refresh progress;
  - [ ] candidate artifacts are visible while evaluator-only artifacts are absent.
- [x] Add Puppeteer coverage for browser back/forward and refresh restoration of run/trajectory URLs.
- [ ] Add CLI dashboard server integration tests against real temporary report trees.
- [ ] Preserve Miniflare tests for Worker/hosted API behavior as those routes are implemented.

## Phase 7 — Hosted parity

- [ ] Carry run/trial/suite identity through dispatch messages.
- [ ] Keep one coordinator authoritative for one aggregate run and its trials.
- [ ] Project aggregate runs and individual trials into the query store.
- [ ] Make hosted API responses compatible with local dashboard contracts.
- [ ] Reuse the dashboard tables and trajectory renderer rather than introducing a second data model.

## RFD/documentation requirements

- [ ] Update RFD0001 to describe aggregate run ownership and trial-scoped evidence.
- [ ] Update RFD0002 so one coordinator owns one aggregate run and its trials.
- [ ] Update implementation plans as phases are completed.
- [ ] Update the starter README and root README with the suite, trial, CLI, report-directory, and dashboard contracts.

## Final acceptance criteria

- [ ] `bun run evals` produces aggregate local runs with requested trial counts under `evalkit-results/`.
- [ ] `bun run dashboard` accurately renders suites, evals, agents, fixtures, aggregate runs, trials, and trajectories.
- [ ] Dashboard actions can start local eval/suite execution through the CLI-owned server.
- [ ] Pi eval/judge integration remains opt-in.
- [ ] Local and hosted report/API contracts are compatible.
- [ ] Type checks, unit tests, browser integration tests, CLI-server integration tests, and relevant Miniflare tests pass.
