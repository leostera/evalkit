import { Fragment, useMemo, useState } from 'react';
import type {
  CatalogEval,
  DashboardApi,
  RunSummary,
  SuiteSummary,
  TrialSummary,
} from '../api.js';
import { Empty } from './Empty.js';
import {
  SortableHeader,
  useSortedRows,
  type SortState,
} from './SortableTable.js';
import { TrialTable } from './TrialTable.js';

export function RunTable({
  api,
  runs,
  suites,
  catalog,
  onTrial,
  onOpenRun,
  selectedRunId,
}: {
  api: DashboardApi;
  runs: RunSummary[];
  suites: SuiteSummary[];
  catalog: CatalogEval[];
  onTrial(run: RunSummary, trial: TrialSummary): void;
  onOpenRun(run: RunSummary): void;
  selectedRunId?: string;
}) {
  const [trials, setTrials] = useState<Record<string, TrialSummary[]>>({});
  const [sort, setSort] = useState<SortState>({
    key: 'started',
    direction: 'desc',
  });
  const evalFor = (run: RunSummary) =>
    catalog.find((entry) => entry.uri === run.evalId);
  const sortedRuns = useSortedRows(runs, sort, (run, key) => {
    const evaluation = evalFor(run);
    return (
      {
        run: run.id,
        suite:
          suites.find((suite) => suite.uri === run.suiteId)?.name ??
          run.suiteId,
        eval: evaluation?.name ?? evaluation?.slug ?? run.evalId,
        agent:
          evaluation?.agent.name ??
          evaluation?.agent.kind ??
          evaluation?.agent.uri,
        status: run.status,
        trials: run.completedTrials,
        score: run.score,
        runtime: run.durationMs,
        started: run.startedAt,
      } as Record<string, unknown>
    )[key];
  });
  const onSort = (key: string) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  const toggle = (run: RunSummary) => {
    onOpenRun(run);
    if (!trials[run.id])
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
      <table className="data-table">
        <thead>
          <tr>
            <SortableHeader
              label="Run"
              sortKey="run"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              label="Suite"
              sortKey="suite"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              label="Eval"
              sortKey="eval"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              label="Agent"
              sortKey="agent"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              label="Status"
              sortKey="status"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              label="Trials"
              sortKey="trials"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              label="Score"
              sortKey="score"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              label="Runtime"
              sortKey="runtime"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              label="Started"
              sortKey="started"
              sort={sort}
              onSort={onSort}
            />
          </tr>
        </thead>
        <tbody>
          {sortedRuns.map((run) => {
            const evaluation = evalFor(run);
            return (
              <Fragment key={run.id}>
                <tr onClick={() => toggle(run)}>
                  <td>
                    <button
                      className="mono"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(run);
                      }}
                    >
                      {run.id.slice(0, 8)}
                    </button>
                  </td>
                  <td>
                    {suites.find((suite) => suite.uri === run.suiteId)?.name ??
                      '—'}
                  </td>
                  <td>
                    {evaluation?.name ?? evaluation?.slug ?? 'Unnamed eval'}
                  </td>
                  <td>
                    {evaluation?.agent.name ?? evaluation?.agent.kind ?? '—'}
                  </td>
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
                {selectedRunId === run.id ? (
                  <tr>
                    <td colSpan={9}>
                      <TrialTable
                        run={run}
                        trials={trials[run.id] ?? []}
                        onTrial={onTrial}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
