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
import { AgentTable } from './components/AgentTable.js';
import { DatasetTable } from './components/DatasetTable.js';
import { InvocationTable } from './components/InvocationTable.js';
import { RunPage } from './components/RunPage.js';
import { RunTable } from './components/RunTable.js';
import { ScenarioPage } from './components/ScenarioPage.js';
import { ScenarioTable } from './components/ScenarioTable.js';
import { TrialPage } from './components/TrialPage.js';

type Data = {
  api: DashboardApi;
  catalog: CatalogEval[];
  suites: SuiteSummary[];
  matrix?: MatrixSummary | null;
  runs: RunSummary[];
};

/**
 * The URL hierarchy is the domain's: `/scenarios/:id` lists a scenario's
 * runs, `/runs/:id` a run's trials, `/runs/:id/trials/:id` a trial's
 * trajectory, and `…/workspace` its candidate files.
 */
export function DashboardRoutes(data: Data) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/scenarios" replace />} />
      <Route path="/scenarios" element={<ScenariosRoute {...data} />} />
      <Route path="/scenarios/:evalId" element={<ScenarioRoute {...data} />} />
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
      <Route
        path="/invocations"
        element={<InvocationTable runs={data.runs} />}
      />
      <Route path="/agents" element={<AgentRoute catalog={data.catalog} />} />
      <Route
        path="/datasets"
        element={<DatasetTable catalog={data.catalog} />}
      />
      <Route path="*" element={<ScenariosRoute {...data} />} />
    </Routes>
  );
}

function ScenariosRoute(data: Data) {
  const [search] = useSearchParams();
  const suite = search.get('suite') ?? undefined;
  // Remount per suite so following a suite breadcrumb expands it.
  return <ScenarioTable key={suite} {...data} selectedSuiteId={suite} />;
}

function ScenarioRoute(data: Data) {
  const { evalId = '' } = useParams();
  return <ScenarioPage {...data} evalId={evalId} />;
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

function AgentRoute({ catalog }: { catalog: CatalogEval[] }) {
  const [search] = useSearchParams();
  return (
    <AgentTable
      catalog={catalog}
      selectedAgent={search.get('agent') ?? undefined}
    />
  );
}
