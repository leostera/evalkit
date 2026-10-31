import { Button, Table } from '@cloudflare/kumo';
import { PlayIcon } from '@phosphor-icons/react';
import { canonicalParameters } from '@evalkit/core/canonical-json';
import type { JsonValue } from '@evalkit/core';
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  CatalogEval,
  DashboardApi,
  RunSummary,
  SuiteSummary,
} from '../api.js';
import { DataTable, monoClass, tableLinkClass } from './DataTable.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import { runHref, scenarioHref } from './links.js';
import {
  ParameterChips,
  formatMetric,
  formatScore,
  relativeTime,
} from './run-columns.js';
import { SortableHeader, useSort, type SortState } from './SortableTable.js';
import { SearchField } from './SearchField.js';
import {
  outcomeFill,
  outcomeLabel,
  outcomeSeverity,
  outcomeTint,
  rateTint,
  type Outcome,
} from './status-colors.js';

/** Runs shown per row, oldest to newest. */
export const HISTORY = 10;

export type ScoreboardRow = {
  key: string;
  evalId: string;
  scenario?: CatalogEval;
  suiteId?: string;
  parameters: Record<string, unknown>;
  /** Newest first, at most HISTORY. */
  runs: RunSummary[];
  outcome: Outcome;
  /** Passed over finished runs in the history; undefined when none finished. */
  passRate?: number;
  /** Mean score over the history's scored runs. */
  meanScore?: number;
  /** Each metric's mean over the history, weighted by trials measured. */
  metrics: Record<string, number>;
};

/** A metric column: its unit and which direction is better, from the runs. */
export type MetricColumn = {
  name: string;
  unit?: string;
  better?: 'lower' | 'higher';
};

const BUILT_IN_ORDER = ['agent time', 'tokens', 'tool calls'];

/** Built-in metrics first, then the scenarios' own, by name. */
export function metricColumns(runs: readonly RunSummary[]): MetricColumn[] {
  const columns = new Map<string, MetricColumn>();
  for (const run of runs)
    for (const metric of run.metrics ?? [])
      if (metric.mean !== undefined && !columns.has(metric.name))
        columns.set(metric.name, {
          name: metric.name,
          ...(metric.unit ? { unit: metric.unit } : {}),
          ...(metric.better ? { better: metric.better } : {}),
        });
  const rank = (name: string) => {
    const index = BUILT_IN_ORDER.indexOf(name);
    return index === -1 ? BUILT_IN_ORDER.length : index;
  };
  return [...columns.values()].sort(
    (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name),
  );
}

function historyMetrics(runs: readonly RunSummary[]): Record<string, number> {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const run of runs)
    for (const metric of run.metrics ?? []) {
      if (metric.mean === undefined || !metric.count) continue;
      const entry = sums.get(metric.name) ?? { sum: 0, count: 0 };
      entry.sum += metric.mean * metric.count;
      entry.count += metric.count;
      sums.set(metric.name, entry);
    }
  return Object.fromEntries(
    [...sums].map(([name, { sum, count }]) => [name, sum / count]),
  );
}

/**
 * One row per scenario, or per scenario and parameters when it ran in a
 * matrix. Scenarios that never ran get a row too, so nothing goes missing.
 */
export function scoreboardRows(
  catalog: readonly CatalogEval[],
  suites: readonly SuiteSummary[],
  runs: readonly RunSummary[],
): ScoreboardRow[] {
  const suiteOf = (evalId: string, run?: RunSummary) =>
    run?.suiteId ??
    catalog.find((entry) => entry.id === evalId)?.suiteId ??
    suites.find((suite) => suite.evalIds.includes(evalId))?.id;
  const groups = new Map<string, RunSummary[]>();
  for (const run of runs) {
    if (run.archived) continue;
    const key = rowKey(run.evalId, run.parameters ?? {});
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  const rows: ScoreboardRow[] = [...groups].map(([key, members]) => {
    const newest = members
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, HISTORY);
    const latest = newest[0]!;
    const finished = newest.filter((run) =>
      ['passed', 'failed', 'errored'].includes(run.status),
    );
    const scored = finished.filter((run) => run.score !== undefined);
    return {
      key,
      evalId: latest.evalId,
      scenario: catalog.find((entry) => entry.id === latest.evalId),
      suiteId: suiteOf(latest.evalId, latest),
      parameters: latest.parameters ?? {},
      runs: newest,
      outcome: latest.status,
      metrics: historyMetrics(finished),
      ...(scored.length
        ? {
            meanScore:
              scored.reduce((sum, run) => sum + run.score!, 0) / scored.length,
          }
        : {}),
      ...(finished.length
        ? {
            passRate:
              finished.filter((run) => run.status === 'passed').length /
              finished.length,
          }
        : {}),
    };
  });
  for (const scenario of catalog)
    if (!rows.some((row) => row.evalId === scenario.id))
      rows.push({
        key: rowKey(scenario.id, {}),
        evalId: scenario.id,
        scenario,
        suiteId: suiteOf(scenario.id),
        parameters: {},
        runs: [],
        outcome: 'not-run',
        metrics: {},
      });
  return rows;
}

