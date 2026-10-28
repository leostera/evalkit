import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EvalRegistry, RunSource } from '@evalkit/core';
import { encodeBundle, repoKey, type BundleFile } from '@evalkit/share';
import { snapshotRun, type BuildStep } from './dashboard-build.js';
import {
  createDashboardReportReader,
  type LocalRun,
} from './dashboard-reports.js';
import { runCatalog, shortSource } from './source.js';
import { plural } from './terminal.js';

export type ShareSelection = {
  selected: (LocalRun & { source: RunSource })[];
  untracked: number;
  otherCommits: number;
  dirty: number;
  archived: number;
  /** Still running: a shared run is immutable, so it must be finished. */
  running: number;
};

/**
 * Which local runs `evalkit share` uploads: finished runs with a source, at
 * HEAD (or any commit with `all`), not dirty (unless `allowDirty`), not archived.
 */
export function selectRuns(
  runs: readonly LocalRun[],
  head: RunSource,
  options: { all?: boolean; allowDirty?: boolean },
): ShareSelection {
  const result: ShareSelection = {
    selected: [],
    untracked: 0,
    otherCommits: 0,
    dirty: 0,
    archived: 0,
    running: 0,
  };
  for (const run of runs) {
    const { source } = run;
    if (!source) result.untracked += 1;
    else if (
      !options.all &&
      (source.commit !== head.commit || repoKey(source) !== repoKey(head))
    )
      result.otherCommits += 1;
    else if (source.dirty && !options.allowDirty) result.dirty += 1;
    else if (run.archived) result.archived += 1;
    else if (run.status === 'running') result.running += 1;
    else result.selected.push({ ...run, source });
  }
  return result;
}

/** One line for the Runs step: what will be shared and what was skipped. */
export function selectionSummary(
  selection: ShareSelection,
  options: { all?: boolean },
): string {
  return [
    `${plural(selection.selected.length, 'run')} to share`,
    selection.otherCommits && !options.all
      ? `${selection.otherCommits} from other commits`
      : '',
    selection.running ? `${selection.running} still running skipped` : '',
    selection.dirty ? `${selection.dirty} dirty skipped` : '',
    selection.untracked ? `${selection.untracked} untracked skipped` : '',
    selection.archived ? `${selection.archived} archived skipped` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Why nothing was selected, and what to do about it. */
export function noRunsMessage(
  selection: ShareSelection,
  head: RunSource,
  options: { all?: boolean },
): string {
  const at = shortSource(head);
  if (selection.dirty)
    return `No committed runs for ${at}: ${plural(selection.dirty, 'run')} came from uncommitted changes. Commit and rerun \`evalkit run\`, or pass --allow-dirty.`;
  if (selection.running)
    return `No finished runs for ${at}: ${plural(selection.running, 'run')} still running. Share again when they finish.`;
  return `No runs for ${at}. Run \`evalkit run\` first${options.all ? '' : ', or pass --all to share runs from other commits'}.`;
}

/** Where to look after sharing: the commit, or the repository if several commits were shared. */
export function shareTarget(
  serverUrl: string,
  head: RunSource,
  runs: readonly { source: RunSource }[],
): string {
  const commits = new Set(runs.map((run) => run.source.commit));
  const commit = commits.size === 1 ? `/-/${[...commits][0]}` : '';
  return new URL(`/${repoKey(head)}${commit}`, serverUrl).href;
}

/** Build one run's upload bundle: run.json, catalog.json, and its snapshot. */
export async function runBundle(options: {
  reports: ReturnType<typeof createDashboardReportReader>;
  reportRoot: string;
  registry: EvalRegistry;
  run: LocalRun;
  workspaceFiles: boolean;
}): Promise<Uint8Array> {
  const files: BundleFile[] = [];
  const encode = (value: unknown) =>
    new TextEncoder().encode(`${JSON.stringify(value)}\n`);
  files.push({ path: 'run.json', data: encode(options.run) });
  // Runs from schema version 4 save the catalog they ran with.
  const saved = await readFile(
    resolve(options.reportRoot, options.run.id, 'catalog.json'),
  ).catch(() => undefined);
  files.push({
    path: 'catalog.json',
    data: saved ? new Uint8Array(saved) : encode(runCatalog(options.registry)),
  });
  await snapshotRun(
    options.reports,
    options.run.id,
    {
      async json(path, value) {
        files.push({ path, data: encode(value) });
      },
      async bytes(path, data) {
        files.push({ path, data });
      },
    },
    { workspaceFiles: options.workspaceFiles },
  );
  return encodeBundle(files);
}

export type UploadResult = { status: 'created' | 'exists'; url: string };

/** The server refused the bundle (4xx): retrying the same bundle cannot help. */
class UploadRejected extends Error {}

/** POST one bundle, retrying network errors and 5xx responses. */
export async function uploadBundle(
  serverUrl: string,
  bundle: Uint8Array,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<UploadResult> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await postBundle(serverUrl, bundle);
    } catch (error) {
      if (error instanceof UploadRejected) throw error;
      lastError = error;
    }
    if (attempt < attempts)
      await Bun.sleep((options.delayMs ?? 500) * 2 ** (attempt - 1));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Upload failed: ${String(lastError)}`);
}

async function postBundle(
  serverUrl: string,
  bundle: Uint8Array,
): Promise<UploadResult> {
  const response = await fetch(new URL('/api/v1/uploads', serverUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: bundle as BodyInit,
  });
  if (response.ok) return parseUploadResult(await response.json());
  const reason = await response.text();
  if (response.status < 500)
    throw new UploadRejected(`Share server rejected the upload: ${reason}`);
  throw new Error(`Share server error ${response.status}: ${reason}`);
}

function parseUploadResult(value: unknown): UploadResult {
  const result = value as Partial<UploadResult> | null;
  if (
    (result?.status === 'created' || result?.status === 'exists') &&
    typeof result.url === 'string'
  )
    return { status: result.status, url: result.url };
  throw new UploadRejected(
    `Unexpected share server response: ${JSON.stringify(value)}`,
  );
}

export type ShareResult = {
  created: number;
  exists: number;
  failed: { runId: string; error: string }[];
  bytes: number;
};

export async function shareRuns(options: {
  serverUrl: string;
  reportRoot: string;
  registry: EvalRegistry;
  runs: readonly LocalRun[];
  workspaceFiles: boolean;
  step: BuildStep;
}): Promise<ShareResult> {
  const reports = createDashboardReportReader(
    options.reportRoot,
    options.registry,
  );
  return options.step(
    'Uploading',
    async (progress) => {
      const result: ShareResult = {
        created: 0,
        exists: 0,
        failed: [],
        bytes: 0,
      };
      for (const [index, run] of options.runs.entries()) {
        progress(
          `run ${index + 1}/${options.runs.length} · ${formatBytes(result.bytes)}`,
        );
        try {
          const bundle = await runBundle({
            reports,
            reportRoot: options.reportRoot,
            registry: options.registry,
            run,
            workspaceFiles: options.workspaceFiles,
          });
          const uploaded = await uploadBundle(options.serverUrl, bundle);
          result.bytes += bundle.byteLength;
          result[uploaded.status] += 1;
        } catch (error) {
          result.failed.push({
            runId: run.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return result;
    },
    (result) =>
      `${result.created} new · ${result.exists} already shared` +
      (result.failed.length ? ` · ${result.failed.length} failed` : '') +
      ` · ${formatBytes(result.bytes)}`,
  );
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} kB`;
  return `${(size / 1024 ** 2).toFixed(1)} MB`;
}
