import { Table } from '@cloudflare/kumo';
import { useEffect, useMemo } from 'react';
import type { CatalogEval } from '../api.js';
import { AgentRow } from './AgentRow.js';
import { agentKey } from './agentName.js';
import { DataTable } from './DataTable.js';
import { Empty } from './Empty.js';

export function AgentTable({
  catalog,
  selectedAgent,
}: {
  catalog: CatalogEval[];
  /** From `?agent=`: highlighted and scrolled into view. */
  selectedAgent?: string;
}) {
  const agents = useMemo(() => {
    const groups = new Map<string, CatalogEval[]>();
    for (const entry of catalog) {
      const key = agentKey(entry);
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return [...groups.values()];
  }, [catalog]);
  useEffect(() => {
    if (!selectedAgent) return;
    document
      .querySelector(`[data-agent="${CSS.escape(selectedAgent)}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [selectedAgent, agents]);
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
            key={agentKey(entries[0]!)}
            entries={entries}
            selected={agentKey(entries[0]!) === selectedAgent}
          />
        ))}
      </Table.Body>
    </DataTable>
  );
}
