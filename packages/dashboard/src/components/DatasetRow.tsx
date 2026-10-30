import { Table } from '@cloudflare/kumo';
import type { DatasetUsage } from './DatasetTable.js';
import { monoClass } from './DataTable.js';

export function DatasetRow({ dataset }: { dataset: DatasetUsage }) {
  return (
    <Table.Row>
      <Table.Cell>
        <span className={monoClass}>{dataset.id}</span>
        {dataset.name ? (
          <span className="ml-2 text-kumo-subtle">{dataset.name}</span>
        ) : null}
      </Table.Cell>
      <Table.Cell>{dataset.source}</Table.Cell>
      <Table.Cell>{dataset.visibility}</Table.Cell>
      <Table.Cell className={monoClass}>{dataset.mount}</Table.Cell>
      <Table.Cell className={monoClass}>{dataset.usedBy.join(', ')}</Table.Cell>
    </Table.Row>
  );
}
