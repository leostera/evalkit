import * as Schema from 'effect/Schema';
import { resourceUriSchema } from './identity.js';
import type { JsonValue, TrajectoryEvent } from './index.js';

/** Runtime schemas for serialized EvalKit report and API boundaries. */
export const RunStatusSchema = Schema.Literal(
  'running',
  'passed',
  'failed',
  'errored',
  'cancelled',
);

/** The report schema version this EvalKit writes and reads. */
export const REPORT_SCHEMA_VERSION = 6;

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

export const RunMetadataSchema = Schema.Struct({
  schemaVersion: Schema.Literal(6),
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
});

/** On-disk manifests include a lifecycle status. */
export const RunManifestSchema = Schema.Struct({
  ...RunMetadataSchema.fields,
  status: Schema.optional(RunStatusSchema),
});

export const UsageSchema = Schema.Struct({
  inputTokens: Schema.optional(Schema.Number),
  outputTokens: Schema.optional(Schema.Number),
  cachedInputTokens: Schema.optional(Schema.Number),
  totalTokens: Schema.optional(Schema.Number),
});

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
  events: Schema.optional(Schema.mutable(Schema.Array(JsonValueSchema))),
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
    Schema.Struct({ eventIndex: Schema.Number, id: Schema.String }),
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
    model: Schema.optional(Schema.String),
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
  runStarted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('run-started'),
    timestamp: Schema.String,
  }),
  stepStarted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('transcript-step-started'),
    step: Schema.Number,
    message: Schema.optional(Schema.String),
    timestamp: Schema.String,
  }),
  stepCompleted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('transcript-step-completed'),
    step: Schema.Number,
    timestamp: Schema.String,
  }),
  stepSkipped: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('transcript-step-skipped'),
    step: Schema.Number,
    timestamp: Schema.String,
  }),
  checkpointStarted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('checkpoint-started'),
    step: Schema.Number,
    name: Schema.String,
    timestamp: Schema.String,
  }),
  checkpointCompleted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('checkpoint-completed'),
    step: Schema.Number,
    status: Schema.Literal('passed', 'failed', 'skipped'),
    timestamp: Schema.String,
  }),
  checkpointError: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('checkpoint-error'),
    step: Schema.Number,
    error: RecordedErrorSchema,
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
    value: Schema.optional(Schema.Number),
    skipped: Schema.optional(Schema.Literal(true)),
    timestamp: Schema.String,
  }),
  scorerFailed: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('scorer-failed'),
    scorer: Schema.String,
    error: RecordedErrorSchema,
    timestamp: Schema.String,
  }),
  runCompleted: Schema.Struct({
    source: Schema.Literal('runner'),
    kind: Schema.Literal('run-completed'),
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
