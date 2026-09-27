import type { ScoreResult, ScoreValue } from '@evalkit/core';

/** Shared normalization for inline and final predicate and judge rules. */
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
  if ('judge' in normalized && normalized.judge) {
    const { usage } = normalized.judge;
    if (
      usage &&
      Object.values(usage).some(
        (tokens) => !Number.isSafeInteger(tokens) || tokens < 0,
      )
    )
      throw new Error('Judge token usage must contain nonnegative integers');
  }
  return {
    value: normalized.value,
    passed: normalized.passed ?? normalized.value === 1,
    ...(normalized.explanation ? { explanation: normalized.explanation } : {}),
    ...(normalized.evidence === undefined
      ? {}
      : { evidence: normalized.evidence }),
    ...('judge' in normalized && normalized.judge !== undefined
      ? { judge: normalized.judge }
      : {}),
  };
}
