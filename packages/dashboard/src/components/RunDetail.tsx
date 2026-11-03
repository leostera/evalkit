import { Table } from '@cloudflare/kumo';
import { turnTokens } from '@evalkit/core/usage';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  CatalogEval,
  DashboardApi,
  RunDetail as RunDetailData,
  RunSummary,
  TrajectoryEvent,
} from '../api.js';
import { agentName } from './agentName.js';
import { ArtifactRow } from './ArtifactRow.js';
import { monoClass, NestedTable, tableLinkClass } from './DataTable.js';
import { DetailList } from './DetailList.js';
import { ErrorBanner } from './ErrorBanner.js';
import { formatBytes } from './FileTree.js';
import { attachmentsHref, batchHref, scenarioHref } from './links.js';
import { formatDuration, formatMetric, formatScore } from './run-columns.js';
import { CommitLabel } from './RunTable.js';
import { RunFiles } from './run-files.js';
import { verdictEntries, VerdictList } from './RunVerdicts.js';
import { Trajectory } from './Trajectory.js';
import { verdictStatus } from './Verdict.js';

/**
 * A run, laid out to answer two questions side by side: what did the agent
 * do (its trajectory, on the left), and why did it pass or fail (every
 * verdict, failures first and open, on the right, which stays in view while
 * the trajectory scrolls). The rest (judging, metrics, files, datasets) is
 * folded below the verdicts. `detail` is undefined while it loads.
 */
