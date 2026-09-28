# RFD0005 - Constrained Matrices and Controlled Comparisons

- Feature Name: `constrained-matrices-and-comparisons`
- Status: Implementing
- Author: `leostera`
- Start Date: `2026-09-28`
- Updated: `2026-09-28`
- Discussion PR: `TBD`
- Tracking Issue: `TBD`

## Summary

Make a matrix describe the **valid experimental cells** for an eval, not necessarily the full Cartesian product. Authors can exclude partial combinations (for example, Windows + ARM when no runner exists), and can define correlated choices (for example, Ruby + Rails or Go + Gin) that cross with independent axes such as spec and formal-model usage. Every planning, selection, CLI, runner, and dashboard path uses the same eligible-cell set. Excluded cells are not scheduled, shown as runnable, or counted against execution limits.

Make historical runs browsable by their **persisted** matrix parameters, independently of today's matrix configuration. In Runs, a left-hand filter pane narrows the table by eval, parameter values, status and time. Readers can then compare repeated runs of the _same_ configuration across invocations (for example, before and after editing a prompt), or compare two configurations while holding the other parameters fixed. Comparison is a **view over persisted evidence**, not a new scoring rule or an automatic claim that one configuration is better. Cross-invocation comparison is a first-class path, not an opt-in afterthought; provenance and unknowns must be visible rather than assumed away.

This RFD describes the target contract, not a claim that every stage is shipped. The first implementation slice supports `cases` and `exclude` in core and CLI, with exact eligible-cell planning and server-side single-cell validation. The dashboard now lists and launches eligible constrained cells via a bounded, shared-planner-backed API. Historical faceted Runs, invocation provenance, and comparisons remain to be implemented. Existing manifests store effective parameters plus `{ id, cellKey }` but no invocation identity or definition snapshot.

## Motivation

An eval might ask an AUT to build the same HTTP API in Rust, Go, TypeScript, Python, or Ruby, with/without a framework, with/without a detailed spec, and with/without a formal model. Framework names depend on language; blindly crossing `language × framework` would create nonsense such as Ruby + Gin. Another matrix may cross OS and architecture but have no Windows ARM runner. Authors should not need to create separate evals or run invalid cells just to preserve a comparable experiment.

Once runs exist, a flat list of scores cannot answer two distinct questions: _For Ruby + Rails + no spec, what changed when formal modeling was enabled?_ And _for Ruby + Rails + a spec + a formal model, how did results change after we edited the prompt and reran the same cell?_ The reader needs filters over **all saved runs**, not just cells in the current matrix, then clearly labeled runs with trial counts, per-rule outcomes and links to evidence. When definitions, fixtures, scorers or execution settings changed—or are unknown—the UI must expose that fact rather than imply a controlled comparison.

## Goals

- Express exclusions as **partial patterns** over matrix dimensions; `exclude: [{ os: 'windows', arch: 'arm64' }]` excludes both spec variants of that pairing.
- Express valid correlated parameter sets without generating invalid cross-products; cross those sets with independent axes.
- Preserve a deterministic, exact eligible-cell count and stable cell keys after selection, defaults, overrides and exclusions; validate the plan **before** dispatch or cost-incurring work.
- Make excluded combinations unavailable in the dashboard as well as the CLI. A directly submitted excluded cell must fail validation, not run anyway.
- Browse **any retained run** in a two-column Runs view: persistent parameter facets on the left, sortable/filterable runs and evidence on the right. Do not derive historical filter choices from current config.
- Compare runs of the same eval both across a varying dimension with other effective parameters fixed **and across time with all effective parameters fixed**. Preserve missing results, score errors and unequal trial counts as distinct states.
- Retain provenance with new reports to identify invocations and explain changes or unknowns; allow older v2/v3 runs to be filtered and compared with explicit unknown provenance, without rewriting them.

## Non-goals

