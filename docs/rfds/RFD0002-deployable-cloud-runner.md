# RFD0002 - Deployable Cloud Runner

- Feature Name: `deployable-cloud-runner`
- Status: Draft
- Author: `leostera`
- Start Date: `2026-09-21`
- Updated: `2026-09-21`
- Discussion PR: `TBD`
- Tracking Issue: `TBD`

## Summary

This RFD proposes a deploy-your-own Cloudflare runner for Evalkit. An eval author creates a repository with `npm create evalkit`, defines agents, fixtures, judges, and evals using the Evalkit library, and deploys a generated Worker plus trial-executor container to their own account. The Worker accepts serializable run requests, a per-run Durable Object coordinates durable state and live progress, a Queue fans trials out at bounded concurrency, and each trial executes in its own Sandbox. Versioned fixture trees may live in Cloudflare Artifacts and are cloned at an immutable revision into each trial workspace. Completed trial report trees use the same format as local Evalkit runs and are archived independently in Artifacts; D1 stores a queryable projection across runs and trials. Evalkit remains a library and scaffold rather than a centrally hosted multi-tenant service.

## Motivation

Local execution is the fastest feedback loop for authoring and debugging an eval, but it is not the best environment for running tens or hundreds of independent trials. Large experiments need:

- parallel execution without shared workspaces;
- durable coordination when a request, Worker isolate, or client disconnects;
- independent retry and timeout behavior per trial;
- live progress and cancellation;
- stable provenance for the exact deployed eval bundle;
- durable, inspectable trajectories, scores, and candidate workspace snapshots;
- one query surface across locally archived and remotely executed runs.

Eval definitions are executable TypeScript values. They may contain agent adapters, dynamic fixtures, and predicate functions, so a client cannot serialize a `defineEval({...})` object and submit it to a generic remote service. The deployed runtime must already contain the registered eval code and fixture material. This makes a project-owned deployment a natural fit: the repository is both the authoring environment and the source for the deployed runner bundle.

A single Sandbox per whole run would simplify orchestration but would serialize or co-locate trials, make retries coarse, and permit accidental workspace interference. A single Sandbox per trial gives Evalkit an isolation and retry boundary that matches its report model.

## Goals

- Scaffold a complete Evalkit repository with `npm create evalkit`.
- Let authors deploy their own runner without depending on an Evalkit-operated service.
- Register eval definitions statically in the deployed bundle and address them by stable ID.
- Coordinate each submitted run with one Durable Object.
- Dispatch trials through a Queue at configurable, bounded concurrency.
- Execute each trial in a separate Sandbox and filesystem workspace.
- Preserve the report format defined by RFD0001 across local and remote execution.
- Resolve Artifact-backed fixture refs once per run and clone the same immutable revision into every trial Sandbox.
- Archive each finalized trial report and candidate snapshot in Artifacts without concurrent repository writers.
- Maintain a D1 projection for listing, filtering, and comparing runs without scanning artifact repositories.
- Support live status, idempotent completion, retries, reconciliation, and cancellation.
- Allow finalized local runs to be registered and archived into the same deployment later.
- Record enough bundle and deployment identity to reproduce or explain a run.

## Non-goals

- Operating a shared Evalkit software-as-a-service product.
- Accepting arbitrary source code or JavaScript closures in the run submission API.
- Providing unbounded parallelism; execution is always constrained by configured concurrency and account limits.
- Sharing one mutable candidate workspace across trials.
- Defining cross-run ranking, leaderboard, or visualization policy.
- Publishing raw trajectories or artifacts publicly.
- Supporting multiple cloud providers in this RFD.
- Replacing the local runner used during eval authoring.
- Guaranteeing exact replay of nondeterministic external agents or models.
- Finalizing product limits, pricing, or availability assumptions; these must be checked against current Cloudflare documentation before implementation.

## Guide-level explanation

### Create a project

An author starts with:

```bash
npm create evalkit@latest my-evals
cd my-evals
npm install
```

The generated project is an ordinary repository owned by the author:

```text
my-evals/
├── agents/
│   └── support-agent.ts
├── evals/
│   └── support.eval.ts
├── fixtures/
│   └── support/
├── judges/
│   └── response-quality.ts
├── src/
│   ├── registry.ts
│   └── worker.ts
├── evalkit.config.ts
├── Dockerfile
├── package.json
├── tsconfig.json
└── wrangler.jsonc
```

