import { useEffect, useMemo, useState } from 'react';

import type {
  CatalogEval,
  DashboardApi,
  RunSummary,
  SuiteSummary,
  TrajectoryEvent,
  TrialSummary,
} from './api.js';

type Screen =
  'catalog' | 'eval' | 'agents' | 'fixtures' | 'runs' | 'trajectory';

type SelectedTrial = { run: RunSummary; trial: TrialSummary };

function currentPath(): string {
  return window.location.pathname || '/suites';
}

function routeScreen(path: string): Screen {
  if (path.startsWith('/runs')) return 'runs';
  if (path.startsWith('/evals/')) return 'eval';
  if (path.startsWith('/trajectory/')) return 'trajectory';
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
    const trialId = path.startsWith('/trajectory/')
      ? decodeURIComponent(path.slice('/trajectory/'.length))
      : undefined;
    if (!trialId || selected || !runs.length) return;
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
    navigate(`/trajectory/${encodeURIComponent(trial.id)}`);
  };
  const headings: Record<Screen, string> = {
    catalog: 'Suites & evals',
    agents: 'Agents',
    fixtures: 'Fixtures',
    runs: 'Runs',
    trajectory: 'Trajectory',
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
          {(
            ['catalog', 'agents', 'fixtures', 'runs', 'trajectory'] as const
          ).map((id) => (
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
              path.startsWith('/suites/')
                ? decodeURIComponent(path.slice('/suites/'.length))
                : undefined
            }
            onOpenSuite={(id) => navigate(`/suites/${encodeURIComponent(id)}`)}
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
            onTrial={openTrial}
            onOpenRun={(run) => navigate(`/runs/${encodeURIComponent(run.id)}`)}
            selectedRunId={
              path.startsWith('/runs/')
                ? decodeURIComponent(path.split('/')[2] ?? '')
                : undefined
            }
          />
        ) : null}
        {screen === 'trajectory' ? (
          <Trajectory api={api} selected={selected} />
        ) : null}
      </section>
    </main>
  );
}

