import { canonicalParameters } from '@evalkit/core/canonical-json';
import type { JsonValue } from '@evalkit/core';
import type { RunSummary } from '../api.js';
import { displayValue } from './run-columns.js';
import { HISTORY, metricColumns, type MetricColumn } from './Scoreboard.js';

/** What a pivot cell shows: the pass rate, the mean score, or a metric's mean. */
export type PivotMeasure =
  | { kind: 'pass-rate' }
  | { kind: 'score' }
  | { kind: 'metric'; metric: MetricColumn };

export type PivotAxisValue = { key: string; label: string; value: unknown };

export type PivotCell = {
  /** Undefined when no counted run measured it. */
  value?: number;
  /** Finished runs counted in the cell. */
  runs: number;
};

export type Pivot = {
  rows: PivotAxisValue[];
  /** A single unnamed column when there is no column axis. */
  columns: PivotAxisValue[];
  /** `cells[row][column]`, by axis value key. */
  cells: Record<string, Record<string, PivotCell>>;
};

const FINISHED = new Set(['passed', 'failed', 'errored']);
const ALL = '\0all';

function valueKey(value: unknown): string {
  return canonicalParameters((value ?? null) as JsonValue);
}

/** Parameters whose value differs between the runs: the axes worth pivoting on. */
export function pivotAxes(runs: readonly RunSummary[]): string[] {
  const values = new Map<string, Set<string>>();
  for (const run of runs)
    for (const [name, value] of Object.entries(run.parameters ?? {}))
      values.set(name, (values.get(name) ?? new Set()).add(valueKey(value)));
  const present = (name: string) =>
    runs.every((run) => run.parameters && name in run.parameters);
  return [...values]
    .filter(([name, seen]) => seen.size > 1 || !present(name))
    .map(([name]) => name)
    .sort();
}

/** Pass rate first, then the mean score, then each metric the runs recorded. */
export function pivotMeasures(
  runs: readonly RunSummary[],
): Array<{ id: string; label: string; measure: PivotMeasure }> {
  return [
    { id: 'pass-rate', label: 'Pass rate', measure: { kind: 'pass-rate' } },
    { id: 'score', label: 'Mean score', measure: { kind: 'score' } },
    ...metricColumns(runs).map((metric) => ({
      id: `metric:${metric.name}`,
      label: `Mean ${metric.name}`,
      measure: { kind: 'metric' as const, metric },
    })),
  ];
}

/**
 * Finished runs grouped by one parameter down and optionally another across.
 * Like the scoreboard, each exact parameter combination counts its newest
 * HISTORY finished runs, so an often-rerun cell does not outweigh the rest.
 * Values follow `order` (the matrix's declared order) and then sort by label.
 */
export function pivot(
  runs: readonly RunSummary[],
  rowAxis: string,
  columnAxis: string | undefined,
  measure: PivotMeasure,
  order: Record<string, readonly unknown[]> = {},
): Pivot {
  const combinations = new Map<string, RunSummary[]>();
  for (const run of runs) {
    if (run.archived || !FINISHED.has(run.status)) continue;
    const key = canonicalParameters((run.parameters ?? {}) as JsonValue);
    combinations.set(key, [...(combinations.get(key) ?? []), run]);
  }
  const counted = [...combinations.values()].flatMap((members) =>
    members
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, HISTORY),
  );

  const rows = axisValues(counted, rowAxis, order[rowAxis]);
  const columns = columnAxis
    ? axisValues(counted, columnAxis, order[columnAxis])
    : [{ key: ALL, label: '', value: undefined }];
  const groups = new Map<string, RunSummary[]>();
  for (const run of counted) {
    const row = valueKey(run.parameters?.[rowAxis]);
    const column = columnAxis ? valueKey(run.parameters?.[columnAxis]) : ALL;
    const key = `${row}\0${column}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  const cells: Pivot['cells'] = {};
  for (const row of rows) {
    cells[row.key] = {};
    for (const column of columns) {
      const members = groups.get(`${row.key}\0${column.key}`) ?? [];
      const value = measured(members, measure);
      cells[row.key]![column.key] = {
        runs: members.length,
        ...(value === undefined ? {} : { value }),
      };
    }
  }
  return { rows, columns, cells };
}

function axisValues(
  runs: readonly RunSummary[],
  axis: string,
  declared: readonly unknown[] = [],
): PivotAxisValue[] {
  const values = new Map<string, PivotAxisValue>();
  for (const run of runs) {
    const value = run.parameters?.[axis];
    const key = valueKey(value);
    if (!values.has(key))
      values.set(key, {
        key,
        label: value === undefined ? '(not set)' : displayValue(value),
        value,
      });
  }
  const rank = (entry: PivotAxisValue) => {
    const index = declared.findIndex((value) => valueKey(value) === entry.key);
    return index === -1 ? declared.length : index;
  };
  return [...values.values()].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

function measured(
  runs: readonly RunSummary[],
  measure: PivotMeasure,
): number | undefined {
  if (!runs.length) return undefined;
  if (measure.kind === 'pass-rate')
    return runs.filter((run) => run.status === 'passed').length / runs.length;
  if (measure.kind === 'score') {
    const scores = runs
      .map((run) => run.score)
      .filter((score): score is number => score !== undefined);
    return scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : undefined;
  }
  let sum = 0;
  let count = 0;
  for (const run of runs)
    for (const metric of run.metrics ?? [])
      if (
        metric.name === measure.metric.name &&
        metric.mean !== undefined &&
        metric.count
      ) {
        sum += metric.mean * metric.count;
        count += metric.count;
      }
  return count ? sum / count : undefined;
}