`wrangler.jsonc` is the generated default because it composes naturally with generated configuration and comments. Evalkit may later offer TOML output, but the scaffold does not generate two equivalent configuration formats.

The author defines evals using the same library API used by the local runner. Fixtures may come from the project checkout or from a versioned Artifact repository:

```ts
// evals/support.eval.ts
export default defineEval({
  id: 'support-response',
  agent: supportAgent,
  fixtures: [
    artifactRepository({
      repository: 'support-starter',
      ref: 'fixtures-v3',
      dst: 'workspace',
      visibility: 'candidate',
    }),
    file('./fixtures/support/hidden-rubric.json', {
      dst: 'rubric.json',
      visibility: 'evaluator',
    }),
  ],
  transcript: [user('Help me resolve this issue.')],
  scoring: [responseQuality],
});
```

The project registers executable eval values statically:

```ts
// src/registry.ts
import { registerEvals } from '@evalkit/core';
import supportResponse from '../evals/support.eval';

export default registerEvals([supportResponse]);
```

**Decision:** the first registry is an explicit `src/registry.ts` import list. Evalkit does not use bundler-specific glob discovery in its initial Worker or Sandbox runtime. A future registry-generation command may update this file, but the deployed set remains visible in source control.

Static registration ensures the Worker and trial image agree on which eval IDs exist. It also avoids runtime source evaluation in the Worker. Artifact fixture descriptors are data, not executable remote source: before dispatch, the runner resolves each declared ref to one immutable revision and records it in the run manifest.

### Agent runtime profiles

An AUT may declare multiple runtime profiles under one logical agent identity:

```ts
const codex = defineAgent({
  id: 'codex',
  runtimes: {
    local: {
      kind: 'process',
      configuration: { command: ['codex', 'exec'] },
    },
    sandbox: {
      kind: 'process',
      configuration: {
        image: 'registry.example.com/evalkit-codex@sha256:...',
        command: ['codex', 'exec'],
        egress: 'provider-api',
      },
    },
  },
  async start({ context, runtime, onEvent }) {
    // Adapter-specific session implementation.
  },
});
```

`defineAgent` remains transport-neutral. Core only carries a selected runtime name (`local`, `sandbox`, or `remote`), a runtime kind, and serializable configuration. Concrete packages interpret the profile: a process adapter can launch a command and normalize a documented JSONL event protocol; an Agents SDK adapter can connect to a remote agent; a Sandbox package can prepare the selected image and egress profile.

Sandbox process dependencies are installed into a pinned trial image during build, not installed during each trial. Live provider credentials never enter source, fixture repositories, image layers, or reports. The Worker holds provider credentials and supplies narrowly scoped outbound authorization or a short-lived attempt credential only when required by the concrete provider. Interactive user-login sessions are out of scope for the first hosted runtime.

### Run locally

Local authoring stays available:

```bash
npx evalkit run support-response --local
```

This uses the local runner and local report store from RFD0001.

### Deploy the project-owned runner

The author deploys the Worker, Durable Object, Queue consumer, D1 database bindings, Sandbox class, and trial image through the generated project:

```bash
npm run deploy
```

The scaffold uses one project-scoped bearer token for its optional HTTP control API. `npm run deploy` generates a cryptographically random value when one is not supplied, installs it as the Worker secret `EVALKIT_API_TOKEN`, and writes it only to a local, Git-ignored CLI configuration file. It never places the token in source code, a fixture, the container image, generated manifests, or `wrangler.jsonc`. CI receives the same value from its own secret store. The exact deployment command may wrap Wrangler, but generated infrastructure remains visible and editable. There is no hidden Evalkit account or control plane.

### Submit a remote run

Once deployed:

```bash
npx evalkit run support-response \
  --remote https://evals.example.com \
  --trials 100
```

The CLI submits only serializable input:

```json
{
  "evalId": "support-response",
  "trials": 100,
  "parameters": {},
  "clientRequestId": "ci-481-support-response"
}
```

The server resolves `support-response` from its deployed registry. It does not receive eval functions from the client.

The response identifies the durable run:

```json
{
  "runId": "run_01K5...",
  "status": "queued",
  "bundle": {
    "version": "git:abc123",
    "registryHash": "sha256:..."
  }
}
```

The CLI follows status over WebSocket or polls HTTP:

```text
support-response · run_01K5...
42/100 complete · 3 failed · 55 running/queued
mean score 0.84
```

### Remote execution lifecycle

The hosted path is:

