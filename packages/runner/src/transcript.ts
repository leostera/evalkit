import { Effect } from 'effect';
import {
  recordError,
  type AutContext,
  type AutSession,
  type CheckpointResult,
  type EvalDefinition,
  type RunnerEvent,
  type TrajectoryEvent,
  type TurnView,
} from '@evalkit/core';
import { evaluateCheckpoint } from './checkpoint.js';
import { runBoundary } from './effect-boundary.js';
import { AutExecutionError, ReportError } from './errors.js';
import { turnView } from './turn.js';
import type { TrialWorkspace } from './workspace.js';

/** Progress survives a failed step so partial scoring can see completed turns and checkpoints. */
export type TranscriptProgress = {
  checkpoints: CheckpointResult[];
  lastTurn?: TurnView;
  stoppedEarly: boolean;
};

type TranscriptExecution = {
  context: AutContext;
  artifacts: TrialWorkspace['artifacts'];
  events: TrajectoryEvent[];
  now: () => Date;
  randomSeed: number;
  emitRunner: (event: RunnerEvent) => Promise<void>;
  progress: TranscriptProgress;
};

export async function executeTranscript(
  definition: EvalDefinition,
  session: AutSession,
  input: TranscriptExecution,
): Promise<void> {
  const { now, emitRunner, progress } = input;
  for (const [index, step] of definition.transcript.entries()) {
    await emitRunner({
      kind: 'transcript-step-started',
      step: index,
      timestamp: now().toISOString(),
    });
    if (step.kind === 'user') {
      const cursor = input.events.length;
      await sendUserTurn(
        session,
        step.message.replaceAll('{{randomSeed}}', String(input.randomSeed)),
      );
      progress.lastTurn = turnView(
        input.events,
        cursor,
        input.events.length,
        index,
      );
    } else if (
      step.kind === 'predicate' ||
      step.kind === 'judge' ||
      step.kind === 'expect-tool-call'
    ) {
      const result = await runCheckpoint(definition, step, index, input);
      progress.checkpoints.push(result);
      await emitRunner({
        kind: 'checkpoint-completed',
        step: index,
        status: result.status,
        timestamp: now().toISOString(),
      });
      await emitRunner({
        kind: 'transcript-step-completed',
        step: index,
        timestamp: now().toISOString(),
      });
      if (!result.passed && definition.policy?.failfast) {
        progress.stoppedEarly = true;
        await skipRemainingSteps(definition, index, input);
        break;
      }
      continue;
    } else {
      throw new Error(
        `Transcript step kind "${step.kind}" is not executable yet`,
      );
    }
    await emitRunner({
      kind: 'transcript-step-completed',
      step: index,
      timestamp: now().toISOString(),
    });
  }
}

async function sendUserTurn(
  session: AutSession,
  message: string,
): Promise<void> {
  await runBoundary(
    Effect.tryPromise({
      try: () => session.send(message),
      catch: (cause) =>
        cause instanceof ReportError
          ? cause
          : new AutExecutionError({
              cause,
              message: cause instanceof Error ? cause.message : String(cause),
            }),
    }),
  );
}

type CheckpointStep = Extract<
  EvalDefinition['transcript'][number],
  { kind: 'predicate' | 'judge' | 'expect-tool-call' }
>;

async function runCheckpoint(
  definition: EvalDefinition,
  step: CheckpointStep,
  index: number,
  input: TranscriptExecution,
): Promise<CheckpointResult & { status: 'passed' | 'failed' }> {
  const { now, emitRunner, progress } = input;
  if (!progress.lastTurn)
    throw new Error('Checkpoint requires a preceding user step');
  const started = now();
  await emitRunner({
    kind: 'checkpoint-started',
    step: index,
    name: step.name,
    timestamp: started.toISOString(),
  });
  return runBoundary(
    evaluateCheckpoint(
      step,
      index,
      {
        context: input.context,
        artifacts: input.artifacts,
        trajectory: { events: input.events },
        turn: progress.lastTurn,
      },
      now,
      definition.judge,
    ),
  ).catch(async (error: unknown) => {
    const recorded = recordError(error);
    progress.checkpoints.push({
      step: index,
      kind: step.kind,
      name: step.name,
      status: 'error',
      durationMs: now().getTime() - started.getTime(),
      error: recorded,
    });
    try {
      await emitRunner({
        kind: 'checkpoint-error',
        step: index,
        error: recorded,
        timestamp: now().toISOString(),
      });
    } catch {
      // Preserve the checkpoint error if the writer also fails.
    }
    throw error;
  });
}

async function skipRemainingSteps(
  definition: EvalDefinition,
  after: number,
  { now, emitRunner, progress }: TranscriptExecution,
): Promise<void> {
  for (let index = after + 1; index < definition.transcript.length; index++) {
    await emitRunner({
      kind: 'transcript-step-skipped',
      step: index,
      timestamp: now().toISOString(),
    });
    const step = definition.transcript[index]!;
    if (
      step.kind === 'predicate' ||
      step.kind === 'judge' ||
      step.kind === 'expect-tool-call'
    )
      progress.checkpoints.push({
        step: index,
        kind: step.kind,
        name: step.name,
        status: 'skipped',
      });
  }
}
