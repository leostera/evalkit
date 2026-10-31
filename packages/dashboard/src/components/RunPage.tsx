import type { CatalogEval, DashboardApi, RunSummary } from '../api.js';
import { agentName } from './agentName.js';
import { monoClass, tableLinkClass } from './DataTable.js';
import { scenarioHref } from './links.js';
import { Link } from 'react-router-dom';
import { DetailList } from './DetailList.js';
import { formatDuration, formatMetric } from './run-columns.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import { HierarchyBreadcrumbs, PageHeading } from './Hierarchy.js';
import { CommitLabel } from './RunTable.js';
import { StatusBadge } from './StatusBadge.js';
import { TrialTable } from './TrialTable.js';
import { useRunTrials } from './use-run-table-state.js';

/** One run of a scenario: its settings, its outcome, and its trials. */
export function RunPage({
  api,
  catalog,
  runs,
  runId,
}: {
  api: DashboardApi;
  catalog: CatalogEval[];
  runs: RunSummary[];
  runId: string;
}) {
  const run = runs.find((entry) => entry.id === runId);
  const { trials, error } = useRunTrials(api, run);
  if (!run)
    return (
      <Empty
        message={runs.length ? `Run not found: ${runId}` : 'Loading run…'}
      />
    );
  const scenario = catalog.find((entry) => entry.id === run.evalId);
  const parameters = Object.entries(run.parameters ?? {});
  return (
    <>
      <HierarchyBreadcrumbs run={run} />
      <PageHeading
        title={`Run ${run.id.slice(0, 8)}`}
        subtitle={run.id}
        status={
          <span
            title={
              run.interrupted
                ? 'Its process stopped before the run finished'
                : undefined
            }
          >
            <StatusBadge status={run.status} />
          </span>
        }
      />
      <div className="run-overview max-w-3xl">
        <DetailList
          items={[
            [
              'Scenario',
              <Link
                key="scenario"
                to={scenarioHref(run.evalId)}
                className={tableLinkClass}
              >
                {scenario?.name ?? run.evalId}
              </Link>,
            ],
            ['Agent', scenario ? agentName(scenario) : (run.agent ?? '—')],
            ['Score', run.score ?? '—'],
            ['Trials', `${run.completedTrials} of ${run.requestedTrials}`],
            ...(parameters.length
              ? ([
                  [
                    'Parameters',
                    <span key="parameters" className={monoClass}>
                      {parameters
                        .map(
                          ([key, value]) => `${key}=${JSON.stringify(value)}`,
                        )
                        .join(' ')}
                    </span>,
                  ],
                ] as const)
              : []),
            ['Started', new Date(run.startedAt).toLocaleString()],
            [
              'Runtime',
              run.durationMs === undefined
                ? '—'
                : formatDuration(run.durationMs)!,
            ],
            ...(run.metrics ?? [])
              .filter((metric) => metric.mean !== undefined)
              .map(
                (metric) =>
                  [
                    metric.count > 1 ? `Mean ${metric.name}` : metric.name,
                    <span key={metric.name} className="tabular-nums">
                      {formatMetric(metric.mean!, metric.unit)}
                    </span>,
                  ] as const,
              ),
            ['Commit', <CommitLabel key="commit" source={run.source} />],
          ]}
        />
      </div>
      {error ? (
        <ErrorBanner title="Unable to load trials" message={error} />
      ) : null}
      <section aria-label="Trials" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-kumo-strong">Trials</h3>
        {trials ? (
          <TrialTable run={run} trials={trials} />
        ) : error ? null : (
          <output className="text-[13px] text-kumo-subtle">
            Loading trials…
          </output>
        )}
      </section>
    </>
  );
}
