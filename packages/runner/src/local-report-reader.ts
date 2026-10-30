import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import * as Schema from 'effect/Schema';
import {
  RunManifestSchema,
  RunSummarySchema,
  TrialManifestSchema,
  TrialSummarySchema,
  TrialScoringSchema,
  parseTrajectoryJsonl,
  type RunProcess,
} from '@evalkit/core';

/** Shared v2/v3 local report boundary for CLI, dashboard, and CI consumers. */
async function decode<A, I>(
  file: string,
  schema: Schema.Schema<A, I>,
): Promise<A> {
  return Schema.decodeUnknownSync(schema)(
    JSON.parse(await readFile(file, 'utf8')),
  );
}

export const readRunManifest = (root: string, runId: string) =>
  decode(join(root, runId, 'manifest.json'), RunManifestSchema);
export const readRunSummary = (root: string, runId: string) =>
  decode(join(root, runId, 'summary.json'), RunSummarySchema);
export const readTrialManifest = (
  root: string,
  runId: string,
  trialId: string,
) =>
  decode(
    join(root, runId, 'trials', trialId, 'manifest.json'),
    TrialManifestSchema,
  );
export const readTrialSummary = (
  root: string,
  runId: string,
  trialId: string,
) =>
  decode(
    join(root, runId, 'trials', trialId, 'summary.json'),
    TrialSummarySchema,
  );
export const readTrialScoring = (
  root: string,
  runId: string,
  trialId: string,
) =>
  decode(
    join(root, runId, 'trials', trialId, 'scoring.json'),
    TrialScoringSchema,
  );
export async function readTrialEvents(
  root: string,
  runId: string,
  trialId: string,
) {
  return parseTrajectoryJsonl(
    await readFile(
      join(root, runId, 'trials', trialId, 'trajectory.jsonl'),
      'utf8',
    ),
  );
}

/**
 * True when a run's owning process is known to be gone: it ran on this host
 * and its PID no longer exists. Runs from other hosts are never judged.
 */
export function ownerIsGone(owner: RunProcess | undefined): boolean {
  if (!owner || owner.hostname !== os.hostname()) return false;
  if (owner.pid === process.pid) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}
