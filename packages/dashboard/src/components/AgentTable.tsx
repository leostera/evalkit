import { useMemo } from 'react';
import type { CatalogEval } from '../api.js';
import { AgentRow } from './AgentRow.js';
import { Empty } from './Empty.js';
import { agentName } from './agentName.js';
export function AgentTable({ catalog }: { catalog: CatalogEval[] }) {
  const agents = useMemo(() => {
    const groups = new Map<string, CatalogEval[]>();
    for (const entry of catalog) {
      const name = agentName(entry);
      groups.set(name, [...(groups.get(name) ?? []), entry]);
    }
    return [...groups.values()];
  }, [catalog]);
  if (!agents.length) return <Empty message="No agents are registered." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Kind</th>
            <th>Runtimes</th>
            <th>Evals</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((entries) => (
            <AgentRow key={agentName(entries[0])} entries={entries} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
