import * as Schema from "effect/Schema";
//#region ../core/src/identity.d.ts
declare const ResourceKindSchema: Schema.Literal<["run", "trial", "artifact"]>;
type ResourceKind = typeof ResourceKindSchema.Type;
/** Human-authored project-local identifier; never a generated resource URI. */
declare function authorId(value: string): string;
/** RFC 4122 textual UUID. EvalKit accepts v4/v7 and other valid UUID versions. */
declare const UuidSchema: Schema.filter<typeof Schema.String>;
type Uuid = typeof UuidSchema.Type;
type ResourceUri<TKind extends ResourceKind = ResourceKind> = `evalkit:${TKind}:${string}`;
declare const ResourceUriSchema: Schema.filter<typeof Schema.String>;
declare function resourceUriSchema<TKind extends ResourceKind>(kind: TKind): Schema.filter<typeof Schema.String>;
declare function resourceUri<TKind extends ResourceKind>(kind: TKind, uuid: Uuid): ResourceUri<TKind>;
declare function parseResourceUri<TKind extends ResourceKind>(value: string, expectedKind?: TKind): {
  kind: TKind;
  uuid: Uuid;
  uri: ResourceUri<TKind>;
};
declare function resourceUuid(value: string, expectedKind?: ResourceKind): Uuid;
//#endregion
//#region ../core/src/matrix.d.ts
/** Canonical JSON: keys sorted recursively, array order preserved. Rejects non-JSON inputs. */
declare function canonicalParameters(value: JsonValue): string;
type MatrixSelection = {
  /** Base eval IDs. Unknown values fail before dispatch. */
  evals?: readonly string[];
  /** Select existing axis values, rather than overwriting every cell with the same value. */
  parameters?: Readonly<Record<string, readonly JsonValue[]>>;
  /** Overrides for non-axis execution settings (e.g. maxTokens). */
  overrides?: JsonObject;
};
type EvalMatrixCell = {
  matrixId: string;
  /** Stable canonical key including matrix, base eval and effective parameters. */
  key: string;
  eval: EvalDefinition;
  parameters: JsonObject;
};
type EvalMatrixDefinition = {
  id: string;
  name?: string;
  evals: readonly EvalDefinition[];
  parameters: Readonly<Record<string, readonly JsonValue[]>>;
  defaults?: JsonObject;
};
type EvalMatrix = EvalMatrixDefinition & {
  kind: 'matrix';
  count(selection?: MatrixSelection): number;
  cells(selection?: MatrixSelection): IterableIterator<EvalMatrixCell>;
};
declare function defineEvalMatrix<const T extends EvalMatrixDefinition>(definition: T): EvalMatrix & T;
//#endregion
//#region ../core/src/config.d.ts
type EvalkitConfig = {
  /** Paths are relative to evalkit.config.js/ts, not the invoking shell directory. */
  testDir?: string;
  include?: readonly string[];
  exclude?: readonly string[];
  /** Explicit definitions are an alternative to discovery (e.g. hosted registries). */
  evals?: readonly EvalDefinition[];
  registry?: EvalRegistry;
  /** Applied to every discovered eval. Values are forwarded, never provider-interpreted. */
  matrix?: Omit<EvalMatrixDefinition, 'evals' | 'id'> & {
    id?: string;
  };
  execution?: {
    concurrency?: number;
    trials?: number;
    maxCells?: number;
  };
  reportDir?: string;
  sandboxDir?: string;
};
/** Pure, typed project configuration. Loading/discovery belongs to the CLI. */
declare function defineConfig<const T extends EvalkitConfig>(configuration: T): T;
//#endregion
//#region ../core/src/schema.d.ts
/** Runtime schemas for serialized EvalKit report and API boundaries. */
declare const RunStatusSchema: Schema.Literal<["running", "completed", "failed", "cancelled"]>;
declare const RecordedErrorSchema: Schema.Struct<{
  name: typeof Schema.String;
  message: typeof Schema.String;
  stack: Schema.optional<typeof Schema.String>;
}>;
declare const AutIdentitySchema: Schema.Struct<{
  name: Schema.optional<typeof Schema.String>;
  kind: typeof Schema.String;
  id: typeof Schema.String;
  version: Schema.optional<typeof Schema.String>;
}>;
declare const JsonValueSchema: Schema.Schema<JsonValue>;
declare const RunMetadataSchema: Schema.Struct<{
  schemaVersion: Schema.Literal<[2, 3]>;
  runUri: Schema.filter<typeof Schema.String>;
  evalId: typeof Schema.String;
  suiteId: Schema.optional<typeof Schema.String>;
  parameters: Schema.optional<Schema.Record$<typeof Schema.String, Schema.Schema<JsonValue, JsonValue, never>>>;
  matrix: Schema.optional<Schema.Struct<{
    id: typeof Schema.String;
    cellKey: typeof Schema.String;
  }>>;
  aut: Schema.optional<Schema.Struct<{
    name: Schema.optional<typeof Schema.String>;
    kind: typeof Schema.String;
    id: typeof Schema.String;
    version: Schema.optional<typeof Schema.String>;
  }>>;
  startedAt: typeof Schema.String;
}>;
declare const TrialMetadataSchema: Schema.Struct<{
  schemaVersion: Schema.Literal<[2, 3]>;
  runUri: Schema.filter<typeof Schema.String>;
  trialUri: Schema.filter<typeof Schema.String>;
  trialIndex: typeof Schema.Number;
  evalId: typeof Schema.String;
  parameters: Schema.optional<Schema.Record$<typeof Schema.String, Schema.Schema<JsonValue, JsonValue, never>>>;
  matrix: Schema.optional<Schema.Struct<{
    id: typeof Schema.String;
    cellKey: typeof Schema.String;
  }>>;
  aut: Schema.optional<Schema.Struct<{
    name: Schema.optional<typeof Schema.String>;
    kind: typeof Schema.String;
    id: typeof Schema.String;
    version: Schema.optional<typeof Schema.String>;
  }>>;
  startedAt: typeof Schema.String;
}>;
/** On-disk manifests include a lifecycle status; older finalized manifests may still say running. */
declare const RunManifestSchema: Schema.Struct<{
  schemaVersion: Schema.Literal<[2, 3]>;
  runUri: Schema.filter<typeof Schema.String>;
  evalId: typeof Schema.String;
  suiteId: Schema.optional<typeof Schema.String>;
  parameters: Schema.optional<Schema.Record$<typeof Schema.String, Schema.Schema<JsonValue, JsonValue, never>>>;
  matrix: Schema.optional<Schema.Struct<{
    id: typeof Schema.String;
    cellKey: typeof Schema.String;
  }>>;
  aut: Schema.optional<Schema.Struct<{
    name: Schema.optional<typeof Schema.String>;
    kind: typeof Schema.String;
    id: typeof Schema.String;
    version: Schema.optional<typeof Schema.String>;
  }>>;
  startedAt: typeof Schema.String;
  status: Schema.optional<Schema.Literal<["running", "completed", "failed", "cancelled"]>>;
}>;
declare const TrialManifestSchema: Schema.Struct<{
  schemaVersion: Schema.Literal<[2, 3]>;
  runUri: Schema.filter<typeof Schema.String>;
  trialUri: Schema.filter<typeof Schema.String>;
  trialIndex: typeof Schema.Number;
  evalId: typeof Schema.String;
  parameters: Schema.optional<Schema.Record$<typeof Schema.String, Schema.Schema<JsonValue, JsonValue, never>>>;
  matrix: Schema.optional<Schema.Struct<{
    id: typeof Schema.String;
    cellKey: typeof Schema.String;
  }>>;
  aut: Schema.optional<Schema.Struct<{
    name: Schema.optional<typeof Schema.String>;
    kind: typeof Schema.String;
    id: typeof Schema.String;
    version: Schema.optional<typeof Schema.String>;
  }>>;
  startedAt: typeof Schema.String;
  status: Schema.optional<Schema.Literal<["running", "completed", "failed", "cancelled"]>>;
}>;
declare const UsageSchema: Schema.Struct<{
  inputTokens: Schema.optional<typeof Schema.Number>;
  outputTokens: Schema.optional<typeof Schema.Number>;
  totalTokens: Schema.optional<typeof Schema.Number>;
}>;
declare const JudgeRunInfoSchema: Schema.Struct<{
  agent: Schema.optional<Schema.Struct<{
    id: typeof Schema.String;
    kind: typeof Schema.String;
    name: Schema.optional<typeof Schema.String>;
    version: Schema.optional<typeof Schema.String>;
  }>>;
  usage: Schema.optional<Schema.Struct<{
    inputTokens: Schema.optional<typeof Schema.Number>;
    outputTokens: Schema.optional<typeof Schema.Number>;
    totalTokens: Schema.optional<typeof Schema.Number>;
  }>>;
  events: Schema.optional<Schema.mutable<Schema.Array$<Schema.Schema<JsonValue, JsonValue, never>>>>;
}>;
declare const ScoreResultSchema: Schema.Struct<{
  name: typeof Schema.String;
  kind: Schema.Literal<["predicate", "judge"]>;
  value: Schema.optional<typeof Schema.Number>;
  passed: Schema.optional<typeof Schema.Boolean>;
  explanation: Schema.optional<typeof Schema.String>;
  evidence: Schema.optional<Schema.Schema<JsonValue, JsonValue, never>>;
  judge: Schema.optional<Schema.Struct<{
    agent: Schema.optional<Schema.Struct<{
      id: typeof Schema.String;
      kind: typeof Schema.String;
      name: Schema.optional<typeof Schema.String>;
      version: Schema.optional<typeof Schema.String>;
    }>>;
    usage: Schema.optional<Schema.Struct<{
      inputTokens: Schema.optional<typeof Schema.Number>;
      outputTokens: Schema.optional<typeof Schema.Number>;
      totalTokens: Schema.optional<typeof Schema.Number>;
    }>>;
    events: Schema.optional<Schema.mutable<Schema.Array$<Schema.Schema<JsonValue, JsonValue, never>>>>;
  }>>;
  durationMs: typeof Schema.Number;
  error: Schema.optional<Schema.Struct<{
    name: typeof Schema.String;
    message: typeof Schema.String;
    stack: Schema.optional<typeof Schema.String>;
  }>>;
}>;
declare const CheckpointResultSchema: Schema.Struct<{
  step: typeof Schema.Number;
  kind: Schema.Literal<["predicate", "judge", "expect-tool-call"]>;
  name: typeof Schema.String;
  status: Schema.Literal<["passed", "failed", "error", "skipped"]>;
  value: Schema.optional<typeof Schema.Number>;
  passed: Schema.optional<typeof Schema.Boolean>;
  explanation: Schema.optional<typeof Schema.String>;
  evidence: Schema.optional<Schema.Schema<JsonValue, JsonValue, never>>;
  judge: Schema.optional<Schema.Struct<{
    agent: Schema.optional<Schema.Struct<{
      id: typeof Schema.String;
      kind: typeof Schema.String;
      name: Schema.optional<typeof Schema.String>;
      version: Schema.optional<typeof Schema.String>;
    }>>;
    usage: Schema.optional<Schema.Struct<{
      inputTokens: Schema.optional<typeof Schema.Number>;
      outputTokens: Schema.optional<typeof Schema.Number>;
      totalTokens: Schema.optional<typeof Schema.Number>;
    }>>;
    events: Schema.optional<Schema.mutable<Schema.Array$<Schema.Schema<JsonValue, JsonValue, never>>>>;
  }>>;
  durationMs: Schema.optional<typeof Schema.Number>;
  error: Schema.optional<Schema.Struct<{
    name: typeof Schema.String;
    message: typeof Schema.String;
    stack: Schema.optional<typeof Schema.String>;
  }>>;
  matchedToolCall: Schema.optional<Schema.Struct<{
    eventIndex: typeof Schema.Number;
    id: typeof Schema.String;
  }>>;
}>;
declare const TrialScoringSchema: Schema.Struct<{
  results: Schema.mutable<Schema.Array$<Schema.Struct<{
    name: typeof Schema.String;
    kind: Schema.Literal<["predicate", "judge"]>;
    value: Schema.optional<typeof Schema.Number>;
    passed: Schema.optional<typeof Schema.Boolean>;
    explanation: Schema.optional<typeof Schema.String>;
    evidence: Schema.optional<Schema.Schema<JsonValue, JsonValue, never>>;
    judge: Schema.optional<Schema.Struct<{
      agent: Schema.optional<Schema.Struct<{
        id: typeof Schema.String;
        kind: typeof Schema.String;
        name: Schema.optional<typeof Schema.String>;
        version: Schema.optional<typeof Schema.String>;
      }>>;
      usage: Schema.optional<Schema.Struct<{
        inputTokens: Schema.optional<typeof Schema.Number>;
        outputTokens: Schema.optional<typeof Schema.Number>;
        totalTokens: Schema.optional<typeof Schema.Number>;
      }>>;
      events: Schema.optional<Schema.mutable<Schema.Array$<Schema.Schema<JsonValue, JsonValue, never>>>>;
    }>>;
    durationMs: typeof Schema.Number;
    error: Schema.optional<Schema.Struct<{
      name: typeof Schema.String;
      message: typeof Schema.String;
      stack: Schema.optional<typeof Schema.String>;
    }>>;
  }>>>;
  checkpoints: Schema.optional<Schema.mutable<Schema.Array$<Schema.Struct<{
    step: typeof Schema.Number;
    kind: Schema.Literal<["predicate", "judge", "expect-tool-call"]>;
    name: typeof Schema.String;
    status: Schema.Literal<["passed", "failed", "error", "skipped"]>;
    value: Schema.optional<typeof Schema.Number>;
    passed: Schema.optional<typeof Schema.Boolean>;
    explanation: Schema.optional<typeof Schema.String>;
    evidence: Schema.optional<Schema.Schema<JsonValue, JsonValue, never>>;
    judge: Schema.optional<Schema.Struct<{
      agent: Schema.optional<Schema.Struct<{
        id: typeof Schema.String;
        kind: typeof Schema.String;
        name: Schema.optional<typeof Schema.String>;
        version: Schema.optional<typeof Schema.String>;
      }>>;
      usage: Schema.optional<Schema.Struct<{
        inputTokens: Schema.optional<typeof Schema.Number>;
        outputTokens: Schema.optional<typeof Schema.Number>;
        totalTokens: Schema.optional<typeof Schema.Number>;
      }>>;
      events: Schema.optional<Schema.mutable<Schema.Array$<Schema.Schema<JsonValue, JsonValue, never>>>>;
    }>>;
    durationMs: Schema.optional<typeof Schema.Number>;
    error: Schema.optional<Schema.Struct<{
      name: typeof Schema.String;
      message: typeof Schema.String;
      stack: Schema.optional<typeof Schema.String>;
    }>>;
    matchedToolCall: Schema.optional<Schema.Struct<{
      eventIndex: typeof Schema.Number;
      id: typeof Schema.String;
    }>>;
  }>>>>;
  skippedScorers: Schema.optional<Schema.mutable<Schema.Array$<typeof Schema.String>>>;
  overall: Schema.optional<typeof Schema.Number>;
  passed: typeof Schema.Boolean;
}>;
declare const ArtifactEntrySchema: Schema.Struct<{
  path: typeof Schema.String;
  kind: Schema.Literal<["file", "directory"]>;
  size: Schema.optional<typeof Schema.Number>;
}>;
declare const TrialSummarySchema: Schema.Struct<{
  status: Schema.Literal<["running", "completed", "failed", "cancelled"]>;
  endedAt: typeof Schema.String;
  durationMs: Schema.optional<typeof Schema.Number>;
  scoring: Schema.optional<Schema.Struct<{
    results: Schema.mutable<Schema.Array$<Schema.Struct<{
      name: typeof Schema.String;
      kind: Schema.Literal<["predicate", "judge"]>;
      value: Schema.optional<typeof Schema.Number>;
      passed: Schema.optional<typeof Schema.Boolean>;
      explanation: Schema.optional<typeof Schema.String>;
      evidence: Schema.optional<Schema.Schema<JsonValue, JsonValue, never>>;
      judge: Schema.optional<Schema.Struct<{
        agent: Schema.optional<Schema.Struct<{
          id: typeof Schema.String;
          kind: typeof Schema.String;
          name: Schema.optional<typeof Schema.String>;
          version: Schema.optional<typeof Schema.String>;
        }>>;
        usage: Schema.optional<Schema.Struct<{
          inputTokens: Schema.optional<typeof Schema.Number>;
          outputTokens: Schema.optional<typeof Schema.Number>;
          totalTokens: Schema.optional<typeof Schema.Number>;
        }>>;
        events: Schema.optional<Schema.mutable<Schema.Array$<Schema.Schema<JsonValue, JsonValue, never>>>>;
      }>>;
      durationMs: typeof Schema.Number;
      error: Schema.optional<Schema.Struct<{
        name: typeof Schema.String;
        message: typeof Schema.String;
        stack: Schema.optional<typeof Schema.String>;
      }>>;
    }>>>;
    checkpoints: Schema.optional<Schema.mutable<Schema.Array$<Schema.Struct<{
      step: typeof Schema.Number;
      kind: Schema.Literal<["predicate", "judge", "expect-tool-call"]>;
      name: typeof Schema.String;
      status: Schema.Literal<["passed", "failed", "error", "skipped"]>;
      value: Schema.optional<typeof Schema.Number>;
      passed: Schema.optional<typeof Schema.Boolean>;
      explanation: Schema.optional<typeof Schema.String>;
      evidence: Schema.optional<Schema.Schema<JsonValue, JsonValue, never>>;
      judge: Schema.optional<Schema.Struct<{
        agent: Schema.optional<Schema.Struct<{
          id: typeof Schema.String;
          kind: typeof Schema.String;
          name: Schema.optional<typeof Schema.String>;
          version: Schema.optional<typeof Schema.String>;
        }>>;
        usage: Schema.optional<Schema.Struct<{
          inputTokens: Schema.optional<typeof Schema.Number>;
          outputTokens: Schema.optional<typeof Schema.Number>;
          totalTokens: Schema.optional<typeof Schema.Number>;
        }>>;
        events: Schema.optional<Schema.mutable<Schema.Array$<Schema.Schema<JsonValue, JsonValue, never>>>>;
      }>>;
      durationMs: Schema.optional<typeof Schema.Number>;
      error: Schema.optional<Schema.Struct<{
        name: typeof Schema.String;
        message: typeof Schema.String;
        stack: Schema.optional<typeof Schema.String>;
      }>>;
      matchedToolCall: Schema.optional<Schema.Struct<{
        eventIndex: typeof Schema.Number;
        id: typeof Schema.String;
      }>>;
    }>>>>;
    skippedScorers: Schema.optional<Schema.mutable<Schema.Array$<typeof Schema.String>>>;
    overall: Schema.optional<typeof Schema.Number>;
    passed: typeof Schema.Boolean;
  }>>;
  artifacts: Schema.optional<Schema.mutable<Schema.Array$<Schema.Struct<{
    path: typeof Schema.String;
    kind: Schema.Literal<["file", "directory"]>;
    size: Schema.optional<typeof Schema.Number>;
  }>>>>;
  error: Schema.optional<Schema.Struct<{
    name: typeof Schema.String;
    message: typeof Schema.String;
    stack: Schema.optional<typeof Schema.String>;
  }>>;
}>;
declare const RunSummarySchema: Schema.Struct<{
  status: Schema.Literal<["running", "completed", "failed", "cancelled"]>;
  endedAt: typeof Schema.String;
  durationMs: Schema.optional<typeof Schema.Number>;
  trialCount: typeof Schema.Number;
  passed: typeof Schema.Number;
  failed: typeof Schema.Number;
  error: Schema.optional<Schema.Struct<{
    name: typeof Schema.String;
    message: typeof Schema.String;
    stack: Schema.optional<typeof Schema.String>;
  }>>;
}>;
declare const TrajectoryEventSchema: Schema.Schema<TrajectoryEvent>;
declare const ApiErrorSchema: Schema.Struct<{
  error: typeof Schema.String;
  message: typeof Schema.String;
}>;
//#endregion
//#region ../core/src/trajectory.d.ts
/** Decode one private report's JSONL trajectory; reject malformed/non-event lines with their line number. */
declare function parseTrajectoryJsonl(contents: string): TrajectoryEvent[];
//#endregion
//#region ../core/src/index.d.ts
type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonValue[] | {
  [key: string]: JsonValue;
};
type JsonObject = {
  [key: string]: JsonValue;
};
type AutIdentity = {
  /** Human-readable logical agent name shown in catalogs and dashboards. */
  name?: string;
  kind: string;
  id: string;
  version?: string;
};
type AgentRuntimeName = 'local' | 'sandbox' | 'remote';
/**
 * A serializable runtime requirement for an AUT. Concrete runtime packages own
 * the interpretation of `kind` and `configuration`.
 */
