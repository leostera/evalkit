import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  EvalRegistry,
  RunSource,
  ShareConfig,
  ShareHeaders,
} from '@evalkit/core';
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
  /** Cancelled or interrupted: never shared, since it says nothing about the agent. */
  cancelled: number;
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
    cancelled: 0,
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
    else if (run.status === 'cancelled') result.cancelled += 1;
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
    selection.cancelled ? `${selection.cancelled} cancelled skipped` : '',
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

/** The server refused this bundle (4xx): retrying it cannot help. */
class UploadRejected extends Error {}

/**
 * The URL does not answer as an EvalKit share server (a redirect, an HTML page,
 * an auth proxy). Every upload would fail the same way, so sharing stops.
 */
export class ShareServerError extends Error {}

/** `share.headers` from the config: called once, checked, never printed. */
export async function resolveShareHeaders(
  headers: ShareConfig['headers'],
): Promise<ShareHeaders> {
  let value: unknown;
  try {
    value = typeof headers === 'function' ? await headers() : (headers ?? {});
  } catch (error) {
    throw new Error(
      `share.headers failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(
      'share.headers must be an object of header names to values',
    );
  const entries = Object.entries(value);
  for (const [name, item] of entries)
    if (typeof item !== 'string' || !item)
      throw new Error(`share.headers "${name}" must be a non-empty string`);
  return Object.fromEntries(entries) as ShareHeaders;
}

/** Check that the URL is an EvalKit share server and the headers get through. */
export async function checkShareServer(
  serverUrl: string,
  headers: ShareHeaders,
): Promise<void> {
  const response = await fetch(new URL('/api/v1/repos', serverUrl), {
    headers,
    redirect: 'manual',
  });
  await expectShareServer(response, serverUrl);
  await response.body?.cancel();
}

/** POST one bundle, retrying network errors and 5xx responses. */
export async function uploadBundle(
  serverUrl: string,
  bundle: Uint8Array,
  options: { attempts?: number; delayMs?: number; headers?: ShareHeaders } = {},
): Promise<UploadResult> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await postBundle(serverUrl, bundle, options.headers ?? {});
    } catch (error) {
      if (error instanceof UploadRejected || error instanceof ShareServerError)
        throw error;
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
  headers: ShareHeaders,
): Promise<UploadResult> {
  const response = await fetch(new URL('/api/v1/uploads', serverUrl), {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/octet-stream' },
    body: bundle as BodyInit,
    redirect: 'manual',
  });
  await expectShareServer(response, serverUrl);
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
  throw new ShareServerError(
    `Unexpected share server response: ${JSON.stringify(value)}`,
  );
}

/** Redirects and non-JSON answers come from something in front of the server. */
export async function expectShareServer(
  response: Response,
  serverUrl: string,
): Promise<void> {
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    const target = location ? new URL(location, serverUrl).host : 'elsewhere';
    throw new ShareServerError(
      `${new URL(serverUrl).host} redirected to ${target} instead of answering. ` +
        'If an auth proxy is in front of the share server, set share.headers in evalkit.config.ts.',
    );
  }
  const type = response.headers.get('content-type') ?? '';
  const denied = response.status === 401 || response.status === 403;
  // 5xx answers (often HTML from a proxy) are retried by the caller.
  if (denied || (response.ok && !type.includes('json')))
    throw new ShareServerError(
      `${new URL(serverUrl).host} did not answer as an EvalKit share server ` +
        `(${response.status}${type ? `, ${type.split(';')[0]}` : ''}). ` +
        (denied ? 'Check share.headers.' : 'Check share.url.'),
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
  headers: ShareHeaders;
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
          const uploaded = await uploadBundle(options.serverUrl, bundle, {
            headers: options.headers,
          });
          result.bytes += bundle.byteLength;
          result[uploaded.status] += 1;
        } catch (error) {
          if (error instanceof ShareServerError) throw error;
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
