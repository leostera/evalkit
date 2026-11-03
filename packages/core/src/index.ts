import { authorId, type ResourceUri } from './identity.js';
import { isDataset, type Dataset, type DatasetVisibility } from './dataset.js';
import type { AutEventInput, TurnResult } from './aut-events.js';
import { toJsonObject } from './json.js';
import { assertNoRemovedOptions } from './upgrade.js';
import {
  catalogEntry,
  type CatalogOptions,
  type EvalCatalogEntry,
} from './catalog.js';
import { internalModule, markDefinitionSite } from './definition-site.js';

internalModule(import.meta.url);
import type { CriterionResult, JudgeAnswer } from './judge.js';
export {
  choices,
  criteria,
  passMark,
  type CriterionResult,
  type JudgeAnswer,
  type JudgeChoice,
  type JudgeCriterion,
} from './judge.js';
export {
  DEFAULT_ARTIFACT_EXCLUDE,
  DEFAULT_ATTACHMENT_LIMITS,
  defineConfig,
  type AttachmentLimits,
  type EvalkitConfig,
  type KeepSandboxes,
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

export { turnTokens, type Usage } from './usage.js';
import type { Usage } from './usage.js';

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
      /** The model that answered this turn, when the agent knows it. */
      model?: string;
    }
  | { kind: 'completed'; output?: JsonValue; timestamp: string }
  | { kind: 'error'; error: RecordedError; timestamp: string };

export type RunnerEvent =
  | { kind: 'run-started'; timestamp: string }
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
  | { kind: 'run-completed'; timestamp: string }
  | { kind: 'error'; error: RecordedError; timestamp: string };

export type TrajectoryEvent =
  (AutEvent & { source: 'aut' }) | (RunnerEvent & { source: 'runner' });

export type WorkspaceView = {
  /** Absolute path to this run-scoped workspace. Do not persist it in reports. */
  root: string;
};

export type CandidateWorkspace = WorkspaceView;
export type EvaluatorWorkspace = WorkspaceView;

export type AutContext = {
  runId: string;
  evalId: string;
  /** Set when this run is one of several repeats launched together. */
  batch?: Batch;
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
    /**
     * Saves a file with the run's results, such as the agent's raw log,
     * whether or not its sandbox is kept. `name` is a relative path of
     * letters, digits, `.`, `_` and `-` (`logs/agent.log`); each name once.
     * A file over the size limit keeps its last bytes; past the run's
     * total limit it is rejected. See `artifacts.attachments` in the config.
     */
    attach: (name: string, content: string | Uint8Array) => Promise<void>;
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
  /** The run's random seed (also in `context.metadata.randomSeed`). */
  seed: number;
  /** Set when this run is one of several repeats launched together. */
  batch?: Batch;
};

