import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import {
  ScoreResultSchema,
  type AutAdapter,
  type ScoreResult,
  type ScoringContext,
  type ScoringRule,
} from '@evalkit/core';
import { RuleExecutionError } from './errors.js';
import { normalizeScore } from './score.js';
import { runJudgeAgent } from './judge-agent.js';

const failure = (name: string, cause: unknown) =>
  new RuleExecutionError({
    name,
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
  });

/** Both placements call the same rule executor; only input timing and persistence differ. */
export function evaluateRule(
  rule: ScoringRule,
  input: ScoringContext,
  defaultJudge: AutAdapter | undefined,
  placement: 'transcript' | 'scoring',
): Effect.Effect<
  Omit<ScoreResult, 'name' | 'kind' | 'durationMs'>,
  RuleExecutionError
> {
  return Effect.gen(function* () {
    const judgeAgent =
      rule.kind === 'judge' ? (rule.agent ?? defaultJudge) : undefined;
    if (rule.kind === 'judge' && !judgeAgent)
      return yield* Effect.fail(
        failure(
          rule.name,
          new Error(
            'This judge has no agent: pass judge(name, { agent }) or set judge in evalkit.config.ts',
          ),
        ),
      );
    const evaluated =
      rule.kind === 'predicate'
        ? yield* Effect.tryPromise({
            try: async () => rule.run(input),
            catch: (cause) => failure(rule.name, cause),
          })
        : (yield* runJudgeAgent(rule, judgeAgent!, input, placement)).value;
    const score = yield* Effect.try({
      try: () =>
        normalizeScore(
          evaluated,
          rule.passAt,
          rule.kind === 'predicate' ? rule.criteria : undefined,
        ),
      catch: (cause) => failure(rule.name, cause),
    });
    const validated = yield* Schema.decodeUnknown(ScoreResultSchema)({
      name: rule.name,
      kind: rule.kind,
      durationMs: 0,
      ...score,
    }).pipe(Effect.mapError((cause) => failure(rule.name, cause)));
    if (validated.skipped)
      return {
        skipped: true as const,
        ...(validated.explanation === undefined
          ? {}
          : { explanation: validated.explanation }),
      };
    const {
      name: _name,
      kind: _kind,
      durationMs: _duration,
      ...result
    } = validated;
    return result;
  });
}
