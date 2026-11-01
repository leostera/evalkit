import type {
  CheckpointResult,
  ScoringContext,
  TranscriptStep,
} from '@evalkit/core';

/**
 * `checkpoint(rule)` for a scoring context: the latest result of the steps
 * that are this very rule. A rule outside the transcript is a mistake in the
 * scenario, so it throws rather than reading as "not run".
 */
export function checkpointLookup(
  transcript: readonly TranscriptStep[],
  results: readonly CheckpointResult[],
): ScoringContext['checkpoint'] {
  return ((rule: TranscriptStep & { name: string }) => {
    const steps = new Set(
      transcript.flatMap((step, index) => (step === rule ? [index] : [])),
    );
    if (!steps.size)
      throw new Error(
        `checkpoint(${JSON.stringify(rule.name)}) is not a checkpoint in this scenario's transcript; pass the same rule object the transcript uses`,
      );
    for (let index = results.length - 1; index >= 0; index--)
      if (steps.has(results[index]!.step)) return results[index];
    return undefined;
  }) as ScoringContext['checkpoint'];
}
