import type { TrialSummary } from '../api.js';
export function TrialRow({
  trial,
  onSelect,
}: {
  trial: TrialSummary;
  onSelect(): void;
}) {
  return (
    <tr onClick={onSelect}>
      <td>{trial.index + 1}</td>
      <td>{trial.status}</td>
      <td>{trial.score ?? '—'}</td>
      <td>{trial.durationMs === undefined ? '—' : `${trial.durationMs}ms`}</td>
      <td>{new Date(trial.startedAt).toLocaleString()}</td>
    </tr>
  );
}