type AgentRuntime = {
  kind: string;
  configuration?: JsonObject;
};
type AgentRuntimes = Partial<Record<AgentRuntimeName, AgentRuntime>>;
type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};
type RecordedError = {
  name: string;
  message: string;
  stack?: string;
};
type AutEvent = {
  kind: 'started';
  timestamp: string;
} | {
  kind: 'message';
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: JsonValue;
  timestamp: string;
} | {
  kind: 'tool-call';
  id: string;
  name: string;
  arguments: JsonValue;
  timestamp: string;
} | {
  kind: 'tool-result';
  id: string;
  name?: string;
  result: JsonValue;
  timestamp: string;
} | {
  kind: 'turn-started';
  turn: number;
  timestamp: string;
} | {
  kind: 'turn-completed';
  turn: number;
  timestamp: string;
  latencyMs?: number;
  usage?: Usage;
} | {
  kind: 'completed';
  output?: JsonValue;
  timestamp: string;
} | {
  kind: 'error';
  error: RecordedError;
  timestamp: string;
};
type RunnerEvent = {
  kind: 'trial-started';
  timestamp: string;
} | {
  kind: 'transcript-step-started';
  step: number;
  timestamp: string;
} | {
  kind: 'transcript-step-completed';
  step: number;
  timestamp: string;
} | {
  kind: 'transcript-step-skipped';
  step: number;
  timestamp: string;
} | {
  kind: 'checkpoint-started';
  step: number;
  name: string;
  timestamp: string;
} | {
  kind: 'checkpoint-completed';
  step: number;
  status: 'passed' | 'failed';
  timestamp: string;
} | {
  kind: 'checkpoint-error';
  step: number;
  error: RecordedError;
  timestamp: string;
} | {
  kind: 'scorer-started';
  scorer: string;
  timestamp: string;
} | {
  kind: 'scorer-completed';
  scorer: string;
  value: number;
  timestamp: string;
} | {
  kind: 'scorer-failed';
  scorer: string;
  error: RecordedError;
  timestamp: string;
} | {
  kind: 'trial-completed';
  timestamp: string;
} | {
  kind: 'error';
  error: RecordedError;
  timestamp: string;
};
type TrajectoryEvent = (AutEvent & {
  source: 'aut';
}) | (RunnerEvent & {
  source: 'runner';
});
type WorkspaceView = {
  /** Absolute path to this trial-scoped workspace. Do not persist it in reports. */
  root: string;
};
type CandidateWorkspace = WorkspaceView;
type EvaluatorWorkspace = WorkspaceView;
type AutContext = {
  runId: string;
  evalId: string;
  trialId: string;
  trialIndex: number;
  metadata: JsonObject;
  /** Run-time parameters supplied by the eval definition or CLI invocation. */
  parameters?: JsonObject;
  runtime?: AgentRuntimeName;
  /** Contains only resources visible to the AUT/model. */
  workspace: CandidateWorkspace;
  /** Private evaluator capability for trusted AUT adapters; never expose this to the model. */
  evaluatorWorkspace: EvaluatorWorkspace;
};
type FixtureContext = Omit<AutContext, 'workspace' | 'evaluatorWorkspace'>;
type AutAdapter<TMessage = string> = {
  readonly identity?: AutIdentity;
  /** Available execution environments for this AUT. */
  readonly runtimes?: AgentRuntimes;
  start(options: {
    context: AutContext;
    runtime?: AgentRuntime;
    onEvent: (event: AutEvent) => void | Promise<void>;
  }): Promise<AutSession<TMessage>>;
};
type AutSession<TMessage = string> = {
  /** Resolves once the AUT has completed the turn initiated by this message. */
  send(message: TMessage): Promise<void>;
  close(): Promise<void>;
};
/**
 * Defines an Agent Under Test without coupling it to a runtime or transport.
 * It preserves the adapter's concrete type for application-specific helpers.
 */
