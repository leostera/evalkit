import type { Dataset, DatasetVisibility } from './dataset.js';
import { definitionSite, relativeSite } from './definition-site.js';
import {
  agentRuntimes,
  authoringId,
  type AgentRuntimeName,
  type AutAdapter,
  type EvalDefinition,
  type EvalSuite,
  type JsonValue,
  type ScoringRule,
  type TranscriptStep,
} from './index.js';
import { toJson } from './json.js';

/**
 * What the dashboard's Library shows about each definition. Only definition
 * data: names, kinds, settings, shapes and where it was defined. Never source
 * code, and never dataset values (evaluator data must not reach the agent's
 * side or a shared report), only their shape.
 */
export type CatalogOptions = {
  /** Project root; definition sites are reported relative to it, never absolute. */
  root?: string;
};

export type EvalCatalogAgent = {
  name?: string;
  kind: string;
  id?: string;
  version?: string;
  runtimes: Array<{ name: AgentRuntimeName; kind: string }>;
  /** `file:line` of its `defineAgent` call, relative to the project. */
  definedAt?: string;
};

/** A value's shape, without its content. */
export type ValueShape =
  | { type: 'array'; items: number }
  | { type: 'object'; keys: string[] }
  | { type: 'string' | 'number' | 'boolean' | 'null' };

export type EvalCatalogDataset = {
  id: string;
  name?: string;
  visibility: DatasetVisibility;
  source: 'static' | 'computed';
  mount: string;
  /** Static datasets: a directory relative to the project, or the workspace paths of inline files. */
  files?: { directory: string } | { paths: string[] };
  /** Static datasets: the inline value's shape, or the value file's path. */
  value?: { shape: ValueShape } | { file: string };
  /** Computed datasets: which hooks are defined. */
  hooks?: { onLoad: true; onRun: boolean };
  definedAt?: string;
};

export type EvalCatalogScorer = {
  name: string;
  kind: ScoringRule['kind'];
  passAt?: number;
  supportsPartial?: boolean;
  /** Judges only. */
  rubric?: string;
  definedAt?: string;
};

export type EvalCatalogStep =
  | { kind: 'user'; message: string }
  | { kind: 'agent'; expectation: JsonValue }
  | { kind: 'expect-tool-call'; name: string; arguments?: JsonValue }
  /** A predicate or judge checked at this point of the conversation. */
  | { kind: 'checkpoint'; scorer: EvalCatalogScorer };

export type EvalCatalogEntry = {
  id: string;
  path: string;
  name?: string;
  suiteId?: string;
  agent: EvalCatalogAgent;
  /** The separate agent that runs judge rules, if any. */
  judgeAgent?: EvalCatalogAgent;
  datasets: EvalCatalogDataset[];
  trialCount: number;
  policy: { trials: number; timeoutMs?: number; failfast?: boolean };
  transcript: EvalCatalogStep[];
  scorers: EvalCatalogScorer[];
  metadata?: JsonValue;
  /** `file:line` of its `defineEval` call, relative to the project. */
  definedAt?: string;
};

export function catalogEntry(
  evaluation: EvalDefinition,
  suite: EvalSuite | undefined,
  options: CatalogOptions = {},
): EvalCatalogEntry {
  const at = (value: unknown) =>
    relativeSite(definitionSite(value), options.root);
  const definedAt = at(evaluation);
  const judgeAgent = evaluation.judge
    ? catalogAgent(evaluation.judge, at)
    : undefined;
  const policy = evaluation.policy ?? {};
  return {
    id: evaluation.id,
    path: suite ? `${suite.id}#${evaluation.id}` : evaluation.id,
    ...(evaluation.name ? { name: evaluation.name } : {}),
    ...(suite ? { suiteId: authoringId(suite) } : {}),
    agent: catalogAgent(evaluation.agent, at),
    ...(judgeAgent ? { judgeAgent } : {}),
    datasets: (evaluation.datasets ?? []).map((dataset) =>
      catalogDataset(dataset, at),
    ),
    trialCount: policy.trials ?? 1,
    policy: {
      trials: policy.trials ?? 1,
      ...(policy.timeoutMs !== undefined
        ? { timeoutMs: policy.timeoutMs }
        : {}),
      ...(policy.failfast !== undefined ? { failfast: policy.failfast } : {}),
    },
    transcript: evaluation.transcript.map((step) => catalogStep(step, at)),
    scorers: evaluation.scoring.map((rule) => catalogScorer(rule, at)),
    ...(evaluation.metadata !== undefined
      ? { metadata: toJson(evaluation.metadata, `${evaluation.id}.metadata`) }
      : {}),
    ...(definedAt ? { definedAt } : {}),
  };
}

