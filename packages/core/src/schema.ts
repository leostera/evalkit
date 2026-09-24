import * as Schema from 'effect/Schema';
import { resourceUriSchema } from './identity.js';
import type { JsonValue, TrajectoryEvent } from './index.js';

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

// Payloads and scorer evidence are provider-neutral JSON, not benchmark-specific objects.
export const JsonValueSchema: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.Null,
    Schema.Boolean,
    Schema.Number,
    Schema.String,
    Schema.mutable(Schema.Array(JsonValueSchema)),
    Schema.Record({ key: Schema.String, value: JsonValueSchema }),
  ),
);

const ParametersSchema = Schema.Record({
  key: Schema.String,
  value: JsonValueSchema,
});
const MatrixCellSchema = Schema.Struct({
  id: Schema.String,
  cellKey: Schema.String,
});

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

/** On-disk manifests include a lifecycle status; older finalized manifests may still say running. */
export const RunManifestSchema = Schema.Struct({
  ...RunMetadataSchema.fields,
  status: Schema.optional(RunStatusSchema),
});
export const TrialManifestSchema = Schema.Struct({
  ...TrialMetadataSchema.fields,
  status: Schema.optional(RunStatusSchema),
});

export const ScoreResultSchema = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literal('predicate', 'judge'),
  value: Schema.optional(Schema.Number),
  passed: Schema.optional(Schema.Boolean),
  explanation: Schema.optional(Schema.String),
  evidence: Schema.optional(JsonValueSchema),
  durationMs: Schema.Number,
  error: Schema.optional(RecordedErrorSchema),
});
export const TrialScoringSchema = Schema.Struct({
  results: Schema.Array(ScoreResultSchema),
  overall: Schema.optional(Schema.Number),
  passed: Schema.Boolean,
});
export const ArtifactEntrySchema = Schema.Struct({
  path: Schema.String,
  kind: Schema.Literal('file', 'directory'),
  size: Schema.optional(Schema.Number),
});
export const TrialSummarySchema = Schema.Struct({
  status: RunStatusSchema,
  endedAt: Schema.String,
  durationMs: Schema.optional(Schema.Number),
  scoring: Schema.optional(TrialScoringSchema),
  artifacts: Schema.optional(Schema.Array(ArtifactEntrySchema)),
  error: Schema.optional(RecordedErrorSchema),
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

export const UsageSchema = Schema.Struct({
  inputTokens: Schema.optional(Schema.Number),
  outputTokens: Schema.optional(Schema.Number),
  totalTokens: Schema.optional(Schema.Number),
});

const autEvent = {
  started: Schema.Struct({
    source: Schema.Literal('aut'),
    kind: Schema.Literal('started'),
    timestamp: Schema.String,
  }),
  message: Schema.Struct({
    source: Schema.Literal('aut'),
    kind: Schema.Literal('message'),
    role: Schema.Literal('system', 'user', 'assistant', 'tool'),
    content: JsonValueSchema,
    timestamp: Schema.String,
  }),
  toolCall: Schema.Struct({
    source: Schema.Literal('aut'),
    kind: Schema.Literal('tool-call'),
    id: Schema.String,
    name: Schema.String,
    arguments: JsonValueSchema,
    timestamp: Schema.String,
  }),
  toolResult: Schema.Struct({
    source: Schema.Literal('aut'),
    kind: Schema.Literal('tool-result'),
    id: Schema.String,
    name: Schema.optional(Schema.String),
    result: JsonValueSchema,
    timestamp: Schema.String,
  }),
  turnStarted: Schema.Struct({
    source: Schema.Literal('aut'),
    kind: Schema.Literal('turn-started'),
    turn: Schema.Number,
    timestamp: Schema.String,
  }),
  turnCompleted: Schema.Struct({
    source: Schema.Literal('aut'),
    kind: Schema.Literal('turn-completed'),
    turn: Schema.Number,
    timestamp: Schema.String,
    latencyMs: Schema.optional(Schema.Number),
    usage: Schema.optional(UsageSchema),
  }),
  completed: Schema.Struct({
    source: Schema.Literal('aut'),
    kind: Schema.Literal('completed'),
    output: Schema.optional(JsonValueSchema),
    timestamp: Schema.String,
  }),
  error: Schema.Struct({
    source: Schema.Literal('aut'),
    kind: Schema.Literal('error'),
    error: RecordedErrorSchema,
    timestamp: Schema.String,
  }),
};
const runnerEvent = {
  trialStarted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('trial-started'),
    timestamp: Schema.String,
  }),
  stepStarted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('transcript-step-started'),
    step: Schema.Number,
    timestamp: Schema.String,
  }),
  stepCompleted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('transcript-step-completed'),
    step: Schema.Number,
    timestamp: Schema.String,
  }),
  scorerStarted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('scorer-started'),
    scorer: Schema.String,
    timestamp: Schema.String,
  }),
  scorerCompleted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('scorer-completed'),
    scorer: Schema.String,
    value: Schema.Number,
    timestamp: Schema.String,
  }),
  scorerFailed: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('scorer-failed'),
    scorer: Schema.String,
    error: RecordedErrorSchema,
    timestamp: Schema.String,
  }),
  trialCompleted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('trial-completed'),
    timestamp: Schema.String,
  }),
  error: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('error'),
    error: RecordedErrorSchema,
    timestamp: Schema.String,
  }),
};

export const TrajectoryEventSchema: Schema.Schema<TrajectoryEvent> =
  Schema.Union(...Object.values(autEvent), ...Object.values(runnerEvent));

export const ApiErrorSchema = Schema.Struct({
  error: Schema.String,
  message: Schema.String,
});
