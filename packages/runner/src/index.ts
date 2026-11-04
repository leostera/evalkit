export {
  AutExecutionError,
  CancelledError,
  DatasetError,
  ReportError,
  ScoringError,
  CheckpointExecutionError,
} from './errors.js';

import { attachmentStore } from './attachments.js';
import { assertNoRemovedOptions } from '@evalkit/core/upgrade';
import os from 'node:os';
import { Effect, Exit, Scope } from 'effect';
import {
  agentRuntimes,
  assertJudgesIndependent,
  type AutAdapter,
  DEFAULT_ARTIFACT_EXCLUDE,
  recordError,
  resourceUri,
  authoringId,
  toJsonObject,
  type AgentRuntimeName,
  type JsonObject,
  type ArtifactEntry,
  type AutContext,
  type Isolation,
  none,
  type EntryRecord,
  type JsonValue,
  type LimitReached,
  type Limits,
  type EvalDefinition,
  type ReportStore,
  type RunEvent,
  type RunnerEvent,
  type RunResult,
  type RunStatus,
  type ResourceKind,
  type Batch,
  type RunMetadata,
  type RunCatalog,
  type RunSource,
  type AttachmentLimits,
  type KeepSandboxes,
  type MetricResult,
  type ScoreResult,
  type RunScoring,
  type Uuid,
} from '@evalkit/core';
import {
  formatLimit,
  limitsFromParameters,
  parseLimits,
  resolveLimits,
} from '@evalkit/core/limits';
import { uncachedTokens } from '@evalkit/core/usage';
import { RunTranscript } from './run-transcript.js';
import { openRunShell, type FixtureSet, type RunShell } from './shell/index.js';
import { snapshotCandidateWorkspace } from './snapshot.js';
import { createRunWorkspace, type RunWorkspace } from './workspace.js';
import {
  prepareDatasets,
  runDatasets,
  type PreparedDataset,
} from './datasets.js';
import { executeTranscript, type TranscriptProgress } from './transcript.js';
import {
  evaluateFinalScorers,
  scoreSummary,
  scoringContext,
} from './final-scoring.js';
import { builtInMetrics, evaluateMetrics } from './metrics.js';
import {
  AutExecutionError,
  CancelledError,
  DatasetError,
  LimitReachedError,
  ReportError,
  cancelled,
} from './errors.js';
import { runBoundary } from './effect-boundary.js';

export { localReportStore } from './local-report-store.js';
export {
  staticDatasetFile,
  staticDatasetFiles,
  type DatasetFileEntry,
} from './datasets.js';
export * from './local-report-reader.js';
export { runMatrix, type MatrixSummary } from './matrix.js';
export { upgradeReports, type UpgradeReport } from './upgrade.js';
export {
  fixtureSet,
  removeRunContainer,
  type FixtureSet,
} from './shell/index.js';

