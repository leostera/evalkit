import { Table } from '@cloudflare/kumo';
import { FileIcon, FolderIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { DashboardApi } from '../api.js';
import { DataTable, monoClass, TableMessage } from './DataTable.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import type { SelectedTrial } from './types.js';

export function WorkspaceDetail({
  api,
  selected,
}: {
  api: DashboardApi;
  selected?: SelectedTrial;
}) {
  const [entries, setEntries] =
    useState<Awaited<ReturnType<DashboardApi['listWorkspace']>>>();
  const [error, setError] = useState<string>();
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
  if (!selected)
    return <Empty message="Select a trial to inspect its workspace." />;
  return (
    <section className="workspace-inspector flex flex-col gap-2">
      {error ? <ErrorBanner message={error} /> : null}
      <DataTable>
        <Table.Header variant="compact">
          <Table.Row>
            <Table.Head>Path</Table.Head>
            <Table.Head>Kind</Table.Head>
            <Table.Head>Size</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {entries?.map((entry) => {
            const Icon = entry.kind === 'directory' ? FolderIcon : FileIcon;
            return (
              <Table.Row key={entry.path}>
                <Table.Cell className={monoClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon aria-hidden className="size-3.5 text-kumo-subtle" />
                    {entry.path}
                  </span>
                </Table.Cell>
                <Table.Cell>{entry.kind}</Table.Cell>
                <Table.Cell className="tabular-nums">
                  {entry.size === undefined ? '—' : `${entry.size} B`}
                </Table.Cell>
              </Table.Row>
            );
          })}
          {!entries && !error ? (
            <TableMessage colSpan={3}>Loading workspace…</TableMessage>
          ) : null}
          {entries && !entries.length ? (
            <TableMessage colSpan={3}>The workspace is empty.</TableMessage>
          ) : null}
        </Table.Body>
      </DataTable>
    </section>
  );
}
