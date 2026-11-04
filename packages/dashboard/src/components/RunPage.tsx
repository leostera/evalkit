import { useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type {
  CatalogEval,
  DashboardApi,
  RunSummary,
  RunTranscriptView,
} from '../api.js';
import { AttachmentsDetail } from './AttachmentsDetail.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import { HierarchyBreadcrumbs } from './Hierarchy.js';
import { batchHref, runSectionHref, type RunSection } from './links.js';
import { RunFiles } from './run-files.js';
import {
  agentMetrics,
  checksCount,
  checksSummary,
  DatasetsList,
  judgedResults,
  JudgingTable,
  MetricsList,
  RawReport,
  RunFacts,
  RunSectionBody,
  runDatasets,
  TrajectoryAndScoring,
  useRunTranscript,
} from './RunDetail.js';
import { StatusBadge } from './StatusBadge.js';
import { useRunDetail } from './use-run-table-state.js';
import { WorkspaceDetail } from './WorkspaceDetail.js';

type MenuEntry = { section: RunSection; label: string; count?: string };

/**
 * One run, in two columns that fit the window: a rail with what it ran and
 * a menu of its sections, and the section itself. The first section shows
 * what the agent did beside why it passed or failed; each column scrolls on
 * its own, so neither is taller than the window. `[` and `]` step through
 * the sections.
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
  view?: RunSection;
}) {
  const navigate = useNavigate();
  const run = runs.find((entry) => entry.id === runId);
  const { detail, error } = useRunDetail(api, run);
  const { session, error: sessionError } = useRunTranscript(api, run);
  const scenario = run
    ? catalog.find((entry) => entry.id === run.evalId)
    : undefined;
  const judged = judgedResults(detail);
  const menu: MenuEntry[] = run
    ? [
        {
          section: 'run',
          label: 'Trajectory & scoring',
          count: checksCount(detail, scenario),
        },
        ...(judged.length
          ? [
              {
                section: 'judging' as const,
                label: 'Judging',
                count: `${judged.length}`,
              },
            ]
          : []),
        {
          section: 'metrics',
          label: 'Metrics',
          count: `${agentMetrics(detail).length || ''}`,
        },
        { section: 'workspace', label: 'Workspace files' },
        {
          section: 'logs',
          label: 'Logs',
          count: `${detail?.attachments?.length || ''}`,
        },
        ...(runDatasets(detail?.manifest).length
          ? [
              {
                section: 'datasets' as const,
                label: 'Datasets',
                count: `${runDatasets(detail?.manifest).length}`,
              },
            ]
          : []),
        { section: 'raw', label: 'Raw report' },
      ]
    : [];
  useEffect(() => {
    if (!run) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== '[' && event.key !== ']') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      const index = menu.findIndex((entry) => entry.section === view);
      const next =
        menu[
          (index + (event.key === ']' ? 1 : -1) + menu.length) % menu.length
        ];
      if (next) navigate(runSectionHref(run.id, next.section));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
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
  return (
    <RunFiles.Provider
      value={{ runId: run.id, attachments: detail?.attachments ?? [] }}
    >
      <div className="run-page flex flex-col gap-4 lg:grid lg:min-h-0 lg:flex-1 lg:basis-0 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
        <aside
          aria-label="Run"
          className="run-rail flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-kumo-line lg:pr-5"
        >
          <HierarchyBreadcrumbs run={run} />
          <div className="flex flex-col gap-1">
            <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-kumo-strong">
              Run {run.id.slice(0, 8)}
              <span
                title={
                  run.interrupted
                    ? 'Its process stopped before the run finished'
                    : undefined
                }
              >
                <StatusBadge status={run.status} />
              </span>
            </h2>
            <span className="font-mono text-xs break-all text-kumo-subtle">
              {run.id}
            </span>
            {checksSummary(detail, scenario) ? (
              <span className="text-xs text-kumo-subtle">
                {checksSummary(detail, scenario)}
              </span>
            ) : null}
          </div>
          <RunFacts run={run} detail={detail} scenario={scenario} />
          <nav
            aria-label="Run sections"
            className="run-sections flex flex-col gap-0.5 border-t border-kumo-line pt-3"
          >
            {menu.map((entry) => (
              <Link
                key={entry.section}
                to={runSectionHref(run.id, entry.section)}
                aria-current={entry.section === view ? 'page' : undefined}
                className={`flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] ${
                  entry.section === view
                    ? 'bg-kumo-brand/10 font-medium text-kumo-link'
                    : 'text-kumo-default hover:bg-kumo-tint'
                }`}
              >
                {entry.label}
                {entry.count ? (
                  <span className="text-xs font-normal text-kumo-subtle tabular-nums">
                    {entry.count}
                  </span>
                ) : null}
              </Link>
            ))}
            <p className="mt-2 hidden px-2 text-xs text-kumo-subtle lg:block">
              <kbd className="font-mono">[</kbd>{' '}
              <kbd className="font-mono">]</kbd> previous and next section
            </p>
          </nav>
        </aside>
        <div className="run-body flex min-w-0 flex-col gap-3 lg:min-h-0">
          {error ? (
            <ErrorBanner title="Unable to load the run" message={error} />
          ) : null}
          <RunBody
            api={api}
            run={run}
            view={view}
            detail={detail}
            scenario={scenario}
            session={session}
            sessionError={sessionError}
            error={error}
          />
        </div>
      </div>
    </RunFiles.Provider>
  );
}

function RunBody({
  api,
  run,
  view,
  detail,
  scenario,
  session,
  sessionError,
  error,
}: {
  api: DashboardApi;
  run: RunSummary;
  view: RunSection;
  detail: ReturnType<typeof useRunDetail>['detail'];
  scenario?: CatalogEval;
  session: RunTranscriptView;
  sessionError?: string;
  error?: string;
}) {
  if (view === 'run')
    return (
      <TrajectoryAndScoring
        run={run}
        detail={detail}
        scenario={scenario}
        session={session}
        sessionError={sessionError}
      />
    );
  if (view === 'workspace')
    return (
      <RunSectionBody
        title="Workspace files"
        about="What the agent left in its workspace, saved when the run ended."
      >
        <WorkspaceDetail api={api} runId={run.id} />
      </RunSectionBody>
    );
  if (!detail)
    return error ? null : (
      <output className="text-[13px] text-kumo-subtle">Loading…</output>
    );
  switch (view) {
    case 'judging':
      return (
        <RunSectionBody
          title="Judging"
          about="What the judges cost, never counted in the agent's tokens."
        >
          <JudgingTable detail={detail} />
        </RunSectionBody>
      );
    case 'metrics':
      return (
        <RunSectionBody title="Metrics">
          <MetricsList detail={detail} limits={run.limits} />
        </RunSectionBody>
      );
    case 'logs':
      return (
        <RunSectionBody
          title="Logs"
          about="Files the agent or a check saved on purpose with attach(), such as the agent's transcript or an app's output."
        >
          <AttachmentsDetail
            api={api}
            runId={run.id}
            attachments={detail.attachments ?? []}
          />
        </RunSectionBody>
      );
    case 'datasets':
      return (
        <RunSectionBody title="Datasets">
          <DatasetsList detail={detail} />
        </RunSectionBody>
      );
    case 'raw':
      return (
        <RunSectionBody title="Raw report">
          <RawReport detail={detail} />
        </RunSectionBody>
      );
  }
}