```text
CLI or API client
       │
       ▼
Project-owned Worker API
       │
       ▼
RunCoordinator Durable Object (one per runId)
       │ creates durable trial records
       │ emits one dispatch message per trial
       ▼
Queue
       │ bounded consumer concurrency
       ├──► Sandbox trial 001 ──► trial report ──► Artifact repo 001
       ├──► Sandbox trial 002 ──► trial report ──► Artifact repo 002
       └──► Sandbox trial 003 ──► trial report ──► Artifact repo 003
       │
       ▼
RunCoordinator records idempotent completions
       │
       ├──► D1 run/trial projection
       └──► WebSocket progress subscribers
```

“Parallel” means up to the configured and available concurrency, not all requested trials without limit. The Queue absorbs bursts and dispatches work as capacity becomes available.

### Reports and Artifacts

Before execution, each Sandbox clones its resolved Artifact fixture repositories into the selected candidate or evaluator workspace. All trials in one run receive the same recorded fixture revisions, even if a named branch or tag moves after submission.

Each Sandbox then builds the standard RFD0001 trial report on its local filesystem:

```text
trial-report/
├── manifest.json
├── trajectory.jsonl
├── scoring.json
├── summary.json
└── artifacts/
    └── candidate/
```

When the trial is finalized, that tree is pushed into an Artifact repository dedicated to the trial attempt. The completion record includes the repository and immutable revision.

One repository per trial attempt avoids concurrent Git writers and preserves failed attempts separately:

```text
run_01K5.../
├── trial_001/attempt_1 → artifact repository + revision
├── trial_002/attempt_1 → artifact repository + revision
└── trial_002/attempt_2 → artifact repository + revision
```

Artifacts is both the versioned source of Artifact-backed fixture trees and the canonical detailed evidence store for trial outputs. Fixture repositories and trial report repositories have separate permissions and lifecycles. D1 is the query index, not the source of fixture, trajectory, or workspace bytes.

### Archive a local run

A local run uses the same report layout and can later be submitted to the project-owned deployment:

```bash
npx evalkit archive evalkit-results/run_01K4... \
  --remote https://evals.example.com
```

The deployment validates the finalized report, allocates archive destinations, records provenance as `local` or `ci`, and indexes the archived run alongside hosted runs. Archival failure does not delete or mutate the local report.

## Reference-level explanation

### Concepts

#### Project

A repository containing Evalkit definitions, generated deployment entrypoints, and infrastructure configuration. A project is deployed by its owner.

#### Registry

A statically imported map from `evalId` to executable `EvalDefinition`. The registry is present in the trial image. The Worker may contain a metadata-only projection for request validation and listing.

#### Bundle version

The immutable identity of deployed eval code and fixture material. It should include, where available:

- source revision such as a Git commit;
- a registry-content hash;
- package lock hash;
- deployment/version identifier;
- trial image identifier;
- Evalkit package version.

A run always records its bundle version.

#### Run

One submitted invocation of one registered eval with a requested number of independent trials and serializable parameters. The run is the aggregate parent of its trial attempts; one RunCoordinator Durable Object owns its active state.

#### Trial

One independent execution of the eval. A trial has one or more attempts. Every attempt gets a distinct Sandbox identity and archive location.

#### Attempt

One dispatch of a trial. Retry attempts never overwrite an earlier attempt report.

### Generated project contract

The initial scaffold should produce explicit source files rather than hiding behavior in a remote service. A generated project contains:

- a Worker entrypoint using Evalkit’s request handler;
- exported Durable Object and Sandbox classes required by bindings;
- a pinned trial image that contains declared Sandbox process dependencies;
- a registry module;
- a Dockerfile or supported trial-image definition containing the eval bundle;
- Queue producer and consumer bindings;
- Durable Object bindings and migrations;
- D1 binding and migrations;
- Artifacts binding and namespace configuration;
- a project-scoped bearer-token boundary for the optional HTTP control API;
- local development and deployment scripts;
- one example agent, fixture, judge, and eval;
- tests for registry loading and one local eval.

The expected API is conceptually:

```ts
// src/worker.ts
import { createEvalkitWorker } from '@evalkit/cloudflare';
import registry from './registry';

export { RunCoordinator, TrialSandbox } from '@evalkit/cloudflare';

export default createEvalkitWorker({ registry });
```

The concrete export arrangement must follow the installed Sandbox SDK and generated Worker types. The helper must not conceal required Wrangler bindings or Durable Object migrations.

### Run submission API

The first HTTP API should be small and versioned:

