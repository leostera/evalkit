import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AttachmentEntry, DashboardApi } from '../api.js';
import { FileTree, formatBytes } from './FileTree.js';

/** Files the agent or scorers attached to a run; the open file is `?file=`. */
export function AttachmentsDetail({
  api,
  runId,
  attachments,
}: {
  api: DashboardApi;
  runId: string;
  attachments: readonly AttachmentEntry[];
}) {
  const [search, setSearch] = useSearchParams();
  const readFile = useCallback(
    (name: string) => api.getAttachment(runId, name),
    [api, runId],
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
        emptyMessage="Nothing was attached to this run."
      />
    </section>
  );
}
