import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import {
  JsonValueSchema,
  TrajectoryEventSchema,
  type AutAdapter,
  type AutContext,
  type AutEvent,
  type JudgeRule,
  type JudgeRunInfo,
  type JsonValue,
  type ScoreValue,
  type ScoringContext,
} from '@evalkit/core';
import { RuleExecutionError } from './errors.js';

const failure = (name: string, cause: unknown) =>
  new RuleExecutionError({
    name,
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
  });

/** Drive a distinct agent session for one assessment; do not add its events to AUT trajectory. */
export function runJudgeAgent(
  rule: JudgeRule,
  agent: AutAdapter,
  input: ScoringContext,
  placement: 'transcript' | 'scoring',
): Effect.Effect<
  { value: ScoreValue | boolean; judge: JudgeRunInfo },
  RuleExecutionError
> {
  const events: AutEvent[] = [];
  const context: AutContext = {
    ...input.context,
    // Judge tools operate in evaluator space, not the candidate's mutable workspace.
    workspace: input.artifacts.evaluator,
    evaluatorWorkspace: input.artifacts.evaluator,
  };
  const prompt = JSON.stringify({
    name: rule.name,
    rubric: rule.rubric,
    placement,
    evidence:
      placement === 'transcript'
        ? { turn: input.turn?.events ?? [] }
        : { trajectory: input.trajectory.events },
    instruction:
      'Return only a JSON verdict with value (a number from 0 to 1), optional passed, explanation, and evidence.',
  });
  let closeError: RuleExecutionError | undefined;
  return Effect.gen(function* () {
    yield* Effect.acquireUseRelease(
      Effect.tryPromise({
        try: () =>
          agent.start({
            context,
            onEvent: (event) => {
              // Validate normalized judge observations before persisting them separately.
              const observed = Schema.decodeUnknownSync(TrajectoryEventSchema)({
                ...event,
                source: 'aut',
              });
              if (observed.source !== 'aut')
                throw new Error('Invalid judge event source');
              const { source: _, ...validated } = observed;
              events.push(validated);
            },
          }),
        catch: (cause) => failure(rule.name, cause),
      }),
      (session) =>
        Effect.tryPromise({
          try: () => session.send(prompt),
          catch: (cause) => failure(rule.name, cause),
        }),
      (session) =>
        Effect.tryPromise({
          try: () => session.close(),
          catch: (cause) => failure(rule.name, cause),
        }).pipe(
          Effect.catchAll((error) =>
            Effect.sync(() => {
              closeError = error;
            }),
          ),
        ),
    );
    if (closeError) return yield* Effect.fail(closeError);
    const completed = events
      .slice()
      .reverse()
      .find(
        (event) => event.kind === 'completed' && event.output !== undefined,
      );
    const assistant = events
      .slice()
      .reverse()
      .find((event) => event.kind === 'message' && event.role === 'assistant');
    const output =
      completed?.kind === 'completed'
        ? completed.output
        : assistant?.kind === 'message'
          ? assistant.content
          : undefined;
    if (output === undefined)
      return yield* Effect.fail(
        failure(rule.name, new Error('Judge agent did not emit a verdict')),
      );
    const value = yield* Effect.try({
      try: () =>
        typeof output === 'string' ? (JSON.parse(output) as unknown) : output,
      catch: (cause) => failure(rule.name, cause),
    });
    const encodedEvents = yield* Schema.decodeUnknown(JsonValueSchema)(
      events,
    ).pipe(Effect.mapError((cause) => failure(rule.name, cause)));
    if (!Array.isArray(encodedEvents))
      return yield* Effect.fail(
        failure(rule.name, new Error('Judge events must be an array')),
      );
    const usage = events
      .slice()
      .reverse()
      .find((event) => event.kind === 'turn-completed' && event.usage);
    return {
      value: value as ScoreValue | boolean, // normalized and Schema-validated by the shared rule evaluator
      judge: {
        ...(agent.identity ? { agent: agent.identity } : {}),
        ...(usage?.kind === 'turn-completed' && usage.usage
          ? { usage: usage.usage }
          : {}),
        events: encodedEvents as JsonValue[],
      },
    };
  });
}