export type UserStep = {
  kind: 'user';
  /** A fixed message, or one computed for each run. */
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
 * A user message. Pass a function to compute it for each run, e.g. from a
 * matrix axis: `user(({ parameters }) => `Set up OCaml with ${parameters.toolchain}.`)`.
 */
export function user(message: UserStep['message']): UserStep {
  return { kind: 'user', message };
}

export function agent(expectation: JsonObject): AgentStep {
  return { kind: 'agent', expectation };
}

/**
 * What a judge saw and said. The built-in `judge()` records all of it; a
 * predicate that calls a model itself can report `model`, `prompt` and
 * `reply` so the dashboard shows them the same way.
 */
export type JudgeRunInfo = {
  agent?: AutIdentity;
  /** The model the judge reported using (`turn-completed` `model`). */
  model?: string;
  /** Tokens the judge used: never counted in the agent's `tokens`. */
  usage?: Usage;
  /** The exact prompt the judge received. */
  prompt?: string;
  /** Its reply, as text or JSON. */
  reply?: JsonValue;
  /** 2 when its first reply was not in the format asked for and it was asked again. */
  attempts?: number;
  /** Judge-agent observations; never attributed to the AUT trajectory. */
  events?: JsonValue[];
};

/** A scorer's "does not apply" result; see `skip()`. */
export type SkippedScore = { skipped: true; reason: string };

export type ScoreValue<Evidence = unknown> =
  | number
  | SkippedScore
  | {
      /** From 0 to 1. Without it, the weighted mean of `criteria`. */
      value?: number;
      passed?: boolean;
      explanation?: string;
      /**
       * Any JSON-convertible value: what the scorer observed. A checkpoint's
       * evidence reaches later scorers through `checkpoint(rule)`.
       */
      evidence?: Evidence;
      /** Per-criterion values, shown on the run page; see `CriterionResult`. */
      criteria?: CriterionResult[];
      /** What a model-backed scorer saw and said; never counted as AUT usage. */
      judge?: JudgeRunInfo;
    };

/**
 * Marks a scorer as not applicable to this run. A skipped result neither
 * passes nor fails the run and is left out of score averages.
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
  /** The pass mark the value was held to (1 unless the rule set `passAt`). */
  passAt?: number;
  explanation?: string;
  evidence?: JsonValue;
  /** A `choices` judge's answer, such as `B`. */
  choice?: string;
  criteria?: CriterionResult[];
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
  /**
   * Results of the transcript's checkpoints so far, in order: all of them for
   * final scorers. A checkpoint's `evidence` can carry what it observed (for
   * example, in a container that is gone by final scoring).
   */
  checkpoints: readonly CheckpointResult[];
  /**
   * The latest result of a checkpoint in this scenario's transcript, looked
   * up by the rule itself, so renaming it cannot break the lookup. A
   * predicate's `evidence` keeps its type. Undefined until that step has
   * run; throws for a rule that is not in the transcript.
   */
  checkpoint<Evidence>(
    rule: PredicateScorer<Evidence>,
  ): CheckpointOutcome<Evidence> | undefined;
  checkpoint(
    rule: JudgeRule | ExpectToolCallStep,
  ): CheckpointOutcome<JsonValue> | undefined;
  /**
   * Saves a file with the run's results, like the agent's `attach()`: for
   * example a container's log, or a file the agent reported, read before the
   * workspace is gone. Same names, limits and rules.
   */
  attach(name: string, content: string | Uint8Array): Promise<void>;
};

/**
 * A checkpoint's result with typed evidence. Evidence is saved as JSON, so
 * it arrives as its JSON form: a `Date` becomes a string, `undefined` fields
 * are dropped.
 */
export type CheckpointOutcome<Evidence> = Omit<CheckpointResult, 'evidence'> & {
  evidence?: Evidence;
};

export type PredicateScorer<Evidence = unknown> = {
  kind: 'predicate';
  name: string;
  /** What it checks, in a sentence, shown wherever the scorer is. */
  description?: string;
  supportsPartial?: boolean;
  /** A numeric result passes when it is at least this value. Default: only 1 passes. */
  passAt?: number;
  run(
    context: ScoringContext,
  ): boolean | ScoreValue<Evidence> | Promise<boolean | ScoreValue<Evidence>>;
};

/** What a judge sees: one named input, read from the run. */
export type JudgeInput = (
  scoring: ScoringContext,
) => JsonValue | undefined | Promise<JsonValue | undefined>;

/**
 * A rubric-graded scorer. EvalKit builds the prompt from the rubric, the
 * inputs and the answer format, runs the judge agent, checks its answer
 * (asking once more if it is not in the format asked for), and records
 * what it saw and said.
 */