```text
POST   /v1/runs
GET    /v1/runs/:runId
GET    /v1/runs/:runId/events
POST   /v1/runs/:runId/cancel
GET    /v1/evals
POST   /v1/archives
```

Example request:

```ts
interface CreateRunRequest {
  evalId: string;
  trials: number;
  parameters?: JsonObject;
  clientRequestId?: string;
}
```

`clientRequestId`, when supplied, provides project-scoped idempotency. Submitting the same key and equivalent body returns the existing run. Reusing the key with a different body is a conflict.

The Worker requires `Authorization: Bearer <token>` for mutation endpoints. It compares the presented token with `env.EVALKIT_API_TOKEN` without logging either value, then validates the request, verifies the eval ID against registry metadata, applies project limits, allocates a run ID, and forwards creation to `env.RUNS.getByName(runId)`. Read-only endpoints may use the same token initially; public read access is not scaffolded by default.

### RunCoordinator Durable Object

There is one Durable Object instance per `runId`. There is never one global coordinator for all runs.

The coordinator owns the strongly consistent active state machine:

```ts
type RunStatus =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'completed_with_failures'
  | 'failed'
  | 'cancelled';

type TrialStatus =
  'queued' | 'dispatching' | 'running' | 'completed' | 'failed' | 'cancelled';
```

Its RPC surface is conceptually:

```ts
interface RunCoordinatorApi {
  create(spec: CreateRunSpec): Promise<RunSnapshot>;
  markDispatching(trialId: string, attempt: number): Promise<DispatchDecision>;
  markRunning(input: TrialStarted): Promise<void>;
  complete(input: TrialCompletion): Promise<void>;
  fail(input: TrialFailure): Promise<RetryDecision>;
  cancel(reason?: string): Promise<RunSnapshot>;
  snapshot(): Promise<RunSnapshot>;
}
```

All transitions are idempotent. Completion is keyed by `(trialId, attempt)`. A duplicate Queue delivery, callback, or retry cannot increment counters twice.

The coordinator persists run/trial state before broadcasting it. In-memory caches and WebSocket connections are secondary. The coordinator may use an alarm to reconcile running attempts that have exceeded their deadline or never reported completion.

The coordinator does not execute trials and does not perform long external operations while holding a concurrency barrier.

### Queue dispatch

After persisting trial records, the coordinator or Worker emits one message per trial:

```ts
interface TrialDispatchMessage {
  runId: string;
  trialId: string;
  evalId: string;
  bundleVersion: string;
  attempt: number;
  parameters: JsonObject;
  resolvedFixtures: ResolvedArtifactFixture[];
}
```

Queue delivery is at least once. Before launching a Sandbox, the consumer calls `markDispatching`. The coordinator returns whether that exact attempt should proceed. Stale or duplicate messages become no-ops.

Queue consumer concurrency bounds active launch pressure. A separate project configuration sets:

```ts
interface CloudRunnerPolicy {
  maxTrialsPerRun: number;
  maxConcurrentDispatches: number;
  trialTimeoutMs: number;
  maxAttempts: number;
}
```

Account and product limits remain a stricter upper bound. The generated defaults should be conservative.

### Artifact-backed fixtures

Eval definitions may reference a versioned Artifacts repository as a fixture source:

```ts
interface ArtifactRepositoryFixture {
  kind: 'artifact-repository';
  repository: string;
  ref: string;
  subdirectory?: string;
  dst: string;
  visibility: 'candidate' | 'evaluator';
}
```

`repository` is a logical name within the project’s configured Artifacts namespace, not an arbitrary credential-bearing remote URL. `ref` may be an author-friendly branch, tag, or revision in source code, but run creation resolves it to an immutable commit before emitting any trial messages. The resolved fixture set becomes part of `CreateRunSpec`, bundle provenance, and every trial manifest:

```ts
interface ResolvedArtifactFixture {
  repository: string;
  revision: string;
  subdirectory?: string;
  dst: string;
  visibility: 'candidate' | 'evaluator';
}
```

Resolution happens once per run. Trials never independently resolve a moving branch or tag. If resolution fails, the run fails before dispatch; Evalkit does not silently fall back to another ref or local directory.

For each attempt, the runner:

1. obtains a short-lived read capability scoped to one fixture repository;
2. clones or fetches the resolved revision into a temporary staging location;
3. copies the whole tree, or the declared `subdirectory`, into the contained candidate or evaluator destination;
4. records the repository and resolved revision in the trial manifest;
5. removes credential material and staging Git configuration before the AUT starts;
6. expires or revokes the read capability after provisioning.