export type RunEvalOptions = {
  report: ReportStore;
  /** The run's ID; only with one run (no `repeat`). */
  runId?: string;
  suiteId?: string;
  /** Overrides the scenario's `repeat`: how many runs to start, as one batch. */
  repeat?: number;
  /** Parameters made available to the AUT, and to judges, for this invocation. */
  parameters?: JsonObject;
  /** Where each run's processes run, through `context.shell`. Default `none()`: on the host. */
  isolation?: Isolation;
  /** The project's fixtures, shared by an invocation's runs; started by the first run. */
  fixtures?: FixtureSet;
  /** The agent for judges that name none (`judge` in evalkit.config.ts). */
  judge?: AutAdapter;
  /** Matrix provenance recorded in every run's manifest. */
  matrix?: RunMetadata['matrix'];
  /** Selects a declared AUT runtime such as local, sandbox, or remote. */
  runtime?: AgentRuntimeName;
  /** Maximum number of this batch's runs executing concurrently. */
  concurrency?: number;
  /** Optional shared limiter for coordinating runs across batches. */
  semaphore?: Effect.Semaphore;
  /** Base directory for persistent local run workspaces. Omit for an ephemeral OS temp workspace. */
  workspaceRoot?: string;
  /** With `workspaceRoot`: which run workspaces to keep afterwards. Default `'failed'`. */
  keepWorkspaces?: KeepSandboxes;
  /**
   * Candidate paths left out of the artifact snapshot, before the scenario's
   * own `workspace.ignore`. Default `DEFAULT_ARTIFACT_EXCLUDE`.
   */
  artifactExclude?: readonly string[];
  /** Size limits for files adapters and scorers `attach()`. Default `DEFAULT_ATTACHMENT_LIMITS`. */
  attachmentLimits?: AttachmentLimits;
  /** Repository and commit the eval code came from, recorded in the manifest. */
  source?: RunSource;
  /** The project's evals and suites at run time, saved beside the manifest. */
  catalog?: RunCatalog;
  /** Project root; dataset paths resolve against it. Default: the working directory. */
  root?: string;
  /**
   * Aborting stops new runs from starting; running ones stop at their next
   * step and are finalized as cancelled. Also passed to dataset loaders.
   */
  signal?: AbortSignal;
  /**
   * What each run may use before EvalKit stops it. `base` is the project's
   * limits; the scenario's own come after it, then a matrix cell's
   * `limits.<kind>` parameters, then `override` (`--limit`), kind by kind.
   */
  limits?: { base?: Limits; override?: Limits };
  /**
   * Observes every transcript record and run event once recorded, for live
   * progress. It must not throw; an error it throws is ignored.
   */
  onUpdate?: (run: RunRef, update: RunUpdate) => void;
  now?: () => Date;
};

/** A record appended to a run's transcript, or one of EvalKit's events. */
export type RunUpdate =
  { kind: 'record'; record: EntryRecord } | { kind: 'event'; event: RunEvent };

/** Identifies the run an observed event belongs to. */
export type RunRef = {
  runId: string;
  batch?: Batch;
  evalId: string;
  suiteId?: string;
  parameters?: JsonObject;
};

type RunOnceOptions = RunEvalOptions & { batch?: Batch };

/**
 * Runs a scenario: once, or `repeat` times as one batch. Resolves to one
 * result per run started; runs never started because of cancellation are
 * left out.
 */
export function runEval(
  definition: EvalDefinition,
  options: RunEvalOptions,
): Effect.Effect<RunResult[], unknown> {
  return Effect.gen(function* () {
    yield* Effect.logInfo('eval run started').pipe(
      Effect.annotateLogs({
        evalId: authoringId(definition),
        ...(options.runId ? { runId: options.runId } : {}),
        ...(options.suiteId ? { suiteId: options.suiteId } : {}),
      }),
    );
    const runs = yield* Effect.tryPromise({
      try: () => executeBatch(definition, options),
      catch: (error) => error,
    });
    yield* Effect.logInfo('eval run finished').pipe(
      Effect.annotateLogs({
        evalId: authoringId(definition),
        runs: runs.length,
        passed: runs.filter((run) => run.status === 'passed').length,
      }),
    );
    return runs;
  });
}

function createId(): string {
  return crypto.randomUUID();
}

function canonicalId<K extends ResourceKind>(kind: K, id: string) {
  return resourceUri(kind, id as Uuid);
}

function assertUuid(value: string, label: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(`${label} must be a UUID`);
  }
}

function runMetadata(
  definition: EvalDefinition,
  options: RunOnceOptions,
  runId: string,
  startedAt: string,
  extra: Pick<RunMetadata, 'workspaceIgnore' | 'datasets' | 'limits'>,
): RunMetadata {
  return {
    schemaVersion: 7,
    runId,
    runUri: canonicalId('run', runId),
    evalId: definition.id,
    ...(options.suiteId ? { suiteId: options.suiteId } : {}),
    ...(options.source ? { source: options.source } : {}),
    process: { pid: process.pid, hostname: os.hostname() },
    ...(definition.agent.identity ? { aut: definition.agent.identity } : {}),
    parameters: options.parameters,
    matrix: options.matrix,
    startedAt,
    ...(options.batch ? { batch: options.batch } : {}),
    ...extra,
  };
}

