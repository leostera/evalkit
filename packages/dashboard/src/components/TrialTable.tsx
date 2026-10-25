import { Button, Table } from '@cloudflare/kumo';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { useMemo } from 'react';
import type { RunSummary, TrialSummary } from '../api.js';
import { NestedTable, TableMessage } from './DataTable.js';
import { SortableHeader, useSort, useSortedRows } from './SortableTable.js';
import { StatusBadge } from './StatusBadge.js';

export function TrialTable({
  run,
  trials,
  onTrial,
}: {
  run: RunSummary;
  trials: TrialSummary[];
  onTrial(run: RunSummary, trial: TrialSummary): void;
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
          <Table.Head className="text-right">Details</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {sorted.map((trial) => (
          <Table.Row key={trial.id}>
            <Table.Cell className="tabular-nums">{trial.index + 1}</Table.Cell>
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
            <Table.Cell className="text-right">
              <Button
                size="xs"
                variant="secondary"
                className="view-trial"
                onClick={() => onTrial(run, trial)}
              >
                View trial
                <ArrowRightIcon aria-hidden className="size-3" />
              </Button>
            </Table.Cell>
          </Table.Row>
        ))}
        {!sorted.length ? (
          <TableMessage colSpan={scorerNames.length + 6}>
            No trials saved yet.
          </TableMessage>
        ) : null}
      </Table.Body>
    </NestedTable>
  );
}
