export {
  AutExecutionError,
  FixtureError,
  ReportError,
  ScoringError,
  CheckpointExecutionError,
} from './errors.js';

import { Effect, Exit, Scope } from 'effect';
import {
  recordError,
  resourceUri,
  authoringId,
  type AgentRuntimeName,
  type JsonObject,
  type ArtifactEntry,
  type AutContext,
  type AutEvent,
  type EvalDefinition,
  type ReportStore,
  type RunnerEvent,
  type RunResult,
  type RunStatus,
  type ResourceKind,
  type RunWriter,
  type RunMetadata,
  type ScoreResult,
  type TrialScoring,
  type Uuid,
  type TrajectoryEvent,
} from '@evalkit/core';
import { snapshotCandidateWorkspace } from './snapshot.js';
import { createTrialWorkspace, type TrialWorkspace } from './workspace.js';
import { executeTranscript, type TranscriptProgress } from './transcript.js';
import { evaluateFinalScorers, scoreSummary } from './final-scoring.js';
import { AutExecutionError, FixtureError, ReportError } from './errors.js';
import { runBoundary } from './effect-boundary.js';

export { localReportStore } from './local-report-store.js';
export * from './local-report-reader.js';
export { runMatrix } from './matrix.js';

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
  now?: () => Date;
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
    schemaVersion: 3,
    runId,
    runUri: canonicalId('run', runId),
    evalId: definition.id,
    ...(options.suiteId ? { suiteId: options.suiteId } : {}),
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
  );
  const trialEffects = Array.from(
    { length: requestedTrials },
    (_, trialIndex) => {
      const trial = Effect.tryPromise({
        try: () =>
          runTrial(definition, {
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
  const trials = await Effect.runPromise(
    Effect.all(trialEffects, {
      concurrency: options.concurrency ?? 32,
    }),
  );
  const failed = trials.filter(
    (trial) => trial.status !== 'completed' || !trial.scoring?.passed,
  ).length;
  const status = trials.some((trial) => trial.status === 'failed')
    ? 'failed'
    : 'completed';
  const endedAt = now();
  await runWriter.finalize({
    status,
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - aggregateStartedAt.getTime(),
    trialCount: trials.length,
    passed: trials.length - failed,
    failed,
  });
  const overallScores = trials
    .map((trial) => trial.scoring?.overall)
    .filter((score): score is number => score !== undefined);
  return {
    ...trials[0]!,
    runId,
    evalId: authoringId(definition),
    status,
    trialCount: trials.length,
    passed: trials.length - failed,
    failed,
    aggregateScoring: {
      passed: trials.length - failed,
      failed,
      passRate: (trials.length - failed) / trials.length,
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
    ? definition.agent.runtimes?.[selectedRuntime]
    : undefined;
  if (selectedRuntime && !runtime) {
    throw new Error(
      `AUT does not declare the requested ${selectedRuntime} runtime`,
    );
  }

  const randomSeed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const fixtureContext = {
    runId,
    evalId: authoringId(definition),
    trialId,
    trialIndex: options.trialIndex ?? 0,
    metadata: {
      ...definition.metadata,
      randomSeed,
    },
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(selectedRuntime ? { runtime: selectedRuntime } : {}),
  } as const;
  const events: TrajectoryEvent[] = [];
  const runWriter =
    options.runWriter ??
    (await options.report.startRun(
      runMetadata(definition, options, runId, startedAt),
    ));
  const trialWriter = await runWriter.startTrial({
    schemaVersion: 3,
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
  });

  let writeChain = Promise.resolve();
  let reportingFailed = false;
  const append = async (event: TrajectoryEvent): Promise<void> => {
    events.push(event);
    writeChain = writeChain.then(() => trialWriter.appendEvent(event));
    try {
      await writeChain;
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
  const onAutEvent = (event: AutEvent) => append({ ...event, source: 'aut' });

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
    workspace = await runBoundary(
      Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            createTrialWorkspace(
              fixtureContext,
              definition.fixtures,
              options.workspaceRoot,
            ),
          catch: (cause) =>
            new FixtureError({
              cause,
              message: cause instanceof Error ? cause.message : String(cause),
            }),
        }),
        (created) =>
          Effect.tryPromise({
            try: () => created.cleanup(),
            catch: (cause) =>
              new FixtureError({
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
      ...fixtureContext,
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
                progress,
              }),
            catch: (cause) => cause,
          }),
        (opened) =>
          Effect.tryPromise({
            try: () => opened.close(),
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

  const { checkpoints, stoppedEarly, lastTurn } = progress;
  const scoreResults: ScoreResult[] = [];
  const skippedScorers: string[] = [];
  try {
    await evaluateFinalScorers(definition, {
      context,
      workspace,
      events,
      lastTurn,
      primaryError,
      stoppedEarly,
      reportingFailed,
      results: scoreResults,
      skippedScorers,
      now,
      emitRunner,
    });

    scoring = scoreSummary(scoreResults, checkpoints, skippedScorers);
    await trialWriter.writeScores(scoring);

    if (workspace) {
      try {
        artifacts = await snapshotCandidateWorkspace(
          workspace.artifacts.candidate.root,
          trialWriter,
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

  scoring ??= scoreSummary(scoreResults, checkpoints, skippedScorers);
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
  status = primaryError ? 'failed' : 'completed';

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
    await runWriter.finalize({
      status,
      endedAt,
      trialCount: 1,
      passed: status === 'completed' && scoring.passed ? 1 : 0,
      failed: status === 'failed' || !scoring.passed ? 1 : 0,
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