A shallow fetch of the pinned revision is preferred when supported. Fixture repositories are read-only inputs: candidate changes are never pushed back to them. Final candidate state is archived in the attempt’s separate report repository.

Candidate-visible Artifact fixtures are available to the AUT after provisioning. Evaluator-visible Artifact fixtures are available to scoring code through the evaluator workspace. As in RFD0001, placing both workspace trees in one trial container is a capability and accidental-disclosure boundary, not protection against malicious arbitrary filesystem access within that container.

Artifact-backed fixtures also apply to local runs. The local CLI must resolve and clone the same immutable revision, either through project-owned authenticated APIs or a narrowly scoped local read credential. A local report records the resolved revision so local and hosted results can be compared. The exact local authentication flow is part of the Artifacts viability gate.

A future optimization may fork a fixture repository into a trial report repository to preserve ancestry or reduce transfer. The first implementation uses read-only clone plus a separate output repository because it keeps input immutability and output ownership unambiguous.

### Sandbox execution

Each accepted attempt maps to a deterministic Sandbox ID derived from project, run, trial, and attempt identifiers. The ID must not contain secrets.

The Queue consumer starts the trial command from the deployed image. Conceptually:

```text
bun x evalkit trial \
  --eval support-response \
  --run run_01K5... \
  --trial trial_042 \
  --attempt 1 \
  --output /evalkit/report
```

The process receives serializable parameters and narrowly scoped capabilities. It loads the statically bundled registry, executes exactly one trial, and writes the standard report tree.

The Worker must follow the installed `@cloudflare/sandbox@next` API and matching container image. Process launch returns a handle; completion must be observed through the current process APIs or a completion callback. The implementation must not assume a Worker request remains alive for the entire trial.

The initial design uses a completion callback from the trial process to the Worker, authenticated by a one-attempt capability. The coordinator alarm reconciles missing callbacks. A callback is not trusted until its attempt identity and archive reference are validated.

### Artifact archival

Artifacts stores finalized report trees, not per-event streaming writes. `trajectory.jsonl` is appended on the Sandbox filesystem during execution and archived only after the trial reaches a terminal local state.

The proposed isolation unit is one Artifact repository per trial attempt. This must be validated against current namespace repository limits and pricing before acceptance. If repository counts make that impractical, the fallback design is one repository per run with one branch per trial attempt and a coordinator-owned finalization step; concurrent direct writes to one branch are not allowed.

Fixture repositories are provisioned before AUT execution and are never used as the live report destination. The archive lifecycle for output is:

1. Allocate or resolve the attempt repository.
2. Grant only the capability needed to write that repository.
3. Push the finalized report tree.
4. Resolve and record its immutable revision.
5. Revoke or expire the write capability.
6. Notify the coordinator with the repository and revision.

No Sandbox receives an Artifacts gateway JWT or account-wide credential. The preferred implementation keeps authorization in the Worker through an outbound authorization mechanism. If the current platform requires a repository token inside the Sandbox, it must be short-lived, scoped to one attempt repository, injected only for archival, excluded from process output, and revoked after use. The exact mechanism is a pre-implementation security decision based on current Artifacts and Sandbox APIs.

Artifacts is currently limited-availability infrastructure. Access, binding APIs, authentication behavior, limits, and pricing must be verified from current documentation and generated types before implementation. The archive boundary remains explicit so a project can adopt a different implementation without changing eval definitions or report schemas.

### D1 projection

The coordinator’s storage is authoritative for active state and final trial transitions. D1 is an eventually consistent query projection across coordinator instances.

The initial schema is conceptually:

```sql
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  bundle_version TEXT NOT NULL,
  fixture_set_hash TEXT NOT NULL,
  requested_trials INTEGER NOT NULL,
  completed_trials INTEGER NOT NULL,
  failed_trials INTEGER NOT NULL,
  mean_score REAL,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE trial_attempts (
  run_id TEXT NOT NULL,
  trial_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  score REAL,
  artifact_repository TEXT,
  artifact_revision TEXT,
  sandbox_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  PRIMARY KEY (run_id, trial_id, attempt)
);
```

Projection writes are idempotent. A failed D1 projection does not roll back a completed coordinator transition or Artifact archive; it is retried and reconciled. Query responses must identify stale or incomplete projection state when relevant.

### Live progress

`GET /v1/runs/:runId/events` upgrades to a WebSocket when supported and routes to the run coordinator. Clients receive snapshots and monotonic state-change events. Read-only polling through `GET /v1/runs/:runId` remains available.

