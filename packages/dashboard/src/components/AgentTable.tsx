import { Table } from '@cloudflare/kumo';
import { useMemo } from 'react';
import type { CatalogEval } from '../api.js';
import { AgentRow } from './AgentRow.js';
import { agentName } from './agentName.js';
import { DataTable } from './DataTable.js';
import { Empty } from './Empty.js';

export function AgentTable({ catalog }: { catalog: CatalogEval[] }) {
  const agents = useMemo(() => {
    const groups = new Map<string, CatalogEval[]>();
    for (const entry of catalog) {
      const key = entry.agent.id ?? agentName(entry);
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return [...groups.values()];
  }, [catalog]);
  if (!agents.length) return <Empty message="No agents are registered." />;
  return (
    <DataTable>
      <Table.Header variant="compact">
        <Table.Row>
          <Table.Head>ID</Table.Head>
          <Table.Head>Agent</Table.Head>
          <Table.Head>Kind</Table.Head>
          <Table.Head>Runtimes</Table.Head>
          <Table.Head>Evals</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {agents.map((entries) => (
          <AgentRow
            key={entries[0]!.agent.id ?? agentName(entries[0])}
            entries={entries}
          />
        ))}
      </Table.Body>
    </DataTable>
  );
}
