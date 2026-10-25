import { Table } from '@cloudflare/kumo';
import { monoClass } from './DataTable.js';

export function ArtifactRow({
  artifact,
}: {
  artifact: { path: string; kind: string; size?: number };
}) {
  return (
    <Table.Row>
      <Table.Cell className={`${monoClass} break-all`}>
        {artifact.path}
      </Table.Cell>
      <Table.Cell>{artifact.kind}</Table.Cell>
      <Table.Cell className="whitespace-nowrap tabular-nums">
        {artifact.size === undefined ? '—' : `${artifact.size} B`}
      </Table.Cell>
    </Table.Row>
  );
}
