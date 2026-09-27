# PLAN1236 — Canonical resource URIs and trial-detail navigation

**Status:** active

**Design authority:** [`RFD0003-canonical-resource-identifiers-and-trial-navigation.md`](../../docs/rfds/RFD0003-canonical-resource-identifiers-and-trial-navigation.md)

## Goal

Replace human/path-like primary identifiers with canonical Evalkit resource URIs and globally unique UUID route keys. Make trial inspection a first-class resource page; remove trajectory as a separately navigated resource.

## Identity contract

Canonical resource identifiers:

```text
evalkit:suite:<uuid>
evalkit:eval:<uuid>
evalkit:agent:<uuid>
evalkit:fixture:<uuid>
evalkit:run:<uuid>
evalkit:trial:<uuid>
evalkit:artifact:<uuid>
```

- The canonical URI is used in report payloads, API contracts, logs, links, and durable references.
- The UUID portion is used in browser routes and local report path segments.
- Human-readable `name` and optional `slug` are display metadata, never primary identity.
- There is no standalone trajectory resource while each trial owns exactly one event timeline.

## Hard-cutover requirements

- [ ] No dotted suite IDs or short eval IDs remain as primary identity.
- [ ] No `trial-0001` values remain as globally addressable trial identity.
- [ ] Do not retain URI/legacy-ID compatibility parsing or fallback routes.
- [ ] Update all authoring, registry, reports, APIs, dashboard, tests, examples, and documents together.

## Phase 1 — Core identity primitives

- [x] Add UUID Schema and resource-kind URI schemas.
- [x] Add format/parse helpers for `evalkit:<kind>:<uuid>`.
- [ ] Define opaque URI/UUID types for suite, eval, agent, fixture, run, trial, and artifact.
- [ ] Require stable canonical IDs in suite/eval/agent/fixture declarations.
- [x] Add optional display `slug` and `name` fields.
- [x] Test malformed URI, wrong-kind URI, UUID, format, and parse behavior.

## Phase 2 — Registry and catalog

- [x] Index registry by eval URI and suite URI.
- [x] Catalog entries expose canonical URI, UUID route key, display slug/name, suite URI, agent URI, and fixture URIs.
- [ ] Preserve explicit static registration and duplicate detection on canonical URI.
- [x] Update starter declarations and generic tests with fixed source UUIDs.

## Phase 3 — Runner and reports

- [x] Generate UUIDs for run and trial route keys.
- [x] Store canonical run/trial URIs plus UUIDs in manifests and summaries.
- [x] Store suite/eval/agent canonical URIs in report metadata.
- [x] Use UUIDs as local report directory segments.
- [ ] Keep `trialIndex` only as ordering/display metadata.
- [ ] Update report schemas, readers, and aggregate projections.

## Phase 4 — Hono APIs

- [x] API payloads expose canonical URI and UUID separately where required.
- [x] All local resource lookup routes accept UUID route keys only.
- [ ] Update local report/detail/artifact endpoints and hosted catalog endpoint contracts.
- [ ] Validate UUID path parameters with Schema/Hono middleware.

## Phase 5 — Dashboard

Routes:

```text
/suites
/suites/:suiteUuid
/eval/:evalUuid
/agents
/agent/:agentUuid
/fixtures
/fixture/:fixtureUuid
/runs
/runs/:runUuid
/trials/:trialUuid
/workspaces/:trialUuid
```

- [x] Remove the Trajectories navigation item and `trajectory` screen.
- [x] Rename trajectory inspector to trial detail.
- [x] Use `/trials/:trialUuid` for explicit trial actions and refresh restoration.
- [x] Keep event timeline as the right column inside trial detail.
- [x] Add workspace/artifact route from trial detail.
- [ ] Replace all display of legacy IDs with canonical URI/short UUID presentation.

## Phase 6 — Validation and documentation

- [ ] Update RFD0001/RFD0002 and implementation plans.
- [ ] Update README and starter README.
- [ ] Update unit, integration, Miniflare, and Puppeteer tests.
- [ ] Ensure all formatting, checks, tests, builds, and diff checks pass.