A disconnected client does not affect execution. The DO may hibernate idle WebSocket connections according to current platform guidance. The persisted run state, not the event stream, determines truth.

### Retry semantics

Retries are per trial, never per whole run. The coordinator applies policy based on failure classification:

- dispatch or transient infrastructure failure: retry when attempts remain;
- trial timeout: retry only when policy permits;
- invalid eval ID or bundle mismatch: terminal configuration failure;
- deterministic eval assertion failure: completed scored trial, not an infrastructure retry;
- archive failure: retain the local Sandbox report while retrying archival when possible;
- cancellation: no new attempts; active attempts receive best-effort termination.

Every retry has a new attempt number, Sandbox ID, and Artifact destination. Earlier evidence remains immutable.

### Cancellation

Cancellation is durable:

1. The coordinator moves the run to `cancelling`.
2. Queued or stale dispatches are rejected by `markDispatching`.
3. Active attempts receive best-effort process termination.
4. Late completion callbacks are recorded as late attempt outcomes but cannot change a cancelled trial into a successful run result.
5. The coordinator reaches `cancelled` when no active attempts remain or reconciliation marks them terminal.

### Local archive ingestion

Local archival is a separate API path from remote execution. The client submits a finalized run manifest and trial summaries first. The deployment validates:

- supported report schema version;
- terminal run and trial statuses;
- relative and contained report paths;
- score ranges and required identity fields;
- archive size limits;
- run ID collision and idempotency behavior.

Each local trial is archived under the same repository strategy as a hosted trial and projected into D1 with `source = 'local'` or `source = 'ci'`. The server never executes closures received from the archive client.

### Security and privacy

The generated runner handles untrusted or semi-trusted agent behavior and sensitive report content. It must preserve these boundaries:

- Worker API mutation endpoints require the project-scoped `EVALKIT_API_TOKEN` bearer token by default.
- Run IDs, trial IDs, and Sandbox IDs contain no secrets.
- The AUT receives candidate workspace access, never evaluator-only fixture capabilities.
- Artifact fixture refs are resolved once and pinned before trial dispatch.
- Fixture repositories are read-only and distinct from output report repositories.
- Sandboxes receive no account-wide Cloudflare credentials.
- Artifact write capability is limited to one attempt and a short lifetime.
- Completion capabilities are one-attempt, expiring, and stored or validated without logging their raw value.
- Report paths are relative and contained.
- Candidate snapshots and trajectories are private by default.
- Evaluator-only files are not archived unless an explicit future policy allows it.
- Secrets and environment variables are not copied into manifests.
- Tool output, trajectory events, and evidence are size-bounded before persistence.
- Public publishing requires a separate sanitization and approval flow outside this RFD.

Deploying a project means trusting its eval and judge code with the evaluator workspace inside its trial Sandbox. The candidate/evaluator capability split prevents accidental exposure through Evalkit APIs; it is not a defense against malicious code with arbitrary filesystem access inside the same container. Strong adversarial isolation would require separate execution boundaries and is out of scope.

### Observability

The system should emit one normalized operational event stream keyed by project, run, trial, and attempt IDs. Required observations include:

- run accepted and finalized;
- trial queued, dispatching, running, retrying, and terminal;
- Sandbox launch and process identity;
- trial duration and timeout;
- archive start, completion, revision, and failure;
- D1 projection lag/failure;
- active and configured concurrency;
- Queue retries and duplicate suppression;
- coordinator reconciliation actions.

Logs must never include completion credentials, Artifact tokens, raw environment variables, or unsanitized report contents.

### Invariants

- Eval definitions are deployed code and are never transmitted as closures in run requests.
- One run maps to exactly one RunCoordinator Durable Object.
- One trial attempt maps to exactly one Sandbox identity and one archive destination.
- Every trial in a run receives the same resolved Artifact fixture revisions.
- Fixture repositories are not mutated by trials.
- Parallelism is bounded by explicit policy and account limits.
- Queue delivery and completion callbacks are idempotent.
- A retry never overwrites an earlier attempt’s report.
- The local and hosted runners produce the same versioned report schema.
- Candidate workspaces are isolated between trial attempts.
- Evaluator-only workspace files are excluded from candidate snapshots.
- Artifacts stores finalized report trees, not the live per-event write stream.
- The coordinator is authoritative for run state; D1 is a query projection.
- A D1 failure cannot erase or invalidate an already archived trial.
- No Sandbox receives broad account credentials.
- A disconnected client cannot interrupt a run.
- Cancellation prevents new attempts but does not claim guaranteed instantaneous termination.