/** Recording a secondary error must never mask the original failure or block cleanup. */
async function tryEmitError(
  error: unknown,
  emitRunner: (event: RunnerEvent) => Promise<void>,
  now: () => Date,
): Promise<void> {
  try {
    await emitRunner({
      kind: 'error',
      error: recordError(error),
      timestamp: now().toISOString(),
    });
  } catch {
    // A failed report writer cannot prevent cleanup or finalization.
  }
}

/** Starts `repeat` runs of a scenario, as one batch when there are several. */
async function executeBatch(
  definition: EvalDefinition,
  options: RunEvalOptions,
): Promise<RunResult[]> {
  let hasUser = false;
  for (const step of definition.transcript) {
    if (step.kind === 'user') hasUser = true;
    else if (step.kind !== 'agent' && !hasUser)
      throw new Error('Checkpoint requires a preceding user step');
  }
  assertNoRemovedOptions(definition);
  assertJudgesIndependent(definition, options.judge);
  for (const rule of [...definition.transcript, ...definition.scoring])
    if (rule.kind === 'judge' && !rule.agent && !options.judge)
      throw new Error(
        `Judge ${rule.name} in ${definition.id} has no agent: pass judge(name, { agent }) or set judge in evalkit.config.ts`,
      );
  if (options.runId) assertUuid(options.runId, 'runId');
  const repeat = options.repeat ?? definition.repeat ?? 1;
  if (!Number.isInteger(repeat) || repeat < 1)
    throw new Error(`repeat must be a positive integer; received ${repeat}`);
  if (repeat === 1) return [await runOnce(definition, options)];
  if (options.runId)
    throw new Error('runId names one run; it cannot be used with repeat');

  const batchId = createId();
  const signal = options.signal;
  const runs = Array.from({ length: repeat }, (_, index) => {
    const run = Effect.tryPromise({
      // Once cancelled, runs that have not started are never created.
      try: async () =>
        signal?.aborted
          ? undefined
          : runOnce(definition, {
              ...options,
              batch: { id: batchId, index, size: repeat },
            }),
      catch: (error) => error,
    });
    return options.semaphore ? options.semaphore.withPermits(1)(run) : run;
  });
  return (
    await Effect.runPromise(
      Effect.all(runs, { concurrency: options.concurrency ?? 32 }),
    )
  ).filter((run): run is RunResult => run !== undefined);
}

