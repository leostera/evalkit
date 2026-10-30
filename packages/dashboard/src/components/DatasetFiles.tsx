import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DashboardApi, DatasetListing } from '../api.js';
import { FileTree } from './FileTree.js';

/**
 * Browses the files a static dataset places in each workspace. Computed
 * datasets only produce files when a trial runs, so they point there instead.
 */
export function DatasetFiles({
  api,
  datasetId,
  mount,
  evaluatorOnly,
}: {
  api: DashboardApi;
  datasetId: string;
  mount: string;
  /** Evaluator datasets are listed but not copied into snapshots. */
  evaluatorOnly: boolean;
}) {
  const [state, setState] = useState<{
    id?: string;
    listing?: DatasetListing;
    error?: string;
  }>({});
  const [search, setSearch] = useSearchParams();
  useEffect(() => {
    let active = true;
    void api
      .listDatasetFiles(datasetId)
      .then((listing) => {
        if (active) setState({ id: datasetId, listing });
      })
      .catch((cause: unknown) => {
        if (active)
          setState({
            id: datasetId,
            error:
              cause instanceof Error ? cause.message : 'Unable to list files',
          });
      });
    return () => {
      active = false;
    };
  }, [api, datasetId]);
  const readFile = useCallback(
    (path: string) => api.getDatasetFile(datasetId, path),
    [api, datasetId],
  );
  const current = state.id === datasetId ? state : {};
  const root = mount === '.' ? 'workspace/' : `workspace/${mount}/`;
  return (
    <section className="flex flex-col gap-2" aria-label="Dataset files">
      <h2 className="text-sm font-semibold text-kumo-strong">Files</h2>
      {current.error ? (
        <p className="text-[13px] text-kumo-subtle">
          The file list is not available here.
        </p>
      ) : !current.listing ? (
        <p className="text-[13px] text-kumo-subtle">Loading files…</p>
      ) : current.listing.kind === 'computed' ? (
        <p className="text-[13px] text-kumo-subtle">
          Its files are computed when a trial starts; open a trial&apos;s
          workspace to see them.
        </p>
      ) : (
        <FileTree
          entries={current.listing.files.map((file) => ({
            ...file,
            kind: 'file' as const,
          }))}
          rootLabel={root}
          readFile={api.readOnly && evaluatorOnly ? undefined : readFile}
          selected={search.get('file') ?? undefined}
          onSelect={(file) => {
            const next = new URLSearchParams(search);
            next.set('file', file);
            setSearch(next, { replace: true });
          }}
          emptyMessage="This dataset has no files; it only provides a value."
        />
      )}
    </section>
  );
}
