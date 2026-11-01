import { Button } from '@cloudflare/kumo';
import { FolderOpenIcon, PaperclipIcon } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import type { DashboardApi, RunSummary } from '../api.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import { HierarchyBreadcrumbs, PageHeading } from './Hierarchy.js';
import { AttachmentsDetail } from './AttachmentsDetail.js';
import { attachmentsHref, workspaceHref } from './links.js';
import { StatusBadge } from './StatusBadge.js';
import { TrialDetail } from './TrialDetail.js';
import { useRunTrials } from './use-run-table-state.js';
import { WorkspaceDetail } from './WorkspaceDetail.js';

/** The trial itself, its candidate workspace, or the files attached to it. */
export type TrialView = 'trial' | 'workspace' | 'attachments';

const TITLES: Record<Exclude<TrialView, 'trial'>, string> = {
  workspace: 'Candidate workspace',
  attachments: 'Attachments',
};

/**
 * One trial: its trajectory first, with the scores and datasets beside it.
 * The `workspace` and `attachments` views show its files instead.
 */
export function TrialPage({
  api,
  runs,
  runId,
  trialId,
  view = 'trial',
}: {
  api: DashboardApi;
  runs: RunSummary[];
  runId: string;
  trialId: string;
  view?: TrialView;
}) {
  const navigate = useNavigate();
  const run = runs.find((entry) => entry.id === runId);
  const { trials, error } = useRunTrials(api, run);
  const trial = trials?.find((entry) => entry.id === trialId);
  if (!run)
    return (
      <Empty
        message={runs.length ? `Run not found: ${runId}` : 'Loading trial…'}
      />
    );
  const breadcrumbs = (
    <HierarchyBreadcrumbs
      run={run}
      trial={trial ?? { id: trialId }}
      {...(view === 'trial'
        ? {}
        : { view: view === 'workspace' ? 'Workspace' : 'Attachments' })}
    />
  );
  if (error || (trials && !trial))
    return (
      <>
        {breadcrumbs}
        <ErrorBanner
          message={error ?? `Trial ${trialId} was not found in this run.`}
        />
      </>
    );
  if (!trial)
    return (
      <>
        {breadcrumbs}
        <output className="text-[13px] text-kumo-subtle">Loading trial…</output>
      </>
    );
  const selected = { run, trial };
  const attached = trial.attachments?.length ?? 0;
  return (
    <>
      {breadcrumbs}
      <PageHeading
        title={view === 'trial' ? `Trial ${trial.index + 1}` : TITLES[view]}
        subtitle={trial.id}
        status={
          view === 'trial' ? <StatusBadge status={trial.status} /> : undefined
        }
        actions={
          view === 'trial' ? (
            <div className="flex gap-2">
              {attached ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<PaperclipIcon />}
                  className="open-attachments"
                  onClick={() => navigate(attachmentsHref(run.id, trial.id))}
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
                onClick={() => navigate(workspaceHref(run.id, trial.id))}
              >
                Candidate workspace
              </Button>
            </div>
          ) : undefined
        }
      />
      {view === 'workspace' ? (
        <WorkspaceDetail api={api} selected={selected} />
      ) : view === 'attachments' ? (
        <AttachmentsDetail api={api} selected={selected} />
      ) : (
        <TrialDetail api={api} selected={selected} />
      )}
    </>
  );
}
