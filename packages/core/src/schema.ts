import * as Schema from 'effect/Schema';
import { resourceUriSchema } from './identity.js';
import type { JsonValue, RunEvent } from './index.js';
import type { Transcript } from './transcript.js';

/** Runtime schemas for serialized EvalKit report and API boundaries. */
export const RunStatusSchema = Schema.Literal(
  'running',
  'passed',
  'failed',
  'errored',
  'cancelled',
  'limited',
);

/** The report schema version this EvalKit writes and reads. */
export const REPORT_SCHEMA_VERSION = 7;

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

export const RunSourceSchema = Schema.Struct({
  repo: Schema.String,
  project: Schema.String,
  commit: Schema.String,
  ref: Schema.optional(Schema.String),
  committedAt: Schema.optional(Schema.String),
  dirty: Schema.Boolean,
  ci: Schema.optional(
    Schema.Struct({
      provider: Schema.String,
      pipeline: Schema.optional(Schema.String),
      job: Schema.optional(Schema.String),
      url: Schema.optional(Schema.String),
    }),
  ),
});

export const BatchSchema = Schema.Struct({
  id: Schema.String,
  index: Schema.Number,
  size: Schema.Number,
});

export const RunDatasetSchema = Schema.Struct({
  id: Schema.String,
  visibility: Schema.Literal('candidate', 'evaluator'),
  source: Schema.Literal('static', 'computed'),
  digest: Schema.String,
});

export const LimitsSchema = Schema.Struct({
  steps: Schema.optional(Schema.Number),
  tokens: Schema.optional(Schema.Number),
  time: Schema.optional(Schema.Number),
});

export const LimitReachedSchema = Schema.Struct({
  limit: Schema.Literal('steps', 'tokens', 'time'),
  value: Schema.Number,
  used: Schema.Number,
});

export const RunIsolationSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal('container'),
    image: Schema.String,
    network: Schema.Literal('none', 'fixtures', 'full'),
  }),
  Schema.Struct({ kind: Schema.Literal('sandbox-exec') }),
);

export const RunMetadataSchema = Schema.Struct({
  schemaVersion: Schema.Literal(7),
  runUri: resourceUriSchema('run'),
  evalId: Schema.String,
  suiteId: Schema.optional(Schema.String),
  parameters: Schema.optional(ParametersSchema),
  matrix: Schema.optional(MatrixCellSchema),
  aut: Schema.optional(AutIdentitySchema),
  startedAt: Schema.String,
  source: Schema.optional(RunSourceSchema),
  process: Schema.optional(
    Schema.Struct({ pid: Schema.Number, hostname: Schema.String }),
  ),
  batch: Schema.optional(BatchSchema),
  /** The effective snapshot ignore patterns: the project's, then the scenario's. */
  workspaceIgnore: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  datasets: Schema.optional(Schema.mutable(Schema.Array(RunDatasetSchema))),
  limits: Schema.optional(LimitsSchema),
  isolation: Schema.optional(RunIsolationSchema),
});

/** On-disk manifests include a lifecycle status. */
export const RunManifestSchema = Schema.Struct({
  ...RunMetadataSchema.fields,
  status: Schema.optional(RunStatusSchema),
});

/** ATXF usage: disjoint buckets, `input` without cached tokens. */
export const UsageSchema = Schema.Struct({
  input: Schema.Number,
  output: Schema.Number,
  cacheRead: Schema.optional(Schema.Number),
  cacheWrite: Schema.optional(Schema.Number),
  reasoning: Schema.optional(Schema.Number),
  total: Schema.optional(Schema.Number),
  cost: Schema.optional(
    Schema.Struct({
      currency: Schema.optional(Schema.String),
      input: Schema.optional(Schema.Number),
      output: Schema.optional(Schema.Number),
      cacheRead: Schema.optional(Schema.Number),
      cacheWrite: Schema.optional(Schema.Number),
      total: Schema.Number,
    }),
  ),
});

/**
 * An ATXF transcript in JSON (`{ header, records }`). Its records are checked
 * by the ATXF validator where they are written, not here.
 */
export const TranscriptSchema = Schema.declare(
  (value: unknown): value is Transcript =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { header?: { type?: unknown } }).header === 'object' &&
    (value as { header: { type?: unknown } }).header?.type === 'transcript' &&
    Array.isArray((value as { records?: unknown }).records),
  { identifier: 'Transcript' },
);

export const JudgeRunInfoSchema = Schema.Struct({
  agent: Schema.optional(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.String,
      name: Schema.optional(Schema.String),
      version: Schema.optional(Schema.String),
    }),
  ),
  model: Schema.optional(Schema.String),
  usage: Schema.optional(UsageSchema),
  prompt: Schema.optional(Schema.String),
  reply: Schema.optional(JsonValueSchema),
  attempts: Schema.optional(Schema.Number),
  /** The judge's own session, an ATXF transcript (checked when written). */
  transcript: Schema.optional(TranscriptSchema),
});

const CriterionResultSchema = Schema.Union(
  Schema.Struct({
    name: Schema.String,
    value: Schema.Number,
    weight: Schema.optional(Schema.Number),
    explanation: Schema.optional(Schema.String),
    evidence: Schema.optional(JsonValueSchema),
  }),
  Schema.Struct({
    name: Schema.String,
    reached: Schema.Literal(false),
    weight: Schema.optional(Schema.Number),
    explanation: Schema.optional(Schema.String),
  }),
);

/** What every score and checkpoint result can carry about its verdict. */
const verdictFields = {
  passAt: Schema.optional(Schema.Number),
  choice: Schema.optional(Schema.String),
  criteria: Schema.optional(
    Schema.mutable(Schema.Array(CriterionResultSchema)),
  ),
  attachments: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
};

