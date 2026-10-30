import { Button, Table } from '@cloudflare/kumo';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogEval, RunSummary, SuiteSummary } from '../api.js';
import {
  DataTable,
  monoClass,
  tableLinkClass,
  TableMessage,
} from './DataTable.js';
import { Empty } from './Empty.js';
import { Pager } from './Pager.js';
import { RunFilters } from './RunFilters.js';
import { SearchField } from './SearchField.js';
import { SortableHeader, useSort, useSortedRows } from './SortableTable.js';
import { StatusBadge } from './StatusBadge.js';
import { runHref, scenarioHref } from './links.js';
import { filterRunFacets, runFacets } from './run-facets.js';
import { useRunFilters } from './use-run-table-state.js';

const PAGE_SIZE = 50;
/** Run, status, scenario, agent, trials, score, runtime, started, commit, suite. */
const FIXED_RUN_COLUMNS = 10;

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
      run.source?.commit,
      run.source?.ref,
      run.source?.dirty ? 'dirty' : undefined,
      ...parameters,
    ]
      .map(display)
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** Every run of every scenario, filterable; each run opens its own page. */
export function RunTable({
  runs,
  suites,
  catalog,
  search,
  onSearchChange,
}: {
  runs: RunSummary[];
  suites: SuiteSummary[];
  catalog: CatalogEval[];
  search?: URLSearchParams;
  onSearchChange?(next: URLSearchParams): void;
}) {
  const { activeSearch, query, setQuery, setField, toggleFacet, clearFilters } =
    useRunFilters(search, onSearchChange);
  // Runs of evals removed from the project (`evalkit tidy`) are hidden by default.
  const showArchived = activeSearch.get('archived') === 'show';
  const archivedCount = runs.filter((run) => run.archived).length;
  const listed = useMemo(
    () => (showArchived ? runs : runs.filter((run) => !run.archived)),
    [runs, showArchived],
  );
  const facets = useMemo(() => runFacets(listed), [listed]);
  const parameterColumns = useMemo(() => runParameterColumns(listed), [listed]);
  const filteredRuns = filterRuns(
    filterRunFacets(listed, activeSearch),
    query,
    suites,
    catalog,
  );
  const [page, setPage] = useState(0);
  const { sort, toggleSort } = useSort(
    { key: 'started', direction: 'desc' },
    () => setPage(0),
  );
  const evalFor = (run: RunSummary) =>
    catalog.find((entry) => entry.id === run.evalId);
  const suiteName = (run: RunSummary) =>
    suites.find((suite) => suite.id === run.suiteId)?.name;
  const sortedRuns = useSortedRows(filteredRuns, sort, (run, key) =>
    runSortValue(run, key, evalFor(run), suiteName(run)),
  );
  const pageCount = Math.max(1, Math.ceil(sortedRuns.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRuns = sortedRuns.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const columnCount = FIXED_RUN_COLUMNS + parameterColumns.length;
  const header = (label: string, key: string, sticky?: 'left') => (
    <SortableHeader
      label={label}
      sortKey={key}
      sort={sort}
      onSort={toggleSort}
      sticky={sticky}
    />
  );
  if (!runs.length)
    return (
      <Empty message="No runs yet. Open a scenario or suite to start one." />
    );
  return (
    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
      <RunFilters
        facets={facets}
        search={activeSearch}
        archivedCount={archivedCount}
        onToggleFacet={toggleFacet}
        onField={setField}
        onClear={clearFilters}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {activeSearch.get('invocation') ? (
          <p className="text-[13px] text-kumo-subtle" role="note">
            Showing the runs of invocation{' '}
            <span className={monoClass}>
              {activeSearch.get('invocation')!.slice(0, 8)}
            </span>
            .{' '}
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setField('invocation', '')}
            >
              Show all runs
            </Button>
          </p>
        ) : null}
        <SearchField
          label="Filter runs"
          placeholder="Scenario, parameter, agent or status"
          value={query}
          count={`${sortedRuns.length} of ${listed.length} runs`}
          onChange={setQuery}
        />
        <DataTable>
          <Table.Header variant="compact">
            <Table.Row>
              {header('Run', 'run', 'left')}
              {header('Status', 'status')}
              {header('Scenario', 'eval')}
              {parameterColumns.map((parameter) => (
                <SortableHeader
                  key={parameter}
                  label={parameter}
                  sortKey={`param:${parameter}`}
                  sort={sort}
                  onSort={toggleSort}
                />
              ))}
              {header('Agent', 'agent')}
              {header('Trials', 'trials')}
              {header('Score', 'score')}
              {header('Runtime', 'runtime')}
              {header('Started', 'started')}
              {header('Commit', 'commit')}
              {header('Suite', 'suite')}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {visibleRuns.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                evaluation={evalFor(run)}
                suiteName={suiteName(run)}
                parameterColumns={parameterColumns}
              />
            ))}
            {!sortedRuns.length ? (
              <TableMessage colSpan={columnCount}>
                <span className="inline-flex items-center gap-2">
                  No matching runs.
                  <Button size="xs" variant="ghost" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </span>
              </TableMessage>
            ) : null}
          </Table.Body>
        </DataTable>
        <Pager
          label="Run pages"
          noun="Runs"
          page={currentPage}
          pageSize={PAGE_SIZE}
          total={sortedRuns.length}
          onPage={setPage}
        />
      </div>
    </div>
  );
}

