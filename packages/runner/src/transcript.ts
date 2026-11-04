import { attachedFields, trackAttachments } from './attachments.js';
import { checkpointLookup } from './checkpoint-lookup.js';
import { Effect } from 'effect';
import {
  recordError,
  type AutAdapter,
  type AutContext,
  type JsonObject,
  type AutSession,
  type CheckpointResult,
  type EvalDefinition,
  type RunEvent,
  type RunnerEvent,
  type ScoringContext,
  type TurnView,
  type UserStep,
} from '@evalkit/core';
import { evaluateCheckpoint } from './checkpoint.js';
import { runBoundary } from './effect-boundary.js';
import {
  AutExecutionError,
  CancelledError,
  LIMIT_GRACE_MS,
  LimitReachedError,
  ReportError,
  abortError,
  unlessAborted,
} from './errors.js';
import type { RunTranscript } from './run-transcript.js';
import { turnView } from './turn.js';
import type { RunWorkspace } from './workspace.js';

/** Progress survives a failed step so partial scoring can see completed turns and checkpoints. */
export type TranscriptProgress = {
  checkpoints: CheckpointResult[];
  lastTurn?: TurnView;
  stoppedEarly: boolean;
};

type TranscriptExecution = {
  context: AutContext;
  artifacts: RunWorkspace['artifacts'];
  /** The agent's transcript, as it is written. */
  transcript: RunTranscript;
  /** EvalKit's events so far. */
  runEvents: readonly RunEvent[];
  now: () => Date;
  randomSeed: number;
  emitRunner: (event: RunnerEvent) => Promise<void>;
  /** Values of every dataset, for scorers. */
  data: JsonObject;
  signal: AbortSignal;
  progress: TranscriptProgress;
  attach: ScoringContext['attach'];
  /** The agent for judges that name none. */
  defaultJudge?: AutAdapter;
};

export async function executeTranscript(
  definition: EvalDefinition,
  session: AutSession,
  input: TranscriptExecution,
): Promise<void> {
  const { now, emitRunner, progress } = input;
  let turn = 0;
  for (const [index, step] of definition.transcript.entries()) {
    if (input.signal.aborted) throw abortError(input.signal);
    const message =
      step.kind === 'user' ? userMessage(step, index, input) : undefined;
    await emitRunner({
      kind: 'transcript-step-started',
      step: index,
      ...(message === undefined ? {} : { message }),
      timestamp: now().toISOString(),
    });
    if (message !== undefined) {
      const cursor = input.transcript.length;
      turn++;
      input.transcript.scriptUser(message);
      const result = await sendUserTurn(session, message, input.signal);
      if (result !== undefined) input.transcript.writeTurnResult(result, turn);
      input.transcript.endTurn();
      progress.lastTurn = turnView(input.transcript.since(cursor), index);
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

/** A computed message sees the parameters and candidate data the agent also sees. */
function userMessage(
  step: UserStep,
  index: number,
  { context, randomSeed }: TranscriptExecution,
): string {
  if (typeof step.message === 'string') return step.message;
  const message = step.message({
    parameters: context.parameters ?? {},
    data: context.data,
    seed: randomSeed,
    ...(context.batch ? { batch: context.batch } : {}),
  });
  if (typeof message !== 'string' || !message.trim())
    throw new Error(
      `The user message at step ${index + 1} must compute a non-empty string`,
    );
  return message;
}

async function sendUserTurn(
  session: AutSession,
  message: string,
  signal: AbortSignal,
) {
  return runBoundary(
    Effect.tryPromise({
      try: () =>
        unlessAborted(() => session.send(message), signal, LIMIT_GRACE_MS),
      catch: (cause) =>
        cause instanceof ReportError ||
        cause instanceof CancelledError ||
        cause instanceof LimitReachedError
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
  const tracked = trackAttachments(input.attach);
  return runBoundary(
    evaluateCheckpoint(
      step,
      index,
      {
        context: input.context,
        artifacts: input.artifacts,
        transcript: input.transcript.transcript,
        subagents: input.transcript.subagents,
        runEvents: [...input.runEvents],
        turn: progress.lastTurn,
        ...turnOutput(progress.lastTurn),
        data: input.data,
        checkpoints: [...progress.checkpoints],
        checkpoint: checkpointLookup(definition.transcript, [
          ...progress.checkpoints,
        ]),
        attach: tracked.attach,
      },
      now,
      input.defaultJudge,
    ),
  )
    .then((result) => ({ ...result, ...attachedFields(tracked.attached) }))
    .catch(async (error: unknown) => {
      const recorded = recordError(error);
      progress.checkpoints.push({
        step: index,
        kind: step.kind,
        name: step.name,
        status: 'error',
        durationMs: now().getTime() - started.getTime(),
        error: recorded,
        ...attachedFields(tracked.attached),
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

/** The scorer-facing `output`: the text of the turn's last assistant message. */
export function turnOutput(turn: TurnView | undefined) {
  return turn?.lastAssistantText === undefined
    ? {}
    : { output: turn.lastAssistantText };
}
