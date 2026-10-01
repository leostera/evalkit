import { Effect } from 'effect';
import {
  recordError,
  type AutContext,
  type CheckpointResult,
  type EvalDefinition,
  type RunnerEvent,
  type ScoreResult,
  type TrajectoryEvent,
  type TrialScoring,
  type TurnView,
} from '@evalkit/core';
import { runBoundary } from './effect-boundary.js';
import { ScoringError } from './errors.js';
import { evaluateRule } from './evaluate-rule.js';
import type { TrialWorkspace } from './workspace.js';

export function scoreSummary(
  results: ScoreResult[],
  checkpoints: CheckpointResult[],
  skippedScorers: string[],
): TrialScoring {
  const valid = results.filter((result) => result.value !== undefined);
  const hasError = results.some((result) => result.error !== undefined);
  return {
    results,
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
      results.every((result) => result.passed === true) &&
      checkpoints.every((result) => result.status === 'passed') &&
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
  reportingFailed: boolean;
  results: ScoreResult[];
  skippedScorers: string[];
  now: () => Date;
  emitRunner: (event: RunnerEvent) => Promise<void>;
};

/** Append completed scores to the supplied arrays, even when a later scorer or report write fails. */
export async function evaluateFinalScorers(
  definition: EvalDefinition,
  input: FinalScoringInput,
): Promise<void> {
  const {
    context,
    workspace,
    events,
    lastTurn,
    results,
    skippedScorers,
    now,
    emitRunner,
  } = input;
  for (const scorer of definition.scoring) {
    if (
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
          {
            context,
            artifacts: workspace.artifacts,
            trajectory: { events },
            ...(lastTurn ? { turn: lastTurn } : {}),
          },
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
      value: result.value ?? 0,
      timestamp: now().toISOString(),
    });
  }
}
