import { Effect } from 'effect';
import {
  recordError,
  type AutContext,
  type CheckpointResult,
  type EvalDefinition,
  type JsonObject,
  type MetricResult,
  type RunnerEvent,
  type ScoringContext,
  type ScoreResult,
  type TrajectoryEvent,
  type TrialScoring,
  type TurnView,
} from '@evalkit/core';
import { runBoundary } from './effect-boundary.js';
import { ScoringError } from './errors.js';
import { evaluateRule } from './evaluate-rule.js';
import type { TrialWorkspace } from './workspace.js';
import { turnOutput } from './transcript.js';

export function scoreSummary(
  results: ScoreResult[],
  checkpoints: CheckpointResult[],
  skippedScorers: string[],
  metrics: MetricResult[] = [],
): TrialScoring {
  const valid = results.filter(
    (result) => result.value !== undefined && !result.skipped,
  );
  const hasError = results.some((result) => result.error !== undefined);
  return {
    results,
    ...(metrics.length ? { metrics } : {}),
    ...(checkpoints.length ? { checkpoints } : {}),
    ...(skippedScorers.length ? { skippedScorers } : {}),
    ...(valid.length === 0
      ? {}
      : {
          overall:
            valid.reduce((sum, result) => sum + (result.value ?? 0), 0) /
            valid.length,
        }),
    passed:
      !hasError &&
      results.every((result) => result.skipped || result.passed === true) &&
      checkpoints.every(
        (result) => result.status === 'passed' || result.status === 'skipped',
      ) &&
      !skippedScorers.length,
  };
}

type FinalScoringInput = {
  context?: AutContext;
  workspace?: TrialWorkspace;
  events: TrajectoryEvent[];
  lastTurn?: TurnView;
  primaryError?: unknown;
  stoppedEarly: boolean;
  /** No scorer runs for a cancelled trial. */
  cancelled: boolean;
  reportingFailed: boolean;
  results: ScoreResult[];
  skippedScorers: string[];
  data: JsonObject;
  checkpoints: readonly CheckpointResult[];
  now: () => Date;
  emitRunner: (event: RunnerEvent) => Promise<void>;
};

/** What final scorers and metrics receive. */
export function scoringContext(input: {
  context: AutContext;
  workspace: TrialWorkspace;
  events: TrajectoryEvent[];
  lastTurn?: TurnView;
  data: JsonObject;
  checkpoints: readonly CheckpointResult[];
}): ScoringContext {
  return {
    context: input.context,
    artifacts: input.workspace.artifacts,
    trajectory: { events: input.events },
    ...(input.lastTurn ? { turn: input.lastTurn } : {}),
    ...turnOutput(input.lastTurn),
    data: input.data,
    checkpoints: input.checkpoints,
  };
}

/** Append completed scores to the supplied arrays, even when a later scorer or report write fails. */
export async function evaluateFinalScorers(
  definition: EvalDefinition,
  input: FinalScoringInput,
): Promise<void> {
  const {
    context,
    workspace,
    results,
    skippedScorers,
    now,
    emitRunner,
  } = input;
  for (const scorer of definition.scoring) {
    if (
      input.cancelled ||
      input.reportingFailed ||
      !context ||
      !workspace ||
      ((input.primaryError || input.stoppedEarly) &&
        (!('supportsPartial' in scorer) || !scorer.supportsPartial))
    ) {
      skippedScorers.push(scorer.name);
      continue;
    }
    const started = now();
    await emitRunner({
      kind: 'scorer-started',
      scorer: scorer.name,
      timestamp: started.toISOString(),
    });
    let result: ScoreResult;
    try {
      const score = await runBoundary(
        evaluateRule(
          scorer,
          scoringContext({ ...input, context, workspace }),
          definition.judge,
          'scoring',
        ).pipe(
          Effect.mapError(
            (cause) => new ScoringError({ cause, message: cause.message }),
          ),
        ),
      );
      result = {
        name: scorer.name,
        kind: scorer.kind,
        durationMs: now().getTime() - started.getTime(),
        ...score,
      };
      results.push(result);
    } catch (error) {
      const recorded = recordError(error);
      results.push({
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
      continue;
    }
    await emitRunner({
      kind: 'scorer-completed',
      scorer: scorer.name,
      ...(result.skipped
        ? { skipped: true as const }
        : { value: result.value ?? 0 }),
      timestamp: now().toISOString(),
    });
  }
}
