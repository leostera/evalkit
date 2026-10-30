import { Table } from '@cloudflare/kumo';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { RunSummary, TrialSummary } from '../api.js';
import { NestedTable, tableLinkClass, TableMessage } from './DataTable.js';
import { trialHref } from './links.js';
import { rowLinkProps } from './row-link.js';
import { SortableHeader, useSort, useSortedRows } from './SortableTable.js';
import { StatusBadge } from './StatusBadge.js';

/** A run's trials; each row opens that trial's page. */
export function TrialTable({
  run,
  trials,
}: {
  run: RunSummary;
  trials: TrialSummary[];
}) {
  const { sort, toggleSort: onSort } = useSort({
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
  return (
    <NestedTable>
      <Table.Header variant="compact">
        <Table.Row>
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
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {sorted.map((trial) => (
          <Table.Row key={trial.id} {...rowLinkProps}>
            <Table.Cell className="tabular-nums">
              <Link
                to={trialHref(run.id, trial.id)}
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
            <Table.Cell className="tabular-nums">
              {trial.score ?? '—'}
            </Table.Cell>
            {scorerNames.map((name) => (
              <Table.Cell key={name} className="tabular-nums">
                {(trial.scores ?? []).find((score) => score.name === name)
                  ?.value ?? '—'}
              </Table.Cell>
            ))}
            <Table.Cell className="tabular-nums">
              {trial.durationMs === undefined ? '—' : `${trial.durationMs}ms`}
            </Table.Cell>
            <Table.Cell className="whitespace-nowrap tabular-nums">
              {new Date(trial.startedAt).toLocaleString()}
            </Table.Cell>
          </Table.Row>
        ))}
        {!sorted.length ? (
          <TableMessage colSpan={scorerNames.length + 5}>
            No trials saved yet.
          </TableMessage>
        ) : null}
      </Table.Body>
    </NestedTable>
  );
}
