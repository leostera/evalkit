import { useEffect, useRef, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { DashboardRoutes } from './DashboardRoutes.js';
import { DashboardShell } from './components/DashboardShell.js';
import { ErrorBanner } from './components/ErrorBanner.js';
import { ShareHome } from './components/ShareHome.js';
import { VersionPicker } from './components/VersionPicker.js';
import type { ShareContext } from './share.js';
import type {
  CatalogEval,
  LoadError,
  DashboardApi,
  MatrixSummary,
  RunSummary,
  SuiteSummary,
} from './api.js';

/** `basename` is the mount path of a static snapshot, e.g. `/share`. */
export function App({
  api,
  basename,
  share,
}: {
  api: DashboardApi;
  basename?: string;
  /** Present on the share server. Without `data`, this is its front page. */
  share?: ShareContext;
}) {
  if (share && !share.data) return <ShareHome share={share} />;
  return (
    <BrowserRouter basename={basename}>
      <Dashboard api={api} share={share} basename={basename} />
    </BrowserRouter>
  );
}

function Dashboard({
  api,
  share,
  basename,
}: {
  api: DashboardApi;
  share?: ShareContext;
  basename?: string;
}) {
  const commit = basename?.split('/-/')[1];
  const [catalog, setCatalog] = useState<CatalogEval[]>([]);
  const [suites, setSuites] = useState<SuiteSummary[]>([]);
  const [matrix, setMatrix] = useState<MatrixSummary | null>();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const runsSignature = useRef('');
  const [error, setError] = useState<string>();
  const [loadErrors, setLoadErrors] = useState<LoadError[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.listCatalog(),
      api.listSuites(),
      api.getMatrix(),
      api.listLoadErrors?.() ?? [],
    ])
      .then(([nextCatalog, nextSuites, nextMatrix, nextLoadErrors]) => {
        if (!active) return;
        setCatalog(nextCatalog);
        setLoadErrors(nextLoadErrors);
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
  }, [api]);

  return (
    <DashboardShell
      header={
        share?.repo && share.commits && commit ? (
          <VersionPicker
            repo={share.repo}
            current={commit}
            commitsUrl={share.commits}
          />
        ) : undefined
      }
    >
      {share?.repo ? (
        <p className="text-[13px] text-kumo-subtle" role="note">
          Shared results for{' '}
          <a href={`/${share.repo}`} className="font-mono">
            {share.repo}
          </a>
          . Runs cannot be started here.
        </p>
      ) : api.readOnly ? (
        <p className="text-[13px] text-kumo-subtle" role="note">
          Read-only snapshot built with <code>evalkit build</code>. Runs cannot
          be started here.
        </p>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {loadErrors.length ? (
        <ErrorBanner
          title={`${loadErrors.length === 1 ? '1 scenario file' : `${loadErrors.length} scenario files`} failed to load; their scenarios are missing`}
          message={loadErrors
            .map((entry) => `${entry.file}: ${entry.error.message}`)
            .join('\n')}
        />
      ) : null}
      <DashboardRoutes
        api={api}
        catalog={catalog}
        suites={suites}
        matrix={matrix}
        runs={runs}
      />
    </DashboardShell>
  );
}
