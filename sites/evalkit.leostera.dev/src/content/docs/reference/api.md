---
title: API reference
description: Every function, constant and main type exported by @leostera/evalkit and @leostera/evalkit/runner.
---

EvalKit has two entry points. Scenario, agent, judge and config files import from **`@leostera/evalkit`**. Code that runs evals or reads results itself imports from **`@leostera/evalkit/runner`**. The [manual](/docs/manual/) explains how the pieces fit; this page lists what each export takes and returns. Types are exported under the same names, so `import type { ScoringContext } from '@leostera/evalkit'` works.

## Scenarios

- `defineEval(definition: EvalDefinition): EvalDefinition`  
  Checks a scenario and records where it is defined. Default-export the result from a `.eval.ts` file.
- `user(message: string | ((input: UserMessageInput) => string))`  
  A user message step. A function computes the message per run from `{ parameters, data, seed, batch? }`; `data` holds only candidate datasets.
- `expectToolCall({ name, arguments? })`  
  A checkpoint that passes when the preceding turn called that tool (with matching arguments, when given). It observes; it never calls a tool.
- `agent(expectation: JsonObject)`  
  Reserved for agent-turn steps; the runner does not execute these yet.

`EvalDefinition` fields:

| Field        | Meaning                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | `string`: lowercase kebab-case, unique in the project.                                                                                                               |
| `name`       | `string?`: shown in the dashboard instead of the ID.                                                                                                                 |
| `agent`      | `AutAdapter`: the agent under test.                                                                                                                                  |
| `datasets`   | `Dataset[]?`: data and files the scenario uses, from `defineDataset`.                                                                                                |
| `transcript` | `TranscriptStep[]`: `user()` steps, with checkpoints (`predicate`, `judge`, `expectToolCall`) after the turn they check.                                             |
| `scoring`    | `ScoringRule[]`: final scorers: `predicate()` and `judge()`, run after the transcript.                                                                               |
| `metrics`    | `Metric[]?`: numbers recorded per run with `metric()`. They never affect pass or fail.                                                                               |
| `repeat`     | `number?`: how many runs to start each time the scenario runs, as one batch. Default 1.                                                                              |
| `policy`     | `EvalPolicy?`: `{ failfast? }`. `failfast` stops later steps after a failed checkpoint.                                                                              |
| `limits`     | `LimitsInput?`: `{ steps?, tokens?, time? }`, enforced per run, over the project's. `time` takes milliseconds or `'20m'`. See [Limits](/docs/manual/agents/#limits). |
| `metadata`   | `Record<string, any>?`: any JSON-convertible object, converted when the eval is defined.                                                                             |
| `workspace`  | `EvalWorkspace?`: `{ ignore? }`. Gitignore-style globs left out of the run's snapshot, after the project's `artifacts.exclude`; `!pattern` keeps a path.             |

## Scoring

