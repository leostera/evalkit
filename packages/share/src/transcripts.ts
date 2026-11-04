import { convertTrajectory, upgradeScoring } from '@evalkit/core/upgrade';
import type { SnapshotFiles } from './legacy.js';

/**
 * Converts one run in snapshot format version 2 (EvalKit 0.9 and 0.10) to
 * version 3 (RFD0009): `events.json`, its trajectory, becomes
 * `transcript.json`, an ATXF transcript with EvalKit's events placed in it;
 * `detail.json` points into it, and token metrics no longer count cache
 * reads, in `detail.json` and `run.json` alike. Pure: the Worker runs it on
 * upload, in `POST /api/v1/upgrade`, and on read for runs not upgraded yet,
 * so all three give the same files.
 *
 * Throws when the run cannot be converted, such as tokens that do not add
 * up; the caller keeps the run as it was.
 */
export function upgradeV2Run(files: SnapshotFiles): SnapshotFiles {
  const run = record(parse(files.get('run.json')), 'run.json');
  const detail = record(parse(files.get('detail.json')) ?? {}, 'detail.json');
  const events = parse(files.get('events.json'));
  const trajectory =
    isRecord(events) && Array.isArray(events.events) ? events.events : [];
  const manifest = isRecord(detail.manifest) ? detail.manifest : {};
  const runId = String(run.id);
  const startedAt =
    typeof run.startedAt === 'string'
      ? run.startedAt
      : new Date(0).toISOString();
  const aut = isRecord(manifest.aut) ? manifest.aut : undefined;
  const converted = convertTrajectory(trajectory, {
    runId,
    ...(typeof run.evalId === 'string' ? { evalId: run.evalId } : {}),
    startedAt,
    ...(aut
      ? {
          agent: {
            ...(typeof aut.id === 'string' ? { id: aut.id } : {}),
            ...(typeof aut.version === 'string'
              ? { version: aut.version }
              : {}),
          },
        }
      : {}),
  });
  const upgrade = (scoring: Record<string, unknown>) =>
    upgradeScoring(
      scoring,
      { runId, startedAt },
      converted.recordOfEvent,
      converted.transcript,
    );
  const scoring = upgrade({
    results: Array.isArray(detail.scores) ? detail.scores : [],
    ...(Array.isArray(detail.metrics) ? { metrics: detail.metrics } : {}),
    ...(Array.isArray(detail.checkpoints)
      ? { checkpoints: detail.checkpoints }
      : {}),
    passed: false,
  });
  const summary = isRecord(detail.summary) ? detail.summary : undefined;
  const upgraded = new Map(files);
  upgraded.delete('events.json');
  upgraded.set(
    'transcript.json',
    encode({
      transcript: converted.transcript,
      subagents: {},
      runEvents: converted.runEvents,
    }),
  );
  upgraded.set(
    'detail.json',
    encode({
      ...detail,
      scores: scoring.results,
      ...(scoring.metrics ? { metrics: scoring.metrics } : {}),
      ...(scoring.checkpoints ? { checkpoints: scoring.checkpoints } : {}),
      manifest: { ...manifest, schemaVersion: 7 },
      ...(summary
        ? {
            summary: {
              ...summary,
              ...(isRecord(summary.scoring)
                ? { scoring: upgrade(summary.scoring) }
                : {}),
            },
          }
        : {}),
    }),
  );
  upgraded.set(
    'run.json',
    encode({
      ...run,
      snapshotVersion: 3,
      ...(Array.isArray(scoring.metrics) && scoring.metrics.length
        ? { metrics: runMetrics(scoring.metrics) }
        : {}),
    }),
  );
  return upgraded;
}

/** True when the stored run is in snapshot format version 2. */
export function isV2Run(runJson: unknown): boolean {
  return isRecord(runJson) && runJson.snapshotVersion === 2;
}

/** `run.json`'s metrics, as `evalkit share` derives them from the scoring's. */
function runMetrics(scoring: unknown[]): unknown[] {
  return scoring.filter(isRecord).map((metric) => ({
    name: metric.name,
    ...(metric.unit ? { unit: metric.unit } : {}),
    ...(metric.better ? { better: metric.better } : {}),
    ...(metric.builtIn ? { builtIn: true } : {}),
    ...(metric.value === undefined ? {} : { value: metric.value }),
  }));
}

type Json = Record<string, unknown>;

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const parse = (data: Uint8Array | undefined): unknown =>
  data ? JSON.parse(decoder.decode(data)) : undefined;
const encode = (value: unknown) => encoder.encode(`${JSON.stringify(value)}\n`);
const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function record(value: unknown, name: string): Json {
  if (!isRecord(value)) throw new Error(`${name} must be an object`);
  return value;
}
