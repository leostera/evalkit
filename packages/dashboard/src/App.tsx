import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';

import { DashboardRoutes } from './DashboardRoutes.js';
import { DashboardShell } from './components/DashboardShell.js';
import { ErrorBanner } from './components/ErrorBanner.js';
import type { SelectedTrial } from './components/types.js';
import { TrialPanel } from './components/TrialPanel.js';
import type {
  CatalogEval,
  DashboardApi,
  MatrixSummary,
  RunSummary,
  SuiteSummary,
} from './api.js';

/** `basename` is the mount path of a static snapshot, e.g. `/share`. */
export function App({
  api,
  basename,
}: {
  api: DashboardApi;
  basename?: string;
}) {
  return (
    <BrowserRouter basename={basename}>
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
    <DashboardShell>
      {api.readOnly ? (
        <p className="text-[13px] text-kumo-subtle" role="note">
          Read-only snapshot built with <code>evalkit build</code>. Runs cannot
          be started here.
        </p>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      <DashboardRoutes
        api={api}
        catalog={catalog}
        suites={suites}
        matrix={matrix}
        runs={runs}
        selected={selected}
        onTrial={(run, trial) => setSelected({ run, trial })}
      />
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
        />
      ) : null}
    </DashboardShell>
  );
}
