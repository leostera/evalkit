export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type AutIdentity = {
  kind: string;
  id?: string;
  version?: string;
};

export type AgentRuntimeName = 'local' | 'sandbox' | 'remote';

/**
 * A serializable runtime requirement for an AUT. Concrete runtime packages own
 * the interpretation of `kind` and `configuration`.
 */
export type AgentRuntime = {
  kind: string;
  configuration?: JsonObject;
};

export type AgentRuntimes = Partial<Record<AgentRuntimeName, AgentRuntime>>;

export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type RecordedError = {
  name: string;
  message: string;
  stack?: string;
};

export type AutEvent =
  | { kind: 'started'; timestamp: string }
  | {
      kind: 'message';
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: JsonValue;
      timestamp: string;
    }
  | {
      kind: 'tool-call';
      id: string;
      name: string;
      arguments: JsonValue;
      timestamp: string;
    }
  | {
      kind: 'tool-result';
      id: string;
      name?: string;
      result: JsonValue;
      timestamp: string;
    }
  | { kind: 'turn-started'; turn: number; timestamp: string }
  | {
      kind: 'turn-completed';
      turn: number;
      timestamp: string;
      latencyMs?: number;
      usage?: Usage;
    }
  | { kind: 'completed'; output?: JsonValue; timestamp: string }
  | { kind: 'error'; error: RecordedError; timestamp: string };

export type RunnerEvent =
  | { kind: 'trial-started'; timestamp: string }
  | { kind: 'transcript-step-started'; step: number; timestamp: string }
  | { kind: 'transcript-step-completed'; step: number; timestamp: string }
  | { kind: 'scorer-started'; scorer: string; timestamp: string }
  | {
      kind: 'scorer-completed';
      scorer: string;
      value: number;
      timestamp: string;
    }
  | {
      kind: 'scorer-failed';
      scorer: string;
      error: RecordedError;
      timestamp: string;
    }
  | { kind: 'trial-completed'; timestamp: string }
  | { kind: 'error'; error: RecordedError; timestamp: string };

export type TrajectoryEvent =
  (AutEvent & { source: 'aut' }) | (RunnerEvent & { source: 'runner' });

export type WorkspaceView = {
  /** Absolute path to this trial-scoped workspace. Do not persist it in reports. */
  root: string;
};

export type CandidateWorkspace = WorkspaceView;
export type EvaluatorWorkspace = WorkspaceView;

export type AutContext = {
  runId: string;
  evalId: string;
  trialId: string;
  trialIndex: number;
  metadata: JsonObject;
  runtime?: AgentRuntimeName;
  /** Contains only resources visible to the AUT. */
  workspace: CandidateWorkspace;
};

export type FixtureContext = Omit<AutContext, 'workspace'>;

export type AutAdapter<TMessage = string> = {
  readonly identity?: AutIdentity;
  /** Available execution environments for this AUT. */
  readonly runtimes?: AgentRuntimes;
  start(options: {
    context: AutContext;
    runtime?: AgentRuntime;
    onEvent: (event: AutEvent) => void | Promise<void>;
  }): Promise<AutSession<TMessage>>;
};

export type AutSession<TMessage = string> = {
  /** Resolves once the AUT has completed the turn initiated by this message. */
  send(message: TMessage): Promise<void>;
  close(): Promise<void>;
};

/**
 * Defines an Agent Under Test without coupling it to a runtime or transport.
 * It preserves the adapter's concrete type for application-specific helpers.
 */
export function defineAgent<const T extends AutAdapter>(agent: T): T {
  return agent;
}

export type FixtureVisibility = 'candidate' | 'evaluator';

export type DirectoryFixture = {
  kind: 'directory';
  src: string;
  dst: string;
  visibility: FixtureVisibility;
};

export type FileFixture = {
  kind: 'file';
  src: string;
  dst: string;
  visibility: FixtureVisibility;
};

export type InlineFixture = {
  kind: 'inline';
  file: string;
  data: string;
  visibility: FixtureVisibility;
};

export type DynamicFixture = {
  kind: 'dynamic';
  create(
    context: FixtureContext,
  ): Fixture | Fixture[] | Promise<Fixture | Fixture[]>;
};

export type Fixture =
  DirectoryFixture | FileFixture | InlineFixture | DynamicFixture;

export function directory(
  src: string,
  options: Omit<DirectoryFixture, 'kind' | 'src'>,
): DirectoryFixture {
  return { kind: 'directory', src, ...options };
}

export function file(
  src: string,
  options: Omit<FileFixture, 'kind' | 'src'>,
): FileFixture {
  return { kind: 'file', src, ...options };
}

export function inlineFile(
  file: string,
  data: string,
  visibility: FixtureVisibility,
): InlineFixture {
  return { kind: 'inline', file, data, visibility };
}

export function dynamic(create: DynamicFixture['create']): DynamicFixture {
  return { kind: 'dynamic', create };
}

export type UserStep = {
  kind: 'user';
  message: string;
};

export type AgentStep = {
  kind: 'agent';
  expectation: JsonObject;
};

export type JudgeStep = {
  kind: 'judge';
  rubric: string;
};

export type TranscriptStep = UserStep | AgentStep | JudgeStep;

export function user(message: string): UserStep {
  return { kind: 'user', message };
}

