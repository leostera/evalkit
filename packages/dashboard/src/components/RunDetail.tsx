import { formatScore } from './run-columns.js';
import { Table } from '@cloudflare/kumo';
import { CaretRightIcon } from '@phosphor-icons/react';
import { turnTokens } from '@evalkit/core/usage';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  CatalogEval,
  CatalogScorer,
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
import { checkpointScorer } from './library-entities.js';
import {
  passText,
  shownValue,
  verdictStatus,
  VerdictPanel,
  type VerdictResult,
} from './Verdict.js';

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
  // Judging is reported in its own section, never as the agent's own cost.
  const agentMetrics = (detail?.metrics ?? []).filter(
    (metric) => metric.name !== 'judge tokens',
  );
  return (
    <section className="run-inspector grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <div className="flex min-w-0 flex-col gap-2">
        {loadError ? (
          <ErrorBanner title="Unable to load the run" message={loadError} />
        ) : null}
        <Trajectory
          events={events}
          checkpoints={detail?.checkpoints}
          scenario={scenario}
        />
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
            ['Score', formatScore(run.score)],
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
              <ScoreTable scores={detail.scores} scenario={scenario} />
              {detail.skippedScorers?.length ? (
                <p className="text-xs text-kumo-subtle">
                  Skipped final scorers: {detail.skippedScorers.join(', ')}
                </p>
              ) : null}
            </EvidenceSection>
            {agentMetrics.length ? (
              <EvidenceSection title="Metrics">
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
            <JudgingSection detail={detail} />
            {detail.checkpoints?.length ? (
              <EvidenceSection title="Checkpoints">
                <CheckpointTable
                  checkpoints={detail.checkpoints}
                  scenario={scenario}
                />
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

/** A result's row, and below it the panel that explains it: open when it did not pass. */
function VerdictRows({
  result,
  scorer,
  cells,
  columns,
}: {
  result: VerdictResult;
  scorer?: CatalogScorer;
  cells: ReactNode;
  columns: number;
}) {
  const failing = result.passed === false || Boolean(result.error);
  const [open, setOpen] = useState(failing);
  return (
    <>
      <Table.Row
        className="verdict-row cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        {cells}
        <Table.Cell className="w-8 text-right">
          <button
            type="button"
            className="verdict-toggle text-kumo-subtle"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} why ${result.name} ${verdictStatus(result)}`}
            onClick={(event) => {
              event.stopPropagation();
              setOpen(!open);
            }}
          >
            <CaretRightIcon
              aria-hidden
              className={
                open ? 'rotate-90 transition-transform' : 'transition-transform'
              }
            />
          </button>
        </Table.Cell>
      </Table.Row>
      {open ? (
        <Table.Row className="verdict-details bg-kumo-elevated/40">
          <Table.Cell colSpan={columns}>
            <VerdictPanel result={result} scorer={scorer} />
          </Table.Cell>
        </Table.Row>
      ) : null}
    </>
  );
}

function ScorerName({
  kind,
  name,
  scorer,
}: {
  kind?: string;
  name: string;
  scorer?: CatalogScorer;
}) {
  return (
    <>
      {kind ? (
        <span className="text-kumo-subtle">
          {kind === 'judge' ? 'LLM judge' : kind}:{' '}
        </span>
      ) : null}
      {name}
      {scorer?.description ? (
        <span className="block text-xs text-kumo-subtle">
          {scorer.description}
        </span>
      ) : null}
    </>
  );
}

function CheckpointTable({
  checkpoints,
  scenario,
}: {
  checkpoints: NonNullable<RunDetailData['checkpoints']>;
  scenario?: CatalogEval;
}) {
  return (
    <NestedTable wrap>
      <Table.Header variant="compact">
        <Table.Row>
          <Table.Head>Step</Table.Head>
          <Table.Head>Rule</Table.Head>
          <Table.Head>Value</Table.Head>
          <Table.Head>Result</Table.Head>
          <Table.Head>
            <span className="sr-only">Details</span>
          </Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {checkpoints.map((check) => {
          const scorer = checkpointScorer(scenario, check.step, check.name);
          return (
            <VerdictRows
              key={`${check.step}-${check.name}`}
              result={{
                ...check,
                ...(check.status === 'skipped'
                  ? { skipped: true as const }
                  : {}),
              }}
              scorer={scorer}
              columns={5}
              cells={
                <>
                  <Table.Cell className="tabular-nums">
                    {check.step + 1}
                  </Table.Cell>
                  <Table.Cell>
                    <ScorerName
                      kind={check.kind}
                      name={check.name}
                      scorer={scorer}
                    />
                    {check.matchedToolCall
                      ? ` (event ${check.matchedToolCall.eventIndex + 1})`
                      : ''}
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {shownValue(check)}
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge status={check.status} />
                  </Table.Cell>
                </>
              }
            />
          );
        })}
      </Table.Body>
    </NestedTable>
  );
}

function ScoreTable({
  scores,
  scenario,
}: {
  scores: RunDetailData['scores'];
  scenario?: CatalogEval;
}) {
  return (
    <NestedTable wrap>
      <Table.Header variant="compact">
        <Table.Row>
          <Table.Head>Scorer</Table.Head>
          <Table.Head>Value</Table.Head>
          <Table.Head>Result</Table.Head>
          <Table.Head>
            <span className="sr-only">Details</span>
          </Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {scores.map((score) => {
          const scorer = scenario?.scorers.find(
            (entry) => entry.name === score.name,
          );
          return (
            <VerdictRows
              key={score.name}
              result={score}
              scorer={scorer}
              columns={4}
              cells={
                <>
                  <Table.Cell>
                    <ScorerName
                      kind={score.kind}
                      name={score.name}
                      scorer={scorer}
                    />
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {shownValue(score)}
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge status={verdictStatus(score)} />
                    {score.passAt !== undefined &&
                    !score.skipped &&
                    !score.error ? (
                      <span className="block text-xs text-kumo-subtle">
                        passes at {passText(score.passAt, scorer?.answer)}
                      </span>
                    ) : null}
                  </Table.Cell>
                </>
              }
            />
          );
        })}
        {!scores.length ? (
          <Table.Row>
            <Table.Cell colSpan={4} className="text-kumo-subtle">
              No final scorers.
            </Table.Cell>
          </Table.Row>
        ) : null}
      </Table.Body>
    </NestedTable>
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
    <EvidenceSection title="Judging">
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
      <p className="text-xs text-kumo-subtle">
        Never counted in the agent&apos;s tokens.
      </p>
    </EvidenceSection>
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
