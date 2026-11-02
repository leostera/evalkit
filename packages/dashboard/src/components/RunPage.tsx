import { Button } from '@cloudflare/kumo';
import { FolderOpenIcon, PaperclipIcon } from '@phosphor-icons/react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { CatalogEval, DashboardApi, RunSummary } from '../api.js';
import { AttachmentsDetail } from './AttachmentsDetail.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import { HierarchyBreadcrumbs, PageHeading } from './Hierarchy.js';
import { attachmentsHref, batchHref, workspaceHref } from './links.js';
import { RunDetail } from './RunDetail.js';
import { StatusBadge } from './StatusBadge.js';
import { useRunDetail } from './use-run-table-state.js';
import { WorkspaceDetail } from './WorkspaceDetail.js';

/** The run itself, its candidate workspace, or the files attached to it. */
export type RunView = 'run' | 'workspace' | 'attachments';

const TITLES: Record<Exclude<RunView, 'run'>, string> = {
  workspace: 'Candidate workspace',
  attachments: 'Attachments',
};

/**
 * One run: its trajectory first, with what it ran and how it scored beside
 * it. The `workspace` and `attachments` views show its files instead.
 */
export function RunPage({
  api,
  catalog,
  runs,
  runId,
  view = 'run',
}: {
  api: DashboardApi;
  catalog: CatalogEval[];
  runs: RunSummary[];
  runId: string;
  view?: RunView;
}) {
  const navigate = useNavigate();
  const run = runs.find((entry) => entry.id === runId);
  const { detail, error } = useRunDetail(api, run);
  if (!run) {
    // Before 0.9 a run could hold several trials; its ID is now their batch's.
    if (runs.some((entry) => entry.batch?.id === runId))
      return <Navigate to={batchHref(runId)} replace />;
    return (
      <Empty
        message={runs.length ? `Run not found: ${runId}` : 'Loading run…'}
      />
    );
  }
  const attached = detail?.attachments?.length ?? 0;
  return (
    <>
      <HierarchyBreadcrumbs
        run={run}
        {...(view === 'run'
          ? {}
          : { view: view === 'workspace' ? 'Workspace' : 'Attachments' })}
      />
      <PageHeading
        title={view === 'run' ? `Run ${run.id.slice(0, 8)}` : TITLES[view]}
        subtitle={run.id}
        status={
          view === 'run' ? (
            <span
              title={
                run.interrupted
                  ? 'Its process stopped before the run finished'
                  : undefined
              }
            >
              <StatusBadge status={run.status} />
            </span>
          ) : undefined
        }
        actions={
          view === 'run' ? (
            <div className="flex gap-2">
              {attached ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<PaperclipIcon />}
                  className="open-attachments"
                  onClick={() => navigate(attachmentsHref(run.id))}
                >
                  Attachments{' '}
                  <span className="text-kumo-subtle tabular-nums">
                    {attached}
                  </span>
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                icon={<FolderOpenIcon />}
                className="open-workspace"
                onClick={() => navigate(workspaceHref(run.id))}
              >
                Candidate workspace
              </Button>
            </div>
          ) : undefined
        }
      />
      {error ? (
        <ErrorBanner title="Unable to load the run" message={error} />
      ) : null}
      {view === 'workspace' ? (
        <WorkspaceDetail api={api} runId={run.id} />
      ) : view === 'attachments' ? (
        detail ? (
          <AttachmentsDetail
            api={api}
            runId={run.id}
            attachments={detail.attachments ?? []}
          />
        ) : error ? null : (
          <output className="text-[13px] text-kumo-subtle">Loading…</output>
        )
      ) : (
        <RunDetail api={api} catalog={catalog} run={run} detail={detail} />
      )}
    </>
  );
}
