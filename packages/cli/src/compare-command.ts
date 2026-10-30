import { repoKey } from '@evalkit/share';
import type { EvalRegistry, RunSource, ShareHeaders } from '@evalkit/core';
import type { ComparedRun } from './compare.js';
import {
  createDashboardReportReader,
  type LocalRun,
} from './dashboard-reports.js';
import { expectShareServer } from './share-command.js';

/** The runs at HEAD that `compare` uses: not running, not archived, clean unless allowed. */
export function headRuns(
  runs: readonly LocalRun[],
  head: RunSource,
  options: { allowDirty?: boolean },
): LocalRun[] {
  return runs.filter(
    (run) =>
      run.source !== undefined &&
      run.source.commit === head.commit &&
      repoKey(run.source) === repoKey(head) &&
      (!run.source.dirty || options.allowDirty) &&
      !run.archived &&
      run.status !== 'running',
  );
}

/** Base runs from a results directory, e.g. an artifact from the base pipeline. Dirty runs are never a base. */
export async function baseRunsFromDirectory(
  directory: string,
  registry: EvalRegistry,
): Promise<ComparedRun[]> {
  const runs = await createDashboardReportReader(
    directory,
    registry,
  ).listRuns();
  return runs.filter((run) => !run.source?.dirty && !run.archived);
}

type CommitRow = { commit: string; ref?: string };

/** A full SHA, a unique prefix of at least 7 characters, or a ref's latest shared commit. */
export function resolveSharedRef(
  commits: readonly CommitRow[],
  ref: string,
): string | undefined {
  if (/^[0-9a-f]{40}$/.test(ref))
    return commits.some((row) => row.commit === ref) ? ref : undefined;
  if (/^[0-9a-f]{7,39}$/.test(ref)) {
    const matches = commits.filter((row) => row.commit.startsWith(ref));
    if (matches.length === 1) return matches[0]!.commit;
  }
  // Commits are listed newest first.
  return commits.find((row) => row.ref === ref)?.commit;
}

async function getJson(url: URL, serverUrl: string, headers: ShareHeaders) {
  const response = await fetch(url, { headers, redirect: 'manual' });
  await expectShareServer(response, serverUrl);
  if (response.status === 404) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.ok)
    throw new Error(
      `Share server error ${response.status}: ${await response.text()}`,
    );
  return (await response.json()) as unknown;
}

/** Base runs shared for `ref` of this repository; `undefined` when the base was never shared. */
export async function baseRunsFromServer(options: {
  serverUrl: string;
  headers: ShareHeaders;
  head: RunSource;
  ref: string;
}): Promise<{ commit: string; ref?: string; runs: ComparedRun[] } | undefined> {
  const repo = repoKey(options.head);
  const api = (path: string) =>
    new URL(`/api/v1/repos/${repo}/-/${path}`, options.serverUrl);
  const listed = (await getJson(
    api('commits'),
    options.serverUrl,
    options.headers,
  )) as { commits?: CommitRow[] } | undefined;
  const commits = Array.isArray(listed?.commits) ? listed.commits : [];
  const commit = resolveSharedRef(commits, options.ref);
  if (!commit) return undefined;
  const data = (await getJson(
    api(`${commit}/data/runs.json`),
    options.serverUrl,
    options.headers,
  )) as { runs?: unknown } | undefined;
  const runs = (Array.isArray(data?.runs) ? data.runs : []).filter(
    isComparedRun,
  );
  const ref = commits.find((row) => row.commit === commit)?.ref;
  return {
    commit,
    ...(ref ? { ref } : {}),
    runs: runs.filter(
      (run) => !(run as { source?: { dirty?: boolean } }).source?.dirty,
    ),
  };
}

/** Shared runs are uploaded by other EvalKit versions; keep only what compare can read. */
function isComparedRun(value: unknown): value is ComparedRun {
  const run = value as Partial<ComparedRun> | null;
  return (
    typeof run === 'object' &&
    run !== null &&
    typeof run.id === 'string' &&
    typeof run.evalId === 'string' &&
    typeof run.status === 'string' &&
    typeof run.startedAt === 'string'
  );
}
