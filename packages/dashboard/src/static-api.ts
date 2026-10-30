import { encodePath, type DashboardApi } from './api.js';

const READ_ONLY =
  'This is a read-only dashboard snapshot. Run evals with `evalkit run`, then rebuild it with `evalkit build`.';

type FetchLike = (input: RequestInfo | URL) => Promise<Response>;

/** Reads the JSON files written by `evalkit build`; never starts runs. */
export function createStaticDashboardApi(options: {
  baseUrl: string;
  fetch?: FetchLike;
}): DashboardApi {
  const send = options.fetch ?? globalThis.fetch;
  const url = (path: string) => new URL(`data/${path}`, options.baseUrl);
  const file = async (path: string) => {
    const response = await send(url(path));
    if (!response.ok)
      // Listings are always shared; `evalkit share --no-workspace` leaves out contents.
      throw new Error(
        path.includes('/workspace/') || /^datasets\/[^/]+\/files\//.test(path)
          ? 'This file is listed, but its contents were not shared.'
          : `Snapshot file is missing: data/${path}`,
      );
    return response;
  };
  const json = async <T>(path: string): Promise<T> =>
    (await file(path)).json() as Promise<T>;
  const trial = (runId: string, trialId: string) =>
    `runs/${encodeURIComponent(runId)}/trials/${encodeURIComponent(trialId)}`;
  return {
    readOnly: true,
    listCatalog: async () =>
      (await json<{ evals: never[] }>('catalog.json')).evals,
    getProject: async () =>
      (
        await json<{ project: null }>('project.json').catch(() => ({
          project: null,
        }))
      ).project,
    getMatrix: async () => null,
    listMatrixCells: async () => {
      throw new Error(READ_ONLY);
    },
    listEvals: async () => (await json<{ evals: never[] }>('evals.json')).evals,
    listSuites: async () =>
      (await json<{ suites: never[] }>('suites.json')).suites,
    listRuns: async () => (await json<{ runs: never[] }>('runs.json')).runs,
    listTrials: async (runId) =>
      (
        await json<{ trials: never[] }>(
          `runs/${encodeURIComponent(runId)}/trials.json`,
        )
      ).trials,
    getTrial: (runId, trialId) => json(`${trial(runId, trialId)}/detail.json`),
    getTrialEvents: async (runId, trialId) =>
      (await json<{ events: never[] }>(`${trial(runId, trialId)}/events.json`))
        .events,
    listArtifacts: async (runId, trialId) =>
      (
        await json<{ artifacts: never[] }>(
          `${trial(runId, trialId)}/artifacts.json`,
        )
      ).artifacts,
    listWorkspace: (runId, trialId) =>
      json(`${trial(runId, trialId)}/workspace.json`),
    getWorkspaceFile: (runId, trialId, path) =>
      file(
        `${trial(runId, trialId)}/workspace/${path
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`,
      ),
    listDatasetFiles: (datasetId) =>
      json(`datasets/${encodeURIComponent(datasetId)}/files.json`),
    getDatasetFile: (datasetId, path) =>
      file(
        `datasets/${encodeURIComponent(datasetId)}/files/${encodePath(path)}`,
      ),
    runEval: async () => {
      throw new Error(READ_ONLY);
    },
    runSuite: async () => {
      throw new Error(READ_ONLY);
    },
  };
}
