import { Table } from '@cloudflare/kumo';
import type { CatalogEval } from '../api.js';
import { agentName } from './agentName.js';
import { monoClass } from './DataTable.js';

export function AgentRow({ entries }: { entries: CatalogEval[] }) {
  const first = entries[0]!;
  return (
    <Table.Row>
      <Table.Cell className={monoClass}>{first.agent.id ?? '—'}</Table.Cell>
      <Table.Cell className="font-medium">{agentName(first)}</Table.Cell>
      <Table.Cell>{first.agent.kind}</Table.Cell>
      <Table.Cell>
        {first.agent.runtimes
          .map((runtime) => `${runtime.name} (${runtime.kind})`)
          .join(', ') || 'adapter default'}
      </Table.Cell>
      <Table.Cell className="tabular-nums">{entries.length}</Table.Cell>
    </Table.Row>
  );
}
