import { Badge, LayerCard, Table, Tabs } from '@cloudflare/kumo';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  CatalogAgent,
  CatalogDataset,
  CatalogEval,
  CatalogScorer,
  DashboardApi,
  RunSummary,
  SuiteSummary,
} from '../api.js';
import {
  DataTable,
  monoClass,
  tableLinkClass,
  TableMessage,
} from './DataTable.js';
import { DatasetFiles } from './DatasetFiles.js';
import { DetailList } from './DetailList.js';
import { Empty } from './Empty.js';
import {
  latestRunByScenario,
  libraryAgents,
  libraryDatasets,
  libraryJudges,
  recentVerdicts,
  type JudgeUse,
} from './library-entities.js';
import { StatusBadge } from './StatusBadge.js';
import { passText, shownValue } from './Verdict.js';
import {
  agentHref,
  datasetHref,
  judgeHref,
  libraryHref,
  runHref,
  scenarioHref,
  type LibrarySection,
} from './links.js';
import { PageHeading } from './Hierarchy.js';
import { formatScore } from './run-columns.js';
import { rowLinkProps } from './row-link.js';
import { outcomeFill, outcomeLabel, outcomeTint } from './status-colors.js';
import { Breadcrumbs } from '@cloudflare/kumo';

type Data = {
  catalog: CatalogEval[];
  suites: SuiteSummary[];
  runs: RunSummary[];
};

const sectionTitle: Record<LibrarySection, string> = {
  agents: 'Agents',
  judges: 'Judges',
  scenarios: 'Scenarios',
  datasets: 'Datasets',
};

export function LibraryBreadcrumbs({
  section,
  current,
}: {
  section: LibrarySection;
  current?: string;
}) {
  return (
    <div className="shrink-0">
      <Breadcrumbs size="sm" className="hierarchy-breadcrumbs">
        <Breadcrumbs.Current>Library</Breadcrumbs.Current>
        <Breadcrumbs.Separator />
        {current ? (
          <Breadcrumbs.Link href={libraryHref(section)}>
            {sectionTitle[section]}
          </Breadcrumbs.Link>
        ) : (
          <Breadcrumbs.Current>{sectionTitle[section]}</Breadcrumbs.Current>
        )}
        {current ? <Breadcrumbs.Separator /> : null}
        {current ? <Breadcrumbs.Current>{current}</Breadcrumbs.Current> : null}
      </Breadcrumbs>
    </div>
  );
}

/** `agents/greeting-agent.ts:4`, where the definition lives in the project. */
export function DefinedAt({ at }: { at?: string }) {
  if (!at) return <span className="text-kumo-subtle">—</span>;
  return (
    <span
      className={`${monoClass} text-kumo-subtle`}
      title="Where this is defined"
    >
      {at}
    </span>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-kumo-line px-1.5 py-0.5 text-xs">
      {children}
    </span>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <LayerCard className="flex max-w-3xl flex-col gap-3 p-4">
      {title ? (
        <h3 className="text-sm font-semibold text-kumo-strong">{title}</h3>
      ) : null}
      {children}
    </LayerCard>
  );
}

/** Scenarios that use a definition, each with its latest outcome. */
function UsedBy({
  scenarios,
  runs,
  note,
}: {
  scenarios: ReadonlyArray<{ scenario: CatalogEval; note?: string }>;
  runs: RunSummary[];
  note?: string;
}) {
  const latest = latestRunByScenario(runs);
  return (
    <section aria-label="Used by" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-kumo-strong">
        Used by{' '}
        <span className="font-normal text-kumo-subtle tabular-nums">
          {scenarios.length}
        </span>
        {note ? (
          <span className="ml-2 text-xs font-normal text-kumo-subtle">
            {note}
          </span>
        ) : null}
      </h3>
      <DataTable>
        <Table.Header variant="compact">
          <Table.Row>
            <Table.Head>Scenario</Table.Head>
            <Table.Head>Suite</Table.Head>
            <Table.Head>How</Table.Head>
            <Table.Head>Latest run</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {scenarios.map(({ scenario, note: how }, index) => {
            const run = latest.get(scenario.id);
            return (
              <Table.Row key={`${scenario.id}-${index}`} {...rowLinkProps}>
                <Table.Cell>
                  <Link
                    to={scenarioHref(scenario.id)}
                    data-row-link
                    className={tableLinkClass}
                  >
                    {scenario.name ?? scenario.id}
                  </Link>
                </Table.Cell>
                <Table.Cell>{scenario.suiteId ?? '—'}</Table.Cell>
                <Table.Cell className="text-kumo-subtle">
                  {how ?? '—'}
                </Table.Cell>
                <Table.Cell>
                  <LatestRun run={run} />
                </Table.Cell>
              </Table.Row>
            );
          })}
          {!scenarios.length ? (
            <TableMessage colSpan={4}>No scenario uses it.</TableMessage>
          ) : null}
        </Table.Body>
      </DataTable>
    </section>
  );
}

