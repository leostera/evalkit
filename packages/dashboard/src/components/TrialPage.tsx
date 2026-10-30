import { Button } from '@cloudflare/kumo';
import { FolderOpenIcon } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import type {
  CatalogEval,
  DashboardApi,
  RunSummary,
  SuiteSummary,
} from '../api.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import { HierarchyBreadcrumbs, PageHeading } from './Hierarchy.js';
import { workspaceHref } from './links.js';
import { StatusBadge } from './StatusBadge.js';
import { TrialDetail } from './TrialDetail.js';
import { useRunTrials } from './use-run-table-state.js';
import { WorkspaceDetail } from './WorkspaceDetail.js';

/**
 * One trial: its trajectory first, with the scores and datasets beside it.
 * `workspace` shows the candidate's files instead.
 */
export function TrialPage({
  api,
  catalog,
  suites,
  runs,
  runId,
  trialId,
  workspace = false,
}: {
  api: DashboardApi;
  catalog: CatalogEval[];
  suites: SuiteSummary[];
  runs: RunSummary[];
  runId: string;
  trialId: string;
  workspace?: boolean;
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
      catalog={catalog}
      suites={suites}
      evalId={run.evalId}
      run={run}
      trial={trial ?? { id: trialId }}
      workspace={workspace}
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
  return (
    <>
      {breadcrumbs}
      <PageHeading
        title={workspace ? 'Candidate workspace' : `Trial ${trial.index + 1}`}
        subtitle={trial.id}
        status={workspace ? undefined : <StatusBadge status={trial.status} />}
        actions={
          workspace ? undefined : (
            <Button
              size="sm"
              variant="secondary"
              icon={<FolderOpenIcon />}
              className="open-workspace"
              onClick={() => navigate(workspaceHref(run.id, trial.id))}
            >
              Candidate workspace
            </Button>
          )
        }
      />
      {workspace ? (
        <WorkspaceDetail api={api} selected={selected} />
      ) : (
        <TrialDetail api={api} selected={selected} />
      )}
    </>
  );
}
