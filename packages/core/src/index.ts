import { authorId, type ResourceUri } from './identity.js';
export { defineConfig, type EvalkitConfig } from './config.js';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type AutIdentity = {
  /** Human-readable logical agent name shown in catalogs and dashboards. */
  name?: string;
  kind: string;
  id: string;
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
  /** Run-time parameters supplied by the eval definition or CLI invocation. */
  parameters?: JsonObject;
  runtime?: AgentRuntimeName;
  /** Contains only resources visible to the AUT/model. */
  workspace: CandidateWorkspace;
  /** Private evaluator capability for trusted AUT adapters; never expose this to the model. */
  evaluatorWorkspace: EvaluatorWorkspace;
};

export type FixtureContext = Omit<AutContext, 'workspace' | 'evaluatorWorkspace'>;

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
  if (agent.identity) authoringId(agent.identity);
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

function defaultFixtureDestination(src: string): string {
  const normalized = src.replace(/\\/g, '/').replace(/\/+$/, '');
  const destination = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (!destination || destination === '.' || destination === '..') {
    throw new Error(`Fixture source needs a basename: ${src}`);
  }
  return destination;
}

/**
 * Declares a directory relative to the invoking project's working directory.
 * The short form is candidate-visible and copies beneath the source basename.
 */
export function directory(
  src: string,
  options: Partial<Omit<DirectoryFixture, 'kind' | 'src'>> = {},
): DirectoryFixture {
  return {
    kind: 'directory',
    src,
    dst: options.dst ?? defaultFixtureDestination(src),
    visibility: options.visibility ?? 'candidate',
  };
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
  /** Number of independent trials requested by local and hosted runners. */
  trials?: number;
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
  authoringId(definition);
  return definition;
}

export { defineEvalMatrix, canonicalParameters } from './matrix.js';
export type { EvalMatrix, EvalMatrixCell, MatrixSelection } from './matrix.js';
import type { EvalMatrix } from './matrix.js';

export type EvalSuite<
  TEvals extends readonly EvalDefinition[] = readonly EvalDefinition[],
> = {
  id: string;
  name?: string;
  evals: TEvals;
};

export function defineSuite<const TSuite extends EvalSuite>(
  suite: TSuite,
): TSuite {
  authoringId(suite);
  return suite;
}

export type EvalRegistration = EvalDefinition | EvalSuite | EvalMatrix;

export function authoringId(value: { id: string }): string {
  if ('uri' in value || 'uuid' in value || 'slug' in value)
    throw new Error('Authored resources use id, not uri, uuid, or slug');
  return authorId(value.id);
}

function isEvalMatrix(
  registration: EvalRegistration,
): registration is EvalMatrix {
  return 'kind' in registration && registration.kind === 'matrix';
}

function isEvalSuite(
  registration: EvalRegistration,
): registration is EvalSuite {
  return !isEvalMatrix(registration) && 'evals' in registration;
}

