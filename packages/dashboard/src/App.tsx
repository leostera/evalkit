import { useEffect, useState } from 'react';
import { BrowserRouter, NavLink, useLocation } from 'react-router-dom';

import { DashboardRoutes } from './DashboardRoutes.js';
import type { SelectedTrial } from './components/types.js';
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
  const [catalog, setCatalog] = useState<CatalogEval[]>([]);
  const [suites, setSuites] = useState<SuiteSummary[]>([]);
  const [matrix, setMatrix] = useState<MatrixSummary | null>();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<SelectedTrial>();
  const [error, setError] = useState<string>();

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
        if (active) setRuns(nextRuns);
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
    const match = location.pathname.match(/^\/(?:trial|workspace)\/([^/]+)/);
    const trialId = match ? decodeURIComponent(match[1]!) : undefined;
    if (!trialId || !runs.length || selected?.trial.id === trialId) return;
    void Promise.all(
      runs.map(async (run) => ({ run, trials: await api.listTrials(run.id) })),
    ).then((matches) => {
      for (const match of matches) {
        const trial = match.trials.find(
          (candidate) => candidate.id === trialId,
        );
        if (trial) {
          setSelected({ run: match.run, trial });
          return;
        }
      }
    });
  }, [api, location.pathname, runs, selected]);

  return (
    <main className="dashboard-shell">
      <aside>
        <NavLink className="brand" to="/suites">
          evalkit
        </NavLink>
        <nav aria-label="Dashboard">
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
    </main>
  );
}
