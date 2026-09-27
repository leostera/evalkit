# RFD0002 implementation plan

**Status:** proposed; implementation should begin after the pre-acceptance questions in RFD0002 are resolved

**Design source:** [`docs/rfds/RFD0002-deployable-cloud-runner.md`](../../docs/rfds/RFD0002-deployable-cloud-runner.md)

## Outcome

Deliver a project-owned Cloudflare runner scaffolded by:

```bash
npm create evalkit@latest my-evals
```

The generated repository must run evals locally and deploy a Worker that coordinates bounded-parallel, one-Sandbox-per-trial execution. Finalized trial reports must retain the RFD0001 format, archive to Artifacts, and be discoverable through a D1 projection.

## Decision gates

Resolve these before implementing dependent phases.

### Gate A — Artifacts viability

- [ ] Confirm Artifacts access in the implementation account.
- [ ] Retrieve current Artifacts docs and generate binding types.
- [ ] Measure or confirm repository-count, repository-size, token, request, and pricing constraints.
- [ ] Decide whether one repository per trial attempt is viable.
- [ ] If not viable, amend RFD0002 with the branch-per-trial fallback or another archive adapter.
- [ ] Confirm how a finalized report tree is written through the current Git/ArtifactFS interfaces.
- [ ] Confirm a Sandbox can clone a fixture repository at a pinned commit using a read-scoped capability.
- [ ] Confirm branch/tag refs can be resolved once to immutable revisions before dispatch.
- [ ] Measure clone startup for representative fixture sizes and shallow-fetch behavior.
- [ ] Specify local-run authentication for Artifact-backed fixtures.
- [ ] Complete a security review of fixture-read and archive-write authorization from Sandbox.

### Gate B — Sandbox package line

- [ ] Pin `@cloudflare/sandbox@next` and the matching `cloudflare/sandbox:next` image.
- [ ] Generate types and verify current process, filesystem, lifecycle, and outbound APIs.
- [ ] Prove a process can outlive its launching Worker request and still report completion.
- [ ] Prove a trial report tree can be read or archived before Sandbox cleanup.
- [ ] Decide the deterministic Sandbox ID format and length bounds.

### Gate C — orchestration primitive

- [ ] Prototype Queue dispatch plus one-attempt completion callback.
- [ ] Verify callback and DO-alarm reconciliation for a process that never reports completion.
- [ ] Compare the prototype with a Workflow-per-attempt implementation for long trial durations.
- [ ] Confirm Queue plus callback/reconciliation or amend the RFD before building the full state machine.

### Gate D — generated API authentication

**Decision:** scaffold one project-scoped bearer token. The deployment stores the value as the Worker secret `EVALKIT_API_TOKEN`; the CLI stores it only in a Git-ignored local configuration file; CI supplies it from its own secret store. Account-aware login and authorization are deferred.

- [x] Choose the scaffold’s default authentication approach.
- [x] Specify local CLI token configuration: a Git-ignored project-local config file.
- [x] Specify CI credential handling: the CI secret store supplies `EVALKIT_API_TOKEN`.
- [ ] Define cryptographically secure generation, secret installation, local-config permissions, and a non-interactive supplied-token path.
- [ ] Implement constant-time bearer-token comparison without logging raw token values.
- [ ] Ensure mutation endpoints are never generated unauthenticated by default.
- [ ] Document rotation as a destructive replacement in the initial version; multi-token overlap is deferred.

## Phase 1 — package and scaffold foundations

### 1.1 Package boundaries

- [ ] Add `packages/cloudflare` for hosted runtime code.
- [ ] Add `packages/create-evalkit` with the `create-evalkit` executable.
- [ ] Decide whether registry helpers live in `@evalkit/core` or `@evalkit/cloudflare`.
- [x] Add portable agent runtime profiles to `@evalkit/core` and runner-side runtime selection.
- [ ] Keep cloud-specific runtime interpretation out of `@evalkit/core`.
- [ ] Define `@evalkit/process` with a generic JSONL process protocol.
- [ ] Add the first process-backed Codex adapter above that protocol.
- [ ] Add package exports, typechecking, tests, and workspace scripts.
- [ ] Add Miniflare E2E coverage for Worker routes, Durable Objects/alarms, Queue delivery, D1 projection, and generated-project flows as each surface is introduced.