- Automatically proving causal effects, statistical significance, model quality, fixture equivalence or that an AUT actually applied a parameter. The adapter still owns that behavior.
- Scheduling on a particular OS/CPU, discovering available machines, or automatically excluding cells based on live infrastructure.
- A general predicate language, arbitrary user callbacks in matrix definitions, conditional transcript generation, or a new eval DSL.
- Automatically ranking different evals, normalizing unlike scorer scales, or comparing scores from different scoring contracts.
- Changing the existing `policy.trials` semantics or turning one dashboard click into an unbounded full-matrix launch.

## Guide-level explanation

A project with correlated language/framework choices and independent spec/model axes could declare:

```ts
import { defineConfig } from '@leostera/evalkit';

export default defineConfig({
  matrix: {
    id: 'api-build',
    cases: [
      { language: 'ruby', framework: 'rails' },
      { language: 'ruby', framework: null },
      { language: 'go', framework: 'gin' },
      { language: 'go', framework: null },
      { language: 'python', framework: 'fastapi' },
      { language: 'python', framework: null },
    ],
    parameters: {
      spec: ['detailed', 'none'],
      formalModel: [true, false],
    },
    // Optional: omit unsupported combinations without duplicating cases.
    exclude: [{ language: 'go', framework: 'gin', formalModel: true }],
  },
  execution: { maxCells: 100 },
});
```

`cases` are **complete assignments of the correlated dimensions**; they are alternatives, not another Cartesian axis. Each case crosses with every choice in `parameters`, then exclusions remove matching cells. This illustration has 6 × 2 × 2 − 2 = **22 eligible cells per eval**. The values of `framework: null` mean _no framework_, not a missing value. With no `cases`, there is one implicit empty case and the existing Cartesian behavior is unchanged.

For OS and architecture, independent axes alone suffice:

```ts
matrix: {
  id: 'platforms',
  parameters: {
    os: ['linux', 'macos', 'windows'],
    arch: ['arm64', 'x86_64'],
  },
  exclude: [{ os: 'windows', arch: 'arm64' }],
}
```

This plans five cells per eval. Exclusion objects are partial: every specified key must match the cell by canonical JSON equality, and omitted keys are unconstrained. A pattern with a key or value outside the declared dimensions is a configuration error rather than a silently ineffective exclusion. Multiple patterns form a union; overlapping patterns do not subtract the same cell twice. Excluded cells never receive a run or trial; an execution failure of an eligible cell is **not** an exclusion.

In Runs, a reader chooses `language=ruby`, `framework=rails`, `spec=detailed`, and `formalModel=true` in the filter pane. The table then shows **every retained matching run**, oldest or newest as sorted, including those from earlier matrix invocations and those whose cell was later removed from the definition. The reader can select two runs to compare before/after a prompt edit. The view shows dates, effective settings, trial counts, run pass/fail counts, scores by **matching scorer name and kind**, and links to both runs' trial evidence. If the prompt revision was recorded, show its source revision/digest; if not, say _Definition not recorded_ rather than claiming to know what changed.

Alternatively, keep Ruby, Rails and spec fixed but leave `formalModel` unfiltered; choose a false run as baseline and a true run for a cross-configuration comparison. A missing run displays _Not run_, not zero. A running run displays _In progress_; it is not treated as a completed failure.

## Reference-level explanation

### Matrix definition and planning

The proposed type extension in `@evalkit/core` is:

```ts
type EvalMatrixDefinition = {
  id: string;
  evals: readonly EvalDefinition[];
  parameters: Readonly<Record<string, readonly JsonValue[]>>;
  defaults?: JsonObject;
  cases?: readonly JsonObject[];
  exclude?: readonly JsonObject[];
};
```

`parameters` remains the independent-axis map. `cases` must be nonempty when supplied; every case must have exactly the same keys, disjoint from independent axes and defaults. Values must be finite JSON values; cases must be unique under canonical JSON equality. Exclusions may mention any independent or case dimension, must have at least one key, and must not mention execution defaults/overrides. An exclusion that never matches _any_ declared cell is invalid (catch typos); a valid pattern may eliminate all cells from a later selection. Duplicate or overlapping exclusions are permitted but are counted only once. Declared axes and cases should be validated for conflicts before any CLI selection. If there are no cases, exclude can refer only to independent axes. A matrix with neither axes nor cases keeps its existing one-cell-per-eval behavior.

