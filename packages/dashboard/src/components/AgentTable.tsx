import { useMemo } from 'react';
import type { CatalogEval } from '../api.js';
import { AgentRow } from './AgentRow.js';
import { Empty } from './Empty.js';
import { agentName } from './agentName.js';
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
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Agent</th>
            <th>Kind</th>
            <th>Runtimes</th>
            <th>Evals</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((entries) => (
            <AgentRow key={entries[0]!.agent.id ?? agentName(entries[0])} entries={entries} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