### 1.2 `npm create evalkit` UX

- [ ] Support `npm create evalkit@latest <directory>`.
- [ ] Prompt for package manager when not inferable.
- [ ] Prompt for project name and optional API hostname assumptions.
- [ ] Prompt for optional local Git initialization.
- [ ] Generate a project bearer token unless supplied through an explicit non-interactive secret input.
- [ ] Install the generated token as `EVALKIT_API_TOKEN` through the deployment path.
- [ ] Write the token only to a Git-ignored local config file with restricted permissions where supported.
- [ ] Do not write secrets into source, fixtures, manifests, container images, or Wrangler configuration.
- [ ] Print required post-generation resource/deployment steps.
- [ ] Make non-interactive flags available for CI and fixture tests.

### 1.3 Generated repository

Generate and snapshot-test:

```text
agents/
evals/
fixtures/
judges/
src/registry.ts
src/worker.ts
evalkit.config.ts
Dockerfile
package.json
tsconfig.json
wrangler.jsonc
README.md
.gitignore
```

- [ ] Include one minimal agent, local fixture, judge, and eval.
- [ ] Include a commented example of `artifactRepository(...)` fixture configuration.
- [ ] Include one local-run test.
- [ ] Include scripts for check, test, local eval, development, deployment, type generation, and D1 migrations.
- [ ] Pin compatible Wrangler, Sandbox package, image, and Evalkit versions.
- [ ] Generate append-only Durable Object migration configuration.
- [ ] Exclude `.evalkit/`, local secrets, and generated Worker state from Git.
- [ ] Validate generated output on an empty temporary directory.
- [ ] Validate refusal or explicit behavior for a non-empty target directory.

### Phase 1 exit criteria

- [ ] A generated project installs, typechecks, tests, and runs its example eval locally.
- [ ] Generated configuration contains no placeholder secrets or invalid bindings.
- [ ] Scaffold output has deterministic snapshot tests.

## Phase 2 — registry and bundle identity

### 2.1 Registry contract

**Decision:** use explicit static imports in `src/registry.ts`; defer discovery/glob tooling and optional registry generation.

- [x] Implement `defineRegistry({ evals })`.
- [x] Reject duplicate or empty eval IDs at startup/build time.
- [x] Expose metadata-only eval listings without exposing executable closures.
- [x] Make registry lookup deterministic by eval ID.
- [x] Test duplicate definitions.
- [ ] Test missing and malformed definitions at the generated Worker boundary.

### 2.2 Trial entrypoint

- [ ] Add an internal command that executes exactly one registered trial.
- [ ] Accept only serializable run, trial, attempt, eval, and parameter input.
- [ ] Write the standard RFD0001 trial report beneath a supplied output root.
- [ ] Return a small machine-readable terminal result.
- [ ] Preserve partial reports on timeout, cancellation, and AUT failure.
- [ ] Reject attempts to select an eval not in the deployed registry.

### 2.3 Artifact fixture descriptors

- [ ] Add `artifactRepository({ repository, ref, subdirectory?, dst, visibility })` to the fixture model.
- [ ] Keep repository descriptors serializable and free of remote URLs or credentials.
- [ ] Resolve every declared ref to one immutable revision during run creation.
- [ ] Reject unresolved refs before creating dispatch messages.
- [ ] Add resolved fixture identity to run and trial manifests.
- [ ] Ensure all trials in one run receive byte-identical resolved fixture descriptors.
- [ ] Add local resolution and clone support using a narrowly scoped read capability.
- [ ] Design a project-owned workflow or CLI command for creating and publishing fixture repositories.
- [ ] Ensure fixture publication never embeds write credentials in Git remotes or source files.
- [ ] Test candidate and evaluator visibility for cloned fixture trees.
- [ ] Test subdirectory selection, missing paths, duplicate destinations, and path containment.

### 2.4 Bundle version

- [ ] Define a serializable `BundleIdentity` schema.
- [ ] Record Evalkit version, registry hash, lockfile hash, and image/deployment identity.
- [ ] Read an optional source revision from generated build configuration.
- [ ] Include bundle identity in every run and trial manifest.
- [ ] Fail dispatch on a Worker/trial-image registry mismatch.

