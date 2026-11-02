import {
  upgradeCatalog,
  upgradeEvent,
  upgradeManifest,
  upgradeStatus,
} from '@evalkit/core/upgrade';

/**
 * Converts one run in snapshot format version 1 (a run of trials, written by
 * EvalKit before 0.9) into version 2 runs, one per trial (RFD0008). A run of
 * one trial keeps the run's ID, the one its links use; a run of several
 * becomes runs with the trials' IDs, in a batch with the run's ID. Used for
 * uploads from older CLIs and for `POST /api/v1/upgrade` over stored runs, so
 * both come out the same.
 *
 * Input and output are files by path, relative to the run: version 1 has
 * `run.json`, `trials.json`, and `trials/<trial>/…`; each version 2 run has
 * `run.json`, `detail.json`, `events.json`, `artifacts.json`,
 * `workspace.json`, `workspace/…` and `attachments/…`.
 */
export type SnapshotFiles = Map<string, Uint8Array>;

export type UpgradedRun = { id: string; files: SnapshotFiles };

type Json = Record<string, unknown>;

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const parse = (data: Uint8Array | undefined): unknown =>
  data ? JSON.parse(decoder.decode(data)) : undefined;
const encode = (value: unknown) => encoder.encode(`${JSON.stringify(value)}\n`);
const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** True for a version 1 run.json: no `snapshotVersion`. */
export function isLegacyRun(runJson: unknown): boolean {
  return isRecord(runJson) && runJson.snapshotVersion === undefined;
}

export function upgradeSnapshotRun(files: SnapshotFiles): UpgradedRun[] {
  const run = parse(files.get('run.json'));
  if (!isRecord(run)) throw new Error('run.json must be an object');
  const listed = parse(files.get('trials.json'));
  const trials = (
    isRecord(listed) && Array.isArray(listed.trials) ? listed.trials : []
  ).filter(isRecord);
  const size = trials.length;
  return trials.map((trial) => {
    const id = size === 1 ? String(run.id) : String(trial.id);
    const prefix = `trials/${String(trial.id)}/`;
    const detail = parse(files.get(`${prefix}detail.json`));
    const trialManifest =
      isRecord(detail) && isRecord(detail.manifest) ? detail.manifest : {};
    const trialSummary =
      isRecord(detail) && isRecord(detail.summary) ? detail.summary : {};
    const index =
      typeof trial.index === 'number' ? trial.index : trials.indexOf(trial);
    const batch = size > 1 ? { id: String(run.id), index, size } : undefined;
    const scores = Array.isArray(trial.scores)
      ? trial.scores.filter(isRecord)
      : [];
    const metrics = Array.isArray(trial.metrics)
      ? trial.metrics.filter(isRecord)
      : [];
    const datasets = Array.isArray(trialManifest.datasets)
      ? trialManifest.datasets.filter(isRecord)
      : [];
    const status = String(trial.status);
    const pick = (keys: readonly string[]) =>
      Object.fromEntries(
        keys.flatMap((key) =>
          run[key] === undefined ? [] : [[key, run[key]]],
        ),
      );
    const out: SnapshotFiles = new Map();
    out.set(
      'run.json',
      encode({
        snapshotVersion: 2,
        id,
        ...pick([
          'evalId',
          'suiteId',
          'agent',
          'matrixId',
          'cellKey',
          'parameters',
          'archived',
          'source',
        ]),
        status,
        startedAt: trial.startedAt ?? run.startedAt,
        ...(trial.completedAt ? { completedAt: trial.completedAt } : {}),
        ...(trial.durationMs === undefined
          ? {}
          : { durationMs: trial.durationMs }),
        ...(batch ? { batch } : {}),
        ...(trial.score === undefined ? {} : { score: trial.score }),
        ...(scores.length
          ? {
              scorers: scores.map((score) => ({
                name: score.name,
                kind: score.kind,
                ...(score.skipped ? { skipped: true } : {}),
                ...(score.value === undefined || score.skipped
                  ? {}
                  : { value: score.value }),
              })),
            }
          : {}),
        ...(metrics.length
          ? {
              metrics: metrics.map((metric) => ({
                name: metric.name,
                ...(metric.unit ? { unit: metric.unit } : {}),
                ...(metric.better ? { better: metric.better } : {}),
                ...(metric.builtIn ? { builtIn: true } : {}),
                ...(metric.value === undefined ? {} : { value: metric.value }),
              })),
            }
          : {}),
        ...(datasets.length
          ? {
              datasets: datasets.map((dataset) => ({
                id: dataset.id,
                digest: dataset.digest,
              })),
            }
          : {}),
      }),
    );
    const passed = (trialSummary.scoring as { passed?: boolean } | undefined)
      ?.passed;
    out.set(
      'detail.json',
      encode({
        scores,
        ...(metrics.length ? { metrics } : {}),
        checkpoints: Array.isArray(trial.checkpoints) ? trial.checkpoints : [],
        ...(trial.skippedScorers
          ? { skippedScorers: trial.skippedScorers }
          : {}),
        ...(trial.attachments ? { attachments: trial.attachments } : {}),
        manifest: upgradeManifest({
          run: { ...pick(['evalId', 'suiteId', 'parameters', 'source']) },
          trial: trialManifest,
          runId: id,
          ...(batch ? { batch } : {}),
          status: upgradeStatus(trialSummary.status, passed),
        }),
        summary: {
          ...trialSummary,
          status: upgradeStatus(trialSummary.status, passed),
        },
      }),
    );
    for (const [path, data] of files) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest === 'detail.json') continue;
      if (rest === 'events.json') {
        const events = parse(data);
        out.set(
          rest,
          encode({
            events:
              isRecord(events) && Array.isArray(events.events)
                ? events.events.map(upgradeEvent)
                : [],
          }),
        );
      } else out.set(rest, data);
    }
    return { id, files: out };
  });
}

/** A stored or uploaded version 1 catalog, as version 2 stores it. */
export function upgradeCatalogFile(data: Uint8Array): Uint8Array {
  return encode(upgradeCatalog(parse(data)));
}
