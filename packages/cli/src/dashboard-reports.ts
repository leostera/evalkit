import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type {
  CheckpointResult,
  MetricResult,
  EvalRegistry,
  JsonObject,
  RunSource,
} from '@evalkit/core';
import {
  ownerIsGone,
  readRunManifest,
  readRunSummary,
  readTrialEvents,
  readTrialManifest,
  readTrialSummary,
} from '@evalkit/runner';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LocalRun = {
  id: string;
  evalId: string;
  suiteId?: string;
  agent?: string;
  matrixId?: string;
  parameters?: JsonObject;
  status: 'running' | 'passed' | 'failed' | 'errored' | 'cancelled';
  /** Cancelled because its process stopped without finishing it (e.g. a second Ctrl+C). */
  interrupted?: true;
  startedAt: string;
  completedAt?: string;
  completedTrials: number;
  requestedTrials: number;
  score?: number;
  durationMs?: number;
  /** Set by `evalkit tidy` when the run's eval is no longer in the project. */
  archived?: boolean;
  /** Repository and commit the run's eval code came from (schema version 4+). */
  source?: RunSource;
  /** Each scorer's mean over the run's trials; skipped results are left out. */
  scorers?: RunScorer[];
  /** Content digests of the datasets the run's trials used (schema version 5+). */
  datasets?: RunDatasetDigests[];
  /** Each metric's mean over the run's trials. */
  metrics?: RunMetric[];
};

export type RunScorer = {
  name: string;
  kind: 'predicate' | 'judge';
  /** Absent when every result was skipped or errored. */
  mean?: number;
  /** Results with a value. */
  count: number;
  skipped: number;
};

export type RunDatasetDigests = { id: string; digests: string[] };

/** One metric's mean over a run's trials. */
export type RunMetric = {
  name: string;
  unit?: string;
  better?: 'lower' | 'higher';
  builtIn?: true;
  /** Absent when no trial measured a value. */
  mean?: number;
  /** Trials with a value. */
  count: number;
};

function runMetrics(
  trials: readonly (
    { scoring?: { metrics?: readonly MetricResult[] } } | undefined
  )[],
): RunMetric[] {
  const byName = new Map<string, RunMetric & { sum: number }>();
  for (const trial of trials)
    for (const result of trial?.scoring?.metrics ?? []) {
      const entry = byName.get(result.name) ?? {
        name: result.name,
        ...(result.unit ? { unit: result.unit } : {}),
        ...(result.better ? { better: result.better } : {}),
        ...(result.builtIn ? { builtIn: true as const } : {}),
        count: 0,
        sum: 0,
      };
      if (result.value !== undefined) {
        entry.count += 1;
        entry.sum += result.value;
      }
      byName.set(result.name, entry);
    }
  return [...byName.values()].map(({ sum, ...metric }) => ({
    ...metric,
    ...(metric.count ? { mean: sum / metric.count } : {}),
  }));
}

function runScorers(
  trials: readonly (
    { scoring?: { results: readonly LocalScoreInput[] } } | undefined
  )[],
): RunScorer[] {
  const byKey = new Map<string, RunScorer & { sum: number }>();
  for (const trial of trials)
    for (const score of trial?.scoring?.results ?? []) {
      const kind = score.kind;
      const key = `${kind}\0${score.name}`;
      const entry = byKey.get(key) ?? {
        name: score.name,
        kind,
        count: 0,
        skipped: 0,
        sum: 0,
      };
      if (score.skipped) entry.skipped += 1;
      else if (score.value !== undefined) {
        entry.count += 1;
        entry.sum += score.value;
      }
      byKey.set(key, entry);
    }
  return [...byKey.values()].map(({ sum, ...scorer }) => ({
    ...scorer,
    ...(scorer.count ? { mean: sum / scorer.count } : {}),
  }));
}

type LocalScoreInput = {
  name: string;
  kind: 'predicate' | 'judge';
  value?: number;
  skipped?: true;
};

function runDatasets(
  manifests: readonly (
    { datasets?: readonly { id: string; digest: string }[] } | undefined
  )[],
): RunDatasetDigests[] {
  const byId = new Map<string, Set<string>>();
  for (const manifest of manifests)
    for (const dataset of manifest?.datasets ?? []) {
      const digests = byId.get(dataset.id) ?? new Set<string>();
      digests.add(dataset.digest);
      byId.set(dataset.id, digests);
    }
  return [...byId].map(([id, digests]) => ({
    id,
    digests: [...digests].sort(),
  }));
}

/** Written into a run directory by `evalkit tidy`; deleting it restores the run. */
export const ARCHIVE_MARKER = 'archived.json';

type LocalScore = {
  name: string;
  kind?: 'predicate' | 'judge';
  value?: number;
  passed?: boolean;
  explanation?: string;
  durationMs: number;
};
export type LocalTrial = {
  id: string;
  index: number;
  status: LocalRun['status'];
  score?: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  scores: LocalScore[];
  metrics?: MetricResult[];
  checkpoints: CheckpointResult[];
  skippedScorers?: string[];
};

