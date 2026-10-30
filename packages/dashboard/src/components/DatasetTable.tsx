import { Table } from '@cloudflare/kumo';
import type { CatalogDataset, CatalogEval } from '../api.js';
import { DataTable } from './DataTable.js';
import { Empty } from './Empty.js';
import { DatasetRow } from './DatasetRow.js';

export type DatasetUsage = CatalogDataset & { usedBy: string[] };

/** One row per dataset ID, listing every eval that uses it. */
export function datasetUsage(catalog: CatalogEval[]): DatasetUsage[] {
  const byId = new Map<string, DatasetUsage>();
  for (const evaluation of catalog)
    for (const dataset of evaluation.datasets ?? []) {
      const entry = byId.get(dataset.id) ?? { ...dataset, usedBy: [] };
      entry.usedBy.push(evaluation.path);
      byId.set(dataset.id, entry);
    }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function DatasetTable({ catalog }: { catalog: CatalogEval[] }) {
  const datasets = datasetUsage(catalog);
  if (!datasets.length)
    return <Empty message="No scenario uses a dataset yet." />;
  return (
    <DataTable>
      <Table.Header variant="compact">
        <Table.Row>
          <Table.Head>Dataset</Table.Head>
          <Table.Head>Source</Table.Head>
          <Table.Head>Visibility</Table.Head>
          <Table.Head>Mount</Table.Head>
          <Table.Head>Used by</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {datasets.map((dataset) => (
          <DatasetRow key={dataset.id} dataset={dataset} />
        ))}
      </Table.Body>
    </DataTable>
  );
}
