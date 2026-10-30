import { Button, Table } from '@cloudflare/kumo';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { useEffect, useState, type ReactNode } from 'react';
import type { DashboardApi, TrajectoryEvent, TrialSummary } from '../api.js';
import { ArtifactRow } from './ArtifactRow.js';
import { monoClass, NestedTable } from './DataTable.js';
import { DetailList } from './DetailList.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
import { EventCard } from './EventCard.js';
import { StatusBadge } from './StatusBadge.js';
import type { SelectedTrial } from './types.js';

export function TrialDetail({
  api,
  selected,
  evalName,
  onWorkspace,
}: {
  api: DashboardApi;
  selected?: SelectedTrial;
  evalName?: string;
  onWorkspace(): void;
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
  const { run, trial } = selected;
  return (
    <section className="trial-inspector grid gap-5 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
      <aside className="trial-overview flex min-w-0 flex-col gap-4">
        <DetailList
          items={[
            [
              'Run',
              <span key="run" className={monoClass}>
                {run.id}
              </span>,
            ],
            ['Eval', evalName ?? 'Unnamed eval'],
            ['Trial', trial.index + 1],
            ['Status', <StatusBadge key="status" status={trial.status} />],
            ['Aggregate score', trial.score ?? '—'],
            [
              'Runtime',
              trial.durationMs === undefined ? '—' : `${trial.durationMs}ms`,
            ],
            ['Events', events.length],
            ...trialDatasets(detail?.manifest).map(
              (dataset) =>
                [
                  `Dataset ${dataset.id}`,
                  <span key={dataset.id} title={dataset.digest}>
                    {dataset.visibility} · {dataset.source} ·{' '}
                    <span className={monoClass}>
                      {dataset.digest.replace('sha256:', '').slice(0, 12)}
                    </span>
                  </span>,
                ] as [string, ReactNode],
            ),
          ]}
        />
        <Button
          size="sm"
          variant="secondary"
          className="open-workspace self-start"
          onClick={onWorkspace}
        >
          Open candidate workspace
          <ArrowRightIcon aria-hidden className="size-3.5" />
        </Button>
        {trial.checkpoints?.length ? (
          <EvidenceSection title="Checkpoints">
            <CheckpointTable checkpoints={trial.checkpoints} />
          </EvidenceSection>
        ) : null}
        <EvidenceSection title="Final scoring">
          <ScoreTable scores={trial.scores} />
          {trial.skippedScorers?.length ? (
            <p className="text-xs text-kumo-subtle">
              Skipped final scorers: {trial.skippedScorers.join(', ')}
            </p>
          ) : null}
        </EvidenceSection>
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
      <section className="timeline flex min-w-0 flex-col gap-2">
        {loadError ? (
          <ErrorBanner
            title="Unable to load trial details"
            message={loadError}
          />
        ) : null}
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-kumo-strong">
            Event timeline
          </h3>
          <span className="text-xs text-kumo-subtle tabular-nums">
            {events.length} events
          </span>
        </div>
        {events.map((event, index) => (
          <EventCard
            event={event}
            index={index}
            key={`${event.timestamp}-${index}`}
          />
        ))}
      </section>
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
