import { Table } from '@cloudflare/kumo';
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
import { formatBytes } from './FileTree.js';
import { attachmentsHref, batchHref, scenarioHref } from './links.js';
import { DetailList } from './DetailList.js';
import { ErrorBanner } from './ErrorBanner.js';
import { formatDuration, formatMetric } from './run-columns.js';
import { CommitLabel } from './RunTable.js';
import { StatusBadge } from './StatusBadge.js';
import { Trajectory } from './Trajectory.js';

/**
 * A run's trajectory, with what it ran (scenario, agent, parameters, commit)
 * and how it scored beside it. `detail` is undefined while it loads.
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
  const parameters = Object.entries(run.parameters ?? {});
  const datasets = runDatasets(detail?.manifest);
  return (
    <section className="run-inspector grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <div className="flex min-w-0 flex-col gap-2">
        {loadError ? (
          <ErrorBanner title="Unable to load the run" message={loadError} />
        ) : null}
        <Trajectory events={events} />
      </div>
      <aside className="run-overview flex min-w-0 flex-col gap-4">
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
                      Run {run.batch.index + 1} of {run.batch.size}
                    </Link>,
                  ],
                ] as const)
              : []),
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
            ['Commit', <CommitLabel key="commit" source={run.source} />],
          ]}
        />
        {!detail ? null : (
          <>
            <EvidenceSection title="Final scoring">
              <ScoreTable scores={detail.scores} />
              {detail.skippedScorers?.length ? (
                <p className="text-xs text-kumo-subtle">
                  Skipped final scorers: {detail.skippedScorers.join(', ')}
                </p>
              ) : null}
            </EvidenceSection>
            {detail.metrics?.length ? (
              <EvidenceSection title="Metrics">
                <DetailList
                  items={detail.metrics.map(
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
                              <span className="text-kumo-subtle">
                                not measured
                              </span>
                            ) : (
                              formatMetric(metric.value, metric.unit)
                            )}
                          </span>
                        ),
                      ] as [string, ReactNode],
                  )}
                />
              </EvidenceSection>
            ) : null}
            {detail.checkpoints?.length ? (
              <EvidenceSection title="Checkpoints">
                <CheckpointTable checkpoints={detail.checkpoints} />
              </EvidenceSection>
            ) : null}
            {detail.attachments?.length ? (
              <EvidenceSection title="Attachments">
                <ul className="flex flex-col gap-1 text-[13px]">
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
              </EvidenceSection>
            ) : null}
            {datasets.length ? (
              <EvidenceSection title="Datasets">
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
              </EvidenceSection>
            ) : null}
            {artifacts.length ? (
              <EvidenceSection title="Artifacts">
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
              </EvidenceSection>
            ) : null}
            <details className="raw-details text-xs">
              <summary className="cursor-pointer font-medium text-kumo-subtle select-none">
                Raw run report
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-md bg-kumo-elevated px-3 py-2 font-mono">
                {JSON.stringify(
                  { manifest: detail.manifest, summary: detail.summary },
                  null,
                  2,
                )}
              </pre>
            </details>
          </>
        )}
      </aside>
    </section>
  );
}

function EvidenceSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-kumo-strong">{title}</h3>
      {children}
    </section>
  );
}

function CheckpointTable({
  checkpoints,
}: {
  checkpoints: NonNullable<RunDetailData['checkpoints']>;
}) {
  return (
    <NestedTable wrap>
      <Table.Header variant="compact">
        <Table.Row>
          <Table.Head>Step</Table.Head>
          <Table.Head>Rule</Table.Head>
          <Table.Head>Value</Table.Head>
          <Table.Head>Result</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {checkpoints.map((check) => (
          <Table.Row key={`${check.step}-${check.name}`}>
            <Table.Cell className="tabular-nums">{check.step + 1}</Table.Cell>
            <Table.Cell>
              <span className="text-kumo-subtle">{check.kind}:</span>{' '}
              {check.name}
              {check.matchedToolCall
                ? ` (event ${check.matchedToolCall.eventIndex + 1})`
                : ''}
            </Table.Cell>
            <Table.Cell className="tabular-nums">
              {check.value ?? '—'}
            </Table.Cell>
            <Table.Cell>
              <StatusBadge status={check.status} />
              {check.error ? (
                <p className="mt-1 text-xs text-kumo-danger">
                  {check.error.message}
                </p>
              ) : null}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </NestedTable>
  );
}

/** Never reports a pass unless the scorer recorded one. */
function scoreResult(score: RunDetailData['scores'][number]): string {
  if (score.error) return 'error';
  if (score.skipped) return 'skipped';
  if (score.passed === true) return 'passed';
  if (score.passed === false) return 'failed';
  return 'not scored';
}

function ScoreTable({ scores }: { scores: RunDetailData['scores'] }) {
  return (
    <NestedTable wrap>
      <Table.Header variant="compact">
        <Table.Row>
          <Table.Head>Scorer</Table.Head>
          <Table.Head>Value</Table.Head>
          <Table.Head>Result</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {scores.map((score) => (
          <Table.Row key={score.name}>
            <Table.Cell>
              {score.kind ? (
                <span className="text-kumo-subtle">{score.kind}: </span>
              ) : null}
              {score.name}
            </Table.Cell>
            <Table.Cell className="tabular-nums">
              {score.value ?? '—'}
            </Table.Cell>
            <Table.Cell>
              <StatusBadge status={scoreResult(score)} />
              {score.skipped && score.explanation ? (
                <p className="mt-1 text-xs text-kumo-subtle">
                  {score.explanation}
                </p>
              ) : null}
              {score.error ? (
                <p className="mt-1 text-xs text-kumo-danger">
                  {score.error.message}
                </p>
              ) : null}
            </Table.Cell>
          </Table.Row>
        ))}
        {!scores.length ? (
          <Table.Row>
            <Table.Cell colSpan={3} className="text-kumo-subtle">
              No final scorers.
            </Table.Cell>
          </Table.Row>
        ) : null}
      </Table.Body>
    </NestedTable>
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
