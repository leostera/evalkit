import { Effect } from 'effect';
import {
  recordError,
  turnResultEvents,
  type AutContext,
  type AutEvent,
  type JsonObject,
  type AutSession,
  type CheckpointResult,
  type EvalDefinition,
  type RunnerEvent,
  type TrajectoryEvent,
  type TurnView,
} from '@evalkit/core';
import { evaluateCheckpoint } from './checkpoint.js';
import { runBoundary } from './effect-boundary.js';
import {
  AutExecutionError,
  CancelledError,
  ReportError,
  cancelled,
  unlessAborted,
} from './errors.js';
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
  emitAut: (event: AutEvent) => Promise<void>;
  /** Values of every dataset, for scorers. */
  data: JsonObject;
  signal: AbortSignal;
  progress: TranscriptProgress;
};

export async function executeTranscript(
  definition: EvalDefinition,
  session: AutSession,
  input: TranscriptExecution,
): Promise<void> {
  const { now, emitRunner, progress } = input;
  let turn = 0;
  for (const [index, step] of definition.transcript.entries()) {
    if (input.signal.aborted) throw cancelled();
    await emitRunner({
      kind: 'transcript-step-started',
      step: index,
      timestamp: now().toISOString(),
    });
    if (step.kind === 'user') {
      const cursor = input.events.length;
      turn++;
      const result = await sendUserTurn(
        session,
        step.message.replaceAll('{{randomSeed}}', String(input.randomSeed)),
        input.signal,
      );
      if (result !== undefined)
        for (const event of turnResultEvents(result, turn, now))
          await input.emitAut(event);
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
      if (result.status === 'failed' && definition.policy?.failfast) {
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
  signal: AbortSignal,
) {
  return runBoundary(
    Effect.tryPromise({
      try: () => unlessAborted(() => session.send(message), signal),
      catch: (cause) =>
        cause instanceof ReportError || cause instanceof CancelledError
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
): Promise<CheckpointResult & { status: 'passed' | 'failed' | 'skipped' }> {
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
        ...turnOutput(progress.lastTurn),
        data: input.data,
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

/** The scorer-facing `output`: the content of the turn's last assistant message. */
export function turnOutput(turn: TurnView | undefined) {
  const last = turn?.assistantMessages.at(-1);
  return last === undefined ? {} : { output: last.content };
}
