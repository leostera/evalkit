import { toJson, type ScoreResult, type ScoreValue } from '@evalkit/core';

export type NormalizedScore = Omit<ScoreResult, 'name' | 'kind' | 'durationMs'>;

/**
 * Shared normalization for inline and final predicate and judge rules.
 * `passAt` turns a numeric value into a verdict; an explicit `passed` wins.
 */
export function normalizeScore(
  value: ScoreValue | boolean,
  passAt?: number,
): NormalizedScore {
  if (
    typeof value === 'object' &&
    value !== null &&
    'skipped' in value &&
    value.skipped === true
  )
    return { skipped: true, explanation: value.reason };
  const normalized =
    typeof value === 'boolean'
      ? { value: Number(value) }
      : typeof value === 'number'
        ? { value }
        : (value as Exclude<ScoreValue, number | { skipped: true }>);
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
  const passed =
    'passed' in normalized && normalized.passed !== undefined
      ? normalized.passed
      : normalized.value >= (passAt ?? 1);
  return {
    value: normalized.value,
    passed,
    ...('explanation' in normalized && normalized.explanation
      ? { explanation: normalized.explanation }
      : {}),
    ...('evidence' in normalized && normalized.evidence !== undefined
      ? { evidence: toJson(normalized.evidence, 'evidence') }
      : {}),
    ...('judge' in normalized && normalized.judge !== undefined
      ? { judge: normalized.judge }
      : {}),
  };
}
