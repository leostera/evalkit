import { Table, Tabs } from '@cloudflare/kumo';
import { uncachedTokens } from '@evalkit/core/usage';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  CatalogEval,
  DashboardApi,
  RunDetail as RunDetailData,
  RunSummary,
  RunTranscriptView,
} from '../api.js';
import { agentName } from './agentName.js';
import { monoClass, NestedTable, tableLinkClass } from './DataTable.js';
import { DetailList } from './DetailList.js';
import { ErrorBanner } from './ErrorBanner.js';
import { batchHref, scenarioHref } from './links.js';
import { formatDuration, formatMetric, formatScore } from './run-columns.js';
import { CommitLabel } from './RunTable.js';
import { verdictEntries, VerdictList } from './RunVerdicts.js';
import { Trajectory } from './Trajectory.js';
import { verdictStatus } from './Verdict.js';
import { Code } from './Code.js';

/**
 * A run's transcript and events, loaded once per run and again when it
 * finishes, when they are complete.
 */
export function useRunTranscript(
  api: DashboardApi,
  run: RunSummary | undefined,
) {
  const [session, setSession] = useState<RunTranscriptView>(EMPTY_SESSION);
  const [error, setError] = useState<string>();
  const signature = run ? `${run.id}:${run.status}` : '';
  useEffect(() => {
    if (!run) return;
    let active = true;
    // Clear the previous run's transcript while this one loads.
    // oxlint-disable-next-line react/set-state-in-effect
    setError(undefined);
    setSession(EMPTY_SESSION);
    void api
      .getRunTranscript(run.id)
      .then((next) => {
        if (active) setSession(next);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : 'Unable to load the run',
          );
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, signature]);
  return { session, error };
}

const EMPTY_SESSION: RunTranscriptView = {
  transcript: null,
  subagents: {},
  runEvents: [],
};

/** Where a run happened, in a few words: the sandbox and what it is. */
export function sandboxLabel(
  sandbox: NonNullable<RunSummary['sandbox']>,
): string {
  if (sandbox.kind !== 'container')
    return sandbox.id === sandbox.kind
      ? sandbox.kind
      : `${sandbox.id} · ${sandbox.kind}`;
  const network =
    sandbox.network === 'full'
      ? 'full network'
      : sandbox.network === 'fixtures'
        ? 'fixtures only'
        : 'no network';
  const image = sandbox.image ?? sandbox.dockerfile;
  return `${sandbox.id} · container ${image} · ${network}`;
}

/** The question the verdicts answer, by how the run ended. */
export function verdictTitle(run: RunSummary, detail?: RunDetailData): string {
  if (run.status === 'running') return 'How it is scoring';
  if (run.status === 'errored') return 'Why it errored';
  if (run.status === 'limited') return 'Why it stopped';
  if (run.status === 'cancelled') return 'How far it got';
  if (detail && run.status === 'failed') return 'Why it failed';
  return 'How it scored';
}

/** `2 of 3 checks did not pass`, or `all 3 checks passed`. */
export function checksSummary(
  detail: RunDetailData | undefined,
  scenario: CatalogEval | undefined,
): string | undefined {
  if (!detail) return undefined;
  const counted = verdictEntries(detail, scenario).filter(
    ({ result }) => verdictStatus(result) !== 'skipped',
  );
  if (!counted.length) return undefined;
  const failed = counted.filter(({ result }) =>
    ['failed', 'error'].includes(verdictStatus(result)),
  ).length;
  return failed
    ? `${failed} of ${counted.length} checks did not pass`
    : `all ${counted.length} checks passed`;
}

/** `2 failed` or `3 passed`, for the section menu. */
export function checksCount(
  detail: RunDetailData | undefined,
  scenario: CatalogEval | undefined,
): string | undefined {
  if (!detail) return undefined;
  const statuses = verdictEntries(detail, scenario)
    .map(({ result }) => verdictStatus(result))
    .filter((status) => status !== 'skipped');
  if (!statuses.length) return undefined;
  const failed = statuses.filter((status) =>
    ['failed', 'error'].includes(status),
  ).length;
  return failed ? `${failed} failed` : `${statuses.length} passed`;
}

/**
 * What the run ran, one fact per line for the rail: scenario, agent, each
 * parameter, batch, commit, timing, and the agent's and judges' tokens.
 */
export function RunFacts({
  run,
  detail,
  scenario,
}: {
  run: RunSummary;
  detail?: RunDetailData;
  scenario?: CatalogEval;
}) {
  const metric = (name: string) =>
    detail?.metrics?.find((entry) => entry.name === name)?.value;
  const tokens = metric('tokens');
  const cached = metric('cached tokens');
  const hits = metric('cache hit rate');
  const steps = metric('steps');
  const judgeTokens = metric('judge tokens');
  const facts: Array<[string, ReactNode]> = [
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
    ...Object.entries(run.parameters ?? {}).map(
      ([key, value]): [string, ReactNode] => [
        key,
        <span key={key} className={monoClass}>
          {typeof value === 'string' ? value : JSON.stringify(value)}
        </span>,
      ],
    ),
    ...(run.batch
      ? ([
          [
            'Batch',
            <Link
              key="batch"
              to={batchHref(run.batch.id)}
              className={tableLinkClass}
              title="Show every run of this batch"
            >
              {run.batch.index + 1} of {run.batch.size}
            </Link>,
          ],
        ] as Array<[string, ReactNode]>)
      : []),
    ...(run.sandbox
      ? ([['Sandbox', sandboxLabel(run.sandbox)]] as Array<[string, ReactNode]>)
      : []),
    ['Commit', <CommitLabel key="commit" source={run.source} />],
    [
      'Started',
      <time key="started" dateTime={run.startedAt}>
        {new Date(run.startedAt).toLocaleString()}
      </time>,
    ],
    [
      'Took',
      run.durationMs === undefined ? '—' : formatDuration(run.durationMs)!,
    ],
    ...(run.score !== undefined
      ? ([['Score', formatScore(run.score)]] as Array<[string, ReactNode]>)
      : []),
    ...(steps !== undefined
      ? ([['Steps', againstLimit(steps, run.limits?.steps)]] as Array<
          [string, ReactNode]
        >)
      : []),
    ...(tokens !== undefined
      ? ([
          [
            'Agent tokens',
            [
              againstLimit(tokens, run.limits?.tokens),
              cached ? `${compact(cached)} cached` : '',
              // A hit rate only means something once the cache was used.
              hits === undefined || !cached
                ? ''
                : `${Math.round(hits * 100)}% cache hits`,
            ]
              .filter(Boolean)
              .join(' · '),
          ],
        ] as Array<[string, ReactNode]>)
      : []),
    ...(judgeTokens !== undefined
      ? ([['Judge tokens', judgeTokens.toLocaleString()]] as Array<
          [string, ReactNode]
        >)
      : []),
  ];
  return (
    <dl className="run-facts grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-kumo-subtle">{label}</dt>
          <dd className="min-w-0 break-words text-kumo-default tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Pane = 'trajectory' | 'verdicts';

/**
 * What the agent did beside why it passed or failed. With room, side by
 * side, each scrolling on its own; without, as tabs (`?pane=`), opening on
 * the verdicts when the run did not pass.
 */
export function TrajectoryAndScoring({
  run,
  detail,
  scenario,
  session,
  sessionError,
}: {
  run: RunSummary;
  detail?: RunDetailData;
  scenario?: CatalogEval;
  session: RunTranscriptView;
  sessionError?: string;
}) {
  const [params, setParams] = useSearchParams();
  const fallback: Pane =
    run.status === 'failed' ||
    run.status === 'errored' ||
    run.status === 'limited'
      ? 'verdicts'
      : 'trajectory';
  const pane = (params.get('pane') as Pane | null) ?? fallback;
  const choose = (next: Pane) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set('pane', next);
        return updated;
      },
      { replace: true },
    );
  const title = verdictTitle(run, detail);
  const failed = detail
    ? verdictEntries(detail, scenario).filter(({ result }) =>
        ['failed', 'error'].includes(verdictStatus(result)),
      ).length
    : 0;
  return (
    <div className="run-inspector flex min-h-0 flex-1 flex-col gap-3 xl:grid xl:grid-cols-2 xl:gap-0">
      <div className="xl:hidden">
        <Tabs
          variant="segmented"
          size="sm"
          value={pane}
          onValueChange={(value) => choose(value as Pane)}
          tabs={[
            { value: 'trajectory', label: 'Trajectory' },
            {
              value: 'verdicts',
              label: failed ? `${title} · ${failed}` : title,
            },
          ]}
        />
      </div>
      <section
        aria-label="What it did"
        className={`run-trajectory min-h-0 min-w-0 flex-1 overflow-y-auto xl:block xl:border-r xl:border-kumo-line xl:pr-5 ${
          pane === 'trajectory' ? '' : 'hidden'
        }`}
      >
        {sessionError ? (
          <ErrorBanner title="Unable to load the run" message={sessionError} />
        ) : null}
        <Trajectory
          session={session}
          checkpoints={detail?.checkpoints}
          scenario={scenario}
        />
      </section>
      <section
        aria-label={title}
        className={`run-verdicts flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto xl:flex xl:pl-5 ${
          pane === 'verdicts' ? '' : 'hidden'
        }`}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-kumo-strong">{title}</h2>
          <span className="text-xs text-kumo-subtle tabular-nums">
            {checksSummary(detail, scenario)}
          </span>
        </header>
        {run.status === 'errored' && detail?.summary ? (
          <RunError summary={detail.summary} />
        ) : null}
        {run.status === 'limited' ? (
          <RunLimit run={run} skipped={skippedScorers(detail)} />
        ) : null}
        {detail ? (
          <VerdictList detail={detail} scenario={scenario} />
        ) : (
          <output className="text-[13px] text-kumo-subtle">Loading…</output>
        )}
      </section>
    </div>
  );
}

/** `41 of 40`, or `41` without a limit. */
function againstLimit(value: number, limit: number | undefined): string {
  return limit === undefined
    ? value.toLocaleString()
    : `${value.toLocaleString()} of ${limit.toLocaleString()}`;
}

/** `9.8M`, `120k`, `950`. */
function compact(value: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/** Which limit stopped the run, and what that left graded. */
function RunLimit({ run, skipped }: { run: RunSummary; skipped: string[] }) {
  const limit = run.limit;
  return (
    <div className="run-limit rounded-lg border border-kumo-line bg-kumo-badge-purple/10 px-3 py-2 text-[13px]">
      <p className="font-medium text-kumo-strong">
        {limit
          ? `Stopped at its ${limit.limit} limit: ${limitUse(limit)}.`
          : 'Stopped at one of its limits.'}
      </p>
      <p className="text-kumo-subtle">
        Scorers that grade partial work ran on what it left
        {skipped.length ? `; ${skipped.join(', ')} did not.` : '.'}
      </p>
    </div>
  );
}

/** `41 of 40 steps`, `20m 04s of 20m`. */
export function limitUse(limit: NonNullable<RunSummary['limit']>): string {
  return limit.limit === 'time'
    ? `${formatDuration(limit.used)} of ${formatDuration(limit.value)}`
    : `${limit.used.toLocaleString()} of ${limit.value.toLocaleString()} ${limit.limit}`;
}

function skippedScorers(detail: RunDetailData | undefined): string[] {
  const scoring = (
    detail?.summary as { scoring?: { skippedScorers?: string[] } }
  )?.scoring;
  return scoring?.skippedScorers ?? [];
}

/** Why the run could not finish, in the words it was recorded with. */
function RunError({ summary }: { summary: unknown }) {
  const error = (summary as { error?: { name?: string; message?: string } })
    .error;
  if (!error?.message) return null;
  return (
    <div className="run-error rounded-md border border-kumo-danger/40 bg-kumo-danger-tint px-3 py-2 text-[13px]">
      <p className="font-medium text-kumo-strong">
        The run could not finish{error.name ? ` (${error.name})` : ''}
      </p>
      <pre className="mt-1 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap text-kumo-default">
        {error.message}
      </pre>
    </div>
  );
}

/** A section of the run page with its heading and what it holds, in one sentence. */
export function RunSectionBody({
  title,
  about,
  children,
}: {
  title: string;
  about?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-kumo-strong">{title}</h2>
        {about ? <p className="text-[13px] text-kumo-subtle">{about}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** The judges that ran, with what each did. */
export function judgedResults(detail: RunDetailData | undefined) {
  if (!detail) return [];
  return [
    ...(detail.checkpoints ?? []).map((check) => ({
      label: `${check.name} (step ${check.step + 1})`,
      result: check,
    })),
    ...detail.scores.map((score) => ({ label: score.name, result: score })),
  ].filter(({ result }) => result.judge);
}

/**
 * What judging this run cost: each judge's model, tokens and time. Kept apart
 * from the agent's own metrics, so a judge's tokens never inflate the agent's.
 */
export function JudgingTable({ detail }: { detail: RunDetailData }) {
  const judged = judgedResults(detail);
  if (!judged.length)
    return (
      <p className="text-[13px] text-kumo-subtle">No judges ran in this run.</p>
    );
  const tokensOf = (result: (typeof judged)[number]['result']) =>
    result.judge?.usage ? uncachedTokens(result.judge.usage) : undefined;
  const totalTokens = judged.reduce(
    (sum, { result }) => sum + (tokensOf(result) ?? 0),
    0,
  );
  const totalTime = judged.reduce(
    (sum, { result }) => sum + (result.durationMs ?? 0),
    0,
  );
  return (
    <NestedTable wrap>
      <Table.Header variant="compact">
        <Table.Row>
          <Table.Head>Judge</Table.Head>
          <Table.Head>Agent</Table.Head>
          <Table.Head>Model</Table.Head>
          <Table.Head>Tokens</Table.Head>
          <Table.Head>Time</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {judged.map(({ label, result }) => (
          <Table.Row key={label}>
            <Table.Cell>{label}</Table.Cell>
            <Table.Cell>
              {result.judge?.agent?.name ?? result.judge?.agent?.id ?? '—'}
            </Table.Cell>
            <Table.Cell className={monoClass}>
              {result.judge?.model ?? '—'}
            </Table.Cell>
            <Table.Cell className="tabular-nums">
              {tokensOf(result)?.toLocaleString() ?? '—'}
            </Table.Cell>
            <Table.Cell className="tabular-nums">
              {result.durationMs === undefined
                ? '—'
                : formatDuration(result.durationMs)}
            </Table.Cell>
          </Table.Row>
        ))}
        {judged.length > 1 ? (
          <Table.Row className="font-medium">
            <Table.Cell>Total</Table.Cell>
            <Table.Cell />
            <Table.Cell />
            <Table.Cell className="tabular-nums">
              {totalTokens.toLocaleString()}
            </Table.Cell>
            <Table.Cell className="tabular-nums">
              {formatDuration(totalTime)}
            </Table.Cell>
          </Table.Row>
        ) : null}
      </Table.Body>
    </NestedTable>
  );
}

/** The run's own metrics; judging is its own section. */
export function agentMetrics(detail: RunDetailData | undefined) {
  return (detail?.metrics ?? []).filter(
    (metric) => metric.name !== 'judge tokens',
  );
}

export function MetricsList({
  detail,
  limits,
}: {
  detail: RunDetailData;
  /** The run's limits, shown beside the metrics they cap. */
  limits?: RunSummary['limits'];
}) {
  const metrics = agentMetrics(detail);
  const cap: Record<string, number | undefined> = {
    steps: limits?.steps,
    tokens: limits?.tokens,
    'agent time': limits?.time,
  };
  if (!metrics.length)
    return (
      <p className="text-[13px] text-kumo-subtle">
        This run recorded no metrics.
      </p>
    );
  return (
    <DetailList
      items={metrics.map(
        (metric) =>
          [
            metric.name,
            metric.error ? (
              <span key={metric.name} className="text-kumo-danger">
                {metric.error.message}
              </span>
            ) : (
              <span key={metric.name} className="tabular-nums">
                {metric.value === undefined ? (
                  <span className="text-kumo-subtle">not measured</span>
                ) : (
                  formatMetric(metric.value, metric.unit)
                )}
                {cap[metric.name] === undefined ? null : (
                  <span className="text-kumo-subtle">
                    {' '}
                    of {formatMetric(cap[metric.name]!, metric.unit)} allowed
                  </span>
                )}
              </span>
            ),
          ] as [string, ReactNode],
      )}
    />
  );
}

export function DatasetsList({ detail }: { detail: RunDetailData }) {
  const datasets = runDatasets(detail.manifest);
  if (!datasets.length)
    return (
      <p className="text-[13px] text-kumo-subtle">This run used no datasets.</p>
    );
  return (
    <DetailList
      items={datasets.map(
        (dataset) =>
          [
            dataset.id,
            <span key={dataset.id} title={dataset.digest}>
              {dataset.visibility} · {dataset.source} ·{' '}
              <span className={monoClass}>
                {dataset.digest.replace('sha256:', '').slice(0, 12)}
              </span>
            </span>,
          ] as [string, ReactNode],
      )}
    />
  );
}

export function RawReport({ detail }: { detail: RunDetailData }) {
  return (
    <Code
      code={JSON.stringify(
        { manifest: detail.manifest, summary: detail.summary },
        null,
        2,
      )}
      lang="json"
      className="raw-report"
    />
  );
}

type RunDatasetEntry = {
  id: string;
  visibility: string;
  source: string;
  digest: string;
};

/** The datasets a run used, from its manifest. */
export function runDatasets(manifest: unknown): RunDatasetEntry[] {
  const datasets = (manifest as { datasets?: unknown } | undefined)?.datasets;
  if (!Array.isArray(datasets)) return [];
  return datasets.filter(
    (entry): entry is RunDatasetEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as RunDatasetEntry).id === 'string' &&
      typeof (entry as RunDatasetEntry).digest === 'string',
  );
}
