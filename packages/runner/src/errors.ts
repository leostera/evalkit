import { Data } from 'effect';

export class AutExecutionError extends Data.TaggedError('AutExecutionError')<{
  cause: unknown;
}> {}

export class FixtureError extends Data.TaggedError('FixtureError')<{
  cause: unknown;
}> {}

export class ReportError extends Data.TaggedError('ReportError')<{
  cause: unknown;
}> {}

export class ScoringError extends Data.TaggedError('ScoringError')<{
  cause: unknown;
}> {}
