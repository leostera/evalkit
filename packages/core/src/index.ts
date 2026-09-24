import { parseResourceUri, type ResourceUri, type Uuid } from './identity.js';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type AutIdentity = {
  /** Human-readable logical agent name shown in catalogs and dashboards. */
  name?: string;
  kind: string;
  uri: ResourceUri<'agent'>;
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
  return agent;
}

export type FixtureVisibility = 'candidate' | 'evaluator';

export type DirectoryFixture = {
  kind: 'directory';
  uri: ResourceUri<'fixture'>;
  src: string;
  dst: string;
  visibility: FixtureVisibility;
};

export type FileFixture = {
  kind: 'file';
  uri: ResourceUri<'fixture'>;
  src: string;
  dst: string;
  visibility: FixtureVisibility;
};

export type InlineFixture = {
  kind: 'inline';
  uri: ResourceUri<'fixture'>;
  file: string;
  data: string;
  visibility: FixtureVisibility;
};

export type DynamicFixture = {
  kind: 'dynamic';
  uri: ResourceUri<'fixture'>;
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
  uri: ResourceUri<'fixture'>,
  src: string,
  options: Partial<Omit<DirectoryFixture, 'kind' | 'uri' | 'src'>> = {},
): DirectoryFixture {
  return {
    kind: 'directory',
    uri,
    src,
    dst: options.dst ?? defaultFixtureDestination(src),
    visibility: options.visibility ?? 'candidate',
  };
}

export function file(
  uri: ResourceUri<'fixture'>,
  src: string,
  options: Omit<FileFixture, 'kind' | 'uri' | 'src'>,
): FileFixture {
  return { kind: 'file', uri, src, ...options };
}

export function inlineFile(
  uri: ResourceUri<'fixture'>,
  file: string,
  data: string,
  visibility: FixtureVisibility,
): InlineFixture {
  return { kind: 'inline', uri, file, data, visibility };
}

export function dynamic(
  uri: ResourceUri<'fixture'>,
  create: DynamicFixture['create'],
): DynamicFixture {
  return { kind: 'dynamic', uri, create };
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
  uri: ResourceUri<'eval'>;
  slug?: string;
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

export type EvalMatrixCell = {
  /** Stable, human-readable key within the matrix. */
  key: string;
  eval: EvalDefinition;
  parameters: JsonObject;
};

export type EvalMatrix = {
  kind: 'matrix';
  uri: ResourceUri<'matrix'>;
  slug?: string;
  name?: string;
  evals: readonly EvalDefinition[];
  /** Each axis value must be JSON-serializable so cells can be persisted and resumed. */
  parameters: Readonly<Record<string, readonly JsonValue[]>>;
  defaults?: JsonObject;
  /** Lazily expands the Cartesian product into executable cells. */
  cells(): readonly EvalMatrixCell[];
};

export function defineEvalMatrix<const T extends {
  uri: ResourceUri<'matrix'>;
  slug?: string;
  name?: string;
  evals: readonly EvalDefinition[];
  parameters: Readonly<Record<string, readonly JsonValue[]>>;
  defaults?: JsonObject;
}>(definition: T): EvalMatrix & T {
  return {
    ...definition,
    kind: 'matrix',
    cells: () => {
      const axes = Object.entries(definition.parameters);
      const cells: EvalMatrixCell[] = [];
      for (const evaluation of definition.evals) {
        const expand = (index: number, values: Record<string, JsonValue>) => {
          if (index === axes.length) {
            const parameters = { ...(definition.defaults ?? {}), ...values };
            const key = `${evaluation.slug ?? evaluation.uri}:${JSON.stringify(parameters)}`;
            cells.push({ key, eval: evaluation, parameters });
            return;
          }
          const [axis, choices] = axes[index]!;
          for (const choice of choices) expand(index + 1, { ...values, [axis]: choice });
        };
        expand(0, {});
      }
      return cells;
    },
  };
}

export type EvalSuite<
  TEvals extends readonly EvalDefinition[] = readonly EvalDefinition[],
> = {
  uri: ResourceUri<'suite'>;
  slug?: string;
  name?: string;
  evals: TEvals;
};

export function defineSuite<const TSuite extends EvalSuite>(
  suite: TSuite,
): TSuite {
  return suite;
}

export type EvalRegistration = EvalDefinition | EvalSuite | EvalMatrix;

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
  uri: ResourceUri<'eval'>;
  uuid: Uuid;
  name?: string;
  suiteUri?: ResourceUri<'suite'>;
};

export type EvalSuiteMetadata = {
  uri: ResourceUri<'suite'>;
  uuid: Uuid;
  name?: string;
  evalUris: ResourceUri<'eval'>[];
};

