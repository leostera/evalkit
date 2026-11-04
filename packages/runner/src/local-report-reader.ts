import { readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import * as Schema from 'effect/Schema';
import {
  RunManifestSchema,
  RunScoringSchema,
  RunSummarySchema,
  type RunProcess,
  type Transcript,
} from '@evalkit/core';
import { parseRunEventsJsonl } from '@evalkit/core/run-events';
import { parseTranscript } from '@leostera/atxf';
import {
  RUN_EVENTS_FILE,
  SUBAGENTS_DIR,
  TRANSCRIPT_FILE,
} from './local-report-store.js';

/** The local report boundary for CLI, dashboard, and CI consumers (schema version 7). */
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
/** EvalKit's events for a run, in order. */
export async function readRunEvents(root: string, runId: string) {
  return parseRunEventsJsonl(
    await readFile(join(root, runId, RUN_EVENTS_FILE), 'utf8'),
  );
}

/** A run's sub-agent transcripts, by transcript ID; none when it kept none. */
export async function readRunSubagents(
  root: string,
  runId: string,
): Promise<Record<string, Transcript>> {
  const directory = join(root, runId, SUBAGENTS_DIR);
  let files: string[];
  try {
    files = await readdir(directory);
  } catch {
    return {};
  }
  const subagents: Record<string, Transcript> = {};
  for (const file of files.filter((name) => name.endsWith('.atxf.jsonl'))) {
    const transcript = parseTranscript(
      await readFile(join(directory, file), 'utf8'),
    );
    subagents[transcript.header.id] = transcript;
  }
  return subagents;
}

/**
 * The agent's ATXF transcript for a run. A running run's last line may be
 * half written; it is left out until it is complete.
 */
export async function readRunTranscript(
  root: string,
  runId: string,
): Promise<Transcript> {
  const text = await readFile(join(root, runId, TRANSCRIPT_FILE), 'utf8');
  return parseTranscript(text.slice(0, text.lastIndexOf('\n') + 1));
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
