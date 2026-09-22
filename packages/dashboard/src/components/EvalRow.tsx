import type { CatalogEval } from '../api.js';
import { agentName } from './agentName.js';
export function EvalRow({
  id,
  evaluation,
  onRun,
  onOpen,
}: {
  id: string;
  evaluation?: CatalogEval;
  onRun?: () => void;
  onOpen?: () => void;
}) {
  return (
    <tr onClick={onOpen}>
      <td>
        {evaluation?.name ?? id}
        <small className="mono">{evaluation?.path ?? id}</small>
      </td>
      <td>{agentName(evaluation)}</td>
      <td>
        {evaluation?.agent.runtimes.map((runtime) => runtime.name).join(', ') ||
          'default'}
      </td>
      <td>{evaluation?.trialCount ?? '—'}</td>
      <td>{onRun ? <button onClick={onRun}>Run eval</button> : null}</td>
    </tr>
  );
}