export type JudgeRule = {
  kind: 'judge';
  name: string;
  rubric: string;
  /** What it checks, in a sentence, shown wherever the judge is. */
  description?: string;
  /**
   * The agent that judges, made with `defineAgent()`. Default: `judge` in
   * evalkit.config.ts. It gets the run's parameters, so a matrix axis can
   * choose its model.
   */
  agent?: AutAdapter;
  /**
   * What the judge sees, by name. Default: `conversation` (this turn at a
   * checkpoint, the whole run in final scoring) and `reply` (the last reply).
   */
  inputs?: Readonly<Record<string, JudgeInput>>;
  /** How it answers. Default `verdict`: a value from 0 to 1 and a reason. */
  answer: JudgeAnswer;
  /** A value passes when it is at least this. Default: only 1 passes. */
  passAt?: number;
  /** Run even when the scenario stopped early or execution failed. */
  supportsPartial?: boolean;
};

export type ScoringRule = PredicateScorer | JudgeRule;

/** A scorer in code. Its `evidence` type carries through to `checkpoint(rule)`. */
export function predicate<Evidence = unknown>(
  name: string,
  run: PredicateScorer<Evidence>['run'],
  options: Pick<
    PredicateScorer,
    'supportsPartial' | 'passAt' | 'description'
  > = {},
): PredicateScorer<Evidence> {
  if (!name.trim()) throw new Error('Predicate name must not be empty');
  assertPassAt(`Predicate ${name}`, options.passAt);
  return markDefinitionSite({ kind: 'predicate', name, run, ...options });
}

/**
 * A number measured for every run, such as tokens, retries or web searches.
 * Metrics never decide pass or fail; they are averaged per run and shown on
 * the scoreboard. Return undefined when there is nothing to measure.
 */
export type Metric = {
  kind: 'metric';
  name: string;
  /** Shown next to values: `ms` formats as a duration, others as numbers. */
  unit?: string;
  /** Which direction is an improvement, for comparisons. */
  better?: 'lower' | 'higher';
  run(
    context: ScoringContext,
  ): number | undefined | Promise<number | undefined>;
};

/** A built-in metric's name is a type error here, as well as at definition time. */
export function metric<const Name extends string>(
  name: Name extends BuiltInMetricName ? never : Name,
  run: Metric['run'],
  options: Pick<Metric, 'unit' | 'better'> = {},
): Metric {
  if (!name.trim()) throw new Error('Metric name must not be empty');
  return markDefinitionSite({ kind: 'metric', name, run, ...options });
}

/** A metric's value for one run. */
export type MetricResult = {
  name: MetricName;
  /** Absent when the metric measured nothing or failed. */
  value?: number;
  unit?: string;
  better?: 'lower' | 'higher';
  /** Measured by EvalKit itself (agent time, tokens, tool calls). */
  builtIn?: true;
  error?: RecordedError;
};

const INPUT_NAME = /^[a-z][a-zA-Z0-9_-]{0,31}$/;

export function judge(
  name: string,
  options: Omit<JudgeRule, 'kind' | 'name' | 'answer'> & {
    answer?: JudgeAnswer;
  },
): JudgeRule {
  if (!name.trim() || !options.rubric?.trim())
    throw new Error('Judge name and rubric must not be empty');
  assertPassAt(`Judge ${name}`, options.passAt);
  for (const input of Object.keys(options.inputs ?? {}))
    if (!INPUT_NAME.test(input))
      throw new Error(
        `Judge ${name} input ${JSON.stringify(input)} must start with a lowercase letter and use letters, digits, "-" or "_"`,
      );
  if (options.inputs && !Object.keys(options.inputs).length)
    throw new Error(`Judge ${name} inputs must name at least one input`);
  if (options.agent && typeof options.agent.start !== 'function')
    throw new Error(`Judge ${name} agent must be made with defineAgent()`);
  return markDefinitionSite({
    kind: 'judge',
    name,
    ...options,
    answer: options.answer ?? { kind: 'verdict' },
  });
}

function assertPassAt(owner: string, passAt: number | undefined): void {
  if (
    passAt !== undefined &&
    !(Number.isFinite(passAt) && passAt >= 0 && passAt <= 1)
  )
    throw new Error(
      `${owner} passAt must be a number from 0 to 1; received ${passAt}`,
    );
}

