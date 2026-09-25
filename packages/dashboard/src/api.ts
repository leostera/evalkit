export type EvalSummary = {
  id: string;
  name?: string;
  suiteId?: string;
};
export type CatalogEval = EvalSummary & {
  path: string;
  trialCount: number;
  agent: {
    name?: string;
    kind: string;
    id?: string;
    version?: string;
    runtimes: Array<{ name: string; kind: string }>;
  };
  fixtures: Array<{
    kind: string;
    source: string;
    destination?: string;
    visibility?: 'candidate' | 'evaluator';
  }>;
  scorers: Array<{ name: string; kind: string }>;
};
export type MatrixSummary = {
  id: string;
  parameters: Record<string, unknown[]>;
  trials?: number;
};
export type SuiteSummary = {
  id: string;
  name?: string;
  evalIds: string[];
};

export type RunSummary = {
  id: string;
  evalId: string;
  suiteId?: string;
  agent?: string;
  matrixId?: string;
  parameters?: Record<string, unknown>;
  /** Dashboard status: terminal runs are passed, failed, or errored. */
  status: 'running' | 'passed' | 'failed' | 'errored';
  startedAt: string;
  completedAt?: string;
  completedTrials: number;
  requestedTrials: number;
  score?: number;
  durationMs?: number;
};

export type WorkspaceEntry = {
  path: string;
  kind: 'file' | 'directory';
  size?: number;
};

export type CheckpointResult = {
  step: number;
  kind: 'check' | 'expect-tool-call';
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
    value?: number;
    passed?: boolean;
    explanation?: string;
    durationMs: number;
  }>;
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
  listCatalog(): Promise<CatalogEval[]>;
  getMatrix(): Promise<MatrixSummary | null>;
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
      throw new Error(`Dashboard request failed: ${response.status}`);
    return response.json() as Promise<T>;
  };

  return {
    async listCatalog() {
      return (await request<{ evals: CatalogEval[] }>('/v1/catalog')).evals;
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
          `/v1/runs/${encodeURIComponent(runId)}/trials/${encodeURIComponent(trialId)}/workspace/${filePath
            .split('/')
            .map(encodeURIComponent)
            .join('/')}`,
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
