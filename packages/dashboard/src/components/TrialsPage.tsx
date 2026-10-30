import { Button, Table } from '@cloudflare/kumo';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  CatalogEval,
  DashboardApi,
  RunSummary,
  SuiteSummary,
  TrialSummary,
} from '../api.js';
import {
  DataTable,
  monoClass,
  tableLinkClass,
  TableMessage,
} from './DataTable.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import { runHref, scenarioHref, trialHref, workspaceHref } from './links.js';
import {
  formatDuration,
  formatScore,
  OtherParametersCell,
  ParameterCell,
  ParameterChips,
  parameterLayout,
  relativeTime,
} from './run-columns.js';
import {
  RunFilterBar,
  useRunSelection,
  withTrialStatus,
} from './RunFilterBar.js';
import { CommitLabel } from './RunTable.js';
import { rowLinkProps } from './row-link.js';
import { StatusBadge } from './StatusBadge.js';

/** Runs whose trials are loaded per "Load more". */
const RUNS_PER_PAGE = 20;

type Loaded = { run: RunSummary; trial: TrialSummary };

/**
 * Trials across runs, newest runs first. Trials are listed per run, so they
 * load a page of runs at a time instead of fetching every run up front.
 */
export function useRecentTrials(
  api: DashboardApi,
  runs: readonly RunSummary[],
) {
  const ordered = useMemo(
    () => [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [runs],
  );
  const [limit, setLimit] = useState(RUNS_PER_PAGE);
  const [byRun, setByRun] = useState<Record<string, TrialSummary[]>>({});
  const [error, setError] = useState<string>();
  const wanted = ordered.slice(0, limit);
  const signature = wanted
    .map((run) => `${run.id}:${run.completedTrials}:${run.status}`)
    .join(',');
  useEffect(() => {
    let active = true;
    void Promise.all(
      wanted.map(
        async (run) => [run.id, await api.listTrials(run.id)] as const,
      ),
    )
      .then((entries) => {
        // Keep earlier pages, so changing filters back does not reload them.
        if (active)
          setByRun((current) => ({
            ...current,
            ...Object.fromEntries(entries),
          }));
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : 'Unable to load trials',
          );
      });
    return () => {
      active = false;
    };
    // The signature covers every run change that can add or finish trials.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, signature]);
  const trials: Loaded[] = wanted.flatMap((run) =>
    (byRun[run.id] ?? [])
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((trial) => ({ run, trial })),
  );
  return {
    trials,
    error,
    loading: wanted.some((run) => !byRun[run.id]),
    more: ordered.length > limit,
    loadMore: () => setLimit((value) => value + RUNS_PER_PAGE),
    runCount: wanted.length,
    totalRuns: ordered.length,
  };
}

/**
 * Every trial, newest first, behind the same filters as Runs. `workspaces`
 * opens each trial's candidate workspace instead of its trajectory.
 */
export function TrialsPage({
  api,
  catalog,
  suites,
  runs,
  search,
  onSearchChange,
  workspaces = false,
}: {
  api: DashboardApi;
  catalog: CatalogEval[];
  suites: SuiteSummary[];
  runs: RunSummary[];
  search?: URLSearchParams;
  onSearchChange?(next: URLSearchParams): void;
  workspaces?: boolean;
}) {
  const selection = useRunSelection({
    runs,
    catalog,
    suites,
    search,
    onSearchChange,
    trialStatus: true,
  });
  const loaded = useRecentTrials(api, selection.filteredRuns);
  const trials = loaded.trials.filter(({ trial }) =>
    selection.keepTrial(trial),
  );
  const facets = withTrialStatus(
    selection.facets,
    loaded.trials.map(({ trial }) => trial),
  );
  const layout = parameterLayout([...new Set(trials.map(({ run }) => run))]);
  if (!runs.length)
    return <Empty message="No runs yet. Run a scenario to see its trials." />;
  const name = (evalId: string) =>
    catalog.find((entry) => entry.id === evalId)?.name ?? evalId;
  const columnCount =
    7 + layout.columns.length + (layout.overflow.length ? 1 : 0);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-[13px] text-kumo-subtle">
        {workspaces
          ? 'Each trial ran in its own workspace; open one to browse the files the agent left.'
          : 'Every trial of the matching runs; open one for its trajectory and scores.'}
      </p>
      <RunFilterBar
        selection={selection}
        facets={facets}
        label={workspaces ? 'Filter workspaces' : 'Filter trials'}
        count={`${trials.length} trials of ${loaded.runCount} of ${loaded.totalRuns} matching runs`}
      />
      {layout.constant.length ? (
        <p
          className="constant-parameters flex flex-wrap items-center gap-1 text-[13px] text-kumo-subtle"
          role="note"
        >
          Same on every trial shown:
          <ParameterChips entries={layout.constant} />
        </p>
      ) : null}
      {loaded.error ? <ErrorBanner message={loaded.error} /> : null}
      <DataTable>
        <Table.Header variant="compact">
          <Table.Row>
            <Table.Head>{workspaces ? 'Workspace' : 'Trial'}</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head>Scenario</Table.Head>
            <Table.Head>Score</Table.Head>
            <Table.Head>Started</Table.Head>
            <Table.Head>Run</Table.Head>
            <Table.Head>Commit</Table.Head>
            {layout.columns.map((parameter) => (
              <Table.Head key={parameter}>{parameter}</Table.Head>
            ))}
            {layout.overflow.length ? (
              <Table.Head>Other parameters</Table.Head>
            ) : null}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {trials.map(({ run, trial }) => (
            <Table.Row key={`${run.id}/${trial.id}`} {...rowLinkProps}>
              <Table.Cell>
                <Link
                  to={
                    workspaces
                      ? workspaceHref(run.id, trial.id)
                      : trialHref(run.id, trial.id)
                  }
                  data-row-link
                  className={tableLinkClass}
                  title={trial.id}
                >
                  Trial {trial.index + 1}
                </Link>
              </Table.Cell>
              <Table.Cell>
                <StatusBadge status={trial.status} />
              </Table.Cell>
              <Table.Cell>
                <Link
                  to={scenarioHref(run.evalId)}
                  className={`${tableLinkClass} block max-w-[16rem] truncate`}
                >
                  {name(run.evalId)}
                </Link>
              </Table.Cell>
              <Table.Cell className="tabular-nums">
                {formatScore(trial.score)}
              </Table.Cell>
              <Table.Cell
                className="whitespace-nowrap tabular-nums"
                title={new Date(trial.startedAt).toLocaleString()}
              >
                {relativeTime(trial.startedAt)}
                {trial.durationMs !== undefined ? (
                  <span className="ml-2 text-xs text-kumo-subtle">
                    took {formatDuration(trial.durationMs)}
                  </span>
                ) : null}
              </Table.Cell>
              <Table.Cell>
                <Link
                  to={runHref(run.id)}
                  className={`${tableLinkClass} ${monoClass}`}
                  title={run.id}
                >
                  {run.id.slice(0, 8)}
                </Link>
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
          ))}
          {!trials.length ? (
            <TableMessage colSpan={columnCount}>
              {loaded.loading ? (
                'Loading trials…'
              ) : (
                <span className="inline-flex items-center gap-2">
                  No matching trials.
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={selection.clearFilters}
                  >
                    Clear filters
                  </Button>
                </span>
              )}
            </TableMessage>
          ) : null}
        </Table.Body>
      </DataTable>
      {loaded.more ? (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={loaded.loadMore}
        >
          Load trials of older runs
        </Button>
      ) : null}
    </div>
  );
}