function SuiteTable({
  api,
  suites,
  catalog,
  selectedSuiteId,
  onOpenSuite,
  onOpenEval,
}: {
  api: DashboardApi;
  suites: SuiteSummary[];
  catalog: CatalogEval[];
  selectedSuiteId?: string;
  onOpenSuite(id: string): void;
  onOpenEval(entry: CatalogEval): void;
}) {
  const [expanded, setExpanded] = useState<string>();
  const expandedSuite = selectedSuiteId ?? expanded;
  if (!suites.length) return <Empty message="No suites are loaded." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Suite</th>
            <th>Evals</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {suites.map((suite) => (
            <>
              <SuiteRow
                suite={suite}
                expanded={expandedSuite === suite.id}
                onToggle={() => {
                  setExpanded(
                    expandedSuite === suite.id ? undefined : suite.id,
                  );
                  onOpenSuite(suite.id);
                }}
                onRun={() => void api.runSuite(suite.id)}
              />
              {expandedSuite === suite.id ? (
                <tr key={`${suite.id}-evals`}>
                  <td colSpan={3}>
                    <table className="nested">
                      <thead>
                        <tr>
                          <th>Eval</th>
                          <th>Agent</th>
                          <th>Runtime</th>
                          <th>Trials</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {suite.evalIds.map((id) => {
                          const evaluation = catalog.find(
                            (entry) => entry.id === id,
                          );
                          return (
                            <EvalRow
                              key={id}
                              id={id}
                              evaluation={evaluation}
                              onRun={
                                evaluation
                                  ? () => void api.runEval(evaluation.path)
                                  : undefined
                              }
                              onOpen={
                                evaluation
                                  ? () => onOpenEval(evaluation)
                                  : undefined
                              }
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ) : null}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentTable({ catalog }: { catalog: CatalogEval[] }) {
  const agents = useMemo(() => {
    const groups = new Map<string, CatalogEval[]>();
    for (const entry of catalog) {
      const name = agentName(entry);
      groups.set(name, [...(groups.get(name) ?? []), entry]);
    }
    return [...groups.values()];
  }, [catalog]);
  if (!agents.length) return <Empty message="No agents are registered." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Kind</th>
            <th>Runtimes</th>
            <th>Evals</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((entries) => (
            <AgentRow key={agentName(entries[0])} entries={entries} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FixtureTable({ catalog }: { catalog: CatalogEval[] }) {
  const fixtures = catalog.flatMap((evaluation) =>
    evaluation.fixtures.map((fixture) => ({
      ...fixture,
      path: evaluation.path,
    })),
  );
  if (!fixtures.length) return <Empty message="No fixtures are registered." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Destination</th>
            <th>Visibility</th>
            <th>Used by</th>
          </tr>
        </thead>
        <tbody>
          {fixtures.map((fixture, index) => (
            <FixtureRow key={`${fixture.path}-${index}`} fixture={fixture} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunTable({
  api,
  runs,
  onTrial,
  onOpenRun,
  selectedRunId,
}: {
  api: DashboardApi;
  runs: RunSummary[];
  onTrial(run: RunSummary, trial: TrialSummary): void;
  onOpenRun(run: RunSummary): void;
  selectedRunId?: string;
}) {
  const expanded = selectedRunId;
  const [trials, setTrials] = useState<Record<string, TrialSummary[]>>({});
  const toggle = (run: RunSummary) => {
    const next = expanded === run.id ? undefined : run.id;
    onOpenRun(run);
    if (next && !trials[run.id])
      void api
        .listTrials(run.id)
        .then((value) =>
          setTrials((current) => ({ ...current, [run.id]: value })),
        );
  };
  if (!runs.length)
    return (
      <Empty message="No runs yet. Select an eval or suite to start one." />
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Run ID</th>
            <th>Eval</th>
            <th>Status</th>
            <th>Trials</th>
            <th>Score</th>
            <th>Runtime</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <>
              <tr key={run.id} onClick={() => toggle(run)}>
                <td>
                  <button
                    className="mono"
                    onClick={(event) => {
                      event.stopPropagation();
                      void navigator.clipboard.writeText(run.id);
                    }}
                  >
                    {run.id.slice(0, 8)}
                  </button>
                </td>
                <td>{run.evalId}</td>
                <td>
                  <span className={`status ${run.status}`}>{run.status}</span>
                </td>
                <td>
                  {run.completedTrials}/{run.requestedTrials}
                </td>
                <td>{run.score ?? '—'}</td>
                <td>
                  {run.durationMs === undefined ? '—' : `${run.durationMs}ms`}
                </td>
                <td>{new Date(run.startedAt).toLocaleString()}</td>
              </tr>
              {expanded === run.id ? (
                <tr key={`${run.id}-trials`}>
                  <td colSpan={7}>
                    <table className="nested">
                      <thead>
                        <tr>
                          <th>Trial</th>
                          <th>Status</th>
                          <th>Score</th>
                          <th>Runtime</th>
                          <th>Started</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(trials[run.id] ?? []).map((trial) => (
                          <TrialRow
                            key={trial.id}
                            trial={trial}
                            onSelect={() => onTrial(run, trial)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ) : null}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Trajectory({
  api,
  selected,
}: {
  api: DashboardApi;
  selected?: SelectedTrial;
}) {
  const [events, setEvents] = useState<TrajectoryEvent[]>([]);
  const [detail, setDetail] = useState<{
    manifest: unknown;
    summary: unknown;
  }>();
  const [artifacts, setArtifacts] = useState<
    Array<{ path: string; kind: string; size?: number }>
  >([]);
  useEffect(() => {
    if (!selected) return;
    void Promise.all([
      api.getTrajectory(selected.run.id, selected.trial.id),
      api.getTrial(selected.run.id, selected.trial.id),
      api.listArtifacts(selected.run.id, selected.trial.id),
    ]).then(([nextEvents, nextDetail, nextArtifacts]) => {
      setEvents(nextEvents);
      setDetail(nextDetail);
      setArtifacts(nextArtifacts);
    });
  }, [api, selected]);
  if (!selected)
    return (
      <Empty message="Select a trial from a run to inspect its trajectory." />
    );
  return (
    <section className="timeline">
      <p className="mono">
        {selected.run.id} / {selected.trial.id}
      </p>
      <section className="trial-summary">
        <div>
          <strong>status</strong>
          <span>{selected.trial.status}</span>
        </div>
        <div>
          <strong>score</strong>
          <span>{selected.trial.score ?? '—'}</span>
        </div>
        <div>
          <strong>runtime</strong>
          <span>
            {selected.trial.durationMs === undefined
              ? '—'
              : `${selected.trial.durationMs}ms`}
          </span>
        </div>
        <div>
          <strong>events</strong>
          <span>{events.length}</span>
        </div>
      </section>
      {detail ? (
        <details className="raw-details">
          <summary>Trial summary data</summary>
          <pre>{JSON.stringify(detail.summary, null, 2)}</pre>
        </details>
      ) : null}
      {artifacts.length ? (
        <section>
          <h2>Artifacts</h2>
          <table>
            <thead>
              <tr>
                <th>Path</th>
                <th>Kind</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.map((artifact) => (
                <ArtifactRow key={artifact.path} artifact={artifact} />
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <h2>Timeline</h2>
      {events.map((event, index) => (
        <EventCard
          event={event}
          index={index}
          key={`${event.timestamp}-${index}`}
        />
      ))}
    </section>
  );
}

function SuiteRow({
  suite,
  expanded,
  onToggle,
  onRun,
}: {
  suite: SuiteSummary;
  expanded: boolean;
  onToggle(): void;
  onRun(): void;
}) {
  return (
    <tr onClick={onToggle}>
      <td>
        <button className="mono">{suite.name ?? suite.id}</button>
        <small>{suite.id}</small>
      </td>
      <td>{suite.evalIds.length}</td>
      <td>{expanded ? 'expanded' : 'configured'}</td>
      <td>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRun();
          }}
        >
          Run suite
        </button>
      </td>
    </tr>
  );
}

function EvalRow({
  id,
  evaluation,
  onRun,
  onOpen,
}: {
  id: string;
  evaluation?: CatalogEval;
  onRun?: () => void;
  onOpen?: () => void;
}) {
  return (
    <tr onClick={onOpen}>
      <td>
        {evaluation?.name ?? id}
        <small className="mono">{evaluation?.path ?? id}</small>
      </td>
      <td>{agentName(evaluation)}</td>
      <td>
        {evaluation?.agent.runtimes.map((runtime) => runtime.name).join(', ') ||
          'default'}
      </td>
      <td>{evaluation?.trialCount ?? '—'}</td>
      <td>{onRun ? <button onClick={onRun}>Run eval</button> : null}</td>
    </tr>
  );
}

function EvalDetail({
  catalog,
  path,
}: {
  catalog: CatalogEval[];
  path: string;
}) {
  const evaluation = catalog.find((entry) => entry.path === path);
  if (!evaluation) return <Empty message={`Eval not found: ${path}`} />;
  return (
    <section className="card">
      <p className="mono">{evaluation.path}</p>
      <h2>{evaluation.name ?? evaluation.id}</h2>
      <table className="event-fields">
        <tbody>
          <tr>
            <td>agent</td>
            <td>{agentName(evaluation)}</td>
          </tr>
          <tr>
            <td>runtimes</td>
            <td>
              {evaluation.agent.runtimes
                .map((runtime) => `${runtime.name} (${runtime.kind})`)
                .join(', ') || 'default'}
            </td>
          </tr>
          <tr>
            <td>trials</td>
            <td>{evaluation.trialCount}</td>
          </tr>
          <tr>
            <td>scorers</td>
            <td>
              {evaluation.scorers
                .map((scorer) => `${scorer.name} (${scorer.kind})`)
                .join(', ') || 'none'}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function AgentRow({ entries }: { entries: CatalogEval[] }) {
  const first = entries[0]!;
  return (
    <tr>
      <td>{agentName(first)}</td>
      <td>{first.agent.kind}</td>
      <td>
        {first.agent.runtimes
          .map((runtime) => `${runtime.name} (${runtime.kind})`)
          .join(', ') || 'adapter default'}
      </td>
      <td>{entries.length}</td>
    </tr>
  );
}

function FixtureRow({
  fixture,
}: {
  fixture: CatalogEval['fixtures'][number] & { path: string };
}) {
  return (
    <tr>
      <td>{fixture.source}</td>
      <td>{fixture.destination ?? '—'}</td>
      <td>{fixture.visibility ?? 'dynamic'}</td>
      <td className="mono">{fixture.path}</td>
    </tr>
  );
}

function TrialRow({
  trial,
  onSelect,
}: {
  trial: TrialSummary;
  onSelect(): void;
}) {
  return (
    <tr onClick={onSelect}>
      <td>{trial.index + 1}</td>
      <td>{trial.status}</td>
      <td>{trial.score ?? '—'}</td>
      <td>{trial.durationMs === undefined ? '—' : `${trial.durationMs}ms`}</td>
      <td>{new Date(trial.startedAt).toLocaleString()}</td>
    </tr>
  );
}

function ArtifactRow({
  artifact,
}: {
  artifact: { path: string; kind: string; size?: number };
}) {
  return (
    <tr>
      <td className="mono">{artifact.path}</td>
      <td>{artifact.kind}</td>
      <td>{artifact.size === undefined ? '—' : `${artifact.size} bytes`}</td>
    </tr>
  );
}

function eventLabel(event: TrajectoryEvent): string {
  if (event.kind === 'message' && event.role === 'user') return 'User message';
  if (event.kind === 'message' && event.role === 'assistant')
    return 'Assistant message';
  if (event.kind.includes('scorer'))
    return `Scorer · ${event.kind.replace('scorer-', '')}`;
  if (event.kind.includes('tool'))
    return `Tool · ${event.kind.replace('tool-', '')}`;
  return event.kind.replaceAll('-', ' ');
}

function EventCard({
  event,
  index,
}: {
  event: TrajectoryEvent;
  index: number;
}) {
  const fields = Object.entries(event).filter(
    ([key]) =>
      !['source', 'kind', 'timestamp', 'content', 'error'].includes(key),
  );
  return (
    <article className="card">
      <small>
        #{index + 1} · {new Date(event.timestamp).toLocaleTimeString()} ·{' '}
        {event.source}
      </small>
      <h2>{eventLabel(event)}</h2>
      {'content' in event ? (
        <pre>
          {typeof event.content === 'string'
            ? event.content
            : JSON.stringify(event.content, null, 2)}
        </pre>
      ) : null}
      {'error' in event ? (
        <pre>{JSON.stringify(event.error, null, 2)}</pre>
      ) : null}
      {fields.length ? (
        <table className="event-fields">
          <tbody>
            {fields.map(([key, value]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>
                  {typeof value === 'string'
                    ? value
                    : JSON.stringify(value, null, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </article>
  );
}

function agentName(evaluation?: CatalogEval) {
  return evaluation?.agent.id ?? evaluation?.agent.kind ?? 'adapter';
}
function Empty({ message }: { message: string }) {
  return (
    <div className="empty">
      <p>{message}</p>
    </div>
  );
}