type At = (value: unknown) => string | undefined;

function catalogAgent(agent: AutAdapter, at: At): EvalCatalogAgent {
  const identity = agent.identity;
  const definedAt = at(agent);
  return {
    ...(identity?.name ? { name: identity.name } : {}),
    kind: identity?.kind ?? 'adapter',
    ...(identity?.id ? { id: identity.id } : {}),
    ...(identity?.version ? { version: identity.version } : {}),
    runtimes: Object.entries(agentRuntimes(agent)).map(([name, runtime]) => ({
      name: name as AgentRuntimeName,
      kind: runtime.kind,
    })),
    ...(definedAt ? { definedAt } : {}),
  };
}

function catalogDataset(dataset: Dataset, at: At): EvalCatalogDataset {
  const definedAt = at(dataset);
  const source = dataset.source;
  const base = {
    id: dataset.id,
    ...(dataset.name ? { name: dataset.name } : {}),
    visibility: dataset.visibility,
    source: source.kind,
    mount: dataset.mount,
    ...(definedAt ? { definedAt } : {}),
  };
  if (source.kind === 'computed')
    return { ...base, hooks: { onLoad: true, onRun: !!source.onRun } };
  return {
    ...base,
    ...(source.files === undefined
      ? {}
      : typeof source.files === 'string'
        ? { files: { directory: source.files } }
        : { files: { paths: Object.keys(source.files).sort() } }),
    ...(source.valueFile !== undefined
      ? { value: { file: source.valueFile } }
      : source.value !== undefined
        ? { value: { shape: shapeOf(source.value) } }
        : {}),
  };
}

function catalogScorer(rule: ScoringRule, at: At): EvalCatalogScorer {
  const definedAt = at(rule);
  return {
    name: rule.name,
    kind: rule.kind,
    ...(rule.kind === 'predicate' && rule.passAt !== undefined
      ? { passAt: rule.passAt }
      : {}),
    ...(rule.supportsPartial !== undefined
      ? { supportsPartial: rule.supportsPartial }
      : {}),
    ...(rule.kind === 'judge' ? { rubric: rule.rubric } : {}),
    ...(definedAt ? { definedAt } : {}),
  };
}

function catalogStep(step: TranscriptStep, at: At): EvalCatalogStep {
  switch (step.kind) {
    case 'user':
      return { kind: 'user', message: step.message };
    case 'agent':
      return { kind: 'agent', expectation: step.expectation };
    case 'expect-tool-call':
      return {
        kind: 'expect-tool-call',
        name: step.expected.name,
        ...(step.expected.arguments !== undefined
          ? { arguments: step.expected.arguments }
          : {}),
      };
    default:
      return { kind: 'checkpoint', scorer: catalogScorer(step, at) };
  }
}

function shapeOf(value: unknown): ValueShape {
  const json = toJson(value, 'dataset value');
  if (Array.isArray(json)) return { type: 'array', items: json.length };
  if (json === null) return { type: 'null' };
  if (typeof json === 'object')
    return { type: 'object', keys: Object.keys(json).sort() };
  return { type: typeof json as 'string' | 'number' | 'boolean' };
}