export type EvalRegistry = {
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

export type EvalRegistryMetadata = {
  id: string;
  name?: string;
  suiteId?: string;
};

export type EvalSuiteMetadata = {
  id: string;
  name?: string;
  evalIds: string[];
};

export type EvalCatalogFixture = {
  kind: Fixture['kind'];
  source: string;
  destination?: string;
  visibility?: FixtureVisibility;
};

export type EvalCatalogEntry = {
  id: string;
  path: string;
  name?: string;
  suiteId?: string;
  agent: {
    name?: string;
    kind: string;
    id?: string;
    version?: string;
    runtimes: Array<{ name: AgentRuntimeName; kind: string }>;
  };
  fixtures: EvalCatalogFixture[];
  trialCount: number;
  scorers: Array<{ name: string; kind: ScoringRule['kind'] }>;
};

/**
 * Creates an explicit, statically imported eval registry. A suite is a
 * path-like grouping of evals; nesting is presentation derived from its ID.
 */
export function registerEvals<
  const TRegistrations extends readonly EvalRegistration[],
>(registrations: TRegistrations): EvalRegistry {
  const byId = new Map<string, EvalDefinition>();
  const suiteById = new Map<string, EvalSuite>();
  const suiteIdByEvalId = new Map<string, EvalSuite>();
  const standalone: EvalDefinition[] = [];
  const matrices: EvalMatrix[] = [];

  for (const registration of registrations) {
    if (isEvalMatrix(registration)) {
      const id = authoringId(registration);
      if (matrices.some((matrix) => authoringId(matrix) === id))
        throw new Error(`Eval registry contains duplicate matrix ID: ${id}`);
      matrices.push(registration);
      continue;
    }
    const suite = isEvalSuite(registration) ? registration : undefined;
    if (suite) {
      const id = authoringId(suite);
      if (suiteById.has(id)) throw new Error(`Eval registry contains duplicate suite ID: ${id}`);
      suiteById.set(id, suite);
    }
    const evaluations: readonly EvalDefinition[] = suite
      ? suite.evals
      : [registration as EvalDefinition];
    for (const evaluation of evaluations) {
      const id = authoringId(evaluation);
      if (byId.has(id)) throw new Error(`Eval registry contains duplicate eval ID: ${id}`);
      byId.set(id, evaluation);
      if (suite) suiteIdByEvalId.set(id, suite);
      else standalone.push(evaluation);
    }
  }

  const evals = [
    ...standalone,
    ...Array.from(suiteById.values()).flatMap((suite) => suite.evals),
  ];
  return {
    evals,
    suites: [...suiteById.values()],
    matrices,
    get: (id) => byId.get(id),
    getSuite: (id) => suiteById.get(id),
    metadata: () =>
      evals.map((evaluation) => {
        const suite = suiteIdByEvalId.get(authoringId(evaluation));
        return {
          id: evaluation.id,
          ...(evaluation.name ? { name: evaluation.name } : {}),
          ...(suite ? { suiteId: suite.id } : {}),
        };
      }),
    suiteMetadata: () =>
      [...suiteById.values()].map((suite) => ({
        id: suite.id,
        evalIds: suite.evals.map(authoringId),
        ...(suite.name ? { name: suite.name } : {}),
      })),
    catalog: () =>
      evals.map((evaluation) => {
        const suite = suiteIdByEvalId.get(authoringId(evaluation));
        const identity = evaluation.agent.identity;
        return {
          id: evaluation.id,
          path: suite ? `${suite.id}#${evaluation.id}` : evaluation.id,
          ...(evaluation.name ? { name: evaluation.name } : {}),
          ...(suite ? { suiteId: suite.id } : {}),
          agent: {
            ...(identity?.name ? { name: identity.name } : {}),
            kind: identity?.kind ?? 'adapter',
            ...(identity?.id ? { id: identity.id } : {}),
            ...(identity?.version ? { version: identity.version } : {}),
            runtimes: Object.entries(evaluation.agent.runtimes ?? {}).map(
              ([name, runtime]) => ({
                name: name as AgentRuntimeName,
                kind: runtime.kind,
              }),
            ),
          },
          fixtures: (evaluation.fixtures ?? []).map((fixture) =>
            fixture.kind === 'dynamic'
              ? { kind: 'dynamic', source: 'dynamic' }
              : fixture.kind === 'inline'
                ? {
                    kind: 'inline',
                    source: fixture.file,
                    destination: fixture.file,
                    visibility: fixture.visibility,
                  }
                : {
                    kind: fixture.kind,
                    source: fixture.src,
                    destination: fixture.dst,
                    visibility: fixture.visibility,
                  },
          ),
          trialCount: evaluation.policy?.trials ?? 1,
          scorers: evaluation.scoring.map(({ name, kind }) => ({ name, kind })),
        };
      }),
  };
}

export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type RunMetadata = {
  schemaVersion: 2;
  runId: string;
  runUri: ResourceUri<'run'>;
  evalId: string;
  suiteId?: string;
  parameters?: JsonObject;
  matrix?: { id: string; cellKey: string };
  aut?: AutIdentity;
  startedAt: string;
};

export type TrialMetadata = {
  schemaVersion: 2;
  runId: string;
  runUri: ResourceUri<'run'>;
  trialId: string;
  trialUri: ResourceUri<'trial'>;
  trialIndex: number;
  evalId: string;
  parameters?: JsonObject;
  matrix?: { id: string; cellKey: string };
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
  durationMs?: number;
  scoring?: TrialScoring;
  artifacts?: ArtifactEntry[];
  error?: RecordedError;
};

export type RunSummary = {
  status: RunStatus;
  endedAt: string;
  durationMs?: number;
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

export type TrialResult = {
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

export type AggregateScoring = {
  passed: number;
  failed: number;
  passRate: number;
  overall?: number;
};

export type RunResult = TrialResult & {
  runId: string;
  trialCount?: number;
  passed?: number;
  failed?: number;
  aggregateScoring?: AggregateScoring;
  /** Present for an aggregate multi-trial run. */
  trials?: TrialResult[];
};

export * from './identity.js';
export * from './schema.js';

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
