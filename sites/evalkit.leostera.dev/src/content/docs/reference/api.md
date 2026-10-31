---
title: API reference
description: Every function, constant and main type exported by @leostera/evalkit and @leostera/evalkit/runner.
---

EvalKit has two entry points. Scenario, agent, judge and config files import from **`@leostera/evalkit`**. Code that runs evals or reads results itself imports from **`@leostera/evalkit/runner`**. The [manual](/docs/manual/) explains how the pieces fit; this page lists what each export takes and returns. Types are exported under the same names, so `import type { ScoringContext } from '@leostera/evalkit'` works.

## Scenarios

- `defineEval(definition: EvalDefinition): EvalDefinition`  
  Checks a scenario and records where it is defined. Default-export the result from a `.eval.ts` file.
- `user(message: string | ((input: UserMessageInput) => string))`  
  A user message step. A function computes the message per trial from `{ parameters, data, seed, trialIndex }`; `data` holds only candidate datasets.
- `expectToolCall({ name, arguments? })`  
  A checkpoint that passes when the preceding turn called that tool (with matching arguments, when given). It observes; it never calls a tool.
- `agent(expectation: JsonObject)`  
  Reserved for agent-turn steps; the runner does not execute these yet.

`EvalDefinition` fields:

| Field        | Meaning                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `id`         | `string`: lowercase kebab-case, unique in the project.                                                                   |
| `name`       | `string?`: shown in the dashboard instead of the ID.                                                                     |
| `agent`      | `AutAdapter`: the agent under test.                                                                                      |
| `judge`      | `AutAdapter?`: A separate agent for `judge()` rules; required when there are any, and never the same as `agent`.         |
| `datasets`   | `Dataset[]?`: data and files the scenario uses, from `defineDataset`.                                                    |
| `transcript` | `TranscriptStep[]`: `user()` steps, with checkpoints (`predicate`, `judge`, `expectToolCall`) after the turn they check. |
| `scoring`    | `ScoringRule[]`: final scorers: `predicate()` and `judge()`, run after the transcript.                                   |
| `metrics`    | `Metric[]?`: numbers recorded per trial with `metric()`. They never affect pass or fail.                                 |
| `policy`     | `EvalPolicy?`: `{ trials?, timeoutMs?, failfast? }`. `failfast` stops later steps after a failed checkpoint.             |
| `metadata`   | `Record<string, any>?`: any JSON-convertible object, converted when the eval is defined.                                 |

## Scoring

- `predicate(name, run: (ctx: ScoringContext) => boolean | ScoreValue, { passAt?, supportsPartial? })`  
  A scorer in code. Return a boolean, a number from 0 to 1, `{ value, passed?, explanation?, evidence? }`, or `skip(reason)`. A number passes at `passAt` (default only 1).
- `judge(name, { rubric, supportsPartial? })`  
  A scorer graded by the scenario's `judge` agent against the rubric.
- `metric(name, run: (ctx: ScoringContext) => number | undefined, { unit?, better? })`  
  A number measured for every trial. `unit: 'ms'` formats as a duration; `better: 'lower' | 'higher'` colours comparisons.
- `skip(reason: string)`  
  Returned by a scorer that does not apply to this trial; it neither passes nor fails and is left out of averages.
- `BUILT_IN_METRICS`: `readonly string[]`  
  `agent time`, `tokens` and `tool calls`: recorded for every trial. Scenario metrics may not reuse these names.

`ScoringContext`, the argument of every scorer and metric:

| Field         | Meaning                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `context`     | The trial's `AutContext`: IDs, `parameters`, candidate `data`, and the workspaces.                               |
| `trajectory`  | `{ events }`: everything recorded so far, agent and runner events.                                               |
| `turn`        | The most recent turn: its `assistantMessages`, `toolCalls` (with results when observed) and `lastAssistantText`. |
| `output`      | The content of the turn's last assistant message.                                                                |
| `artifacts`   | `{ candidate: { root }, evaluator: { root } }`: absolute paths of the trial's two workspaces.                    |
| `data`        | Values of **all** the scenario's datasets, candidate and evaluator, by dataset ID.                               |
| `checkpoints` | Results of the checkpoints so far, in order (all of them for final scorers and metrics).                         |

## Agents

- `defineAgent(adapter: AutAdapter)`  
  Checks an adapter and records where it is defined. See [Agents under test](/docs/manual/agents/).
- `piAgent({ command?, args? })`  
  A ready-made adapter that runs `pi --print --no-session --no-tools [args] <message>` in the trial's workspace for each user message. It needs Bun, and Pi gets no tools or memory between turns.
- `agentRuntimes(adapter): AgentRuntimes`  
  The runtimes an adapter declares, or `DEFAULT_AGENT_RUNTIMES` when it declares none.
- `DEFAULT_AGENT_RUNTIMES`: `{ local: { kind: 'in-process' } }`  
  Used when an adapter declares no runtimes.
- `normalizeAutEvent(input: AutEventInput, now)`  
  Converts an event an adapter emits into a recorded `AutEvent`. The runner calls this; adapters rarely need to.
- `turnResultEvents(result: TurnResult, turn, now)`  
  The events a `send()` return value stands for: tool calls and results, the reply, then `turn-completed` with usage.

