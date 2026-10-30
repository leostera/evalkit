import { Button, LayerCard, Link, Table } from '@cloudflare/kumo';
import { PlayIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type {
  CatalogEval,
  DashboardApi,
  MatrixSummary,
  RunSummary,
  SuiteSummary,
} from '../api.js';
import { agentKey, agentName } from './agentName.js';
import {
  DataTable,
  monoClass,
  tableLinkClass,
  TableMessage,
} from './DataTable.js';
import { DetailList } from './DetailList.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import { HierarchyBreadcrumbs, PageHeading } from './Hierarchy.js';
import { runHref } from './links.js';
import { rowLinkProps } from './row-link.js';
import { MatrixEvalTable } from './MatrixEvalTable.js';
import { Pager } from './Pager.js';
import { CommitLabel } from './RunTable.js';
import {
  OtherParametersCell,
  ParameterCell,
  ParameterChips,
  parameterLayout,
  ScoreCell,
  StartedCell,
} from './run-columns.js';
import { StatusBadge } from './StatusBadge.js';

const PAGE_SIZE = 25;

/** One scenario: what it is, how to run it, and every run it has had. */
export function ScenarioPage({
  api,
  catalog,
  suites,
  matrix,
  runs,
  evalId,
}: {
  api: DashboardApi;
  catalog: CatalogEval[];
  suites: SuiteSummary[];
  matrix?: MatrixSummary | null;
  runs: RunSummary[];
  evalId: string;
}) {
  const [runError, setRunError] = useState<string>();
  const scenario = catalog.find((entry) => entry.id === evalId);
  const scenarioRuns = useMemo(
    () =>
      runs
        .filter((run) => run.evalId === evalId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [runs, evalId],
  );
  if (!scenario && !scenarioRuns.length)
    return <Empty message={`Scenario not found: ${evalId}`} />;
  const start = (parameters?: Record<string, unknown>) => {
    if (!scenario) return;
    setRunError(undefined);
    void api
      .runEval(scenario.path, parameters)
      .catch((error: unknown) =>
        setRunError(
          error instanceof Error ? error.message : 'Unable to start scenario',
        ),
      );
  };
  const canRun = !!scenario && !api.readOnly;
  return (
    <>
      <HierarchyBreadcrumbs catalog={catalog} suites={suites} evalId={evalId} />
      <PageHeading
        title={scenario?.name ?? evalId}
        subtitle={scenario?.id ?? `${evalId} (no longer in the project)`}
        status={
          scenarioRuns[0] ? (
            <StatusBadge status={scenarioRuns[0].status} />
          ) : undefined
        }
        actions={
          canRun && matrix === null ? (
            <Button
              size="sm"
              variant="primary"
              icon={<PlayIcon weight="fill" />}
              className="run-scenario"
              onClick={() => start()}
            >
              Run scenario
            </Button>
          ) : undefined
        }
      />
      {runError ? <ErrorBanner message={runError} /> : null}
      {scenario ? (
        <ScenarioDefinition scenario={scenario} suites={suites} />
      ) : null}
      {canRun && matrix ? (
        <section aria-label="Matrix cells" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-kumo-strong">
            Matrix cells
          </h3>
          <MatrixEvalTable
            api={api}
            evalIds={[evalId]}
            catalog={catalog}
            matrix={matrix}
            runs={runs}
            onRun={(_path, parameters) => start(parameters)}
          />
        </section>
      ) : null}
      <section aria-label="Runs" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-kumo-strong">
          Runs{' '}
          <span className="font-normal text-kumo-subtle tabular-nums">
            {scenarioRuns.length}
          </span>
        </h3>
        <ScenarioRuns runs={scenarioRuns} />
      </section>
    </>
  );
}

function ScenarioDefinition({
  scenario,
  suites,
}: {
  scenario: CatalogEval;
  suites: SuiteSummary[];
}) {
  const suite = suites.find(
    (entry) =>
      entry.id === scenario.suiteId || entry.evalIds.includes(scenario.id),
  );
  return (
    <LayerCard className="scenario-definition max-w-3xl p-4">
      <DetailList
        items={[
          ...(suite ? ([['Suite', suite.name ?? suite.id]] as const) : []),
          [
            'Agent',
            <Link
              key="agent"
              href={`/agents?agent=${encodeURIComponent(agentKey(scenario))}`}
            >
              {agentName(scenario)}
            </Link>,
          ],
          [
            'Runtimes',
            scenario.agent.runtimes
              .map((runtime) => `${runtime.name} (${runtime.kind})`)
              .join(', ') || 'default',
          ],
          ['Trials per run', scenario.trialCount],
          [
            'Scorers',
            scenario.scorers
              .map((scorer) => `${scorer.name} (${scorer.kind})`)
              .join(', ') || 'none',
          ],
          [
            'Datasets',
            (scenario.datasets ?? []).length ? (
              <span key="datasets">
                {(scenario.datasets ?? []).map((dataset, index) => (
                  <span key={dataset.id}>
                    {index ? ', ' : ''}
                    <Link href="/datasets">{dataset.id}</Link>{' '}
                    <span className="text-kumo-subtle">
                      ({dataset.visibility})
                    </span>
                  </span>
                ))}
              </span>
            ) : (
              'none'
            ),
          ],
        ]}
      />
    </LayerCard>
  );
}

/** A scenario's runs, newest first; each opens its run page. */
export function ScenarioRuns({ runs }: { runs: readonly RunSummary[] }) {
  const [page, setPage] = useState(0);
  const layout = parameterLayout(runs);
  const visible = runs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const columns = 5 + layout.columns.length + (layout.overflow.length ? 1 : 0);
  return (
    <>
      {layout.constant.length ? (
        <p
          className="flex flex-wrap items-center gap-1 text-[13px] text-kumo-subtle"
          role="note"
        >
          Same on every run:
          <ParameterChips entries={layout.constant} />
        </p>
      ) : null}
      <DataTable>
        <Table.Header variant="compact">
          <Table.Row>
            <Table.Head>Run</Table.Head>
            <Table.Head>Status</Table.Head>

            <Table.Head>Score</Table.Head>
            <Table.Head>Started</Table.Head>
            <Table.Head>Commit</Table.Head>
            {layout.columns.map((parameter) => (
              <Table.Head key={parameter}>{parameter}</Table.Head>
            ))}
            {layout.overflow.length ? (
              <Table.Head>Other parameters</Table.Head>
            ) : null}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {visible.map((run) => (
            <Table.Row key={run.id} {...rowLinkProps}>
              <Table.Cell>
                <RouterLink
                  to={runHref(run.id)}
                  data-row-link
                  className={`${tableLinkClass} ${monoClass}`}
                  title={run.id}
                >
                  {run.id.slice(0, 8)}
                </RouterLink>
              </Table.Cell>
              <Table.Cell
                title={
                  run.interrupted
                    ? 'Its process stopped before the run finished'
                    : undefined
                }
              >
                <StatusBadge status={run.status} />
              </Table.Cell>

              <Table.Cell>
                <ScoreCell run={run} />
              </Table.Cell>
              <Table.Cell>
                <StartedCell run={run} />
              </Table.Cell>
              <Table.Cell>
                <CommitLabel source={run.source} />
              </Table.Cell>
              {layout.columns.map((parameter) => (
                <Table.Cell key={parameter}>
                  <ParameterCell run={run} name={parameter} />
                </Table.Cell>
              ))}
              {layout.overflow.length ? (
                <Table.Cell>
                  <OtherParametersCell run={run} keys={layout.overflow} />
                </Table.Cell>
              ) : null}
            </Table.Row>
          ))}
          {!runs.length ? (
            <TableMessage colSpan={columns}>Not run yet.</TableMessage>
          ) : null}
        </Table.Body>
      </DataTable>
      <Pager
        label="Scenario run pages"
        noun="Runs"
        page={page}
        pageSize={PAGE_SIZE}
        total={runs.length}
        onPage={setPage}
      />
    </>
  );
}
