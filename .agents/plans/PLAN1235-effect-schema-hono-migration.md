# PLAN1235 — Effect, Schema, structured logging, and Hono migration

**Status:** active

## Goal

Move Evalkit execution, serialization boundaries, logging, and HTTP routing onto Effect and Hono without breaking public eval-authoring ergonomics or the versioned `evalkit-results/` report format.

## Scope and constraints

- Eval authoring remains plain declarative TypeScript: `defineEval`, `defineAgent`, fixtures, scorers, and suites do not require callers to construct Effects.
- Adapter, runner, store, workspace, and API implementations use Effect.
- Schema validates serialized values at report, API, and JSON boundary crossings.
- Hono owns HTTP routing and HTTP validation/adaptation; Effect services own business execution.
- Runner/library code uses structured Effect logging instead of `console` output.
- CLI human-readable results remain a presentation concern.
- Local and hosted APIs share route contracts; hosted auth stays at the Worker boundary.
- Existing report format remains compatible unless a deliberately versioned change is required.

## Work breakdown

### 1. Dependency and package conventions

- [x] Add `effect` and `hono` dependencies at the appropriate workspace packages.
- [ ] Choose and pin the Effect Schema import/API compatible with the selected Effect version.
- [ ] Document import rules: `@evalkit/core` defines serializable contracts; runner owns execution services; CLI/cloudflare own transport adapters.
- [ ] Add only required platform integrations; do not spread Bun/Worker dependencies into provider-neutral core.

### 2. Schema contracts

- [ ] Define schemas for IDs, status, recorded errors, AUT identity/runtime identity, trajectory events, score results, trial summaries, run summaries, and artifact entries.
  - [x] Initial schemas for status, errors, AUT identity, run/trial metadata, run summaries, and API errors.
- [ ] Define schemas for catalog, suite, eval, agent, fixture, run, trial, trajectory, and API response envelopes.
- [ ] Add encode/decode helpers at filesystem and HTTP boundaries.
  - [x] Validate local run/trial metadata and aggregate summaries with Effect Schema before writing.
- [ ] Return typed/schema-safe API validation errors rather than unchecked casts.

### 3. Effect services and errors

- [ ] Define tagged errors for invalid eval configuration, undeclared runtime, fixture failure, AUT failure, scorer failure, report failure, and invalid report data.
  - [x] Add initial tagged error types for AUT, fixture, report, and scoring failures.
- [ ] Define layers/services for registry/catalog access, report storage, workspace lifecycle, clock/IDs, and run execution.
  - [x] Add an Effect-native `runEvalEffect` entry point with structured lifecycle logs.
- [ ] Convert the runner to Effect with scoped acquisition/release and interruption-safe report finalization.
  - [x] Public `runEval` is now an Effect program with structured lifecycle logs; the internal execution implementation is not exported.
- [x] Make the public runner entry point Effect-native; callers explicitly execute it with `Effect.runPromise` at application boundaries.

### 4. Structured logging

- [x] Annotate Effect runner lifecycle logs with available run, suite, and eval identity; extend trial/runtime annotations during the deeper runner conversion.
- [ ] Emit lifecycle/scorer/workspace/report logs through Effect.
- [ ] Provide CLI-local logger configuration and a JSONL-capable option.
- [ ] Ensure credentials and fixture contents are not logged.

### 5. Hono API

- [x] Build reusable Hono app factory from injected catalog/report/run services for the initial hosted catalog surface.
- [x] Migrate local CLI dashboard/control API routes to Hono.
- [x] Migrate hosted Worker catalog/run API routes while preserving bearer authentication.
- [ ] Add request schemas for run/eval/suite mutation inputs.
- [ ] Retain route paths and response envelopes already consumed by the dashboard.

### 6. Tests and rollout

- [ ] Add schema round-trip and invalid-value tests.
- [ ] Add Effect service/layer tests and cleanup/failure tests.
- [ ] Add Hono route tests for success, validation, missing reports, and traversal rejection.
- [ ] Run full formatting, type checks, test suite, build, and diff checks.
- [ ] Update PLAN1234 checkboxes as this prerequisite phase completes.

## Exit criteria

- [ ] All serialized core/report/API values are schema-backed at their boundaries.
- [ ] Runner resource management and structured logs use Effect.
- [ ] Local and hosted HTTP adapters use Hono.
- [ ] Existing eval authoring API and report consumers continue to work.