export type EvalPolicy = {
  timeoutMs?: number;
  /** Stop later transcript steps after a failed checkpoint assertion. Default false. */
  failfast?: boolean;
};

export type EvalDefinition<TAgent extends AutAdapter = AutAdapter> = {
  id: string;
  name?: string;
  agent: TAgent;
  /** Data and files the scenario uses; each run gets its own copy. */
  datasets?: readonly Dataset[];
  transcript: TranscriptStep[];
  scoring: ScoringRule[];
  /** Numbers to measure for every run; they never affect pass or fail. */
  metrics?: readonly Metric[];
  policy?: EvalPolicy;
  /**
   * How many runs to start each time the scenario runs, as one batch: repeats
   * under identical conditions, to see how often it passes. Default 1.
   */
  repeat?: number;
  /** Any JSON-convertible object; converted when the eval is defined. */
  metadata?: Record<string, unknown>;
  workspace?: EvalWorkspace;
};

/** How EvalKit treats this scenario's candidate workspace. */
export type EvalWorkspace = {
  /**
   * Paths to leave out of the run's snapshot, read like `.gitignore`: globs
   * relative to the workspace, where a pattern without `/` matches that name
   * at any depth and later patterns win. They come after the project's
   * `artifacts.exclude` (default `DEFAULT_ARTIFACT_EXCLUDE`), so `!pattern`
   * can keep a path the project leaves out, even inside an ignored directory:
   * `['!_build/doc/**']` keeps generated docs while dropping the rest of `_build`.
   */
  ignore?: readonly string[];
};

export function defineEval<const T extends EvalDefinition>(definition: T): T {
  authoringId(definition);
  assertNoRemovedOptions(definition);
  if (definition.metadata !== undefined)
    toJsonObject(definition.metadata, `${definition.id}.metadata`);
  for (const [index, pattern] of (definition.workspace?.ignore ?? []).entries())
    if (typeof pattern !== 'string' || pattern.replace(/^!/, '').trim() === '')
      throw new Error(
        `Eval ${definition.id} workspace.ignore[${index}] must be a non-empty glob, got ${JSON.stringify(pattern)}`,
      );
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
  const metricNames = new Set<string>(BUILT_IN_METRICS);
  for (const [index, entry] of (definition.metrics ?? []).entries()) {
    if (entry?.kind !== 'metric')
      throw new Error(
        `Eval ${definition.id} metrics[${index}] is not a metric; create it with metric(...)`,
      );
    if (metricNames.has(entry.name))
      throw new Error(
        `Eval ${definition.id} has more than one metric named ${entry.name} (built-in: ${BUILT_IN_METRICS.join(', ')})`,
      );
    metricNames.add(entry.name);
  }
  let hasUser = false;
  for (const step of definition.transcript) {
    if (step.kind === 'user') hasUser = true;
    else if (step.kind !== 'agent' && !hasUser)
      throw new Error('Checkpoint requires a preceding user step');
  }
  assertJudgesIndependent(definition);
  return markDefinitionSite(definition);
}

/** A judge never grades with the agent it is judging. */
export function assertJudgesIndependent(
  definition: Pick<EvalDefinition, 'agent' | 'transcript' | 'scoring'> & {
    id: string;
  },
  defaultJudge?: AutAdapter,
): void {
  for (const rule of [...definition.transcript, ...definition.scoring])
    if (
      rule.kind === 'judge' &&
      (rule.agent ?? defaultJudge) === definition.agent
    )
      throw new Error(
        `Judge ${rule.name} in ${definition.id} uses the agent under test; a judge needs its own agent`,
      );
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

/**
 * How a run ended: `passed` or `failed` by its scores, `errored` when it could
 * not finish (the agent, a dataset or EvalKit failed), `cancelled` by Ctrl+C.
 */
export type RunStatus =
  'running' | 'passed' | 'failed' | 'errored' | 'cancelled';

/** Runs launched together as repeats of one configuration (`repeat`). */
export type Batch = {
  id: string;
  /** Zero-based position in the batch. */
  index: number;
  size: number;
};

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
  schemaVersion: 6;
  runId: string;
  runUri: ResourceUri<'run'>;
  evalId: string;
  suiteId?: string;
  parameters?: JsonObject;
  matrix?: { id: string; cellKey: string };
  aut?: AutIdentity;
  startedAt: string;
  /** Present when the run's commit could be determined. */
  source?: RunSource;
  process?: RunProcess;
  /** Set when this run is one of several repeats launched together. */
  batch?: Batch;
  /** The effective snapshot ignore patterns: the project's `artifacts.exclude`, then the scenario's `workspace.ignore`. */
  workspaceIgnore?: string[];
  /** The datasets this run used, with content digests. */
  datasets?: RunDataset[];
};