export function LatestRun({ run }: { run?: RunSummary }) {
  if (!run) return <span className="text-xs text-kumo-subtle">not run</span>;
  return (
    <Link
      to={runHref(run.id)}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${outcomeTint[run.status]}`}
    >
      <span
        aria-hidden
        className={`size-2 rounded-full ${outcomeFill[run.status]}`}
      />
      {outcomeLabel[run.status]}
      <span className="tabular-nums text-kumo-subtle">
        {formatScore(run.score)}
      </span>
    </Link>
  );
}

// ── Agents ──────────────────────────────────────────────────────────────────

export function AgentsPage({ catalog }: Data) {
  const agents = libraryAgents(catalog);
  return (
    <>
      <LibraryBreadcrumbs section="agents" />
      {agents.length ? (
        <DataTable>
          <Table.Header variant="compact">
            <Table.Row>
              <Table.Head>Agent</Table.Head>
              <Table.Head>Kind</Table.Head>
              <Table.Head>Scenarios</Table.Head>
              <Table.Head>Defined in</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {agents.map(({ key, agent, scenarios, judging }) => (
              <Table.Row key={key} {...rowLinkProps}>
                <Table.Cell>
                  <span className="flex flex-col">
                    <Link
                      to={agentHref(key)}
                      data-row-link
                      className={tableLinkClass}
                    >
                      {agent.name ?? key}
                    </Link>
                    {agent.name ? (
                      <span className={`${monoClass} text-kumo-subtle`}>
                        {key}
                      </span>
                    ) : null}
                  </span>
                </Table.Cell>
                <Table.Cell>{agent.kind}</Table.Cell>
                <Table.Cell className="tabular-nums">
                  {scenarios.length}
                  {judging.length ? (
                    <span className="ml-1 text-xs text-kumo-subtle">
                      + judges {judging.length}
                    </span>
                  ) : null}
                </Table.Cell>
                <Table.Cell>
                  <DefinedAt at={agent.definedAt} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </DataTable>
      ) : (
        <Empty message="No agents yet. Define one with defineAgent in agents/." />
      )}
    </>
  );
}

export function AgentPage({
  catalog,
  runs,
  agentKey,
}: Data & { agentKey: string }) {
  const found = libraryAgents(catalog).find((entry) => entry.key === agentKey);
  if (!found) return <Empty message={`Agent not found: ${agentKey}`} />;
  const { agent, scenarios, judging } = found;
  return (
    <>
      <LibraryBreadcrumbs section="agents" current={agent.name ?? agentKey} />
      <PageHeading title={agent.name ?? agentKey} subtitle={agentKey} />
      <Card>
        <DetailList
          items={[
            [
              'ID',
              <span key="id" className={monoClass}>
                {agent.id ?? '—'}
              </span>,
            ],
            ['Kind', agent.kind],
            ...(agent.version ? ([['Version', agent.version]] as const) : []),
            ['Defined in', <DefinedAt key="at" at={agent.definedAt} />],
          ]}
        />
      </Card>
      <UsedBy
        runs={runs}
        scenarios={[
          ...scenarios.map((scenario) => ({
            scenario,
            note: 'agent under test',
          })),
          ...judging.map((scenario) => ({ scenario, note: 'judge agent' })),
        ]}
      />
    </>
  );
}

// ── Judges ──────────────────────────────────────────────────────────────────

function KindBadge({ scorer }: { scorer: CatalogScorer }) {
  return (
    <Badge variant={scorer.kind === 'judge' ? 'beta' : 'neutral'}>
      {scorer.kind === 'judge' ? 'LLM judge' : 'predicate'}
    </Badge>
  );
}

function placement(use: JudgeUse): string {
  return use.placement === 'final'
    ? 'final scoring'
    : `checkpoint after step ${(use.step ?? 0) + 1}`;
}

const agentLabel = (agent: CatalogAgent) =>
  agent.name ?? agent.id ?? agent.kind;

/** Passed of the newest finished runs, as a bar and a count. */
function PassBar({ passed, total }: { passed: number; total: number }) {
  if (!total) return <span className="text-kumo-subtle">—</span>;
  const share = passed / total;
  return (
    <span className="pass-bar inline-flex items-center gap-2 tabular-nums">
      <span
        aria-hidden
        className="inline-block h-1.5 w-20 overflow-hidden rounded-full bg-kumo-fill"
      >
        <span
          className={`block h-full ${share >= 0.5 ? 'bg-kumo-success' : 'bg-kumo-danger'}`}
          style={{ width: `${share * 100}%` }}
        />
      </span>
      {passed}/{total}
    </span>
  );
}

/** The model a judge used most recently, as its runs reported it. */
function recentModel(verdicts: ReturnType<typeof recentVerdicts>) {
  return verdicts.find(({ scorer }) => scorer.model)?.scorer.model;
}

export function JudgesPage({ catalog, runs }: Data) {
  const judges = libraryJudges(catalog);
  return (
    <>
      <LibraryBreadcrumbs section="judges" />
      {judges.length ? (
        <DataTable>
          <Table.Header variant="compact">
            <Table.Row>
              <Table.Head>Judge</Table.Head>
              <Table.Head>Kind</Table.Head>
              <Table.Head>Passes at</Table.Head>
              <Table.Head>Model</Table.Head>
              <Table.Head>Last 10 runs</Table.Head>
              <Table.Head>Scenarios</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {judges.map(({ key, scorer, uses }) => {
              const verdicts = recentVerdicts(runs, uses, scorer.name);
              const model = recentModel(verdicts);
              return (
                <Table.Row key={key} {...rowLinkProps}>
                  <Table.Cell className="max-w-md whitespace-normal">
                    <Link
                      to={judgeHref(key)}
                      data-row-link
                      className={tableLinkClass}
                    >
                      {scorer.name}
                    </Link>
                    <span className="block text-xs text-kumo-subtle">
                      {scorer.description ?? (
                        <span className="italic">
                          No description. Add {'{ description }'} to say what it
                          checks.
                        </span>
                      )}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <KindBadge scorer={scorer} />
                  </Table.Cell>
                  <Table.Cell>
                    {passText(scorer.passAt, scorer.answer)}
                  </Table.Cell>
                  <Table.Cell className={monoClass}>
                    {model ??
                      (scorer.agent ? (
                        agentLabel(scorer.agent)
                      ) : (
                        <span className="text-kumo-subtle">—</span>
                      ))}
                  </Table.Cell>
                  <Table.Cell>
                    <PassBar
                      passed={
                        verdicts.filter(({ scorer: s }) => s.passed).length
                      }
                      total={
                        verdicts.filter(
                          ({ scorer: s }) => s.passed !== undefined,
                        ).length
                      }
                    />
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {new Set(uses.map((use) => use.scenario.id)).size}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </DataTable>
      ) : (
        <Empty message="No judges yet. Add predicates or judges in judges/." />
      )}
    </>
  );
}

/** What a judge's answer can be, and what each answer is worth. */
function AnswerTable({ scorer }: { scorer: CatalogScorer }) {
  const answer = scorer.answer;
  if (answer?.kind === 'choices')
    return (
      <DataTable>
        <Table.Header variant="compact">
          <Table.Row>
            <Table.Head>Choice</Table.Head>
            <Table.Head>Means</Table.Head>
            <Table.Head>Value</Table.Head>
            <Table.Head>Result</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {answer.choices.map((choice) => (
            <Table.Row key={choice.key}>
              <Table.Cell className="font-semibold">{choice.key}</Table.Cell>
              <Table.Cell className="whitespace-normal">
                {choice.label}
              </Table.Cell>
              <Table.Cell className="tabular-nums">{choice.value}</Table.Cell>
              <Table.Cell>
                <StatusBadge
                  status={
                    choice.value >= (scorer.passAt ?? 1) ? 'passed' : 'failed'
                  }
                />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </DataTable>
    );
  if (answer?.kind === 'criteria')
    return (
      <DataTable>
        <Table.Header variant="compact">
          <Table.Row>
            <Table.Head>Criterion</Table.Head>
            <Table.Head>Weight</Table.Head>
            <Table.Head>Means</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {answer.criteria.map((criterion) => (
            <Table.Row key={criterion.name}>
              <Table.Cell>{criterion.name}</Table.Cell>
              <Table.Cell className="tabular-nums">
                {criterion.weight}
              </Table.Cell>
              <Table.Cell className="whitespace-normal text-kumo-subtle">
                {criterion.description ?? '—'}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </DataTable>
    );
  return null;
}

function answerSummary(scorer: CatalogScorer): string {
  switch (scorer.answer?.kind) {
    case 'choices':
      return `one of ${scorer.answer.choices.map((choice) => choice.key).join(', ')}, and why. EvalKit checks the answer and asks once more if it is not one of them`;
    case 'criteria':
      return `a value from 0 to 1 per criterion; the score is their weighted mean`;
    default:
      return 'a value from 0 to 1 and why, as JSON. EvalKit checks it and asks once more if it cannot read it';
  }
}

/** The prompt EvalKit sends: as a template, or exactly as a recent run sent it. */
function JudgePrompt({
  api,
  scorer,
  verdicts,
}: {
  api?: DashboardApi;
  scorer: CatalogScorer;
  verdicts: ReturnType<typeof recentVerdicts>;
}) {
  const [mode, setMode] = useState<'template' | 'run'>('template');
  const [sent, setSent] = useState<string>();
  const latest = verdicts.find(({ scorer: entry }) => !entry.skipped)?.run;
  useEffect(() => {
    if (mode !== 'run' || !latest || !api) return;
    let active = true;
    void api.getRun(latest.id).then((detail) => {
      if (!active) return;
      const score = detail.scores.find((entry) => entry.name === scorer.name);
      setSent(score?.judge?.prompt ?? 'This run did not record its prompt.');
    });
    return () => {
      active = false;
    };
  }, [api, latest, mode, scorer.name]);
  if (!scorer.prompt) return null;
  return (
    <figure className="judge-prompt flex min-w-0 flex-col gap-1">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-kumo-subtle">
        <span>
          Prompt EvalKit sends · built from the rubric, inputs and answer format
        </span>
        {latest && api ? (
          <Tabs
            variant="segmented"
            size="sm"
            value={mode}
            onValueChange={(value) => setMode(value as 'template' | 'run')}
            tabs={[
              { value: 'template', label: 'Template' },
              { value: 'run', label: `With run ${latest.id.slice(0, 8)}` },
            ]}
          />
        ) : null}
      </figcaption>
      <pre className="max-h-[28rem] overflow-auto rounded-md border border-kumo-hairline bg-kumo-elevated px-3 py-2 font-mono text-xs whitespace-pre-wrap">
        {mode === 'run' ? (sent ?? 'Loading…') : scorer.prompt}
      </pre>
      <p className="text-xs text-kumo-subtle">
        The judge agent receives this prompt and decides how to call its model.
        Placeholders are filled from each run.
      </p>
    </figure>
  );
}

export function JudgePage({
  api,
  catalog,
  runs,
  judgeKey,
}: Data & { api?: DashboardApi; judgeKey: string }) {
  const found = libraryJudges(catalog).find((entry) => entry.key === judgeKey);
  if (!found) return <Empty message={`Judge not found: ${judgeKey}`} />;
  const { scorer, uses } = found;
  const verdicts = recentVerdicts(runs, uses, scorer.name);
  const isJudge = scorer.kind === 'judge';
  return (
    <>
      <LibraryBreadcrumbs section="judges" current={scorer.name} />
      <PageHeading title={scorer.name} status={<KindBadge scorer={scorer} />} />
      {scorer.description ? (
        <p className="judge-description max-w-3xl text-sm text-kumo-default">
          {scorer.description}
        </p>
      ) : null}
      <div
        className={
          isJudge
            ? 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
            : 'max-w-3xl'
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <DetailList
              items={[
                ...(isJudge
                  ? ([
                      [
                        'Judge agent',
                        scorer.agent ? (
                          <span key="agent">
                            {agentLabel(scorer.agent)}
                            {recentModel(verdicts) ? (
                              <span className={`${monoClass} text-kumo-subtle`}>
                                {' '}
                                · {recentModel(verdicts)}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          'none: set judge in evalkit.config.ts'
                        ),
                      ],
                      [
                        'It sees',
                        <span key="inputs" className={monoClass}>
                          {(scorer.inputs ?? []).join(' · ')}
                        </span>,
                      ],
                      ['It answers', answerSummary(scorer)],
                    ] as const)
                  : ([
                      [
                        'Kind',
                        'Predicate: a function scores the run from 0 to 1',
                      ],
                    ] as const)),
                ['Passes at', passText(scorer.passAt, scorer.answer)],
                [
                  'Partial runs',
                  scorer.supportsPartial
                    ? 'Also scores runs that stopped early or failed'
                    : 'Only scores runs that ran to the end',
                ],
                ['Defined in', <DefinedAt key="at" at={scorer.definedAt} />],
              ]}
            />
          </Card>
          <AnswerTable scorer={scorer} />
        </div>
        {isJudge ? (
          <div className="flex min-w-0 flex-col gap-4">
            {scorer.rubric ? (
              <figure className="flex flex-col gap-1">
                <figcaption className="text-xs font-medium text-kumo-subtle">
                  Rubric
                </figcaption>
                <blockquote className="rounded-md border-l-2 border-kumo-brand bg-kumo-elevated px-3 py-2 text-[13px] whitespace-pre-wrap">
                  {scorer.rubric}
                </blockquote>
              </figure>
            ) : null}
            <JudgePrompt api={api} scorer={scorer} verdicts={verdicts} />
          </div>
        ) : null}
      </div>
      <section aria-label="Recent verdicts" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-kumo-strong">
          Recent verdicts
        </h3>
        {verdicts.length ? (
          <DataTable>
            <Table.Header variant="compact">
              <Table.Row>
                <Table.Head>Run</Table.Head>
                <Table.Head>Scenario</Table.Head>
                <Table.Head>Value</Table.Head>
                <Table.Head>Result</Table.Head>
                <Table.Head>Why</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {verdicts.map(({ run, scorer: verdict }) => (
                <Table.Row key={run.id} {...rowLinkProps}>
                  <Table.Cell>
                    <Link
                      to={runHref(run.id)}
                      data-row-link
                      className={`${tableLinkClass} ${monoClass}`}
                    >
                      {run.id.slice(0, 8)}
                    </Link>
                  </Table.Cell>
                  <Table.Cell>{run.evalId}</Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {shownValue(verdict)}
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge
                      status={
                        verdict.errored
                          ? 'error'
                          : verdict.skipped
                            ? 'skipped'
                            : verdict.passed
                              ? 'passed'
                              : 'failed'
                      }
                    />
                  </Table.Cell>
                  <Table.Cell
                    className="max-w-lg truncate text-kumo-subtle"
                    title={verdict.explanation}
                  >
                    {verdict.explanation ?? '—'}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </DataTable>
        ) : (
          <p className="text-[13px] text-kumo-subtle">
            No finished runs have recorded this {isJudge ? 'judge' : 'scorer'}{' '}
            yet.
          </p>
        )}
      </section>
      <UsedBy
        runs={runs}
        scenarios={uses.map((use) => ({
          scenario: use.scenario,
          note: placement(use),
        }))}
      />
    </>
  );
}

// ── Datasets ────────────────────────────────────────────────────────────────

function datasetContents(dataset: CatalogDataset): string {
  if (dataset.source === 'computed')
    return dataset.hooks?.onRun
      ? 'built by onLoad, adapted per run by onRun'
      : 'built by onLoad';
  const parts: string[] = [];
  if (dataset.files)
    parts.push(
      'directory' in dataset.files
        ? `files from ${dataset.files.directory}/`
        : `${dataset.files.paths.length} inline files`,
    );
  if (dataset.value)
    parts.push(
      'file' in dataset.value
        ? `value from ${dataset.value.file}`
        : 'an inline value',
    );
  return parts.join(' and ') || '—';
}

export function DatasetsPage({ catalog }: Data) {
  const datasets = libraryDatasets(catalog);
  return (
    <>
      <LibraryBreadcrumbs section="datasets" />
      {datasets.length ? (
        <DataTable>
          <Table.Header variant="compact">
            <Table.Row>
              <Table.Head>Dataset</Table.Head>
              <Table.Head>Kind</Table.Head>
              <Table.Head>Visible to</Table.Head>
              <Table.Head>Contents</Table.Head>
              <Table.Head>Scenarios</Table.Head>
              <Table.Head>Defined in</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {datasets.map(({ dataset, scenarios }) => (
              <Table.Row key={dataset.id} {...rowLinkProps}>
                <Table.Cell>
                  <span className="flex flex-col">
                    <Link
                      to={datasetHref(dataset.id)}
                      data-row-link
                      className={tableLinkClass}
                    >
                      {dataset.name ?? dataset.id}
                    </Link>
                    {dataset.name ? (
                      <span className={`${monoClass} text-kumo-subtle`}>
                        {dataset.id}
                      </span>
                    ) : null}
                  </span>
                </Table.Cell>
                <Table.Cell>{dataset.source}</Table.Cell>
                <Table.Cell>
                  {dataset.visibility === 'candidate'
                    ? 'agent and scorers'
                    : 'scorers only'}
                </Table.Cell>
                <Table.Cell className="max-w-[20rem] truncate">
                  {datasetContents(dataset)}
                </Table.Cell>
                <Table.Cell className="tabular-nums">
                  {scenarios.length}
                </Table.Cell>
                <Table.Cell>
                  <DefinedAt at={dataset.definedAt} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </DataTable>
      ) : (
        <Empty message="No scenario uses a dataset yet. Define one with defineDataset in datasets/." />
      )}
    </>
  );
}

export function DatasetPage({
  api,
  catalog,
  runs,
  datasetId,
}: Data & { api: DashboardApi; datasetId: string }) {
  const found = libraryDatasets(catalog).find(
    (entry) => entry.dataset.id === datasetId,
  );
  if (!found) return <Empty message={`Dataset not found: ${datasetId}`} />;
  const { dataset, scenarios } = found;
  const files = dataset.files;
  const value = dataset.value;
  return (
    <>
      <LibraryBreadcrumbs
        section="datasets"
        current={dataset.name ?? dataset.id}
      />
      <PageHeading
        title={dataset.name ?? dataset.id}
        subtitle={dataset.id}
        status={<Badge variant="neutral">{dataset.source}</Badge>}
      />
      <Card>
        <DetailList
          items={[
            [
              'Kind',
              dataset.source === 'computed'
                ? 'Computed: onLoad builds it once per process and caches it'
                : 'Static: declared in the definition',
            ],
            ...(dataset.hooks
              ? ([
                  [
                    'Hooks',
                    <span key="hooks" className="flex gap-1">
                      <Pill>onLoad · once per process</Pill>
                      {dataset.hooks.onRun ? (
                        <Pill>onRun · once per run</Pill>
                      ) : null}
                    </span>,
                  ],
                ] as const)
              : []),
            [
              'Visible to',
              dataset.visibility === 'candidate'
                ? 'The agent (in its workspace and context.data) and the scorers'
                : 'Only the scorers; the agent never sees it',
            ],
            [
              'Mounted at',
              <span key="mount" className={monoClass}>
                {dataset.mount === '.' ? 'workspace root' : `${dataset.mount}/`}
              </span>,
            ],
            ['Defined in', <DefinedAt key="at" at={dataset.definedAt} />],
          ]}
        />
      </Card>
      {files || value ? (
        <Card title="Contents">
          <DetailList
            items={[
              ...(files
                ? ([
                    [
                      'Files',
                      'directory' in files ? (
                        <span key="files">
                          <span className={monoClass}>{files.directory}/</span>,
                          copied into each run&apos;s workspace
                        </span>
                      ) : (
                        `${files.paths.length} declared inline, written into each run's workspace`
                      ),
                    ],
                  ] as const)
                : []),
              ...(value
                ? ([
                    [
                      'Value',
                      'file' in value ? (
                        <span key="value" className={monoClass}>
                          {value.file}
                        </span>
                      ) : (
                        <span key="value">
                          {value.shape.type === 'array' ? (
                            `array of ${value.shape.items} items`
                          ) : value.shape.type === 'object' ? (
                            <span className="flex flex-wrap items-center gap-1">
                              object with
                              {value.shape.keys.map((key) => (
                                <Pill key={key}>
                                  <span className={monoClass}>{key}</span>
                                </Pill>
                              ))}
                            </span>
                          ) : (
                            value.shape.type
                          )}
                        </span>
                      ),
                    ],
                  ] as const)
                : []),
            ]}
          />
        </Card>
      ) : null}
      <DatasetFiles
        api={api}
        datasetId={dataset.id}
        mount={dataset.mount}
        evaluatorOnly={dataset.visibility === 'evaluator'}
      />
      <UsedBy
        runs={runs}
        scenarios={scenarios.map((scenario) => ({ scenario }))}
      />
    </>
  );
}