/** One execution: a session in its own sandbox, scored and reported. */
async function runOnce(
  definition: EvalDefinition,
  options: RunOnceOptions,
): Promise<RunResult> {
  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? createId();
  const startedAt = now().toISOString();
  const selectedRuntime = options.runtime;
  const runtime = selectedRuntime
    ? agentRuntimes(definition.agent)[selectedRuntime]
    : undefined;
  if (selectedRuntime && !runtime) {
    throw new Error(
      `AUT does not declare the requested ${selectedRuntime} runtime`,
    );
  }

  const randomSeed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const batch = options.batch;
  const signal = options.signal ?? new AbortController().signal;
  const root = options.root ?? process.cwd();
  const baseContext = {
    runId,
    evalId: authoringId(definition),
    ...(batch ? { batch } : {}),
    metadata: {
      ...toJsonObject(definition.metadata ?? {}, `${definition.id}.metadata`),
      randomSeed,
    },
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(selectedRuntime ? { runtime: selectedRuntime } : {}),
  } as const;
  // Loading may fail; the run then errors with the error recorded in its report.
  let datasetsError: unknown;
  let prepared: PreparedDataset[] = [];
  try {
    // Fixtures start first: a dataset's onRun may seed one.
    await options.fixtures?.ensure();
    prepared = await prepareDatasets(definition.datasets ?? [], root, {
      evalId: baseContext.evalId,
      runId,
      ...(batch ? { batch } : {}),
      seed: randomSeed,
      parameters: options.parameters ?? {},
      fixtures: options.fixtures?.addresses(none()) ?? {},
      signal,
    });
  } catch (error) {
    datasetsError = error;
  }
  const candidateData = datasetValues(prepared, 'candidate');
  const scoringData = datasetValues(prepared, 'all');
  const workspaceIgnore = [
    ...(options.artifactExclude ?? DEFAULT_ARTIFACT_EXCLUDE),
    ...(definition.workspace?.ignore ?? []),
  ];
  const limits = resolveLimits(
    options.limits?.base ?? {},
    parseLimits(definition.limits, `Eval ${definition.id}`),
    limitsFromParameters(options.parameters),
    options.limits?.override ?? {},
  );
  const runWriter = await options.report.startRun(
    runMetadata(definition, options, runId, startedAt, {
      workspaceIgnore,
      ...(prepared.length ? { datasets: runDatasets(prepared) } : {}),
      ...(Object.keys(limits).length ? { limits } : {}),
      ...(options.isolation?.kind === 'container'
        ? {
            isolation: {
              kind: 'container' as const,
              image: options.isolation.image,
              network: options.isolation.network,
            },
          }
        : options.isolation?.kind === 'sandbox-exec'
          ? { isolation: { kind: 'sandbox-exec' as const } }
          : {}),
    }),
    { catalog: options.catalog },
  );
  const attachments = attachmentStore(runWriter, options.attachmentLimits);

  let writeChain = Promise.resolve();
  let reportingFailed = false;
  const runRef: RunRef = {
    runId,
    ...(batch ? { batch } : {}),
    evalId: definition.id,
    ...(options.suiteId ? { suiteId: options.suiteId } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
  };
  const observe = (update: RunUpdate) => {
    try {
      options.onUpdate?.(runRef, update);
    } catch {
      // Progress display must never affect a run.
    }
  };

  // Limits: counted as records are appended; time from the session's start.
  const limitController = new AbortController();
  const runSignal = AbortSignal.any([signal, limitController.signal]);
  let reached: LimitReached | undefined;
  let steps = 0;
  let tokens = 0;
  const reach = (limit: LimitReached) => {
    if (reached || signal.aborted) return;
    reached = limit;
    void emitRunner({
      kind: 'limit-reached',
      ...limit,
      timestamp: now().toISOString(),
    }).catch(() => {
      // The limit still stops the run when its event cannot be written.
    });
    limitController.abort(
      new LimitReachedError({
        message: `Stopped at its ${limit.limit} limit (${formatLimit(limit.limit, limit.value)})`,
        limit,
      }),
    );
  };
  const countRecord = (record: EntryRecord) => {
    if (record.type === 'message' && record.role === 'assistant') {
      steps += 1;
      if (record.usage) tokens += uncachedTokens(record.usage);
    } else if (
      (record.type === 'usage' && !record.cumulative) ||
      record.type === 'compaction' ||
      record.type === 'branch_summary'
    )
      tokens += record.usage ? uncachedTokens(record.usage) : 0;
    if (limits.steps !== undefined && steps > limits.steps)
      reach({ limit: 'steps', value: limits.steps, used: steps });
    else if (limits.tokens !== undefined && tokens > limits.tokens)
      reach({ limit: 'tokens', value: limits.tokens, used: tokens });
  };
  let timeLimit: ReturnType<typeof setTimeout> | undefined;
  let sessionStarted: number | undefined;

  const transcript = new RunTranscript({
    id: runId,
    agent: {
      id: definition.agent.identity?.id ?? 'agent',
      ...(definition.agent.identity?.version
        ? { version: definition.agent.identity.version }
        : {}),
    },
    runId,
    scenarioId: definition.id,
    now,
    persist: (line) => runWriter.appendTranscript(line),
    persistSubagent: (id, text) => runWriter.writeSubagent(id, text),
    onRecord: (record) => {
      countRecord(record);
      observe({ kind: 'record', record });
    },
    // Sub-agents' steps and tokens count toward the run's limits.
    onSubagentRecord: countRecord,
  });
  const runEvents: RunEvent[] = [];
  const emitRunner = async (input: RunnerEvent): Promise<void> => {
    const event = { ...input, at: transcript.leafId } as RunEvent;
    runEvents.push(event);
    writeChain = writeChain.then(() => runWriter.appendEvent(event));
    try {
      await writeChain;
      observe({ kind: 'event', event });
    } catch (cause) {
      reportingFailed = true;
      throw new ReportError({
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  let workspace: RunWorkspace | undefined;
  let runShell: RunShell | undefined;
  let context: AutContext | undefined;
  let primaryError: unknown;
  let closeError: unknown;
  let scoring: RunScoring | undefined;
  let artifacts: ArtifactEntry[] | undefined;
  let status: RunStatus = 'running';
  const progress: TranscriptProgress = { checkpoints: [], stoppedEarly: false };
  let cleanupError: unknown;
  const workspaceScope = await Effect.runPromise(Scope.make());

  try {
    await emitRunner({ kind: 'run-started', timestamp: now().toISOString() });
    if (signal.aborted) throw cancelled();
    if (datasetsError)
      throw new DatasetError({
        cause: datasetsError,
        message:
          datasetsError instanceof Error
            ? datasetsError.message
            : String(datasetsError),
      });
    workspace = await runBoundary(
      Effect.acquireRelease(
        Effect.tryPromise({
          try: () => createRunWorkspace(runId, prepared, options.workspaceRoot),
          catch: (cause) =>
            new DatasetError({
              cause,
              message: cause instanceof Error ? cause.message : String(cause),
            }),
        }),
        (created) =>
          Effect.tryPromise({
            try: () =>
              created.cleanup(
                keepWorkspace(options.keepWorkspaces, scoring?.passed === true),
              ),
            catch: (cause) =>
              new DatasetError({
                cause,
                message: cause instanceof Error ? cause.message : String(cause),
              }),
          }).pipe(
            Effect.catchAll((error) =>
              Effect.sync(() => {
                cleanupError = error;
              }).pipe(
                Effect.tap(() =>
                  Effect.logError('run workspace cleanup failed'),
                ),
              ),
            ),
          ),
      ).pipe(Effect.provideService(Scope.Scope, workspaceScope)),
    );
    const runWorkspace = workspace;
    // Opened after the workspace, so it closes first: a container goes before its mount.
    runShell = await runBoundary(
      Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            openRunShell({
              isolation: options.isolation ?? none(),
              runId,
              root: runWorkspace.artifacts.candidate.root,
              projectRoot: options.root ?? process.cwd(),
              signal: runSignal,
              ...(options.fixtures ? { fixtures: options.fixtures } : {}),
            }),
          catch: (cause) =>
            new AutExecutionError({
              cause,
              message: `Could not set up the run's ${isolationLabel(options.isolation)}: ${cause instanceof Error ? cause.message : String(cause)}`,
            }),
        }),
        (opened) =>
          Effect.promise(() =>
            opened
              .close({
                keep: keepWorkspace(
                  options.keepWorkspaces,
                  scoring?.passed === true,
                ),
              })
              .catch((error: unknown) => {
                cleanupError ??= error;
              }),
          ),
      ).pipe(Effect.provideService(Scope.Scope, workspaceScope)),
    );
    const runContext: AutContext = {
      ...baseContext,
      signal: runSignal,
      limits,
      shell: runShell.shell,
      fixtures: runShell.fixtures,
      data: candidateData,
      workspace: runWorkspace.artifacts.candidate,
      evaluatorWorkspace: runWorkspace.artifacts.evaluator,
    };
    context = runContext;
    sessionStarted = Date.now();
    if (limits.time !== undefined) {
      const time = limits.time;
      timeLimit = setTimeout(
        () =>
          reach({
            limit: 'time',
            value: time,
            used: Date.now() - (sessionStarted ?? Date.now()),
          }),
        time,
      );
      timeLimit.unref?.();
    }
    // The Effect bracket closes the AUT even when a step or report append fails.
    await runBoundary(
      Effect.acquireUseRelease(
        Effect.tryPromise({
          try: () =>
            definition.agent.start({
              context: runContext,
              ...(runtime ? { runtime } : {}),
              transcript: transcript.writer(),
              attach: attachments.attach,
            }),
          catch: (cause) =>
            new AutExecutionError({
              cause,
              message: cause instanceof Error ? cause.message : String(cause),
            }),
        }),
        (session) =>
          Effect.tryPromise({
            try: () =>
              executeTranscript(definition, session, {
                context: runContext,
                artifacts: runWorkspace.artifacts,
                transcript,
                runEvents,
                now,
                randomSeed,
                emitRunner,
                data: scoringData,
                signal: runSignal,
                progress,
                attach: attachments.attach,
                defaultJudge: options.judge,
              }),
            catch: (cause) => cause,
          }),
        (opened) =>
          Effect.tryPromise({
            try: async () => opened.close?.(),
            catch: (cause) =>
              new AutExecutionError({
                cause,
                message: cause instanceof Error ? cause.message : String(cause),
              }),
          }).pipe(
            Effect.catchAll((error) =>
              Effect.sync(() => {
                closeError = error;
              }).pipe(
                Effect.tap(() => Effect.logError('AUT session close failed')),
              ),
            ),
          ),
      ).pipe(Effect.annotateLogs({ runId, evalId: definition.id })),
    );
  } catch (error) {
    primaryError = error;
    // A limit is recorded by its own limit-reached event, not as an error.
    if (!(error instanceof LimitReachedError))
      await tryEmitError(error, emitRunner, now);
  }

  if (timeLimit) clearTimeout(timeLimit);
  if (closeError) {
    if (!primaryError) primaryError = closeError;
    await tryEmitError(closeError, emitRunner, now);
  }

  // The session is over: what the agent did is final, sealed and checked.
  transcript.seal();
  const problems = transcript.problems();
  if (problems.length) {
    const invalid = new AutExecutionError({
      cause: problems,
      message: `The agent's transcript is not valid ATXF: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (${problems.length - 3} more)` : ''}`,
    });
    if (!primaryError) primaryError = invalid;
    await tryEmitError(invalid, emitRunner, now);
  }

  // A turn that settled within its grace still ends the run limited.
  if (reached && primaryError === undefined)
    primaryError = limitController.signal.reason;
  const limited = primaryError instanceof LimitReachedError;
  if (limited) primaryError = undefined;
  const wasCancelled = primaryError instanceof CancelledError;
  const { checkpoints, stoppedEarly, lastTurn } = progress;
  const scoreResults: ScoreResult[] = [];
  const skippedScorers: string[] = [];
  const metrics: MetricResult[] = [];
  try {
    await evaluateFinalScorers(definition, {
      context,
      workspace,
      agentTranscript: transcript,
      runEvents,
      lastTurn,
      primaryError,
      limited,
      stoppedEarly,
      cancelled: wasCancelled,
      reportingFailed,
      results: scoreResults,
      skippedScorers,
      data: scoringData,
      checkpoints,
      attach: attachments.attach,
      defaultJudge: options.judge,
      now,
      emitRunner,
    });

    metrics.push(
      ...builtInMetrics(
        transcript.transcript,
        runEvents,
        [...scoreResults, ...checkpoints],
        Object.values(transcript.subagents),
      ),
    );
    if (context && workspace && !wasCancelled)
      metrics.push(
        ...(await evaluateMetrics(
          definition,
          scoringContext({
            context,
            workspace,
            agentTranscript: transcript,
            runEvents,
            lastTurn,
            data: scoringData,
            checkpoints,
            transcript: definition.transcript,
            attach: attachments.attach,
          }),
        )),
      );
    scoring = scoreSummary(scoreResults, checkpoints, skippedScorers, metrics);
    await runWriter.writeScores(scoring);

    if (workspace) {
      try {
        artifacts = await snapshotCandidateWorkspace(
          workspace.artifacts.candidate.root,
          runWriter,
          workspaceIgnore,
        );
      } catch (captureError) {
        if (!primaryError) primaryError = captureError;
        await tryEmitError(captureError, emitRunner, now);
      }
    }
  } catch (error) {
    if (!primaryError) primaryError = error;
    await tryEmitError(error, emitRunner, now);
  } finally {
    await Effect.runPromise(
      Scope.close(workspaceScope, Exit.succeed(undefined)),
    );
    if (cleanupError) {
      if (!primaryError) primaryError = cleanupError;
      await tryEmitError(cleanupError, emitRunner, now);
    }
  }

  scoring ??= scoreSummary(scoreResults, checkpoints, skippedScorers, metrics);
  if (!primaryError) {
    try {
      await emitRunner({
        kind: 'run-completed',
        timestamp: now().toISOString(),
      });
    } catch (error) {
      primaryError = error;
    }
  }
  try {
    await transcript.settled();
  } catch (cause) {
    primaryError ??= new ReportError({
      cause,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
  status = wasCancelled
    ? 'cancelled'
    : primaryError
      ? 'errored'
      : limited
        ? 'limited'
        : scoring.passed
          ? 'passed'
          : 'failed';

  // Fixture output while this run was up, beside the agent's own logs.
  if (options.fixtures?.started)
    for (const log of options.fixtures.logs())
      await attachments
        .attach(`logs/fixtures/${log.name}.log`, log.content)
        .catch(() => undefined);
  const error = primaryError ? recordError(primaryError) : undefined;
  const attached = await attachments.close();
  const endedAt = now().toISOString();
  const durationMs =
    new Date(endedAt).getTime() - new Date(startedAt).getTime();
  await runWriter.finalize({
    status,
    endedAt,
    durationMs,
    scoring,
    ...(artifacts ? { artifacts } : {}),
    ...(attached.length ? { attachments: attached } : {}),
    ...(error ? { error } : {}),
    ...(limited && reached ? { limit: reached } : {}),
  });
  return {
    runId,
    runUri: canonicalId('run', runId),
    evalId: definition.id,
    status,
    ...(batch ? { batch } : {}),
    reportLocation: runWriter.location,
    durationMs,
    scoring,
    ...(error ? { error } : {}),
    ...(limited && reached ? { limit: reached } : {}),
  };
}

function datasetValues(
  prepared: readonly PreparedDataset[],
  audience: 'candidate' | 'all',
): { [id: string]: JsonValue } {
  const values: { [id: string]: JsonValue } = {};
  for (const { dataset, value } of prepared) {
    if (value === undefined) continue;
    if (audience === 'candidate' && dataset.visibility !== 'candidate')
      continue;
    values[dataset.id] = value;
  }
  return values;
}

/** Persistent workspaces of runs that did not pass are kept for debugging by default. */
function isolationLabel(isolation: Isolation | undefined): string {
  if (isolation?.kind === 'container') return 'container';
  if (isolation?.kind === 'sandbox-exec') return 'sandbox';
  return 'shell';
}

function keepWorkspace(
  policy: KeepSandboxes = 'failed',
  passed: boolean,
): boolean {
  return policy === 'all' || (policy === 'failed' && !passed);
}

export { runWorkspacePath } from './workspace.js';