export type RunDataset = {
  id: string;
  visibility: DatasetVisibility;
  source: 'static' | 'computed';
  /** SHA-256 of the run's content: file paths and bytes, and the canonical value. */
  digest: string;
};

export type CheckpointResult = {
  step: number;
  kind: 'predicate' | 'judge' | 'expect-tool-call';
  name: string;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  value?: number;
  passed?: boolean;
  passAt?: number;
  explanation?: string;
  evidence?: JsonValue;
  choice?: string;
  criteria?: CriterionResult[];
  judge?: JudgeRunInfo;
  durationMs?: number;
  error?: RecordedError;
  matchedToolCall?: { eventIndex: number; id: string };
};

/**
 * Metrics EvalKit records for every run; scenario metrics may not reuse
 * these names.
 *
 * - `agent time` (ms): from the run's first event to its last one before
 *   final scoring.
 * - `tokens`: the sum of `turnTokens(usage)` over the turns that reported
 *   usage, cached input included. Absent when no turn reported any.
 * - `tool calls`: the agent's `tool-call` events.
 */
export const BUILT_IN_METRICS = [
  'agent time',
  'tokens',
  'tool calls',
  'judge tokens',
] as const;
export type BuiltInMetricName = (typeof BUILT_IN_METRICS)[number];
/** A built-in metric's name (suggested by editors), or a scenario's own. */
export type MetricName = BuiltInMetricName | (string & {});

export type RunScoring = {
  results: ScoreResult[];
  metrics?: MetricResult[];
  checkpoints?: CheckpointResult[];
  skippedScorers?: string[];
  overall?: number;
  passed: boolean;
};

export type ArtifactEntry = {
  /** Path relative to this run's artifact root. */
  path: string;
  kind: 'file' | 'directory';
  size?: number;
};

/** A file an adapter attached with `attach()`, saved as `artifacts/attachments/<name>`. */
export type AttachmentEntry = {
  name: string;
  /** Bytes saved. */
  size: number;
  /** The original size, when the file was cut to its last `maxFileBytes`. */
  truncatedFrom?: number;
};

export type RunSummary = {
  status: RunStatus;
  endedAt: string;
  durationMs?: number;
  scoring?: RunScoring;
  artifacts?: ArtifactEntry[];
  attachments?: AttachmentEntry[];
  error?: RecordedError;
};

export type RunWriter = {
  readonly location: string;
  appendEvent(event: TrajectoryEvent): Promise<void>;
  writeScores(scoring: RunScoring): Promise<void>;
  /** Writes a file below this run's artifact root. */
  writeArtifact(path: string, data: Uint8Array): Promise<void>;
  finalize(summary: RunSummary): Promise<void>;
};

export type ReportStore = {
  startRun(
    metadata: RunMetadata,
    context?: { catalog?: RunCatalog },
  ): Promise<RunWriter>;
};

/** One finished run, as `runEval` returns it. */
export type RunResult = {
  runId: string;
  runUri: ResourceUri<'run'>;
  evalId: string;
  status: RunStatus;
  batch?: Batch;
  reportLocation: string;
  durationMs?: number;
  scoring?: RunScoring;
  error?: RecordedError;
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
