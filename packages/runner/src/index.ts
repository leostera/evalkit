export {
  AutExecutionError,
  CancelledError,
  DatasetError,
  ReportError,
  ScoringError,
  CheckpointExecutionError,
} from './errors.js';

import os from 'node:os';
import { Effect, Exit, Scope } from 'effect';
import {
  agentRuntimes,
  normalizeAutEvent,
  recordError,
  resourceUri,
  authoringId,
  toJsonObject,
  type AgentRuntimeName,
  type JsonObject,
  type ArtifactEntry,
  type AutContext,
  type AutEvent,
  type AutEventInput,
  type JsonValue,
  type EvalDefinition,
  type ReportStore,
  type RunnerEvent,
  type RunResult,
  type RunStatus,
  type ResourceKind,
  type RunWriter,
  type RunMetadata,
  type RunCatalog,
  type RunSource,
  type KeepSandboxes,
  type MetricResult,
  type ScoreResult,
  type TrialScoring,
  type Uuid,
  type TrajectoryEvent,
} from '@evalkit/core';
import { snapshotCandidateWorkspace } from './snapshot.js';
import { createTrialWorkspace, type TrialWorkspace } from './workspace.js';
import {
  prepareDatasets,
  trialDatasets,
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

export type RunEvalOptions = {
  report: ReportStore;
  runId?: string;
  trialId?: string;
  suiteId?: string;
  /** Overrides the eval policy's requested number of independent trials. */
  trials?: number;
  /** Parameters made available to the AUT for this invocation. */
  parameters?: JsonObject;
  /** Matrix provenance retained with every aggregate and trial manifest. */
  matrix?: RunMetadata['matrix'];
  /** Selects a declared AUT runtime such as local, sandbox, or remote. */
  runtime?: AgentRuntimeName;
  /** Maximum number of trials from this aggregate run executing concurrently. */
  concurrency?: number;
  /** Optional shared limiter for coordinating trials across aggregate runs. */
  semaphore?: Effect.Semaphore;
  /** Base directory for persistent local trial workspaces. Omit for an ephemeral OS temp workspace. */
  workspaceRoot?: string;
  /** With `workspaceRoot`: which trial workspaces to keep afterwards. Default `'failed'`. */
  keepWorkspaces?: KeepSandboxes;
  /** Candidate paths left out of the artifact snapshot. Default `DEFAULT_ARTIFACT_EXCLUDE`. */
  artifactExclude?: readonly string[];
  /** Repository and commit the eval code came from, recorded in the manifest. */
  source?: RunSource;
  /** The project's evals and suites at run time, saved beside the manifest. */
  catalog?: RunCatalog;
  /** Project root; dataset paths resolve against it. Default: the working directory. */
  root?: string;
  /**
   * Aborting stops new trials from starting; running trials stop at their next
   * step and are finalized as cancelled. Also passed to dataset loaders.
   */
  signal?: AbortSignal;
  /**
   * Observes every trajectory event after it is recorded, for live progress.
   * It must not throw; an error it throws is ignored.
   */
  onEvent?: (trial: TrialRef, event: TrajectoryEvent) => void;
  now?: () => Date;
};

/** Identifies the trial an observed event belongs to. */
export type TrialRef = {
  runId: string;
  trialId: string;
  trialIndex: number;
  evalId: string;
  suiteId?: string;
  parameters?: JsonObject;
};

type InternalTrialOptions = RunEvalOptions & {
  runWriter?: RunWriter;
  trialIndex?: number;
};

/** Effect-native aggregate eval execution entry point. */
export function runEval(
  definition: EvalDefinition,
  options: RunEvalOptions,
): Effect.Effect<RunResult, unknown> {
  return Effect.gen(function* () {
    yield* Effect.logInfo('eval run started').pipe(
      Effect.annotateLogs({
        evalId: authoringId(definition),
        ...(options.runId ? { runId: options.runId } : {}),
        ...(options.suiteId ? { suiteId: options.suiteId } : {}),
      }),
    );
    const result = yield* Effect.tryPromise({
      try: () => executeRun(definition, options),
      catch: (error) => error,
    });
    yield* Effect.logInfo('eval run finished').pipe(
      Effect.annotateLogs({
        evalId: authoringId(definition),
        runId: result.runId,
        status: result.status,
      }),
    );
    return result;
  });
}

function createId(_kind: 'run' | 'trial'): string {
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
  options: RunEvalOptions,
  runId: string,
  startedAt: string,
): RunMetadata {
  return {
    schemaVersion: 5,
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

/** Executes one aggregate eval run and its requested isolated trials. */
async function executeRun(
  definition: EvalDefinition,
  options: RunEvalOptions,
): Promise<RunResult> {
  let hasUser = false;
  for (const step of definition.transcript) {
    if (step.kind === 'user') hasUser = true;
    else if (step.kind !== 'agent' && !hasUser)
      throw new Error('Checkpoint requires a preceding user step');
  }
  if (definition.judge && definition.judge === definition.agent)
    throw new Error('Judge agent must be distinct from the agent under test');
  if (options.runId) assertUuid(options.runId, 'runId');
  if (options.trialId) assertUuid(options.trialId, 'trialId');
  const requestedTrials = options.trials ?? definition.policy?.trials ?? 1;
  if (!Number.isInteger(requestedTrials) || requestedTrials < 1) {
    throw new Error(
      `Trial count must be a positive integer; received ${requestedTrials}`,
    );
  }
  if (requestedTrials === 1) return runTrial(definition, options);

  const now = options.now ?? (() => new Date());
  const aggregateStartedAt = now();
  const runId = options.runId ?? createId('run');
  const runWriter = await options.report.startRun(
    runMetadata(definition, options, runId, aggregateStartedAt.toISOString()),
    { catalog: options.catalog },
  );
  const signal = options.signal;
  const trialEffects = Array.from(
    { length: requestedTrials },
    (_, trialIndex) => {
      const trial = Effect.tryPromise({
        // Once cancelled, trials that have not started are never created.
        try: async () =>
          signal?.aborted
            ? undefined
            : runTrial(definition, {
                ...options,
                runId,
                trialId: createId('trial'),
                trials: 1,
                runWriter,
                trialIndex,
              }),
        catch: (error) => error,
      });
      return options.semaphore
        ? options.semaphore.withPermits(1)(trial)
        : trial;
    },
  );
  const trials = (
    await Effect.runPromise(
      Effect.all(trialEffects, {
        concurrency: options.concurrency ?? 32,
      }),
    )
  ).filter((trial): trial is RunResult => trial !== undefined);
  const counts = trialCounts(trials);
  const status: RunStatus =
    counts.cancelled || signal?.aborted
      ? 'cancelled'
      : trials.some((trial) => trial.status === 'failed')
        ? 'failed'
        : 'completed';
  const endedAt = now();
  await runWriter.finalize({
    status,
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - aggregateStartedAt.getTime(),
    trialCount: trials.length,
    passed: counts.passed,
    failed: counts.failed,
    ...(counts.cancelled ? { cancelled: counts.cancelled } : {}),
  });
  if (!trials.length)
    return {
      runId,
      runUri: canonicalId('run', runId),
      trialId: '',
      trialUri: canonicalId('trial', runId),
      trialIndex: 0,
      evalId: authoringId(definition),
      status,
      reportLocation: runWriter.location,
      trialCount: 0,
      passed: 0,
      failed: 0,
      aggregateScoring: { passed: 0, failed: 0, passRate: 0 },
      trials: [],
    };
  const overallScores = trials
    .map((trial) => trial.scoring?.overall)
    .filter((score): score is number => score !== undefined);
  return {
    ...trials[0]!,
    runId,
    evalId: authoringId(definition),
    status,
    trialCount: trials.length,
    passed: counts.passed,
    failed: counts.failed,
    aggregateScoring: {
      passed: counts.passed,
      failed: counts.failed,
      ...(counts.cancelled ? { cancelled: counts.cancelled } : {}),
      passRate: counts.passed / trials.length,
      ...(overallScores.length
        ? {
            overall:
              overallScores.reduce((sum, score) => sum + score, 0) /
              overallScores.length,
          }
        : {}),
    },
    trials,
  };
}

async function runTrial(
  definition: EvalDefinition,
  options: InternalTrialOptions,
): Promise<RunResult> {
  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? createId('run');
  const trialId = options.trialId ?? createId('trial');
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
  const trialIndex = options.trialIndex ?? 0;
  const signal = options.signal ?? new AbortController().signal;
  const root = options.root ?? process.cwd();
  const baseContext = {
    runId,
    evalId: authoringId(definition),
    trialId,
    trialIndex,
    metadata: {
      ...toJsonObject(definition.metadata ?? {}, `${definition.id}.metadata`),
      randomSeed,
    },
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(selectedRuntime ? { runtime: selectedRuntime } : {}),
  } as const;
  // Loading may fail; the trial then fails with the error recorded in its report.
  let datasetsError: unknown;
  let prepared: PreparedDataset[] = [];
  try {
    prepared = await prepareDatasets(definition.datasets ?? [], root, {
      evalId: baseContext.evalId,
      runId,
      trialId,
      trialIndex,
      seed: randomSeed,
      parameters: options.parameters ?? {},
      signal,
    });
  } catch (error) {
    datasetsError = error;
  }
  const candidateData = datasetValues(prepared, 'candidate');
  const scoringData = datasetValues(prepared, 'all');
  const events: TrajectoryEvent[] = [];
  const runWriter =
    options.runWriter ??
    (await options.report.startRun(
      runMetadata(definition, options, runId, startedAt),
      { catalog: options.catalog },
    ));
  const trialWriter = await runWriter.startTrial({
    schemaVersion: 5,
    runId,
    runUri: canonicalId('run', runId),
    trialId,
    trialUri: canonicalId('trial', trialId),
    trialIndex: options.trialIndex ?? 0,
    evalId: definition.id,
    ...(definition.agent.identity ? { aut: definition.agent.identity } : {}),
    parameters: options.parameters,
    matrix: options.matrix,
    startedAt,
    ...(prepared.length ? { datasets: trialDatasets(prepared) } : {}),
  });

  let writeChain = Promise.resolve();
  let reportingFailed = false;
  const trialRef: TrialRef = {
    runId,
    trialId,
    trialIndex,
    evalId: definition.id,
    ...(options.suiteId ? { suiteId: options.suiteId } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
  };
  const observe = (event: TrajectoryEvent) => {
    try {
      options.onEvent?.(trialRef, event);
    } catch {
      // Progress display must never affect a trial.
    }
  };
  const append = async (event: TrajectoryEvent): Promise<void> => {
    events.push(event);
    writeChain = writeChain.then(() => trialWriter.appendEvent(event));
    try {
      await writeChain;
      observe(event);
    } catch (cause) {
      reportingFailed = true;
      throw new ReportError({
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };
  const emitRunner = (event: RunnerEvent) =>
    append({ ...event, source: 'runner' });
  const emitAut = (event: AutEvent) => append({ ...event, source: 'aut' });
  const onAutEvent = (event: AutEventInput) =>
    emitAut(normalizeAutEvent(event, now));

  let workspace: TrialWorkspace | undefined;
  let context: AutContext | undefined;
  let primaryError: unknown;
  let closeError: unknown;
  let scoring: TrialScoring | undefined;
  let artifacts: ArtifactEntry[] | undefined;
  let status: RunStatus = 'running';
  const progress: TranscriptProgress = { checkpoints: [], stoppedEarly: false };
  let cleanupError: unknown;
  const workspaceScope = await Effect.runPromise(Scope.make());

  try {
    await emitRunner({ kind: 'trial-started', timestamp: now().toISOString() });
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
          try: () =>
            createTrialWorkspace(trialId, prepared, options.workspaceRoot),
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
                  Effect.logError('trial workspace cleanup failed'),
                ),
              ),
            ),
          ),
      ).pipe(Effect.provideService(Scope.Scope, workspaceScope)),
    );
    const trialWorkspace = workspace;
    const trialContext: AutContext = {
      ...baseContext,
      data: candidateData,
      workspace: trialWorkspace.artifacts.candidate,
      evaluatorWorkspace: trialWorkspace.artifacts.evaluator,
    };
    context = trialContext;
    // The Effect bracket closes the AUT even when a step or report append fails.
    await runBoundary(
      Effect.acquireUseRelease(
        Effect.tryPromise({
          try: () =>
            definition.agent.start({
              context: trialContext,
              ...(runtime ? { runtime } : {}),
              onEvent: onAutEvent,
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
                context: trialContext,
                artifacts: trialWorkspace.artifacts,
                events,
                now,
                randomSeed,
                emitRunner,
                emitAut,
                data: scoringData,
                signal,
                progress,
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
      ).pipe(Effect.annotateLogs({ runId, trialId, evalId: definition.id })),
    );
  } catch (error) {
    primaryError = error;
    await tryEmitError(error, emitRunner, now);
  }

  if (closeError) {
    if (!primaryError) primaryError = closeError;
    await tryEmitError(closeError, emitRunner, now);
  }

  const wasCancelled = primaryError instanceof CancelledError;
  const { checkpoints, stoppedEarly, lastTurn } = progress;
  const scoreResults: ScoreResult[] = [];
  const skippedScorers: string[] = [];
  const metrics: MetricResult[] = [];
  try {
    await evaluateFinalScorers(definition, {
      context,
      workspace,
      events,
      lastTurn,
      primaryError,
      stoppedEarly,
      cancelled: wasCancelled,
      reportingFailed,
      results: scoreResults,
      skippedScorers,
      data: scoringData,
      checkpoints,
      now,
      emitRunner,
    });

    metrics.push(...builtInMetrics(events));
    if (context && workspace && !wasCancelled)
      metrics.push(
        ...(await evaluateMetrics(
          definition,
          scoringContext({
            context,
            workspace,
            events,
            lastTurn,
            data: scoringData,
            checkpoints,
          }),
        )),
      );
    scoring = scoreSummary(scoreResults, checkpoints, skippedScorers, metrics);
    await trialWriter.writeScores(scoring);

    if (workspace) {
      try {
        artifacts = await snapshotCandidateWorkspace(
          workspace.artifacts.candidate.root,
          trialWriter,
          options.artifactExclude,
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
        kind: 'trial-completed',
        timestamp: now().toISOString(),
      });
    } catch (error) {
      primaryError = error;
    }
  }
  status = wasCancelled ? 'cancelled' : primaryError ? 'failed' : 'completed';

  const error = primaryError ? recordError(primaryError) : undefined;
  const endedAt = now().toISOString();
  await trialWriter.finalize({
    status,
    endedAt,
    durationMs: new Date(endedAt).getTime() - new Date(startedAt).getTime(),
    scoring,
    ...(artifacts ? { artifacts } : {}),
    ...(error ? { error } : {}),
  });
  if (!options.runWriter) {
    const counts = trialCounts([{ status, scoring }]);
    await runWriter.finalize({
      status,
      endedAt,
      durationMs: new Date(endedAt).getTime() - new Date(startedAt).getTime(),
      trialCount: 1,
      passed: counts.passed,
      failed: counts.failed,
      ...(counts.cancelled ? { cancelled: counts.cancelled } : {}),
      ...(error ? { error } : {}),
    });
  }

  return {
    runId,
    runUri: canonicalId('run', runId),
    trialId,
    trialUri: canonicalId('trial', trialId),
    trialIndex: options.trialIndex ?? 0,
    evalId: definition.id,
    status,
    reportLocation: runWriter.location,
    durationMs: new Date(endedAt).getTime() - new Date(startedAt).getTime(),
    scoring,
    ...(error ? { error } : {}),
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

/** A cancelled trial is neither passed nor failed. */
function trialCounts(
  trials: readonly Pick<RunResult, 'status' | 'scoring'>[],
): { passed: number; failed: number; cancelled: number } {
  let passed = 0;
  let failed = 0;
  let cancelledTrials = 0;
  for (const trial of trials) {
    if (trial.status === 'cancelled') cancelledTrials++;
    else if (trial.status === 'completed' && trial.scoring?.passed) passed++;
    else failed++;
  }
  return { passed, failed, cancelled: cancelledTrials };
}

/** Persistent workspaces of trials that did not pass are kept for debugging by default. */
function keepWorkspace(
  policy: KeepSandboxes = 'failed',
  passed: boolean,
): boolean {
  return policy === 'all' || (policy === 'failed' && !passed);
}
