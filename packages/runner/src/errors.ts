import { Data } from 'effect';

export class AutExecutionError extends Data.TaggedError('AutExecutionError')<{
  cause: unknown;
  message?: string;
}> {}

export class FixtureError extends Data.TaggedError('FixtureError')<{
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

export class CheckpointExecutionError extends Data.TaggedError(
  'CheckpointExecutionError',
)<{
  step: number;
  name: string;
  message: string;
  cause: unknown;
}> {}