export type ArtifactPath = {
  path: string;
  kind: 'file' | 'directory';
  size?: number;
};

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function ifPresent<T>(
  operation: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

function assertUuid(id: string, label: string): void {
  if (!UUID_PATTERN.test(id)) throw new Error(`Invalid ${label}`);
}

function trialPath(root: string, runId: string, trialId: string): string {
  assertUuid(runId, 'run ID');
  assertUuid(trialId, 'trial ID');
  return resolve(root, runId, 'trials', trialId);
}

function runStatus(summary: {
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  passed: number;
  failed: number;
  trialCount: number;
}): LocalRun['status'] {
  if (summary.status === 'running') return 'running';
  if (summary.status === 'cancelled') return 'cancelled';
  if (summary.status !== 'completed') return 'errored';
  return summary.failed === 0 && summary.passed === summary.trialCount
    ? 'passed'
    : 'failed';
}

function trialStatus(summary: {
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  scoring?: { passed?: boolean };
}): LocalTrial['status'] {
  if (summary.status === 'running') return 'running';
  if (summary.status === 'cancelled') return 'cancelled';
  if (summary.status !== 'completed') return 'errored';
  return summary.scoring?.passed === true ? 'passed' : 'failed';
}

export function fileContentType(file: string): string {
  return (
    (
      {
        '.css': 'text/css',
        '.html': 'text/html',
        '.js': 'text/javascript',
      } as Record<string, string>
    )[extname(file)] ?? 'application/octet-stream'
  );
}

/**
 * Read saved local reports. A missing summary means "running"; malformed reports are errors.
 * Runs written by an older EvalKit (manifest `schemaVersion` < 2) are skipped and counted.
 */
export function createDashboardReportReader(
  root: string,
  registry: EvalRegistry,
) {
  const legacyRuns = new Set<string>();

  async function listRuns(): Promise<LocalRun[]> {
    const entries = await ifPresent(() =>
      readdir(root, { withFileTypes: true }),
    );
    if (!entries) return [];
    const ids = entries
      .filter((entry) => entry.isDirectory() && UUID_PATTERN.test(entry.name))
      .map((entry) => entry.name);
    const runs = await Promise.all(ids.map(readRun));
    return runs.filter((run): run is LocalRun => run !== undefined);
  }

  /** True for a run from a report format this version cannot read; never for corrupt JSON. */
  async function isLegacyRun(id: string): Promise<boolean> {
    const text = await ifPresent(() =>
      readFile(resolve(root, id, 'manifest.json'), 'utf8'),
    );
    if (text === undefined) return false;
    let version: unknown;
    try {
      version = (JSON.parse(text) as { schemaVersion?: unknown }).schemaVersion;
    } catch {
      return false; // Corrupt: let the strict decoder report it.
    }
    return typeof version === 'number' && version < 2;
  }

  async function readRun(id: string): Promise<LocalRun | undefined> {
    if (await isLegacyRun(id)) {
      legacyRuns.add(id);
      return undefined;
    }
    // A newly created run directory may not have a manifest yet.
    const manifest = await ifPresent(() => readRunManifest(root, id));
    if (!manifest) return undefined;
    const summary = await ifPresent(() => readRunSummary(root, id));
    const trialIds = await ifPresent(() =>
      readdir(resolve(root, id, 'trials')),
    );
    const trials = await Promise.all(
      (trialIds ?? []).map((trialId) =>
        ifPresent(() => readTrialSummary(root, id, trialId)),
      ),
    );
    const trialManifests = await Promise.all(
      (trialIds ?? []).map((trialId) =>
        ifPresent(() => readTrialManifest(root, id, trialId)),
      ),
    );
    const scores = trials.flatMap((trial) =>
      trial?.scoring?.overall === undefined ? [] : [trial.scoring.overall],
    );
    const scorers = runScorers(trials);
    const metrics = runMetrics(trials);
    const datasets = runDatasets(trialManifests);
    const archived = await ifPresent(() =>
      stat(resolve(root, id, ARCHIVE_MARKER)),
    );
    const interrupted = !summary && ownerIsGone(manifest.process);
    return {
      id,
      ...(archived ? { archived: true } : {}),
      ...(manifest.source ? { source: manifest.source } : {}),
      evalId: manifest.evalId,
      ...(manifest.suiteId ? { suiteId: manifest.suiteId } : {}),
      ...(manifest.matrix
        ? {
            matrixId: manifest.matrix.id,
            cellKey: manifest.matrix.cellKey,
          }
        : {}),
      ...(manifest.parameters ? { parameters: manifest.parameters } : {}),
      ...(manifest.aut
        ? {
            agent: [manifest.aut.kind, manifest.aut.id, manifest.aut.version]
              .filter(Boolean)
              .join(' / '),
          }
        : {}),
      status: summary
        ? runStatus(summary)
        : interrupted
          ? 'cancelled'
          : 'running',
      ...(interrupted ? { interrupted: true as const } : {}),
      startedAt: manifest.startedAt,
      ...(summary?.endedAt ? { completedAt: summary.endedAt } : {}),
      ...(summary?.durationMs !== undefined
        ? { durationMs: summary.durationMs }
        : {}),
      completedTrials: summary?.trialCount ?? trials.filter(Boolean).length,
      requestedTrials:
        summary?.trialCount ??
        registry.get(manifest.evalId)?.policy?.trials ??
        1,
      ...(scores.length
        ? {
            score:
              scores.reduce((sum, score) => sum + score, 0) / scores.length,
          }
        : {}),
      ...(scorers.length ? { scorers } : {}),
      ...(metrics.length ? { metrics } : {}),
      ...(datasets.length ? { datasets } : {}),
    };
  }

  async function listTrials(runId: string): Promise<LocalTrial[]> {
    assertUuid(runId, 'run ID');
    const ids = await ifPresent(() => readdir(resolve(root, runId, 'trials')));
    if (!ids) return [];
    const runManifest = await ifPresent(() => readRunManifest(root, runId));
    const ownerGone = ownerIsGone(runManifest?.process);
    const trials = await Promise.all(
      ids.map(async (id) => {
        const manifest = await readTrialManifest(root, runId, id);
        const summary = await ifPresent(() =>
          readTrialSummary(root, runId, id),
        );
        return {
          id,
          index: manifest.trialIndex,
          status: summary
            ? trialStatus(summary)
            : ownerGone
              ? ('cancelled' as const)
              : ('running' as const),
          startedAt: manifest.startedAt,
          ...(summary?.endedAt ? { completedAt: summary.endedAt } : {}),
          ...(summary?.durationMs !== undefined
            ? { durationMs: summary.durationMs }
            : {}),
          ...(summary?.scoring?.overall === undefined
            ? {}
            : { score: summary.scoring.overall }),
          scores: summary?.scoring?.results ?? [],
          ...(summary?.scoring?.metrics
            ? { metrics: summary.scoring.metrics }
            : {}),
          checkpoints: summary?.scoring?.checkpoints ?? [],
          ...(summary?.scoring?.skippedScorers
            ? { skippedScorers: summary.scoring.skippedScorers }
            : {}),
        };
      }),
    );
    return trials.sort((left, right) => left.index - right.index);
  }

  async function trialDetail(runId: string, trialId: string) {
    trialPath(root, runId, trialId);
    return {
      manifest: await readTrialManifest(root, runId, trialId),
      summary: (await ifPresent(() =>
        readTrialSummary(root, runId, trialId),
      )) ?? { status: 'running' },
    };
  }

  async function listArtifacts(
    runId: string,
    trialId: string,
  ): Promise<ArtifactPath[]> {
    return walkArtifacts(resolve(trialPath(root, runId, trialId), 'artifacts'));
  }

  async function listCandidateWorkspace(
    runId: string,
    trialId: string,
  ): Promise<ArtifactPath[]> {
    return walkArtifacts(
      resolve(trialPath(root, runId, trialId), 'artifacts', 'candidate'),
    );
  }

  async function candidateFile(
    runId: string,
    trialId: string,
    relativePath: string,
  ): Promise<Response> {
    const candidateRoot = resolve(
      trialPath(root, runId, trialId),
      'artifacts',
      'candidate',
    );
    const file = resolve(candidateRoot, relativePath);
    if (file !== candidateRoot && !file.startsWith(`${candidateRoot}${sep}`))
      throw new Error('Invalid workspace path');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Workspace path is not a file');
    return new Response(await readFile(file), {
      headers: { 'content-type': fileContentType(file) },
    });
  }

  async function trajectory(runId: string, trialId: string) {
    trialPath(root, runId, trialId);
    return (await ifPresent(() => readTrialEvents(root, runId, trialId))) ?? [];
  }

  return {
    listRuns,
    /** Run IDs skipped by the last `listRuns()` because an older EvalKit wrote them. */
    legacyRunIds: () => [...legacyRuns],
    listTrials,
    trialDetail,
    listArtifacts,
    listCandidateWorkspace,
    candidateFile,
    trajectory,
  };
}

/** Both artifact endpoints walk a specific root; never broaden the candidate-file read root. */
async function walkArtifacts(root: string): Promise<ArtifactPath[]> {
  const result: ArtifactPath[] = [];
  async function visit(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        result.push({ path, kind: 'directory' });
        await visit(resolve(directory, entry.name), path);
      } else {
        result.push({
          path,
          kind: 'file',
          size: (await stat(resolve(directory, entry.name))).size,
        });
      }
    }
  }
  await ifPresent(() => visit(root, ''));
  return result;
}
