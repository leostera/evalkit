import { Select, Table } from '@cloudflare/kumo';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RunSummary } from '../api.js';
import { DataTable, monoClass } from './DataTable.js';
import { formatMetric, formatScore } from './run-columns.js';
import { HISTORY, metricTint } from './Scoreboard.js';
import { pivot, pivotAxes, pivotMeasures, type PivotMeasure } from './pivot.js';
import { rateTint } from './status-colors.js';

const NONE = '-';

/**
 * Results by parameter: one parameter down, optionally another across, and
 * a choice of pass rate, mean score or a metric in each cell. The choices
 * live in the URL (`by`, `across`, `show`) so a view can be shared.
 */
export function ComparePivot({
  runs,
  order,
}: {
  runs: readonly RunSummary[];
  /** The matrix's declared value order, when there is one. */
  order?: Record<string, readonly unknown[]>;
}) {
  const [params, setParams] = useSearchParams();
  const axes = useMemo(() => pivotAxes(runs), [runs]);
  const measures = useMemo(() => pivotMeasures(runs), [runs]);
  const rowAxis = axes.includes(params.get('by') ?? '')
    ? params.get('by')!
    : axes[0];
  const requestedColumn = params.get('across');
  const columnAxis =
    requestedColumn === NONE
      ? undefined
      : requestedColumn &&
          requestedColumn !== rowAxis &&
          axes.includes(requestedColumn)
        ? requestedColumn
        : axes.find((axis) => axis !== rowAxis);
  const shown =
    measures.find((entry) => entry.id === params.get('show')) ?? measures[0]!;
  const table = useMemo(
    () =>
      rowAxis
        ? pivot(runs, rowAxis, columnAxis, shown.measure, order)
        : undefined,
    [runs, rowAxis, columnAxis, shown, order],
  );
  if (!rowAxis || !table || !table.rows.length) return null;

  const choose = (name: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(name, value);
        return next;
      },
      { replace: true },
    );
  const values = table.rows.flatMap((row) =>
    table.columns
      .map((column) => table.cells[row.key]?.[column.key]?.value)
      .filter((value): value is number => value !== undefined),
  );
  const range = values.length
    ? { min: Math.min(...values), max: Math.max(...values) }
    : undefined;

  return (
    <section aria-label="Compare" className="compare flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-sm font-semibold text-kumo-strong">
          Compare{' '}
          <span className="font-normal text-kumo-subtle">
            newest {HISTORY} finished runs per parameter combination
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Rows"
            size="sm"
            className="min-w-32"
            value={rowAxis}
            onValueChange={(value) => value && choose('by', String(value))}
            items={Object.fromEntries(
              axes.map((axis) => [axis, `Rows: ${axis}`]),
            )}
          />
          <Select
            aria-label="Columns"
            size="sm"
            className="min-w-32"
            value={columnAxis ?? NONE}
            onValueChange={(value) => value && choose('across', String(value))}
            items={{
              [NONE]: 'Columns: none',
              ...Object.fromEntries(
                axes
                  .filter((axis) => axis !== rowAxis)
                  .map((axis) => [axis, `Columns: ${axis}`]),
              ),
            }}
          />
          <Select
            aria-label="Show"
            size="sm"
            className="min-w-36"
            value={shown.id}
            onValueChange={(value) => value && choose('show', String(value))}
            items={Object.fromEntries(
              measures.map((entry) => [entry.id, entry.label]),
            )}
          />
        </div>
      </div>
      <DataTable className="w-fit max-w-full">
        <Table.Header>
          <Table.Row>
            <Table.Head>
              {rowAxis}
              {columnAxis ? (
                <span className="font-normal"> ↓ · {columnAxis} →</span>
              ) : null}
            </Table.Head>
            {table.columns.map((column) => (
              <Table.Head key={column.key} className="text-right">
                {columnAxis ? (
                  <span className={monoClass}>{column.label}</span>
                ) : (
                  shown.label
                )}
              </Table.Head>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {table.rows.map((row) => (
            <Table.Row key={row.key}>
              <Table.Cell>
                <span className={monoClass}>{row.label}</span>
              </Table.Cell>
              {table.columns.map((column) => {
                const cell = table.cells[row.key]?.[column.key];
                return (
                  <Table.Cell key={column.key} className="text-right">
                    <PivotValue
                      value={cell?.value}
                      runs={cell?.runs ?? 0}
                      measure={shown.measure}
                      range={range}
                    />
                  </Table.Cell>
                );
              })}
            </Table.Row>
          ))}
        </Table.Body>
      </DataTable>
    </section>
  );
}

function PivotValue({
  value,
  runs,
  measure,
  range,
}: {
  value: number | undefined;
  runs: number;
  measure: PivotMeasure;
  range?: { min: number; max: number };
}) {
  if (value === undefined)
    return (
      <span
        className="text-kumo-subtle"
        title={runs ? 'Not measured' : 'No finished runs'}
      >
        —
      </span>
    );
  const text =
    measure.kind === 'pass-rate'
      ? `${Math.round(value * 100)}%`
      : measure.kind === 'score'
        ? formatScore(value)
        : formatMetric(value, measure.metric.unit);
  const tint =
    measure.kind === 'metric'
      ? metricTint(value, measure.metric, range)
      : rateTint(value);
  return (
    <span className="inline-flex flex-col items-end">
      <span
        className={`inline-block min-w-12 rounded px-1.5 py-0.5 text-center tabular-nums ${tint}`}
      >
        {text}
      </span>
      <span className="text-[11px] text-kumo-subtle tabular-nums">
        {runs} {runs === 1 ? 'run' : 'runs'}
      </span>
    </span>
  );
}
