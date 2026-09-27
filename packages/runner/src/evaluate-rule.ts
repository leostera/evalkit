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
  judgeAgent: AutAdapter | undefined,
  placement: 'transcript' | 'scoring',
): Effect.Effect<
  Omit<ScoreResult, 'name' | 'kind' | 'durationMs'>,
  RuleExecutionError
> {
  return Effect.gen(function* () {
    if (rule.kind === 'judge' && !judgeAgent)
      return yield* Effect.fail(
        failure(
          rule.name,
          new Error('Judge rules require an eval judge agent'),
        ),
      );
    const evaluated =
      rule.kind === 'predicate'
        ? {
            value: yield* Effect.tryPromise({
              try: async () => rule.run(input),
              catch: (cause) => failure(rule.name, cause),
            }),
          }
        : yield* runJudgeAgent(rule, judgeAgent!, input, placement);
    const score = yield* Effect.try({
      try: () => normalizeScore(evaluated.value),
      catch: (cause) => failure(rule.name, cause),
    });
    const withJudge =
      rule.kind === 'judge' && 'judge' in evaluated
        ? { ...score, judge: evaluated.judge }
        : score;
    const validated = yield* Schema.decodeUnknown(ScoreResultSchema)({
      name: rule.name,
      kind: rule.kind,
      durationMs: 0,
      ...withJudge,
    }).pipe(Effect.mapError((cause) => failure(rule.name, cause)));
    return {
      value: validated.value!,
      passed: validated.passed!,
      ...(validated.explanation === undefined
        ? {}
        : { explanation: validated.explanation }),
      ...(validated.evidence === undefined
        ? {}
        : { evidence: validated.evidence }),
      ...(validated.judge === undefined ? {} : { judge: validated.judge }),
    };
  });
}
