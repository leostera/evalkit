import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DashboardApi } from '../api.js';
import { FileTree, formatBytes } from './FileTree.js';
import type { SelectedTrial } from './types.js';

/** Files the agent or scorers attached to a trial; the open file is `?file=`. */
export function AttachmentsDetail({
  api,
  selected,
}: {
  api: DashboardApi;
  selected: SelectedTrial;
}) {
  const [search, setSearch] = useSearchParams();
  const attachments = selected.trial.attachments ?? [];
  const { run, trial } = selected;
  const readFile = useCallback(
    (name: string) => api.getAttachment(run.id, trial.id, name),
    [api, run.id, trial.id],
  );
  const truncated = attachments.filter((entry) => entry.truncatedFrom);
  return (
    <section className="attachments flex flex-col gap-2">
      {truncated.length ? (
        <p className="text-[13px] text-kumo-subtle">
          {truncated
            .map(
              (entry) =>
                `${entry.name} keeps its last ${formatBytes(entry.size)} of ${formatBytes(entry.truncatedFrom)}`,
            )
            .join('; ')}
          .
        </p>
      ) : null}
      <FileTree
        entries={attachments.map((entry) => ({
          path: entry.name,
          kind: 'file' as const,
          size: entry.size,
        }))}
        rootLabel="attachments/"
        readFile={readFile}
        selected={search.get('file') ?? undefined}
        onSelect={(file) => {
          const next = new URLSearchParams(search);
          next.set('file', file);
          setSearch(next, { replace: true });
        }}
        emptyMessage="Nothing was attached to this trial."
      />
    </section>
  );
}
