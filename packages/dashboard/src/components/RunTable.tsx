import { Fragment, useEffect, useMemo, useState } from 'react';
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
import { filterRunFacets, runFacets } from './run-facets.js';

function display(value: unknown): string {
  return typeof value === 'string'
    ? value
    : (JSON.stringify(value) ?? String(value));
}

/** Saved runs may have different axes and non-axis overrides. Show every key. */
export function runParameterColumns(runs: readonly RunSummary[]): string[] {
  return [
    ...new Set(runs.flatMap((run) => Object.keys(run.parameters ?? {}))),
  ].sort();
}

export function filterRuns(
  runs: readonly RunSummary[],
  query: string,
  suites: readonly SuiteSummary[],
  catalog: readonly CatalogEval[],
): RunSummary[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...runs];
  return runs.filter((run) => {
    const evaluation = catalog.find((entry) => entry.id === run.evalId);
    const suite = suites.find((entry) => entry.id === run.suiteId);
    const parameters = Object.entries(run.parameters ?? {}).flatMap(
      ([key, value]) => [key, display(value)],
    );
    const haystack = [
      run.id,
      run.evalId,
      evaluation?.name,
      run.suiteId,
      suite?.name,
      run.matrixId,
      evaluation?.agent.name,
      evaluation?.agent.kind,
      run.status,
      run.score,
      run.startedAt,
      ...parameters,
    ]
      .map(display)
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function RunTable({
  api,
  runs,
  suites,
  catalog,
  onTrial,
  onOpenRun,
  selectedRunId,
  search,
  onSearchChange,
}: {
  api: DashboardApi;
  runs: RunSummary[];
  suites: SuiteSummary[];
  catalog: CatalogEval[];
  onTrial(run: RunSummary, trial: TrialSummary): void;
  onOpenRun(run: RunSummary): void;
  selectedRunId?: string;
  search?: URLSearchParams;
  onSearchChange?(next: URLSearchParams): void;
}) {
  const [trials, setTrials] = useState<Record<string, TrialSummary[]>>({});
  const [localSearch, setLocalSearch] = useState(() => new URLSearchParams());
  const activeSearch = search ?? localSearch;
  const updateSearch = onSearchChange ?? setLocalSearch;
  const query = activeSearch.get('q') ?? '';
  const facets = useMemo(() => runFacets(runs), [runs]);
  const parameterColumns = useMemo(() => runParameterColumns(runs), [runs]);
  const filteredRuns = filterRuns(
    filterRunFacets(runs, activeSearch),
    query,
    suites,
    catalog,
  );
  const toggleFacet = (facet: string, value: string) => {
    const next = new URLSearchParams(activeSearch);
    const values = next.getAll(facet);
    next.delete(facet);
    for (const selected of values.filter((selected) => selected !== value))
      next.append(facet, selected);
    if (!values.includes(value)) next.append(facet, value);
    updateSearch(next);
  };
  const setField = (field: string, value: string) => {
    const next = new URLSearchParams(activeSearch);
    if (value) next.set(field, value);
    else next.delete(field);
    updateSearch(next);
  };
  // A run can appear before its first trial is persisted; refresh expanded trials
  // when the run list is polled rather than caching an empty result forever.
  useEffect(() => {
    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) return;
    let active = true;
    void api.listTrials(selectedRunId).then((value) => {
      if (active)
        setTrials((current) => ({ ...current, [selectedRunId]: value }));
    });
    return () => {
      active = false;
    };
  }, [api, runs, selectedRunId]);
  const [sort, setSort] = useState<SortState>({
    key: 'started',
    direction: 'desc',
  });
  const evalFor = (run: RunSummary) =>
    catalog.find((entry) => entry.id === run.evalId);
  const sortedRuns = useSortedRows(filteredRuns, sort, (run, key) => {
    if (key.startsWith('param:')) {
      const value = run.parameters?.[key.slice(6)];
      return value === undefined
        ? undefined
        : typeof value === 'number'
          ? value
          : display(value);
    }
    const evaluation = evalFor(run);
    return (
      {
        run: run.id,
        suite:
          suites.find((suite) => suite.id === run.suiteId)?.name ?? run.suiteId,
        eval: evaluation?.name ?? run.evalId,
        agent:
          evaluation?.agent.name ?? evaluation?.agent.kind ?? 'Unnamed agent',
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
    <div className="runs-layout">
      <details className="runs-filter-panel" open>
        <summary>
          Filters{activeSearch.size ? ` (${activeSearch.size} active)` : ''}
        </summary>
        <div className="runs-filter-fields">
          {facets.map((facet) => (
            <fieldset key={facet.key}>
              <legend>{facet.label}</legend>
              {facet.values.map((choice) => (
                <label key={choice.key} className="runs-choice">
                  <input
                    type="checkbox"
                    checked={activeSearch
                      .getAll(facet.key)
                      .includes(choice.key)}
                    onChange={() => toggleFacet(facet.key, choice.key)}
                  />
                  <span>{choice.label}</span>
                  <small>{choice.count}</small>
                </label>
              ))}
            </fieldset>
          ))}
          <label className="runs-date">
            From{' '}
            <input
              type="date"
              value={activeSearch.get('from') ?? ''}
              onChange={(event) => setField('from', event.target.value)}
            />
          </label>
          <label className="runs-date">
            To{' '}
            <input
              type="date"
              value={activeSearch.get('to') ?? ''}
              onChange={(event) => setField('to', event.target.value)}
            />
          </label>
          <button
            type="button"
            className="clear-filters"
            disabled={!activeSearch.size}
            onClick={() => updateSearch(new URLSearchParams())}
          >
            Clear filters
          </button>
        </div>
      </details>
      <div className="table-wrap">
        <label className="matrix-filter">
          Filter runs
          <input
            type="search"
            aria-label="Filter runs"
            placeholder="Eval, parameter, agent or status"
            value={query}
            onChange={(event) => setField('q', event.target.value)}
          />
          <span>
            {sortedRuns.length} of {runs.length} runs
          </span>
        </label>
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
              {parameterColumns.map((parameter) => (
                <SortableHeader
                  key={parameter}
                  label={parameter}
                  sortKey={`param:${parameter}`}
                  sort={sort}
                  onSort={onSort}
                />
              ))}
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
                      {suites.find((suite) => suite.id === run.suiteId)?.name ??
                        '—'}
                    </td>
                    <td>{evaluation?.name ?? run.evalId}</td>
                    {parameterColumns.map((parameter) => (
                      <td key={parameter}>
                        {Object.hasOwn(run.parameters ?? {}, parameter)
                          ? display(run.parameters?.[parameter])
                          : '—'}
                      </td>
                    ))}
                    <td>
                      {evaluation?.agent.name ??
                        evaluation?.agent.kind ??
                        'Unnamed agent'}
                    </td>
                    <td>
                      <span className={`status ${run.status}`}>
                        {run.status}
                      </span>
                    </td>
                    <td>
                      {run.completedTrials}/{run.requestedTrials}
                    </td>
                    <td>{run.score ?? '—'}</td>
                    <td>
                      {run.durationMs === undefined
                        ? '—'
                        : `${run.durationMs}ms`}
                    </td>
                    <td>{new Date(run.startedAt).toLocaleString()}</td>
                  </tr>
                  {selectedRunId === run.id ? (
                    <tr>
                      <td colSpan={9 + parameterColumns.length}>
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
            {!sortedRuns.length ? (
              <tr>
                <td colSpan={9 + parameterColumns.length}>
                  No matching runs.{' '}
                  <button
                    type="button"
                    onClick={() => updateSearch(new URLSearchParams())}
                  >
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
