import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DashboardApi, WorkspaceEntry } from '../api.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import { FileTree } from './FileTree.js';
import type { SelectedTrial } from './types.js';

/** The candidate workspace a trial left behind; the open file is `?file=`. */
export function WorkspaceDetail({
  api,
  selected,
}: {
  api: DashboardApi;
  selected?: SelectedTrial;
}) {
  const [entries, setEntries] = useState<WorkspaceEntry[]>();
  const [error, setError] = useState<string>();
  const [search, setSearch] = useSearchParams();
  useEffect(() => {
    if (!selected) return;
    let active = true;
    // Do not show the previous trial's files while this one loads.
    // oxlint-disable-next-line react/set-state-in-effect
    setEntries(undefined);
    setError(undefined);
    void api
      .listWorkspace(selected.run.id, selected.trial.id)
      .then((next) => {
        if (active) setEntries(next);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : 'Unable to load workspace',
          );
      });
    return () => {
      active = false;
    };
  }, [api, selected]);
  const runId = selected?.run.id;
  const trialId = selected?.trial.id;
  const readFile = useCallback(
    (path: string) => api.getWorkspaceFile(runId!, trialId!, path),
    [api, runId, trialId],
  );
  if (!selected)
    return <Empty message="Select a trial to inspect its workspace." />;
  return (
    <section className="workspace-inspector flex flex-col gap-2">
      {error ? <ErrorBanner message={error} /> : null}
      {!entries && !error ? (
        <p className="text-[13px] text-kumo-subtle">Loading workspace…</p>
      ) : null}
      {entries ? (
        <FileTree
          entries={entries}
          rootLabel="workspace/"
          readFile={readFile}
          selected={search.get('file') ?? undefined}
          onSelect={(file) => {
            const next = new URLSearchParams(search);
            next.set('file', file);
            setSearch(next, { replace: true });
          }}
          emptyMessage="The workspace is empty."
        />
      ) : null}
    </section>
  );
}
