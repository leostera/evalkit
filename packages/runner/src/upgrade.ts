import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import * as ParseResult from 'effect/ParseResult';
import * as Schema from 'effect/Schema';
import {
  addIntegrity,
  serializeTranscript,
  validateTranscript,
} from '@leostera/atxf';
import {
  RunScoringSchema,
  RunSummarySchema,
  type RunProcess,
} from '@evalkit/core';
import {
  UPGRADABLE_SCHEMA_VERSIONS,
  upgradeManifestToV8,
  convertTrajectory,
  upgradeCatalog,
  upgradeManifest,
  upgradeScoring,
  upgradeStatus,
  upgradeTrajectory,
} from '@evalkit/core/upgrade';
import { RUN_EVENTS_FILE, TRANSCRIPT_FILE } from './local-report-store.js';
import { ownerIsGone } from './local-report-reader.js';

/** What upgrading a results folder did, or would do with `dryRun`. */
export type UpgradeReport = {
  /** Old runs converted (or that would be). */
  upgraded: number;
  /** Version 6 runs they became. */
  runs: number;
  /** Old runs with more than one trial: each trial became a run in a batch. */
  batches: number;
  /** Old runs left alone because they are still running. */
  running: string[];
  /** Version 6 runs whose trajectory became an ATXF transcript (or would). */
  transcripts: number;
  /** Version 7 runs whose manifest now records its sandbox (or would). */
  sandboxes: number;
  /** Runs that could not be converted, left as they were, with why. */
  failed: Array<{ runId: string; reason: string }>;
};

/** A new run being written. */
const TEMPORARY = '.upgrade-';
/** An old run set aside while its replacement, with the same ID, moves in. */
const RETIRED = '.upgraded-';
const PER_RUN_FILES = ['archived.json'];

/**
 * Rewrites results from report schema versions 2 to 5 into version 6, in
 * place (RFD0008). An old run of one trial (most of them) becomes a run with
 * the same ID, so links to it keep working. An old run of several trials
 * becomes runs with the trials' IDs, in a batch with the old run's ID.
 *
 * Each new run is written under a temporary name and renamed into place;
 * artifacts are moved, not copied, as the last step before that rename. An
 * old run is removed only after its new runs exist, and one replaced under
 * the same ID is set aside first, so a crash at any point leaves the old run
 * or complete new ones, and re-running finishes the job. Version 6 runs are
 * left alone. Then every version 6 run is converted to version 7, its
 * trajectory into an ATXF transcript (RFD0009).
 */
