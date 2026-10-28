const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRIAL_JSON =
  /^trials\/([^/]+)\/(detail|events|artifacts|workspace)\.json$/;
const TRIAL_FILE = /^trials\/([^/]+)\/workspace\/(.+)$/;

export const isUuid = (value: string) => UUID.test(value);
export const isSha = (value: string) => /^[0-9a-f]{40}$/.test(value);

/** One path segment that cannot escape or alias another location. */
export function safeSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment.length <= 255 &&
    segment !== '.' &&
    segment !== '..' &&
    !/[\\/\0]/.test(segment)
  );
}

/**
 * The only files a run bundle may contain (the snapshot format from
 * `evalkit build`, for one run). Never evaluator workspaces.
 */
export function allowedRunPath(path: string): boolean {
  if (path === 'run.json' || path === 'catalog.json' || path === 'trials.json')
    return true;
  const json = TRIAL_JSON.exec(path);
  if (json) return isUuid(json[1]!);
  const file = TRIAL_FILE.exec(path);
  return Boolean(
    file && isUuid(file[1]!) && file[2]!.split('/').every(safeSegment),
  );
}

/**
 * Repository key: normalized host/path, plus `/~<project>` for an eval
 * project below the repository root. Used in storage keys and URLs.
 */
export function repoKey(source: { repo: string; project: string }): string {
  return source.project ? `${source.repo}/~${source.project}` : source.repo;
}

export function validRepoKey(key: string): boolean {
  const segments = key.split('/');
  return (
    segments.length >= 2 &&
    !segments.includes('-') &&
    segments.every(safeSegment)
  );
}