### Compatibility and migration

RFD0002 builds on RFD0001 and does not change the eval definition or report schema solely because execution is remote. Hosted-specific metadata is additive and belongs in run/trial manifests or archive references.

Generated projects pin compatible versions of:

- Evalkit packages;
- Wrangler;
- `@cloudflare/sandbox@next`;
- the matching Sandbox container image;
- Worker compatibility date and flags.

Upgrades that change bindings, Durable Object schemas, D1 schemas, report versions, or container APIs require generated migration steps. Existing Durable Object migrations are never edited in place; new migration tags are appended.

### Rollout and validation

The implementation should prove each boundary before attempting high concurrency:

1. Generate and deploy a minimal project with one registered eval.
2. Resolve and clone one Artifact-backed fixture at an immutable revision.
3. Execute one remote trial in one Sandbox and retrieve its report.
4. Archive one finalized report into a separate Artifact repository.
5. Coordinate one run and one trial through the Durable Object.
6. Dispatch through the Queue with duplicate-delivery tests.
7. Run multiple trials at bounded concurrency.
8. Add retries, reconciliation, and cancellation.
9. Add D1 projection and list/query APIs.
10. Add WebSocket progress.
11. Add local archive ingestion.
12. Validate larger trial counts against real limits and cost.

Acceptance requires:

- a generated repository deploys without hand-authoring hidden infrastructure;
- run requests refer only to registered eval IDs and serializable parameters;
- two or more trials execute in separate Sandboxes concurrently from the same pinned fixture revisions;
- fixture repositories remain unchanged after execution;
- duplicate Queue deliveries and callbacks do not duplicate counters or archives;
- every terminal attempt has a report or an explicit report/archive failure;
- complete reports are retrievable from immutable Artifact revisions;
- D1 can list runs and locate trial reports;
- a client disconnect does not stop execution;
- cancellation and timeout behavior are tested;
- local and hosted reports validate against the same schema;
- no broad Cloudflare credential enters a Sandbox;
- generated configuration and types pass the project’s checks.

## Drawbacks

- The architecture uses several products and has meaningful operational complexity for a library-generated project.
- One Sandbox and one Artifact repository per trial attempt can create large resource counts.
- Queue dispatch plus callbacks and reconciliation is more complex than awaiting a single process.
- D1 is an eventually consistent projection, so cross-run query state may briefly lag coordinator truth.
- Shipping a containerized trial bundle makes deploys heavier than a Worker-only library.
- Eval authors must operate and pay for their own deployment.
- Local and hosted execution can still differ because the hosted environment is Linux and isolated.
- Artifacts availability and limits may constrain the initial audience or require an alternate archive adapter.

## Rationale and alternatives

### Proposed design

The proposed architecture aligns execution and persistence boundaries with the Evalkit data model. A run coordinator owns one aggregate run and its trials; a Sandbox owns one trial attempt; an Artifact repository owns one immutable attempt report. This makes retries and parallelism understandable and avoids shared mutable filesystems or Git write conflicts.

A generated, project-owned deployment solves the executable-definition problem without creating a central code-execution service. Authors deploy exactly the eval code they reviewed, and submissions reference registered IDs.

### Simpler or narrower approach

The generated Worker could run trials serially without Queues or Sandboxes. That would reduce infrastructure but would not safely execute arbitrary artifact-oriented eval code, would limit runtime tools, and would not provide the desired trial parallelism or filesystem isolation.

A first implementation may temporarily support one in-flight Sandbox to validate the lifecycle, but the public architecture should still model independent trials so concurrency can be enabled without changing report or state contracts.

### Other alternatives considered