### Phase 2 exit criteria

- [ ] The generated trial image executes one registered eval by ID.
- [ ] Two builds with changed eval code produce different registry identities.
- [ ] Worker metadata and trial image identity can be compared before execution.

## Phase 3 — one remote trial spike

This phase intentionally has no Queue, retry, or high concurrency.

- [ ] Implement the generated Worker entrypoint and environment types.
- [ ] Export the pinned Sandbox class correctly.
- [ ] Add a temporary authenticated endpoint that launches one trial.
- [ ] Start a Sandbox with a deterministic spike ID.
- [ ] Clone one Artifact-backed fixture at the run-pinned revision into a staging directory.
- [ ] Copy the selected fixture tree into its candidate or evaluator destination.
- [ ] Remove Git credential configuration before the AUT starts.
- [ ] Launch the trial process using argv, explicit cwd, and bounded environment.
- [ ] Observe process completion using current Sandbox APIs.
- [ ] Retrieve and validate the standard report tree.
- [ ] Destroy or clean up the Sandbox after report handling.
- [ ] Record timings and failure diagnostics.

### Phase 3 validation

- [ ] Successful trial.
- [ ] AUT failure with partial trajectory.
- [ ] Process exits non-zero.
- [ ] Process exceeds timeout and is killed.
- [ ] Worker client disconnects after launch.
- [ ] Candidate and evaluator workspace isolation remains intact inside Sandbox.
- [ ] A moving fixture branch after run creation does not change the trial’s pinned contents.
- [ ] Trial execution cannot mutate the source fixture repository.

### Phase 3 exit criteria

- [ ] One deployed request produces one valid remote RFD0001 report.
- [ ] The trial process is not coupled to the lifetime of the client connection.

## Phase 4 — Artifact output archival

### 4.1 Control plane

- [ ] Reuse the generated Artifacts binding and namespace used for fixture resolution.
- [ ] Keep fixture repository read capabilities separate from output repository write capabilities.
- [ ] Create deterministic, collision-safe attempt repository names.
- [ ] Store repository identity without embedding credentials.
- [ ] Define repository lifecycle and retention ownership.

### 4.2 Data plane

- [ ] Implement finalized report-tree archival.
- [ ] Never commit every trajectory event independently.
- [ ] Preserve report-relative paths and binary bytes.
- [ ] Resolve and record an immutable revision after push.
- [ ] Verify clone/read access using a read-scoped token.
- [ ] Revoke or expire write capability after archival.
- [ ] Keep broad Artifacts credentials out of Sandbox.
- [ ] Scrub archive credentials from process output and report files.

### 4.3 Archive failures

- [ ] Distinguish report-generation failure from archive failure.
- [ ] Keep the Sandbox/report available for bounded archive retries.
- [ ] Ensure a retry cannot overwrite another attempt.
- [ ] Record terminal archive failure with enough recovery metadata but no secrets.

### Phase 4 exit criteria

- [ ] A remote trial report can be cloned from its Artifact repository at the recorded revision.
- [ ] Candidate workspace files, including cloned fixture changes, are present; evaluator-only files are absent.
- [ ] Source fixture repositories remain at their original revisions.
- [ ] No broad account credential entered the Sandbox.

## Phase 5 — RunCoordinator Durable Object

### 5.1 Schema and migrations

- [ ] Define SQLite tables for run, trials, attempts, transition log, and idempotency keys.
- [ ] Add the first `new_sqlite_classes` migration.
- [ ] Initialize schema in constructor concurrency blocking only.
- [ ] Add indexes for status and deadline reconciliation.

### 5.2 State machine

- [ ] Implement `create` with exactly-once semantics.
- [ ] Implement trial allocation.
- [ ] Implement `markDispatching` duplicate suppression.
- [ ] Implement `markRunning`.
- [ ] Implement idempotent `complete` and `fail` keyed by trial and attempt.
- [ ] Compute terminal run status from persisted trial states.
- [ ] Reject illegal transitions with typed errors.
- [ ] Persist before updating in-memory state or broadcasting.

### 5.3 Reconciliation

