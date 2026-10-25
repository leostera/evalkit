import { Table } from '@cloudflare/kumo';
import type { CatalogEval } from '../api.js';
import { DataTable } from './DataTable.js';
import { Empty } from './Empty.js';
import { FixtureRow } from './FixtureRow.js';

export function FixtureTable({ catalog }: { catalog: CatalogEval[] }) {
  const fixtures = catalog.flatMap((evaluation) =>
    evaluation.fixtures.map((fixture) => ({
      ...fixture,
      path: evaluation.path,
    })),
  );
  if (!fixtures.length) return <Empty message="No fixtures are registered." />;
  return (
    <DataTable>
      <Table.Header variant="compact">
        <Table.Row>
          <Table.Head>Source</Table.Head>
          <Table.Head>Destination</Table.Head>
          <Table.Head>Visibility</Table.Head>
          <Table.Head>Used by</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {fixtures.map((fixture, index) => (
          <FixtureRow key={`${fixture.path}-${index}`} fixture={fixture} />
        ))}
      </Table.Body>
    </DataTable>
  );
}
