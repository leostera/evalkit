import * as Schema from 'effect/Schema';
import { resourceUriSchema } from './identity.js';

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
  name: Schema.optional(Schema.String),
  kind: Schema.String,
  id: Schema.String,
  version: Schema.optional(Schema.String),
});

const ParametersSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown });
const MatrixCellSchema = Schema.Struct({ id: Schema.String, cellKey: Schema.String });

export const RunMetadataSchema = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  runUri: resourceUriSchema('run'),
  evalId: Schema.String,
  suiteId: Schema.optional(Schema.String),
  parameters: Schema.optional(ParametersSchema),
  matrix: Schema.optional(MatrixCellSchema),
  aut: Schema.optional(AutIdentitySchema),
  startedAt: Schema.String,
});

export const TrialMetadataSchema = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  runUri: resourceUriSchema('run'),
  trialUri: resourceUriSchema('trial'),
  trialIndex: Schema.Number,
  evalId: Schema.String,
  parameters: Schema.optional(ParametersSchema),
  matrix: Schema.optional(MatrixCellSchema),
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
