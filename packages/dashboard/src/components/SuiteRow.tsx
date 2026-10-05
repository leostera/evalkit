import type { SuiteSummary } from '../api.js';
export function SuiteRow({
  suite,
  expanded,
  onToggle,
  onRun,
}: {
  suite: SuiteSummary;
  expanded: boolean;
  onToggle(): void;
  onRun?: () => void;
}) {
  return (
    <tr>
      <td className="identity-cell">
        <button
          type="button"
          className="table-link mono"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {suite.name ?? suite.id ?? 'Unnamed suite'}
        </button>
      </td>
      <td>{suite.evalIds.length}</td>
      <td>{expanded ? 'expanded' : 'configured'}</td>
      <td>
        <button
          type="button"
          disabled={!onRun}
          title={
            onRun ? undefined : 'Run matrix cells individually from their rows'
          }
          onClick={(event) => {
            event.stopPropagation();
            onRun?.();
          }}
        >
          Run suite
        </button>
      </td>
    </tr>
  );
}
