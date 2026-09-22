import { useEffect, useState } from 'react';

import type { SelectedTrial } from './components/types.js';
import { AgentTable } from './components/AgentTable.js';
import { Empty } from './components/Empty.js';
import { EvalDetail } from './components/EvalDetail.js';
import { FixtureTable } from './components/FixtureTable.js';
import { RunTable } from './components/RunTable.js';
import { SuiteTable } from './components/SuiteTable.js';
import { TrialDetail } from './components/TrialDetail.js';
import { WorkspaceDetail } from './components/WorkspaceDetail.js';

import type {
  CatalogEval,
  DashboardApi,
  RunSummary,
  SuiteSummary,
  TrialSummary,
} from './api.js';

type Screen =
  'catalog' | 'eval' | 'agents' | 'fixtures' | 'runs' | 'trial' | 'workspace';

function currentPath(): string {
  return window.location.pathname || '/suites';
}

function routeScreen(path: string): Screen {
  if (path.startsWith('/runs') || path.startsWith('/run/')) return 'runs';
  if (path.startsWith('/evals/')) return 'eval';
  if (path.startsWith('/trial/')) return 'trial';
  if (path.startsWith('/workspace/')) return 'workspace';
  if (path.startsWith('/agents')) return 'agents';
  if (path.startsWith('/fixtures')) return 'fixtures';
  return 'catalog';
}

export function App({ api }: { api: DashboardApi }) {
  const [path, setPath] = useState(currentPath);
  const screen = routeScreen(path);
  const [catalog, setCatalog] = useState<CatalogEval[]>([]);
  const [suites, setSuites] = useState<SuiteSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<SelectedTrial>();
  const [error, setError] = useState<string>();
  const navigate = (nextPath: string) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
  };
  useEffect(() => {
    const onPopState = () => setPath(currentPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    void Promise.all([api.listCatalog(), api.listSuites(), api.listRuns()])
      .then(([nextCatalog, nextSuites, nextRuns]) => {
        setCatalog(nextCatalog);
        setSuites(nextSuites);
        setRuns(nextRuns);
      })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : 'Unable to load dashboard',
        ),
      );
  }, [api]);

  useEffect(() => {
    const workspace = path.startsWith('/workspace/');
    const trialId =
      path.startsWith('/trial/') || workspace
        ? decodeURIComponent(
            path
              .slice(workspace ? '/workspace/'.length : '/trial/'.length)
              .split('/')[0] ?? '',
          )
        : undefined;
    if (!trialId || !runs.length) return;
    if (selected?.trial.id === trialId) return;
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
  }, [api, path, runs, selected]);

  const openTrial = (run: RunSummary, trial: TrialSummary) => {
    setSelected({ run, trial });
    navigate(`/trial/${encodeURIComponent(trial.id)}`);
  };
  const headings: Record<Screen, string> = {
    catalog: 'Suites & evals',
    agents: 'Agents',
    fixtures: 'Fixtures',
    runs: 'Runs',
    trial: 'Trial detail',
    workspace: 'Candidate workspace',
    eval: 'Eval detail',
  };

  return (
    <main className="dashboard-shell">
      <aside>
        <a
          className="brand"
          href="/suites"
          onClick={(event) => {
            event.preventDefault();
            navigate('/suites');
          }}
        >
          evalkit
        </a>
        <nav aria-label="Dashboard">
          {(['catalog', 'agents', 'fixtures', 'runs'] as const).map((id) => (
            <button
              className={screen === id ? 'active' : ''}
              key={id}
              onClick={() => navigate(id === 'catalog' ? '/suites' : `/${id}`)}
            >
              {id === 'catalog' ? 'suites & evals' : id}
            </button>
          ))}
        </nav>
      </aside>
      <section className="content">
        <header>
          <h1>{headings[screen]}</h1>
        </header>
        {error ? <p className="error">{error}</p> : null}
        {screen === 'catalog' ? (
          <SuiteTable
            api={api}
            suites={suites}
            catalog={catalog}
            selectedSuiteId={
              path.startsWith('/suite/')
                ? decodeURIComponent(path.slice('/suite/'.length))
                : undefined
            }
            onOpenSuite={(id) => navigate(`/suite/${encodeURIComponent(id)}`)}
            onOpenEval={(entry) =>
              navigate(`/evals/${encodeURIComponent(entry.path)}`)
            }
          />
        ) : null}
        {screen === 'eval' ? (
          <EvalDetail
            catalog={catalog}
            path={decodeURIComponent(path.slice('/evals/'.length))}
          />
        ) : null}
        {screen === 'agents' ? <AgentTable catalog={catalog} /> : null}
        {screen === 'fixtures' ? <FixtureTable catalog={catalog} /> : null}
        {screen === 'runs' ? (
          <RunTable
            api={api}
            runs={runs}
            suites={suites}
            catalog={catalog}
            onTrial={openTrial}
            onOpenRun={(run) => navigate(`/run/${encodeURIComponent(run.id)}`)}
            selectedRunId={
              path.startsWith('/run/')
                ? decodeURIComponent(path.split('/')[2] ?? '')
                : undefined
            }
          />
        ) : null}
        {screen === 'trial' ? (
          <TrialDetail
            api={api}
            selected={selected}
            onWorkspace={() =>
              selected
                ? navigate(
                    `/workspace/${encodeURIComponent(selected.trial.id)}`,
                  )
                : undefined
            }
          />
        ) : null}
        {screen === 'workspace' ? (
          <WorkspaceDetail api={api} selected={selected} />
        ) : null}
      </section>
    </main>
  );
}