Cell expansion order is deterministic: eval declaration order; canonical case order (author order, unless source order changes are explicitly allowed to alter display order); then independent axes sorted by name and their authored choice order. Deduplicate on **effective parameters** if defaults or overrides would otherwise make two rows identical; preferably reject that ambiguous definition rather than silently run it twice. Existing canonical `cellKey` semantics—matrix ID, eval ID and effective parameters—remain unchanged for eligible cells. Exclusions apply to the **declared dimension choices before** defaults and CLI non-axis overrides; a choice cannot be revived by an override. Validate overrides cannot overwrite either an independent or a case dimension.

Selection filters _eligible_ cells: `--eval` chooses evals; `--select axis=value` (and `--model`/`--mode`) can select any declared independent **or case** dimension. Validate selections against declared values and count the resulting eligible cells. A declared value may become unreachable after exclusions; selecting it alone yields a zero-cell error with an explanation rather than running a fallback cell. `--dry-run`, `--all`/`maxCells`, matrix execution and the dashboard must agree on this exact count. A CLI run with zero eligible cells fails before starting agents or creating reports; a project may nevertheless define such a matrix and inspect it in the planner to find its exclusions.

Keep `cells()` lazy. The current O(number of axes) `count()` multiplication is no longer sufficient: it must count the union of valid non-excluded cells exactly, including overlapping exclusions and selections. A fast path retains multiplication when no exclusions apply. For excluded matrices, use a shared planner that can skip whole subtrees of the product when patterns fully match or cannot match; do not materialize billions of cells just to count them. If exact planning exceeds a defined computation budget, fail with an actionable planning error before dispatch, never an approximate count or partial run. Counting, paging and scheduling must consume the same eligibility rules and deterministic order.

### CLI and dashboard contract

`packages/cli/src/project.ts` already passes config-backed matrix definitions through `defineEvalMatrix`; `run-command.ts` constructs a fresh matrix for `run-suite`. It must carry `cases` and `exclude` into that suite matrix instead of copying only `parameters` and `defaults`. Explicitly registered matrices use the same core implementation. The dry-run output should report the **eligible** cell count and optionally the pre-exclusion count, with no claim that skipped combinations were attempted. `--json` emits only executed eligible cells. Exclusion does not create a run or score record.

The dashboard currently receives only `{ id, parameters, trials }` from `/v1/matrix`, expands a Cartesian product in `MatrixEvalTable.tsx`, and submits one full axis selection to `selectDashboardCell`. That would be wrong for case dimensions and exclusions. Replace this client-only product assumption with a **shared planner-backed cell listing** (bounded/paginated and filterable), or a validated projection that remains efficient for large matrices. Report eligible and excluded totals separately; do not render an excluded row with a live Run button. A single-cell POST must verify that the selected effective dimensions identify **exactly one eligible cell** in core, rather than checking membership of each independent axis in isolation. The existing one-cell-at-a-time dashboard safety limit stays in force. Historical run rows remain visible even if the current matrix config later excludes their former cells.

### Historical Runs workspace

The primary Runs route becomes a **two-column workspace inside the existing dashboard shell**: a left filter pane and a right results table. On narrow screens, put the filters in a disclosure above the table without losing access to active filters. The pane has facets for eval, matrix ID, each parameter key/value found in **persisted run manifests**, run status and date/time range, plus an explicit _Missing_ option for runs without a key. `null`, `false`, `0`, string `"0"`, a missing key, and JSON objects are distinct values. Values use canonical JSON identity, not display-string equality. Within a facet, selected values match with OR; across facets, filters combine with AND. Show counts and active filters; filter choices and run selection should survive navigation via URL query state or another shareable state contract. Keep the existing free-text search and sortable columns; it complements, rather than replaces, the structured facets. A no-match state offers a clear-filter action. Facet enumeration and filtering must cover **all retained compatible reports**, not just the current page of runs, and be bounded/paginated for large histories.