export function RunDetail({
  api,
  catalog,
  run,
  detail,
}: {
  api: DashboardApi;
  catalog: CatalogEval[];
  run: RunSummary;
  detail?: RunDetailData;
}) {
  const [events, setEvents] = useState<TrajectoryEvent[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [artifacts, setArtifacts] = useState<
    Array<{ path: string; kind: string; size?: number }>
  >([]);
  // Reload when the run finishes: its trajectory and artifacts are complete then.
  const signature = `${run.id}:${run.status}`;
  useEffect(() => {
    let active = true;
    // Clear the previous run's evidence while this one loads.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoadError(undefined);
    setEvents([]);
    setArtifacts([]);
    void Promise.all([api.getRunEvents(run.id), api.listArtifacts(run.id)])
      .then(([nextEvents, nextArtifacts]) => {
        if (!active) return;
        setEvents(nextEvents);
        setArtifacts(nextArtifacts);
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(
            cause instanceof Error ? cause.message : 'Unable to load the run',
          );
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, signature]);
  const scenario = catalog.find((entry) => entry.id === run.evalId);
  return (
    <RunFiles.Provider
      value={{ runId: run.id, attachments: detail?.attachments ?? [] }}
    >
      <RunFacts run={run} detail={detail} scenario={scenario} />
      <section className="run-inspector grid items-start gap-6 lg:grid-cols-2">
        <section
          aria-label="What it did"
          className="run-trajectory flex min-w-0 flex-col gap-2"
        >
          {loadError ? (
            <ErrorBanner title="Unable to load the run" message={loadError} />
          ) : null}
          <Trajectory
            events={events}
            checkpoints={detail?.checkpoints}
            scenario={scenario}
          />
        </section>
        <aside
          aria-label={verdictTitle(run, detail)}
          className="run-verdicts flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pr-1"
        >
          <VerdictHeading run={run} detail={detail} scenario={scenario} />
          {run.status === 'errored' && detail?.summary ? (
            <RunError summary={detail.summary} />
          ) : null}
          {detail ? (
            <>
              <VerdictList detail={detail} scenario={scenario} />
              <RunDetails run={run} detail={detail} artifacts={artifacts} />
            </>
          ) : (
            <output className="text-[13px] text-kumo-subtle">Loading…</output>
          )}
        </aside>
      </section>
    </RunFiles.Provider>
  );
}

/** One line of what the run ran: scenario, agent, parameters, commit, cost. */
function RunFacts({
  run,
  detail,
  scenario,
}: {
  run: RunSummary;
  detail?: RunDetailData;
  scenario?: CatalogEval;
}) {
  const parameters = Object.entries(run.parameters ?? {});
  const metric = (name: string) =>
    detail?.metrics?.find((entry) => entry.name === name)?.value;
  const tokens = metric('tokens');
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
    ...(parameters.length
      ? ([
          [
            'Parameters',
            <span key="parameters" className={monoClass}>
              {parameters
                .map(([key, value]) => `${key}=${String(value)}`)
                .join(' ')}
            </span>,
          ],
        ] as Array<[string, ReactNode]>)
      : []),
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
    ...(tokens !== undefined
      ? ([['Agent tokens', tokens.toLocaleString()]] as Array<
          [string, ReactNode]
        >)
      : []),
    ...(judgeTokens !== undefined
      ? ([['Judge tokens', judgeTokens.toLocaleString()]] as Array<
          [string, ReactNode]
        >)
      : []),
  ];
  return (
    <dl className="run-facts flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
      {facts.map(([label, value]) => (
        <div key={label} className="flex min-w-0 items-baseline gap-1.5">
          <dt className="text-kumo-subtle">{label}</dt>
          <dd className="min-w-0 text-kumo-default tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function verdictTitle(run: RunSummary, detail?: RunDetailData): string {
  if (run.status === 'running') return 'How it is scoring';
  if (run.status === 'errored') return 'Why it errored';
  if (run.status === 'cancelled') return 'How far it got';
  if (detail && run.status === 'failed') return 'Why it failed';
  return 'How it scored';
}

/** The pane's question, and the count that answers it at a glance. */
function VerdictHeading({
  run,
  detail,
  scenario,
}: {
  run: RunSummary;
  detail?: RunDetailData;
  scenario?: CatalogEval;
}) {
  const entries = detail ? verdictEntries(detail, scenario) : [];
  const counted = entries.filter(
    ({ result }) => verdictStatus(result) !== 'skipped',
  );
  const failed = counted.filter(({ result }) =>
    ['failed', 'error'].includes(verdictStatus(result)),
  ).length;
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold text-kumo-strong">
        {verdictTitle(run, detail)}
      </h2>
      {counted.length ? (
        <span className="text-xs text-kumo-subtle tabular-nums">
          {failed
            ? `${failed} of ${counted.length} checks did not pass`
            : `all ${counted.length} checks passed`}
          {run.score !== undefined ? ` · score ${formatScore(run.score)}` : ''}
        </span>
      ) : null}
    </header>
  );
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

/** What the run cost and used, folded: none of it says why it failed. */
function RunDetails({
  run,
  detail,
  artifacts,
}: {
  run: RunSummary;
  detail: RunDetailData;
  artifacts: ReadonlyArray<{ path: string; kind: string; size?: number }>;
}) {
  const datasets = runDatasets(detail.manifest);
  // Judging is reported in its own section, never as the agent's own cost.
  const agentMetrics = (detail.metrics ?? []).filter(
    (metric) => metric.name !== 'judge tokens',
  );
  return (
    <div className="run-details flex flex-col divide-y divide-kumo-hairline rounded-md border border-kumo-line text-[13px]">
      <JudgingSection detail={detail} />
      {agentMetrics.length ? (
        <Fold title="Metrics" summary={`${agentMetrics.length}`}>
          <DetailList
            items={agentMetrics.map(
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
                    </span>
                  ),
                ] as [string, ReactNode],
            )}
          />
        </Fold>
      ) : null}
      {detail.attachments?.length ? (
        <Fold title="Attachments" summary={`${detail.attachments.length}`}>
          <ul className="flex flex-col gap-1">
            {detail.attachments.map((attachment) => (
              <li
                key={attachment.name}
                className="flex items-baseline justify-between gap-3"
              >
                <Link
                  to={attachmentsHref(run.id, attachment.name)}
                  className={`${tableLinkClass} ${monoClass} min-w-0 truncate`}
                  title={attachment.name}
                >
                  {attachment.name}
                </Link>
                <span className="shrink-0 text-xs text-kumo-subtle tabular-nums">
                  {attachment.truncatedFrom
                    ? `last ${formatBytes(attachment.size)} of ${formatBytes(attachment.truncatedFrom)}`
                    : formatBytes(attachment.size)}
                </span>
              </li>
            ))}
          </ul>
        </Fold>
      ) : null}
      {datasets.length ? (
        <Fold title="Datasets" summary={`${datasets.length}`}>
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
        </Fold>
      ) : null}
      {artifacts.length ? (
        <Fold title="Artifacts" summary={`${artifacts.length}`}>
          <NestedTable wrap>
            <Table.Header variant="compact">
              <Table.Row>
                <Table.Head>Path</Table.Head>
                <Table.Head>Kind</Table.Head>
                <Table.Head>Size</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {artifacts.map((artifact) => (
                <ArtifactRow key={artifact.path} artifact={artifact} />
              ))}
            </Table.Body>
          </NestedTable>
        </Fold>
      ) : null}
      <Fold title="Raw run report" className="raw-details">
        <pre className="overflow-x-auto rounded-md bg-kumo-elevated px-3 py-2 font-mono text-xs">
          {JSON.stringify(
            { manifest: detail.manifest, summary: detail.summary },
            null,
            2,
          )}
        </pre>
      </Fold>
    </div>
  );
}

function Fold({
  title,
  summary,
  className = '',
  children,
}: {
  title: string;
  summary?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="flex cursor-pointer items-baseline justify-between gap-2 px-3 py-2 font-medium text-kumo-strong select-none">
        {title}
        {summary ? (
          <span className="text-xs font-normal text-kumo-subtle tabular-nums">
            {summary}
          </span>
        ) : null}
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>
    </details>
  );
}

/**
 * What judging this run cost: each judge's model, tokens and time. Kept apart
 * from the agent's own metrics, so a judge's tokens never inflate the agent's.
 */
function JudgingSection({ detail }: { detail: RunDetailData }) {
  const judged = [
    ...(detail.checkpoints ?? []).map((check) => ({
      label: `${check.name} (step ${check.step + 1})`,
      result: check,
    })),
    ...detail.scores.map((score) => ({ label: score.name, result: score })),
  ].filter(({ result }) => result.judge);
  if (!judged.length) return null;
  const tokensOf = (result: (typeof judged)[number]['result']) =>
    result.judge?.usage ? turnTokens(result.judge.usage) : undefined;
  const totalTokens = judged.reduce(
    (sum, { result }) => sum + (tokensOf(result) ?? 0),
    0,
  );
  const totalTime = judged.reduce(
    (sum, { result }) => sum + (result.durationMs ?? 0),
    0,
  );
  return (
    <Fold
      title="Judging"
      summary={`${totalTokens.toLocaleString()} tokens · never counted as the agent's`}
    >
      <NestedTable wrap>
        <Table.Header variant="compact">
          <Table.Row>
            <Table.Head>Judge</Table.Head>
            <Table.Head>Model</Table.Head>
            <Table.Head>Tokens</Table.Head>
            <Table.Head>Time</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {judged.map(({ label, result }) => (
            <Table.Row key={label}>
              <Table.Cell>{label}</Table.Cell>
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
    </Fold>
  );
}

type RunDatasetEntry = {
  id: string;
  visibility: string;
  source: string;
  digest: string;
};

/** The datasets a run used, from its manifest. */
function runDatasets(manifest: unknown): RunDatasetEntry[] {
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