export const ScoreResultSchema = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literal('predicate', 'judge'),
  value: Schema.optional(Schema.Number),
  passed: Schema.optional(Schema.Boolean),
  explanation: Schema.optional(Schema.String),
  evidence: Schema.optional(JsonValueSchema),
  ...verdictFields,
  judge: Schema.optional(JudgeRunInfoSchema),
  durationMs: Schema.Number,
  error: Schema.optional(RecordedErrorSchema),
  skipped: Schema.optional(Schema.Literal(true)),
});
export const CheckpointResultSchema = Schema.Struct({
  step: Schema.Number,
  kind: Schema.Literal('predicate', 'judge', 'expect-tool-call'),
  name: Schema.String,
  status: Schema.Literal('passed', 'failed', 'error', 'skipped'),
  value: Schema.optional(Schema.Number),
  passed: Schema.optional(Schema.Boolean),
  explanation: Schema.optional(Schema.String),
  evidence: Schema.optional(JsonValueSchema),
  ...verdictFields,
  judge: Schema.optional(JudgeRunInfoSchema),
  durationMs: Schema.optional(Schema.Number),
  error: Schema.optional(RecordedErrorSchema),
  matchedToolCall: Schema.optional(
    Schema.Struct({ messageId: Schema.String, id: Schema.String }),
  ),
});
export const MetricResultSchema = Schema.Struct({
  name: Schema.String,
  value: Schema.optional(Schema.Number),
  unit: Schema.optional(Schema.String),
  better: Schema.optional(Schema.Literal('lower', 'higher')),
  builtIn: Schema.optional(Schema.Literal(true)),
  error: Schema.optional(RecordedErrorSchema),
});
export const RunScoringSchema = Schema.Struct({
  results: Schema.mutable(Schema.Array(ScoreResultSchema)),
  metrics: Schema.optional(Schema.mutable(Schema.Array(MetricResultSchema))),
  checkpoints: Schema.optional(
    Schema.mutable(Schema.Array(CheckpointResultSchema)),
  ),
  skippedScorers: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  overall: Schema.optional(Schema.Number),
  passed: Schema.Boolean,
});
export const ArtifactEntrySchema = Schema.Struct({
  path: Schema.String,
  kind: Schema.Literal('file', 'directory'),
  size: Schema.optional(Schema.Number),
});
export const AttachmentEntrySchema = Schema.Struct({
  name: Schema.String,
  size: Schema.Number,
  truncatedFrom: Schema.optional(Schema.Number),
});
export const RunSummarySchema = Schema.Struct({
  status: RunStatusSchema,
  endedAt: Schema.String,
  durationMs: Schema.optional(Schema.Number),
  scoring: Schema.optional(RunScoringSchema),
  artifacts: Schema.optional(Schema.mutable(Schema.Array(ArtifactEntrySchema))),
  attachments: Schema.optional(
    Schema.mutable(Schema.Array(AttachmentEntrySchema)),
  ),
  error: Schema.optional(RecordedErrorSchema),
  limit: Schema.optional(LimitReachedSchema),
});

const runEventFields = {
  /** The transcript record it happened after; null before the first. */
  at: Schema.NullOr(Schema.String),
  timestamp: Schema.String,
};

const runnerEvent = {
  runStarted: Schema.Struct({
    kind: Schema.Literal('run-started'),
    ...runEventFields,
  }),
  stepStarted: Schema.Struct({
    kind: Schema.Literal('transcript-step-started'),
    step: Schema.Number,
    message: Schema.optional(Schema.String),
    ...runEventFields,
  }),
  stepCompleted: Schema.Struct({
    kind: Schema.Literal('transcript-step-completed'),
    step: Schema.Number,
    ...runEventFields,
  }),
  stepSkipped: Schema.Struct({
    kind: Schema.Literal('transcript-step-skipped'),
    step: Schema.Number,
    ...runEventFields,
  }),
  checkpointStarted: Schema.Struct({
    kind: Schema.Literal('checkpoint-started'),
    step: Schema.Number,
    name: Schema.String,
    ...runEventFields,
  }),
  checkpointCompleted: Schema.Struct({
    kind: Schema.Literal('checkpoint-completed'),
    step: Schema.Number,
    status: Schema.Literal('passed', 'failed', 'skipped'),
    ...runEventFields,
  }),
  checkpointError: Schema.Struct({
    kind: Schema.Literal('checkpoint-error'),
    step: Schema.Number,
    error: RecordedErrorSchema,
    ...runEventFields,
  }),
  scorerStarted: Schema.Struct({
    kind: Schema.Literal('scorer-started'),
    scorer: Schema.String,
    ...runEventFields,
  }),
  scorerCompleted: Schema.Struct({
    kind: Schema.Literal('scorer-completed'),
    scorer: Schema.String,
    value: Schema.optional(Schema.Number),
    skipped: Schema.optional(Schema.Literal(true)),
    ...runEventFields,
  }),
  scorerFailed: Schema.Struct({
    kind: Schema.Literal('scorer-failed'),
    scorer: Schema.String,
    error: RecordedErrorSchema,
    ...runEventFields,
  }),
  limitReached: Schema.Struct({
    kind: Schema.Literal('limit-reached'),
    ...LimitReachedSchema.fields,
    ...runEventFields,
  }),
  runCompleted: Schema.Struct({
    kind: Schema.Literal('run-completed'),
    ...runEventFields,
  }),
  error: Schema.Struct({
    kind: Schema.Literal('error'),
    error: RecordedErrorSchema,
    ...runEventFields,
  }),
};

export const RunEventSchema: Schema.Schema<RunEvent> = Schema.Union(
  ...Object.values(runnerEvent),
);

export const ApiErrorSchema = Schema.Struct({
  error: Schema.String,
  message: Schema.String,
});
