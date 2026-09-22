import {
  recordError,
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
  type ScoreResult,
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
  /** Selects a declared AUT runtime such as local, sandbox, or remote. */
  runtime?: AgentRuntimeName;
  now?: () => Date;
};

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
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

/** Executes one trial, streams its trajectory to the report store, and returns a compact result. */
export async function runEval(
  definition: EvalDefinition,
  options: RunEvalOptions,
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

  const fixtureContext = {
    runId,
    evalId: definition.id,
    trialId,
    trialIndex: 0,
    metadata: definition.metadata ?? {},
    ...(selectedRuntime ? { runtime: selectedRuntime } : {}),
  } as const;
  const events: TrajectoryEvent[] = [];
  const runWriter = await options.report.startRun({
    schemaVersion: 1,
    runId,
    evalId: definition.id,
    startedAt,
  });
  const trialWriter = await runWriter.startTrial({
    schemaVersion: 1,
    runId,
    trialId,
    trialIndex: 0,
    evalId: definition.id,
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
      await session.send(step.message);
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
    scoring,
    ...(artifacts ? { artifacts } : {}),
    ...(error ? { error } : {}),
  });
  await runWriter.finalize({
    status,
    endedAt,
    trialCount: 1,
    passed: status === 'completed' && scoring.passed ? 1 : 0,
    failed: status === 'failed' || !scoring.passed ? 1 : 0,
    ...(error ? { error } : {}),
  });

  return {
    runId,
    trialId,
    status,
    reportLocation: runWriter.location,
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
