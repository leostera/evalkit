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
import type { RunProcess } from '@evalkit/core';
import {
  UPGRADABLE_SCHEMA_VERSIONS,
  upgradeCatalog,
  upgradeManifest,
  upgradeStatus,
  upgradeTrajectory,
} from '@evalkit/core/upgrade';
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
 * left alone.
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
    if (options.dryRun) continue;
    await upgradeRun(root, entry, manifest, summary, trials);
  }
  if (!options.dryRun) await removeLeftovers(root);
  return report;
}

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
