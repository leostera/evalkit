import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type {
  RunTranscriptView,
  AttachmentEntry,
  Batch,
  CheckpointResult,
  MetricResult,
  JsonObject,
  RunSource,
  RunStatus,
} from '@evalkit/core';
import { REPORT_SCHEMA_VERSION } from '@evalkit/core';
import {
  ownerIsGone,
  readRunEvents,
  readRunSubagents,
  readRunTranscript,
  readRunManifest,
  readRunSummary,
} from '@evalkit/runner';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One run as the dashboard lists it: one execution of one configuration. */
export type LocalRun = {
  id: string;
  evalId: string;
  suiteId?: string;
  agent?: string;
  matrixId?: string;
  cellKey?: string;
  parameters?: JsonObject;
  status: RunStatus;
  /** Cancelled because its process stopped without finishing it (e.g. a second Ctrl+C). */
  interrupted?: true;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  /** Set when the run is one of several repeats launched together. */
  batch?: Batch;
  score?: number;
  /** Set by `evalkit tidy` when the run's eval is no longer in the project. */
  archived?: boolean;
  /** Repository and commit the run's eval code came from. */
  source?: RunSource;
  /** Each final scorer's value; skipped and errored ones have none. */
  scorers?: RunScorer[];
  /** Content digests of the datasets the run used. */
  datasets?: RunDatasetDigest[];
  /** Each metric's value; one the run did not measure has none. */
  metrics?: RunMetric[];
};

export type RunScorer = {
  name: string;
  kind: 'predicate' | 'judge';
  value?: number;
  passed?: boolean;
  skipped?: true;
  /** The scorer failed to run. */
  errored?: true;
  /** A `choices` judge's answer. */
  choice?: string;
  /** The first line of its explanation, for lists of verdicts. */
  explanation?: string;
  /** The model a judge reported using. */
  model?: string;
};

export type RunDatasetDigest = { id: string; digest: string };

/** One metric of one run. */
export type RunMetric = {
  name: string;
  unit?: string;
  better?: 'lower' | 'higher';
  builtIn?: true;
  /** Absent when the run did not measure it ("not measured", never zero). */
  value?: number;
};

// ANSI escape sequences (colours, cursor moves) and other control characters.
/* oxlint-disable no-control-regex */
const ANSI =
  /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
/* oxlint-enable no-control-regex */

/**
 * The first non-empty line of a message, without terminal colours, cut to
 * `max` characters: a scorer may explain itself with 300 lines of stderr,
 * and a summary line must stay one line. The run page has the rest.
 */
