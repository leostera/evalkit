import * as Schema from 'effect/Schema';

/** Runtime schemas for serialized Evalkit report and API boundaries. */
export const RunStatusSchema = Schema.Literal(
  'running',
  'completed',
  'failed',
  'cancelled',
);

export const RecordedErrorSchema = Schema.Struct({
  name: Schema.String,
  message: Schema.String,
  stack: Schema.optional(Schema.String),
});

export const AutIdentitySchema = Schema.Struct({
  kind: Schema.String,
  id: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
});

export const RunMetadataSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  runId: Schema.String,
  evalId: Schema.String,
  suiteId: Schema.optional(Schema.String),
  aut: Schema.optional(AutIdentitySchema),
  startedAt: Schema.String,
});

export const TrialMetadataSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  runId: Schema.String,
  trialId: Schema.String,
  trialIndex: Schema.Number,
  evalId: Schema.String,
  aut: Schema.optional(AutIdentitySchema),
  startedAt: Schema.String,
});

export const RunSummarySchema = Schema.Struct({
  status: RunStatusSchema,
  endedAt: Schema.String,
  durationMs: Schema.optional(Schema.Number),
  trialCount: Schema.Number,
  passed: Schema.Number,
  failed: Schema.Number,
  error: Schema.optional(RecordedErrorSchema),
});

export const ApiErrorSchema = Schema.Struct({
  error: Schema.String,
  message: Schema.String,
});
