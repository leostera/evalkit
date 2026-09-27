import type { CatalogEval } from '../api.js';
import { agentName } from './agentName.js';
export function AgentRow({ entries }: { entries: CatalogEval[] }) {
  const first = entries[0]!;
  return (
    <tr>
      <td className="mono">{first.agent.id ?? '—'}</td>
      <td>{agentName(first)}</td>
      <td>{first.agent.kind}</td>
      <td>
        {first.agent.runtimes
          .map((runtime) => `${runtime.name} (${runtime.kind})`)
          .join(', ') || 'adapter default'}
      </td>
      <td>{entries.length}</td>
    </tr>
  );
}
