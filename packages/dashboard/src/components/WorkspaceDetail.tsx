import { useEffect, useState } from 'react';
import type { DashboardApi } from '../api.js';
import type { SelectedTrial } from './types.js';
import { Empty } from './Empty.js';
export function WorkspaceDetail({
  api,
  selected,
}: {
  api: DashboardApi;
  selected?: SelectedTrial;
}) {
  const [entries, setEntries] = useState<
    Awaited<ReturnType<DashboardApi['listWorkspace']>>
  >([]);
  useEffect(() => {
    if (selected)
      void api
        .listWorkspace(selected.run.id, selected.trial.id)
        .then(setEntries);
  }, [api, selected]);
  if (!selected)
    return <Empty message="Select a trial to inspect its workspace." />;
  return (
    <section className="workspace-inspector">
      <p className="mono">candidate workspace / {selected.trial.id}</p>
      <table>
        <thead>
          <tr>
            <th>Path</th>
            <th>Kind</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.path}>
              <td className="mono">{entry.path}</td>
              <td>{entry.kind}</td>
              <td>{entry.size ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
