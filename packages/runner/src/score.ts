import {
  toJson,
  type CriterionInput,
  type CriterionResult,
  type JudgeCriterion,
  type ScoreResult,
  type ScoreValue,
} from '@evalkit/core';
import { weightedMean } from '@evalkit/core/judge';

export type NormalizedScore = Omit<ScoreResult, 'name' | 'kind' | 'durationMs'>;

type ScoreObject = Exclude<ScoreValue, number | { skipped: true }>;

/** What a judge adds to a score beyond `ScoreValue`: its answer, when it chose one. */
export type JudgedScore = ScoreObject & { choice?: string };

const inUnitInterval = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

/**
 * Criteria must be well formed before they can stand for the score. With
 * declared criteria, each takes its declared weight unless it sets one, a
 * declared one left out is not reached, and an undeclared one is an error,
 * so the checks shown before a run are the checks recorded after it.
 */
function checkedCriteria(
  criteria: unknown,
  declared: readonly JudgeCriterion[] | undefined,
): CriterionResult[] {
  if (!Array.isArray(criteria) || (!criteria.length && !declared?.length))
    throw new Error('criteria must be a non-empty array');
  const seen = new Set<string>();
  const results = criteria.map((entry: Partial<CriterionInput>, index) => {
    if (typeof entry?.name !== 'string' || !entry.name.trim())
      throw new Error(`criteria[${index}] needs a name`);
    const { name } = entry;
    if (seen.has(name)) throw new Error(`Criterion ${name} is listed twice`);
    seen.add(name);
    const declaration = declared?.find((criterion) => criterion.name === name);
    if (declared && !declaration)
      throw new Error(
        `Criterion ${name} is not declared; declared: ${declared.map((criterion) => criterion.name).join(', ')}`,
      );
    const weight = (entry as { weight?: number }).weight ?? declaration?.weight;
    if (weight !== undefined && !(Number.isFinite(weight) && weight > 0))
      throw new Error(
        `Criterion ${name} weight must be a positive number; received ${String(weight)}`,
      );
    const explanation = (entry as { explanation?: unknown }).explanation;
    if (explanation !== undefined && typeof explanation !== 'string')
      throw new Error(`Criterion ${name} explanation must be a string`);
    const common = {
      name,
      ...(weight !== undefined ? { weight } : {}),
      ...(explanation?.trim() ? { explanation: explanation.trim() } : {}),
    };
    if ('reached' in entry) {
      if (entry.reached !== false)
        throw new Error(
          `Criterion ${name}: reached can only be false; leave it out for a check that ran`,
        );
      return { ...common, reached: false as const };
    }
    const value = (entry as { value?: unknown }).value;
    if (!inUnitInterval(value))
      throw new Error(
        `Criterion ${name} value must be a number from 0 to 1; received ${String(value)}`,
      );
    const evidence = (entry as { evidence?: unknown }).evidence;
    return {
      ...common,
      value,
      ...(evidence !== undefined
        ? { evidence: toJson(evidence, `criteria.${name}.evidence`) }
        : {}),
    };
  });
  const missing = (declared ?? [])
    .filter((criterion) => !seen.has(criterion.name))
    .map((criterion) => ({
      name: criterion.name,
      weight: criterion.weight,
      reached: false as const,
    }));
  return [...results, ...missing];
}

/**
 * Shared normalization for inline and final predicate and judge rules.
 * Without a `value`, the weighted mean of `criteria` is the value. `passAt`
 * turns the value into a verdict, and is recorded with it; an explicit
 * `passed` wins.
 */
export function normalizeScore(
  value: ScoreValue | JudgedScore | boolean,
  passAt?: number,
  declared?: readonly JudgeCriterion[],
): NormalizedScore {
  if (
    typeof value === 'object' &&
    value !== null &&
    'skipped' in value &&
    value.skipped === true
  )
    return { skipped: true, explanation: value.reason };
  const normalized: JudgedScore | undefined =
    typeof value === 'boolean'
      ? { value: Number(value) }
      : typeof value === 'number'
        ? { value }
        : (value as JudgedScore | undefined);
  if (!normalized || typeof normalized !== 'object')
    throw new Error(
      `A scorer must return a boolean, a number from 0 to 1, or a score object; received ${String(value)}`,
    );
  const criteria =
    normalized.criteria === undefined
      ? undefined
      : checkedCriteria(normalized.criteria, declared);
  const score =
    normalized.value ?? (criteria ? weightedMean(criteria) : undefined);
  if (!inUnitInterval(score))
    throw new Error(
      `Score value must be a finite number from 0 to 1; received ${String(score)}`,
    );
  if (normalized.judge?.usage) {
    const { usage } = normalized.judge;
    if (
      Object.values(usage).some(
        (tokens) => !Number.isSafeInteger(tokens) || tokens < 0,
      )
    )
      throw new Error('Judge token usage must contain nonnegative integers');
  }
  const mark = passAt ?? 1;
  return {
    value: score,
    passed: normalized.passed ?? score >= mark,
    passAt: mark,
    ...(normalized.explanation ? { explanation: normalized.explanation } : {}),
    ...(normalized.evidence !== undefined
      ? { evidence: toJson(normalized.evidence, 'evidence') }
      : {}),
    ...(normalized.choice ? { choice: normalized.choice } : {}),
    ...(criteria ? { criteria } : {}),
    ...(normalized.judge !== undefined ? { judge: normalized.judge } : {}),
  };
}
