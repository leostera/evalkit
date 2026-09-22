# RFD0003 - Canonical Resource Identifiers and Trial Navigation

- Feature Name: `canonical-resource-identifiers`
- Status: Accepted
- Author: `leostera`
- Start Date: `2026-09-22`
- Updated: `2026-09-22`
- Discussion PR: `TBD`
- Tracking Issue: `TBD`

## Summary

This RFD proposes that Evalkit identify durable resources with canonical URI-shaped identifiers such as `evalkit:trial:<uuid>`, while browser routes and local report-directory segments use the UUID portion alone. It replaces path-like suite IDs, short eval IDs, and per-run trial labels as primary identity with globally unique, typed identifiers. It also makes a trial—not a trajectory—the inspectable resource in the dashboard: a trial page at `/trial/:trialUuid` contains the trial’s scores, workspace snapshot, artifacts, and event timeline. This is a hard cutover with no legacy identifier parsing or fallback URL support.

## Motivation

Evalkit currently mixes several forms of identity:

- suites use authored dot-separated path-like IDs;
- evals use short authored IDs;
- runs use generated IDs;
- trials can be labelled `trial-0001` beneath a run;
- the dashboard’s trajectory view has needed both run and trial context to avoid ambiguity.

These values are useful display labels, but they do not form one durable addressing model. In particular, `trial-0001` is meaningful only within its parent run, and a human-oriented eval ID can be renamed or reorganized. This complicates report links, API lookups, dashboard routing, future D1 projections, artifact provenance, and cross-environment references.

An eval author, evaluator, or dashboard user should be able to copy a canonical reference and know what resource it identifies. A browser URL should similarly address one resource without requiring a composite, implementation-specific path. The dashboard should present trajectories as evidence of a trial, rather than as an independently navigated resource when one trial has one persisted event timeline.

## Goals

- Give each durable Evalkit resource one globally unique, typed canonical identifier.
- Separate immutable identity from human-readable names and slugs.
- Use UUID route keys for clean browser URLs and local report paths.
- Make trials globally addressable without their parent run in a route.
- Make `/trial/:trialUuid` the canonical dashboard inspection page for scores, artifacts, workspace, and events.
- Preserve the provider-neutral core model defined by RFD0001.
- Give local and hosted runners the same report and API identity contract.
- Make identifier kind validation explicit at Schema, API, and report boundaries.

## Non-goals

- Creating a separate `trajectory` resource while a trial has exactly one trajectory.
- Defining globally resolvable public URLs or a centrally hosted Evalkit service.
- Adding a registry or lookup service outside a project-owned Evalkit deployment.
- Supporting legacy short IDs, dotted suite IDs, or compound trajectory URLs after the cutover.
- Changing the candidate/evaluator workspace capability boundary from RFD0001.
- Defining multi-trajectory trials, retries-as-child-resources, or trajectory branching.

## Guide-level explanation

A resource has an immutable machine identity and optional readable display metadata.

```ts
const suite = defineSuite({
  uri: 'evalkit:suite:0197f17c-4d89-7f81-9d42-6c497e6f6b6a',
  slug: 'examples.starter',
  name: 'Starter Example',
  evals: [greetingEval],
});

const greetingEval = defineEval({
  uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b6b',
  slug: 'starter-greeting',
  name: 'Starter greeting',
  // agent, transcript, fixtures, and scoring omitted
});
```

`uri` is the canonical value recorded in reports, API payloads, logs, and copied references. `slug` and `name` may change for readability without changing what the resource is.

A run and each of its trials receive generated identities:

```text
evalkit:run:0197f17c-4d89-7f81-9d42-6c497e6f6b6c
evalkit:trial:0197f17c-4d89-7f81-9d42-6c497e6f6b6d
```

The local report layout uses UUID directory names rather than URI strings:

```text
evalkit-results/
└── 0197f17c-4d89-7f81-9d42-6c497e6f6b6c/
    └── trials/
        └── 0197f17c-4d89-7f81-9d42-6c497e6f6b6d/
            ├── manifest.json
            ├── summary.json
            ├── scoring.json
            ├── trajectory.jsonl
            └── artifacts/
                └── candidate/
```

The dashboard uses the trial UUID directly:

```text
/trial/0197f17c-4d89-7f81-9d42-6c497e6f6b6d
```

That page is the complete trial inspector. Its left column contains stable trial facts and scores; its right column contains the ordered event timeline. The workspace link is scoped to the same trial:

```text
/workspace/0197f17c-4d89-7f81-9d42-6c497e6f6b6d
```

### Resource relationships

```text
Suite URI
  → Eval URI
    → Run URI
      → Trial URI
        → scores
        → candidate workspace snapshot
        → artifacts
        → one ordered event timeline
```

The timeline is evidence owned by its trial. It is not a separately navigated resource under this proposal.

## Reference-level explanation

### Architecture and boundaries

`@evalkit/core` owns URI kinds, UUID validation, typed URI formatting/parsing, and the declaration contracts for suite, eval, agent, and fixture identity. It must remain provider-neutral.

`@evalkit/runner` owns generation of run and trial UUIDs, report metadata, and the mapping from canonical URIs to UUID report-directory segments. It keeps `trialIndex` only as ordering metadata; it is never an addressable trial identity.

The local CLI and hosted Hono APIs own UUID route lookup and convert external route parameters to canonical resource references. The dashboard receives canonical URIs for display/copying and UUIDs for route construction.

### Data model and interfaces

Every canonical resource URI has this grammar:

```text
evalkit:<kind>:<uuid>
```

where `<kind>` is one of:

```text
suite
eval
agent
fixture
run
trial
artifact
```

`<uuid>` must use the UUID format accepted by the shared Effect Schema. Parsing must reject malformed values and values with a valid UUID but the wrong resource kind.

Core declarations expose a required `uri`, optional `slug`, and optional `name`. A registry indexes resources by URI. It may build presentation hierarchies from slugs, but it does not treat a slug as a stable identifier.

Report metadata includes both canonical URI and UUID route key where the distinction is useful. For example:

```ts
{
  runUri: 'evalkit:run:<uuid>',
  runUuid: '<uuid>',
  suiteUri: 'evalkit:suite:<uuid>',
  evalUri: 'evalkit:eval:<uuid>',
  trialUri: 'evalkit:trial:<uuid>',
  trialUuid: '<uuid>',
  trialIndex: 0,
}
```

The API returns URI and UUID explicitly. It does not ask clients to split a URI string to construct routes.

### Trial navigation and inspection

The dashboard removes the standalone Trajectories navigation item. It provides a trial action from a run’s expanded trial table:

```text
View trial →
```

The target is `/trial/:trialUuid`. The trial page includes:

- run, suite, eval, and agent references;
- trial index, status, duration, and event/turn counts;
- aggregate and individual scorer results;
- latency and token measurements where events provide them;
- a candidate-workspace link;
- candidate artifact listing;
- an ordered event timeline.

The timeline is a view inside the trial page, so it is still fully inspectable without being separately addressable.

### Lifecycle and failure semantics

A run allocates one UUID before report writing. Every requested trial allocates its own UUID before the trial manifest is written. Failed trials retain their allocated URI/UUID and partial evidence. A run may fail after some trials complete; completed trial identities and report trees remain valid.

Identifier parsing failures at an API boundary produce a validation error without exposing filesystem paths or registry internals. A valid UUID that does not identify a resource in the project produces not found.

### Invariants

- A canonical URI identifies exactly one resource kind and UUID.
- Resource UUIDs are globally unique within an Evalkit project’s retained reports.
- A route key is the UUID component of a canonical URI, not a display slug.
- A trial UUID identifies exactly one trial and one event timeline.
- `trialIndex` is not an identifier.
- Human-readable names and slugs are not used as durable references.
- Evaluator-only workspace contents remain unavailable from trial workspace/artifact routes by default.
- Local and hosted reports use the same canonical identity fields.

### Compatibility and migration

This is an intentional breaking change. Evalkit is pre-1.0 and does not retain a compatibility layer.

Existing local reports using path-like suite IDs, short eval IDs, generated `run-*` values, and `trial-0001` directories are not readable by the new report reader. Existing projects must migrate declarations to canonical source URIs and generate new reports. The dashboard removes legacy compound trajectory routes rather than redirecting them.

The starter scaffold, examples, RFD examples, tests, and generated project shape must migrate in the same implementation change.

### Security, privacy, and observability

