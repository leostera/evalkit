import { Table } from '@cloudflare/kumo';
import type { CatalogEval } from '../api.js';
import { monoClass } from './DataTable.js';

export function FixtureRow({
  fixture,
}: {
  fixture: CatalogEval['fixtures'][number] & { path: string };
}) {
  return (
    <Table.Row>
      <Table.Cell className={monoClass}>{fixture.source}</Table.Cell>
      <Table.Cell className={monoClass}>
        {fixture.destination ?? '—'}
      </Table.Cell>
      <Table.Cell>{fixture.visibility ?? 'dynamic'}</Table.Cell>
      <Table.Cell className={monoClass}>{fixture.path}</Table.Cell>
    </Table.Row>
  );
}