An `AutAdapter` has an optional `identity` (`{ kind, id, name?, version? }`), optional `runtimes`, and `start({ context, runtime, onEvent })`, which resolves to an `AutSession`: `send(message)` and an optional `close()`. `send` may return a `TurnResult`, either the reply as a string or `{ reply?, toolCalls?, usage? }`, instead of emitting events with `onEvent`.

## Datasets

- `defineDataset({ id, files?, value?, valueFile?, visibility?, mount? })` or `defineDataset({ id, onLoad, onRun?, ... })`  
  Static data, or computed data: `onLoad` runs once per process, `onRun` once per trial. See [Datasets](/docs/manual/datasets/).
- `isDataset(value): value is Dataset`  
  True for values returned by `defineDataset`.
- `relativeDatasetPath(value, label): string`  
  Normalizes a relative POSIX path and rejects absolute or escaping ones, as `mount` and file keys are checked.

## Projects

- `defineConfig(config: EvalkitConfig)`  
  Types an `evalkit.config.ts`. Settings are listed in [Project structure](/docs/manual/project-structure/#configuration-and-precedence).
- `DEFAULT_ARTIFACT_EXCLUDE`: `readonly string[]`  
  What candidate snapshots leave out by default; spread it into `artifacts.exclude` to extend the list.
- `defineSuite({ id, name?, evals })`  
  Groups evals explicitly, for a registry.
- `defineEvalMatrix({ id, evals, parameters, defaults?, cases?, exclude? })`  
  Runs evals over parameter combinations. See [CLI and matrices](/docs/manual/cli-and-matrices/).
- `registerEvals([...evals, ...suites, ...matrices]): EvalRegistry`  
  An explicit registry instead of discovery.
- `canonicalParameters(value: JsonValue): string`  
  Stable JSON with sorted keys, used to compare parameter sets.
- `catalogEntry(eval, suite?, { root? })`  
  The definition data the dashboard shows for one eval.
- `definitionSite(value): DefinitionSite | undefined`  
  The file and line where a definition was made.
- `authorId(id: string)`, `authoringId({ id })`  
  Check a human-authored ID (lowercase kebab-case) and return it.

## JSON, identities and errors

- `toJson(value, path?)`, `toJsonObject(value, path?)`  
  Convert a value to JSON, throwing `NotJsonError` (with the failing `path`) for functions, cycles and the like.
- `NotJsonError`  
  The error `toJson` throws.
- `recordError(error): RecordedError`  
  `{ name, message, stack? }` for saving an error in a report.
- `resourceUri(kind, uuid)`, `parseResourceUri(uri, kind?)`, `resourceUuid(value, kind?)`, `resourceUriSchema(kind)`  
  Build and parse the `evalkit:run:<uuid>` URIs in manifests (kinds `run`, `trial`, `artifact`).
- `parseTrajectoryJsonl(contents): TrajectoryEvent[]`  
  Parse and check a `trajectory.jsonl` file.

Every report file has an [Effect Schema](https://effect.website/docs/schema/introduction/) for decoding it yourself: `RunManifestSchema`, `RunMetadataSchema`, `RunSummarySchema`, `RunSourceSchema`, `RunStatusSchema`, `TrialManifestSchema`, `TrialMetadataSchema`, `TrialSummarySchema`, `TrialScoringSchema`, `ScoreResultSchema`, `CheckpointResultSchema`, `MetricResultSchema`, `JudgeRunInfoSchema`, `TrajectoryEventSchema`, `ArtifactEntrySchema`, `UsageSchema`, `AutIdentitySchema`, `RecordedErrorSchema`, `JsonValueSchema`, `ApiErrorSchema`, `ResourceKindSchema`, `ResourceUriSchema` and `UuidSchema`.

## Running and reading results (`@leostera/evalkit/runner`)

- `runEval(eval, options: RunEvalOptions): Effect<RunResult>`  
  Runs an eval's trials and saves the results. `options.report` is required; see [Run from code](/docs/manual/results/#run-from-code) for the rest.
- `runMatrix(matrix, options & { selection?, onResult? })`  
  Runs every selected matrix cell as its own run.
- `localReportStore(directory): ReportStore`  
  Saves results in the `_evalkit-results` layout.
- `readRunManifest(root, runId)`, `readRunSummary(root, runId)`  
  Read and check a run's `manifest.json` (what ran) or `summary.json` (how it ended: trial, passed and failed counts).
- `readTrialManifest(root, runId, trialId)`, and likewise `readTrialSummary`, `readTrialScoring`, `readTrialEvents`  
  Read one trial's manifest, summary, **scores** (`scoring.json`) or trajectory.
- `ownerIsGone(process?): boolean`  
  True when a run's owning process ran on this host and no longer exists, meaning the run was interrupted.
- `staticDatasetFiles(dataset, root)`, `staticDatasetFile(dataset, root, file)`  
  List or read a static dataset's files without running any project code; computed datasets give `undefined`.
- `trialWorkspacePath(sandboxDir, trialId): string`  
  Where a trial's kept workspace lives.
- `AutExecutionError`, `DatasetError`, `ReportError`, `ScoringError`, `CheckpointExecutionError`, `CancelledError`  
  The Effect tagged errors `runEval` can fail with, told apart by `_tag`.

Scores are in each trial's `scoring.json` (`readTrialScoring`), repeated in the trial `summary.json`. Manifests describe what ran and its status, never scores. See [Files on disk](/docs/manual/results/#files-on-disk).
