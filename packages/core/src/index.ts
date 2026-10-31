import { authorId, type ResourceUri } from './identity.js';
import { isDataset, type Dataset, type DatasetVisibility } from './dataset.js';
import type { AutEventInput, TurnResult } from './aut-events.js';
import { toJsonObject } from './json.js';
import {
  catalogEntry,
  type CatalogOptions,
  type EvalCatalogEntry,
} from './catalog.js';
import { internalModule, markDefinitionSite } from './definition-site.js';

internalModule(import.meta.url);
export {
  defineConfig,
  type EvalkitConfig,
  type ShareConfig,
  type ShareHeaders,
} from './config.js';

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
  | {
      kind: 'transcript-step-started';
      step: number;
      /** The user message sent at this step; absent for checkpoints. */
      message?: string;
      timestamp: string;
    }
  | { kind: 'transcript-step-completed'; step: number; timestamp: string }
  | { kind: 'transcript-step-skipped'; step: number; timestamp: string }
  | {
      kind: 'checkpoint-started';
      step: number;
      name: string;
      timestamp: string;
    }
  | {
      kind: 'checkpoint-completed';
      step: number;
      status: 'passed' | 'failed' | 'skipped';
      timestamp: string;
    }
  | {
      kind: 'checkpoint-error';
      step: number;
      error: RecordedError;
      timestamp: string;
    }
  | { kind: 'scorer-started'; scorer: string; timestamp: string }
  | {
      kind: 'scorer-completed';
      scorer: string;
      /** Absent when the scorer returned `skip()`. */
      value?: number;
      skipped?: true;
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
  /** Values of the scenario's candidate datasets, by dataset ID. */
  data: JsonObject;
  /** Contains only resources visible to the AUT/model. */
  workspace: CandidateWorkspace;
  /** Private evaluator capability for trusted AUT adapters; never expose this to the model. */
  evaluatorWorkspace: EvaluatorWorkspace;
};

export type AutAdapter<TMessage = string> = {
  readonly identity?: AutIdentity;
  /** Available execution environments for this AUT. Default: `{ local: { kind: 'in-process' } }`. */
  readonly runtimes?: AgentRuntimes;
  start(options: {
    context: AutContext;
    runtime?: AgentRuntime;
    /** Optional: stream events as they happen. Returning a turn result from `send` is enough for most agents. */
    onEvent: (event: AutEventInput) => void | Promise<void>;
  }): Promise<AutSession<TMessage>>;
};

export type AutSession<TMessage = string> = {
  /**
   * Resolves once the AUT has completed the turn initiated by this message.
   * It may return the turn's reply and tool calls instead of emitting events.
   */
  send(message: TMessage): Promise<void | TurnResult>;
  /** Optional; defaults to doing nothing. */
  close?(): Promise<void>;
};

/** Used when an agent declares no runtimes. */
export const DEFAULT_AGENT_RUNTIMES: AgentRuntimes = {
  local: { kind: 'in-process' },
};

/** The runtimes an agent can run in, applying the default. */
export function agentRuntimes(agent: AutAdapter<any>): AgentRuntimes {
  return agent.runtimes && Object.keys(agent.runtimes).length
    ? agent.runtimes
    : DEFAULT_AGENT_RUNTIMES;
}

/**
 * Defines an Agent Under Test without coupling it to a runtime or transport.
 * It preserves the adapter's concrete type for application-specific helpers.
 */
export function defineAgent<const T extends AutAdapter>(agent: T): T {
  if (agent.identity) authoringId(agent.identity);
  return markDefinitionSite(agent);
}

/** What a computed user message may depend on: only what the agent is given too. */
export type UserMessageInput = {
  /** The matrix cell's parameters and CLI overrides. */
  parameters: JsonObject;
  /** Values of the scenario's candidate datasets, by dataset ID (never evaluator ones). */
  data: JsonObject;
  /** The trial's random seed (also in `context.metadata.randomSeed`). */
  seed: number;
  trialIndex: number;
};

export type UserStep = {
  kind: 'user';
  /** A fixed message, or one computed for each trial. */
  message: string | ((input: UserMessageInput) => string);
};

export type AgentStep = {
  kind: 'agent';
  expectation: JsonObject;
};