Historical rows keep their persisted parameters even after the current matrix changes or excludes that cell. Do not label an old executed run as a skipped cell. Show the saved matrix ID and an optional invocation ID where available; do not infer old run parameters from today's `evalkit.config.ts`. Initially this can use local report projections; if server-side pagination is added, both facets and table must derive from the same filter semantics. The existing Runs table's free-text input and dynamic parameter columns are only a starting point, not the proposed faceted workspace.

### Comparisons and durable reports

For each new CLI matrix invocation, allocate a generated `invocationId` shared by its cell runs, including a suite sweep. It is **not** the authored matrix ID: the same matrix can be run repeatedly. Persist it with matrix ID, canonical cell key and effective parameters in run and trial manifests, using optional versioned metadata so existing v2/v3 reports remain readable. A dashboard single-cell launch has its own invocation ID; a direct programmatic `runEval` without one remains valid. **Invocation is a filter and context label, not an eligibility constraint for comparison.**

The reader selects two or more runs from the filtered history. A **same-configuration history** compares the same eval ID and identical effective parameters (canonical JSON equality, including presence/absence of keys) across any invocations; this is the default after all parameter facets are fixed. A **cross-configuration slice** compares one varying parameter while the eval ID and every other effective parameter are held fixed. For either mode, default ordering is by start time with explicit run IDs; never silently pick the latest run or average repetitions away. Keep runs from different matrix IDs visible when their effective parameters match, but identify both matrix IDs. Require an explicit choice for cross-eval comparisons rather than merging scores from different evals. A missing eligible cell in a _planned_ comparison is _Not run_ and a currently excluded planned cell is _Excluded_; neither changes the status of historical runs.

Display `passed/failed/trialCount` from each persisted run summary and per-rule values from trial scoring; distinguish execution errors, scorer errors, absent scores and partial results. Compare numeric scorer values only for the same scorer name/kind and compatible scoring contract, labeling any aggregation rule and sample size. Every summary links to contributing runs, trials and raw report files. Display side-by-side values and deltas only with clear denominators; differences across unknown or changed definitions are descriptive, not a causal verdict.

An invocation ID does **not** prove code and fixtures were unchanged even within one sweep. Capture provenance where observable at run time: at least an optional source revision plus dirty/unknown state, and, as contracts mature, prompt/eval/scorer definition digests, fixture input digests, trial policy and adapter/model configuration. Record prompt identity explicitly if it is to be shown as a changed dimension; a Git revision alone cannot identify an uncommitted prompt edit. Never infer prompt changes by reading the _current_ source for an old run. The UI shows _Changed_, _Same_, or _Unknown_ for each comparable provenance field where data permits, and warns when definitions or scorer contracts differ. **Unknown does not block side-by-side comparison** of older reports; it blocks any claim of controlled equivalence. Do not expose evaluator-only fixture contents or secrets in dashboard API responses.

### Compatibility, errors and validation

Definitions without `cases`/`exclude` preserve their existing expansion and keys. New optional report fields must be accepted by the versioned report reader without changing the meaning of v2/v3 execution status or scoring. Historical reports without an invocation ID remain browsable and selectable for cross-run comparison; their provenance is marked unknown rather than fabricated. Removing a cell by editing config never deletes its older reports. Unknown selection keys/values, case shape mismatches, invalid exclusion patterns and ambiguous full-cell submissions fail before dispatch with messages naming the relevant axis/pattern; a missing report is a display state, not an error in the matrix definition.

## Rollout and acceptance

The first slices implement steps 1–3 below, with a bounded dashboard planner query. Steps 4–6 are pending.