export function agent(expectation: JsonObject): AgentStep {
  return { kind: 'agent', expectation };
}

export function judge(rubric: string): JudgeStep {
  return { kind: 'judge', rubric };
}

export type ScoreValue =
  | number
  | {
      value: number;
      passed?: boolean;
      explanation?: string;
      evidence?: JsonValue;
    };

export type ScoreResult = {
  name: string;
  kind: 'predicate' | 'judge';
  value?: number;
  passed?: boolean;
  explanation?: string;
  evidence?: JsonValue;
  durationMs: number;
  error?: RecordedError;
};

export type ArtifactView = {
  candidate: CandidateWorkspace;
  evaluator: EvaluatorWorkspace;
};

export type ScoringContext = {
  context: AutContext;
  trajectory: { events: readonly TrajectoryEvent[] };
  artifacts: ArtifactView;
};

export type PredicateScorer = {
  kind: 'predicate';
  name: string;
  supportsPartial?: boolean;
  run(context: ScoringContext): ScoreValue | Promise<ScoreValue>;
};

export type JudgeScorer = {
  kind: 'judge';
  name: string;
  target: 'transcript' | 'artifacts';
  rubric: string;
};

export type ScoringRule = PredicateScorer | JudgeScorer;

export function predicate(
  name: string,
  run: PredicateScorer['run'],
  options: Pick<PredicateScorer, 'supportsPartial'> = {},
): PredicateScorer {
  return { kind: 'predicate', name, run, ...options };
}

export function judgeScorer(
  name: string,
  options: Omit<JudgeScorer, 'kind' | 'name'>,
): JudgeScorer {
  return { kind: 'judge', name, ...options };
}

export type EvalPolicy = {
  timeoutMs?: number;
};

export type EvalDefinition<TAgent extends AutAdapter = AutAdapter> = {
  id: string;
  name?: string;
  agent: TAgent;
  fixtures?: Fixture[];
  transcript: TranscriptStep[];
  scoring: ScoringRule[];
  policy?: EvalPolicy;
  metadata?: JsonObject;
};

export function defineEval<const T extends EvalDefinition>(definition: T): T {
  return definition;
}

export type EvalRegistry<
  TEvals extends readonly EvalDefinition[] = readonly EvalDefinition[],
> = {
  evals: TEvals;
  get(id: string): TEvals[number] | undefined;
  metadata(): EvalRegistryMetadata[];
};

export type EvalRegistryMetadata = {
  id: string;
  name?: string;
};

/**
 * Creates an explicit, statically imported eval registry.
 * Registry construction rejects duplicate and empty IDs before a deployment can
 * accept a request for an ambiguous eval.
 */
export function registerEvals<const TEvals extends readonly EvalDefinition[]>(
  evals: TEvals,
): EvalRegistry<TEvals> {
  const byId = new Map<string, TEvals[number]>();
  for (const evaluation of evals) {
    if (!evaluation.id.trim()) {
      throw new Error('Eval registry contains an eval with an empty id');
    }
    if (byId.has(evaluation.id)) {
      throw new Error(`Eval registry contains duplicate id: ${evaluation.id}`);
    }
    byId.set(evaluation.id, evaluation);
  }

  return {
    evals,
    get: (id) => byId.get(id),
    metadata: () =>
      evals.map(({ id, name }) => ({
        id,
        ...(name ? { name } : {}),
      })),
  };
}

export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type RunMetadata = {
  schemaVersion: 1;
  runId: string;
  evalId: string;
  startedAt: string;
};

export type TrialMetadata = {
  schemaVersion: 1;
  runId: string;
  trialId: string;
  trialIndex: number;
  evalId: string;
  aut?: AutIdentity;
  startedAt: string;
};

export type TrialScoring = {
  results: ScoreResult[];
  overall?: number;
  passed: boolean;
};

export type ArtifactEntry = {
  /** Path relative to this trial's artifact root. */
  path: string;
  kind: 'file' | 'directory';
  size?: number;
};

export type TrialSummary = {
  status: RunStatus;
  endedAt: string;
  scoring?: TrialScoring;
  artifacts?: ArtifactEntry[];
  error?: RecordedError;
};

export type RunSummary = {
  status: RunStatus;
  endedAt: string;
  trialCount: number;
  passed: number;
  failed: number;
  error?: RecordedError;
};

export type TrialWriter = {
  appendEvent(event: TrajectoryEvent): Promise<void>;
  writeScores(scoring: TrialScoring): Promise<void>;
  /** Writes a file below this trial's artifact root. */
  writeArtifact(path: string, data: Uint8Array): Promise<void>;
  finalize(summary: TrialSummary): Promise<void>;
};

export type RunWriter = {
  readonly location: string;
  startTrial(metadata: TrialMetadata): Promise<TrialWriter>;
  finalize(summary: RunSummary): Promise<void>;
};

export type ReportStore = {
  startRun(metadata: RunMetadata): Promise<RunWriter>;
};

export type RunResult = {
  runId: string;
  trialId: string;
  status: RunStatus;
  reportLocation: string;
  scoring?: TrialScoring;
  error?: RecordedError;
};

export function recordError(error: unknown): RecordedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  return { name: 'Error', message: String(error) };
}
