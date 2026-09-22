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
  onRun(): void;
}) {
  return (
    <tr onClick={onToggle}>
      <td>
        <button className="mono">{suite.name ?? suite.uri}</button>
        <small>{suite.uri}</small>
      </td>
      <td>{suite.evalUris.length}</td>
      <td>{expanded ? 'expanded' : 'configured'}</td>
      <td>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRun();
          }}
        >
          Run suite
        </button>
      </td>
    </tr>
  );
}