function rowKey(evalId: string, parameters: Record<string, unknown>): string {
  return `${evalId}\0${canonicalParameters(parameters as JsonValue)}`;
}

/** Results at a glance: every scenario's latest outcome and recent history. */
export function Scoreboard({
  api,
  catalog,
  suites,
  runs,
}: {
  api: DashboardApi;
  catalog: CatalogEval[];
  suites: SuiteSummary[];
  runs: RunSummary[];
}) {
  const [query, setQuery] = useState('');
  const [worstFirst, setWorstFirst] = useState(true);
  const { sort, toggleSort } = useSort({ key: '', direction: 'asc' });
  const [runError, setRunError] = useState<string>();
  const rows = useMemo(
    () => scoreboardRows(catalog, suites, runs),
    [catalog, suites, runs],
  );
  const columns = useMemo(
    () => metricColumns(runs.filter((run) => !run.archived)),
    [runs],
  );
  if (!rows.length)
    return <Empty message="No scenarios yet. Add one in scenarios/." />;
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows
    .filter((row) => {
      const haystack = [
        row.evalId,
        row.scenario?.name,
        row.suiteId,
        outcomeLabel[row.outcome],
        ...Object.entries(row.parameters).map(
          ([key, value]) => `${key}=${JSON.stringify(value)}`,
        ),
      ]
        .join(' ')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .sort(
      (a, b) =>
        bySortColumn(a, b, sort) ||
        (worstFirst
          ? outcomeSeverity[a.outcome] - outcomeSeverity[b.outcome]
          : 0) ||
        (a.scenario?.name ?? a.evalId).localeCompare(
          b.scenario?.name ?? b.evalId,
        ) ||
        a.key.localeCompare(b.key),
    );
  const groups = new Map<string, ScoreboardRow[]>();
  for (const row of shown) {
    const suite = row.suiteId ?? '';
    groups.set(suite, [...(groups.get(suite) ?? []), row]);
  }
  const ranges = columnRanges(shown, columns);
  const header = (label: string, key: string) => (
    <SortableHeader
      label={label}
      sortKey={key}
      sort={sort}
      onSort={toggleSort}
    />
  );
  const suiteName = (id: string) =>
    suites.find((suite) => suite.id === id)?.name ?? id;
  const start = (row: ScoreboardRow) => {
    if (!row.scenario) return;
    setRunError(undefined);
    void api
      .runEval(
        row.scenario.path,
        Object.keys(row.parameters).length ? row.parameters : undefined,
      )
      .catch((error: unknown) =>
        setRunError(
          error instanceof Error ? error.message : 'Unable to start scenario',
        ),
      );
  };
  return (
    <>
      <Tally rows={rows} />
      {runError ? <ErrorBanner message={runError} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          label="Filter scoreboard"
          placeholder="Scenario, suite, parameter or outcome"
          value={query}
          count={`${shown.length} of ${rows.length}`}
          onChange={setQuery}
        />
        <label className="flex items-center gap-1.5 text-[13px] text-kumo-subtle">
          <input
            type="checkbox"
            checked={worstFirst}
            onChange={(event) => setWorstFirst(event.target.checked)}
          />
          Failures first
        </label>
      </div>
      <DataTable className="scoreboard">
        <Table.Header variant="compact">
          <Table.Row>
            <Table.Head>Scenario</Table.Head>
            <Table.Head>Latest</Table.Head>
            {header('Score', 'score')}
            {header('Mean score', 'meanScore')}
            <Table.Head>Last {HISTORY} runs</Table.Head>
            {header('Pass rate', 'passRate')}
            {columns.map((column) => (
              <Fragment key={column.name}>
                {header(`Mean ${column.name}`, `metric:${column.name}`)}
              </Fragment>
            ))}
            <Table.Head className="text-right">
              {api.readOnly ? null : 'Run'}
            </Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {[...groups].map(([suite, members]) => (
            <Fragment key={suite}>
              {groups.size > 1 || suite ? (
                <Table.Row className="bg-kumo-elevated">
                  <Table.Cell colSpan={7 + columns.length}>
                    <span className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-kumo-strong">
                        {suite ? suiteName(suite) : 'No suite'}
                      </span>
                      <OutcomeBar rows={members} />
                    </span>
                  </Table.Cell>
                </Table.Row>
              ) : null}
              {members.map((row) => (
                <ScoreboardLine
                  key={row.key}
                  row={row}
                  columns={columns}
                  ranges={ranges}
                  onRun={
                    api.readOnly || !row.scenario ? undefined : () => start(row)
                  }
                />
              ))}
            </Fragment>
          ))}
        </Table.Body>
      </DataTable>
    </>
  );
}

function ScoreboardLine({
  row,
  columns,
  ranges,
  onRun,
}: {
  row: ScoreboardRow;
  columns: readonly MetricColumn[];
  ranges: ReadonlyMap<string, { min: number; max: number }>;
  onRun?: () => void;
}) {
  const latest = row.runs[0];
  const parameters = Object.entries(row.parameters);
  return (
    <Table.Row data-outcome={row.outcome}>
      <Table.Cell>
        <span className="flex max-w-[22rem] flex-col gap-0.5">
          <Link
            to={scenarioHref(row.evalId)}
            className={`${tableLinkClass} truncate`}
            title={row.scenario?.name ?? row.evalId}
          >
            {row.scenario?.name ?? row.evalId}
          </Link>
          {parameters.length ? <ParameterChips entries={parameters} /> : null}
        </span>
      </Table.Cell>
      <Table.Cell>
        {latest ? (
          <Link
            to={runHref(latest.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${outcomeTint[row.outcome]}`}
            title={`Latest run ${latest.id.slice(0, 8)}, ${new Date(latest.startedAt).toLocaleString()}`}
          >
            <span
              aria-hidden
              className={`size-2 rounded-full ${outcomeFill[row.outcome]}`}
            />
            {outcomeLabel[row.outcome]}
            <span className="font-normal text-kumo-subtle">
              {relativeTime(latest.startedAt)}
            </span>
          </Link>
        ) : (
          <span className="text-xs text-kumo-subtle">not run</span>
        )}
      </Table.Cell>
      <Table.Cell>
        <span
          className={`inline-block min-w-10 rounded px-1.5 py-0.5 text-center tabular-nums ${latest ? outcomeTint[row.outcome] : ''}`}
        >
          {formatScore(latest?.score)}
        </span>
      </Table.Cell>
      <Table.Cell>
        {row.meanScore === undefined ? (
          <span className="text-kumo-subtle">—</span>
        ) : (
          <span
            className={`inline-block min-w-10 rounded px-1.5 py-0.5 text-center tabular-nums ${rateTint(row.meanScore)}`}
            title={`Mean over the last ${HISTORY} runs`}
          >
            {formatScore(row.meanScore)}
          </span>
        )}
      </Table.Cell>
      <Table.Cell>
        <History runs={row.runs} />
      </Table.Cell>
      <Table.Cell>
        {row.passRate === undefined ? (
          <span className="text-kumo-subtle">—</span>
        ) : (
          <span
            className={`inline-block min-w-12 rounded px-1.5 py-0.5 text-center tabular-nums ${rateTint(row.passRate)}`}
          >
            {Math.round(row.passRate * 100)}%
          </span>
        )}
      </Table.Cell>
      {columns.map((column) => {
        const value = row.metrics[column.name];
        return (
          <Table.Cell key={column.name} className="text-right">
            {value === undefined ? (
              <span className="text-kumo-subtle">—</span>
            ) : (
              <span
                className={`inline-block rounded px-1.5 py-0.5 tabular-nums ${metricTint(value, column, ranges.get(column.name))}`}
                title={`Mean ${column.name} over the last ${HISTORY} runs`}
              >
                {formatMetric(value, column.unit)}
              </span>
            )}
          </Table.Cell>
        );
      })}
      <Table.Cell className="text-right">
        {onRun ? (
          <Button
            size="xs"
            variant="secondary"
            shape="square"
            aria-label={`Run ${row.scenario?.name ?? row.evalId}`}
            title="Run again"
            icon={<PlayIcon weight="fill" />}
            onClick={onRun}
          />
        ) : null}
      </Table.Cell>
    </Table.Row>
  );
}

function sortValue(row: ScoreboardRow, key: string): number | undefined {
  if (key === 'score') return row.runs[0]?.score;
  if (key === 'meanScore') return row.meanScore;
  if (key === 'passRate') return row.passRate;
  if (key.startsWith('metric:')) return row.metrics[key.slice(7)];
  return undefined;
}

/** Rows without a value sort last in either direction. */
function bySortColumn(
  a: ScoreboardRow,
  b: ScoreboardRow,
  sort: SortState,
): number {
  if (!sort.key) return 0;
  const left = sortValue(a, sort.key);
  const right = sortValue(b, sort.key);
  if (left === undefined || right === undefined)
    return left === right ? 0 : left === undefined ? 1 : -1;
  return sort.direction === 'asc' ? left - right : right - left;
}

function columnRanges(
  rows: readonly ScoreboardRow[],
  columns: readonly MetricColumn[],
): Map<string, { min: number; max: number }> {
  const ranges = new Map<string, { min: number; max: number }>();
  for (const column of columns) {
    const values = rows
      .map((row) => row.metrics[column.name])
      .filter((value): value is number => value !== undefined);
    if (values.length)
      ranges.set(column.name, {
        min: Math.min(...values),
        max: Math.max(...values),
      });
  }
  return ranges;
}

/** Green for the best of the shown rows, red for the worst; uncoloured when no direction is better. */
export function metricTint(
  value: number,
  column: MetricColumn,
  range: { min: number; max: number } | undefined,
): string {
  if (!column.better || !range || range.max === range.min) return '';
  const position = (value - range.min) / (range.max - range.min);
  return rateTint(column.better === 'lower' ? 1 - position : position);
}

/** One square per run, oldest on the left; each opens its run. */
function History({ runs }: { runs: readonly RunSummary[] }) {
  const slots = [
    ...Array<undefined>(Math.max(0, HISTORY - runs.length)).fill(undefined),
    ...[...runs].reverse(),
  ];
  return (
    <span className="history inline-flex items-center gap-0.5">
      {slots.map((run, index) =>
        run ? (
          <Link
            key={run.id}
            to={runHref(run.id)}
            className={`size-3.5 rounded-[3px] hover:ring-2 hover:ring-kumo-focus ${outcomeFill[run.status]}`}
            title={`${outcomeLabel[run.status]} · score ${formatScore(run.score)} · ${new Date(run.startedAt).toLocaleString()}`}
            aria-label={`${outcomeLabel[run.status]} run ${run.id.slice(0, 8)}`}
          />
        ) : (
          <span
            key={`empty-${index}`}
            aria-hidden
            className="size-3.5 rounded-[3px] border border-dashed border-kumo-hairline"
          />
        ),
      )}
    </span>
  );
}

const TALLY: Outcome[] = ['passed', 'failed', 'errored', 'running', 'not-run'];

/** How many rows are in each state, as big numbers. */
function Tally({ rows }: { rows: readonly ScoreboardRow[] }) {
  return (
    <div className="tally grid grid-cols-2 gap-2 sm:grid-cols-5">
      {TALLY.map((outcome) => {
        const count = rows.filter((row) => row.outcome === outcome).length;
        return (
          <div
            key={outcome}
            data-outcome={outcome}
            className={`flex items-center gap-3 rounded-lg border border-kumo-line px-3 py-2 ${count ? outcomeTint[outcome] : ''}`}
          >
            <span
              aria-hidden
              className={`size-3 rounded-full ${outcomeFill[outcome]}`}
            />
            <span className="text-xl font-semibold text-kumo-strong tabular-nums">
              {count}
            </span>
            <span className="text-xs text-kumo-subtle">
              {outcomeLabel[outcome]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A suite's rows as one stacked bar, worst first. */
function OutcomeBar({ rows }: { rows: readonly ScoreboardRow[] }) {
  const sorted = [...rows].sort(
    (a, b) => outcomeSeverity[a.outcome] - outcomeSeverity[b.outcome],
  );
  const passed = rows.filter((row) => row.outcome === 'passed').length;
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-2 w-40 overflow-hidden rounded-full bg-kumo-fill">
        {sorted.map((row) => (
          <span
            key={row.key}
            className={`h-full flex-1 ${outcomeFill[row.outcome]}`}
          />
        ))}
      </span>
      <span className={`${monoClass} text-kumo-subtle`}>
        {passed}/{rows.length}
      </span>
    </span>
  );
}