- [ ] Set an alarm for the nearest active attempt deadline.
- [ ] Mark orphaned attempts timed out after policy thresholds.
- [ ] Schedule eligible retry attempts.
- [ ] Reschedule alarms while active work remains.
- [ ] Test DO eviction between every major transition.

### 5.4 Cancellation

- [ ] Persist `cancelling` before external termination work.
- [ ] Reject queued/stale dispatch after cancellation.
- [ ] Issue best-effort process termination for active attempts.
- [ ] Handle late callbacks deterministically.
- [ ] Reach `cancelled` only after active attempts are terminal or reconciled.

### Phase 5 exit criteria

- [ ] State-machine tests cover every legal and illegal transition.
- [ ] Duplicate callbacks do not alter counters twice.
- [ ] Eviction and restart preserve correct run state.

## Phase 6 — Queue fan-out and bounded parallelism

### 6.1 Dispatch

- [ ] Add Queue producer and consumer bindings to the generated project.
- [ ] Emit one serializable message per initial trial.
- [ ] Include bundle version and attempt identity.
- [ ] Validate messages before processing.
- [ ] Ask the coordinator for a dispatch decision before launching.

### 6.2 Concurrency

- [ ] Add conservative generated Queue consumer concurrency.
- [ ] Enforce `maxTrialsPerRun` at submission.
- [ ] Enforce `maxAttempts` in the coordinator.
- [ ] Expose configured and observed concurrency metrics.
- [ ] Document that requested trials are bounded, not launched without limit.

### 6.3 Completion callback

- [ ] Mint a one-attempt, expiring completion capability.
- [ ] Store only a safe validator/hash when possible.
- [ ] Authenticate callback before reading its body.
- [ ] Validate attempt identity, bundle identity, report status, and archive reference.
- [ ] Make callback processing idempotent.
- [ ] Never log the raw capability.

### 6.4 Retry behavior

- [ ] Classify dispatch, infrastructure, timeout, eval, and archive outcomes.
- [ ] Retry only policy-approved infrastructure outcomes.
- [ ] Assign a new attempt number, Sandbox ID, and archive destination.
- [ ] Preserve all earlier attempt evidence.
- [ ] Add poison-message and terminal-failure handling.

### Phase 6 load validation

Run staged tests, stopping when account limits or cost thresholds require review:

- [ ] 2 concurrent trials.
- [ ] 10 trials with bounded concurrency.
- [ ] 100 trials with bounded concurrency.
- [ ] Mixed fast, slow, failed, timed-out, and retried trials.
- [ ] Duplicate Queue delivery injection.
- [ ] Coordinator eviction during dispatch and completion.

### Phase 6 exit criteria

- [ ] Trials execute in separate Sandboxes up to configured concurrency.
- [ ] Every requested trial reaches one durable terminal state.
- [ ] No duplicate delivery creates duplicate accounting or overwrites evidence.

## Phase 7 — D1 query projection

### 7.1 Schema

- [ ] Add migrations for `runs` and `trial_attempts`.
- [ ] Record a resolved fixture-set hash on each run.
- [ ] Add indexes for eval ID, status, source, bundle version, fixture-set hash, and time.
- [ ] Keep schema fields versioned and documented.

### 7.2 Projection writer

- [ ] Project run creation and terminal transitions idempotently.
- [ ] Project every attempt and Artifact reference.
- [ ] Record `local`, `ci`, or `remote` source.
- [ ] Treat D1 failure as projection lag, not coordinator rollback.
- [ ] Add retry/reconciliation for missing projection rows.

### 7.3 Query API

- [ ] List runs with bounded pagination.
- [ ] Filter by eval ID, status, source, and bundle version.
- [ ] Retrieve run and attempt summaries.
- [ ] Return Artifact references without write credentials.
- [ ] Identify projection freshness or incompleteness.

### Phase 7 exit criteria

- [ ] A completed run is discoverable without scanning Durable Objects or Artifacts.
- [ ] Replaying projection writes does not duplicate rows.
- [ ] Reconciliation repairs intentionally dropped projection writes.

## Phase 8 — HTTP API and live progress

### 8.1 Authenticated API

