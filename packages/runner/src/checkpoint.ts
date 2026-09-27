import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import {
  CheckpointResultSchema,
  type ArtifactView,
  type AutContext,
  type ScoringRule,
  type AutAdapter,
  type ExpectToolCallStep,
  type TrajectoryEvent,
  type TurnView,
  type CheckpointResult,
} from '@evalkit/core';
import { CheckpointExecutionError } from './errors.js';
import { normalizeScore } from './score.js';
import { evaluateRule } from './evaluate-rule.js';
import { matchingToolCall } from './turn.js';

const failure = (step: number, name: string, cause: unknown) =>
  new CheckpointExecutionError({
    step,
    name,
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
  });

/** An assertion failure is a successful Effect containing a failed result; only execution errors enter the error channel. */
export function evaluateCheckpoint(
  step: ScoringRule | ExpectToolCallStep,
  index: number,
  input: {
    context: AutContext;
    artifacts: ArtifactView;
    trajectory: { events: readonly TrajectoryEvent[] };
    turn: TurnView;
  },
  now: () => Date,
  judgeAgent?: AutAdapter,
): Effect.Effect<
  CheckpointResult & { status: 'passed' | 'failed' },
  CheckpointExecutionError
> {
  const annotations = {
    evalId: input.context.evalId,
    runId: input.context.runId,
    trialId: input.context.trialId,
    step: index,
    checkpoint: step.name,
  };
  return Effect.gen(function* () {
    const started = now();
    yield* Effect.logDebug('checkpoint started');
    const match =
      step.kind === 'expect-tool-call'
        ? yield* Effect.try({
            try: () =>
              matchingToolCall(
                input.turn,
                step.expected.name,
                step.expected.arguments,
              ),
            catch: (cause) => failure(index, step.name, cause),
          })
        : undefined;
    const score =
      step.kind === 'expect-tool-call'
        ? yield* Effect.try({
            try: () => normalizeScore(Boolean(match)),
            catch: (cause) => failure(index, step.name, cause),
          })
        : yield* evaluateRule(step, input, judgeAgent, 'transcript').pipe(
            Effect.mapError((cause) => failure(index, step.name, cause)),
          );
    const result = yield* Schema.decodeUnknown(CheckpointResultSchema)({
      step: index,
      kind: step.kind,
      name: step.name,
      status: score.passed ? 'passed' : 'failed',
      durationMs: now().getTime() - started.getTime(),
      ...score,
      ...(match
        ? { matchedToolCall: { eventIndex: match.eventIndex, id: match.id } }
        : {}),
    }).pipe(Effect.mapError((cause) => failure(index, step.name, cause)));
    yield* Effect.logInfo('checkpoint completed').pipe(
      Effect.annotateLogs({ status: result.status }),
    );
    return {
      ...result,
      status: score.passed ? ('passed' as const) : ('failed' as const),
    };
  }).pipe(
    Effect.tapError((error) =>
      Effect.logError('checkpoint execution error').pipe(
        Effect.annotateLogs({ errorName: error._tag }),
      ),
    ),
    Effect.annotateLogs(annotations),
  );
}
