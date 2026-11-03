import {
  toJson,
  type CriterionResult,
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

/** Criteria must be well formed before they can stand for the score. */
function checkedCriteria(criteria: unknown): CriterionResult[] {
  if (!Array.isArray(criteria) || !criteria.length)
    throw new Error('criteria must be a non-empty array');
  return criteria.map((entry: Partial<CriterionResult>, index) => {
    if (typeof entry?.name !== 'string' || !entry.name.trim())
      throw new Error(`criteria[${index}] needs a name`);
    if (!inUnitInterval(entry.value))
      throw new Error(
        `Criterion ${entry.name} value must be a number from 0 to 1; received ${String(entry.value)}`,
      );
    if (
      entry.weight !== undefined &&
      !(Number.isFinite(entry.weight) && entry.weight > 0)
    )
      throw new Error(
        `Criterion ${entry.name} weight must be a positive number; received ${String(entry.weight)}`,
      );
    return {
      name: entry.name,
      value: entry.value,
      ...(entry.weight !== undefined ? { weight: entry.weight } : {}),
      ...(entry.note ? { note: entry.note } : {}),
    };
  });
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
      : checkedCriteria(normalized.criteria);
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
