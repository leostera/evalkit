export {
  AutExecutionError,
  FixtureError,
  ReportError,
  ScoringError,
} from './errors.js';

import { Effect } from 'effect';
import {
  recordError,
  resourceUri,
  type AgentRuntimeName,
  type ArtifactEntry,
  type AutContext,
  type AutEvent,
  type AutSession,
  type EvalDefinition,
  type PredicateScorer,
  type ReportStore,
  type RunnerEvent,
  type RunResult,
  type RunStatus,
  type ResourceKind,
  type RunWriter,
  type ScoreResult,
  type Uuid,
  type ScoreValue,
  type TrialScoring,
  type TrajectoryEvent,
} from '@evalkit/core';
import { snapshotCandidateWorkspace } from './snapshot';
import { createTrialWorkspace, type TrialWorkspace } from './workspace';

export { localReportStore } from './local-report-store';

export type RunEvalOptions = {
  report: ReportStore;
  runId?: string;
  trialId?: string;
  suiteId?: string;
  /** Overrides the eval policy's requested number of independent trials. */
  trials?: number;
  /** Selects a declared AUT runtime such as local, sandbox, or remote. */
  runtime?: AgentRuntimeName;
  /** Maximum number of trials from this aggregate run executing concurrently. */
  concurrency?: number;
  /** Optional shared limiter for coordinating trials across aggregate runs. */
  semaphore?: Effect.Semaphore;
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
        evalId: definition.uri,
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
        evalId: definition.uri,
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
  const prefix = `evalkit:${kind}:`;
  return (
    id.startsWith(prefix) ? id : resourceUri(kind, id as Uuid)
  ) as `evalkit:${K}:${string}`;
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

function normalizeScore(
  value: ScoreValue,
): Omit<ScoreResult, 'name' | 'kind' | 'durationMs'> {
  const normalized = typeof value === 'number' ? { value } : value;
  if (
    !Number.isFinite(normalized.value) ||
    normalized.value < 0 ||
    normalized.value > 1
  ) {
    throw new Error(
      `Score value must be a finite number from 0 to 1; received ${normalized.value}`,
    );
  }

  return {
    value: normalized.value,
    passed: normalized.passed ?? normalized.value === 1,
    ...(normalized.explanation ? { explanation: normalized.explanation } : {}),
    ...(normalized.evidence === undefined
      ? {}
      : { evidence: normalized.evidence }),
  };
}

function scoreSummary(results: ScoreResult[]): TrialScoring {
  const valid = results.filter((result) => result.value !== undefined);
  const hasError = results.some((result) => result.error !== undefined);
  return {
    results,
    ...(valid.length === 0
      ? {}
      : {
          overall:
            valid.reduce((sum, result) => sum + (result.value ?? 0), 0) /
            valid.length,
        }),
    passed: !hasError && results.every((result) => result.passed === true),
  };
}

async function closeSession(
  session: AutSession | undefined,
): Promise<unknown | undefined> {
  if (!session) return undefined;
  try {
    await session.close();
    return undefined;
  } catch (error) {
    return error;
  }
}

/** Executes one aggregate eval run and its requested isolated trials. */
async function executeRun(
  definition: EvalDefinition,
  options: RunEvalOptions,
): Promise<RunResult> {
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
  const runWriter = await options.report.startRun({
    schemaVersion: 1,
    runId,
    runUri: canonicalId('run', runId),
    evalId: definition.uri,
    evalUri: definition.uri,
    ...(options.suiteId
      ? {
          suiteId: options.suiteId,
          suiteUri: canonicalId('suite', options.suiteId),
        }
      : {}),
    ...(definition.agent.identity ? { aut: definition.agent.identity } : {}),
    startedAt: aggregateStartedAt.toISOString(),
  });
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
    evalId: definition.uri,
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
    evalId: definition.uri,
    trialId,
    trialIndex: options.trialIndex ?? 0,
    metadata: {
      ...(definition.metadata ?? {}),
      randomSeed,
    },
    ...(selectedRuntime ? { runtime: selectedRuntime } : {}),
  } as const;
  const events: TrajectoryEvent[] = [];
  const runWriter =
    options.runWriter ??
    (await options.report.startRun({
      schemaVersion: 1,
      runId,
      runUri: canonicalId('run', runId),
      evalId: definition.uri,
      evalUri: definition.uri,
      ...(options.suiteId
        ? {
            suiteId: options.suiteId,
            suiteUri: canonicalId('suite', options.suiteId),
          }
        : {}),
      ...(definition.agent.identity ? { aut: definition.agent.identity } : {}),
      startedAt,
    }));
  const trialWriter = await runWriter.startTrial({
    schemaVersion: 1,
    runId,
    runUri: canonicalId('run', runId),
    trialId,
    trialUri: canonicalId('trial', trialId),
    trialIndex: options.trialIndex ?? 0,
    evalId: definition.uri,
    evalUri: definition.uri,
    ...(definition.agent.identity ? { aut: definition.agent.identity } : {}),
    startedAt,
  });

  let writeChain = Promise.resolve();
  const append = async (event: TrajectoryEvent): Promise<void> => {
    events.push(event);
    writeChain = writeChain.then(() => trialWriter.appendEvent(event));
    await writeChain;
  };
  const emitRunner = (event: RunnerEvent) =>
    append({ ...event, source: 'runner' });
  const onAutEvent = (event: AutEvent) => append({ ...event, source: 'aut' });

  let session: AutSession | undefined;
  let workspace: TrialWorkspace | undefined;
  let context: AutContext | undefined;
  let primaryError: unknown;
  let scoring: TrialScoring | undefined;
  let artifacts: ArtifactEntry[] | undefined;
  let status: RunStatus = 'running';

  try {
    await emitRunner({ kind: 'trial-started', timestamp: now().toISOString() });
    workspace = await createTrialWorkspace(fixtureContext, definition.fixtures);
    context = { ...fixtureContext, workspace: workspace.artifacts.candidate };
    session = await definition.agent.start({
      context,
      ...(runtime ? { runtime } : {}),
      onEvent: onAutEvent,
    });

    for (const [step, index] of definition.transcript.map(
      (step, index) => [step, index] as const,
    )) {
      await emitRunner({
        kind: 'transcript-step-started',
        step: index,
        timestamp: now().toISOString(),
      });
      if (step.kind !== 'user') {
        throw new Error(
          `Transcript step kind "${step.kind}" is not executable yet`,
        );
      }
      await session.send(
        step.message.replaceAll('{{randomSeed}}', String(randomSeed)),
      );
      await emitRunner({
        kind: 'transcript-step-completed',
        step: index,
        timestamp: now().toISOString(),
      });
    }
  } catch (error) {
    primaryError = error;
    await emitRunner({
      kind: 'error',
      error: recordError(error),
      timestamp: now().toISOString(),
    });
  }

  const closeError = await closeSession(session);
  if (!primaryError && closeError) {
    primaryError = closeError;
    await emitRunner({
      kind: 'error',
      error: recordError(closeError),
      timestamp: now().toISOString(),
    });
  }

  const scoreResults: ScoreResult[] = [];
  for (const scorer of definition.scoring) {
    if (
      !context ||
      !workspace ||
      (primaryError &&
        (!('supportsPartial' in scorer) || !scorer.supportsPartial))
    )
      continue;
    const started = now();
    await emitRunner({
      kind: 'scorer-started',
      scorer: scorer.name,
      timestamp: started.toISOString(),
    });
    try {
      if (scorer.kind !== 'predicate') {
        throw new Error(`Judge scorer "${scorer.name}" is not executable yet`);
      }
      const score = await runPredicate(
        scorer,
        context,
        workspace.artifacts,
        events,
      );
      const result: ScoreResult = {
        name: scorer.name,
        kind: scorer.kind,
        durationMs: now().getTime() - started.getTime(),
        ...score,
      };
      scoreResults.push(result);
      await emitRunner({
        kind: 'scorer-completed',
        scorer: scorer.name,
        value: result.value ?? 0,
        timestamp: now().toISOString(),
      });
    } catch (error) {
      const recorded = recordError(error);
      scoreResults.push({
        name: scorer.name,
        kind: scorer.kind,
        durationMs: now().getTime() - started.getTime(),
        error: recorded,
        passed: false,
      });
      await emitRunner({
        kind: 'scorer-failed',
        scorer: scorer.name,
        error: recorded,
        timestamp: now().toISOString(),
      });
    }
  }

  scoring = scoreSummary(scoreResults);
  await trialWriter.writeScores(scoring);

  if (workspace) {
    try {
      artifacts = await snapshotCandidateWorkspace(
        workspace.artifacts.candidate.root,
        trialWriter,
      );
    } catch (captureError) {
      if (!primaryError) primaryError = captureError;
      await emitRunner({
        kind: 'error',
        error: recordError(captureError),
        timestamp: now().toISOString(),
      });
    }
  }

  if (workspace) {
    try {
      await workspace.cleanup();
    } catch (cleanupError) {
      if (!primaryError) primaryError = cleanupError;
      await emitRunner({
        kind: 'error',
        error: recordError(cleanupError),
        timestamp: now().toISOString(),
      });
    }
  }

  status = primaryError ? 'failed' : 'completed';
  if (!primaryError)
    await emitRunner({
      kind: 'trial-completed',
      timestamp: now().toISOString(),
    });

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
    evalId: definition.uri,
    evalUri: definition.uri,
    status,
    reportLocation: runWriter.location,
    durationMs: new Date(endedAt).getTime() - new Date(startedAt).getTime(),
    scoring,
    ...(error ? { error } : {}),
  };
}

async function runPredicate(
  scorer: PredicateScorer,
  context: AutContext,
  artifacts: Parameters<PredicateScorer['run']>[0]['artifacts'],
  events: readonly TrajectoryEvent[],
): Promise<Omit<ScoreResult, 'name' | 'kind' | 'durationMs'>> {
  const value = await scorer.run({
    context,
    trajectory: { events },
    artifacts,
  });
  return normalizeScore(value);
}
