import type { CatalogEval, RunSummary } from '../api.js';
import { agentName } from './agentName.js';
export function EvalRow({
  id,
  evaluation,
  onRun,
  onOpen,
  status,
}: {
  id: string;
  evaluation?: CatalogEval;
  onRun?: () => void;
  onOpen?: () => void;
  status?: RunSummary['status'];
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
      <td>
        {status ? <span className={`status ${status}`}>{status}</span> : '—'}
      </td>
      <td>
        {onRun ? (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onRun();
            }}
          >
            Run eval
          </button>
        ) : null}
      </td>
    </tr>
  );
}
