import type { ScoreResult, ScoreValue } from '@evalkit/core';

/** Shared normalization for final predicates and in-scenario checks. */
export function normalizeScore(
  value: ScoreValue | boolean,
): Omit<ScoreResult, 'name' | 'kind' | 'durationMs'> {
  const normalized =
    typeof value === 'boolean'
      ? { value: Number(value) }
      : typeof value === 'number'
        ? { value }
        : value;
  if (
    !normalized ||
    !Number.isFinite(normalized.value) ||
    normalized.value < 0 ||
    normalized.value > 1
  )
    throw new Error(
      `Score value must be a finite number from 0 to 1; received ${normalized?.value}`,
    );
  return {
    value: normalized.value,
    passed: normalized.passed ?? normalized.value === 1,
    ...(normalized.explanation ? { explanation: normalized.explanation } : {}),
    ...(normalized.evidence === undefined
      ? {}
      : { evidence: normalized.evidence }),
  };
}
