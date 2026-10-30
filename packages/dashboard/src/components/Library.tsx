import { Badge, LayerCard, Table } from '@cloudflare/kumo';
import type { ReactNode } from 'react';
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
  type JudgeUse,
} from './library-entities.js';
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

function runtimes(agent: CatalogAgent) {
  return (
    <span className="flex flex-wrap gap-1">
      {agent.runtimes.map((runtime) => (
        <Pill key={runtime.name}>
          {runtime.name}{' '}
          <span className="text-kumo-subtle">({runtime.kind})</span>
        </Pill>
      ))}
    </span>
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
              <Table.Head>Runtimes</Table.Head>
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
                <Table.Cell>{runtimes(agent)}</Table.Cell>
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
            ['Runtimes', runtimes(agent)],
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

function threshold(scorer: CatalogScorer): string {
  if (scorer.kind === 'judge') return 'its verdict';
  return scorer.passAt === undefined ? 'only 1' : `≥ ${scorer.passAt}`;
}

function placement(use: JudgeUse): string {
  return use.placement === 'final'
    ? 'final scoring'
    : `checkpoint after step ${(use.step ?? 0) + 1}`;
}

export function JudgesPage({ catalog }: Data) {
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
              <Table.Head>Scenarios</Table.Head>
              <Table.Head>Defined in</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {judges.map(({ key, scorer, uses }) => (
              <Table.Row key={key} {...rowLinkProps}>
                <Table.Cell>
                  <Link
                    to={judgeHref(key)}
                    data-row-link
                    className={tableLinkClass}
                  >
                    {scorer.name}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <KindBadge scorer={scorer} />
                </Table.Cell>
                <Table.Cell className="tabular-nums">
                  {threshold(scorer)}
                </Table.Cell>
                <Table.Cell className="tabular-nums">
                  {new Set(uses.map((use) => use.scenario.id)).size}
                </Table.Cell>
                <Table.Cell>
                  <DefinedAt at={scorer.definedAt} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </DataTable>
      ) : (
        <Empty message="No judges yet. Add predicates or judges in judges/." />
      )}
    </>
  );
}

export function JudgePage({
  catalog,
  runs,
  judgeKey,
}: Data & { judgeKey: string }) {
  const found = libraryJudges(catalog).find((entry) => entry.key === judgeKey);
  if (!found) return <Empty message={`Judge not found: ${judgeKey}`} />;
  const { scorer, uses } = found;
  return (
    <>
      <LibraryBreadcrumbs section="judges" current={scorer.name} />
      <PageHeading title={scorer.name} status={<KindBadge scorer={scorer} />} />
      <Card>
        <DetailList
          items={[
            [
              'Kind',
              scorer.kind === 'judge'
                ? 'LLM judge: the scenario’s judge agent grades the trial against the rubric'
                : 'Predicate: a function scores the trial from 0 to 1',
            ],
            ['Passes at', threshold(scorer)],
            [
              'Partial trials',
              scorer.supportsPartial
                ? 'Also scores trials that stopped early or failed'
                : 'Only scores trials that ran to the end',
            ],
            ['Defined in', <DefinedAt key="at" at={scorer.definedAt} />],
          ]}
        />
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
      </Card>
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
      ? 'built by onLoad, adapted per trial by onRun'
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
                        <Pill>onRun · once per trial</Pill>
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
                          copied into each trial&apos;s workspace
                        </span>
                      ) : (
                        `${files.paths.length} declared inline, written into each trial's workspace`
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
