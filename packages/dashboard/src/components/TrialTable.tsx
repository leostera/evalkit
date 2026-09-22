import { useMemo, useState } from 'react';
import type { RunSummary, TrialSummary } from '../api.js';
import {
  SortableHeader,
  useSortedRows,
  type SortState,
} from './SortableTable.js';

export function TrialTable({
  run,
  trials,
  onTrial,
}: {
  run: RunSummary;
  trials: TrialSummary[];
  onTrial(run: RunSummary, trial: TrialSummary): void;
}) {
  const [sort, setSort] = useState<SortState>({
    key: 'index',
    direction: 'asc',
  });
  const scorerNames = useMemo(
    () =>
      [
        ...new Set(
          trials.flatMap((trial) =>
            (trial.scores ?? []).map((score) => score.name),
          ),
        ),
      ].sort(),
    [trials],
  );
  const sorted = useSortedRows(trials, sort, (trial, key) => {
    if (key.startsWith('score:'))
      return (trial.scores ?? []).find((score) => score.name === key.slice(6))
        ?.value;
    return {
      index: trial.index,
      status: trial.status,
      aggregate: trial.score,
      runtime: trial.durationMs,
      started: trial.startedAt,
    }[key as 'index' | 'status' | 'aggregate' | 'runtime' | 'started'];
  });
  const onSort = (key: string) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  return (
    <table className="nested data-table">
      <thead>
        <tr>
          <SortableHeader
            label="Trial"
            sortKey="index"
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
            label="Aggregate"
            sortKey="aggregate"
            sort={sort}
            onSort={onSort}
          />
          {scorerNames.map((name) => (
            <SortableHeader
              key={name}
              label={name}
              sortKey={`score:${name}`}
              sort={sort}
              onSort={onSort}
            />
          ))}
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
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((trial) => (
          <tr key={trial.id}>
            <td>{trial.index + 1}</td>
            <td>
              <span className={`status ${trial.status}`}>{trial.status}</span>
            </td>
            <td>{trial.score ?? '—'}</td>
            {scorerNames.map((name) => (
              <td key={name}>
                {(trial.scores ?? []).find((score) => score.name === name)
                  ?.value ?? '—'}
              </td>
            ))}
            <td>
              {trial.durationMs === undefined ? '—' : `${trial.durationMs}ms`}
            </td>
            <td>{new Date(trial.startedAt).toLocaleString()}</td>
            <td>
              <button onClick={() => onTrial(run, trial)}>View trial →</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
