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

/** The run was cancelled (Ctrl+C); the trial stops and is finalized as cancelled. */
export class CancelledError extends Data.TaggedError('CancelledError')<{
  message: string;
}> {}

export function cancelled(): CancelledError {
  return new CancelledError({ message: 'Cancelled' });
}

/** Settles like `work`, or rejects with `CancelledError` as soon as `signal` aborts. */
export async function unlessAborted<T>(
  work: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw cancelled();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(cancelled());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([work(), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort!);
  }
}
