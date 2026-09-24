import type { CatalogEval } from '../api.js';
import { Empty } from './Empty.js';
import { agentName } from './agentName.js';
export function EvalDetail({
  catalog,
  path,
}: {
  catalog: CatalogEval[];
  path: string;
}) {
  const evaluation = catalog.find((entry) => entry.path === path);
  if (!evaluation) return <Empty message={`Eval not found: ${path}`} />;
  return (
    <section className="card">
      <p className="mono">{evaluation.path}</p>
      <h2>{evaluation.name ?? evaluation.id}</h2>
      <table className="event-fields">
        <tbody>
          <tr>
            <td>agent</td>
            <td>{agentName(evaluation)}</td>
          </tr>
          <tr>
            <td>runtimes</td>
            <td>
              {evaluation.agent.runtimes
                .map((runtime) => `${runtime.name} (${runtime.kind})`)
                .join(', ') || 'default'}
            </td>
          </tr>
          <tr>
            <td>trials</td>
            <td>{evaluation.trialCount}</td>
          </tr>
          <tr>
            <td>scorers</td>
            <td>
              {evaluation.scorers
                .map((scorer) => `${scorer.name} (${scorer.kind})`)
                .join(', ') || 'none'}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
