import { formatLimit, LIMIT_KINDS } from '@evalkit/core/limits';
import { ComparePivot } from './ComparePivot.js';
import { Button, LayerCard, Table } from '@cloudflare/kumo';
import { PlayIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  CatalogEval,
  CatalogScorer,
  CatalogStep,
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
import { PageHeading } from './Hierarchy.js';
import { DefinedAt, LibraryBreadcrumbs } from './Library.js';
import { libraryJudges, scorerResults } from './library-entities.js';
import { passText } from './Verdict.js';
import { agentHref, datasetHref, judgeHref, runHref } from './links.js';
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
      <LibraryBreadcrumbs
        section="scenarios"
        current={scenario?.name ?? evalId}
      />
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
      {scenario ? (
        <HowItIsScored
          scenario={scenario}
          catalog={catalog}
          runs={scenarioRuns}
        />
      ) : null}
      {scenario?.transcript?.length ? (
        <Transcript scenario={scenario} catalog={catalog} />
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
      <ComparePivot runs={scenarioRuns} order={matrix?.parameters} />
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
  const policy = scenario.policy;
  return (
    <LayerCard className="scenario-definition max-w-3xl p-4">
      <DetailList
        items={[
          ...(suite ? ([['Suite', suite.name ?? suite.id]] as const) : []),
          [
            'Agent',
            <Link
              key="agent"
              to={agentHref(agentKey(scenario))}
              className={tableLinkClass}
            >
              {agentName(scenario)}
            </Link>,
          ],
          [
            'Datasets',
            (scenario.datasets ?? []).length ? (
              <span key="datasets" className="flex flex-wrap gap-x-2">
                {(scenario.datasets ?? []).map((dataset) => (
                  <span key={dataset.id}>
                    <Link
                      to={datasetHref(dataset.id)}
                      className={tableLinkClass}
                    >
                      {dataset.id}
                    </Link>{' '}
                    <span className="text-kumo-subtle">
                      (
                      {dataset.visibility === 'candidate'
                        ? 'agent'
                        : 'scorers only'}
                      )
                    </span>
                  </span>
                ))}
              </span>
            ) : (
              'none'
            ),
          ],
          ['Runs per launch', scenario.repeat ?? 1],
          ...(scenario.limits && Object.keys(scenario.limits).length
            ? ([
                [
                  'Limits',
                  LIMIT_KINDS.flatMap((kind) =>
                    scenario.limits?.[kind] === undefined
                      ? []
                      : [formatLimit(kind, scenario.limits[kind])],
                  ).join(' · '),
                ],
              ] as const)
            : []),
          ...(policy?.failfast
            ? ([['Failfast', 'stops at the first failed checkpoint']] as const)
            : []),
          ['Sandbox', scenario.sandbox ?? 'default'],
          ['Defined in', <DefinedAt key="at" at={scenario.definedAt} />],
        ]}
      />
    </LayerCard>
  );
}

/** The conversation as written: user turns, expectations and checkpoints. */
function Transcript({
  scenario,
  catalog,
}: {
  scenario: CatalogEval;
  catalog: CatalogEval[];
}) {
  const judges = libraryJudges(catalog);
  return (
    <section aria-label="Transcript" className="flex max-w-3xl flex-col gap-2">
      <h3 className="text-sm font-semibold text-kumo-strong">Transcript</h3>
      <ol className="flex flex-col gap-1.5">
        {(scenario.transcript ?? []).map((step, index) => (
          <li
            key={index}
            className="flex items-start gap-3 rounded-md border border-kumo-hairline bg-kumo-base px-3 py-2 text-[13px]"
          >
            <span className="w-5 shrink-0 text-right text-xs text-kumo-subtle tabular-nums">
              {index + 1}
            </span>
            <StepBody
              step={step}
              judgeKey={(scorer) =>
                judges.find(
                  (judge) =>
                    judge.scorer.name === scorer.name &&
                    judge.scorer.kind === scorer.kind &&
                    judge.scorer.definedAt === scorer.definedAt,
                )?.key ?? scorer.name
              }
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepBody({
  step,
  judgeKey,
}: {
  step: CatalogStep;
  judgeKey(scorer: CatalogScorer): string;
}) {
  const label = (text: string) => (
    <span className="w-24 shrink-0 text-xs font-medium text-kumo-subtle">
      {text}
    </span>
  );
  switch (step.kind) {
    case 'user':
      return (
        <>
          {label('User says')}
          {step.message === undefined ? (
            <span className="text-kumo-subtle">
              Computed for each run from its parameters and datasets; each run's
              trajectory shows the message it was sent.
            </span>
          ) : (
            <span className="whitespace-pre-wrap">{step.message}</span>
          )}
        </>
      );
    case 'agent':
      return (
        <>
          {label('Agent should')}
          <code className={monoClass}>{JSON.stringify(step.expectation)}</code>
        </>
      );
    case 'expect-tool-call':
      return (
        <>
          {label('Expect tool call')}
          <span>
            <code className={monoClass}>{step.name}</code>
            {step.arguments !== undefined ? (
              <code className={`${monoClass} ml-2 text-kumo-subtle`}>
                {JSON.stringify(step.arguments)}
              </code>
            ) : null}
          </span>
        </>
      );
    case 'checkpoint':
      return (
        <>
          {label('Checkpoint')}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>
              <Link
                to={judgeHref(judgeKey(step.scorer))}
                className={tableLinkClass}
              >
                {step.scorer.name}
              </Link>{' '}
              <span className="text-xs text-kumo-subtle">
                {step.scorer.kind === 'judge' ? 'LLM judge' : 'predicate'} ·
                passes at {passText(step.scorer.passAt, step.scorer.answer)}
              </span>
            </span>
            {step.scorer.description ? (
              <span className="text-kumo-default">
                {step.scorer.description}
              </span>
            ) : null}
          </span>
        </>
      );
  }
}

/**
 * The scoring plan in one place: every final scorer, what it checks, its
 * pass mark, and how it did in the newest runs.
 */
function HowItIsScored({
  scenario,
  catalog,
  runs,
}: {
  scenario: CatalogEval;
  catalog: CatalogEval[];
  runs: readonly RunSummary[];
}) {
  const judges = libraryJudges(catalog);
  if (!scenario.scorers.length) return null;
  return (
    <section
      aria-label="How it is scored"
      className="flex max-w-4xl flex-col gap-2"
    >
      <h3 className="text-sm font-semibold text-kumo-strong">
        How it is scored
      </h3>
      <p className="text-[13px] text-kumo-subtle">
        A run passes when every scorer and checkpoint passes. Its score is the
        mean of the final scorers&apos; values.
      </p>
      <DataTable>
        <Table.Header variant="compact">
          <Table.Row>
            <Table.Head>Scorer</Table.Head>
            <Table.Head>Checks</Table.Head>
            <Table.Head>Passes at</Table.Head>
            <Table.Head>Last 10 runs</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {scenario.scorers.map((scorer) => {
            const key =
              judges.find(
                (judge) =>
                  judge.scorer.name === scorer.name &&
                  judge.scorer.kind === scorer.kind &&
                  judge.scorer.definedAt === scorer.definedAt,
              )?.key ?? scorer.name;
            const recent = scorerResults(runs, scorer.name);
            return (
              <Table.Row key={`${scorer.kind}-${scorer.name}`}>
                <Table.Cell>
                  <Link to={judgeHref(key)} className={tableLinkClass}>
                    {scorer.name}
                  </Link>
                  <span className="block text-xs text-kumo-subtle">
                    {scorer.kind === 'judge'
                      ? `LLM judge${scorer.agent ? ` · ${scorer.agent.name ?? scorer.agent.id ?? scorer.agent.kind}` : ''}`
                      : 'predicate'}
                  </span>
                </Table.Cell>
                <Table.Cell className="whitespace-normal">
                  {scorer.description ?? scorer.rubric ?? (
                    <span className="text-kumo-subtle italic">
                      No description
                    </span>
                  )}
                </Table.Cell>
                <Table.Cell>
                  {passText(scorer.passAt, scorer.answer)}
                </Table.Cell>
                <Table.Cell className="tabular-nums">
                  {recent.total ? `${recent.passed}/${recent.total}` : '—'}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </DataTable>
    </section>
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
                <Link
                  to={runHref(run.id)}
                  data-row-link
                  className={`${tableLinkClass} ${monoClass}`}
                  title={run.id}
                >
                  {run.id.slice(0, 8)}
                </Link>
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
