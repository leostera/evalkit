import type {
  EvalCatalogAgent,
  EvalCatalogDataset,
  EvalCatalogEntry,
  EvalCatalogScorer,
  EvalCatalogStep,
  MetricResult,
} from '@evalkit/core';
export type { MetricResult };
export type EvalSummary = {
  id: string;
  name?: string;
  suiteId?: string;
};
export type LoadError = {
  file: string;
  suiteId?: string;
  error: { name: string; message: string };
};
export type CatalogAgent = EvalCatalogAgent;
export type CatalogScorer = EvalCatalogScorer;
export type CatalogStep = EvalCatalogStep;
export type CatalogDataset = EvalCatalogDataset;
/**
 * A scenario's definition data. Catalogs saved with older runs lack the newer
 * fields (transcript, policy, where things are defined), so they are optional.
 */
export type CatalogEval = EvalSummary &
  Pick<EvalCatalogEntry, 'path' | 'trialCount' | 'agent' | 'scorers'> &
  Partial<
    Pick<
      EvalCatalogEntry,
      | 'datasets'
      | 'judgeAgent'
      | 'policy'
      | 'transcript'
      | 'metadata'
      | 'definedAt'
    >
  >;

/** The repository and commit the dashboard shows. */
export type ProjectInfo = {
  /** Normalized repository key, e.g. `github.com/acme/agents`. */
  repo: string;
  /** The eval project's directory in the repository, when not at its root. */
  project?: string;
  commit: string;
  ref?: string;
  dirty?: boolean;
};

export type MatrixSummary = {
  id: string;
  parameters: Record<string, unknown[]>;
  trials?: number;
  /** Until the dashboard supports planner-backed cell listing, use the CLI for constrained sweeps. */
  constrained?: boolean;
  dimensions?: string[];
};
export type MatrixCellPage = {
  total: number;
  planned: number;
  cells: Array<{
    evalId: string;
    key: string;
    parameters: Record<string, unknown>;
  }>;
};
export type MatrixCellQuery = {
  evalIds: string[];
  query: string;
  offset: number;
  sort: string;
  direction: 'asc' | 'desc';
};
export type SuiteSummary = {
  id: string;
  name?: string;
  evalIds: string[];
};

export type RunMetric = {
  name: string;
  /** `ms` is a duration; other units print after the number. */
  unit?: string;
  better?: 'lower' | 'higher';
  builtIn?: true;
  mean?: number;
  count: number;
};

export type RunSummary = {
  id: string;
  evalId: string;
  suiteId?: string;
  agent?: string;
  matrixId?: string;
  cellKey?: string;
  parameters?: Record<string, unknown>;
  /** Dashboard status: terminal runs are passed, failed, errored, or cancelled. */
  status: 'running' | 'passed' | 'failed' | 'errored' | 'cancelled';
  /** Cancelled because its process stopped without finishing it. */
  interrupted?: true;
  startedAt: string;
  completedAt?: string;
  completedTrials: number;
  requestedTrials: number;
  score?: number;
  durationMs?: number;
  /** Each metric's mean over the run's trials (agent time, tokens, tool calls, and the scenario's own). */
  metrics?: RunMetric[];
  /** The eval is no longer in the project (`evalkit tidy`); hidden by default. */
  archived?: boolean;
  /** Repository and commit the run's eval code came from. */
  source?: {
    repo: string;
    project: string;
    commit: string;
    ref?: string;
    committedAt?: string;
    dirty: boolean;
  };
};

export type WorkspaceEntry = {
  path: string;
  kind: 'file' | 'directory';
  size?: number;
};

/** What can be browsed of a dataset; computed datasets only have files in trial workspaces. */
export type DatasetListing =
  | {
      kind: 'static';
      mount: string;
      files: Array<{ path: string; size: number }>;
    }
  | { kind: 'computed'; mount: string };

export type CheckpointResult = {
  step: number;
  kind: 'predicate' | 'judge' | 'expect-tool-call';
  name: string;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  value?: number;
  passed?: boolean;
  explanation?: string;
  error?: { name: string; message: string };
  matchedToolCall?: { eventIndex: number; id: string };
};

export type TrialSummary = {
  id: string;
  index: number;
  status: RunSummary['status'];
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  score?: number;
  scores: Array<{
    name: string;
    kind?: 'predicate' | 'judge';
    value?: number;
    passed?: boolean;
    explanation?: string;
    error?: { name: string; message: string };
    durationMs: number;
    /** The scorer returned skip(); `explanation` is the reason. */
    skipped?: true;
  }>;
  metrics?: MetricResult[];
  checkpoints?: CheckpointResult[];
  skippedScorers?: string[];
};

