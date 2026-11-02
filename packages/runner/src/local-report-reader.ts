import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import * as Schema from 'effect/Schema';
import {
  RunManifestSchema,
  RunScoringSchema,
  RunSummarySchema,
  parseTrajectoryJsonl,
  type RunProcess,
} from '@evalkit/core';

/** The local report boundary for CLI, dashboard, and CI consumers (schema version 6). */
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
export const readRunScoring = (root: string, runId: string) =>
  decode(join(root, runId, 'scoring.json'), RunScoringSchema);
export async function readRunEvents(root: string, runId: string) {
  return parseTrajectoryJsonl(
    await readFile(join(root, runId, 'trajectory.jsonl'), 'utf8'),
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
