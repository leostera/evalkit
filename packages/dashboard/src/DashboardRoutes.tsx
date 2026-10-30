import {
  Navigate,
  Route,
  Routes,
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
import { RunPage } from './components/RunPage.js';
import { RunTable } from './components/RunTable.js';
import { ScenarioPage } from './components/ScenarioPage.js';
import { ScenarioTable } from './components/ScenarioTable.js';
import { Scoreboard } from './components/Scoreboard.js';
import { TrialPage } from './components/TrialPage.js';
import { TrialsPage } from './components/TrialsPage.js';

type Data = {
  api: DashboardApi;
  catalog: CatalogEval[];
  suites: SuiteSummary[];
  matrix?: MatrixSummary | null;
  runs: RunSummary[];
};

/**
 * Evals (results): `/scoreboard`, `/runs`, `/runs/:id`, `/runs/:id/trials/:id`
 * and its `/workspace`, `/trials`, `/workspaces`. Library (definitions):
 * `/library/{agents,judges,scenarios,datasets}` and `/library/…/:id`.
 */
export function DashboardRoutes(data: Data) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/scoreboard" replace />} />
      <Route path="/scoreboard" element={<Scoreboard {...data} />} />
      <Route path="/runs" element={<RunsRoute {...data} />} />
      <Route path="/runs/:runId" element={<RunRoute {...data} />} />
      <Route
        path="/runs/:runId/trials/:trialId"
        element={<TrialRoute {...data} />}
      />
      <Route
        path="/runs/:runId/trials/:trialId/workspace"
        element={<TrialRoute {...data} workspace />}
      />
      <Route path="/trials" element={<TrialsRoute {...data} />} />
      <Route
        path="/workspaces"
        element={<TrialsRoute {...data} workspaces />}
      />
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

function RunsRoute({ catalog, suites, runs }: Data) {
  const [search, setSearch] = useSearchParams();
  return (
    <RunTable
      catalog={catalog}
      suites={suites}
      runs={runs}
      search={search}
      onSearchChange={(next) => setSearch(next, { replace: true })}
    />
  );
}

function TrialsRoute({
  workspaces = false,
  ...data
}: Data & { workspaces?: boolean }) {
  const [search, setSearch] = useSearchParams();
  return (
    <TrialsPage
      {...data}
      workspaces={workspaces}
      search={search}
      onSearchChange={(next) => setSearch(next, { replace: true })}
    />
  );
}

function RunRoute(data: Data) {
  const { runId = '' } = useParams();
  return <RunPage {...data} runId={runId} />;
}

function TrialRoute({
  workspace = false,
  ...data
}: Data & { workspace?: boolean }) {
  const { runId = '', trialId = '' } = useParams();
  return (
    <TrialPage
      {...data}
      runId={runId}
      trialId={trialId}
      workspace={workspace}
    />
  );
}
