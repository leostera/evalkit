import { readdir, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { CheckpointResult, EvalRegistry, JsonObject } from '@evalkit/core';
import {
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
  status: 'running' | 'passed' | 'failed' | 'errored';
  startedAt: string;
  completedAt?: string;
  completedTrials: number;
  requestedTrials: number;
  score?: number;
  durationMs?: number;
};

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

/** Read saved local reports. A missing summary means "running"; malformed reports are errors. */
export function createDashboardReportReader(
  root: string,
  registry: EvalRegistry,
) {
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

  async function readRun(id: string): Promise<LocalRun | undefined> {
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
    const scores = trials.flatMap((trial) =>
      trial?.scoring?.overall === undefined ? [] : [trial.scoring.overall],
    );
    return {
      id,
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
      status: summary ? runStatus(summary) : 'running',
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
    };
  }

  async function listTrials(runId: string): Promise<LocalTrial[]> {
    assertUuid(runId, 'run ID');
    const ids = await ifPresent(() => readdir(resolve(root, runId, 'trials')));
    if (!ids) return [];
    const trials = await Promise.all(
      ids.map(async (id) => {
        const manifest = await readTrialManifest(root, runId, id);
        const summary = await ifPresent(() =>
          readTrialSummary(root, runId, id),
        );
        return {
          id,
          index: manifest.trialIndex,
          status: summary ? trialStatus(summary) : 'running',
          startedAt: manifest.startedAt,
          ...(summary?.endedAt ? { completedAt: summary.endedAt } : {}),
          ...(summary?.durationMs !== undefined
            ? { durationMs: summary.durationMs }
            : {}),
          ...(summary?.scoring?.overall === undefined
            ? {}
            : { score: summary.scoring.overall }),
          scores: summary?.scoring?.results ?? [],
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
    return new Response(await Bun.file(file).arrayBuffer(), {
      headers: { 'content-type': fileContentType(file) },
    });
  }

  async function trajectory(runId: string, trialId: string) {
    trialPath(root, runId, trialId);
    return (await ifPresent(() => readTrialEvents(root, runId, trialId))) ?? [];
  }

  return {
    listRuns,
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
          size: Bun.file(resolve(directory, entry.name)).size,
        });
      }
    }
  }
  await ifPresent(() => visit(root, ''));
  return result;
}
