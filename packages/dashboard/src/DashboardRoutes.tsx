import {
  Routes,
  Route,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import type {
  CatalogEval,
  DashboardApi,
  RunSummary,
  SuiteSummary,
  TrialSummary,
} from './api.js';
import { AgentTable } from './components/AgentTable.js';
import { EvalDetail } from './components/EvalDetail.js';
import { FixtureTable } from './components/FixtureTable.js';
import { RunTable } from './components/RunTable.js';
import { SuiteTable } from './components/SuiteTable.js';
import { TrialDetail } from './components/TrialDetail.js';
import { WorkspaceDetail } from './components/WorkspaceDetail.js';
import type { SelectedTrial } from './components/types.js';

export function DashboardRoutes({
  api,
  catalog,
  suites,
  runs,
  selected,
  onTrial,
}: {
  api: DashboardApi;
  catalog: CatalogEval[];
  suites: SuiteSummary[];
  runs: RunSummary[];
  selected?: SelectedTrial;
  onTrial(run: RunSummary, trial: TrialSummary): void;
}) {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route
        path="/suites"
        element={
          <SuiteTable
            api={api}
            suites={suites}
            catalog={catalog}
            onOpenSuite={(id) => navigate(`/suite/${encodeURIComponent(id)}`)}
            onOpenEval={(entry) =>
              navigate(`/evals/${encodeURIComponent(entry.path)}`)
            }
          />
        }
      />
      <Route
        path="/suite/:suiteUuid"
        element={<SuiteRoute api={api} suites={suites} catalog={catalog} />}
      />
      <Route path="/evals/*" element={<EvalRoute catalog={catalog} />} />
      <Route path="/agents" element={<AgentTable catalog={catalog} />} />
      <Route path="/fixtures" element={<FixtureTable catalog={catalog} />} />
      <Route
        path="/runs"
        element={
          <RunTableRoute
            api={api}
            catalog={catalog}
            suites={suites}
            runs={runs}
            onTrial={onTrial}
          />
        }
      />
      <Route
        path="/run/:runUuid"
        element={
          <RunTableRoute
            api={api}
            catalog={catalog}
            suites={suites}
            runs={runs}
            onTrial={onTrial}
          />
        }
      />
      <Route
        path="/trial/:trialUuid"
        element={<TrialDetailRoute api={api} selected={selected} />}
      />
      <Route
        path="/workspace/:trialUuid"
        element={<WorkspaceDetail api={api} selected={selected} />}
      />
      <Route
        path="*"
        element={
          <SuiteTable
            api={api}
            suites={suites}
            catalog={catalog}
            onOpenSuite={(id) => navigate(`/suite/${encodeURIComponent(id)}`)}
            onOpenEval={(entry) =>
              navigate(`/evals/${encodeURIComponent(entry.path)}`)
            }
          />
        }
      />
    </Routes>
  );
}

function SuiteRoute(props: {
  api: DashboardApi;
  suites: SuiteSummary[];
  catalog: CatalogEval[];
}) {
  const { suiteUuid } = useParams();
  const navigate = useNavigate();
  return (
    <SuiteTable
      {...props}
      selectedSuiteId={suiteUuid}
      onOpenSuite={() => undefined}
      onOpenEval={(entry) =>
        navigate(`/evals/${encodeURIComponent(entry.path)}`)
      }
    />
  );
}
function EvalRoute({ catalog }: { catalog: CatalogEval[] }) {
  const location = useLocation();
  return (
    <EvalDetail
      catalog={catalog}
      path={decodeURIComponent(location.pathname.slice('/evals/'.length))}
    />
  );
}
function RunTableRoute(props: {
  api: DashboardApi;
  catalog: CatalogEval[];
  suites: SuiteSummary[];
  runs: RunSummary[];
  onTrial(run: RunSummary, trial: TrialSummary): void;
}) {
  const navigate = useNavigate();
  const { runUuid } = useParams();
  return (
    <RunTable
      {...props}
      selectedRunId={runUuid}
      onTrial={(run, trial) => {
        props.onTrial(run, trial);
        navigate(`/trial/${encodeURIComponent(trial.id)}`);
      }}
      onOpenRun={(run) => navigate(`/run/${encodeURIComponent(run.id)}`)}
    />
  );
}
function TrialDetailRoute({
  api,
  selected,
}: {
  api: DashboardApi;
  selected?: SelectedTrial;
}) {
  const navigate = useNavigate();
  return (
    <TrialDetail
      api={api}
      selected={selected}
      onWorkspace={() =>
        selected &&
        navigate(`/workspace/${encodeURIComponent(selected.trial.id)}`)
      }
    />
  );
}