- **One Sandbox per run:** simpler startup and one archive destination, but trials share failure and resource boundaries, parallelism is constrained, and one stuck trial can affect the run.
- **One Artifact repository per run:** reduces repository count, but concurrent trial writers create branch or push coordination. A branch-per-trial variant remains the fallback if repository limits reject the proposed isolation unit.
- **Fork each fixture repository for every trial:** preserves Git ancestry and may reduce transfer, but couples fixture lifecycle to report ownership and complicates evaluator-only fixtures. Read-only clone plus a separate output repository is clearer initially.
- **One global Durable Object:** easy global counters, but it becomes a throughput and availability bottleneck. Per-run coordination is the natural consistency atom.
- **Durable Object directly launches and awaits every trial:** removes the Queue but couples coordination to long external work and burst fan-out. The Queue provides buffering and retryable dispatch.
- **Workflow per trial:** provides durable multi-step orchestration and may be attractive later, but adds another central abstraction before the Sandbox completion protocol is proven. Queue plus callback and reconciliation is the narrower initial design.
- **Shared hosted Evalkit service:** easier onboarding for users, but turns Evalkit into a multi-tenant code-execution service with substantial trust, isolation, billing, and operational obligations.
- **Upload eval source with each request:** flexible but unsafe and hard to reproduce. Deployed static registration gives a reviewable execution bundle.
- **Store all reports only in D1 or R2:** D1 is a poor fit for versioned file trees; R2 can hold bundles but does not provide the same repository-style inspection and Git-compatible workflow. R2 remains suitable for unusually large blobs referenced from reports.
- **Stream every trajectory event into Artifacts:** conflicts with repository-oriented archival and creates excessive write/commit overhead. The Sandbox filesystem is the live write target.

### Do nothing

Evalkit would remain a useful local library but large experiments would require each consumer to invent orchestration, isolated execution, archival, indexing, and progress protocols. Those bespoke systems would likely diverge from the local report format and make results difficult to compare or reuse.

## Prior art

RFD0001 defines Evalkit’s local execution, AUT, fixture, scoring, and report contracts. This proposal preserves those contracts and treats remote execution as orchestration around the same trial runner rather than a second evaluation engine.

The sibling Rust evaluation library under [`../agents/crates/evals`](../../../agents/crates/evals) demonstrates the value of a thin command harness, typed runtime values, durable trial IDs, normalized external-agent runs, and one shared artifact/report pipeline. RFD0002 extends those lessons into a deployable parallel runtime while keeping eval definitions library-owned.

Cloudflare’s product boundaries also inform the design:

- Durable Objects coordinate strongly consistent state per run.
- Queues buffer and dispatch independent trial work.
- Sandbox provides isolated Linux execution and filesystem/process tools.
- Artifacts stores isolated, versioned report trees.
- D1 provides cross-run relational queries.

These products fit distinct requirements; using all of them is justified only because the target behavior needs coordination, burst dispatch, code execution, versioned files, and global queries.

## Unresolved questions

### Before acceptance

- Do current Artifacts limits and pricing support one repository per trial attempt at the intended scale?
- What exact mechanism keeps Artifact read and write authorization out of the Sandbox while permitting fixture clones and Git-compatible archival?
- How should local runs obtain narrowly scoped read access to Artifact-backed fixtures?
- Should the generated project require Artifacts access, or support an archive adapter selected during scaffolding?
- What token rotation, overlap, revocation, and multi-token policy should replace the initial single bearer token?
- What is the first conservative default for maximum concurrent dispatches and maximum trials per run?
- Should a run contain exactly one eval, as proposed, or should the submission API support a matrix of eval IDs from the start?
- Is Queue plus callback/reconciliation sufficient for expected trial durations, or should a durable Workflow own each attempt?

### During implementation

- Exact generated Wrangler binding names and migration tags.
- Exact Sandbox process and filesystem APIs based on the pinned `@next` version.
- Initial generic process JSONL event protocol and the first concrete Codex adapter.
- Registry generation: explicit imports only, generated file, or build plugin.
- Bundle-version derivation when the project is deployed outside Git.
- Completion capability format, hashing, rotation, and expiry.
- Fixture repository publication and update workflow for local authors.
- Archive upload protocol and maximum file/report sizes.
- D1 projection batching and reconciliation cadence.
- WebSocket event envelope and resume behavior.
- Sandbox cleanup timing after archive success or failure.
- Whether empty candidate directories are materialized or represented only in metadata.

### Out of scope

- A centrally hosted multi-tenant Evalkit service.
- Public report hosting and sanitization.
- Cross-project federation and organization-wide indexes.
- Cross-run leaderboard and statistical methodology.
- Autoscaling policy beyond platform and Queue concurrency configuration.
- Adversarial separation of evaluator code from arbitrary code in the same trial image.

## Future possibilities

A later proposal may add matrix runs across multiple evals or AUT configurations, token rotation and Cloudflare-account-aware login/authorization, Workflows for long-lived attempts, R2 references for large binary artifacts, repository forking from versioned fixture baselines, organization-wide read-only indexes, remote report comparison, or a hosted service built on the same generated runtime. None of these are required to accept this RFD.
