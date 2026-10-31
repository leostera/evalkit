import { canonicalParameters } from '@evalkit/core/canonical-json';
import type { JsonValue } from '@evalkit/core';
import type { RunSummary } from '../api.js';
import { monoClass } from './DataTable.js';

/** More varying parameters than this go into one wrapped Parameters cell. */
export const MAX_PARAMETER_COLUMNS = 3;

export function displayValue(value: unknown): string {
  return typeof value === 'string'
    ? value
    : (JSON.stringify(value) ?? String(value));
}

export type ParameterLayout = {
  /** Parameters that differ between runs, each a sortable column. */
  columns: string[];
  /** Further differing parameters, shown together in one cell. */
  overflow: string[];
  /** Parameters with the same value on every run: said once, not per row. */
  constant: Array<[key: string, value: unknown]>;
};

/**
 * Which saved parameters earn a column. A parameter that has the same value
 * on every listed run says nothing per row, so it is listed once above the
 * table; only differing ones become columns, and only a few, so a wide
 * matrix cannot make the table unreadably wide.
 */
export function parameterLayout(runs: readonly RunSummary[]): ParameterLayout {
  const keys = [
    ...new Set(runs.flatMap((run) => Object.keys(run.parameters ?? {}))),
  ].sort();
  const varying: string[] = [];
  const constant: Array<[string, unknown]> = [];
  for (const key of keys) {
    const values = new Set(
      runs.map((run) =>
        Object.hasOwn(run.parameters ?? {}, key)
          ? canonicalParameters(run.parameters![key] as JsonValue)
          : undefined,
      ),
    );
    if (values.size === 1 && runs.length > 1)
      constant.push([key, runs[0]!.parameters![key]]);
    else varying.push(key);
  }
  return {
    columns: varying.slice(0, MAX_PARAMETER_COLUMNS),
    overflow: varying.slice(MAX_PARAMETER_COLUMNS),
    constant,
  };
}

/** `key=value` chips that wrap; for notes above a table, not table cells. */
export function ParameterChips({
  entries,
}: {
  entries: ReadonlyArray<readonly [string, unknown]>;
}) {
  if (!entries.length) return <span className="text-kumo-subtle">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className={`${monoClass} max-w-[20rem] truncate rounded border border-kumo-hairline px-1 text-[11px]`}
          title={`${key}=${displayValue(value)}`}
        >
          <span className="text-kumo-subtle">{key}=</span>
          {displayValue(value)}
        </span>
      ))}
    </span>
  );
}

/**
 * The parameters without a column of their own, on one line cut short; the
 * tooltip lists them all, one per line.
 */
export function OtherParametersCell({
  run,
  keys,
}: {
  run: RunSummary;
  keys: readonly string[];
}) {
  const entries = keys.flatMap((key) =>
    Object.hasOwn(run.parameters ?? {}, key)
      ? [`${key}=${displayValue(run.parameters![key])}`]
      : [],
  );
  if (!entries.length) return <span className="text-kumo-subtle">—</span>;
  return (
    <span
      className={`${monoClass} block max-w-[16rem] truncate text-xs`}
      title={entries.join('\n')}
    >
      {entries.join(' · ')}
    </span>
  );
}

/** A parameter column's cell: one line, cut short with the full value on hover. */
export function ParameterCell({
  run,
  name,
}: {
  run: RunSummary;
  name: string;
}) {
  const present = Object.hasOwn(run.parameters ?? {}, name);
  const text = present ? displayValue(run.parameters?.[name]) : '—';
  return (
    <span
      className={`${monoClass} block max-w-[10rem] truncate`}
      title={present ? text : 'Not set on this run'}
    >
      {text}
    </span>
  );
}

/** "3 min ago" for recent runs; the exact time is in the tooltip. */
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds)) return iso;
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  if (seconds < 7 * 86_400) return `${Math.round(seconds / 86_400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Scores are means over trials; two decimals are enough to compare them. */
export function formatScore(score: number | undefined): string {
  if (score === undefined) return '—';
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
}

export function formatDuration(ms: number | undefined): string | undefined {
  if (ms === undefined) return undefined;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/** `ms` reads as a duration, large counts compactly (`399k`), the rest as numbers. */
export function formatMetric(value: number, unit?: string): string {
  if (unit === 'ms') return formatDuration(value)!;
  const number =
    Math.abs(value) >= 10_000
      ? new Intl.NumberFormat('en', {
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(value)
      : Number.isInteger(value)
        ? value.toLocaleString('en')
        : value.toFixed(value < 10 ? 2 : 1);
  return unit && unit !== 'tokens' ? `${number} ${unit}` : number;
}

/** The score, with how many trials it is over underneath. */
export function ScoreCell({ run }: { run: RunSummary }) {
  return (
    <span className="flex flex-col tabular-nums">
      <span>{formatScore(run.score)}</span>
      <span className="text-xs text-kumo-subtle">
        {run.completedTrials}/{run.requestedTrials} trials
      </span>
    </span>
  );
}

/** When the run started ("3 h ago"), with how long it took underneath. */
export function StartedCell({ run }: { run: RunSummary }) {
  const duration = formatDuration(run.durationMs);
  return (
    <span
      className="flex flex-col tabular-nums"
      title={new Date(run.startedAt).toLocaleString()}
    >
      <span>{relativeTime(run.startedAt)}</span>
      {duration ? (
        <span className="text-xs text-kumo-subtle">took {duration}</span>
      ) : null}
    </span>
  );
}