export function firstLine(text: string | undefined, max = 100): string {
  const lines = (text ?? '')
    .replace(ANSI, '')
    .split(/\r?\n/)
    .map((line) => line.replace(CONTROL, '').trim())
    .filter(Boolean);
  const line = lines[0] ?? '';
  const more = lines.length > 1 ? ' …' : '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : `${line}${more}`;
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
/** What a run's page shows beyond its listing: every score and check. */
export type LocalRunDetail = {
  scores: LocalScore[];
  metrics?: MetricResult[];
  checkpoints: CheckpointResult[];
  skippedScorers?: string[];
  attachments?: AttachmentEntry[];
  /** The saved manifest and summary, for the raw view. */
  manifest: unknown;
  summary: unknown;
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

function runPath(root: string, runId: string): string {
  assertUuid(runId, 'run ID');
  return resolve(root, runId);
}

/**
 * Headers for files an agent, a dataset or an adapter produced: untrusted
 * content on the dashboard's origin, so never rendered or sniffed as HTML.
 */
export const UNTRUSTED_FILE: Record<string, string> = {
  'content-type': 'application/octet-stream',
  'x-content-type-options': 'nosniff',
  'content-security-policy': 'sandbox',
};

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
 * Read saved local reports. A missing summary means "running"; malformed
 * reports are errors. Runs from an older report format (before schema
 * version 6) are skipped and counted, for `evalkit upgrade` to convert.
 */
export function createDashboardReportReader(root: string) {
  const legacyRuns = new Set<string>();

  async function listRuns(): Promise<LocalRun[]> {
    const entries = await ifPresent(() =>
      readdir(root, { withFileTypes: true }),
    );
    if (!entries) return [];
    const ids = entries
      .filter((entry) => entry.isDirectory() && UUID_PATTERN.test(entry.name))
      .map((entry) => entry.name);
    legacyRuns.clear();
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
    return typeof version === 'number' && version < REPORT_SCHEMA_VERSION;
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
    const archived = await ifPresent(() =>
      stat(resolve(root, id, ARCHIVE_MARKER)),
    );
    const interrupted = !summary && ownerIsGone(manifest.process);
    const scoring = summary?.scoring;
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
      status: summary ? summary.status : interrupted ? 'cancelled' : 'running',
      ...(manifest.limits ? { limits: manifest.limits } : {}),
      ...(summary?.limit ? { limit: summary.limit } : {}),
      ...(interrupted ? { interrupted: true as const } : {}),
      startedAt: manifest.startedAt,
      ...(summary?.endedAt ? { completedAt: summary.endedAt } : {}),
      ...(summary?.durationMs !== undefined
        ? { durationMs: summary.durationMs }
        : {}),
      ...(manifest.batch ? { batch: manifest.batch } : {}),
      ...(scoring?.overall === undefined ? {} : { score: scoring.overall }),
      ...(scoring?.results.length
        ? {
            scorers: scoring.results.map((result) => ({
              name: result.name,
              kind: result.kind,
              ...(result.skipped ? { skipped: true as const } : {}),
              ...(result.value === undefined || result.skipped
                ? {}
                : { value: result.value }),
              ...(result.passed === undefined || result.skipped
                ? {}
                : { passed: result.passed }),
              ...(result.error ? { errored: true as const } : {}),
              ...(result.choice ? { choice: result.choice } : {}),
              ...(result.explanation
                ? { explanation: firstLine(result.explanation, 200) }
                : {}),
              ...(result.judge?.model ? { model: result.judge.model } : {}),
            })),
          }
        : {}),
      ...(scoring?.metrics?.length
        ? {
            metrics: scoring.metrics.map((metric) => ({
              name: metric.name,
              ...(metric.unit ? { unit: metric.unit } : {}),
              ...(metric.better ? { better: metric.better } : {}),
              ...(metric.builtIn ? { builtIn: true as const } : {}),
              ...(metric.value === undefined ? {} : { value: metric.value }),
            })),
          }
        : {}),
      ...(manifest.datasets?.length
        ? {
            datasets: manifest.datasets.map(({ id, digest }) => ({
              id,
              digest,
            })),
          }
        : {}),
    };
  }

  async function runDetail(runId: string): Promise<LocalRunDetail> {
    runPath(root, runId);
    const manifest = await readRunManifest(root, runId);
    const summary = await ifPresent(() => readRunSummary(root, runId));
    const scoring = summary?.scoring;
    return {
      scores: scoring?.results ?? [],
      ...(scoring?.metrics ? { metrics: scoring.metrics } : {}),
      checkpoints: scoring?.checkpoints ?? [],
      ...(scoring?.skippedScorers
        ? { skippedScorers: scoring.skippedScorers }
        : {}),
      ...(summary?.attachments?.length
        ? { attachments: summary.attachments }
        : {}),
      manifest,
      summary: summary ?? { status: 'running' },
    };
  }

  async function listArtifacts(runId: string): Promise<ArtifactPath[]> {
    return walkArtifacts(resolve(runPath(root, runId), 'artifacts'));
  }

  async function listCandidateWorkspace(
    runId: string,
  ): Promise<ArtifactPath[]> {
    return walkArtifacts(
      resolve(runPath(root, runId), 'artifacts', 'candidate'),
    );
  }

  /** A file below one of a run's artifact trees; never outside it. */
  async function artifactFile(
    runId: string,
    tree: 'candidate' | 'attachments',
    relativePath: string,
  ): Promise<Response> {
    const treeRoot = resolve(runPath(root, runId), 'artifacts', tree);
    const file = resolve(treeRoot, relativePath);
    if (file === treeRoot || !file.startsWith(`${treeRoot}${sep}`))
      throw new Error(
        `Invalid ${tree === 'candidate' ? 'workspace' : 'attachment'} path`,
      );
    const info = await lstat(file);
    if (!info.isFile())
      throw new Error(
        `${tree === 'candidate' ? 'Workspace path' : 'Attachment'} is not a file`,
      );
    return new Response(await readFile(file), { headers: UNTRUSTED_FILE });
  }

  const candidateFile = (runId: string, path: string) =>
    artifactFile(runId, 'candidate', path);
  const attachmentFile = (runId: string, name: string) =>
    artifactFile(runId, 'attachments', name);

  /** The agent's transcript and EvalKit's events, as far as a running run has got. */
  async function transcript(runId: string): Promise<RunTranscriptView> {
    runPath(root, runId);
    const [recorded, subagents, runEvents] = await Promise.all([
      ifPresent(() => readRunTranscript(root, runId)),
      readRunSubagents(root, runId),
      ifPresent(() => readRunEvents(root, runId)),
    ]);
    return {
      transcript: recorded ?? null,
      subagents,
      runEvents: runEvents ?? [],
    };
  }

  return {
    listRuns,
    /** Run IDs skipped by the last `listRuns()`: an older EvalKit wrote them; `evalkit upgrade` converts them. */
    legacyRunIds: () => [...legacyRuns],
    runDetail,
    listArtifacts,
    listCandidateWorkspace,
    candidateFile,
    attachmentFile,
    transcript,
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
