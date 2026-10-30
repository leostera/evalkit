import { Button, Table } from '@cloudflare/kumo';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogEval, RunSummary, SuiteSummary } from '../api.js';
import {
  DataTable,
  monoClass,
  tableLinkClass,
  TableMessage,
} from './DataTable.js';
import {
  displayValue as display,
  OtherParametersCell,
  ParameterCell,
  ParameterChips,
  parameterLayout,
  ScoreCell,
  StartedCell,
  type ParameterLayout,
} from './run-columns.js';
import { Empty } from './Empty.js';
import { Pager } from './Pager.js';
import { RunFilterBar, useRunSelection } from './RunFilterBar.js';
import { SortableHeader, useSort, useSortedRows } from './SortableTable.js';
import { StatusBadge } from './StatusBadge.js';
import { runHref, scenarioHref } from './links.js';
import { rowLinkProps } from './row-link.js';

const PAGE_SIZE = 50;
/** Run, status, scenario, score, started, commit; parameters follow, so outcomes never scroll away. */
const FIXED_RUN_COLUMNS = 6;

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
  const selection = useRunSelection({
    runs,
    catalog,
    suites,
    search,
    onSearchChange,
  });
  const { listed, filteredRuns, clearFilters } = selection;
  // Columns follow the filtered runs: narrowing to one model drops its column.
  const layout = parameterLayout(filteredRuns);
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
  const columnCount =
    FIXED_RUN_COLUMNS +
    layout.columns.length +
    (layout.overflow.length ? 1 : 0);
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
    <div className="flex min-w-0 flex-col gap-2">
      <RunFilterBar
        selection={selection}
        label="Filter runs"
        count={`${sortedRuns.length} of ${listed.length} runs`}
      />
      {layout.constant.length ? (
        <p
          className="constant-parameters flex flex-wrap items-center gap-1 text-[13px] text-kumo-subtle"
          role="note"
        >
          Same on every run shown:
          <ParameterChips entries={layout.constant} />
        </p>
      ) : null}
      <DataTable>
        <Table.Header variant="compact">
          <Table.Row>
            {header('Run', 'run', 'left')}
            {header('Status', 'status')}
            {header('Scenario', 'eval')}
            {header('Score', 'score')}
            {header('Started', 'started')}
            {header('Commit', 'commit')}
            {layout.columns.map((parameter) => (
              <SortableHeader
                key={parameter}
                label={parameter}
                sortKey={`param:${parameter}`}
                sort={sort}
                onSort={toggleSort}
              />
            ))}
            {layout.overflow.length ? (
              <Table.Head>Other parameters</Table.Head>
            ) : null}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {visibleRuns.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              evaluation={evalFor(run)}
              suiteName={suiteName(run)}
              layout={layout}
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
  layout,
}: {
  run: RunSummary;
  evaluation?: CatalogEval;
  suiteName?: string;
  layout: ParameterLayout;
}) {
  const name = evaluation?.name ?? run.evalId;
  const suite = suiteName ?? run.suiteId;
  return (
    <Table.Row {...rowLinkProps}>
      <Table.Cell sticky="left">
        <Link
          to={runHref(run.id)}
          data-row-link
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
      <Table.Cell>
        <span className="flex max-w-[14rem] flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <Link
              to={scenarioHref(run.evalId)}
              className={`${tableLinkClass} truncate font-medium`}
              title={name}
            >
              {name}
            </Link>
            {run.archived ? (
              <span
                className="shrink-0 rounded border border-kumo-line px-1 text-[11px] text-kumo-subtle"
                title="This scenario is no longer in the project (evalkit tidy)"
              >
                archived
              </span>
            ) : null}
          </span>
          {suite ? (
            <span className="truncate text-xs text-kumo-subtle" title={suite}>
              {suite}
            </span>
          ) : null}
        </span>
      </Table.Cell>

      <Table.Cell>
        <ScoreCell run={run} />
      </Table.Cell>
      <Table.Cell className="whitespace-nowrap">
        <StartedCell run={run} />
      </Table.Cell>
      <Table.Cell className="whitespace-nowrap">
        <CommitLabel source={run.source} />
      </Table.Cell>
      {layout.columns.map((parameter) => (
        <Table.Cell key={parameter}>
          <ParameterCell run={run} name={parameter} />
        </Table.Cell>
      ))}
      {layout.overflow.length ? (
        <Table.Cell>
          <OtherParametersCell run={run} keys={layout.overflow} />
        </Table.Cell>
      ) : null}
    </Table.Row>
  );
}

/** Short SHA, with the branch and full SHA on hover; dirty runs came from uncommitted changes. */
export function CommitLabel({ source }: { source?: RunSummary['source'] }) {
  if (!source) return <span className="text-kumo-subtle">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={[
        source.commit,
        source.ref && `on ${source.ref}`,
        source.dirty && 'with uncommitted changes',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={monoClass}>{source.commit.slice(0, 7)}</span>
      {source.dirty ? (
        <span className="rounded border border-kumo-line px-1 text-[11px] text-kumo-subtle">
          dirty
        </span>
      ) : null}
    </span>
  );
}