Canonical URIs contain no credentials, fixture contents, provider secrets, or filesystem paths. UUIDs are opaque identifiers, not authorization credentials. Hosted APIs continue to enforce project-owned bearer authentication before resource lookup.

Structured Effect logs should annotate resource URIs and UUIDs as appropriate. Logs must not include evaluator-only file names or contents unless explicitly authorized diagnostic logging is added later.

### Rollout and validation

Implementation proceeds in this order:

1. Add shared URI/UUID Schema primitives and tests.
2. Migrate core declarations, registry, catalog, and starter IDs.
3. Migrate runner report metadata and local report directory layout.
4. Migrate local/hosted Hono API projections and UUID route validation.
5. Migrate dashboard routes and rename the trajectory inspector to trial detail.
6. Add workspace route.
7. Update unit, report integration, Miniflare, and Puppeteer tests.

Acceptance requires that no public route, report reader, registry lookup, or dashboard action relies on a legacy short/dotted/composite identifier.

## Drawbacks

- Eval authors must assign and maintain opaque stable URIs in source declarations.
- UUIDs are less readable than authored dotted IDs in source and terminal output.
- The migration invalidates existing local reports and requires simultaneous changes across all packages.
- API payloads carry both URI and UUID fields, increasing apparent data-model complexity.
- A later multi-trajectory trial model may require a new trajectory resource kind and route.

## Rationale and alternatives

### Proposed design

Typed canonical URIs make resource references self-describing in logs, reports, APIs, and copied links. UUID route keys keep browser URLs short and avoid encoding punctuation-rich URI strings. Separating identity from name permits suite organization and labels to evolve without invalidating durable evidence.

Treating the timeline as part of a trial aligns navigation with the report tree and user task: inspect the outcome and evidence of one trial.

### Simpler or narrower approach

Keep current IDs and change only the browser route to `/trial/:runId/:trialId`. This would address route ambiguity, but it leaves reports, APIs, and future hosted projections with mixed identity conventions. It also keeps trial identity contextual rather than globally addressable.

### Other alternatives considered

- **Use canonical URIs directly as browser path parameters:** rejected because colon-delimited identifiers require encoding and produce noisy routes without adding information beyond the UUID route key.
- **Use human slugs as browser routes:** rejected because renaming/reorganizing resources would break durable links or force redirects and compatibility logic.
- **Give trajectories an independent resource URI now:** rejected because the current model has one trajectory per trial, so a second identity duplicates state and confuses ownership.
- **Use a single generic `evalkit:resource:<uuid>` URI:** rejected because type-specific URI prefixes catch category mistakes and improve logs and debugging.
- **Generate declaration URIs at registry load time:** rejected because source-defined resources need stable identity across local and hosted deployments.

### Do nothing

The dashboard continues to need composite run/trial routes, report projections retain incompatible identity styles, and future hosted storage must recreate contextual lookup logic that does not scale cleanly across projects and retained runs.

## Prior art

RFD0001 already separates run and trial report boundaries and treats a trial as the owner of trajectory evidence. RFD0002 assigns one coordinator to an aggregate run and one Sandbox to a trial attempt. This proposal makes those boundaries directly addressable without changing their execution ownership.

URI-style typed identifiers are common in systems that need references to survive presentation changes. This RFD adopts the useful property—self-describing durable identity—without proposing a global resolver or public linked-data system.

## Unresolved questions

### Before acceptance

- None. This RFD is accepted with source-authored agent and fixture URIs required, and with any RFC-compatible UUID accepted initially.

### During implementation

- Exact TypeScript branding strategy for URI and UUID values.
- Whether catalog payloads use `uuid` or a kind-specific field such as `trialUuid` consistently.
- Exact compact terminal display format for canonical URIs.

### Out of scope

- Redirects/import tooling for archived legacy reports.
- Cross-project resource resolution.
- Multiple trajectories, branches, or retry-attempt subresources within one trial.
- Public sharing links and browser authentication.

## Future possibilities

If trials later contain multiple independently retained event streams, Evalkit may add `evalkit:trajectory:<uuid>` as a child resource with `/trajectory/:trajectoryUuid`. If fixture provenance or artifacts need independent browser pages, their canonical URI contracts already reserve the required resource kinds.
