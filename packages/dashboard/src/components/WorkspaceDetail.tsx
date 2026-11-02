import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DashboardApi, WorkspaceEntry } from '../api.js';
import { ErrorBanner } from './ErrorBanner.js';
import { FileTree } from './FileTree.js';

/** The candidate workspace a run left behind; the open file is `?file=`. */
export function WorkspaceDetail({
  api,
  runId,
}: {
  api: DashboardApi;
  runId: string;
}) {
  const [entries, setEntries] = useState<WorkspaceEntry[]>();
  const [error, setError] = useState<string>();
  const [search, setSearch] = useSearchParams();
  useEffect(() => {
    let active = true;
    // Do not show the previous run's files while this one loads.
    // oxlint-disable-next-line react/set-state-in-effect
    setEntries(undefined);
    setError(undefined);
    void api
      .listWorkspace(runId)
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
  }, [api, runId]);
  const readFile = useCallback(
    (path: string) => api.getWorkspaceFile(runId, path),
    [api, runId],
  );
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
