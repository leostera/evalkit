import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import type {
  CatalogEval,
  DashboardApi,
  MatrixSummary,
  RunSummary,
  SuiteSummary,
} from './api.js';
import {
  AgentPage,
  AgentsPage,
  DatasetPage,
  DatasetsPage,
  JudgePage,
  JudgesPage,
  LibraryBreadcrumbs,
} from './components/Library.js';
import { RunPage, type RunView } from './components/RunPage.js';
import { RunTable } from './components/RunTable.js';
import { ScenarioPage } from './components/ScenarioPage.js';
import { ScenarioTable } from './components/ScenarioTable.js';
import { Scoreboard } from './components/Scoreboard.js';

type Data = {
  api: DashboardApi;
  catalog: CatalogEval[];
  suites: SuiteSummary[];
  matrix?: MatrixSummary | null;
  runs: RunSummary[];
};

/**
 * Evals (results): `/scoreboard`, `/runs`, `/runs/:id` and its `/workspace`
 * and `/attachments`, `/workspaces`. Library (definitions):
 * `/library/{agents,judges,scenarios,datasets}` and `/library/…/:id`.
 * Trial URLs from before 0.9 redirect to the run the trial became.
 */
export function DashboardRoutes(data: Data) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/scoreboard" replace />} />
      <Route path="/scoreboard" element={<Scoreboard {...data} />} />
      <Route path="/runs" element={<RunsRoute {...data} />} />
      <Route path="/runs/:runId" element={<RunRoute {...data} />} />
      <Route
        path="/runs/:runId/workspace"
        element={<RunRoute {...data} view="workspace" />}
      />
      <Route
        path="/runs/:runId/attachments"
        element={<RunRoute {...data} view="attachments" />}
      />
      <Route
        path="/runs/:runId/trials/:trialId/*"
        element={<TrialRedirect runs={data.runs} />}
      />
      <Route path="/trials" element={<Redirect to="/runs" />} />
      <Route path="/workspaces" element={<RunsRoute {...data} workspaces />} />
      <Route path="/library/agents" element={<AgentsPage {...data} />} />
      <Route path="/library/agents/:id" element={<AgentRoute {...data} />} />
      <Route path="/library/judges" element={<JudgesPage {...data} />} />
      <Route path="/library/judges/:id" element={<JudgeRoute {...data} />} />
      <Route path="/library/scenarios" element={<ScenariosRoute {...data} />} />
      <Route
        path="/library/scenarios/:id"
        element={<ScenarioRoute {...data} />}
      />
      <Route path="/library/datasets" element={<DatasetsPage {...data} />} />
      <Route
        path="/library/datasets/:id"
        element={<DatasetRoute {...data} />}
      />
      <Route path="*" element={<Navigate to="/scoreboard" replace />} />
    </Routes>
  );
}

function ScenariosRoute(data: Data) {
  const [search] = useSearchParams();
  const suite = search.get('suite') ?? undefined;
  return (
    <>
      <LibraryBreadcrumbs section="scenarios" />
      {/* Remount per suite so a suite link expands it. */}
      <ScenarioTable key={suite} {...data} selectedSuiteId={suite} />
    </>
  );
}

function ScenarioRoute(data: Data) {
  const { id = '' } = useParams();
  return <ScenarioPage {...data} evalId={id} />;
}

function AgentRoute(data: Data) {
  const { id = '' } = useParams();
  return <AgentPage {...data} agentKey={id} />;
}

function JudgeRoute(data: Data) {
  const { id = '' } = useParams();
  return <JudgePage {...data} judgeKey={id} />;
}

function DatasetRoute(data: Data) {
  const { id = '' } = useParams();
  return <DatasetPage {...data} datasetId={id} />;
}

function RunsRoute({
  catalog,
  suites,
  runs,
  workspaces = false,
}: Data & { workspaces?: boolean }) {
  const [search, setSearch] = useSearchParams();
  return (
    <RunTable
      catalog={catalog}
      suites={suites}
      runs={runs}
      workspaces={workspaces}
      search={search}
      onSearchChange={(next) => setSearch(next, { replace: true })}
    />
  );
}

function RunRoute({ view = 'run', ...data }: Data & { view?: RunView }) {
  const { runId = '' } = useParams();
  return <RunPage {...data} runId={runId} view={view} />;
}

/** Moves to `to`, keeping the query (filters, the open file). */
function Redirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

/**
 * `/runs/<old run>/trials/<trial>[/workspace|/attachments]` from before 0.9.
 * A trial of several became the run with its ID; a run of one trial kept the
 * run's ID, so go to whichever exists.
 */
function TrialRedirect({ runs }: { runs: RunSummary[] }) {
  const { runId = '', trialId = '', '*': rest = '' } = useParams();
  if (!runs.length) return <output className="text-[13px]">Loading…</output>;
  const id = runs.some((run) => run.id === trialId) ? trialId : runId;
  return (
    <Redirect to={`/runs/${encodeURIComponent(id)}${rest ? `/${rest}` : ''}`} />
  );
}
