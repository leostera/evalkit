import type { CatalogEval, RunSummary } from '../api.js';
import { agentName } from './agentName.js';
export function EvalRow({
  id,
  evaluation,
  parameters = [],
  trials,
  onRun,
  runDisabled = false,
  onOpen,
  status,
}: {
  id: string;
  evaluation?: CatalogEval;
  parameters?: readonly unknown[];
  trials?: number;
  onRun?: () => void;
  runDisabled?: boolean;
  onOpen?: () => void;
  status?: RunSummary['status'];
}) {
  return (
    <tr>
      <td className="identity-cell">
        {onOpen ? (
          <button type="button" className="table-link" onClick={onOpen}>
            {evaluation?.name ?? id}
          </button>
        ) : (
          (evaluation?.name ?? id)
        )}
        <small className="mono">{evaluation?.path ?? id}</small>
      </td>
      {parameters.map((value, index) => (
        <td key={index} className="mono">
          {typeof value === 'string' ? value : JSON.stringify(value)}
        </td>
      ))}
      <td>{agentName(evaluation)}</td>
      <td>
        {evaluation?.agent.runtimes.map((runtime) => runtime.name).join(', ') ||
          'default'}
      </td>
      <td>{trials ?? evaluation?.trialCount ?? '—'}</td>
      <td>
        {status ? <span className={`status ${status}`}>{status}</span> : '—'}
      </td>
      <td>
        {onRun || runDisabled ? (
          <button
            type="button"
            disabled={runDisabled}
            title={
              runDisabled ? 'Matrix configuration is still loading' : undefined
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
