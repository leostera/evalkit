import type { CatalogEval, RunSummary } from '../api.js';
import { agentName } from './agentName.js';
export function EvalRow({
  id,
  evaluation,
  onRun,
  runDisabled = false,
  onOpen,
  status,
}: {
  id: string;
  evaluation?: CatalogEval;
  onRun?: () => void;
  runDisabled?: boolean;
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
        {onRun || runDisabled ? (
          <button
            disabled={runDisabled}
            title={
              runDisabled
                ? 'Select one value for each matrix axis before running'
                : undefined
            }
            onClick={(event) => {
              event.stopPropagation();
              onRun?.();
            }}
          >
            Run eval
          </button>
        ) : null}
      </td>
    </tr>
  );
}
