import type { LimitReached } from '@evalkit/core';
import { Data } from 'effect';

export class AutExecutionError extends Data.TaggedError('AutExecutionError')<{
  cause: unknown;
  message?: string;
}> {}

export class DatasetError extends Data.TaggedError('DatasetError')<{
  cause: unknown;
  message?: string;
}> {}

export class ReportError extends Data.TaggedError('ReportError')<{
  cause: unknown;
  message?: string;
}> {}

export class ScoringError extends Data.TaggedError('ScoringError')<{
  cause: unknown;
  message?: string;
}> {}

export class RuleExecutionError extends Data.TaggedError('RuleExecutionError')<{
  name: string;
  message: string;
  cause: unknown;
}> {}

export class CheckpointExecutionError extends Data.TaggedError(
  'CheckpointExecutionError',
)<{
  step: number;
  name: string;
  message: string;
  cause: unknown;
}> {}

/** The run was cancelled (Ctrl+C); the run stops and is finalized as cancelled. */
export class CancelledError extends Data.TaggedError('CancelledError')<{
  message: string;
}> {}

export function cancelled(): CancelledError {
  return new CancelledError({ message: 'Cancelled' });
}

/** The run hit one of its limits; EvalKit stopped it. */
export class LimitReachedError extends Data.TaggedError('LimitReachedError')<{
  message: string;
  limit: LimitReached;
}> {}

/** Why `signal` aborted: the limit it hit, or a cancellation. */
export function abortError(
  signal: AbortSignal,
): CancelledError | LimitReachedError {
  return signal.reason instanceof LimitReachedError
    ? signal.reason
    : cancelled();
}

/** How long a turn may take to settle after its run hits a limit (RFD0009). */
export const LIMIT_GRACE_MS = 10_000;

/**
 * Settles like `work`, or rejects once `signal` aborts: at once when
 * cancelled, and after up to `graceMs` when a limit was hit, so an agent
 * that sees `context.signal` can finish what it was writing.
 */
export async function unlessAborted<T>(
  work: () => Promise<T>,
  signal: AbortSignal,
  graceMs = 0,
): Promise<T> {
  if (signal.aborted) throw abortError(signal);
  let onAbort: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const running = work();
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      const error = abortError(signal);
      if (!(error instanceof LimitReachedError) || graceMs <= 0)
        return reject(error);
      // A turn that settles within the grace is kept; the run still ends
      // limited, since the next step sees the aborted signal.
      timer = setTimeout(() => reject(error), graceMs);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([running, aborted]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}