export type TrajectoryEvent = {
  source: 'aut' | 'runner';
  kind: string;
  timestamp: string;
  [key: string]: unknown;
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface DashboardApi {
  /** True for a static `evalkit build` snapshot, which cannot start runs. */
  readOnly?: boolean;
  listCatalog(): Promise<CatalogEval[]>;
  /** The repository and commit being shown; null when unknown. */
  getProject?(): Promise<ProjectInfo | null>;
  /** Eval files that failed to import in `evalkit dev`; absent elsewhere. */
  listLoadErrors?(): Promise<LoadError[]>;
  getMatrix(): Promise<MatrixSummary | null>;
  listMatrixCells(query: MatrixCellQuery): Promise<MatrixCellPage>;
  listEvals(): Promise<EvalSummary[]>;
  listSuites(): Promise<SuiteSummary[]>;
  listRuns(): Promise<RunSummary[]>;
  listTrials(runId: string): Promise<TrialSummary[]>;
  getTrialEvents(runId: string, trialId: string): Promise<TrajectoryEvent[]>;
  getTrial(
    runId: string,
    trialId: string,
  ): Promise<{ manifest: unknown; summary: unknown }>;
  listArtifacts(
    runId: string,
    trialId: string,
  ): Promise<Array<{ path: string; kind: string; size?: number }>>;
  listWorkspace(runId: string, trialId: string): Promise<WorkspaceEntry[]>;
  getWorkspaceFile(
    runId: string,
    trialId: string,
    path: string,
  ): Promise<Response>;
  listDatasetFiles(datasetId: string): Promise<DatasetListing>;
  getDatasetFile(datasetId: string, path: string): Promise<Response>;
  runEval(path: string, parameters?: Record<string, unknown>): Promise<void>;
  runSuite(suiteId: string): Promise<void>;
}

export function createHttpDashboardApi(options: {
  baseUrl: string;
  fetch?: FetchLike;
}): DashboardApi {
  const send = options.fetch ?? globalThis.fetch;
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await send(new URL(path, options.baseUrl), init);
    if (!response.ok)
      throw new Error(
        (await response.text()) ||
          `Dashboard request failed: ${response.status}`,
      );
    return response.json() as Promise<T>;
  };

  return {
    async listCatalog() {
      return (await request<{ evals: CatalogEval[] }>('/v1/catalog')).evals;
    },
    async getProject() {
      return (await request<{ project: ProjectInfo | null }>('/v1/project'))
        .project;
    },
    async listLoadErrors() {
      return (
        (await request<{ loadErrors?: LoadError[] }>('/v1/catalog'))
          .loadErrors ?? []
      );
    },
    async listMatrixCells(query) {
      const url = new URL('/v1/matrix/cells', options.baseUrl);
      for (const id of query.evalIds) url.searchParams.append('eval', id);
      url.searchParams.set('q', query.query);
      url.searchParams.set('offset', String(query.offset));
      url.searchParams.set('sort', query.sort);
      url.searchParams.set('direction', query.direction);
      return request<MatrixCellPage>(url.pathname + url.search);
    },
    async getMatrix() {
      return (await request<{ matrix: MatrixSummary | null }>('/v1/matrix'))
        .matrix;
    },
    async listEvals() {
      return (await request<{ evals: EvalSummary[] }>('/v1/evals')).evals;
    },
    async listSuites() {
      return (await request<{ suites: SuiteSummary[] }>('/v1/suites')).suites;
    },
    async listRuns() {
      return (await request<{ runs: RunSummary[] }>('/v1/runs')).runs;
    },
    async listTrials(runId) {
      return (
        await request<{ trials: TrialSummary[] }>(
          `/v1/runs/${encodeURIComponent(runId)}/trials`,
        )
      ).trials;
    },
    async getTrial(runId, trialId) {
      return request(
        `/v1/runs/${encodeURIComponent(runId)}/trials/${encodeURIComponent(trialId)}`,
      );
    },
    async listArtifacts(runId, trialId) {
      return (
        await request<{
          artifacts: Array<{ path: string; kind: string; size?: number }>;
        }>(
          `/v1/runs/${encodeURIComponent(runId)}/trials/${encodeURIComponent(trialId)}/artifacts`,
        )
      ).artifacts;
    },
    async listWorkspace(runId, trialId) {
      return request<WorkspaceEntry[]>(
        `/v1/runs/${encodeURIComponent(runId)}/trials/${encodeURIComponent(trialId)}/workspace`,
      );
    },
    async getWorkspaceFile(runId, trialId, filePath) {
      const response = await send(
        new URL(
          `/v1/runs/${encodeURIComponent(runId)}/trials/${encodeURIComponent(trialId)}/workspace/${encodePath(filePath)}`,
          options.baseUrl,
        ),
      );
      if (!response.ok)
        throw new Error(`Dashboard request failed: ${response.status}`);
      return response;
    },
    async listDatasetFiles(datasetId) {
      return request<DatasetListing>(
        `/v1/datasets/${encodeURIComponent(datasetId)}/files`,
      );
    },
    async getDatasetFile(datasetId, filePath) {
      const response = await send(
        new URL(
          `/v1/datasets/${encodeURIComponent(datasetId)}/files/${encodePath(filePath)}`,
          options.baseUrl,
        ),
      );
      if (!response.ok)
        throw new Error(`Dashboard request failed: ${response.status}`);
      return response;
    },
    async getTrialEvents(runId, trialId) {
      return (
        await request<{ events: TrajectoryEvent[] }>(
          `/v1/runs/${encodeURIComponent(runId)}/trials/${encodeURIComponent(trialId)}/events`,
        )
      ).events;
    },
    async runEval(path, parameters) {
      await request('/v1/runs', {
        method: 'POST',
        body: JSON.stringify({ path, ...(parameters ? { parameters } : {}) }),
        headers: { 'content-type': 'application/json' },
      });
    },
    async runSuite(suiteId) {
      await request(`/v1/suites/${encodeURIComponent(suiteId)}/runs`, {
        method: 'POST',
      });
    },
  };
}

/** Encodes each segment of a relative file path for a URL. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