declare function defineAgent<const T extends AutAdapter>(agent: T): T;
type FixtureVisibility = 'candidate' | 'evaluator';
type DirectoryFixture = {
  kind: 'directory';
  src: string;
  dst: string;
  visibility: FixtureVisibility;
};
type FileFixture = {
  kind: 'file';
  src: string;
  dst: string;
  visibility: FixtureVisibility;
};
type InlineFixture = {
  kind: 'inline';
  file: string;
  data: string;
  visibility: FixtureVisibility;
};
type DynamicFixture = {
  kind: 'dynamic';
  create(context: FixtureContext): Fixture | Fixture[] | Promise<Fixture | Fixture[]>;
};
type Fixture = DirectoryFixture | FileFixture | InlineFixture | DynamicFixture;
/**
 * Declares a directory relative to the invoking project's working directory.
 * The short form is candidate-visible and copies beneath the source basename.
 */
declare function directory(src: string, options?: Partial<Omit<DirectoryFixture, 'kind' | 'src'>>): DirectoryFixture;
declare function file(src: string, options: Omit<FileFixture, 'kind' | 'src'>): FileFixture;
declare function inlineFile(file: string, data: string, visibility: FixtureVisibility): InlineFixture;
declare function dynamic(create: DynamicFixture['create']): DynamicFixture;
type UserStep = {
  kind: 'user';
  message: string;
};
type AgentStep = {
  kind: 'agent';
  expectation: JsonObject;
};
type TurnView = {
  userStepIndex: number;
  events: readonly (AutEvent & {
    source: 'aut';
  })[];
  assistantMessages: readonly (Extract<AutEvent, {
    kind: 'message';
  }> & {
    role: 'assistant';
    source: 'aut';
  })[];
  toolCalls: readonly {
    eventIndex: number;
    id: string;
    name: string;
    arguments: JsonValue;
    resultObservation: 'observed' | 'absent' | 'ambiguous';
    result?: JsonValue;
  }[];
  lastAssistantText?: string;
};
type ExpectToolCallStep = {
  kind: 'expect-tool-call';
  name: string;
  expected: {
    name: string;
    arguments?: JsonValue;
  };
};
type TranscriptStep = UserStep | AgentStep | ScoringRule | ExpectToolCallStep;
/** Observes a tool call in the preceding turn; never invokes a tool. */
declare function expectToolCall(expected: ExpectToolCallStep['expected']): ExpectToolCallStep;
declare function user(message: string): UserStep;
declare function agent(expectation: JsonObject): AgentStep;
type JudgeRunInfo = {
  agent?: AutIdentity;
  usage?: Usage;
  /** Judge-agent observations; never attributed to the AUT trajectory. */
  events?: JsonValue[];
};
type ScoreValue = number | {
  value: number;
  passed?: boolean;
  explanation?: string;
  evidence?: JsonValue;
  /** Judge-agent evidence, never inferred from AUT usage. */
  judge?: JudgeRunInfo;
};
type ScoreResult = {
  name: string;
  kind: 'predicate' | 'judge';
  value?: number;
  passed?: boolean;
  explanation?: string;
  evidence?: JsonValue;
  judge?: JudgeRunInfo;
  durationMs: number;
  error?: RecordedError;
};
type ArtifactView = {
  candidate: CandidateWorkspace;
  evaluator: EvaluatorWorkspace;
};
type ScoringContext = {
  context: AutContext;
  trajectory: {
    events: readonly TrajectoryEvent[];
  };
  artifacts: ArtifactView;
  /** Most recent completed turn; absent if no user message has been sent. */
  turn?: TurnView;
};
type PredicateScorer = {
  kind: 'predicate';
  name: string;
  supportsPartial?: boolean;
  run(context: ScoringContext): boolean | ScoreValue | Promise<boolean | ScoreValue>;
};
type JudgeRule = {
  kind: 'judge';
  name: string;
  rubric: string;
  /** Run even when the scenario stopped early or execution failed. */
  supportsPartial?: boolean;
};
type ScoringRule = PredicateScorer | JudgeRule;
declare function predicate(name: string, run: PredicateScorer['run'], options?: Pick<PredicateScorer, 'supportsPartial'>): PredicateScorer;
declare function judge(name: string, options: Pick<JudgeRule, 'rubric' | 'supportsPartial'>): JudgeRule;
type EvalPolicy = {
  timeoutMs?: number;
  /** Stop later transcript steps after a failed checkpoint assertion. Default false. */
  failfast?: boolean;
  /** Number of independent trials requested by local and hosted runners. */
  trials?: number;
};
type EvalDefinition<TAgent extends AutAdapter = AutAdapter> = {
  id: string;
  name?: string;
  agent: TAgent;
  /** Separate judge agent; its model and tools are never inherited from the AUT. */
  judge?: AutAdapter;
  fixtures?: Fixture[];
  transcript: TranscriptStep[];
  scoring: ScoringRule[];
  policy?: EvalPolicy;
  metadata?: JsonObject;
};
declare function defineEval<const T extends EvalDefinition>(definition: T): T;
type EvalSuite<TEvals extends readonly EvalDefinition[] = readonly EvalDefinition[]> = {
  id: string;
  name?: string;
  evals: TEvals;
};
declare function defineSuite<const TSuite extends EvalSuite>(suite: TSuite): TSuite;
type EvalRegistration = EvalDefinition | EvalSuite | EvalMatrix;
declare function authoringId(value: {
  id: string;
}): string;
type EvalRegistry = {
  /** All registered evals, flattened from standalone entries and suites. */
  evals: readonly EvalDefinition[];
  suites: readonly EvalSuite[];
  matrices: readonly EvalMatrix[];
  get(uri: string): EvalDefinition | undefined;
  getSuite(uri: string): EvalSuite | undefined;
  metadata(): EvalRegistryMetadata[];
  suiteMetadata(): EvalSuiteMetadata[];
  catalog(): EvalCatalogEntry[];
};
type EvalRegistryMetadata = {
  id: string;
  name?: string;
  suiteId?: string;
};
type EvalSuiteMetadata = {
  id: string;
  name?: string;
  evalIds: string[];
};
type EvalCatalogFixture = {
  kind: Fixture['kind'];
  source: string;
  destination?: string;
  visibility?: FixtureVisibility;
};
type EvalCatalogEntry = {
  id: string;
  path: string;
  name?: string;
  suiteId?: string;
  agent: {
    name?: string;
    kind: string;
    id?: string;
    version?: string;
    runtimes: Array<{
      name: AgentRuntimeName;
      kind: string;
    }>;
  };
  fixtures: EvalCatalogFixture[];
  trialCount: number;
  scorers: Array<{
    name: string;
    kind: ScoringRule['kind'];
  }>;
};
/**
 * Creates an explicit, statically imported eval registry. A suite is a
 * path-like grouping of evals; nesting is presentation derived from its ID.
 */
