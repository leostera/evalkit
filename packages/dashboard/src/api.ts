export type EvalSummary = { id: string; name?: string; suiteId?: string };
export type CatalogEval = EvalSummary & {
  path: string;
  trialCount: number;
  agent: {
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
export type SuiteSummary = { id: string; name?: string; evalIds: string[] };

export type RunSummary = {
  id: string;
  evalId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  completedTrials: number;
  requestedTrials: number;
  score?: number;
  durationMs?: number;
};

export type TrialSummary = {
  id: string;
  index: number;
  status: RunSummary['status'];
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  score?: number;
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
  listEvals(): Promise<EvalSummary[]>;
  listSuites(): Promise<SuiteSummary[]>;
  listRuns(): Promise<RunSummary[]>;
  listTrials(runId: string): Promise<TrialSummary[]>;
  getTrajectory(runId: string, trialId: string): Promise<TrajectoryEvent[]>;
  getTrial(
    runId: string,
    trialId: string,
  ): Promise<{ manifest: unknown; summary: unknown }>;
  listArtifacts(
    runId: string,
    trialId: string,
  ): Promise<Array<{ path: string; kind: string; size?: number }>>;
  runEval(path: string): Promise<void>;
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
    async getTrajectory(runId, trialId) {
      return (
        await request<{ events: TrajectoryEvent[] }>(
          `/v1/runs/${encodeURIComponent(runId)}/trials/${encodeURIComponent(trialId)}/trajectory`,
        )
      ).events;
    },
    async runEval(path) {
      await request('/v1/runs', {
        method: 'POST',
        body: JSON.stringify({ path }),
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
