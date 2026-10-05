import { useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  NavLink,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import { DashboardRoutes } from './DashboardRoutes.js';
import type { SelectedTrial } from './components/types.js';
import { TrialPanel } from './components/TrialPanel.js';
import type {
  CatalogEval,
  DashboardApi,
  MatrixSummary,
  RunSummary,
  SuiteSummary,
} from './api.js';

function screenTitle(pathname: string): string {
  if (pathname.startsWith('/trials/')) return 'Trial detail';
  if (pathname.startsWith('/workspaces/')) return 'Candidate workspace';
  if (pathname.startsWith('/evals/')) return 'Eval detail';
  if (pathname.startsWith('/agents')) return 'Agents';
  if (pathname.startsWith('/fixtures')) return 'Fixtures';
  if (pathname.startsWith('/runs') || pathname.startsWith('/runs/'))
    return 'Runs';
  return 'Suites & evals';
}

export function App({ api }: { api: DashboardApi }) {
  return (
    <BrowserRouter>
      <Dashboard api={api} />
    </BrowserRouter>
  );
}

function Dashboard({ api }: { api: DashboardApi }) {
  const location = useLocation();
  const navigate = useNavigate();
  const panelTrialId = location.pathname.startsWith('/runs/')
    ? new URLSearchParams(location.search).get('trial')
    : null;
  const [catalog, setCatalog] = useState<CatalogEval[]>([]);
  const [suites, setSuites] = useState<SuiteSummary[]>([]);
  const [matrix, setMatrix] = useState<MatrixSummary | null>();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const runsSignature = useRef('');
  const [selected, setSelected] = useState<SelectedTrial>();
  const [error, setError] = useState<string>();
  const [navigationOpen, setNavigationOpen] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.all([api.listCatalog(), api.listSuites(), api.getMatrix()])
      .then(([nextCatalog, nextSuites, nextMatrix]) => {
        if (!active) return;
        setCatalog(nextCatalog);
        setSuites(nextSuites);
        setMatrix(nextMatrix);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : 'Unable to load dashboard',
          );
      });
    return () => {
      active = false;
    };
  }, [api]);

  // Navigation and new runs must not require a full page reload. Poll while this
  // dashboard is open so in-progress runs and their final verdicts stay current.
  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const nextRuns = await api.listRuns();
        if (active) {
          const signature = JSON.stringify(nextRuns);
          if (signature !== runsSignature.current) {
            runsSignature.current = signature;
            setRuns(nextRuns);
          }
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : 'Unable to load runs',
          );
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, location.pathname]);

  useEffect(() => {
    const match = location.pathname.match(/^\/(?:trials|workspaces)\/([^/]+)/);
    const trialId =
      panelTrialId ?? (match ? decodeURIComponent(match[1]!) : undefined);
    if (!trialId || !runs.length || selected?.trial.id === trialId) return;
    const runId = location.pathname.match(/^\/runs\/([^/]+)/)?.[1];
    const candidates = runId
      ? runs.filter((run) => run.id === decodeURIComponent(runId))
      : runs;
    let active = true;
    void Promise.all(
      candidates.map(async (run) => ({
        run,
        trials: await api.listTrials(run.id),
      })),
    )
      .then((matches) => {
        if (!active) return;
        for (const match of matches) {
          const trial = match.trials.find(
            (candidate) => candidate.id === trialId,
          );
          if (trial) {
            setSelected({ run: match.run, trial });
            setError(undefined);
            return;
          }
        }
        setError(`Trial ${trialId} was not found in this run.`);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : 'Unable to load trial',
          );
      });
    return () => {
      active = false;
    };
  }, [api, location.pathname, panelTrialId, runs, selected]);

  return (
    <main
      className={`dashboard-shell${navigationOpen ? '' : ' navigation-collapsed'}`}
    >
      <aside id="dashboard-navigation">
        <div className="nav-top">
          <NavLink className="brand" to="/suites" hidden={!navigationOpen}>
            evalkit
          </NavLink>
          <button
            type="button"
            className="navigation-toggle"
            aria-controls="dashboard-links"
            aria-expanded={navigationOpen}
            aria-label={
              navigationOpen ? 'Collapse navigation' : 'Expand navigation'
            }
            title={navigationOpen ? 'Collapse navigation' : 'Expand navigation'}
            onClick={() => setNavigationOpen((open) => !open)}
          >
            <span aria-hidden="true">{navigationOpen ? '‹' : '›'}</span>
          </button>
        </div>
        <nav
          id="dashboard-links"
          aria-label="Dashboard"
          hidden={!navigationOpen}
        >
          <NavLink
            className={({ isActive }) => (isActive ? 'active' : '')}
            to="/suites"
          >
            suites &amp; evals
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'active' : '')}
            to="/agents"
          >
            agents
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'active' : '')}
            to="/fixtures"
          >
            fixtures
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'active' : '')}
            to="/runs"
          >
            runs
          </NavLink>
        </nav>
      </aside>
      <section className="content">
        <header>
          <h1>{screenTitle(location.pathname)}</h1>
        </header>
        {error ? <p className="error">{error}</p> : null}
        <DashboardRoutes
          api={api}
          catalog={catalog}
          suites={suites}
          matrix={matrix}
          runs={runs}
          selected={selected}
          onTrial={(run, trial) => setSelected({ run, trial })}
        />
      </section>
      {panelTrialId ? (
        <TrialPanel
          api={api}
          catalog={catalog}
          suites={suites}
          selected={selected?.trial.id === panelTrialId ? selected : undefined}
          trialId={panelTrialId}
          error={error}
          workspace={
            new URLSearchParams(location.search).get('view') === 'workspace'
          }
          onClose={() => {
            const next = new URLSearchParams(location.search);
            next.delete('trial');
            next.delete('view');
            navigate(
              { pathname: location.pathname, search: next.toString() },
              { replace: true },
            );
          }}
          onWorkspace={() => {
            const next = new URLSearchParams(location.search);
            next.set('view', 'workspace');
            navigate({ pathname: location.pathname, search: next.toString() });
          }}
          onTrialView={() => {
            const next = new URLSearchParams(location.search);
            next.delete('view');
            navigate({ pathname: location.pathname, search: next.toString() });
          }}
        />
      ) : null}
    </main>
  );
}
