import { Table } from '@cloudflare/kumo';
import type { ReactNode } from 'react';
import { DataTable, NestedTable } from './DataTable.js';
import { SortableHeader, type SortState } from './SortableTable.js';

/** Column count beyond the matrix axes: eval, agent, runtime, trials, latest run, actions. */
export const fixedCellColumns = 6;

export function MatrixCellFrame({
  nested,
  children,
}: {
  nested: boolean;
  children: ReactNode;
}) {
  return nested ? (
    <NestedTable>{children}</NestedTable>
  ) : (
    <DataTable>{children}</DataTable>
  );
}

/**
 * Header for matrix cell tables. The server-paged planner cannot sort by
 * runtime or latest run, so those columns are plain when `planned` is set.
 */
export function MatrixCellHeader({
  axes,
  sort,
  onSort,
  planned = false,
}: {
  axes: readonly string[];
  sort: SortState;
  onSort(key: string): void;
  planned?: boolean;
}) {
  const sortable = (label: string, key: string) => (
    <SortableHeader label={label} sortKey={key} sort={sort} onSort={onSort} />
  );
  return (
    <Table.Header variant="compact">
      <Table.Row>
        {sortable('Scenario', 'eval')}
        {axes.map((axis) => (
          <SortableHeader
            key={axis}
            label={axis}
            sortKey={`axis:${axis}`}
            sort={sort}
            onSort={onSort}
          />
        ))}
        {sortable('Agent', 'agent')}
        {planned ? (
          <Table.Head>Runtime</Table.Head>
        ) : (
          sortable('Runtime', 'runtime')
        )}
        {sortable('Trials', 'trials')}
        {planned ? (
          <Table.Head>Latest run</Table.Head>
        ) : (
          sortable('Latest run', 'status')
        )}
        <Table.Head className="text-right">Actions</Table.Head>
      </Table.Row>
    </Table.Header>
  );
}