function runSortValue(
  run: RunSummary,
  key: string,
  evaluation: CatalogEval | undefined,
  suiteName: string | undefined,
): unknown {
  if (key.startsWith('param:')) {
    const value = run.parameters?.[key.slice(6)];
    return value === undefined
      ? undefined
      : typeof value === 'number'
        ? value
        : display(value);
  }
  return (
    {
      run: run.id,
      suite: suiteName ?? run.suiteId,
      eval: evaluation?.name ?? run.evalId,
      agent:
        evaluation?.agent.name ?? evaluation?.agent.kind ?? 'Unnamed agent',
      status: run.status,
      trials: run.completedTrials,
      score: run.score,
      runtime: run.durationMs,
      started: run.startedAt,
      commit: run.source?.commit,
    } as Record<string, unknown>
  )[key];
}

function RunRow({
  run,
  evaluation,
  suiteName,
  parameterColumns,
}: {
  run: RunSummary;
  evaluation?: CatalogEval;
  suiteName?: string;
  parameterColumns: readonly string[];
}) {
  return (
    <Table.Row>
      <Table.Cell sticky="left">
        <Link
          to={runHref(run.id)}
          className={`${tableLinkClass} ${monoClass}`}
          title={run.id}
        >
          {run.id.slice(0, 8)}
        </Link>
      </Table.Cell>
      <Table.Cell
        title={
          run.interrupted
            ? 'Its process stopped before the run finished'
            : undefined
        }
      >
        <StatusBadge status={run.status} />
      </Table.Cell>
      <Table.Cell className="font-medium">
        <Link to={scenarioHref(run.evalId)} className={tableLinkClass}>
          {evaluation?.name ?? run.evalId}
        </Link>
        {run.archived ? (
          <span
            className="ml-2 rounded border border-kumo-line px-1 text-[11px] font-normal text-kumo-subtle"
            title="This scenario is no longer in the project (evalkit tidy)"
          >
            archived
          </span>
        ) : null}
      </Table.Cell>
      {parameterColumns.map((parameter) => (
        <Table.Cell key={parameter} className={monoClass}>
          {Object.hasOwn(run.parameters ?? {}, parameter)
            ? display(run.parameters?.[parameter])
            : '—'}
        </Table.Cell>
      ))}
      <Table.Cell>
        {evaluation?.agent.name ?? evaluation?.agent.kind ?? 'Unnamed agent'}
      </Table.Cell>
      <Table.Cell className="tabular-nums">
        {run.completedTrials}/{run.requestedTrials}
      </Table.Cell>
      <Table.Cell className="tabular-nums">{run.score ?? '—'}</Table.Cell>
      <Table.Cell className="tabular-nums">
        {run.durationMs === undefined ? '—' : `${run.durationMs}ms`}
      </Table.Cell>
      <Table.Cell className="whitespace-nowrap tabular-nums">
        {new Date(run.startedAt).toLocaleString()}
      </Table.Cell>
      <Table.Cell className="whitespace-nowrap">
        <CommitLabel source={run.source} />
      </Table.Cell>
      <Table.Cell>{suiteName ?? '—'}</Table.Cell>
    </Table.Row>
  );
}

/** Short SHA and branch; a dirty run came from uncommitted changes. */
export function CommitLabel({ source }: { source?: RunSummary['source'] }) {
  if (!source) return <span className="text-kumo-subtle">—</span>;
  return (
    <span title={source.commit}>
      <span className={monoClass}>{source.commit.slice(0, 7)}</span>
      {source.ref ? (
        <span className="ml-1 text-kumo-subtle">{source.ref}</span>
      ) : null}
      {source.dirty ? (
        <span
          className="ml-2 rounded border border-kumo-line px-1 text-[11px] text-kumo-subtle"
          title="Run with uncommitted changes"
        >
          dirty
        </span>
      ) : null}
    </span>
  );
}
