import type {
  CatalogEval,
  DashboardApi,
  RunSummary,
  SuiteSummary,
} from '../api.js';
import { agentName } from './agentName.js';
import { monoClass } from './DataTable.js';
import { DetailList } from './DetailList.js';
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
  suites,
  runs,
  runId,
}: {
  api: DashboardApi;
  catalog: CatalogEval[];
  suites: SuiteSummary[];
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
      <HierarchyBreadcrumbs
        catalog={catalog}
        suites={suites}
        evalId={run.evalId}
        run={run}
      />
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
            ['Scenario', scenario?.name ?? run.evalId],
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
              run.durationMs === undefined ? '—' : `${run.durationMs}ms`,
            ],
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