export type EvalCatalogFixture = {
  kind: Fixture['kind'];
  source: string;
  destination?: string;
  visibility?: FixtureVisibility;
};

export type EvalCatalogEntry = {
  uri: ResourceUri<'eval'>;
  uuid: Uuid;
  path: string;
  slug?: string;
  name?: string;
  suiteUri?: ResourceUri<'suite'>;
  agent: {
    name?: string;
    kind: string;
    uri?: ResourceUri<'agent'>;
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
  const byUri = new Map<string, EvalDefinition>();
  const suiteByUri = new Map<string, EvalSuite>();
  const suiteUriByEvalUri = new Map<string, ResourceUri<'suite'>>();
  const standalone: EvalDefinition[] = [];
  const matrices: EvalMatrix[] = [];

  for (const registration of registrations) {
    if (isEvalMatrix(registration)) {
      if (!registration.uri.trim())
        throw new Error('Eval registry contains a matrix with an empty URI');
      if (matrices.some((matrix) => matrix.uri === registration.uri))
        throw new Error(`Eval registry contains duplicate matrix URI: ${registration.uri}`);
      matrices.push(registration);
      continue;
    }
    const suite = isEvalSuite(registration) ? registration : undefined;
    if (suite) {
      if (!suite.uri.trim())
        throw new Error('Eval registry contains a suite with an empty URI');
      if (suiteByUri.has(suite.uri))
        throw new Error(
          `Eval registry contains duplicate suite URI: ${suite.uri}`,
        );
      suiteByUri.set(suite.uri, suite);
    }
    const evaluations: readonly EvalDefinition[] = suite
      ? suite.evals
      : [registration as EvalDefinition];
    for (const evaluation of evaluations) {
      if (!evaluation.uri.trim())
        throw new Error('Eval registry contains an eval with an empty URI');
      if (byUri.has(evaluation.uri))
        throw new Error(
          `Eval registry contains duplicate eval URI: ${evaluation.uri}`,
        );
      byUri.set(evaluation.uri, evaluation);
      if (suite) suiteUriByEvalUri.set(evaluation.uri, suite.uri);
      else standalone.push(evaluation);
    }
  }

  const evals = [
    ...standalone,
    ...Array.from(suiteByUri.values()).flatMap((suite) => suite.evals),
  ];
  return {
    evals,
    suites: [...suiteByUri.values()],
    matrices,
    get: (uri) => byUri.get(uri),
    getSuite: (uri) => suiteByUri.get(uri),
    metadata: () =>
      evals.map(({ uri, name }) => ({
        uri,
        uuid: parseResourceUri(uri, 'eval').uuid,
        ...(name ? { name } : {}),
        ...(suiteUriByEvalUri.has(uri)
          ? { suiteUri: suiteUriByEvalUri.get(uri)! }
          : {}),
      })),
    suiteMetadata: () =>
      [...suiteByUri.values()].map(({ uri, name, evals }) => ({
        uri,
        uuid: parseResourceUri(uri, 'suite').uuid,
        ...(name ? { name } : {}),
        evalUris: evals.map((evaluation) => evaluation.uri),
      })),
    catalog: () =>
      evals.map((evaluation) => {
        const suiteUri = suiteUriByEvalUri.get(evaluation.uri);
        const identity = evaluation.agent.identity;
        return {
          uri: evaluation.uri,
          uuid: parseResourceUri(evaluation.uri, 'eval').uuid,
          path: suiteUri ? `${suiteUri}#${evaluation.uri}` : evaluation.uri,
          ...(evaluation.name ? { name: evaluation.name } : {}),
          ...(suiteUri ? { suiteUri } : {}),
          agent: {
            ...(identity?.name ? { name: identity.name } : {}),
            kind: identity?.kind ?? 'adapter',
            ...(identity?.uri ? { uri: identity.uri } : {}),
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
  schemaVersion: 1;
  runId: string;
  runUri: ResourceUri<'run'>;
  evalId: string;
  evalUri: ResourceUri<'eval'>;
  /** Canonical suite membership when this eval was invoked through a suite. */
  suiteId?: string;
  suiteUri?: ResourceUri<'suite'>;
  aut?: AutIdentity;
  startedAt: string;
};

export type TrialMetadata = {
  schemaVersion: 1;
  runId: string;
  runUri: ResourceUri<'run'>;
  trialId: string;
  trialUri: ResourceUri<'trial'>;
  trialIndex: number;
  evalId: string;
  evalUri: ResourceUri<'eval'>;
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
  evalUri: ResourceUri<'eval'>;
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
  evalId?: string;
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
