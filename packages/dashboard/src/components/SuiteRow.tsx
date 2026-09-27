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
    <tr onClick={onToggle}>
      <td>
        <button className="mono">
          {suite.name ?? suite.id ?? 'Unnamed suite'}
        </button>
      </td>
      <td>{suite.evalIds.length}</td>
      <td>{expanded ? 'expanded' : 'configured'}</td>
      <td>
        <button
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
