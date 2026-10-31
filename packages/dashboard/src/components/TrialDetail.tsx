import { Table } from '@cloudflare/kumo';
import { useEffect, useState, type ReactNode } from 'react';
import type { DashboardApi, TrajectoryEvent, TrialSummary } from '../api.js';
import { ArtifactRow } from './ArtifactRow.js';
import { monoClass, NestedTable } from './DataTable.js';
import { DetailList } from './DetailList.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import { formatDuration, formatMetric } from './run-columns.js';
import { StatusBadge } from './StatusBadge.js';
import { Trajectory } from './Trajectory.js';
import type { SelectedTrial } from './types.js';

/** A trial's trajectory, with its scores and evidence beside it. */
export function TrialDetail({
  api,
  selected,
}: {
  api: DashboardApi;
  selected?: SelectedTrial;
}) {
  const [events, setEvents] = useState<TrajectoryEvent[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [detail, setDetail] = useState<{
    manifest: unknown;
    summary: unknown;
  }>();
  const [artifacts, setArtifacts] = useState<
    Array<{ path: string; kind: string; size?: number }>
  >([]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    // Clear stale evidence while the selected trial's report loads.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoadError(undefined);
    setEvents([]);
    setDetail(undefined);
    setArtifacts([]);
    void Promise.all([
      api.getTrialEvents(selected.run.id, selected.trial.id),
      api.getTrial(selected.run.id, selected.trial.id),
      api.listArtifacts(selected.run.id, selected.trial.id),
    ])
      .then(([nextEvents, nextDetail, nextArtifacts]) => {
        if (!active) return;
        setEvents(nextEvents);
        setDetail(nextDetail);
        setArtifacts(nextArtifacts);
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load trial details',
          );
      });
    return () => {
      active = false;
    };
  }, [api, selected]);
  if (!selected)
    return <Empty message="Select a trial from a run to inspect it." />;
  const { trial } = selected;
  const datasets = trialDatasets(detail?.manifest);
  return (
    <section className="trial-inspector grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <div className="flex min-w-0 flex-col gap-2">
        {loadError ? (
          <ErrorBanner
            title="Unable to load trial details"
            message={loadError}
          />
        ) : null}
        <Trajectory events={events} />
      </div>
      <aside className="trial-overview flex min-w-0 flex-col gap-4">
        <DetailList
          items={[
            ['Status', <StatusBadge key="status" status={trial.status} />],
            ['Aggregate score', trial.score ?? '—'],
            [
              'Runtime',
              trial.durationMs === undefined
                ? '—'
                : formatDuration(trial.durationMs)!,
            ],
            ['Started', new Date(trial.startedAt).toLocaleString()],
          ]}
        />
        <EvidenceSection title="Final scoring">
          <ScoreTable scores={trial.scores} />
          {trial.skippedScorers?.length ? (
            <p className="text-xs text-kumo-subtle">
              Skipped final scorers: {trial.skippedScorers.join(', ')}
            </p>
          ) : null}
        </EvidenceSection>
        {trial.metrics?.length ? (
          <EvidenceSection title="Metrics">
            <DetailList
              items={trial.metrics.map(
                (metric) =>
                  [
                    metric.name,
                    metric.error ? (
                      <span key={metric.name} className="text-kumo-danger">
                        {metric.error.message}
                      </span>
                    ) : (
                      <span key={metric.name} className="tabular-nums">
                        {metric.value === undefined
                          ? '—'
                          : formatMetric(metric.value, metric.unit)}
                      </span>
                    ),
                  ] as [string, ReactNode],
              )}
            />
          </EvidenceSection>
        ) : null}
        {trial.checkpoints?.length ? (
          <EvidenceSection title="Checkpoints">
            <CheckpointTable checkpoints={trial.checkpoints} />
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
        {detail ? (
          <details className="raw-details text-xs">
            <summary className="cursor-pointer font-medium text-kumo-subtle select-none">
              Raw trial summary
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-md bg-kumo-elevated px-3 py-2 font-mono">
              {JSON.stringify(detail.summary, null, 2)}
            </pre>
          </details>
        ) : null}
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
  checkpoints: NonNullable<TrialSummary['checkpoints']>;
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
function scoreResult(score: TrialSummary['scores'][number]): string {
  if (score.error) return 'error';
  if (score.skipped) return 'skipped';
  if (score.passed === true) return 'passed';
  if (score.passed === false) return 'failed';
  return 'not scored';
}

function ScoreTable({ scores }: { scores: TrialSummary['scores'] }) {
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

type TrialDatasetEntry = {
  id: string;
  visibility: string;
  source: string;
  digest: string;
};

/** The datasets a trial used (schema version 5+); older manifests have none. */
function trialDatasets(manifest: unknown): TrialDatasetEntry[] {
  const datasets = (manifest as { datasets?: unknown } | undefined)?.datasets;
  if (!Array.isArray(datasets)) return [];
  return datasets.filter(
    (entry): entry is TrialDatasetEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as TrialDatasetEntry).id === 'string' &&
      typeof (entry as TrialDatasetEntry).digest === 'string',
  );
}