export async function upgradeReports(
  root: string,
  options: { dryRun?: boolean } = {},
): Promise<UpgradeReport> {
  const report: UpgradeReport = {
    upgraded: 0,
    runs: 0,
    batches: 0,
    running: [],
    transcripts: 0,
    sandboxes: 0,
    failed: [],
  };
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return report;
  }
  if (!options.dryRun) await finishReplacements(root, entries);
  for (const entry of entries) {
    // Temporary folders; a crashed upgrade's are picked up by its old run.
    if (entry.startsWith('.')) continue;
    const directory = join(root, entry);
    const manifest = await readJson(join(directory, 'manifest.json'));
    if (
      !manifest ||
      !UPGRADABLE_SCHEMA_VERSIONS.includes(manifest.schemaVersion as number)
    )
      continue;
    const summary = await readJson(join(directory, 'summary.json'));
    if (!summary && !ownerIsGone(manifest.process as RunProcess | undefined)) {
      report.running.push(entry);
      continue;
    }
    const trials = await trialIds(directory);
    report.upgraded += 1;
    report.runs += Math.max(trials.length, 1);
    if (trials.length > 1) report.batches += 1;
    if (options.dryRun) {
      // Each run it becomes is version 6, then converted to version 7.
      report.transcripts += Math.max(trials.length, 1);
      continue;
    }
    await upgradeRun(root, entry, manifest, summary, trials);
  }
  if (!options.dryRun) await removeLeftovers(root);
  // Then every version 6 run, including those just written, to version 7.
  for (const entry of await readdir(root)) {
    if (entry.startsWith('.')) continue;
    const directory = join(root, entry);
    const manifest = await readJson(join(directory, 'manifest.json'));
    if (manifest?.schemaVersion !== 6) continue;
    const summary = await readJson(join(directory, 'summary.json'));
    if (!summary && !ownerIsGone(manifest.process as RunProcess | undefined)) {
      if (!report.running.includes(entry)) report.running.push(entry);
      continue;
    }
    if (options.dryRun) {
      report.transcripts += 1;
      continue;
    }
    try {
      await transcriptRun(directory, entry);
      report.transcripts += 1;
    } catch (error) {
      report.failed.push({
        runId: entry,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  // Then every version 7 run, including those just written, to version 8.
  for (const entry of await readdir(root)) {
    if (entry.startsWith('.')) continue;
    const file = join(root, entry, 'manifest.json');
    const manifest = await readJson(file);
    const version = manifest?.schemaVersion;
    // In a dry run, version 6 runs were not converted to 7, but would be.
    if (version !== 7 && !(options.dryRun && version === 6)) continue;
    if (
      !(await readJson(join(root, entry, 'summary.json'))) &&
      !ownerIsGone(manifest!.process as RunProcess | undefined)
    ) {
      if (!report.running.includes(entry)) report.running.push(entry);
      continue;
    }
    report.sandboxes += 1;
    if (options.dryRun) continue;
    await writeJsonFile(file, upgradeManifestToV8(manifest!));
  }
  // Old runs a dry run would convert become version 8 too.
  if (options.dryRun) report.sandboxes += report.runs;
  return report;
}

/** Where a version 6 run's own files wait until its version 7 files are in place. */
const V6_BACKUP = '.v6';
const V6_FILES = [
  'manifest.json',
  'trajectory.jsonl',
  'scoring.json',
  'summary.json',
];

/**
 * Converts one version 6 run to version 7 in place (RFD0009): its
 * trajectory becomes an ATXF transcript, sealed, plus `run-events.jsonl`;
 * its scoring and summary point into the transcript. The old files are
 * copied to `.v6/` first and read from there, so a conversion a crash
 * interrupted starts again from them; the manifest's version changes last.
 */
async function transcriptRun(directory: string, runId: string): Promise<void> {
  const backup = join(directory, V6_BACKUP);
  if (!(await exists(backup))) {
    await mkdir(`${backup}.tmp`, { recursive: true });
    for (const file of V6_FILES)
      if (await exists(join(directory, file)))
        await cp(join(directory, file), join(`${backup}.tmp`, file));
    await rename(`${backup}.tmp`, backup);
  }
  const manifest = (await readJson(join(backup, 'manifest.json')))!;
  const trajectory = (await readText(join(backup, 'trajectory.jsonl'))) ?? '';
  const events = trajectory
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new Error(`trajectory.jsonl line ${index + 1} is not JSON`);
      }
    });
  const startedAt =
    typeof manifest.startedAt === 'string'
      ? manifest.startedAt
      : new Date(0).toISOString();
  const aut = manifest.aut as { id?: string; version?: string } | undefined;
  const converted = convertTrajectory(events, {
    runId,
    ...(typeof manifest.evalId === 'string' ? { evalId: manifest.evalId } : {}),
    startedAt,
    ...(aut ? { agent: aut } : {}),
  });
  const lastTime =
    converted.transcript.records.at(-1)?.time ??
    converted.transcript.header.time;
  const transcript = addIntegrity(converted.transcript, {
    seal: { id: 'seal', time: lastTime },
  });
  const text = serializeTranscript(transcript);
  const validation = validateTranscript(text);
  const invalid = validation.diagnostics.filter((d) => d.severity === 'error');
  if (invalid.length)
    throw new Error(
      `its converted transcript is not valid ATXF: ${invalid
        .slice(0, 3)
        .map((d) => `line ${d.line}: ${d.message}`)
        .join('; ')}`,
    );
  const decode = <A, I>(
    schema: Schema.Schema<A, I>,
    value: unknown,
    file: string,
  ) => {
    try {
      return Schema.decodeUnknownSync(schema)(value);
    } catch (error) {
      const issue = ParseResult.isParseError(error)
        ? ParseResult.ArrayFormatter.formatErrorSync(error)[0]
        : undefined;
      throw new Error(
        issue
          ? `its converted ${file} is not valid at ${issue.path.join('.') || '(root)'}: ${issue.message}`
          : `its converted ${file} is not valid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const scoringIn = await readJson(join(backup, 'scoring.json'));
  const scoring = scoringIn
    ? decode(
        RunScoringSchema,
        upgradeScoring(
          scoringIn,
          { runId, startedAt },
          converted.recordOfEvent,
          converted.transcript,
        ),
        'scoring.json',
      )
    : undefined;
  const summaryIn = await readJson(join(backup, 'summary.json'));
  const summary = summaryIn
    ? decode(
        RunSummarySchema,
        {
          ...summaryIn,
          ...(isObject(summaryIn.scoring)
            ? {
                scoring: upgradeScoring(
                  summaryIn.scoring,
                  { runId, startedAt },
                  converted.recordOfEvent,
                  converted.transcript,
                ),
              }
            : {}),
        },
        'summary.json',
      )
    : undefined;
  await writeFile(join(directory, TRANSCRIPT_FILE), text);
  await writeFile(
    join(directory, RUN_EVENTS_FILE),
    converted.runEvents.map((event) => `${JSON.stringify(event)}\n`).join(''),
  );
  if (scoring) await writeJsonFile(join(directory, 'scoring.json'), scoring);
  if (summary) await writeJsonFile(join(directory, 'summary.json'), summary);
  await writeJsonFile(join(directory, 'manifest.json'), {
    ...manifest,
    schemaVersion: 7,
  });
  await rm(join(directory, 'trajectory.jsonl'), { force: true });
  await rm(backup, { recursive: true, force: true });
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Finishes same-ID replacements a crash interrupted: the old run was set
 * aside, and its replacement may or may not have moved in.
 */
async function finishReplacements(
  root: string,
  entries: readonly string[],
): Promise<void> {
  for (const entry of entries) {
    if (!entry.startsWith(RETIRED)) continue;
    const id = entry.slice(RETIRED.length);
    const retired = join(root, entry);
    const directory = join(root, id);
    const replacement = join(root, `${TEMPORARY}${id}`);
    if (!(await exists(directory)))
      await rename(
        (await exists(replacement)) ? replacement : retired,
        directory,
      );
    await rm(retired, { recursive: true, force: true });
  }
}

/**
 * Temporary folders nothing will finish. One holding artifacts is kept: it
 * could be the only copy, and an old run would have moved them back.
 */
async function removeLeftovers(root: string): Promise<void> {
  for (const entry of await readdir(root))
    if (
      entry.startsWith(TEMPORARY) &&
      !(await exists(join(root, entry, 'artifacts')))
    )
      await rm(join(root, entry), { recursive: true, force: true });
}

/** Swaps a fully written replacement in for the old run of the same ID. */
async function replaceInPlace(
  root: string,
  id: string,
  replacement: string,
): Promise<void> {
  const retired = join(root, `${RETIRED}${id}`);
  await rename(join(root, id), retired);
  await rename(replacement, join(root, id));
  await rm(retired, { recursive: true, force: true });
}

async function upgradeRun(
  root: string,
  oldRunId: string,
  runManifest: Record<string, unknown>,
  runSummary: Record<string, unknown> | undefined,
  trials: readonly string[],
): Promise<void> {
  const directory = join(root, oldRunId);
  const catalog = await readJson(join(directory, 'catalog.json'));
  const extras = await presentFiles(directory, PER_RUN_FILES);

  // Cancelled before any trial started: one cancelled run, same ID.
  if (!trials.length) {
    const target = join(root, `${TEMPORARY}${oldRunId}`);
    await mkdir(target, { recursive: true });
    const status = runSummary ? 'cancelled' : 'running';
    await writeJsonFile(
      join(target, 'manifest.json'),
      upgradeManifest({ run: runManifest, runId: oldRunId, status }),
    );
    if (runSummary)
      await writeJsonFile(join(target, 'summary.json'), {
        status,
        endedAt: runSummary.endedAt,
        ...(runSummary.durationMs === undefined
          ? {}
          : { durationMs: runSummary.durationMs }),
        ...(runSummary.error ? { error: runSummary.error } : {}),
      });
    await copyShared(directory, target, catalog, extras);
    await replaceInPlace(root, oldRunId, target);
    return;
  }

  const inPlace = trials.length === 1;
  for (const trialId of trials) {
    const runId = inPlace ? oldRunId : trialId;
    const destination = join(root, runId);
    if (!inPlace && (await exists(join(destination, 'manifest.json'))))
      continue; // done before a crash
    const source = join(directory, 'trials', trialId);
    const trialManifest = (await readJson(join(source, 'manifest.json'))) ?? {};
    const trialSummary = await readJson(join(source, 'summary.json'));
    const passed = (trialSummary?.scoring as { passed?: boolean } | undefined)
      ?.passed;
    const status = upgradeStatus(
      trialSummary?.status ?? trialManifest.status,
      passed,
    );
    const index =
      typeof trialManifest.trialIndex === 'number'
        ? trialManifest.trialIndex
        : trials.indexOf(trialId);
    const target = join(root, `${TEMPORARY}${runId}`);
    // A crash after moving the artifacts below: put them back before retrying.
    if (
      !(await exists(join(source, 'artifacts'))) &&
      (await exists(join(target, 'artifacts')))
    )
      await rename(join(target, 'artifacts'), join(source, 'artifacts'));
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await writeJsonFile(
      join(target, 'manifest.json'),
      upgradeManifest({
        run: runManifest,
        trial: trialManifest,
        runId,
        ...(!inPlace
          ? { batch: { id: oldRunId, index, size: trials.length } }
          : {}),
        status,
      }),
    );
    if (trialSummary)
      await writeJsonFile(join(target, 'summary.json'), {
        ...trialSummary,
        status,
      });
    const scoring = await readText(join(source, 'scoring.json'));
    if (scoring !== undefined)
      await writeFile(join(target, 'scoring.json'), scoring);
    const trajectory = await readText(join(source, 'trajectory.jsonl'));
    if (trajectory !== undefined)
      await writeFile(
        join(target, 'trajectory.jsonl'),
        upgradeTrajectory(trajectory),
      );
    await copyShared(directory, target, catalog, extras);
    // Moved, not copied (results can be large), and last, so a retry can undo it.
    if (await exists(join(source, 'artifacts')))
      await rename(join(source, 'artifacts'), join(target, 'artifacts'));
    if (inPlace) await replaceInPlace(root, oldRunId, target);
    else await rename(target, destination);
  }
  if (!inPlace) await rm(directory, { recursive: true, force: true });
}

async function copyShared(
  from: string,
  to: string,
  catalog: Record<string, unknown> | undefined,
  extras: readonly string[],
): Promise<void> {
  if (catalog)
    await writeJsonFile(join(to, 'catalog.json'), upgradeCatalog(catalog));
  for (const file of extras) await cp(join(from, file), join(to, file));
}

async function trialIds(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(join(directory, 'trials'), {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function presentFiles(
  directory: string,
  names: readonly string[],
): Promise<string[]> {
  const present: string[] = [];
  for (const name of names)
    if (await exists(join(directory, name))) present.push(name);
  return present;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

async function readJson(
  path: string,
): Promise<Record<string, unknown> | undefined> {
  const text = await readText(path);
  if (text === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