- `predicate(name, run: (ctx: ScoringContext) => boolean | ScoreValue, { description?, criteria?, passAt?, supportsPartial? })`  
  A scorer in code; `predicate<Evidence>` types what it returns as `evidence`. Return a boolean, a number from 0 to 1, `{ value, passed?, explanation?, evidence?, criteria? }`, or `skip(reason)`. A number passes at `passAt` (default only 1). Without a `value`, the score is the weighted mean of `criteria`: each `{ name, value, weight?, explanation?, evidence? }`, or `{ name, reached: false }` for a check that never ran (counts as 0). `criteria` in the options declares the checks by name (`{ 'cannot push': 'the share token gets 403' }`, or `{ name: { weight, description } }`): declared ones left out are not reached, undeclared ones are an error. `description` says what it checks, in the dashboard and `--dry-run`. See [one exercise, several checks](/docs/manual/scoring-and-evals/#one-exercise-several-checks).
- `judge(name, { rubric, description?, agent?, inputs?, answer?, passAt?, supportsPartial? })`  
  A scorer graded by a judge agent. EvalKit builds the prompt from the rubric, the `inputs` (`{ name: (ctx: ScoringContext) => JsonValue }`, default the conversation and the reply) and the answer format, reads the reply, and asks once more if it cannot. `agent` defaults to `judge` in `evalkit.config.ts`; it receives the matrix cell's `parameters`, so an axis can choose the judge's model. See [Judges](/docs/manual/scoring-and-evals/#judges).
- `choices({ A: [label, value], ... })`  
  A judge answer: one of the keys, worth its value from 0 to 1.
- `criteria({ name: weight | { weight?, description? } })`  
  A judge answer: a value from 0 to 1 per criterion; the score is their weighted mean.
- `passMark(passAt?, answer?): string`  
  The pass mark in words, as the dashboard shows it: `only 1`, `≥ 0.7`, `A or B`.
- `assertJudgesIndependent(eval, defaultJudge?)`  
  Throws when a judge would be graded by the scenario's own agent. The runner calls this.
- `metric(name, run: (ctx: ScoringContext) => number | undefined, { unit?, better? })`  
  A number measured for every run. `unit: 'ms'` formats as a duration; `better: 'lower' | 'higher'` colours comparisons.
- `skip(reason: string)`  
  Returned by a scorer that does not apply to this run; it neither passes nor fails and is left out of averages.
- `BUILT_IN_METRICS`: `readonly ['agent time', 'tokens', 'cached tokens', 'output tokens', 'cache hit rate', 'steps', 'tool calls', 'judge tokens']`  
  Recorded for every run; see [built-in metrics](/docs/manual/scoring-and-evals/#metrics). Their names are the type `BuiltInMetricName`; `metric()` rejects them as a type error. `MetricResult.name` is a `MetricName`: a built-in name, which editors suggest, or any other string. `tokens` is uncached input, cache writes and output; cache reads are `cached tokens`.

Helpers that read the agent's transcript, for scorers and metrics. Each takes the `ScoringContext`, or any `{ transcript }`:

- `messages(ctx, role?): Message[]`  
  Messages on the active path, optionally of one role (`user`, `assistant`, `tool`): `{ id, role, text, time, record }`. `text` joins the text blocks; `record` is the ATXF message.
- `toolCalls(ctx, name?): ToolCall[]`  
  The agent's tool calls in order, optionally of one tool: `{ id, name, arguments, input?, result?, isError, messageId, resultId? }`. `result` is the recorded result, when there is one.
- `lastReply(ctx): string`  
  The text of the agent's last reply, or `''`.
- `usage(ctx): Usage | undefined`  
  The usage the transcript reported, summed in ATXF's buckets (`input`, `output`, `cacheRead`, `cacheWrite`, `reasoning`); undefined when nothing reported usage.
- `modelContext(ctx): ModelContext`  
  What the model saw at the end, rebuilt by ATXF with compactions applied: its instructions, tools and messages.

`ScoringContext`, the argument of every scorer and metric:

| Field         | Meaning                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `context`     | The run's `AutContext`: IDs, `parameters`, candidate `data`, and the workspaces.                                                            |
| `transcript`  | What the agent did, as an [ATXF](https://atxf.leostera.dev) `Transcript`: all of it for final scorers, up to this step for checkpoints.     |
| `subagents`   | Sub-agent transcripts the agent kept, by transcript ID.                                                                                     |
| `runEvents`   | EvalKit's own events so far: steps, checkpoints, scorers and a reached limit.                                                               |
| `turn`        | The most recent turn: its `records`, `assistantMessages`, `toolCalls` (with results when observed) and `lastAssistantText`.                 |
| `output`      | The content of the turn's last assistant message.                                                                                           |
| `artifacts`   | `{ candidate: { root }, evaluator: { root } }`: absolute paths of the run's two workspaces.                                                 |
| `data`        | Values of **all** the scenario's datasets, candidate and evaluator, by dataset ID.                                                          |
| `checkpoints` | Results of the checkpoints so far, in order (all of them for final scorers and metrics).                                                    |
| `attach`      | `attach(name, content)`: save a file with the run's results, as adapters do.                                                                |
| `checkpoint`  | `checkpoint(rule)`: the latest result of that transcript step, with a predicate's evidence typed; throws for a rule outside the transcript. |

## Agents

- `defineAgent(adapter: AutAdapter)`  
  Checks an adapter and records where it is defined. See [Agents under test](/docs/manual/agents/).
- `piAgent({ command?, args? })`  
  A ready-made adapter that runs `pi --print --no-session --no-tools [args] <message>` in the run's workspace for each user message. It needs Bun, and Pi gets no tools or memory between turns.
- `agentRuntimes(adapter): AgentRuntimes`  
  The runtimes an adapter declares, or `DEFAULT_AGENT_RUNTIMES` when it declares none.
- `DEFAULT_AGENT_RUNTIMES`: `{ local: { kind: 'in-process' } }`  
  Used when an adapter declares no runtimes.
  An `AutAdapter` has an optional `identity` (`{ kind, id, name?, version? }`), optional `runtimes`, and `start({ context, runtime, transcript, attach })`, which resolves to an `AutSession`: `send(message)` and an optional `close()`. `send` may return a `TurnResult`, either the reply as a string or `{ reply?, toolCalls?, usage?, model? }`, instead of writing to the transcript. `attach(name, content)` saves a file such as the agent's log with the run's results; see [Attaching files](/docs/manual/agents/#attaching-files). `context.signal` aborts when the run hits a limit or is cancelled, and `context.limits` holds the limits in force.

`transcript` is a `TranscriptWriter`, which records what the agent did as an ATXF transcript. Each method appends one record and returns its ID:

- `user(content, { origin? })`, `assistant({ content, model?, usage?, stop?, error? })`  
  Messages. `content` is text or ATXF blocks (`text`, `reasoning`, `tool_call`, `image`); `model` is `provider/id`; `usage` is `UsageInput`: `{ input?, output?, cacheRead?, cacheWrite?, reasoning?, total? }`, with cached tokens kept out of `input`.
- `toolResult(callId, result, { name?, isError? })`  
  A tool call's result: a string is its text; any other JSON value is kept as is.
- `turn('start' | 'end', { turnId?, outcome?, error? })`  
  Marks a turn as the agent saw it; `turn('start')` returns the ID to end.
- `append(record)`, `import(transcript)`  
  Any other ATXF tree record; or the records of a transcript ATXF converted from your agent's own session format, not imported before.
- `subagent(transcript)`  
  Keeps a sub-agent's transcript with the run. Its steps and tokens count toward the limits.

## Datasets

- `defineDataset({ id, files?, value?, valueFile?, visibility?, mount? })` or `defineDataset({ id, onLoad, onRun?, ... })`  
  Static data, or computed data: `onLoad` runs once per process, `onRun` once per run. See [Datasets](/docs/manual/datasets/).
- `isDataset(value): value is Dataset`  
  True for values returned by `defineDataset`.
- `relativeDatasetPath(value, label): string`  
  Normalizes a relative POSIX path and rejects absolute or escaping ones, as `mount` and file keys are checked.

## Projects

- `defineConfig(config: EvalkitConfig)`  
  Types an `evalkit.config.ts`. Settings are listed in [Project structure](/docs/manual/project-structure/#configuration-and-precedence).
- `DEFAULT_ARTIFACT_EXCLUDE`: `readonly string[]`  
  What candidate snapshots leave out by default; spread it into `artifacts.exclude` to extend the list.
- `DEFAULT_ATTACHMENT_LIMITS`: `{ maxFileBytes: 5_000_000, maxRunBytes: 20_000_000 }`  
  The limits for `attach()` when `artifacts.attachments` does not set them.
- `defineSuite({ id, name?, evals })`  
  Groups evals explicitly, for a registry.
- `defineEvalMatrix({ id, evals, parameters, limits?, defaults?, cases?, exclude? })`  
  Runs evals over parameter combinations. `limits` (`{ steps: [40, 80] }`) adds axes named `limits.steps` and so on. See [CLI and matrices](/docs/manual/cli-and-matrices/).
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
  Build and parse the `evalkit:run:<uuid>` URIs in manifests (kinds `run`, `artifact`).

Every report file has an [Effect Schema](https://effect.website/docs/schema/introduction/) for decoding it yourself: `RunManifestSchema`, `RunMetadataSchema`, `RunSummarySchema`, `RunScoringSchema`, `RunSourceSchema`, `RunStatusSchema`, `RunDatasetSchema`, `BatchSchema`, `ScoreResultSchema`, `CheckpointResultSchema`, `MetricResultSchema`, `JudgeRunInfoSchema`, `RunEventSchema`, `TranscriptSchema`, `LimitsSchema`, `LimitReachedSchema`, `ArtifactEntrySchema`, `AttachmentEntrySchema`, `UsageSchema`, `AutIdentitySchema`, `RecordedErrorSchema`, `JsonValueSchema`, `ApiErrorSchema`, `ResourceKindSchema`, `ResourceUriSchema` and `UuidSchema`. `REPORT_SCHEMA_VERSION` is the `schemaVersion` they accept, 7. `TranscriptSchema` checks a value with ATXF's validator.

## Running and reading results (`@leostera/evalkit/runner`)

- `runEval(eval, options: RunEvalOptions): Effect<RunResult[]>`  
  Runs a scenario once, or `repeat` times as one batch, and saves each run. Resolves to one `RunResult` per run. `options.report` is required; see [Run from code](/docs/manual/results/#run-from-code) for the rest.
- `runMatrix(matrix, options & { selection?, onResult? })`  
  Runs every selected matrix cell (`repeat` times each) and resolves to `MatrixSummary`: `{ cells, runs, passed, failed, limited, cancelled }`.
- `localReportStore(directory): ReportStore`  
  Saves results in the `_evalkit-results` layout.
- `readRunManifest(root, runId)`, `readRunSummary(root, runId)`, `readRunScoring(root, runId)`, `readRunEvents(root, runId)`  
  Read and check a run's `manifest.json` (what ran), `summary.json` (how it ended), **scores** (`scoring.json`) or EvalKit's events (`run-events.jsonl`).
- `readRunTranscript(root, runId): Promise<Transcript>`, `readRunSubagents(root, runId): Promise<Record<string, Transcript>>`  
  Read a run's ATXF transcript (`transcript.atxf.jsonl`), and the sub-agent transcripts kept in `transcripts/`, by ID.
- `upgradeReports(root, { dryRun? }): Promise<UpgradeReport>`  
  Converts results saved by older versions, as `evalkit upgrade` does: `{ upgraded, runs, batches, running, transcripts, failed }`. `transcripts` counts trajectories converted to ATXF; `failed` lists runs that could not be, left as they were, with why.
- `ownerIsGone(process?): boolean`  
  True when a run's owning process ran on this host and no longer exists, meaning the run was interrupted.
- `staticDatasetFiles(dataset, root)`, `staticDatasetFile(dataset, root, file)`  
  List or read a static dataset's files without running any project code; computed datasets give `undefined`.
- `runWorkspacePath(sandboxDir, runId): string`  
  Where a run's kept workspace lives.
- `AutExecutionError`, `DatasetError`, `ReportError`, `ScoringError`, `CheckpointExecutionError`, `CancelledError`  
  The Effect tagged errors `runEval` can fail with, told apart by `_tag`.

Scores are in each run's `scoring.json` (`readRunScoring`), repeated in its `summary.json`. Manifests describe what ran and its status, never scores. See [Files on disk](/docs/manual/results/#files-on-disk).