export type TurnView = {
  userStepIndex: number;
  events: readonly (AutEvent & { source: 'aut' })[];
  assistantMessages: readonly (Extract<AutEvent, { kind: 'message' }> & {
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

export type ExpectToolCallStep = {
  kind: 'expect-tool-call';
  name: string;
  expected: { name: string; arguments?: JsonValue };
};
export type TranscriptStep =
  UserStep | AgentStep | ScoringRule | ExpectToolCallStep;

/** Observes a tool call in the preceding turn; never invokes a tool. */
export function expectToolCall(
  expected: ExpectToolCallStep['expected'],
): ExpectToolCallStep {
  if (!expected.name.trim())
    throw new Error('Expected tool name must not be empty');
  return { kind: 'expect-tool-call', name: expected.name, expected };
}

/**
 * A user message. Pass a function to compute it for each trial, e.g. from a
 * matrix axis: `user(({ parameters }) => `Set up OCaml with ${parameters.toolchain}.`)`.
 */
export function user(message: UserStep['message']): UserStep {
  return { kind: 'user', message };
}

export function agent(expectation: JsonObject): AgentStep {
  return { kind: 'agent', expectation };
}

export type JudgeRunInfo = {
  agent?: AutIdentity;
  usage?: Usage;
  /** Judge-agent observations; never attributed to the AUT trajectory. */
  events?: JsonValue[];
};

/** A scorer's "does not apply" result; see `skip()`. */
export type SkippedScore = { skipped: true; reason: string };

export type ScoreValue =
  | number
  | SkippedScore
  | {
      value: number;
      passed?: boolean;
      explanation?: string;
      /** Any JSON-convertible value. */
      evidence?: unknown;
      /** Judge-agent evidence, never inferred from AUT usage. */
      judge?: JudgeRunInfo;
    };

/**
 * Marks a scorer as not applicable to this trial. A skipped result neither
 * passes nor fails the trial and is left out of score averages.
 */
export function skip(reason: string): SkippedScore {
  if (!reason.trim()) throw new Error('skip() needs a reason');
  return { skipped: true, reason };
}

export type ScoreResult = {
  name: string;
  kind: 'predicate' | 'judge';
  value?: number;
  passed?: boolean;
  explanation?: string;
  evidence?: JsonValue;
  judge?: JudgeRunInfo;
  durationMs: number;
  error?: RecordedError;
  /** The scorer returned `skip()`; `explanation` holds the reason and there is no value. */
  skipped?: true;
};

export type ArtifactView = {
  candidate: CandidateWorkspace;
  evaluator: EvaluatorWorkspace;
};

export type ScoringContext = {
  context: AutContext;
  trajectory: { events: readonly TrajectoryEvent[] };
  artifacts: ArtifactView;
  /** Most recent completed turn; absent if no user message has been sent. */
  turn?: TurnView;
  /** Content of the last assistant message of `turn`. */
  output?: JsonValue;
  /** Values of all the scenario's datasets (candidate and evaluator), by dataset ID. */
  data: JsonObject;
};

export type PredicateScorer = {
  kind: 'predicate';
  name: string;
  supportsPartial?: boolean;
  /** A numeric result passes when it is at least this value. Default: only 1 passes. */
  passAt?: number;
  run(
    context: ScoringContext,
  ): boolean | ScoreValue | Promise<boolean | ScoreValue>;
};

export type JudgeRule = {
  kind: 'judge';
  name: string;
  rubric: string;
  /** Run even when the scenario stopped early or execution failed. */
  supportsPartial?: boolean;
};

export type ScoringRule = PredicateScorer | JudgeRule;

export function predicate(
  name: string,
  run: PredicateScorer['run'],
  options: Pick<PredicateScorer, 'supportsPartial' | 'passAt'> = {},
): PredicateScorer {
  if (!name.trim()) throw new Error('Predicate name must not be empty');
  if (
    options.passAt !== undefined &&
    !(
      Number.isFinite(options.passAt) &&
      options.passAt >= 0 &&
      options.passAt <= 1
    )
  )
    throw new Error(
      `Predicate ${name} passAt must be a number from 0 to 1; received ${options.passAt}`,
    );
  return markDefinitionSite({ kind: 'predicate', name, run, ...options });
}

export function judge(
  name: string,
  options: Pick<JudgeRule, 'rubric' | 'supportsPartial'>,
): JudgeRule {
  if (!name.trim() || !options.rubric.trim())
    throw new Error('Judge name and rubric must not be empty');
  return markDefinitionSite({ kind: 'judge', name, ...options });
}

export type EvalPolicy = {
  timeoutMs?: number;
  /** Stop later transcript steps after a failed checkpoint assertion. Default false. */
  failfast?: boolean;
  /** Number of independent trials requested by local and hosted runners. */
  trials?: number;
};

export type EvalDefinition<TAgent extends AutAdapter = AutAdapter> = {
  id: string;
  name?: string;
  agent: TAgent;
  /** Separate judge agent; its model and tools are never inherited from the AUT. */
  judge?: AutAdapter;
  /** Data and files the scenario uses; each trial gets its own copy. */
  datasets?: readonly Dataset[];
  transcript: TranscriptStep[];
  scoring: ScoringRule[];
  policy?: EvalPolicy;
  /** Any JSON-convertible object; converted when the eval is defined. */
  metadata?: Record<string, unknown>;
};

export function defineEval<const T extends EvalDefinition>(definition: T): T {
  authoringId(definition);
  if ('fixtures' in definition)
    throw new Error(
      `Eval ${definition.id} uses fixtures, which were replaced by datasets: [defineDataset(...)]`,
    );
  if (definition.metadata !== undefined)
    toJsonObject(definition.metadata, `${definition.id}.metadata`);
  const datasetIds = new Set<string>();
  for (const [index, dataset] of (definition.datasets ?? []).entries()) {
    if (!isDataset(dataset))
      throw new Error(
        `Eval ${definition.id} datasets[${index}] is not a dataset; create it with defineDataset(...)`,
      );
    if (datasetIds.has(dataset.id))
      throw new Error(
        `Eval ${definition.id} uses dataset ${dataset.id} more than once`,
      );
    datasetIds.add(dataset.id);
  }
  let hasUser = false;
  for (const step of definition.transcript) {
    if (step.kind === 'user') hasUser = true;
    else if (step.kind !== 'agent' && !hasUser)
      throw new Error('Checkpoint requires a preceding user step');
  }
  if (
    (definition.transcript.some((step) => step.kind === 'judge') ||
      definition.scoring.some((rule) => rule.kind === 'judge')) &&
    !definition.judge
  )
    throw new Error('Judge rules require an eval judge agent');
  if (definition.judge && definition.judge === definition.agent)
    throw new Error('Judge agent must be distinct from the agent under test');
  return markDefinitionSite(definition);
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
  /** Definition data for the dashboard; pass the project root to include where each thing is defined. */
  catalog(options?: CatalogOptions): EvalCatalogEntry[];
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
      if (suiteById.has(id))
        throw new Error(`Eval registry contains duplicate suite ID: ${id}`);
      suiteById.set(id, suite);
    }
    const evaluations: readonly EvalDefinition[] = suite
      ? suite.evals
      : [registration as EvalDefinition];
    for (const evaluation of evaluations) {
      const id = authoringId(evaluation);
      if (byId.has(id))
        throw new Error(`Eval registry contains duplicate eval ID: ${id}`);
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
    catalog: (options) =>
      evals.map((evaluation) =>
        catalogEntry(
          evaluation,
          suiteIdByEvalId.get(authoringId(evaluation)),
          options,
        ),
      ),
  };
}

export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Where a run's eval code came from: the repository, eval project and commit.
 * Results are tagged with it; they are never stored in the repository itself.
 */
export type RunSource = {
  /** Normalized repository key, e.g. `gitlab.example.com/group/repo`. */
  repo: string;
  /** Eval project directory relative to the repository root; `""` at the root. */
  project: string;
  /** Full commit SHA. */
  commit: string;
  ref?: string;
  committedAt?: string;
  /** True when the working tree had uncommitted changes at run time. */
  dirty: boolean;
  ci?: { provider: string; pipeline?: string; job?: string; url?: string };
};

/** The project's evals and suites when a run started; written beside its manifest. */
export type RunCatalog = {
  catalog: EvalCatalogEntry[];
  evals: EvalRegistryMetadata[];
  suites: EvalSuiteMetadata[];
};

/** The process that owns a running run, so readers can tell an interrupted run from a live one. */
export type RunProcess = { pid: number; hostname: string };

export type RunMetadata = {
  schemaVersion: 2 | 3 | 4 | 5;
  runId: string;
  runUri: ResourceUri<'run'>;
  evalId: string;
  suiteId?: string;
  parameters?: JsonObject;
  matrix?: { id: string; cellKey: string };
  aut?: AutIdentity;
  startedAt: string;
  /** Present from schema version 4 when the run's commit could be determined. */
  source?: RunSource;
  /** From schema version 5. */
  process?: RunProcess;
};

export type TrialMetadata = {
  schemaVersion: 2 | 3 | 4 | 5;
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
  /** From schema version 5: the datasets this trial used, with content digests. */
  datasets?: TrialDataset[];
};

export type TrialDataset = {
  id: string;
  visibility: DatasetVisibility;
  source: 'static' | 'computed';
  /** SHA-256 of the trial's content: file paths and bytes, and the canonical value. */
  digest: string;
};

export type CheckpointResult = {
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
  matchedToolCall?: { eventIndex: number; id: string };
};

export type TrialScoring = {
  results: ScoreResult[];
  checkpoints?: CheckpointResult[];
  skippedScorers?: string[];
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
  /** Trials stopped by cancellation; counted neither as passed nor failed. */
  cancelled?: number;
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
  startRun(
    metadata: RunMetadata,
    context?: { catalog?: RunCatalog },
  ): Promise<RunWriter>;
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
  cancelled?: number;
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
export * from './dataset.js';
export * from './aut-events.js';
export * from './json.js';
export * from './catalog.js';
export { definitionSite, type DefinitionSite } from './definition-site.js';
export * from './schema.js';
export * from './trajectory.js';

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