declare function registerEvals<const TRegistrations extends readonly EvalRegistration[]>(registrations: TRegistrations): EvalRegistry;
type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
type RunMetadata = {
  schemaVersion: 2 | 3;
  runId: string;
  runUri: ResourceUri<'run'>;
  evalId: string;
  suiteId?: string;
  parameters?: JsonObject;
  matrix?: {
    id: string;
    cellKey: string;
  };
  aut?: AutIdentity;
  startedAt: string;
};
type TrialMetadata = {
  schemaVersion: 2 | 3;
  runId: string;
  runUri: ResourceUri<'run'>;
  trialId: string;
  trialUri: ResourceUri<'trial'>;
  trialIndex: number;
  evalId: string;
  parameters?: JsonObject;
  matrix?: {
    id: string;
    cellKey: string;
  };
  aut?: AutIdentity;
  startedAt: string;
};
type CheckpointResult = {
  step: number;
  kind: 'predicate' | 'judge' | 'expect-tool-call';
  name: string;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  value?: number;
  passed?: boolean;
  explanation?: string;
  evidence?: JsonValue;
  judge?: JudgeRunInfo;
  durationMs?: number;
  error?: RecordedError;
  matchedToolCall?: {
    eventIndex: number;
    id: string;
  };
};
type TrialScoring = {
  results: ScoreResult[];
  checkpoints?: CheckpointResult[];
  skippedScorers?: string[];
  overall?: number;
  passed: boolean;
};
type ArtifactEntry = {
  /** Path relative to this trial's artifact root. */
  path: string;
  kind: 'file' | 'directory';
  size?: number;
};
type TrialSummary = {
  status: RunStatus;
  endedAt: string;
  durationMs?: number;
  scoring?: TrialScoring;
  artifacts?: ArtifactEntry[];
  error?: RecordedError;
};
type RunSummary = {
  status: RunStatus;
  endedAt: string;
  durationMs?: number;
  trialCount: number;
  passed: number;
  failed: number;
  error?: RecordedError;
};
type TrialWriter = {
  appendEvent(event: TrajectoryEvent): Promise<void>;
  writeScores(scoring: TrialScoring): Promise<void>;
  /** Writes a file below this trial's artifact root. */
  writeArtifact(path: string, data: Uint8Array): Promise<void>;
  finalize(summary: TrialSummary): Promise<void>;
};
type RunWriter = {
  readonly location: string;
  startTrial(metadata: TrialMetadata): Promise<TrialWriter>;
  finalize(summary: RunSummary): Promise<void>;
};
type ReportStore = {
  startRun(metadata: RunMetadata): Promise<RunWriter>;
};
type TrialResult = {
  runId: string;
  runUri: ResourceUri<'run'>;
  trialId: string;
  trialUri: ResourceUri<'trial'>;
  trialIndex: number;
  evalId: string;
  status: RunStatus;
  reportLocation: string;
  durationMs?: number;
  scoring?: TrialScoring;
  error?: RecordedError;
};
type AggregateScoring = {
  passed: number;
  failed: number;
  passRate: number;
  overall?: number;
};
type RunResult = TrialResult & {
  runId: string;
  trialCount?: number;
  passed?: number;
  failed?: number;
  aggregateScoring?: AggregateScoring;
  /** Present for an aggregate multi-trial run. */
  trials?: TrialResult[];
};
declare function recordError(error: unknown): RecordedError;
//#endregion
export { TrialMetadata as $, Uuid as $t, FixtureContext as A, RecordedErrorSchema as At, ReportStore as B, TrialSummarySchema as Bt, EvalRegistryMetadata as C, parseTrajectoryJsonl as Ct, ExpectToolCallStep as D, CheckpointResultSchema as Dt, EvaluatorWorkspace as E, AutIdentitySchema as Et, JsonValue as F, ScoreResultSchema as Ft, RunWriter as G, EvalMatrixCell as Gt, RunResult as H, EvalkitConfig as Ht, JudgeRule as I, TrajectoryEventSchema as It, ScoreValue as J, defineEvalMatrix as Jt, RunnerEvent as K, MatrixSelection as Kt, JudgeRunInfo as L, TrialManifestSchema as Lt, InlineFixture as M, RunMetadataSchema as Mt, JsonObject as N, RunStatusSchema as Nt, FileFixture as O, JsonValueSchema as Ot, JsonPrimitive as P, RunSummarySchema as Pt, TranscriptStep as Q, ResourceUriSchema as Qt, PredicateScorer as R, TrialMetadataSchema as Rt, EvalRegistry as S, user as St, EvalSuiteMetadata as T, ArtifactEntrySchema as Tt, RunStatus as U, defineConfig as Ut, RunMetadata as V, UsageSchema as Vt, RunSummary as W, EvalMatrix as Wt, ScoringRule as X, ResourceKindSchema as Xt, ScoringContext as Y, ResourceKind as Yt, TrajectoryEvent as Z, ResourceUri as Zt, EvalCatalogEntry as _, inlineFile as _t, AggregateScoring as a, resourceUuid as an, Usage as at, EvalPolicy as b, recordError as bt, AutAdapter as c, agent as ct, AutIdentity as d, defineEval as dt, UuidSchema as en, TrialResult as et, AutSession as f, defineSuite as ft, DynamicFixture as g, file as gt, DirectoryFixture as h, expectToolCall as ht, AgentStep as i, resourceUriSchema as in, TurnView as it, FixtureVisibility as j, RunManifestSchema as jt, Fixture as k, JudgeRunInfoSchema as kt, AutContext as l, authoringId as lt, CheckpointResult as m, dynamic as mt, AgentRuntimeName as n, parseResourceUri as nn, TrialSummary as nt, ArtifactEntry as o, UserStep as ot, CandidateWorkspace as p, directory as pt, ScoreResult as q, canonicalParameters as qt, AgentRuntimes as r, resourceUri as rn, TrialWriter as rt, ArtifactView as s, WorkspaceView as st, AgentRuntime as t, authorId as tn, TrialScoring as tt, AutEvent as u, defineAgent as ut, EvalCatalogFixture as v, judge as vt, EvalSuite as w, ApiErrorSchema as wt, EvalRegistration as x, registerEvals as xt, EvalDefinition as y, predicate as yt, RecordedError as z, TrialScoringSchema as zt };
//# sourceMappingURL=index-BE3HM0UO.d.mts.map