- [ ] Implement versioned routing for eval listing, run creation, status, cancellation, events, and archives.
- [ ] Validate content types, body size, IDs, parameters, and trial count.
- [ ] Apply `Authorization: Bearer <EVALKIT_API_TOKEN>` to mutation endpoints.
- [ ] Use constant-time token comparison and reject malformed authorization headers.
- [ ] Keep read-only endpoints token-protected by default.
- [ ] Add request IDs and structured errors.
- [ ] Add client-request idempotency with conflict detection.

### 8.2 WebSocket progress

- [ ] Route run event connections to the coordinator.
- [ ] Send an initial persisted snapshot.
- [ ] Send monotonic transition events.
- [ ] Support reconnect by returning a fresh snapshot.
- [ ] Use current hibernation-safe APIs where applicable.
- [ ] Keep polling status available as a fallback.

### 8.3 Evalkit client

- [ ] Add remote run submission to the CLI/library.
- [ ] Follow progress without making execution depend on the connection.
- [ ] Add `--json` line-delimited machine-readable progress.
- [ ] Print report/archive locations on completion.
- [ ] Define exit codes for scored failure versus infrastructure failure.

### Phase 8 exit criteria

- [ ] CLI submits, follows, disconnects, reconnects, cancels, and inspects runs.
- [ ] Mutation endpoints reject missing, malformed, and invalid bearer tokens by default.
- [ ] Miniflare E2E tests exercise every authenticated route and verify unauthorized requests cannot create, cancel, or archive runs.

## Phase 9 — local report archival

- [ ] Add `evalkit archive <report-path> --remote <url>`.
- [ ] Validate local report schema and terminal status before upload.
- [ ] Reject absolute, escaping, symlinked, and oversized archive content.
- [ ] Register local/CI provenance and bundle identity.
- [ ] Allocate one archive destination per local trial attempt.
- [ ] Upload without granting broad account credentials to the CLI.
- [ ] Make registration and upload resumable and idempotent.
- [ ] Leave local reports untouched on failure.
- [ ] Project archived local runs into D1.

### Phase 9 exit criteria

- [ ] A local report appears in the same query API as remote runs.
- [ ] Its archived bytes validate against the original report tree.
- [ ] Re-running archive after interruption does not duplicate the run.

## Phase 10 — hardening and release

### Reliability

- [ ] Fault-inject Worker exceptions, Queue duplicates, Sandbox crashes, callback loss, archive failure, D1 failure, DO eviction, and client disconnects.
- [ ] Document retry and recovery playbooks.
- [ ] Add bounded retention and cleanup behavior for abandoned Sandboxes and write tokens.
- [ ] Verify no execution path leaves a run permanently `running` without an alarm.

### Security

- [ ] Threat-model Worker bearer token, completion callback, Sandbox egress, fixtures, report archives, and local upload.
- [ ] Verify evaluator-only files never enter candidate snapshots.
- [ ] Verify secrets do not enter logs, manifests, trajectories, or image layers.
- [ ] Add report/event/evidence size limits.
- [ ] Review generated defaults before release.

### Documentation

- [ ] Generated README: local authoring, resource setup, deploy, run, inspect, cancel, archive, and troubleshoot.
- [ ] Package docs for registry, cloud runner policy, API authentication, and report retrieval.
- [ ] Architecture and failure-semantics documentation.
- [ ] Cost and concurrency guidance based on measured behavior.
- [ ] Artifacts availability and fallback caveat.

### Release criteria

- [ ] Fresh scaffold deploys from documented prerequisites.
- [ ] Local and remote example evals produce schema-compatible reports.
- [ ] Bounded parallel run completes with correct aggregation and immutable attempt archives.
- [ ] Local archive ingestion works.
- [ ] All package checks, generated-project checks, Miniflare E2E tests, integration tests, and fault-injection suites pass.
- [ ] RFD0002 pre-acceptance questions are resolved in the RFD, not only in this checklist.

## Deferred work

These remain outside RFD0002 and require separate design:

- multi-tenant hosted Evalkit service;
- public report publishing;
- leaderboard and cross-run statistical methodology;
- organization-wide federation;
- multi-provider hosted runtime;
- adversarial separation between evaluator code and arbitrary trial-image code;
- matrix submissions containing several eval IDs unless RFD0002 is amended before acceptance.