1. Extend `defineEvalMatrix` and project config with cases/exclusions, JSON validation, deterministic eligible-cell iteration and exact counting. Add unit tests for no exclusions, partial/multiple/overlapping exclusions, invalid values, correlated cases, zero-cell selections, defaults, overrides, stable keys and very large sparse products.
2. Use the shared planner in `run-matrix`, `run-evals`, `run-suite`, dry-run and the one-cell dashboard POST. Test that `maxCells` counts only eligible cells and an excluded cell can never be launched through either surface.
3. Replace Cartesian-only dashboard cell expansion with a bounded eligible-cell view. Exercise paging/filtering/sorting and single-cell submission for both the OS/architecture and language/framework examples.
4. Build the faceted two-column Runs workspace from persisted run manifests, with canonical value matching, missing-key facets, date/status filters, shared state, narrow-screen access and bounded server-side filtering/paging where needed. Test that older runs remain visible after a config change.
5. Add optional invocation and source provenance to new report manifests and reader projections, with v2/v3 fixtures proving old reports still load and remain selectable. Persist failure and partial-run records with the invocation where possible.
6. Build same-configuration history and one-varying-dimension comparison views against persisted reports. Test cross-invocation selection, a prompt revision/unknown provenance, fixed-dimension matching, missing/excluded/running cells, repeated runs, unequal trial counts and scorer errors. Update the manual only when behavior ships.

Acceptance example A: a three-OS/two-architecture eval with Windows ARM excluded plans and runs **five** cells, rejects a Windows ARM dashboard submission, and retains old Windows ARM reports as historical evidence if the exclusion was added later. Example B: six language/framework cases × two spec choices × two formal-model choices with the illustrative Go/Gin/formal exclusion plans **22** cells. Filtering Runs to Ruby, Rails, detailed spec and formal model shows every retained matching run across invocations, including one before and one after a prompt edit; both are selectable for a side-by-side history with a provenance label. Removing the formal-model filter allows a cross-configuration slice while fixing the other values. No excluded cell is charged, scored, or misreported as a failure.

## Drawbacks and alternatives

- Explicit cases repeat values and can become lengthy. They are preferable to generating invalid combinations or putting non-serializable predicate callbacks into project config and remote planning APIs.
- Counting exclusions can be more expensive than multiplying axes; exactness, a fast path and an explicit planning budget are required before dispatch.
- A faceted Runs workspace and two comparison modes add reporting complexity. Same-configuration history and one-varying-axis slices are more interpretable than a full multidimensional pivot or an automatic winner ranking.
- `exclude` alone could express dependent frameworks by listing every invalid language/framework pairing, but becomes brittle as languages and frameworks grow. Correlated cases state what is valid directly; exclusions handle exceptional gaps such as unsupported hardware.
- Separate evals per combination avoid core changes but lose a single eval's identity and make controlled parameter comparisons harder to assemble.
- Comparing only the latest run for each cell is simpler but hides prompt iteration. Show all matching runs by default; never hide cross-time evidence behind invocation grouping. Provenance warnings distinguish exploratory history from verified like-for-like trials.

## Unresolved questions

1. **Decided:** cross-invocation and old/new prompt comparisons are first-class. Invocation filters are optional context, never a prerequisite to select runs; unknown provenance stays visible.
2. **Case selection UX:** when `--select framework=rails` is supplied, should the CLI accept that case-dimension value directly (proposed), and how should the dashboard display unavailable values of that dimension under the current fixed filters?
3. **Provenance guarantees:** which source, prompt, fixture and adapter digests can the local runner actually compute without evaluating user code twice or exposing evaluator-only material? Unknown must stay explicit.
4. **Large plans and histories:** define measurable exact-count and report-query budgets with clear errors or pagination, without regressing cheap multiplication for unconstrained matrices.
5. **Run-history retention:** which provenance/parameter indexes are worth persisting for fast faceted search without making deletion or privacy controls harder?

## Future possibilities

Per-eval exclusions, named comparisons, pinned baselines, confidence intervals with appropriate trial/seed controls, exportable pivot tables, and scheduling constraints based on live runner capabilities may be useful. None is implied by an authored `exclude` pattern; these require separate data and execution contracts.
